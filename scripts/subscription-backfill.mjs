/**
 * Line up users/{uid} subscription fields with Stripe.
 *
 *   STRIPE_SECRET_KEY=rk_live_… node scripts/subscription-backfill.mjs            # dry run, writes nothing
 *   STRIPE_SECRET_KEY=rk_live_… node scripts/subscription-backfill.mjs --apply    # write the fixes
 *   … --apply --include-missing   # also revoke subscriptions this Stripe account has never heard of
 *   … --apply --include-free-ended  # also revoke ended subscriptions that never took a payment (free promo)
 *   … --apply --include-event-ended # also revoke Event plan users whose subscription really ended
 *
 * EVENT PLAN (the "quarterly" price, our highest-value customers): between events the
 * subscription-manager cron pauses payment collection; the subscription stays "active", so
 * these users keep premium. The dry run lists every Event plan subscription on its own —
 * status, whether payments are paused, how many charges went through and how many were
 * skipped — and --apply never changes an Event plan user without --include-event-ended.
 *   … --keep uid1,uid2            # never change these users (free access James switched on by hand)
 *   … --json                      # the whole plan as JSON
 *
 * A restricted key with READ access to Subscriptions, Invoices, Prices, Products and
 * Webhook Endpoints is enough; the script never writes to Stripe. Firestore uses the same
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
 *   ended     PAID at least once, then canceled / unpaid / expired in Stripe → revoke premium
 *   freeEnded ended in Stripe but never took a payment (100% promo code)    → listed; revoked only with --include-free-ended
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
const INCLUDE_FREE_ENDED = args.includes("--include-free-ended");
const INCLUDE_EVENT_ENDED = args.includes("--include-event-ended");
const AS_JSON = args.includes("--json");
// Free access is switched on by hand, sometimes for someone who once paid and cancelled; their doc
// still points at the old subscription, so it looks "paid then cancelled". --keep protects them.
const KEEP = new Set(args.includes("--keep") ? (args[args.indexOf("--keep") + 1] ?? "").split(",").map((x) => x.trim()).filter(Boolean) : []);

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

// Price ids from the same env names checkout uses, when set (otherwise the product name decides).
const envIds = (plan) => ["", "_USD", "_GBP", "_EUR"].flatMap((c) => (process.env[`STRIPE_PRICE_${plan}${c}`] ?? "").split("|")).filter(Boolean);

function planFromPrice(price) {
  if (!price) return "monthly";
  for (const plan of ["MONTHLY", "QUARTERLY", "YEARLY"]) if (envIds(plan).includes(price.id)) return plan.toLowerCase();
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

/** Money actually taken on a subscription (paid invoices with amount_paid > 0), plus skipped (void) invoices. */
async function paymentsOn(subId) {
  let count = 0, total = 0, currency = null, last = null, skipped = 0;
  for await (const inv of stripe.invoices.list({ subscription: subId, limit: 100 })) {
    if (inv.status === "void") skipped += 1;
    if (inv.status === "paid" && inv.amount_paid > 0) {
      count += 1;
      total += inv.amount_paid;
      currency = inv.currency;
      last = Math.max(last ?? 0, inv.created);
    }
  }
  return { count, total: total / 100, currency, skipped, lastPaid: last ? new Date(last * 1000).toISOString().slice(0, 10) : null };
}

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

  if (KEEP.has(d.id)) {
    rows.push({ ...base, category: "kept", note: "--keep" });
    continue;
  }
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
  let category = !hasAccess(sub.status) ? (u.isSubscribed === true ? "ended" : "ok") : changes.length ? "refresh" : "ok";
  // Free accounts given through a 100% promo code never took money; keep them apart from paying customers.
  const isEventPlan = planFromPrice(sub.items?.data?.[0]?.price) === "quarterly";
  const paid = category === "ended" || hasAccess(sub.status) ? await paymentsOn(sub.id) : null;
  if (category === "ended" && paid.count === 0) category = "freeEnded";
  else if (category === "ended" && isEventPlan) category = "eventEnded";
  rows.push({
    ...base, category, after, changes, paid, isEventPlan,
    paymentsPaused: !!sub.pause_collection,
    product: productNames.get(sub.items?.data?.[0]?.price?.product) ?? sub.items?.data?.[0]?.price?.product?.name ?? null,
    freeInStripe: hasAccess(sub.status) && paid?.count === 0,
    canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString().slice(0, 10) : null,
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
const toWrite = rows.filter((r) => ["refresh", "ended"].includes(r.category)
  || (INCLUDE_MISSING && r.category === "missing")
  || (INCLUDE_FREE_ENDED && r.category === "freeEnded")
  || (INCLUDE_EVENT_ENDED && r.category === "eventEnded"));
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

  const money = (p) => (p?.count ? `  paid ${p.count}× (${p.total} ${p.currency?.toUpperCase()}, last ${p.lastPaid})` : "");
  const line = (r) => `    ${r.test ? "[test] " : ""}${r.uid}  ${r.subId ?? "-"}  ${r.stripeStatus ?? ""}${r.canceledAt ? ` cancelled ${r.canceledAt}` : ""}${r.endedAt ? ` ended ${r.endedAt}` : ""}${money(r.paid)}${r.freeInStripe ? "  FREE (no payment yet)" : ""}${r.changes?.length ? `  fix: ${r.changes.join(", ")}` : ""}`;
  for (const [cat, label] of [
    ["ended", "PAID, then cancelled/ended in Stripe, still premium here → revoke"],
    ["eventEnded", `Event plan, PAID, then really ended in Stripe → ${INCLUDE_EVENT_ENDED ? "revoke" : "listed only (add --include-event-ended to revoke)"}`],
    ["freeEnded", `Free (never paid) and ended in Stripe, still premium here → ${INCLUDE_FREE_ENDED ? "revoke" : "listed only (add --include-free-ended to revoke)"}`],
    ["missing", `Not found in this Stripe account → ${INCLUDE_MISSING ? "revoke" : "listed only (add --include-missing to revoke)"}`],
    ["manual", "Premium with no Stripe subscription (comp/admin?) → left alone"],
    ["kept", "Protected with --keep (free access given by hand) → left alone"],
    ["refresh", "Live in Stripe, fields stale → refresh"],
    ["ok", "Already right"],
  ]) {
    const list = by(cat);
    console.log(`\n${label}: ${list.length}`);
    if (cat !== "ok") list.forEach((r) => console.log(line(r)));
  }
  // Which product is which plan, so the Event plan is identified correctly (not guessed).
  const products = {};
  for (const sub of stripeSubs.values()) {
    const price = sub.items?.data?.[0]?.price;
    const key = `${productNames.get(price?.product) ?? price?.product} / ${price?.recurring?.interval ?? "?"} → ${planFromPrice(price)}`;
    products[key] = (products[key] ?? 0) + (hasAccess(sub.status) ? 1 : 0);
  }
  console.log("\nProducts → plan the script assigns (live subscriptions each):");
  for (const [k, n] of Object.entries(products)) console.log(`    ${k}: ${n}`);

  const eventRows = rows.filter((r) => r.isEventPlan);
  console.log(`\nEvent plan subscribers: ${eventRows.length} (keep premium while Stripe says active, paused or not)`);
  eventRows.forEach((r) => console.log(`    ${r.test ? "[test] " : ""}${r.uid}  ${r.stripeStatus}${r.paymentsPaused ? "  payments PAUSED" : ""}  charged ${r.paid?.count ?? 0}×, skipped ${r.paid?.skipped ?? 0}×${r.paid?.lastPaid ? `, last paid ${r.paid.lastPaid}` : ""}  → ${["ended", "eventEnded", "freeEnded"].includes(r.category) ? "ENDED in Stripe" : "keeps premium"}`));

  const freeLive = rows.filter((r) => r.freeInStripe);
  console.log(`\nLive in Stripe but never charged (free promo code): ${freeLive.length}${freeLive.length ? ` — ${freeLive.map((r) => r.uid).join(", ")}` : ""}`);
  console.log(`\nDev/test accounts among the premium ones (also counted in the groups above): ${testSubscribed.length}`);
  testSubscribed.forEach((r) => console.log(`    ${r.uid}  ${r.category}`));
  console.log(`\nLive in Stripe but no user doc points at the subscription: ${unlinked.length}`);
  unlinked.forEach((s) => console.log(`    ${s.subId}  ${s.status}  ${s.plan}  user by customer id: ${s.uidByCustomer ?? "none"}`));

  const afterCount = firestoreSubscribed - by("ended").length - (INCLUDE_MISSING ? by("missing").length : 0)
    - (INCLUDE_FREE_ENDED ? by("freeEnded").length : 0) - (INCLUDE_EVENT_ENDED ? by("eventEnded").length : 0);
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
