import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/firebaseClient';
import { doc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ leagueId: string }> }
) {
  try {
    const { leagueId } = await context.params;

    if (!leagueId) {
      return NextResponse.json({ error: 'League ID is required' }, { status: 400 });
    }

    const leagueRef = doc(db, 'leagues', leagueId);
    const leagueDoc = await getDoc(leagueRef);
    
    if (!leagueDoc.exists()) {
      return NextResponse.json({ error: 'League not found' }, { status: 404 });
    }

    return NextResponse.json({ league: { id: leagueDoc.id, ...leagueDoc.data() } });
  } catch (error) {
    console.error('Error fetching league:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ leagueId: string }> }
) {
  try {
    const { leagueId } = await context.params;
    const body = await request.json();

    if (!leagueId) {
      return NextResponse.json({ error: 'League ID is required' }, { status: 400 });
    }
    const leagueRef = doc(db, 'leagues', leagueId);
    await updateDoc(leagueRef, body);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating league:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ leagueId: string }> }
) {
  try {
    const { leagueId } = await context.params;
    const { userId } = await request.json();

    if (!leagueId || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify user is admin
    const leagueRef = doc(db, 'leagues', leagueId);
    const leagueDoc = await getDoc(leagueRef);
    
    if (!leagueDoc.exists()) {
      return NextResponse.json({ error: 'League not found' }, { status: 404 });
    }

    const leagueData = leagueDoc.data();
    if (!leagueData.admins.includes(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Delete league
    await deleteDoc(leagueRef);

    // Remove league from all members' user documents
    const { arrayRemove } = await import('firebase/firestore');
    for (const memberId of leagueData.members) {
      const userRef = doc(db, 'users', memberId);
      await updateDoc(userRef, {
        leagues: arrayRemove(leagueId),
        adminLeagues: arrayRemove(leagueId)
      }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting league:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
