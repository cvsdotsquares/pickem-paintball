import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/firebaseClient';
import { collection, query, where, getDocs } from 'firebase/firestore';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const searchTerm = searchParams.get('q') || '';

    // Simple query to avoid composite index
    const leaguesQuery = query(
      collection(db, 'leagues'),
      where('isActive', '==', true)
    );

    const querySnapshot = await getDocs(leaguesQuery);
    let leagues = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];

    // Filter client-side for public leagues (searchable is optional)
    leagues = leagues.filter(league => 
      league.settings?.isPublic === true
    );

    // Filter by search term if provided
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      leagues = leagues.filter(league => 
        league.name?.toLowerCase().includes(searchLower) ||
        league.description?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by member count desc (fall back to createdAt desc as a tiebreaker) and limit to 20
    leagues.sort((a, b) => {
      const memberDiff = (b.memberCount ?? 0) - (a.memberCount ?? 0);
      if (memberDiff !== 0) return memberDiff;
      if (!a.createdAt || !b.createdAt) return 0;
      return b.createdAt.toMillis() - a.createdAt.toMillis();
    });
    leagues = leagues.slice(0, 20);

    return NextResponse.json({ leagues });

  } catch (error) {
    console.error('Error searching leagues:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}