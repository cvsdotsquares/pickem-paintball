import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover'
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

async function updateUserSubscription(userId: string, data: any) {
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${userId}`;
  await fetch(firestoreUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: data })
  });
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        const userId = invoice.subscription_metadata?.userId;

        if (userId) {
          await updateUserSubscription(userId, {
            isSubscribed: { booleanValue: true },
            subscriptionCurrentPeriodEnd: {
              stringValue: new Date((invoice.lines.data[0].period.end) * 1000).toISOString()
            }
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        const userId = invoice.subscription_metadata?.userId;

        if (userId) {
          await updateUserSubscription(userId, {
            isSubscribed: { booleanValue: false }
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        const userId = subscription.metadata?.userId;

        if (userId) {
          await updateUserSubscription(userId, {
            isSubscribed: { booleanValue: subscription.status === 'active' },
            subscriptionCurrentPeriodEnd: {
              stringValue: new Date(subscription.current_period_end * 1000).toISOString()
            },
            subscriptionCancelAtPeriodEnd: { booleanValue: subscription.cancel_at_period_end }
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        const userId = subscription.metadata?.userId;

        if (userId) {
          await updateUserSubscription(userId, {
            isSubscribed: { booleanValue: false },
            stripeSubscriptionId: { stringValue: '' }
          });
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
