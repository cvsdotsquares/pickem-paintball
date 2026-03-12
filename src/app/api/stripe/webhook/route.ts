import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/src/lib/firebaseClient';
import { doc, updateDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';

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

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
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

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) return;

  const subscriptionData = await stripe.subscriptions.retrieve(session.subscription as string);
  const plan = getPlanFromPriceId(subscriptionData.items.data[0].price.id);
  const periodEnd = (subscriptionData as any).current_period_end || 0;

  await updateDoc(doc(db, 'users', userId), {
    isSubscribed: true,
    subscriptionTier: plan,
    stripeCustomerId: session.customer as string,
    stripeSubscriptionId: subscriptionData.id,
    subscriptionStatus: subscriptionData.status,
    subscriptionCurrentPeriodEnd: new Date(periodEnd * 1000).toISOString(),
    subscriptionCancelAtPeriodEnd: false,
    updatedAt: new Date().toISOString()
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('stripeCustomerId', '==', customerId), limit(1));
  const userQuery = await getDocs(q);

  if (userQuery.empty) return;

  const userId = userQuery.docs[0].id;
  const plan = getPlanFromPriceId(subscription.items.data[0].price.id);
  const periodEnd = (subscription as any).current_period_end || 0;

  await updateDoc(doc(db, 'users', userId), {
    isSubscribed: subscription.status === 'active',
    subscriptionTier: plan,
    subscriptionStatus: subscription.status,
    subscriptionCurrentPeriodEnd: new Date(periodEnd * 1000).toISOString(),
    subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
    updatedAt: new Date().toISOString()
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('stripeCustomerId', '==', customerId), limit(1));
  const userQuery = await getDocs(q);

  if (userQuery.empty) return;

  const userId = userQuery.docs[0].id;

  await updateDoc(doc(db, 'users', userId), {
    isSubscribed: false,
    subscriptionTier: null,
    subscriptionStatus: 'canceled',
    subscriptionCancelAtPeriodEnd: false,
    updatedAt: new Date().toISOString()
  });
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('stripeCustomerId', '==', customerId), limit(1));
  const userQuery = await getDocs(q);

  if (userQuery.empty) return;

  const userId = userQuery.docs[0].id;

  await updateDoc(doc(db, 'users', userId), {
    lastPaymentDate: new Date(invoice.created * 1000).toISOString(),
    lastPaymentAmount: invoice.amount_paid,
    updatedAt: new Date().toISOString()
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('stripeCustomerId', '==', customerId), limit(1));
  const userQuery = await getDocs(q);

  if (userQuery.empty) return;

  const userId = userQuery.docs[0].id;

  await updateDoc(doc(db, 'users', userId), {
    paymentFailed: true,
    lastPaymentFailedDate: new Date(invoice.created * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function getPlanFromPriceId(priceId: string): 'monthly' | 'quarterly' | 'yearly' {
  const monthlyPrices = process.env.STRIPE_MONTHLY_PRICE_IDS?.split('|') || [];
  const quarterlyPrices = process.env.STRIPE_QUARTERLY_PRICE_IDS?.split('|') || [];
  const yearlyPrices = process.env.STRIPE_YEARLY_PRICE_IDS?.split('|') || [];
  if (monthlyPrices.includes(priceId)) {
    return 'monthly';
  } else if (quarterlyPrices.includes(priceId)) {
    return 'quarterly';
  } else if (yearlyPrices.includes(priceId)) {
    return 'yearly';

  }
  return 'monthly'; // default fallback
}
export const config = {
  api: {
    bodyParser: false
  }
};
