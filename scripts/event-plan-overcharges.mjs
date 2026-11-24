/**
 * Event plan customers charged in months without an event. READ ONLY: never writes to Stripe
 * or Firestore.
 *
 *   STRIPE_SECRET_KEY=rk_live_… node scripts/event-plan-overcharges.mjs          # table for James
 *   STRIPE_SECRET_KEY=rk_live_… node scripts/event-plan-overcharges.mjs --json   # every invoice, as JSON
 *
 * A restricted key with READ on Subscriptions, Invoices, Prices and Products is enough.
 * Firestore (user id + first name and last initial) uses `gcloud auth application-default login`
 * like the other admin scripts; without it the table falls back to Stripe's customer name.
 * No emails are printed.
 *
 * WHY (5 Nov 2026): the Event plan promises "Pay only in event months". The subscription-manager
 * cron that pauses billing outside them never ran (CRON_SECRET unset in Vercel → 401), so every
 * Event plan subscription was charged every month. Each charge is put in one of:
 *   event      renewal or sign-up in an event month                 → correct
 *   quiet      renewal (subscription_cycle) in a non-event month    → OVERCHARGE, should have been voided
 *   signup     the first payment, made in a non-event month         → listed apart: James decides
 * Months are UTC, like Stripe's timestamps and the cron. Credit notes already issued on an
 * invoice are taken off. Refunds made straight on a charge (not via a credit note) need the
 * Charges permission to see, so ask James whether he has refunded anyone by hand.
 */

import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";

// Same list as src/utils/eventMonths.ts (0-indexed): Mar, Apr, Jun, Sep, Nov.
const EVENT_MONTHS = [2, 3, 5, 8, 10];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const AS_JSON = process.argv.includes("--json");
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("Set STRIPE_SECRET_KEY (a read-only restricted live key is enough).");
  process.exit(1);
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-02-25.clover" });
const LIVE_MODE = process.env.STRIPE_SECRET_KEY.includes("_live_");

const isTestAccount = (email) => /dotsquares|yopmail|mailinator|example\.com|test/i.test(String(email ?? ""));
const shortName = (first, last) => `${first ?? ""} ${String(last ?? "").slice(0, 1)}`.trim() || null;
const fromFullName = (full) => (full ? shortName(...String(full).trim().split(/\s+/).filter((_, i, a) => i === 0 || i === a.length - 1)) : null);
const money = (cents, cur) => `${(cents / 100).toFixed(2)} ${cur.toUpperCase()}`;

// ── Event plan products: checkout's env price ids when set, else the product name ───────────────
const envPriceIds = ["", "_USD", "_GBP", "_EUR"].map((c) => process.env[`STRIPE_PRICE_QUARTERLY${c}`]).filter(Boolean);
const productNames = new Map();
async function productName(id) {
  if (!productNames.has(id)) productNames.set(id, (await stripe.products.retrieve(id)).name);
  return productNames.get(id);
}
async function isEventPlan(sub) {
  const price = sub.items?.data?.[0]?.price;
  if (!price) return false;
  if (envPriceIds.includes(price.id)) return true;
  return /event|quarter/i.test(`${await productName(price.product)} ${price.nickname ?? ""}`);
}

const eventSubs = [];
for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100 })) {
  if (await isEventPlan(sub)) eventSubs.push(sub);
}

// ── who is who (Firestore), optional ─────────────────────────────────────────────────────────
const bySub = new Map();
const byCustomer = new Map();
let firestoreNote = null;
try {
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: "fantasy-paintball" });
  for (const d of (await getFirestore().collection("users").get()).docs) {
    const u = d.data();
    const who = { uid: d.id, name: shortName(u.firstName, u.lastName), test: isTestAccount(u.email) };
    if (u.stripeSubscriptionId) bySub.set(u.stripeSubscriptionId, who);
    if (u.stripeCustomerId) byCustomer.set(u.stripeCustomerId, who);
  }
} catch (err) {
  firestoreNote = `Firestore not read (${err.code ?? err.message}); names come from Stripe, user ids missing.`;
}

// ── every invoice on every Event plan subscription ──────────────────────────────────────────────
const people = [];
for (const sub of eventSubs) {
  const who = bySub.get(sub.id) ?? byCustomer.get(sub.customer) ?? { uid: null, name: null, test: false };
  const invoices = [];
  for await (const inv of stripe.invoices.list({ subscription: sub.id, limit: 100 })) invoices.push(inv);
  invoices.sort((a, b) => a.created - b.created);

  const charges = [];
  let voided = 0, openQuiet = 0;
  for (const inv of invoices) {
    const when = new Date(inv.created * 1000);
    const eventMonth = EVENT_MONTHS.includes(when.getUTCMonth());
    if (inv.status === "void") { voided += 1; continue; }
    if (inv.status === "open" && !eventMonth) openQuiet += 1;
    if (inv.status !== "paid" || !(inv.amount_paid > 0)) continue;
    const kind = eventMonth ? "event" : inv.billing_reason === "subscription_create" ? "signup" : "quiet";
    charges.push({
      invoice: inv.id,
      date: when.toISOString().slice(0, 10),
      month: `${MONTH[when.getUTCMonth()]} ${when.getUTCFullYear()}`,
      kind,
      reason: inv.billing_reason,
      paid: inv.amount_paid,
      credited: inv.post_payment_credit_notes_amount ?? 0,
      currency: inv.currency,
    });
  }
  if (!who.name) who.name = fromFullName(invoices.find((i) => i.customer_name)?.customer_name);
  const sum = (kind, field) => charges.filter((c) => c.kind === kind).reduce((n, c) => n + c[field], 0);
  people.push({
    ...who,
    subId: sub.id,
    status: sub.status,
    paused: !!sub.pause_collection,
    currency: charges[0]?.currency ?? sub.currency,
    charges,
    voided,
    openQuiet,
    quietCount: charges.filter((c) => c.kind === "quiet").length,
    quietPaid: sum("quiet", "paid"),
    quietCredited: sum("quiet", "credited"),
    signupQuiet: charges.find((c) => c.kind === "signup") ?? null,
  });
}
people.sort((a, b) => b.quietPaid - b.quietCredited - (a.quietPaid - a.quietCredited));

// ── report ───────────────────────────────────────────────────────────────────────────────────
if (AS_JSON) {
  console.log(JSON.stringify({ liveMode: LIVE_MODE, eventMonths: EVENT_MONTHS.map((m) => MONTH[m]), firestoreNote, people }, null, 2));
  process.exit(0);
}

console.log(`Stripe (${LIVE_MODE ? "live" : "TEST"} mode). Event plan subscriptions: ${eventSubs.length}`);
console.log(`Products counted as Event plan: ${[...new Set(eventSubs.map((s) => productNames.get(s.items.data[0].price.product) ?? s.items.data[0].price.id))].join(", ")}`);
console.log(`Event months: ${EVENT_MONTHS.map((m) => MONTH[m]).join(", ")} (UTC)`);
if (firestoreNote) console.log(firestoreNote);

for (const p of people) {
  console.log(`\n${p.test ? "[test] " : ""}${p.uid ?? "(no user doc)"}  ${p.name ?? "?"}  ${p.subId}  ${p.status}${p.paused ? " (paused)" : ""}`);
  console.log(`  charged ${p.charges.length}× · voided ${p.voided}×${p.openQuiet ? ` · ${p.openQuiet} unpaid quiet-month invoice(s) still open` : ""}`);
  for (const c of p.charges) {
    const tag = c.kind === "quiet" ? "  ← OVERCHARGE (no event)" : c.kind === "signup" ? "  ← sign-up in a month with no event" : "";
    console.log(`    ${c.date}  ${c.month.padEnd(8)}  ${money(c.paid, c.currency).padStart(10)}${c.credited ? `  (credited ${money(c.credited, c.currency)})` : ""}${tag}`);
  }
}

console.log("\nSUMMARY (renewals in months with no event, minus credit notes already issued)");
console.log("  user id                        name          plan status   quiet charges  overcharge   + sign-up in quiet month");
const totals = {};
for (const p of people) {
  const net = p.quietPaid - p.quietCredited;
  if (!p.test) totals[p.currency] = (totals[p.currency] ?? 0) + net;
  const signup = p.signupQuiet ? `${p.signupQuiet.month} ${money(p.signupQuiet.paid, p.currency)}` : "-";
  console.log(`  ${(p.test ? "[test] " : "") + (p.uid ?? "(no user doc)")}`.padEnd(33)
    + `${(p.name ?? "?").padEnd(14)}${p.status.padEnd(14)}${String(p.quietCount).padStart(6)}       ${money(net, p.currency).padStart(10)}   ${signup}`);
}
console.log(`\nTotal overcharged (real accounts): ${Object.entries(totals).map(([cur, c]) => money(c, cur)).join(" + ") || "0"}`);
console.log("Nothing was changed in Stripe or Firestore.");
