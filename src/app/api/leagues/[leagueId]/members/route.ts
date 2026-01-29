import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/lib/firebaseClient';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

export async function POST(request: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  try {
    const { action, userId } = await request.json();
    const { leagueId } = await params;

    const leagueRef = doc(db, 'leagues', leagueId);
    const userRef = doc(db, 'users', userId);

    if (action === 'approve') {
      await updateDoc(leagueRef, {
        members: arrayUnion(userId),
        pendingRequests: arrayRemove(userId)
      });
      await updateDoc(userRef, {
        leagues: arrayUnion(leagueId),
        leagueRequests: arrayRemove(leagueId)
      });
    } else if (action === 'reject') {
      await updateDoc(leagueRef, {
        pendingRequests: arrayRemove(userId)
      });
      await updateDoc(userRef, {
        leagueRequests: arrayRemove(leagueId)
      });
    } else if (action === 'remove') {
      await updateDoc(leagueRef, {
        members: arrayRemove(userId)
      });
      await updateDoc(userRef, {
        leagues: arrayRemove(leagueId)
      });
    } else if (action === 'makeAdmin') {
      await updateDoc(leagueRef, {
        admins: arrayUnion(userId)
      });
      await updateDoc(userRef, {
        adminLeagues: arrayUnion(leagueId)
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error managing league member:', error);
    return NextResponse.json({ error: 'Failed to manage member' }, { status: 500 });
  }
}