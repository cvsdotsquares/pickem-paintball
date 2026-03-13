import { db } from "@/src/lib/firebaseClient";
import { doc, getDoc, updateDoc, collection, getDocs, query, where } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";

// Basic security - verify token format and length
function verifyAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;

  const token = authHeader.replace('Bearer ', '');
  // Basic validation: token should be non-empty and reasonable length
  return token.length > 20;
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const isAuthenticated = verifyAuth(request);
    if (!isAuthenticated) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing token" },
        { status: 401 }
      );
    }

    let userId;
    try {
      const body = await request.json();
      userId = body.userId;
    } catch (parseError) {
      // Try getting from URL params as fallback
      userId = request.nextUrl.searchParams.get("userId");
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId parameter" },
        { status: 400 }
      );
    }

    // Note: In production, you should verify userId matches the authenticated user

    // Get user document
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

    if (Object.keys(pickems).length === 0) {
      return NextResponse.json(
        { error: "No pickems found for user" },
        { status: 400 }
      );
    }

    const data: Record<string, any> = {};
    const eventIds = Object.keys(pickems);

    if (eventIds.length === 0) {
      return NextResponse.json({ error: "No events found for user" }, { status: 400 });
    }

    // Process all events in parallel for speed
    const eventResults = await Promise.all(
      eventIds.map(async (eventId) => {
        const playerIds = Array.isArray(pickems[eventId]) ? pickems[eventId] : [];
        if (playerIds.length === 0) return null;

        // Get event status and users in parallel
        const [eventDoc, querySnapshot] = await Promise.all([
          getDoc(doc(db, "events", eventId)),
          getDocs(query(collection(db, "users"), where(`pickems.${eventId}`, "!=", null)))
        ]);

        const eventStatus = eventDoc.exists() ? eventDoc.get("status") || "unknown" : "unknown";

        const usersData = await Promise.all(
          querySnapshot.docs.map(async (userDoc) => {
            const userPickems = userDoc.get("pickems") || {};
            const userPlayerIds = Array.isArray(userPickems[eventId]) ? userPickems[eventId] : [];

            if (userPlayerIds.length === 0) return null;

            let totalPoints = 0;
            let mvp = { playerName: "None", kills: 0 };

            await Promise.all(
              userPlayerIds.map(async (playerId: string) => {
                if (!playerId) return;

                try {
                  const playerDoc = await getDoc(doc(db, `events/${eventId}/players/${playerId}`));
                  if (playerDoc.exists()) {
                    const totalKills = playerDoc.get("Confirmed Kills") || 0;
                    const playerName = playerDoc.get("Player") || "Unknown Player";

                    const isCaptain = playerId === (userPickems[`${eventId}_captain`] || null);
                    totalPoints += isCaptain ? totalKills * 1.25 : totalKills;
                    if (totalKills > mvp.kills) {
                      mvp = { playerName, kills: totalKills };
                    }
                  }
                } catch (error) {
                  console.error(`Error fetching player ${playerId}:`, error);
                }
              })
            );

            return { id: userDoc.id, totalPoints, mvp: mvp.playerName };
          })
        );

        const sortedUsers = usersData
          .filter((user) => user !== null)
          .sort((a, b) => b!.totalPoints - a!.totalPoints)
          .map((user, idx) => ({ ...user, rank: idx + 1 }));

        const currentUser = sortedUsers.find(user => user!.id === userId);

        return {
          eventId,
          data: {
            Rank: currentUser ? currentUser.rank.toString() : "N/A",
            MVP: currentUser ? currentUser.mvp : "None",
            PTS: currentUser ? currentUser.totalPoints.toString() : "0",
            Status: eventStatus
          }
        };
      })
    );

    // Build final data object
    eventResults.forEach(result => {
      if (result) {
        data[result.eventId] = result.data;
      }
    });

    // Create event-specific rank fields
    const rankFields: Record<string, number> = {};

    for (const [eventId, eventData] of Object.entries(data)) {
      const rankFieldName = `${eventId}Rank`;
      rankFields[rankFieldName] = parseInt(eventData.Rank) || 999999;
    }

    // Update user document with calculated pickem data and event-specific ranks
    await updateDoc(userDocRef, {
      pickemData: data,
      ...rankFields
    });

    return NextResponse.json({
      message: "Pickem data created and stored successfully",
      userId,
      eventsProcessed: Object.keys(data).length,
      data
    });

  } catch (error) {
    console.error("Error creating pickem data:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}