import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/lib/firebaseClient';
import { doc, updateDoc, arrayUnion, arrayRemove, increment, getDoc } from 'firebase/firestore';

export async function POST(request: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  try {
    const { action, userId, adminId } = await request.json();
    const { leagueId } = await params;

    const leagueRef = doc(db, 'leagues', leagueId);
    const userRef = doc(db, 'users', userId);
    const leagueDoc = await getDoc(leagueRef);
    const leagueName = leagueDoc.data()?.name || 'League';
    const userDoc = await getDoc(userRef);
    const userName = userDoc.data()?.name || userDoc.data()?.username || 'User';

    if (action === 'approve') {
      await updateDoc(leagueRef, {
        members: arrayUnion(userId),
        pendingRequests: arrayRemove(userId),
        memberCount: increment(1)
      });
      await updateDoc(userRef, {
        leagues: arrayUnion(leagueId),
        leagueRequests: arrayRemove(leagueId)
      });
      
      // Notify admin who sent the invite (if adminId provided)
      if (adminId) {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: adminId,
            type: 'league_request_accepted',
            leagueId,
            leagueName,
            message: `${userName} accepted your invitation to join "${leagueName}"`
          })
        });
      }
    } else if (action === 'reject') {
      await updateDoc(leagueRef, {
        pendingRequests: arrayRemove(userId)
      });
      await updateDoc(userRef, {
        leagueRequests: arrayRemove(leagueId)
      });
      
      // Notify admin who sent the invite (if adminId provided)
      if (adminId) {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: adminId,
            type: 'league_request_declined',
            leagueId,
            leagueName,
            message: `${userName} declined your invitation to join "${leagueName}"`
          })
        });
      }
    } else if (action === 'remove') {
      await updateDoc(leagueRef, {
        members: arrayRemove(userId),
        memberCount: increment(-1)
      });
      await updateDoc(userRef, {
        leagues: arrayRemove(leagueId)
      });
      
      // Notify user they were removed
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          type: 'league_removed',
          leagueId,
          leagueName,
          message: `You have been removed from "${leagueName}"`
        })
      });
    } else if (action === 'makeAdmin') {
      await updateDoc(leagueRef, {
        admins: arrayUnion(userId)
      });
      await updateDoc(userRef, {
        adminLeagues: arrayUnion(leagueId)
      });
      
      // Notify user they were made admin
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          type: 'league_admin_granted',
          leagueId,
          leagueName,
          message: `You have been granted admin access to "${leagueName}"`
        })
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error managing league member:', error);
    return NextResponse.json({ error: 'Failed to manage member' }, { status: 500 });
  }
}