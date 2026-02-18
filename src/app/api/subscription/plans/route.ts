import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_MONTHLY!,
  quarterly: process.env.STRIPE_PRICE_QUARTERLY!,
  yearly: process.env.STRIPE_PRICE_YEARLY!
};

export async function GET() {
  try {
    const plansMap: Record<string, any> = {};

    // Fetch each price from Stripe
    for (const [key, priceId] of Object.entries(PRICE_IDS)) {
      const price = await stripe.prices.retrieve(priceId, {
        expand: ['product']
      });

      const product = price.product as Stripe.Product;
      const amount = price.unit_amount ? (price.unit_amount / 100).toFixed(2) : '0.00';
      
      console.log(`\n=== ${key.toUpperCase()} Plan ===`);
      console.log('Product Name:', product.name);
      console.log('Product Metadata:', product.metadata);
      console.log('Has features in metadata:', !!product.metadata?.features);
      if (product.metadata?.features) {
        console.log('Features:', product.metadata.features);
      }
      
      let period = '';
      let savings = '';
      let popular = false;

      if (price.recurring) {
        if (price.recurring.interval === 'month') {
          if (price.recurring.interval_count === 1) {
            period = '/month';
            popular = true; // Monthly is most popular
            savings = 'Save 14%';
          } else if (price.recurring.interval_count === 3) {
            period = '/event';
          }
        } else if (price.recurring.interval === 'year') {
          period = '/year';
          savings = 'Save 19%';
        }
      }

      plansMap[key] = {
        id: key,
        name: product.name || key.charAt(0).toUpperCase() + key.slice(1),
        price: `$${amount}`,
        period,
        savings,
        popular,
        features: product.metadata?.features 
          ? JSON.parse(product.metadata.features)
          : getDefaultFeatures(key)
      };
    }

    // Order: quarterly, monthly (center/most popular), yearly
    const plans = [
      plansMap.quarterly,
      plansMap.monthly,
      plansMap.yearly
    ].filter(Boolean);

    return NextResponse.json({ plans });
  } catch (error) {
    console.error('Error fetching plans:', error);
    return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 });
  }
}

function getDefaultFeatures(planType: string): string[] {
  const commonFeatures = [
    'Premium features',
    'Monthly giveaways'
  ];
  
  if (planType === 'quarterly') {
    return [
      'Premium features',
      'Pay only in event months',
      'Monthly giveaways'
    ];
  }
  
  return commonFeatures;
}
