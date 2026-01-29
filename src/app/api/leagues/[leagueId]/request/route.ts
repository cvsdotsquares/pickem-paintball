import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/lib/firebaseClient';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';

export async function POST(request: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  try {
    const { userId } = await request.json();
    const { leagueId } = await params;

    const leagueRef = doc(db, 'leagues', leagueId);
    const userRef = doc(db, 'users', userId);

    await updateDoc(leagueRef, {
      pendingRequests: arrayUnion(userId)
    });
    await updateDoc(userRef, {
      leagueRequests: arrayUnion(leagueId)
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error requesting to join league:', error);
    return NextResponse.json({ error: 'Failed to request join' }, { status: 500 });
  }
}