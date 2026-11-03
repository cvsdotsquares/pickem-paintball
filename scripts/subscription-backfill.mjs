/**
 * Line up users/{uid} subscription fields with Stripe.
 *
 *   STRIPE_SECRET_KEY=rk_live_… node scripts/subscription-backfill.mjs            # dry run, writes nothing
 *   STRIPE_SECRET_KEY=rk_live_… node scripts/subscription-backfill.mjs --apply    # write the fixes
 *   … --apply --include-missing   # also revoke subscriptions this Stripe account has never heard of
 *   … --json                      # the whole plan as JSON
 *
 * A restricted key with READ access to Subscriptions, Prices, Products and Webhook
 * Endpoints is enough; the script never writes to Stripe. Firestore uses the same
 * `gcloud auth application-default login` as the other admin scripts.
 *
 * WHY (2 Nov 2026): Firestore said 54 subscribers, Stripe 33. The webhook only ever wrote
 * the checkout. Nothing later (renewal, cancel, card failing, end of period) changed the
 * doc, so everyone who cancelled kept premium. Every doc also had a 1970 period end
 * (Stripe moved current_period_end onto the item) and the tier "monthly" whatever they paid.
 *
 * WHAT IT DOES, per user marked subscribed or carrying a stripeSubscriptionId:
 *   ok        live in Stripe, fields already right                          → nothing
 *   refresh   live in Stripe, but period end / tier / cancel flag stale     → rewrite fields
 *   ended     canceled / unpaid / incomplete_expired in Stripe              → revoke premium
 *   missing   Stripe has no such subscription (e.g. a test-mode one)        → listed; revoked only with --include-missing
 *   manual    isSubscribed true with no Stripe subscription (comp/admin)    → listed, never touched
 * Dev/test accounts (dotsquares, yopmail, "test" addresses) are tagged [test] and counted
 * on their own line, so the real-account total can be compared with Stripe.
 * Plus the other direction: live Stripe subscriptions that no user doc points at.
 *
 * The rules match src/lib/stripeSubscriptionSync.ts (premium while active, trialing or
 * past_due). Keep the two in step. Before --apply writes, the touched docs' old fields are
 * saved to scripts/backups/ (git-ignored). No emails are printed or saved, only user ids.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const INCLUDE_MISSING = args.includes("--include-missing");
const AS_JSON = args.includes("--json");

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("Set STRIPE_SECRET_KEY (a read-only restricted live key is enough).");
  process.exit(1);
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-02-25.clover" });
const LIVE_MODE = process.env.STRIPE_SECRET_KEY.includes("_live_");

if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: "fantasy-paintball" });
const db = getFirestore();

// ── same rules as src/lib/stripeSubscriptionSync.ts ───────────────────────────
const LIVE = new Set(["active", "trialing", "past_due"]);
const hasAccess = (status) => LIVE.has(status);

const productNames = new Map(); // product id → name, filled below (list calls can't expand that deep)

function planFromPrice(price) {
  if (!price) return "monthly";
  const product = typeof price.product === "object" && price.product ? price.product.name ?? "" : productNames.get(price.product) ?? "";
  const label = `${product} ${price.nickname ?? ""}`.toLowerCase();
  if (price.recurring?.interval === "year") return "yearly";
  if (/event|quarter/.test(label) || (price.recurring?.interval === "month" && price.recurring.interval_count === 3)) {
    return "quarterly";
  }
  return "monthly";
}

function fieldsFor(sub) {
  const live = hasAccess(sub.status);
  const end = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end ?? null;
  return {
    isSubscribed: live,
    subscriptionStatus: sub.status,
    subscriptionTier: live ? planFromPrice(sub.items?.data?.[0]?.price) : null,
    subscriptionCurrentPeriodEnd: end ? new Date(end * 1000).toISOString() : null,
    subscriptionCancelAtPeriodEnd: !!sub.cancel_at_period_end,
  };
}

const REVOKED_MISSING = {
  isSubscribed: false,
  subscriptionStatus: "canceled",
  subscriptionTier: null,
  subscriptionCancelAtPeriodEnd: false,
};

// Dev/test accounts (agency, throwaway or "test" addresses). Their email is only tested here, never printed.
const isTestAccount = (email) => /dotsquares|yopmail|mailinator|example\.com|test/i.test(String(email ?? ""));

const KEYS = ["isSubscribed", "subscriptionStatus", "subscriptionTier", "subscriptionCurrentPeriodEnd", "subscriptionCancelAtPeriodEnd"];
const changedKeys = (before, after) => KEYS.filter((k) => k in after && (before[k] ?? null) !== (after[k] ?? null));

// ── Stripe side ───────────────────────────────────────────────────────────────
const endpoints = [];
try {
  for await (const ep of stripe.webhookEndpoints.list({ limit: 100 })) {
    endpoints.push({ url: ep.url, status: ep.status, events: ep.enabled_events });
  }
} catch (err) {
  endpoints.push({ error: `could not list webhook endpoints (${err.code ?? err.message})` });
}

const stripeSubs = new Map();
for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100 })) {
  stripeSubs.set(sub.id, sub);
}
for (const sub of stripeSubs.values()) {
  const product = sub.items?.data?.[0]?.price?.product;
  if (typeof product === "string" && !productNames.has(product)) {
    productNames.set(product, (await stripe.products.retrieve(product)).name);
  }
}
const stripeLive = [...stripeSubs.values()].filter((s) => hasAccess(s.status));

// ── Firestore side ────────────────────────────────────────────────────────────
const users = (await db.collection("users").get()).docs;
const rows = [];
const linkedSubIds = new Set();
const customerToUid = new Map();

for (const d of users) {
  const u = d.data();
  if (u.stripeCustomerId) customerToUid.set(u.stripeCustomerId, d.id);
  if (u.stripeSubscriptionId) linkedSubIds.add(u.stripeSubscriptionId);
  if (u.isSubscribed !== true && !u.stripeSubscriptionId) continue;

  const before = Object.fromEntries(KEYS.map((k) => [k, u[k] ?? null]));
  const base = { uid: d.id, subId: u.stripeSubscriptionId || null, test: isTestAccount(u.email), before };

  if (!u.stripeSubscriptionId) {
    rows.push({ ...base, category: "manual", note: "isSubscribed with no Stripe subscription" });
    continue;
  }

  let sub = stripeSubs.get(u.stripeSubscriptionId);
  if (!sub) {
    try {
      sub = await stripe.subscriptions.retrieve(u.stripeSubscriptionId, { expand: ["items.data.price.product"] });
    } catch (err) {
      if (err.code !== "resource_missing") throw err;
    }
  }

  if (!sub) {
    if (u.isSubscribed !== true) continue; // already off
    rows.push({ ...base, category: "missing", after: REVOKED_MISSING, changes: changedKeys(before, REVOKED_MISSING) });
    continue;
  }

  const after = fieldsFor(sub);
  const changes = changedKeys(before, after);
  const category = !hasAccess(sub.status) ? (u.isSubscribed === true ? "ended" : "ok") : changes.length ? "refresh" : "ok";
  rows.push({
    ...base, category, after, changes,
    stripeStatus: sub.status,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    endedAt: sub.ended_at ? new Date(sub.ended_at * 1000).toISOString().slice(0, 10) : null,
  });
}

const unlinked = stripeLive
  .filter((s) => !linkedSubIds.has(s.id))
  .map((s) => ({ subId: s.id, status: s.status, plan: planFromPrice(s.items?.data?.[0]?.price), uidByCustomer: customerToUid.get(s.customer) ?? null }));

// ── report ────────────────────────────────────────────────────────────────────
const by = (c) => rows.filter((r) => r.category === c);
const toWrite = rows.filter((r) => ["refresh", "ended"].includes(r.category) || (INCLUDE_MISSING && r.category === "missing"));
const firestoreSubscribed = rows.filter((r) => r.before.isSubscribed === true).length;
const testSubscribed = rows.filter((r) => r.test && r.before.isSubscribed === true);

if (AS_JSON) {
  console.log(JSON.stringify({ liveMode: LIVE_MODE, endpoints, stripeLive: stripeLive.length, firestoreSubscribed, rows, unlinked }, null, 2));
} else {
  console.log(`Stripe (${LIVE_MODE ? "live" : "TEST"} mode): ${stripeLive.length} live subscriptions (active/trialing/past_due)`);
  const byStatus = {};
  for (const s of stripeSubs.values()) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
  console.log(`  all subscriptions by status: ${JSON.stringify(byStatus)}`);
  console.log(`Firestore: ${firestoreSubscribed} users with isSubscribed = true (${testSubscribed.length} dev/test, ${firestoreSubscribed - testSubscribed.length} real)\n`);

  console.log("Stripe webhook endpoints:");
  for (const ep of endpoints) {
    if (ep.error) { console.log(`  ${ep.error}`); continue; }
    const wanted = ["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted", "invoice.payment_succeeded", "invoice.payment_failed"];
    const missing = ep.events.includes("*") ? [] : wanted.filter((e) => !ep.events.includes(e));
    console.log(`  ${ep.url} [${ep.status}] ${ep.events.length} events${missing.length ? ` — NOT sent: ${missing.join(", ")}` : ""}`);
  }

  const line = (r) => `    ${r.test ? "[test] " : ""}${r.uid}  ${r.subId ?? "-"}  ${r.stripeStatus ?? ""}${r.endedAt ? ` ended ${r.endedAt}` : ""}${r.changes?.length ? `  fix: ${r.changes.join(", ")}` : ""}`;
  for (const [cat, label] of [
    ["ended", "Cancelled/ended in Stripe, still premium here → revoke"],
    ["missing", `Not found in this Stripe account → ${INCLUDE_MISSING ? "revoke" : "listed only (add --include-missing to revoke)"}`],
    ["manual", "Premium with no Stripe subscription (comp/admin?) → left alone"],
    ["refresh", "Paying, fields stale → refresh"],
    ["ok", "Already right"],
  ]) {
    const list = by(cat);
    console.log(`\n${label}: ${list.length}`);
    if (cat !== "ok") list.forEach((r) => console.log(line(r)));
  }
  console.log(`\nDev/test accounts among the premium ones (also counted in the groups above): ${testSubscribed.length}`);
  testSubscribed.forEach((r) => console.log(`    ${r.uid}  ${r.category}`));
  console.log(`\nLive in Stripe but no user doc points at the subscription: ${unlinked.length}`);
  unlinked.forEach((s) => console.log(`    ${s.subId}  ${s.status}  ${s.plan}  user by customer id: ${s.uidByCustomer ?? "none"}`));

  const afterCount = firestoreSubscribed - by("ended").length - (INCLUDE_MISSING ? by("missing").length : 0);
  console.log(`\nAfter ${APPLY ? "this run" : "--apply"}: ${afterCount} users premium (${by("manual").length} of them manual).`);
}

if (!APPLY) {
  if (!AS_JSON) console.log(`\nDry run: nothing written. ${toWrite.length} docs would change.`);
  process.exit(0);
}
if (!LIVE_MODE) {
  console.error("Refusing to --apply with a test-mode key: every live subscription would look missing.");
  process.exit(1);
}

mkdirSync("scripts/backups", { recursive: true });
const backup = `scripts/backups/subscription-backfill-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(backup, JSON.stringify(toWrite.map((r) => ({ uid: r.uid, before: r.before })), null, 2));
console.log(`\nBackup of old fields: ${backup}`);

const now = new Date().toISOString();
for (let i = 0; i < toWrite.length; i += 400) {
  const batch = db.batch();
  for (const r of toWrite.slice(i, i + 400)) batch.update(db.collection("users").doc(r.uid), { ...r.after, updatedAt: now });
  await batch.commit();
}
console.log(`Wrote ${toWrite.length} docs.`);
