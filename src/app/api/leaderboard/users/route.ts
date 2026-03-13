import { db } from '@/src/lib/firebaseClient';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin at runtime only
let adminInitialized = false;

function initializeFirebaseAdmin() {
  if (adminInitialized || getApps().length > 0) {
    return true;
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!privateKey || !clientEmail || !projectId) {
    return false;
  }

  try {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
    adminInitialized = true;
    return true;
  } catch {
    return false;
  }
}

interface LeaderboardUser {
  id: string;
  displayName: string;
  totalPoints: number;
  mvp: string;
  rank?: number;
  mvpPoints?: number;
}

export const dynamic = 'force-dynamic';
export const revalidate = 300; // Cache for 5 minutes

export async function GET(request: Request) {
  try {
    // Check authentication - support both user tokens and API key
    const authHeader = request.headers.get('Authorization');
    const apiKey = request.headers.get('X-API-Key');

    if (!authHeader && !apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify API key for server-to-server calls (Google Apps Script)
    if (apiKey) {
      if (apiKey !== process.env.API_SECRET_KEY) {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
      }
    } else {
      // Verify Firebase user token for client calls
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const token = authHeader.split('Bearer ')[1];
      try {
        if (!initializeFirebaseAdmin()) {
          return NextResponse.json({ error: 'Authentication service unavailable' }, { status: 503 });
        }
        await getAuth().verifyIdToken(token);
      } catch (authError) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
    }
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');
    const leagueId = searchParams.get('leagueId');

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID required' }, { status: 400 });
    }

    // If leagueId is provided, filter by league members
    let leagueMembers: string[] | null = null;
    if (leagueId) {
      const leagueRef = doc(db, 'leagues', leagueId);
      const leagueDoc = await getDoc(leagueRef);
      if (leagueDoc.exists()) {
        leagueMembers = leagueDoc.data().members || [];
      }
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
        let points = 0;
        let mvp = { playerName: 'None', kills: 0 };

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

                const isCaptain = playerId === (pickems[`${eventId}_captain`] || null);
                totalPoints += isCaptain ? kills * 1.25 : kills;

                if (kills > mvp.kills) {
                  mvp = { playerName: name, kills };
                  points = kills;
                }
              }
            } catch (error) {
              console.error(`Error fetching player data:`, {
                playerId: playerId?.replace(/[\r\n]/g, ''),
                eventId: eventId?.replace(/[\r\n]/g, ''),
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          })
        );

        return {
          id: userDoc.id,
          displayName: userData.name || userData.username || 'Unknown User',
          totalPoints,
          mvp: mvp.playerName,
          mvpPoints: points,
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
    const sanitizedError = error instanceof Error ? error.message.replace(/[\r\n]/g, '') : 'Unknown error';
    console.error('Leaderboard API error:', sanitizedError);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
