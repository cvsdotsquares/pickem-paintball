import { db } from '@/src/lib/firebaseClient';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  try {
    const { leagueId } = await params;
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

    // Build new admins array
    let newAdmins = [...leagueData.admins];
    if (!newAdmins.includes(toUserId)) {
      newAdmins.push(toUserId);
    }
    if (removeOldAdmin) {
      newAdmins = newAdmins.filter(id => id !== fromUserId);
    }

    await updateDoc(leagueRef, { admins: newAdmins });

    // Update user documents
    const toUserRef = doc(db, 'users', toUserId);
    await updateDoc(toUserRef, {
      adminLeagues: arrayUnion(leagueId)
    });

    if (removeOldAdmin) {
      const fromUserRef = doc(db, 'users', fromUserId);
      await updateDoc(fromUserRef, {
        adminLeagues: arrayRemove(leagueId)
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error transferring admin:', error);
    return NextResponse.json({ error: 'Failed to transfer admin' }, { status: 500 });
  }
}
