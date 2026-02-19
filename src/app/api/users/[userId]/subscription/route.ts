import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
// import { isEventMonth, getNextEventMonth } from '.utils/eventMonths';
import { isEventMonth, getNextEventMonth } from '../../../../../utils/eventMonths';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover'
});

const PRICE_ID = process.env.STRIPE_PRICE_ID!;

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${userId}`;
    
    const response = await fetch(firestoreUrl);
    if (!response.ok) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const data = await response.json();
    const fields = data.fields || {};
    
    return NextResponse.json({
      isSubscribed: fields.isSubscribed?.booleanValue || false,
      subscriptionTier: fields.subscriptionTier?.stringValue || null,
      stripeCustomerId: fields.stripeCustomerId?.stringValue || null,
      stripeSubscriptionId: fields.stripeSubscriptionId?.stringValue || null,
      currentPeriodEnd: fields.subscriptionCurrentPeriodEnd?.stringValue || null,
      cancelAtPeriodEnd: fields.subscriptionCancelAtPeriodEnd?.booleanValue || false
    });
  } catch (error) {
    console.error('Error checking subscription:', error);
    return NextResponse.json({ error: 'Failed to check subscription' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const { email } = await request.json();

    // Create or retrieve Stripe customer
    let customer;
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });
    
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({ email, metadata: { userId } });
    }

    const now = new Date();
    const isCurrentEventMonth = isEventMonth(now);
    const nextEventMonth = getNextEventMonth(now);
    const billingCycleAnchor = Math.floor(nextEventMonth.getTime() / 1000);

    // Create subscription
    const subscriptionResponse = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICE_ID }],
      billing_cycle_anchor: billingCycleAnchor,
      proration_behavior: 'none',
      ...(isCurrentEventMonth ? {} : { trial_end: billingCycleAnchor }),
      metadata: { userId }
    });

    // Extract current_period_end safely
    const currentPeriodEnd = (subscriptionResponse as any).current_period_end || Math.floor(Date.now() / 1000);

    // Update Firestore
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${userId}`;
    await fetch(firestoreUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          stripeCustomerId: { stringValue: customer.id },
          stripeSubscriptionId: { stringValue: subscriptionResponse.id },
          isSubscribed: { booleanValue: isCurrentEventMonth },
          subscriptionCurrentPeriodEnd: { 
            stringValue: new Date(currentPeriodEnd * 1000).toISOString()
          }
        }
      })
    });

    return NextResponse.json({ subscriptionId: subscriptionResponse.id, status: subscriptionResponse.status });
  } catch (error) {
    console.error('Error creating subscription:', error);
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${userId}`;
    
    const response = await fetch(firestoreUrl);
    if (!response.ok) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const data = await response.json();
    const subscriptionId = data.fields?.stripeSubscriptionId?.stringValue;

    if (!subscriptionId) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 404 });
    }

    // Cancel at period end
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });

    await fetch(firestoreUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          subscriptionCancelAtPeriodEnd: { booleanValue: true }
        }
      })
    });

    return NextResponse.json({ message: 'Subscription will cancel at period end' });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 });
  }
}
