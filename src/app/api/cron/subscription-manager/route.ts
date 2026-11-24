import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { shouldCollectRenewal } from '../../../../utils/eventMonths';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover'
});

/**
 * Event plan billing: pause payment collection (invoices voided) before every renewal that lands
 * outside an event month, and lift the pause before every renewal inside one.
 *
 * Runs daily from vercel.json. `?dry=1` reports what it would change and changes nothing.
 *
 * WHY (5 Nov 2026): CRON_SECRET was never set in Vercel, so every run got 401 and no Event plan
 * subscription was ever paused: customers paid every month. The old rule also paused only on the
 * 1st and read STRIPE_QUARTERLY_PRICE_ID, a different name from the one checkout uses.
 */

// The env names checkout sells the Event plan from (create-checkout getPriceId). Not the older
// STRIPE_QUARTERLY_PRICE_ID: nothing checks what it holds, and a wrong id would pause Monthly users.
const EVENT_PRICE_ENV = ['STRIPE_PRICE_QUARTERLY', 'STRIPE_PRICE_QUARTERLY_USD', 'STRIPE_PRICE_QUARTERLY_GBP', 'STRIPE_PRICE_QUARTERLY_EUR'];

/** Event plan products (id → name), so a subscription on any price of that product counts. */
async function eventProducts(): Promise<Map<string, string>> {
  const priceIds = Array.from(new Set(EVENT_PRICE_ENV.map((name) => (process.env[name] ?? '').trim()).filter(Boolean)));
  const products = new Map<string, string>();
  for (const id of priceIds) {
    const price = await stripe.prices.retrieve(id, { expand: ['product'] });
    const product = price.product as Stripe.Product;
    products.set(product.id, product.name);
  }
  return products;
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error('subscription-manager: CRON_SECRET is not set, so Vercel cron cannot call this route');
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get('dry') === '1';

  try {
    const products = await eventProducts();
    if (products.size === 0) {
      console.error('subscription-manager: no Event plan price env set (STRIPE_PRICE_QUARTERLY_*), nothing managed');
      return NextResponse.json({ error: 'No Event plan prices configured' }, { status: 500 });
    }

    const paused: string[] = [];
    const resumed: string[] = [];
    let eventSubs = 0;

    // Paused subscriptions stay 'active' in Stripe, so this list holds both kinds.
    for await (const subscription of stripe.subscriptions.list({ status: 'active', limit: 100 })) {
      const item = subscription.items.data[0];
      const product = item?.price?.product;
      const productId = typeof product === 'string' ? product : product?.id;
      if (!productId || !products.has(productId)) continue;
      eventSubs++;

      // current_period_end lives on the item since the 2025 API versions: the next renewal.
      const nextBill = new Date(item.current_period_end * 1000);
      const collect = shouldCollectRenewal(nextBill);
      const isPaused = subscription.pause_collection !== null;

      if (!collect && !isPaused) {
        if (!dryRun) await stripe.subscriptions.update(subscription.id, { pause_collection: { behavior: 'void' } });
        paused.push(subscription.id);
      } else if (collect && isPaused) {
        if (!dryRun) await stripe.subscriptions.update(subscription.id, { pause_collection: null });
        resumed.push(subscription.id);
      }
    }

    const result = { success: true, dryRun, products: Array.from(products.values()), eventSubs, paused, resumed, timestamp: new Date().toISOString() };
    console.log('subscription-manager:', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
