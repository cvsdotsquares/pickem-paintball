import { NextRequest, NextResponse } from 'next/server';

export async function checkSubscriptionAccess(userId: string): Promise<boolean> {
  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${userId}`;
    
    const response = await fetch(firestoreUrl);
    if (!response.ok) return false;

    const data = await response.json();
    const fields = data.fields || {};
    
    const isSubscribed = fields.isSubscribed?.booleanValue || false;
    const currentPeriodEnd = fields.subscriptionCurrentPeriodEnd?.stringValue;
    
    // Grant access if subscribed OR within current billing period
    if (isSubscribed) return true;
    
    if (currentPeriodEnd) {
      const periodEnd = new Date(currentPeriodEnd);
      return new Date() < periodEnd;
    }
    
    return false;
  } catch (error) {
    console.error('Access check error:', error);
    return false;
  }
}

export async function subscriptionMiddleware(request: NextRequest, userId: string) {
  const hasAccess = await checkSubscriptionAccess(userId);
  
  if (!hasAccess) {
    return NextResponse.json({ error: 'Subscription required' }, { status: 403 });
  }
  
  return null;
}
