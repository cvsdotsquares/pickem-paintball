'use client';

import { useState, useEffect } from "react";
import { db } from "@/src/lib/firebaseClient";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { Event } from "../page";
import { DataTable } from "mantine-datatable";
import { getAuth } from "firebase/auth";

interface User {
  id: string;
  displayName: string;
  totalPoints: number;
}

export default function Leaderboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [liveEvent, setLiveEvent] = useState<Event | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const PAGE_SIZES = [10, 50, 100];

  const auth = getAuth();
  const currentUserId = auth.currentUser?.uid;

  // Fetch all events from Firebase
  useEffect(() => {
    async function fetchEvents() {
      try {
        console.log("Fetching events list...");
        const eventsCollection = collection(db, "events");
        const querySnapshot = await getDocs(eventsCollection);
        const events: Event[] = querySnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.get("name") || "Unnamed Event",
          status: doc.get("status") || "archived",
        }));
        const activeEvent = events.find(e => e.status === "live");
        setLiveEvent(activeEvent || null);
      } catch (error: any) {
        console.error("Error fetching events:", error.message);
      }
    }
    fetchEvents();
  }, []);
  const formatCost = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };
  useEffect(() => {
    async function fetchLeaderboardData() {
      try {
        console.log("Fetching users for leaderboard...");

        // Step 1: Fetch all users from the "users" collection
        const usersCollection = collection(db, "users");
        const querySnapshot = await getDocs(usersCollection);

        console.log("Users fetched:", querySnapshot.docs.map((doc) => doc.id));

        const usersData = await Promise.all(
          querySnapshot.docs.map(async (userDoc) => {
            const userId = userDoc.id;
            const displayName = userDoc.get("name") || "Unknown User";

            console.log(`Processing user: ${userId}, name: ${displayName}`);

            // Access the pickems map and get the tampa_bay_2025 array
            const pickems = userDoc.get("pickems") || {};
            const playerIds = Array.isArray(pickems["tampa_bay_2025"])
              ? pickems["tampa_bay_2025"]
              : [];

            console.log(`Player IDs for user ${userId}:`, playerIds);

            let totalPoints = 0;
            let mvp = { playerName: "None", kills: 0 };
            let totalCost = 0;
            let budget = "";

            await Promise.allSettled(
              playerIds.map(async (playerId: string | null) => {
                if (!playerId) {
                  console.log("Invalid or missing player ID, skipping...");
                  return; // Skip invalid player IDs
                }

                try {
                  // Construct the document path dynamically
                  const playerPath = `events/tampa_bay_2025/players/${playerId}`;
                  const playerRef = doc(db, playerPath);
                  const playerDoc = await getDoc(playerRef);

                  if (playerDoc.exists()) {
                    // Fetch "Total Kills" for this player
                    const totalKills = playerDoc.get("Total Kills") || 0;
                    const playerName = playerDoc.get("Player") || "Unknown Player";
                    const playerCost = playerDoc.get("Cost") || 0;

                    console.log(`Player ID: ${playerId}, Total Kills: ${totalKills}`);
                    totalPoints += totalKills; // Add kills to total points
                    totalCost += playerCost;
                    totalCost = Math.round(totalCost);
                    budget = formatCost(totalCost);
                    // Update MVP if this player has more kills than the current MVP
                    if (totalKills > mvp.kills) {
                      mvp = { playerName, kills: totalKills };
                    }
                  } else {
                    console.log(`No data found for player at path: ${playerPath}`);
                  }
                } catch (error) {
                  console.error(`Error fetching player data for ID: ${playerId}`, error);
                }
              })
            );

            console.log(`Total points for user ${userId}: ${totalPoints}, MVP: ${mvp.playerName}, Budget used: ${totalCost}`);
            return { id: userId, displayName, totalPoints, totalCost, mvp: mvp.playerName, budget };
          })
        );

        // Step 3: Sort users by total points
        const sortedUsers = usersData.sort((a, b) => b.totalPoints - a.totalPoints);

        console.log("Sorted leaderboard data:", sortedUsers);
        setUsers(sortedUsers);
      } catch (error) {
        console.error("Error fetching leaderboard data:", (error as Error).message);
      } finally {
        setLoading(false);
        console.log("Leaderboard data fetching completed.");
      }
    }

    fetchLeaderboardData();
  }, []);


  if (loading) {
    return <p className="text-center mt-4">Loading leaderboard...</p>;
  }

  // Slice the users array for current page display
  const paginatedUsers = users.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="flex flex-col p-4 min-h-screen font-inter bg-white">
      <h1 className="text-2xl font-bold m-4 text-left">Leaderboard</h1>
      <div className="flex flex-row w-full justify-evenly m-auto">
        <div className=" w-full  p-4 m-4 bg-slate-200 rounded-lg overflow-hidden">
          {liveEvent ? (
            <span className="ml-3 ">
              {liveEvent.name}{" "}
              <span className="text-green-600">(live)</span>
            </span>
          ) : (
            <span className="text-gray-400">(No live event)</span>
          )}
          <div className="datatables m-2">
            <DataTable
              className="rounded-lg font-inter"
              records={paginatedUsers}
              columns={[
                {
                  accessor: "rank",
                  title: "Rank",
                  render: (record, index) => (page - 1) * pageSize + index + 1,
                },
                {
                  accessor: "displayName",
                  title: "Name",
                  render: (record) => (
                    <span
                      className={record.id === currentUserId ? "font-bold text-blue-500" : ""}
                    >
                      {record.displayName}
                    </span>
                  ),
                },
                { accessor: "totalPoints", title: "Points" },
                { accessor: "mvp", title: "MVP" },
                { accessor: "budget", title: "Budget Spent" },
              ]}
              totalRecords={users.length}
              recordsPerPage={pageSize}
              page={page}
              onPageChange={setPage}
              recordsPerPageOptions={PAGE_SIZES}
              onRecordsPerPageChange={(newPageSize: number) => {
                setPageSize(newPageSize);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
