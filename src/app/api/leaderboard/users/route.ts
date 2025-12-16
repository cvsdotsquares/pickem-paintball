import { NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin (only once)
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.error('Firebase admin initialization error:', error);
  }
}

const db = getFirestore();

export const dynamic = 'force-dynamic';
export const revalidate = 300; // Cache for 5 minutes

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID required' }, { status: 400 });
    }

    // Fetch users with picks for this event
    const usersSnapshot = await db.collection('users')
      .where(`pickems.${eventId}`, '!=', null)
      .get();

    if (usersSnapshot.empty) {
      return NextResponse.json({ users: [] });
    }

    // Fetch player details and calculate points
    const usersData = await Promise.all(
      usersSnapshot.docs.map(async (userDoc) => {
        const userData = userDoc.data();
        const playerIds = userData.pickems?.[eventId] || [];

        if (!Array.isArray(playerIds) || playerIds.length === 0) {
          return null;
        }

        let totalPoints = 0;
        let mvp = { playerName: 'None', kills: 0 };
        const picks: any[] = [];

        // Fetch player details in parallel
        await Promise.all(
          playerIds.map(async (playerId: string) => {
            if (!playerId) return;

            try {
              const playerDoc = await db
                .collection('events')
                .doc(eventId)
                .collection('players')
                .doc(playerId)
                .get();

              if (playerDoc.exists) {
                const playerData = playerDoc.data();
                const kills = playerData?.['Confirmed Kills'] || 0;
                const name = playerData?.Player || 'Unknown Player';
                const cost = playerData?.Cost || 0;
                const rank = playerData?.Rank ?? 0;

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
          // Add any other fields needed for the datatable here
        };
      })
    );

    // Filter nulls and sort by points
    const sortedUsers = usersData
      .filter((user) => user !== null)
      .sort((a, b) => b!.totalPoints - a!.totalPoints)
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
