import { NextRequest, NextResponse } from 'next/server';
import { cachedPlansByCurrency } from '../plans/route';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-revalidate-secret');

  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Clear all cached currencies
  for (const key in cachedPlansByCurrency) {
    delete cachedPlansByCurrency[key];
  }

  console.log('>>> Subscription plan cache cleared');
  return NextResponse.json({ success: true, message: 'Cache cleared. Next request will fetch fresh data from Stripe.' });
}
