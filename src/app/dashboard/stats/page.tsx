"use client";

import { db } from "@/src/lib/firebaseClient";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useEffect, useMemo,  useState } from "react";
import { MatchupTable } from "@/src/components/Dashboard/datatable";
import { ProgressiveBlur } from "@/src/components/ui/progressive-blur";
import { motion } from "framer-motion";
import { Player } from "../pick-em/page";
import { useAuth } from "@/src/contexts/authProvider";

export interface Event {
  id: string;
  name: string;
  status: string;
  event_place: string;
  year?: string;
}
// sort type definitions
interface SortConfig {
  key: string;
  direction: "ascending" | "descending";
}

export default function Statistics() {
  const [rowData, setRowData] = useState<Player[]>([]);
  const [eventsList, setEventsList] = useState<Event[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("All");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [liveEvent, setLiveEvent] = useState<Event | null>(null);

  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [livePicks, setLivePicks] = useState<Set<string>>(new Set());


  const { user } = useAuth();
// Fetch events and set initial state
  useEffect(() => {
    async function fetchEvents() {
      try {
        const eventsCollection = collection(db, "events");
        const querySnapshot = await getDocs(eventsCollection);
        const events: Event[] = querySnapshot.docs.map((doc) => {
          const id = doc.id;
          // Extract year from ID (assuming format xy_z_YYYY) with proper type safety
          const yearFromId =
            id.split("_").pop() ?? new Date().getFullYear().toString();

          return {
            id,
            name: doc.get("name") || "Unnamed Event",
            status: doc.get("status") || "archived",
            event_place: doc.get("event_place") || "0",
            year: doc.get("year") || yearFromId,
          };
        });

        // Group events by year with type-safe year access
        const eventsByYear = events.reduce((acc, event) => {
          const year = event.year ?? "Unknown"; // Using nullish coalescing
          if (!acc[year]) {
            acc[year] = [];
          }
          acc[year].push(event);
          return acc;
        }, {} as Record<string, Event[]>);

        // Sort and flatten with proper type safety
        const sortedEvents = Object.entries(eventsByYear)
          .sort(([yearA], [yearB]) => {
            const numA = parseInt(yearA) || 0;
            const numB = parseInt(yearB) || 0;
            return numB - numA;
          })
          .flatMap(([_, yearEvents]) =>
            yearEvents.sort((a, b) => {
              const placeA = parseInt(a.event_place ?? "0") || 0;
              const placeB = parseInt(b.event_place ?? "0") || 0;
              return placeB - placeA;
            })
          );

        setEventsList(sortedEvents);
        setLiveEvent(
          sortedEvents.find((e) => e.status === "live") ?? sortedEvents[0]
        );

        // Set default selected event with null check
        const defaultEvent =
          sortedEvents.find((e) => e.status === "live") ?? sortedEvents[0];
        if (defaultEvent) {
          setSelectedEvent(defaultEvent);
          setSelectedYear(defaultEvent.year ?? "All");
        }
      } catch (error) {
        console.error("Error fetching events:", error);
      }
    }
    fetchEvents();
  }, []);
  useEffect(() => {
    const fetchLivePicks = async () => {
      if (!user || !liveEvent) {
        setLivePicks(new Set());
        return;
      }

      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists() && userSnap.data().pickems?.[liveEvent?.id]) {
          setLivePicks(new Set(userSnap.data().pickems[liveEvent.id]));
        } else {
          setLivePicks(new Set());
        }
      } catch (error) {
        console.error("Error fetching picks:", error);
        setLivePicks(new Set());
      }
    };

    fetchLivePicks();
  }, [user, selectedEvent]);

  // Get unique years for filter
  const years = useMemo(() => {
    const uniqueYears = new Set(eventsList.map((event) => event.year));
    return [
      "All",
      ...Array.from(uniqueYears).sort(
        (a, b) => parseInt(b ? b : "1") - parseInt(a ? a : "1")
      ),
    ];
  }, [eventsList]);

  // Filter events by selected year
  const filteredEvents = useMemo(() => {
    if (selectedYear === "All") return eventsList;
    return eventsList.filter((event) => event.year === selectedYear);
  }, [eventsList, selectedYear]);

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
        className={`relative flex flex-col cursor-pointer  md:w-[200px] shrink-0 grow-0 basis-auto md:h-[170px] w-[120px] h-[130px] ${
          isSelected ? "border-4 rounded-xl border-white" : ""
        }`}
      >
        <div className="relative flex flex-col justify-center items-center w-full h-full overflow-hidden rounded-lg">
          <img
            src={backgroundSrc}
            alt="Event card background"
            className="absolute inset-0 w-full h-full object-cover rounded-lg"
          />
          <div className="relative flex flex-col items-center justify-center p-4 text-white overflow-auto">
            {name && (
              <div
                className="text-center font-azonix"
                style={{
                  fontSize: "clamp(0.8rem, 2vw, 1.5rem)", // Dynamic font size
                  lineHeight: "1.2",
                  overflow: "hidden", // Ensures no horizontal overflow
                  textOverflow: "ellipsis",
                  whiteSpace: "wrap",
                }}
              >
                {name}
              </div>
            )}
            {status && (
              <div
                className={`text-center font-azonix ${
                  status === "live" ? "text-red-500" : "text-gray-300"
                }`}
                style={{
                  fontSize: "clamp(0.5rem, 1.5vw, 1rem)", // Scales based on viewport
                  lineHeight: "1.2",
                }}
              >
                {status}
              </div>
            )}
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

        let players: any = querySnapshot.docs.map((doc) => {
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
        // Apply sorting if sortConfig exists
        if (sortConfig) {
          players = [...players].sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];

            if (typeof aValue === "number" && typeof bValue === "number") {
              return sortConfig.direction === "ascending"
                ? aValue - bValue
                : bValue - aValue;
            }

            return sortConfig.direction === "ascending"
              ? String(aValue).localeCompare(String(bValue))
              : String(bValue).localeCompare(String(aValue));
          });
        }

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
    <div className="relative top-4 left-0 flex flex-col w-auto scroll-smooth overflow-y-scroll font-inter">
      <div>
        <section>
          <header className="flex relative flex-col items-start px-6 pt-32 w-full text-8xl leading-none text-white min-h-[250px] max-md:px-5 max-md:pt-24 max-md:max-w-full max-md:text-4xl">
            <div
              className="absolute inset-0 top-0 brightness-110"
              style={{
                backgroundImage: "url('/stats-center.JPG')",
                backgroundSize: "cover",
                backgroundPosition: "0 40%",
                backgroundRepeat: "no-repeat",
              }}
            />
            <div className="absolute inset-0 shadow-black shadow-[inset_0px_4px_50px_0px_] pointer-events-none"></div>
            <ProgressiveBlur
              className="pointer-events-none absolute bottom-0 left-0 h-[50%] w-full"
              blurIntensity={1}
            />
            <div className="absolute inset-0 bg-black/45 pointer-events-none"></div>

            <h1 className="relative font-azonix max-w-full m-auto md:text-7xl text-4xl">
              Statistics Center
            </h1>
          </header>

          {/* Year Filter */}
          <div className="flex justify-center px-4 mt-4">
            <div className="flex flex-wrap gap-2 justify-center">
              {years.map((year) => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year ? year : "")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    selectedYear === year
                      ? "bg-white text-black"
                      : "bg-gray-800 text-white"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>

          {/* Events Carousel */}
          <div className="flex flex-row overflow-x-auto gap-4 items-center p-4 w-full">
            {filteredEvents.map((event, index) => (
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

        {/* The table with animated sticky behavior */}
        <motion.section className="  flex flex-col items-center md:overflow-y-hidden justify-center ">
          <MatchupTable
            data={rowData}
            sortConfig={sortConfig}
            onSortChange={setSortConfig}
            myPicks={livePicks}
          />
        </motion.section>
      </div>
    </div>
  );
}
