import { NextRequest, NextResponse } from 'next/server';

const PLANS = {
  US: {
    currency: 'USD',
    symbol: '$',
    plans: [
      {
        id: 'monthly',
        name: 'Monthly',
        price: '$4.99',
        period: '/month',
        popular: true,
        savings: null,
        features: [
          'Custom Leagues',
          'Advanced Statistics',
          'Priority Support',
          'Early Access to Features'
        ]
      },
      {
        id: 'quarterly',
        name: 'Quarterly',
        price: '$12.99',
        period: '/3 months',
        popular: false,
        savings: 'Save 13%',
        features: [
          'Custom Leagues',
          'Advanced Statistics',
          'Priority Support',
          'Early Access to Features'
        ]
      },
      {
        id: 'yearly',
        name: 'Yearly',
        price: '$49.99',
        period: '/year',
        popular: false,
        savings: 'Save 17%',
        features: [
          'Custom Leagues',
          'Advanced Statistics',
          'Priority Support',
          'Early Access to Features'
        ]
      }
    ]
  },
  UK: {
    currency: 'GBP',
    symbol: '£',
    plans: [
      {
        id: 'monthly',
        name: 'Monthly',
        price: '£3.99',
        period: '/month',
        popular: true,
        savings: null,
        features: [
          'Custom Leagues',
          'Advanced Statistics',
          'Priority Support',
          'Early Access to Features'
        ]
      },
      {
        id: 'quarterly',
        name: 'Quarterly',
        price: '£10.99',
        period: '/3 months',
        popular: false,
        savings: 'Save 8%',
        features: [
          'Custom Leagues',
          'Advanced Statistics',
          'Priority Support',
          'Early Access to Features'
        ]
      },
      {
        id: 'yearly',
        name: 'Yearly',
        price: '£39.99',
        period: '/year',
        popular: false,
        savings: 'Save 17%',
        features: [
          'Custom Leagues',
          'Advanced Statistics',
          'Priority Support',
          'Early Access to Features'
        ]
      }
    ]
  },
  EU: {
    currency: 'EUR',
    symbol: '€',
    plans: [
      {
        id: 'monthly',
        name: 'Monthly',
        price: '€4.49',
        period: '/month',
        popular: true,
        savings: null,
        features: [
          'Custom Leagues',
          'Advanced Statistics',
          'Priority Support',
          'Early Access to Features'
        ]
      },
      {
        id: 'quarterly',
        name: 'Quarterly',
        price: '€11.99',
        period: '/3 months',
        popular: false,
        savings: 'Save 11%',
        features: [
          'Custom Leagues',
          'Advanced Statistics',
          'Priority Support',
          'Early Access to Features'
        ]
      },
      {
        id: 'yearly',
        name: 'Yearly',
        price: '€44.99',
        period: '/year',
        popular: false,
        savings: 'Save 16%',
        features: [
          'Custom Leagues',
          'Advanced Statistics',
          'Priority Support',
          'Early Access to Features'
        ]
      }
    ]
  }
};

// EU countries that use EUR
const EU_COUNTRIES = [
  'AT', 'BE', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES'
];

function getRegionFromCountry(countryCode: string): 'US' | 'UK' | 'EU' {
  if (countryCode === 'GB') return 'UK';
  if (EU_COUNTRIES.includes(countryCode)) return 'EU';
  return 'US'; // Default to US pricing
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testRegion = searchParams.get('region'); // For testing: ?region=UK or ?region=EU
    
    // Get country from headers (Vercel provides this)
    let country = request.headers.get('x-vercel-ip-country') || 
                  request.headers.get('cf-ipcountry') || 
                  'US';
    
    // Override for testing
    if (testRegion && ['US', 'UK', 'EU'].includes(testRegion)) {
      country = testRegion === 'UK' ? 'GB' : testRegion === 'EU' ? 'DE' : 'US';
    }
    
    console.log('Regional pricing debug:', {
      country,
      testRegion,
      headers: {
        'x-vercel-ip-country': request.headers.get('x-vercel-ip-country'),
        'cf-ipcountry': request.headers.get('cf-ipcountry')
      }
    });
    
    const region = getRegionFromCountry(country);
    const regionPlans = PLANS[region];

    return NextResponse.json({
      region,
      country,
      currency: regionPlans.currency,
      symbol: regionPlans.symbol,
      plans: regionPlans.plans
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    // Fallback to US pricing
    return NextResponse.json({
      region: 'US',
      country: 'US',
      currency: 'USD',
      symbol: '$',
      plans: PLANS.US.plans
    });
  }
}