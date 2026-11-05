import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { findUserId, syncSubscriptionToUser, subscriptionFields } from '@/src/lib/stripeSubscriptionSync';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover'
});

export async function POST(request: NextRequest) {
  try {
    const { userId, subscriptionId } = await request.json();

    if (!userId || !subscriptionId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product'],
    });
    // Only sync a subscription that already belongs to this user (same subscription or customer id).
    if ((await findUserId(subscription)) !== userId) {
      return NextResponse.json({ error: 'Subscription not linked to this user' }, { status: 404 });
    }
    const { written } = await syncSubscriptionToUser(subscription, userId);
    if (!written) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const fields = subscriptionFields(subscription);

    return NextResponse.json({
      success: true,
      data: {
        plan: fields.subscriptionTier,
        status: subscription.status,
        currentPeriodEnd: fields.subscriptionCurrentPeriodEnd
      }
    });
  } catch (error: any) {
    console.error('Error syncing subscription:', error);
    return NextResponse.json({
      error: error.message || 'Failed to sync subscription'
    }, { status: 500 });
  }
}
