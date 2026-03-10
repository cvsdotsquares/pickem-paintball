import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/src/lib/firebaseClient';
import { doc, updateDoc, getDoc } from 'firebase/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover'
});

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    const subscriptionId = userData.stripeSubscriptionId;

    if (!subscriptionId) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
    }

    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });

    await updateDoc(userRef, {
      subscriptionCancelAtPeriodEnd: true,
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      cancelAt: subscription.cancel_at
    });
  } catch (error: any) {
    console.error('Error cancelling subscription:', error);
    return NextResponse.json({
      error: error.message || 'Failed to cancel subscription'
    }, { status: 500 });
  }
}
