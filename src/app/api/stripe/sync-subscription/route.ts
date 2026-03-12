import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/src/lib/firebaseClient';
import { doc, updateDoc } from 'firebase/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover'
});

export async function POST(request: NextRequest) {
  try {
    const { userId, subscriptionId } = await request.json();

    if (!userId || !subscriptionId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const periodEnd = (subscription as any).current_period_end || 0;

    const priceId = subscription.items.data[0].price.id;
    let plan: 'monthly' | 'quarterly' | 'yearly' = 'monthly';

    // Get price IDs from environment variables and split by pipe
    const monthlyPrices = process.env.STRIPE_MONTHLY_PRICE_IDS?.split('|') || [];
    const quarterlyPrices = process.env.STRIPE_QUARTERLY_PRICE_IDS?.split('|') || [];
    const yearlyPrices = process.env.STRIPE_YEARLY_PRICE_IDS?.split('|') || [];

    if (monthlyPrices.includes(priceId)) {
      plan = 'monthly';
    } else if (quarterlyPrices.includes(priceId)) {
      plan = 'quarterly';
    } else if (yearlyPrices.includes(priceId)) {
      plan = 'yearly';
    }

    await updateDoc(doc(db, 'users', userId), {
      isSubscribed: subscription.status === 'active',
      subscriptionTier: plan,
      subscriptionStatus: subscription.status,
      subscriptionCurrentPeriodEnd: new Date(periodEnd * 1000).toISOString(),
      subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
      stripeCustomerId: subscription.customer as string,
      stripeSubscriptionId: subscription.id,
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      data: {
        plan,
        status: subscription.status,
        currentPeriodEnd: new Date(periodEnd * 1000).toISOString()
      }
    });
  } catch (error: any) {
    console.error('Error syncing subscription:', error);
    return NextResponse.json({
      error: error.message || 'Failed to sync subscription'
    }, { status: 500 });
  }
}
