import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover'
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;

    // Fetch from Firestore using REST API
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
