import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/lib/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';

export async function GET(
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) {
  try {
    const { leagueId } = params;

    if (!leagueId) {
      return NextResponse.json({ error: 'League ID is required' }, { status: 400 });
    }

    // Get league document
    const leagueRef = doc(db, 'leagues', leagueId);
    const leagueDoc = await getDoc(leagueRef);

    if (!leagueDoc.exists()) {
      return NextResponse.json({ error: 'League not found' }, { status: 404 });
    }

    const leagueData = {
      id: leagueDoc.id,
      ...leagueDoc.data()
    };

    return NextResponse.json(leagueData);

  } catch (error) {
    console.error('Error fetching league:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}