import { db } from '@/src/lib/firebaseClient';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest, { params }: { params: { leagueId: string } }) {
  try {
    const { leagueId } = params;
    const { fromUserId, toUserId, removeOldAdmin } = await request.json();

    if (!fromUserId || !toUserId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const leagueRef = doc(db, 'leagues', leagueId);
    const leagueDoc = await getDoc(leagueRef);

    if (!leagueDoc.exists()) {
      return NextResponse.json({ error: 'League not found' }, { status: 404 });
    }

    const leagueData = leagueDoc.data();

    // Verify fromUser is admin
    if (!leagueData.admins?.includes(fromUserId)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Verify toUser is member
    if (!leagueData.members?.includes(toUserId)) {
      return NextResponse.json({ error: 'Target user is not a member' }, { status: 400 });
    }

    // Add new admin
    const updates: any = {
      admins: arrayUnion(toUserId)
    };

    // Optionally remove old admin
    if (removeOldAdmin) {
      updates.admins = arrayRemove(fromUserId);
    }

    await updateDoc(leagueRef, updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error transferring admin:', error);
    return NextResponse.json({ error: 'Failed to transfer admin' }, { status: 500 });
  }
}
