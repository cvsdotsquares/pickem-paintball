import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

declare global {
  var subscriptionPlansCache: Record<string, { plans: any[], timestamp: number }>;
}

if (!global.subscriptionPlansCache) {
  global.subscriptionPlansCache = {};
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-revalidate-secret');

  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Clear all cached currencies
  for (const key in global.subscriptionPlansCache) {
    delete global.subscriptionPlansCache[key];
  }

  console.log('>>> Subscription plan cache cleared');
  return NextResponse.json({ success: true, message: 'Cache cleared. Next request will fetch fresh data from Stripe.' });
}
