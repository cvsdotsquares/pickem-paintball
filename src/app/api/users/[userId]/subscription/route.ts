import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/lib/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';

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
    const isSubscribed = userData.isSubscribed || false;
    const subscriptionStatus = userData.subscriptionStatus || null;
    const subscriptionTier = userData.subscriptionTier || null;
    const currentPeriodEnd = userData.subscriptionCurrentPeriodEnd || null;

    // Check if subscription is still valid
    let validSubscription = isSubscribed;
    
    // If subscription status is 'active', consider it valid regardless of period end
    if (subscriptionStatus === 'active') {
      validSubscription = true;
    } else if (currentPeriodEnd) {
      const periodEnd = new Date(currentPeriodEnd);
      validSubscription = isSubscribed && new Date() < periodEnd;
    }

    return NextResponse.json({
      isSubscribed: validSubscription,
      subscriptionTier,
      currentPeriodEnd,
      subscriptionStatus
    });
  } catch (error) {
    console.error('Error checking subscription:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}