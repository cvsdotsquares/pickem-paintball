import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover'
});

const PRICE_IDS: Record<string, string> = {
  monthly: process.env.STRIPE_PRICE_MONTHLY!,
  quarterly: process.env.STRIPE_PRICE_QUARTERLY!,
  yearly: process.env.STRIPE_PRICE_YEARLY!,
};

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

// Server-side cache to avoid hitting Stripe on every request
let cachedPlans: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET(request: NextRequest) {
  try {
    // Return cached plans instantly if available
    if (cachedPlans && Date.now() - cacheTimestamp < CACHE_TTL) {
      return NextResponse.json({ plans: cachedPlans });
    }

    // Single Stripe API call with a timeout to prevent hanging
    const priceIds = Object.values(PRICE_IDS);

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
    Object.entries(PRICE_IDS).forEach(([planKey, priceId]) => {
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
    cachedPlans = cleanPlans;
    cacheTimestamp = Date.now();

    return NextResponse.json({
      plans: cleanPlans
    });
  } catch (error) {
    console.error('Error fetching plans from Stripe:', error);
    // Return cached plans if available (even if stale), otherwise fallback
    if (cachedPlans) {
      return NextResponse.json({ plans: cachedPlans });
    }
    return NextResponse.json({
      plans: FALLBACK_PLANS
    });
  }
}