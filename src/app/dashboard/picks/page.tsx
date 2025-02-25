'use client';

import PickTableData from "@/src/components/Dashboard/pick-table";
import { db } from "@/src/lib/firebaseClient";
import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import { FaGreaterThan } from "react-icons/fa6";

export interface Player {
  player_id: number;
  player: string;
  team: string;
  rank: string;
  player_number: number;
  cost: number | string;
}

export interface Event {
  id: string;
  name: string;
  status: string;
}

export default function Pickems() {
  const [rowData, setRowData] = useState<any[]>([]);
  const [liveEvent, setLiveEvent] = useState<Event | null>(null);

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

        // Select the first live event by default, or fallback to the first
      } catch (error: any) {
        console.error("Error fetching events:", error.message);
      }
    }
    fetchEvents();
  }, []);

  // Fetch player data based on the selected event
  useEffect(() => {
    async function fetchPlayers() {
      if (!liveEvent) return;

      try {
        console.log("Fetching player data for event:", liveEvent.id);

        // Define sort order
        const sortOrder = [
          "player_id",
          "Player",
          "Team",
          "Player Number",
          // "Cost"
        ];

        // Reference to players collection
        const playersCollection = collection(db, `events/${liveEvent.id}/players`);

        // Fetch documents with only the fields in sortOrder
        const querySnapshot = await getDocs(playersCollection);

        // Extract and map players with only fields in sortOrder
        const players = querySnapshot.docs.map(doc => {
          const data = doc.data();
          const filteredData = sortOrder.reduce((acc: Record<string, any>, field) => {
            if (data[field] !== undefined) {
              acc[field] = data[field];
            }
            return acc;
          }, {});

          return {
            player_id: data["player_id"], // Always ensure player_id comes first
            ...filteredData,
          };
        });



        setRowData(players);
        console.log("Player data fetched successfully:", players);
      } catch (error: any) {
        console.error("Error fetching player data:", error.message);
      }
    }
    fetchPlayers();
  }, [liveEvent]);


  return (
    <div className="flex flex-col p-4 min-h-screen bg-white">
      {/* Dropdown to select event */}
      <div className="dropdown flex flex-row items-center text-gray-600 gap-3 text-lg">
        <span className="font-medium">Picks</span>
        {liveEvent ? (
          <>
            <FaGreaterThan size={16} />
            <span>
              {liveEvent.name}{" "}
              <span className="text-green-600">(live)</span>
            </span>
          </>
        ) : (
          <span className="text-gray-400">(No live event)</span>
        )}
      </div>

      {/* Table displaying player data for the selected event */}
      <div className="p-4 w-full text-center">
        <PickTableData
          heading={liveEvent?.name || "No Event Selected"}
          data={rowData}
        />
      </div>
    </div>
  );

}
