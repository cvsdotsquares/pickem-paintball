import { db } from "@/src/lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId parameter" },
        { status: 400 }
      );
    }

    const userDocRef = doc(db, "users", userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userDoc.data();
    const pickems = userData.pickems || {};
    
    if (Object.keys(pickems).length === 0) {
      return NextResponse.json({ error: "No pickems found" }, { status: 400 });
    }

    const data: Record<string, any> = {};

    for (const eventId of Object.keys(pickems)) {
      const playerIds = Array.isArray(pickems[eventId]) ? pickems[eventId] : [];
      if (playerIds.length === 0) continue;

      const eventDocRef = doc(db, "events", eventId);
      const eventDoc = await getDoc(eventDocRef);
      const eventStatus = eventDoc.exists() ? eventDoc.get("status") || "unknown" : "unknown";

      let totalPoints = 0;
      let mvp = { playerName: "None", kills: 0 };

      const playerPromises = playerIds.map(async (playerId: string) => {
        if (!playerId) return null;
        try {
          const playerRef = doc(db, `events/${eventId}/players/${playerId}`);
          const playerDoc = await getDoc(playerRef);
          if (playerDoc.exists()) {
            return {
              kills: playerDoc.get("Confirmed Kills") || 0,
              name: playerDoc.get("Player") || "Unknown Player"
            };
          }
        } catch (error) {
          return null;
        }
        return null;
      });

      const playerResults = await Promise.all(playerPromises);
      
      playerResults.forEach(result => {
        if (result) {
          totalPoints += result.kills;
          if (result.kills > mvp.kills) {
            mvp = { playerName: result.name, kills: result.kills };
          }
        }
      });

      data[eventId] = {
        Rank: "TBD",
        MVP: mvp.playerName,
        PTS: totalPoints.toString(),
        Status: eventStatus
      };
    }

    return NextResponse.json({
      message: "FAST - Pickem data calculated (no rank)",
      userId,
      eventsProcessed: Object.keys(data).length,
      wouldStore: data
    });

  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}