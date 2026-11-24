/**
 * READ-ONLY report on the subscribe pop-up, from the `subscribeEvents` collection.
 *
 * Writes nothing. One row per prompt (the `reason` the pop-up opened with), plus an overall line:
 *
 *   Opened     — showings of the pop-up.
 *   Plan tap   — showings where a different plan was tapped (interest in the options).
 *   Checkout   — showings where Subscribe / Log in to subscribe was pressed.
 *   Paid       — completed payments the Stripe webhook tied back to that prompt.
 *   Conv       — Paid ÷ Opened.
 *   Dismissed  — split by how: continue (the "free" button), close (✕), backdrop, escape.
 *
 * Each showing has one `viewId`, so a pop-up that was opened, had two plans tapped and was
 * paid for counts once in each column. Payments made outside the pop-up (no viewId) show
 * on their own line.
 *
 * Needs Admin credentials (the same `gcloud auth application-default login`
 * the other admin scripts use).
 *
 *   node scripts/subscribe-report.mjs [--since YYYY-MM-DD] [--json]
 */

import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const since = args.includes("--since") ? Date.parse(args[args.indexOf("--since") + 1]) : 0;

// Admin SDK on purpose: `subscribeEvents` is create-only to clients (see firestore.rules).
if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId: "fantasy-paintball" });
}
const db = getFirestore();

const rows = (await db.collection("subscribeEvents").get()).docs
  .map((d) => d.data())
  .filter((r) => (r.createdAt ?? 0) >= since);
if (!rows.length) {
  console.log("No subscribe events recorded yet.");
  process.exit(0);
}

const blank = () => ({
  opened: new Set(),
  planTap: new Set(),
  checkout: new Set(),
  loginRedirect: new Set(),
  paid: 0,
  dismissed: { continue: 0, close: 0, backdrop: 0, escape: 0 },
});

const byReason = new Map();
const all = blank();
let paidOutside = 0;

// Paid rows only carry the reason the checkout was started with; everything else is per showing.
for (const r of rows) {
  if (r.step === "paid" && !r.viewId) {
    paidOutside += 1;
    continue;
  }
  const key = r.reason ?? "unknown";
  if (!byReason.has(key)) byReason.set(key, blank());
  for (const b of [byReason.get(key), all]) {
    if (r.step === "opened") b.opened.add(r.viewId);
    if (r.step === "plan_selected") b.planTap.add(r.viewId);
    if (r.step === "checkout_started") b.checkout.add(r.viewId);
    if (r.step === "login_redirect") b.loginRedirect.add(r.viewId);
    if (r.step === "paid") b.paid += 1;
    if (r.step === "dismissed" && r.how in b.dismissed) b.dismissed[r.how] += 1;
  }
}

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : "–");
const line = (name, b) => ({
  prompt: name,
  opened: b.opened.size,
  planTap: b.planTap.size,
  checkout: b.checkout.size,
  loginRedirect: b.loginRedirect.size,
  paid: b.paid,
  conv: pct(b.paid, b.opened.size),
  dismissed: b.dismissed,
});

const report = [...byReason.entries()]
  .sort((a, b) => b[1].opened.size - a[1].opened.size)
  .map(([k, b]) => line(k, b));
report.push(line("ALL", all));

if (asJson) {
  console.log(JSON.stringify({ since: since || null, rows: report, paidOutsidePopup: paidOutside }, null, 2));
  process.exit(0);
}

const cols = ["prompt", "opened", "planTap", "checkout", "loginRedirect", "paid", "conv"];
const widths = cols.map((c) => Math.max(c.length, ...report.map((r) => String(r[c]).length)));
const fmt = (vals) => vals.map((v, i) => String(v).padEnd(widths[i])).join("  ");
console.log(fmt(cols));
for (const r of report) {
  console.log(fmt(cols.map((c) => r[c])));
  const d = r.dismissed;
  console.log(`  dismissed: free ${d.continue} · ✕ ${d.close} · backdrop ${d.backdrop} · esc ${d.escape}`);
}
if (paidOutside) console.log(`\nPaid outside the pop-up (no prompt recorded): ${paidOutside}`);
