import type Stripe from "stripe";
import { getFirestore } from "firebase-admin/firestore";
import { ensureAdmin } from "@/src/lib/authEmailsServer";
import { tidyName } from "@/src/lib/welcomeServer";

/**
 * "Thank you for backing Pick'Em" (James's copy, signed off 7 Nov 2026). When a NEW checkout completes, the Stripe
 * webhook calls this: Klaviyo gets "Started Subscription" (plan, currency, amount; unique per checkout, so a retried
 * webhook can't send it twice), which its flow sends straight away. The email agent then sends "Getting the most
 * out of your subscription" about 3 days later, inside the weekly email limit.
 *
 * Switch: SUBSCRIBER_EMAILS = off (default) | seeds (only AUTH_EMAILS_SEEDS) | on. Never throws: a payment must not
 * fail because an email couldn't be queued. Failures go to subscriberEmailErrors for the daily health check.
 */
export const SUBSCRIBED_METRIC = "Started Subscription";

export async function sendSubscribedEmail(userId: string, session: Stripe.Checkout.Session, plan: string): Promise<void> {
  const mode = process.env.SUBSCRIBER_EMAILS || "off";
  if (mode === "off" || !process.env.KLAVIYO_PRIVATE_KEY || !ensureAdmin()) return;
  const db = getFirestore();
  try {
    const u = (await db.collection("users").doc(userId).get()).data() || {};
    const email = String(u.email || session.customer_details?.email || "").trim().toLowerCase();
    if (!email) return;
    if (mode === "seeds") {
      const seeds = (process.env.AUTH_EMAILS_SEEDS || "").split(",").map((x) => x.trim().toLowerCase());
      if (!seeds.includes(email)) return;
    }
    const first = tidyName(String(u.firstName || ""));
    const res = await fetch("https://a.klaviyo.com/api/events", {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
        revision: "2024-10-15",
        accept: "application/vnd.api+json",
        "content-type": "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "event",
          attributes: {
            unique_id: session.id,
            properties: { plan, event_plan: plan === "quarterly", currency: session.currency ?? null, amount: session.amount_total ?? null },
            metric: { data: { type: "metric", attributes: { name: SUBSCRIBED_METRIC } } },
            profile: {
              data: {
                type: "profile",
                attributes: {
                  email,
                  ...(first ? { first_name: first } : {}),
                  properties: { pickem_user_id: userId, is_subscriber: true, subscription_tier: plan, subscribed_at: new Date().toISOString() },
                },
              },
            },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`Klaviyo ${res.status}: ${(await res.text()).slice(0, 300)}`);
  } catch (err) {
    console.error("[subscriber-email] failed", err);
    await db.collection("subscriberEmailErrors").add({
      uid: userId,
      message: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      createdAt: Date.now(),
    }).catch(() => undefined);
  }
}
