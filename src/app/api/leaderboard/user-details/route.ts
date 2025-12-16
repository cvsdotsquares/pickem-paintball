import { db } from "@/src/lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";

interface PlayerPick {
  id: string;
  name: string;
  kills: number;
  cost: number;
  rank?: number | string;
}

interface UserDetails {
  totalPoints: number;
  mvp: string;
  picks: PlayerPick[];
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    const eventId = searchParams.get("eventId");

    if (!userId || !eventId) {
      return NextResponse.json(
        { error: "Missing userId or eventId" },
        { status: 400 }
      );
    }

    // Fetch user document
    const userDocRef = doc(db, "users", userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const userData = userDoc.data();
    const pickems = userData.pickems || {};
    const playerIds = Array.isArray(pickems[eventId]) ? pickems[eventId] : [];

    let totalPoints = 0;
    let mvp = { playerName: "None", kills: 0 };
    const picks: PlayerPick[] = [];

    // Fetch all player data for this user's picks
    for (const playerId of playerIds) {
      if (!playerId) continue;

      try {
        const playerPath = `events/${eventId}/players/${playerId}`;
        const playerRef = doc(db, playerPath);
        const playerDoc = await getDoc(playerRef);

        if (playerDoc.exists()) {
          const totalKills = playerDoc.get("Confirmed Kills") || 0;
          const playerName = playerDoc.get("Player") || "Unknown Player";
          const playerCost = playerDoc.get("Cost") || 0;
          const playerRank = playerDoc.get("Rank") ?? 0;

          totalPoints += totalKills;
          picks.push({
            id: playerId,
            name: playerName,
            kills: totalKills,
            cost: playerCost,
            rank: playerRank === undefined || playerRank === null ? 0 : playerRank,
          });

          if (totalKills > mvp.kills) {
            mvp = { playerName, kills: totalKills };
          }
        }
      } catch (error) {
        console.error(
          `Error fetching player data for ID: ${playerId}`,
          error
        );
      }
    }

    const userDetails: UserDetails = {
      totalPoints,
      mvp: mvp.playerName,
      picks,
    };

    return NextResponse.json(userDetails);
  } catch (error) {
    console.error("Error fetching user details:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
