import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover'
});

// Server-side cache keyed by currency to avoid hitting Stripe on every request
let cachedPlansByCurrency: Record<string, { plans: any[], timestamp: number }> = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function resolveCurrency(req: NextRequest): string {
  const region = req.nextUrl.searchParams.get('region');
  const countryHeader = req.headers.get('x-vercel-ip-country');

  const targetRegion = region || countryHeader || '';

  if (targetRegion === 'UK' || targetRegion === 'GB') return 'gbp';
  if (targetRegion === 'EU' || ['FR', 'DE', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'IE', 'FI', 'GR', 'CY', 'MT', 'EE', 'LT', 'LV', 'SI', 'SK', 'LU'].includes(targetRegion)) return 'eur';

  return 'usd';
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

// Fallback plans if Stripe API fails
const FALLBACK_PLANS = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: '$4.99',
    period: '/month',
    popular: false,
    savings: null,
    features: []
  },
  {
    id: 'quarterly',
    name: 'Quarterly',
    price: '$12.99',
    period: '/3 months',
    popular: true,
    savings: 'Save 13%',
    features: []
  },
  {
    id: 'yearly',
    name: 'Yearly',
    price: '$49.99',
    period: '/year',
    popular: false,
    savings: 'Save 17%',
    features: []
  }
];

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
const PLAN_META: Record<string, { order: number; popular: boolean; savings: string | null }> = {
  quarterly: { order: 0, popular: false, savings: null },
  monthly: { order: 1, popular: true, savings: null },
  yearly: { order: 2, popular: false, savings: null },
};

export async function GET(request: NextRequest) {
  try {
    const currency = resolveCurrency(request);
    const cacheEntry = cachedPlansByCurrency[currency];

    // Return cached plans instantly if available
    if (cacheEntry && Date.now() - cacheEntry.timestamp < CACHE_TTL) {
      return NextResponse.json({ plans: cacheEntry.plans, currency });
    }

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

        // Get features from product marketing_features or metadata
        let features: string[] = [];
        if (product.marketing_features && product.marketing_features.length > 0) {
          features = product.marketing_features.map((f: any) => f.name).filter(Boolean);
        }
        if (features.length === 0 && product.metadata) {
          features = Object.keys(product.metadata)
            .filter((key) => key.startsWith('features'))
            .sort()
            .map((key) => product.metadata[key])
            .filter(Boolean);
        }
        if (features.length === 0) {
          features = ['Custom Leagues', 'Advanced Statistics', 'Priority Support', 'Early Access to Features'];
        }

        const meta = PLAN_META[planKey] || { order: 99, popular: false, savings: null };

        return {
          id: planKey,
          name: product.name || planKey.charAt(0).toUpperCase() + planKey.slice(1),
          description: product.description || '',
          price: formatPrice(price.unit_amount || 0, price.currency),
          period: formatPeriod(price.recurring?.interval || 'month', price.recurring?.interval_count || 1),
          popular: meta.popular,
          savings: meta.savings,
          features,
          _order: meta.order,
        };
      });

    // Now calculate savings dynamically
    const monthlyPlan = plans.find(p => p.id === 'monthly');
    if (monthlyPlan) {
      const monthlyAmount = parseFloat(monthlyPlan.price.replace(/[^0-9.]/g, ''));
      plans.forEach(plan => {
        if (plan.id === 'quarterly') {
          const qAmount = parseFloat(plan.price.replace(/[^0-9.]/g, ''));
          const equivalent = monthlyAmount * 3;
          if (equivalent > qAmount) {
            const pct = Math.round(((equivalent - qAmount) / equivalent) * 100);
            plan.savings = `Save ${pct}%`;
          }
        } else if (plan.id === 'yearly') {
          const yAmount = parseFloat(plan.price.replace(/[^0-9.]/g, ''));
          const equivalent = monthlyAmount * 12;
          if (equivalent > yAmount) {
            const pct = Math.round(((equivalent - yAmount) / equivalent) * 100);
            plan.savings = `Save ${pct}%`;
          }
        }
      });
    }

    // Sort by order and remove internal field
    plans.sort((a, b) => a._order - b._order);
    const cleanPlans = plans.map(({ _order, ...rest }) => rest);

    // Cache the result
    cachedPlansByCurrency[currency] = {
      plans: cleanPlans,
      timestamp: Date.now()
    };

    return NextResponse.json({
      plans: cleanPlans,
      currency
    });
  } catch (error) {
    console.error('Error fetching plans from Stripe:', error);
    const currency = resolveCurrency(request);
    const cacheEntry = cachedPlansByCurrency[currency];

    // Return cached plans if available (even if stale), otherwise fallback
    if (cacheEntry) {
      return NextResponse.json({ plans: cacheEntry.plans, currency });
    }
    return NextResponse.json({
      plans: FALLBACK_PLANS,
      currency
    });
  }
}