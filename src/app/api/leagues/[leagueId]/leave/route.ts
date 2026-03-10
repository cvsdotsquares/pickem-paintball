import { db } from '@/src/lib/firebaseClient';
import { doc, getDoc, updateDoc, arrayRemove } from 'firebase/firestore';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  try {
    const { leagueId } = await params;
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const leagueRef = doc(db, 'leagues', leagueId);
    const leagueDoc = await getDoc(leagueRef);

    if (!leagueDoc.exists()) {
      return NextResponse.json({ error: 'League not found' }, { status: 404 });
    }

    const leagueData = leagueDoc.data();

    // Don't allow last admin to leave
    if (leagueData.admins?.includes(userId) && leagueData.admins.length === 1) {
      return NextResponse.json({ error: 'Cannot leave - you are the only admin. Transfer admin rights first.' }, { status: 400 });
    }

    // Remove user from members and admins
    await updateDoc(leagueRef, {
      members: arrayRemove(userId),
      admins: arrayRemove(userId),
      memberCount: (leagueData.memberCount || 1) - 1
    });

    // Update user's leagues array
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      leagues: arrayRemove(leagueId)
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error leaving league:', error);
    return NextResponse.json({ error: 'Failed to leave league' }, { status: 500 });
  }
}
