import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
// import { shouldPauseSubscription, shouldResumeSubscription } from '/utils/eventMonths';
import { shouldPauseSubscription, shouldResumeSubscription } from '../../../../utils/eventMonths';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover'
});

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const quarterlyPriceIds = (process.env.STRIPE_QUARTERLY_PRICE_ID ?? '').split('|').filter(Boolean);

    if (quarterlyPriceIds.length === 0) {
      console.warn('STRIPE_QUARTERLY_PRICE_ID is not set — no subscriptions will be managed');
    }

    let hasMore = true;
    let startingAfter: string | undefined;
    let pausedCount = 0;
    let resumedCount = 0;

    while (hasMore) {
      const subscriptions = await stripe.subscriptions.list({
        status: 'active',
        limit: 100,
        starting_after: startingAfter
      });

      for (const subscription of subscriptions.data) {
        const priceId = subscription.items.data[0]?.price?.id;

        // Only manage pause/resume for event-based subscriptions
        if (!priceId || !quarterlyPriceIds.includes(priceId)) {
          continue;
        }

        // Pause logic
        if (shouldPauseSubscription(now) && subscription.pause_collection === null) {
          await stripe.subscriptions.update(subscription.id, {
            pause_collection: { behavior: 'void' }
          });
          pausedCount++;
        }

        // Resume logic
        if (shouldResumeSubscription(now) && subscription.pause_collection !== null) {
          await stripe.subscriptions.update(subscription.id, {
            pause_collection: null
          });
          resumedCount++;
        }
      }

      hasMore = subscriptions.has_more;
      if (hasMore) {
        startingAfter = subscriptions.data[subscriptions.data.length - 1].id;
      }
    }

    return NextResponse.json({
      success: true,
      pausedCount,
      resumedCount,
      timestamp: now.toISOString()
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
