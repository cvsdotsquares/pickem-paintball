import { db } from "@/src/lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";

// Basic security - verify token format and length
function verifyAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  
  const token = authHeader.replace('Bearer ', '');
  // Basic validation: token should be non-empty and reasonable length
  return token.length > 20;
}

const MAX_RETRIES = 2;
const RETRY_DELAY = 500;

async function fetchWithRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchWithRetry(fn, retries - 1);
    }
    throw error;
  }
}

interface PlayerPick {
  id: string;
  name: string;
  kills: number;
  cost: number;
  rank?: number | string;
  isCaptain?: boolean;
  points: number;
}

interface UserDetails {
  picks: PlayerPick[];
  totalPoints: number;
  captain: string | null;
}

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const isAuthenticated = verifyAuth(request);
    if (!isAuthenticated) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    const eventId = searchParams.get("eventId");

    if (!userId || !eventId) {
      return NextResponse.json(
        { error: "Missing userId or eventId" },
        { status: 400 }
      );
    }

    // Fetch user document with retry
    const userDocRef = doc(db, "users", userId);
    const userDoc = await fetchWithRetry(() => getDoc(userDocRef));

    if (!userDoc.exists()) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const userData = userDoc.data();
    const pickems = userData.pickems || {};
    const playerIds = Array.isArray(pickems[eventId]) ? pickems[eventId] : [];
    const captainId = pickems[`${eventId}_captain`] || null;

    const picks: PlayerPick[] = [];

    // Fetch all player data in parallel - match old logic exactly
    const playerPromises = playerIds.map(async (playerId: string | null) => {
      if (!playerId) return null;
      
      try {
        const playerPath = `events/${eventId}/players/${playerId}`;
        const playerRef = doc(db, playerPath);
        const playerDoc = await fetchWithRetry(() => getDoc(playerRef));

          if (playerDoc.exists()) {
            const totalKills = playerDoc.get("Confirmed Kills") || 0;
            const playerName = playerDoc.get("Player") || "Unknown Player";
            const playerCost = playerDoc.get("Cost") || 0;
            const playerRank = playerDoc.get("Rank") ?? 0;
            const isCaptain = playerId === captainId;
            const points = isCaptain ? totalKills * 1.5 : totalKills;

            return {
              id: playerId,
              name: playerName,
              kills: totalKills,
              cost: playerCost,
              rank: playerRank === undefined || playerRank === null ? 0 : playerRank,
              isCaptain,
              points,
            };
          }
        } catch (error) {
          console.error(`Error fetching player data for ID: ${playerId}`, error);
        }
        return null;
      });

    const playerResults = await Promise.allSettled(playerPromises);
    
    playerResults.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) {
        const pick = result.value;
        picks.push(pick);
      }
    });

    const totalPoints = picks.reduce((sum, pick) => sum + pick.points, 0);

    const userDetails: UserDetails = {
      picks,
      totalPoints,
      captain: captainId,
    };

    return NextResponse.json(userDetails, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error("Error fetching user details:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
