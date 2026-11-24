import Stripe from 'stripe';
import { db } from '@/src/lib/firebaseClient';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';

/**
 * One place that turns a Stripe subscription into the users/{uid} subscription fields.
 * The Stripe webhook, /api/stripe/sync-subscription and scripts/subscription-backfill.mjs
 * (which repeats this logic in plain JS) all follow it, so the site, Klaviyo's
 * is_subscriber and the subscriber counts agree with Stripe.
 *
 * Access rule: premium while Stripe still calls the subscription live —
 *   active, trialing, or past_due (Stripe is retrying a failed card).
 * A "cancel at period end" stays active until the period ends, then Stripe sends
 * customer.subscription.deleted and access stops. An Event plan paused between events
 * (pause_collection) stays active, so it keeps access.
 */

export type Plan = 'monthly' | 'quarterly' | 'yearly';

const LIVE_STATUSES = new Set<Stripe.Subscription.Status>(['active', 'trialing', 'past_due']);

export function hasAccess(status: Stripe.Subscription.Status | string | null | undefined): boolean {
  return !!status && LIVE_STATUSES.has(status as Stripe.Subscription.Status);
}

function envList(...names: string[]): string[] {
  return names.flatMap((n) => (process.env[n] ?? '').split('|')).map((s) => s.trim()).filter(Boolean);
}

/** Every price id configured for a plan: the per-currency ids checkout uses, plus the older pipe lists. */
function priceIdsFor(plan: Plan): string[] {
  const p = plan.toUpperCase();
  return envList(
    `STRIPE_PRICE_${p}`, `STRIPE_PRICE_${p}_USD`, `STRIPE_PRICE_${p}_GBP`, `STRIPE_PRICE_${p}_EUR`,
    `STRIPE_${p}_PRICE_IDS`, `STRIPE_${p}_PRICE_ID`
  );
}

/**
 * Plan from the subscription's price. Configured ids first; if a price isn't listed
 * (env not set on the host), fall back to the price itself: yearly interval → yearly,
 * an "event"/"quarter" product or a 3-month interval → quarterly (the Event plan), else monthly.
 */
export function planFromPrice(price: Stripe.Price | null | undefined): Plan {
  if (!price) return 'monthly';
  for (const plan of ['monthly', 'quarterly', 'yearly'] as Plan[]) {
    if (priceIdsFor(plan).includes(price.id)) return plan;
  }
  const product = typeof price.product === 'object' && price.product && 'name' in price.product ? price.product.name : '';
  const label = `${product ?? ''} ${price.nickname ?? ''}`.toLowerCase();
  if (price.recurring?.interval === 'year') return 'yearly';
  if (/event|quarter/.test(label) || (price.recurring?.interval === 'month' && price.recurring.interval_count === 3)) {
    return 'quarterly';
  }
  return 'monthly';
}

/** Since API 2025-03-31 the period end lives on the item, not the subscription. */
export function periodEndOf(subscription: Stripe.Subscription): number | null {
  const item = subscription.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined;
  return item?.current_period_end ?? (subscription as any).current_period_end ?? null;
}

/** The users/{uid} fields for this subscription (only fields firestore.rules lets server routes write). */
export function subscriptionFields(subscription: Stripe.Subscription) {
  const live = hasAccess(subscription.status);
  const end = periodEndOf(subscription);
  return {
    isSubscribed: live,
    subscriptionStatus: subscription.status,
    subscriptionTier: live ? planFromPrice(subscription.items?.data?.[0]?.price) : null,
    subscriptionCurrentPeriodEnd: end ? new Date(end * 1000).toISOString() : null,
    subscriptionCancelAtPeriodEnd: !!subscription.cancel_at_period_end,
    stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
    updatedAt: new Date().toISOString(),
  };
}

async function firstUserId(field: string, value: string): Promise<string | null> {
  const snap = await getDocs(query(collection(db, 'users'), where(field, '==', value), limit(1)));
  return snap.empty ? null : snap.docs[0].id;
}

/** Who this subscription belongs to: checkout metadata, then the stored subscription id, then the customer id. */
export async function findUserId(subscription: Stripe.Subscription, metadataUserId?: string | null): Promise<string | null> {
  if (metadataUserId) return metadataUserId;
  if (subscription.metadata?.userId) return subscription.metadata.userId;
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  return (await firstUserId('stripeSubscriptionId', subscription.id)) ?? (await firstUserId('stripeCustomerId', customerId));
}

/**
 * Write the subscription's current state to the user's doc. An ended subscription never
 * overwrites a doc that already points at a different subscription (someone who cancelled
 * and later re-subscribed keeps the new one).
 */
export async function syncSubscriptionToUser(
  subscription: Stripe.Subscription,
  metadataUserId?: string | null
): Promise<{ userId: string | null; written: boolean }> {
  const userId = await findUserId(subscription, metadataUserId);
  if (!userId) return { userId: null, written: false };

  const ref = doc(db, 'users', userId);
  const current = await getDoc(ref);
  if (!current.exists()) return { userId, written: false };

  const storedId = current.data().stripeSubscriptionId;
  if (!hasAccess(subscription.status) && storedId && storedId !== subscription.id) {
    return { userId, written: false };
  }

  await updateDoc(ref, subscriptionFields(subscription));
  return { userId, written: true };
}
