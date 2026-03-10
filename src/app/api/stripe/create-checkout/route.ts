import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth } from '@/src/lib/firebaseClient';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover'
});

const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_MONTHLY!,
  quarterly: process.env.STRIPE_PRICE_QUARTERLY!,
  yearly: process.env.STRIPE_PRICE_YEARLY!
};

export async function POST(request: NextRequest) {
  try {
    const { plan, userId } = await request.json();

    if (!plan || !PRICE_IDS[plan as keyof typeof PRICE_IDS]) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    // Get the base URL from request headers
    const host = request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || `${protocol}://${host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: PRICE_IDS[plan as keyof typeof PRICE_IDS],
        quantity: 1,
      }],
      success_url: `${baseUrl}/dashboard?subscription=success`,
      cancel_url: `${baseUrl}/dashboard?subscription=cancelled`,
      metadata: {
        userId: userId
      }
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 });
  }
}
