import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/lib/firebaseClient';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

// Generate random invite code (matches create route)
const generateInviteCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  try {
    const { userId } = await request.json();
    const { leagueId } = await params;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const leagueRef = doc(db, 'leagues', leagueId);
    const leagueSnap = await getDoc(leagueRef);

    if (!leagueSnap.exists()) {
      return NextResponse.json({ error: 'League not found' }, { status: 404 });
    }

    // Only league admins can reset the code
    const leagueData = leagueSnap.data();
    if (!leagueData.admins?.includes(userId)) {
      return NextResponse.json({ error: 'Only league admins can reset the invite code' }, { status: 403 });
    }

    const inviteCode = generateInviteCode();
    await updateDoc(leagueRef, { inviteCode });

    return NextResponse.json({ success: true, inviteCode });
  } catch (error) {
    console.error('Error regenerating invite code:', error);
    return NextResponse.json({ error: 'Failed to reset invite code' }, { status: 500 });
  }
}
