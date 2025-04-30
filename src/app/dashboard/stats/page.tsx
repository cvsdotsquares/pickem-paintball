"use client";

import { db } from "@/src/lib/firebaseClient";
import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import { MatchupTable } from "@/src/components/Dashboard/datatable";
import { ProgressiveBlur } from "@/src/components/ui/progressive-blur";
import { getDownloadURL, getStorage, listAll, ref } from "firebase/storage";
import { Player } from "../pick-em/page";

export interface Event {
  id: string;
  name: string;
  status: string;
}

export default function Statistics() {
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
        const events: Event[] = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.get("name") || "Unnamed Event",
          status: doc.get("status") || "archived",
        }));
        setEventsList(events);

        // Select the first live event by default, or fallback to the first event
        const defaultEvent =
          events.find((e) => e.status === "live") || events[0];
        if (defaultEvent) {
          setSelectedEvent(defaultEvent);
        }
      } catch (error: any) {
        console.error("Error fetching events:", error.message);
      }
    }
    fetchEvents();
  }, []);

  interface LogoCardProps {
    name: string;
    status: string;
    onClick: () => void;
    isSelected: boolean;
  }

  let backgroundIndex = 0; // Global counter to track the background index

  function EventCard({ name, status, onClick, isSelected }: LogoCardProps) {
    // Use the current index and update for the next call
    const backgroundSrc = `/background${backgroundIndex}.jpg`;
    backgroundIndex = (backgroundIndex + 1) % 3; // Cycle through 0, 1, 2

    return (
      <article
        onClick={onClick}
        className={`flex flex-col cursor-pointer flex-1 shrink ${
          isSelected ? "border-4 rounded-xl border-white" : ""
        } justify-center self-stretch my-auto basis-0 min-h-40 min-w-30 max-w-56`}
      >
        <div className="flex relative flex-col flex-1 justify-center items-center md:px-12 py-6 rounded-lg aspect-[2.177] size-full px-5">
          <img
            src={backgroundSrc}
            alt="Logo card background"
            className="object-cover absolute inset-0 size-full rounded-xl"
          />
          <div className="overflow-hidden relative  my-auto w-full ">
            <div className="flex overflow-visible flex-col justify-center m-auto items-center w-full">
              {name && (
                <div
                  className={`object-center text-center font-azonix md:text-xl text-base  text-white w-full`}
                >
                  {name}
                </div>
              )}
              {status && (
                <div
                  className={`object-center mx-auto text-center font-azonix text-xs font-medium ${
                    status === "live"
                      ? "text-red-500 text-base"
                      : "text-gray-300"
                  } w-full`}
                >
                  {status}
                </div>
              )}
            </div>
          </div>
        </div>
      </article>
    );
  }

  // Fetch player data based on the selected event
  useEffect(() => {
    async function fetchPlayers() {
      if (!selectedEvent) return;
      try {
        console.log("Fetching player data for event:", selectedEvent.id);
        const playersCollection = collection(
          db,
          `events/${selectedEvent.id}/players`
        );
        const querySnapshot = await getDocs(playersCollection);

        const players: any = querySnapshot.docs.map((doc) => {
          const { Cost, player_id, ...rest } = doc.data() as Record<
            string,
            any
          >; // Destructure to exclude "Cost"

          // Define sort order
          const sortOrder = [
            "Rank",
            "Player",
            "Number",
            "Team",
            "Confirmed Kills",
            "Gunfights",
            "Breakshooting",
            "Movement",
            "Zone Coverage",
            "Pressure",
            "Trades",
            "Unclassified",
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
    <div className="relative top-4 left-0 flex flex-col w-auto overflow-y-scroll pb-20 min-h-screen font-inter">
      <section>
        <header className="flex relative flex-col  items-start px-6 pt-32 w-full text-8xl leading-none text-white min-h-[250px] max-md:px-5 max-md:pt-24 max-md:max-w-full max-md:text-4xl">
          {/* <img
            src="/R.jpg"
            alt="Statistics Center Background"
            className="object-cover absolute inset-0 size-full"
          /> */}
          <div
            className="absolute inset-0  top-0 brightness-110"
            style={{
              backgroundImage: "url('/stats-center.JPG')",
              backgroundSize: "cover",
              backgroundPosition: "0 40%",
              backgroundRepeat: "no-repeat",
            }}
          />
          <div className="absolute inset-0  shadow-black shadow-[inset_0px_4px_50px_0px_]  pointer-events-none"></div>
          <ProgressiveBlur
            className="pointer-events-none absolute bottom-0 left-0 h-[50%] w-full"
            blurIntensity={1}
          />
          <div className="absolute inset-0  bg-black/45 pointer-events-none"></div>

          <h1 className="relative font-azonix max-w-full m-auto md:text-7xl text-4xl">
            Statistics Center
          </h1>
        </header>

        <div className="flex flex-row overflow-y-hidden overflow-x-auto gap-4 items-center p-3 mt-4 w-full max-md:px-5 max-md:max-w-full">
          {eventsList.map((event, index) => (
            <EventCard
              key={index}
              name={event.name}
              status={event.status}
              onClick={() => setSelectedEvent(event)}
              isSelected={selectedEvent?.id === event.id}
            />
          ))}
        </div>
      </section>

      <MatchupTable data={rowData} />

      {/* Pagination Controls */}
    </div>
  );
}
