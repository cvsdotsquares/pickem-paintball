'use client';

import TableData from "@/src/components/Dashboard/table";
import Dropdown from "@/src/components/ui/dropdown";
import { db } from "@/src/lib/firebaseClient";
import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import { FaGreaterThan } from "react-icons/fa6";
import { RiArrowDropDownFill } from "react-icons/ri";

export interface Player {
  player_id: number;
  player: string;
  team: string;
  cost: number | string;
}

export interface Event {
  id: string;
  name: string;
  status: string;
}

export default function Dashboard() {
  const [rowData, setRowData] = useState<Player[]>([]);
  const [eventsList, setEventsList] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

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
        setEventsList(events);

        // Select the first live event by default, or fallback to the first event
        const defaultEvent = events.find(e => e.status === "live") || events[0];
        if (defaultEvent) {
          setSelectedEvent(defaultEvent);
        }
      } catch (error: any) {
        console.error("Error fetching events:", error.message);
      }
    }
    fetchEvents();
  }, []);

  // Fetch player data based on the selected event
  useEffect(() => {
    async function fetchPlayers() {
      if (!selectedEvent) return;
      try {
        console.log("Fetching player data for event:", selectedEvent.id);
        const playersCollection = collection(db, `events/${selectedEvent.id}/players`);
        const querySnapshot = await getDocs(playersCollection);

        const players: any = querySnapshot.docs.map(doc => {
          const { Cost, ...rest } = doc.data() as Record<string, any>;  // Destructure to exclude "Cost"

          // Define sort order
          const sortOrder = [
            "player_id",
            "Player",
            "Team",
            "Rank",
            "Player Number",
          ];

          // Sort the rest dynamically
          const sortedRest = Object.keys(rest)
            .sort((a, b) => {
              const indexA = sortOrder.indexOf(a);
              const indexB = sortOrder.indexOf(b);
              if (indexA === -1 && indexB === -1) return 0;
              if (indexA === -1) return 1;
              if (indexB === -1) return -1;
              return indexA - indexB;
            })
            .reduce((acc: Record<string, any>, key: string) => {
              acc[key] = rest[key];
              return acc;
            }, {});

          // Return sorted object
          return {
            player_id: doc.get("player_id"), // Ensure player_id comes first
            ...sortedRest,
          };
        });


        setRowData(players);
        console.log("Player data fetched successfully:", players);
      } catch (error: any) {
        console.error("Error fetching player data:", error.message);
      }
    }
    fetchPlayers();
  }, [selectedEvent]);

  // Handle event selection from the dropdown
  const handleEventSelect = (event: Event) => {
    setSelectedEvent(event);
  };

  return (
    <div className="flex flex-col p-4 min-h-screen bg-white">
      {/* Dropdown to select event */}
      <div className="dropdown flex flex-row items-center text-gray-600 gap-3 md:text-lg text-sm">
        <span className="font-medium">Events</span>
        <FaGreaterThan size={16} />
        <span>
          {selectedEvent?.name}{" "}
          <span
            className={
              selectedEvent?.status === "live" ? "text-green-600" : "text-red-600"
            }
          >
            ({selectedEvent?.status})
          </span>
        </span>
        <Dropdown
          placement="bottom-end"
          btnClassName="btn p-2 rounded-md border border-gray-300 shadow-sm hover:bg-gray-100 transition-colors duration-200 text-gray-800"
          button={<RiArrowDropDownFill size={16} className="opacity-80" />}
        >
          <ul className="min-w-[170px] bg-white border border-gray-200 rounded-md shadow-lg py-1">
            {eventsList.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => handleEventSelect(event)}
                  className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 transition-colors duration-200"
                >
                  {event.name}{" "}
                  <span
                    className={
                      event.status === "live" ? "text-green-600" : "text-red-600"
                    }
                  >
                    ({event.status})
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Dropdown>
      </div>

      {/* Table displaying player data for the selected event */}
      <div className="p-4 w-full text-center">
        <TableData
          heading={selectedEvent?.name || "No Event Selected"}
          data={rowData}
        />
      </div>
    </div>
  );

}
