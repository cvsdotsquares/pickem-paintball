import { db } from '@/src/lib/firebaseClient';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { NextResponse } from 'next/server';

interface LeaderboardPick {
  id: string;
  name: string;
  kills: number;
  cost: number;
  rank: number | string;
}

interface LeaderboardUser {
  id: string;
  displayName: string;
  totalPoints: number;
  mvp: string;
  picks: LeaderboardPick[];
  rank?: number;
}

export const dynamic = 'force-dynamic';
export const revalidate = 300; // Cache for 5 minutes

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID required' }, { status: 400 });
    }

    const usersRef = collection(db, 'users');
    const usersQuery = query(usersRef, where(`pickems.${eventId}`, '!=', null));
    const usersSnapshot = await getDocs(usersQuery);

    if (usersSnapshot.empty) {
      return NextResponse.json(
        { users: [], cachedAt: new Date().toISOString() },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          },
        }
      );
    }

    const usersData = await Promise.all(
      usersSnapshot.docs.map(async (userDoc) => {
        const userData = userDoc.data() as Record<string, any>;
        const pickems = userData.pickems || {};
        const playerIds = Array.isArray(pickems[eventId]) ? pickems[eventId] : [];

        if (!Array.isArray(playerIds) || playerIds.length === 0) {
          return null;
        }

        let totalPoints = 0;
        let mvp = { playerName: 'None', kills: 0 };
        const picks: LeaderboardPick[] = [];

        await Promise.all(
          playerIds.map(async (playerId: string) => {
            if (!playerId) return;

            try {
              const playerPath = `events/${eventId}/players/${playerId}`;
              const playerRef = doc(db, playerPath);
              const playerDoc = await getDoc(playerRef);

              if (playerDoc.exists()) {
                const kills = playerDoc.get('Confirmed Kills') || 0;
                const name = playerDoc.get('Player') || 'Unknown Player';
                const cost = playerDoc.get('Cost') || 0;
                const rankValue = playerDoc.get('Rank');
                const rank =
                  rankValue === undefined || rankValue === null ? 0 : rankValue;

                totalPoints += kills;
                picks.push({ id: playerId, name, kills, cost, rank });

                if (kills > mvp.kills) {
                  mvp = { playerName: name, kills };
                }
              }
            } catch (error) {
              console.error(`Error fetching player ${playerId}:`, error);
            }
          })
        );

        return {
          id: userDoc.id,
          displayName: userData.name || userData.username || 'Unknown User',
          totalPoints,
          mvp: mvp.playerName,
          picks,
        } as LeaderboardUser;
      })
    );

    const sortedUsers = usersData
      .filter((user): user is LeaderboardUser => user !== null)
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((user, idx) => ({ ...user, rank: idx + 1 }));

    return NextResponse.json(
      { users: sortedUsers, cachedAt: new Date().toISOString() },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    console.error('Leaderboard API error:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
