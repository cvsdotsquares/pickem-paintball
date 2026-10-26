import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { productFeaturesFromStripe } from '@/src/lib/stripeProductFeatures';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover'
});

// Server-side cache keyed by currency to avoid hitting Stripe on every request
let cachedPlansByCurrency: Record<string, { plans: any[], timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function resolveCurrency(req: NextRequest): string {
  const region = req.nextUrl.searchParams.get('region');

  // Vercel and Cloudflare headers
  const countryHeader = req.headers.get('x-vercel-ip-country') || req.headers.get('cf-ipcountry');

  console.log('--- CURRENCY DETECTION ---');
  console.log('URL Region Param:', region);
  console.log('x-vercel-ip-country Header:', req.headers.get('x-vercel-ip-country'));
  console.log('cf-ipcountry Header:', req.headers.get('cf-ipcountry'));

  // Log all headers for debugging (optional, can be noisy but helpful for Vercel)
  const allHeaders: Record<string, string> = {};
  req.headers.forEach((value, key) => { allHeaders[key] = value });
  console.log('All Headers:', JSON.stringify(allHeaders, null, 2));

  const targetRegion = region || countryHeader || '';
  console.log('Final Target Region:', targetRegion);

  let currency = 'usd';
  if (targetRegion === 'UK' || targetRegion === 'GB') {
    currency = 'gbp';
  } else if (targetRegion === 'EU' || ['FR', 'DE', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'IE', 'FI', 'GR', 'CY', 'MT', 'EE', 'LT', 'LV', 'SI', 'SK', 'LU'].includes(targetRegion)) {
    currency = 'eur';
  }

  console.log('Resolved Currency:', currency);
  console.log('--------------------------');

  return currency;
}

function getPriceIdsForCurrency(currency: string): Record<string, string> {
  const plans = ['monthly', 'quarterly', 'yearly'];
  const ids: Record<string, string> = {};

  for (const plan of plans) {
    const upperPlan = plan.toUpperCase();
    const upperCurr = currency.toUpperCase();
    const specificId = process.env[`STRIPE_PRICE_${upperPlan}_${upperCurr}`];
    ids[plan] = specificId || process.env[`STRIPE_PRICE_${upperPlan}`]!;
  }

  return ids;
}

// Fallback plans if Stripe API fails (same numbers in every currency, like the live Stripe prices)
function fallbackPlans(currency: string) {
  const features = ['Join and Create custom leagues', 'Early access to new features'];
  return [
    { id: 'quarterly', name: 'Event Subscription', price: formatPrice(1399, currency), period: '/month', popular: false, savings: null as string | null, features: [features[0], 'Pay only in event months', features[1]] },
    { id: 'monthly', name: 'Monthly Subscription', price: formatPrice(499, currency), period: '/month', popular: true, savings: null as string | null, features },
    { id: 'yearly', name: 'Yearly Subscription', price: formatPrice(4999, currency), period: '/year', popular: false, savings: null as string | null, features },
  ];
}

function formatPrice(amount: number, currency: string): string {
  const symbols: Record<string, string> = { usd: '$', gbp: '£', eur: '€' };
  const symbol = symbols[currency.toLowerCase()] || currency.toUpperCase() + ' ';
  return `${symbol}${(amount / 100).toFixed(2)}`;
}

function formatPeriod(interval: string, intervalCount: number): string {
  if (intervalCount === 1) return `/${interval}`;
  return `/${intervalCount} ${interval}s`;
}

// Determine plan order and metadata
// Savings are worked out from the live prices in applySavings, so they hold in every currency.
const PLAN_META: Record<string, { order: number; popular: boolean }> = {
  quarterly: { order: 0, popular: false },
  monthly: { order: 1, popular: true },
  yearly: { order: 2, popular: false },
};

const amountOf = (price: string) => parseFloat(price.replace(/[^0-9.]/g, ''));

/** Yearly against twelve months of Monthly: a figure buyers can check against the "£4.17/month" line beside it. */
function applySavings(plans: { id: string; price: string; savings: string | null }[]) {
  const monthly = plans.find(p => p.id === 'monthly');
  const yearly = plans.find(p => p.id === 'yearly');
  if (!monthly || !yearly) return;
  const monthlyYear = amountOf(monthly.price) * 12;
  const yearlyAmount = amountOf(yearly.price);
  if (monthlyYear > yearlyAmount) {
    yearly.savings = `Save ${Math.round(((monthlyYear - yearlyAmount) / monthlyYear) * 100)}%`;
  }
}

export async function GET(request: NextRequest) {
  console.log('>>> Incoming request to /api/subscription/plans');
  try {
    const currency = resolveCurrency(request);
    const cacheEntry = cachedPlansByCurrency[currency];

    // Return cached plans instantly if available
    if (cacheEntry && Date.now() - cacheEntry.timestamp < CACHE_TTL) {
      console.log('Returning CACHED plans for currency:', currency);
      return NextResponse.json({ plans: cacheEntry.plans, currency });
    }

    console.log('Fetching FRESH plans from Stripe for currency:', currency);
    // Single Stripe API call with a timeout to prevent hanging
    const currentPriceIds = getPriceIdsForCurrency(currency);
    const priceIds = Object.values(currentPriceIds);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    let pricesList;
    try {
      pricesList = await stripe.prices.list({
        expand: ['data.product'],
        active: true,
        limit: 100,
      });
    } finally {
      clearTimeout(timeout);
    }

    // Build a lookup: priceId -> planKey
    const priceIdToPlanKey: Record<string, string> = {};
    Object.entries(currentPriceIds).forEach(([planKey, priceId]) => {
      priceIdToPlanKey[priceId] = planKey;
    });

    const plans = pricesList.data
      .filter((price) => priceIds.includes(price.id))
      .map((price) => {
        const planKey = priceIdToPlanKey[price.id];
        const product = price.product as Stripe.Product;

        let features = productFeaturesFromStripe(product);
        if (features.length === 0) {
          features = ['Custom Leagues', 'Advanced Statistics', 'Priority Support', 'Early Access to Features'];
        }

        const meta = PLAN_META[planKey] || { order: 99, popular: false };

        return {
          id: planKey,
          name: product.name || planKey.charAt(0).toUpperCase() + planKey.slice(1),
          description: product.description || '',
          price: formatPrice(price.unit_amount || 0, price.currency),
          period: formatPeriod(price.recurring?.interval || 'month', price.recurring?.interval_count || 1),
          popular: meta.popular,
          savings: null as string | null,
          features,
          _order: meta.order,
        };
      });

    applySavings(plans);

    // Sort by order and remove internal field
    plans.sort((a, b) => a._order - b._order);
    const cleanPlans = plans.map(({ _order, ...rest }) => rest);

    // Cache the result
    cachedPlansByCurrency[currency] = {
      plans: cleanPlans,
      timestamp: Date.now()
    };

    const response = NextResponse.json({
      plans: cleanPlans,
      currency
    });

    // Completely disable Vercel CDN cache
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return response;

  } catch (error) {
    console.error('Error fetching plans from Stripe:', error);
    const currency = resolveCurrency(request);
    const cacheEntry = cachedPlansByCurrency[currency];

    // Return cached plans if available (even if stale), otherwise fallback
    if (cacheEntry) {
      return NextResponse.json({ plans: cacheEntry.plans, currency });
    }
    const plans = fallbackPlans(currency);
    applySavings(plans);
    return NextResponse.json({
      plans,
      currency
    });
  }
}
