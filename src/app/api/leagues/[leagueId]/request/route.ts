import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/lib/firebaseClient';
import { doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';

export async function POST(request: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  try {
    const { userId } = await request.json();
    const { leagueId } = await params;

    const leagueRef = doc(db, 'leagues', leagueId);
    const userRef = doc(db, 'users', userId);
    const leagueDoc = await getDoc(leagueRef);
    const leagueData = leagueDoc.data();
    const userDoc = await getDoc(userRef);
    const userName = userDoc.data()?.name || userDoc.data()?.username || 'A user';

    await updateDoc(leagueRef, {
      pendingRequests: arrayUnion(userId)
    });
    await updateDoc(userRef, {
      leagueRequests: arrayUnion(leagueId)
    });

    // Notify all admins about the join request
    if (leagueData?.admins) {
      for (const adminId of leagueData.admins) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                       (request.headers.get('host') ? `https://${request.headers.get('host')}` : 'http://localhost:3000');
        
        await fetch(`${baseUrl}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: adminId,
            type: 'league_join_request',
            leagueId,
            leagueName: leagueData.name,
            requesterId: userId,
            requesterName: userName,
            message: `${userName} wants to join "${leagueData.name}"`
          })
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error requesting to join league:', error);
    return NextResponse.json({ error: 'Failed to request join' }, { status: 500 });
  }
}