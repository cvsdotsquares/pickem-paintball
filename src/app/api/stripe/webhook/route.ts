import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/src/lib/firebaseClient';
import { doc, updateDoc, addDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { planFromPrice, syncSubscriptionToUser } from '@/src/lib/stripeSubscriptionSync';
import { sendSubscribedEmail } from '@/src/lib/subscriberEmails';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover'
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      // Every change to a subscription (renewal, cancel at period end, card failing,
      // Event plan pause, cancelled, ended) re-reads it from Stripe and rewrites the
      // user's fields. Re-reading means events arriving out of order can't leave a
      // stale state behind.
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        const subscription = event.data.object as Stripe.Subscription;
        await syncFromStripe(subscription.id);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function syncFromStripe(subscriptionId: string, metadataUserId?: string | null) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  });
  const result = await syncSubscriptionToUser(subscription, metadataUserId);
  return { ...result, subscription };
}

/** Subscription id on an invoice: `parent.subscription_details` since API 2025-03-31, `subscription` before. */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = (invoice as any).parent?.subscription_details?.subscription ?? (invoice as any).subscription;
  if (!sub) return null;
  return typeof sub === 'string' ? sub : sub.id;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId || !session.subscription) return;

  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
  const { subscription } = await syncFromStripe(subscriptionId, userId);
  const plan = planFromPrice(subscription.items.data[0]?.price);

  // "Thank you for backing Pick'Em": queued in Klaviyo, never blocks the payment (src/lib/subscriberEmails.ts).
  await sendSubscribedEmail(userId, session, plan);

  // Close the subscribe-funnel loop (see /api/subscription/track). Never let reporting break a payment.
  try {
    await addDoc(collection(db, 'subscribeEvents'), {
      step: 'paid',
      reason: session.metadata?.subscribeReason || null,
      viewId: session.metadata?.subscribeViewId || null,
      uid: userId,
      plan,
      currency: session.currency ?? null,
      amountTotal: session.amount_total ?? null,
      createdAt: Date.now(),
    });
  } catch (err) {
    console.error('subscribeEvents paid row failed:', err);
  }
}

async function userIdForInvoice(invoice: Stripe.Invoice): Promise<string | null> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (subscriptionId) {
    const { userId } = await syncFromStripe(subscriptionId);
    if (userId) return userId;
  }
  const customerId = invoice.customer as string;
  const userQuery = await getDocs(query(collection(db, 'users'), where('stripeCustomerId', '==', customerId), limit(1)));
  return userQuery.empty ? null : userQuery.docs[0].id;
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const userId = await userIdForInvoice(invoice);
  if (!userId) return;

  await updateDoc(doc(db, 'users', userId), {
    lastPaymentDate: new Date(invoice.created * 1000).toISOString(),
    lastPaymentAmount: invoice.amount_paid,
    paymentFailed: false,
    updatedAt: new Date().toISOString()
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const userId = await userIdForInvoice(invoice);
  if (!userId) return;

  await updateDoc(doc(db, 'users', userId), {
    paymentFailed: true,
    lastPaymentFailedDate: new Date(invoice.created * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export const config = {
  api: {
    bodyParser: false
  }
};
