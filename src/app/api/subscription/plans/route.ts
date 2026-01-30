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
    const plans = [];

    // Fetch each price from Stripe
    for (const [key, priceId] of Object.entries(PRICE_IDS)) {
      const price = await stripe.prices.retrieve(priceId, {
        expand: ['product']
      });

      const product = price.product as Stripe.Product;
      const amount = price.unit_amount ? (price.unit_amount / 100).toFixed(2) : '0.00';
      
      let period = '';
      let savings = '';
      let popular = false;

      if (price.recurring) {
        if (price.recurring.interval === 'month') {
          if (price.recurring.interval_count === 1) {
            period = '/month';
          } else if (price.recurring.interval_count === 3) {
            period = '/3 months';
            savings = 'Save 13%';
            popular = true;
          }
        } else if (price.recurring.interval === 'year') {
          period = '/year';
          savings = 'Save 25%';
        }
      }

      plans.push({
        id: key,
        name: product.name || key.charAt(0).toUpperCase() + key.slice(1),
        price: `$${amount}`,
        period,
        savings,
        popular,
        features: product.metadata?.features 
          ? JSON.parse(product.metadata.features)
          : ['All premium features', 'Create custom leagues', 'Priority support']
      });
    }

    return NextResponse.json({ plans });
  } catch (error) {
    console.error('Error fetching plans:', error);
    return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 });
  }
}
