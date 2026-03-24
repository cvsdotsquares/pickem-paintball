import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/lib/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';
import Stripe from 'stripe';
import { productFeaturesFromStripe } from '@/src/lib/stripeProductFeatures';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover' as any
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const userDoc = await getDoc(doc(db, 'users', userId));

    if (!userDoc.exists()) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    let isSubscribed = userData.isSubscribed || false;
    let subscriptionStatus = userData.subscriptionStatus || null;
    let subscriptionTier = userData.subscriptionTier || null;
    let currentPeriodEnd = userData.subscriptionCurrentPeriodEnd || null;
    const stripeSubscriptionId = userData.stripeSubscriptionId || null;
    const stripeCustomerId = userData.stripeCustomerId || null;

    // Fetch live subscription details from Stripe if ID exists
    if (stripeSubscriptionId) {
      try {
        console.log('Fetching Stripe Subscription ID:', stripeSubscriptionId);
        const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        
        console.log('--- STRIPE SUBSCRIPTION FETCHED ---');
        console.log('Full Stripe Response:', JSON.stringify(stripeSubscription, null, 2));
        console.log('Status:', stripeSubscription.status);
        console.log('Current Period End:', (stripeSubscription as any).current_period_end);

        subscriptionStatus = stripeSubscription.status;
        isSubscribed = stripeSubscription.status === 'active';
        
        const periodEnd = (stripeSubscription as any).current_period_end;
        if (periodEnd) {
          currentPeriodEnd = new Date(periodEnd * 1000).toISOString();
        }

        // Map price ID to tier
        const priceId = stripeSubscription.items.data[0]?.price.id;
        console.log('Price ID found:', priceId);
        
        if (priceId) {
          const monthlyPrices = process.env.STRIPE_MONTHLY_PRICE_IDS?.split('|') || [];
          const quarterlyPrices = process.env.STRIPE_QUARTERLY_PRICE_IDS?.split('|') || [];
          const yearlyPrices = process.env.STRIPE_YEARLY_PRICE_IDS?.split('|') || [];
          if (monthlyPrices.includes(priceId)) {
            subscriptionTier = 'monthly';
          } else if (quarterlyPrices.includes(priceId)) {
            subscriptionTier = 'quarterly';
          } else if (yearlyPrices.includes(priceId)) {
            subscriptionTier = 'yearly';
          }
        }
      } catch (stripeError: any) {
        console.error('Error fetching from Stripe:', stripeError);

        // If subscription is not found in Stripe, assume it's cancelled/deleted
        if (stripeError.code === 'resource_missing' && stripeError.statusCode === 404) {
          isSubscribed = false;
          subscriptionStatus = 'canceled';
          subscriptionTier = null;
        }
        // Fallback to Firestore data for other types of Stripe fetch fails
      }
    }

    // Check if subscription is still valid
    let validSubscription = isSubscribed;

    // If subscription status is 'active', consider it valid regardless of period end
    if (subscriptionStatus === 'active') {
      validSubscription = true;
    } else if (currentPeriodEnd) {
      const periodEnd = new Date(currentPeriodEnd);
      validSubscription = isSubscribed && new Date() < periodEnd;
    }

    // Ensure the date is properly formatted for the frontend
    // Stripe returns seconds, JS Date expects milliseconds
    if (currentPeriodEnd && !isNaN(Date.parse(currentPeriodEnd))) {
       currentPeriodEnd = new Date(currentPeriodEnd).toISOString();
    }

    const monthlyPrices = process.env.STRIPE_MONTHLY_PRICE_IDS?.split('|') || [];
    const quarterlyPrices = process.env.STRIPE_QUARTERLY_PRICE_IDS?.split('|') || [];
    const yearlyPrices = process.env.STRIPE_YEARLY_PRICE_IDS?.split('|') || [];

    // Map tier data to standardized plan object
    let activePlanDetails = null;
    
    // Default tier data just in case
    const tierConfig: Record<string, {name: string, price: number, period: string}> = {
       'monthly': { name: 'Monthly Pro', price: 9.99, period: '/mo' },
       'quarterly': { name: 'Quarterly Pro', price: 24.99, period: '/qtr' },
       'yearly': { name: 'Annual Pro', price: 89.99, period: '/yr' }
    };
    
    // We already have `subscriptionTier` set above from Stripe items or Firestore fallback
    // We can also potentially extract exact price from Stripe item if available
    let planPrice = subscriptionTier ? tierConfig[subscriptionTier]?.price : null;
    let planName = subscriptionTier ? tierConfig[subscriptionTier]?.name : null;
    let planPeriod = subscriptionTier ? tierConfig[subscriptionTier]?.period : null;
    let planFeatures: string[] | undefined = undefined;

    if (stripeSubscriptionId) {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId) as any;
        
        console.log('--- EXPANDED STRIPE RESPONSE ---');
        console.log('first item data:', JSON.stringify(stripeSubscription.items?.data?.[0], null, 2));

        // Always trust Stripe's exact timestamp over Firestore for the active subscription
        const rootPeriodEnd = stripeSubscription.current_period_end;
        const itemPeriodEnd = stripeSubscription.items?.data?.[0]?.current_period_end;
        
        if (itemPeriodEnd) {
          currentPeriodEnd = new Date(itemPeriodEnd * 1000).toISOString();
        } else if (rootPeriodEnd) {
          currentPeriodEnd = new Date(rootPeriodEnd * 1000).toISOString();
        }

        const priceId = stripeSubscription.items.data[0]?.price?.id;
        
        if (priceId) {
          try {
             // Fetch the exact price details 
             const priceDetails = await stripe.prices.retrieve(priceId, {
               expand: ['product']
             }) as any;
             
             const productItem = priceDetails.product;
             
             if (priceDetails && productItem && typeof productItem === 'object') {
               planName = productItem.name;
               planPrice = priceDetails.unit_amount / 100;
               planPeriod = `/${priceDetails.recurring?.interval}`;
               planFeatures = productFeaturesFromStripe(productItem as Stripe.Product);
               
               console.log('Successfully fetched price details from Stripe:', { planName, planPrice, planPeriod });
             }
          } catch (priceError) {
             console.error('Error fetching exact price details:', priceError);
          }
        }
      } catch (e) {
        console.error('Error expanding product details:', e);
      }
    }

    if (subscriptionTier) {
      activePlanDetails = {
         id: subscriptionTier,
         name: planName || (subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1)),
         price: planPrice || 0,
         period: planPeriod || '',
         ...(planFeatures !== undefined ? { features: planFeatures } : {}),
      };
      
      console.log('--- FINAL PLAN DETAILS ---', activePlanDetails);
    }

    return NextResponse.json({
      isSubscribed: validSubscription,
      subscriptionTier,
      activePlanDetails,
      currentPeriodEnd,
      subscriptionStatus,
      stripeCustomerId,
      stripeSubscriptionId
    });
  } catch (error) {
    console.error('Error checking subscription:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}