"use client";

import { db } from "@/src/lib/firebaseClient";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { MatchupTable } from "../../../components/Dashboard/datatable";
import { ProgressiveBlur } from "@/src/components/ui/progressive-blur";
import { motion } from "framer-motion";
import { Player } from "../pick-em/page";
import { useAuth } from "@/src/contexts/authProvider";
import { useDashboardNestedScrollHandler } from "@/src/contexts/DashboardMainScrollContext";
import SeasonTotals from "@/src/components/Dashboard/SeasonTotals";

export interface Event {
  id: string;
  name: string;
  status: string;
  event_place: string;
  year?: string;
  lockDate?: any; // Firestore timestamp
  event_logo?: string; // Event logo URL
}
// sort type definitions
interface SortConfig {
  key: string;
  direction: "ascending" | "descending";
}

/** Season aggregate player docs use these labels; live aggregation uses `event.name` */
const AGGREGATE_EVENT_COLUMN_BY_EVENT_ID: Record<string, string> = {
  tampa_bay_2025: "Tampa Bay",
  world_cup_2025: "World Cup",
  lonestar_open_2025: "Lone Star",
  midwest_open_2025: "Mid West",
  atlantic_city_2025: "Atlantic City",
};

export default function Statistics() {
  const [rowData, setRowData] = useState<Player[]>([]);
  const [eventsList, setEventsList] = useState<Event[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("All");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [liveEvent, setLiveEvent] = useState<Event | null>(null);
  const [showSeasonTable, setShowSeasonTable] = useState<boolean>(false);
  const [selectedSeasonYear, setSelectedSeasonYear] = useState<string | null>(null);

  //const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: "Rank", direction: "ascending" });
  const [livePicks, setLivePicks] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(25);


  const { user } = useAuth();
  const reportStatsScroll = useDashboardNestedScrollHandler("dashboard-stats");
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
            lockDate: doc.get("lockDate") || null,
            event_logo: doc.get("event_logo") || null, // Include event logo
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

        // Sort and flatten with proper type safety, excluding 2024 events
        const sortedEvents = Object.entries(eventsByYear)
          .filter(([year]) => year !== "2024") // Filter out 2024 events completely
          .sort(([yearA], [yearB]) => {
            const numA = parseInt(yearA) || 0;
            const numB = parseInt(yearB) || 0;
            return numB - numA;
          })
          .flatMap(([_, yearEvents]) =>
            yearEvents.sort((a, b) => {
              const placeA = parseInt(a.event_place ?? "0") || 0;
              const placeB = parseInt(b.event_place ?? "0") || 0;
              if (placeB !== placeA) return placeB - placeA;
              // Then sort by lockDate (descending)
              if (a.lockDate && b.lockDate) {
                return b.lockDate.seconds - a.lockDate.seconds;
              }
              return 0;
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
      if (!user || !selectedEvent) {
        setLivePicks(new Set());
        return;
      }

      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists() && userSnap.data().pickems?.[selectedEvent.id]) {
          setLivePicks(new Set(userSnap.data().pickems[selectedEvent.id]));
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

  // Get unique years for filter, excluding 2024
  const years = useMemo(() => {
    const uniqueYears = new Set(eventsList.map((event) => event.year).filter(year => year !== "2024"));
    return [
      "All",
      ...Array.from(uniqueYears).sort(
        (a, b) => parseInt(b ? b : "1") - parseInt(a ? a : "1")
      ),
    ];
  }, [eventsList]);

  // Filter events by selected year, excluding 2024
  const filteredEvents = useMemo(() => {
    let filtered = selectedYear === "All" ? eventsList : eventsList.filter((event) => event.year === selectedYear);
    // Always exclude 2024 events regardless of selection
    return filtered.filter((event) => event.year !== "2024");
  }, [eventsList, selectedYear]);

  interface LogoCardProps {
    name: string;
    status: string;
    onClick: () => void;
    isSelected: boolean;
    event_logo?: string; // Add event logo prop
  }

  let backgroundIndex = 0; // Global counter to track the background index

  function EventCard({ name, status, onClick, isSelected, event_logo }: LogoCardProps) {
    // Use the current index and update for the next call
    const backgroundSrc = `/background${backgroundIndex}.jpg`;
    backgroundIndex = (backgroundIndex + 1) % 3; // Cycle through 0, 1, 2

    return (
      <article
        onClick={isSelected ? undefined : onClick}
        className={`relative flex flex-col md:w-[200px] shrink-0 grow-0 basis-auto md:h-[170px] w-[120px] h-[130px] transition-all duration-200 ${isSelected
          ? "border-4 rounded-xl border-blue-500 dark:border-white cursor-default opacity-80"
          : "cursor-pointer hover:scale-105"
          }`}
      >
        <div className="relative flex flex-col justify-center items-center w-full h-full overflow-hidden rounded-lg  logographics">
          {/* Use event_logo if available, otherwise fallback to background image */}
          {event_logo ? (
            <>
              {/* White background for PNG logos */}
              <div className="absolute inset-0 bg-white dark:bg-black rounded-lg"></div>
              <img
                src={event_logo}
                alt={`${name} logo`}
                className="absolute inset-0 w-full h-full object-scale-down rounded-lg"
              />
            </>
          ) : (
            <>
              <img
                src={backgroundSrc}
                alt="Event card background"
                className="absolute inset-0 w-full h-full object-cover rounded-lg"
              />
              {/* Only show text overlay when no event logo */}
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
                    className={`text-center font-azonix ${status === "live" ? "text-red-500" :
                      status === "season" ? "text-blue-400" : "text-gray-300"
                      }`}
                    style={{
                      fontSize: "clamp(0.5rem, 1.5vw, 1rem)", // Scales based on viewport
                      lineHeight: "1.2",
                    }}
                  >
                    {status === "season" ? "SEASON" : status}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </article>
    );
  }

  // Fetch season data when season table is shown
  useEffect(() => {
    async function fetchSeasonData() {
      if (!showSeasonTable) {
        return;
      }

      const yearToFetch =
        selectedYear === "All"
          ? selectedSeasonYear || eventsList.find((e) => e.year)?.year || "2025"
          : selectedYear;

      try {
        setRowData([]);

        const seasonPlayersQuery = collection(db, `players/season_${yearToFetch}/players`);
        const seasonSnapshot = await getDocs(seasonPlayersQuery);

        const mapAggregateDoc = (docSnap: { id: string; data: () => Record<string, unknown> }) => {
          const data = docSnap.data() as Record<string, any>;
          const playerData: Record<string, unknown> = {
            player_id: data.playerId || docSnap.id,
            Rank: data.seasonRank || 999,
            Player: data.playerName || "Unknown Player",
            Team: data.team || "Unknown Team",
            "Confirmed Kills": data.totalConfirmedKills || 0,
            Number: data.playerNumber || "",
            Gunfights: data.gunfights || 0,
            Breakshooting: data.breakshooting || 0,
            Movement: data.movement || 0,
            "Zone Coverage": data.zoneCoverage || 0,
            Pressure: data.pressure || 0,
            Trades: data.trades || 0,
            Unclassified: data.unclassified || 0,
            img_url: data.img_url || null,
            picture: data.img_url || "/placeholder.svg",
            pictureLoading: false,
          };

          if (yearToFetch === "2025") {
            playerData["World Cup"] = data.world_cup_2025?.confirmedKills || 0;
            playerData["Lone Star"] = data.lonestar_open_2025?.confirmedKills || 0;
            playerData["Mid West"] = data.midwest_open_2025?.confirmedKills || 0;
            playerData["Atlantic City"] = data.atlantic_city_2025?.confirmedKills || 0;
            playerData["Tampa Bay"] = data.tampa_bay_2025?.confirmedKills || 0;
          } else if (yearToFetch === "2024") {
            playerData["World Cup"] = data.world_cup_2024?.confirmedKills || 0;
            playerData["Lone Star"] = data.lonestar_open_2024?.confirmedKills || 0;
            playerData["Mid West"] = data.midwest_open_2024?.confirmedKills || 0;
            playerData["Atlantic City"] = data.atlantic_city_2024?.confirmedKills || 0;
            playerData["Tampa Bay"] = data.tampa_bay_2024?.confirmedKills || 0;
          }

          return playerData;
        };

        if (!seasonSnapshot.empty) {
          const seasonPlayers = seasonSnapshot.docs.map(mapAggregateDoc) as unknown as Player[];
          setRowData(seasonPlayers);
          setCurrentPage(1);
          return;
        }

        // No pre-aggregated season doc (e.g. 2026+) — build from events/{eventId}/players
        const eventsForYear = eventsList.filter(
          (e) => String(e.year) === String(yearToFetch) && e.status !== "season"
        );
        if (eventsForYear.length === 0) {
          setRowData([]);
          return;
        }

        const seasonPlayersMap = new Map<string, Record<string, unknown>>();

        for (const event of eventsForYear) {
          const evSnap = await getDocs(collection(db, `events/${event.id}/players`));
          evSnap.docs.forEach((playerDoc) => {
            const playerData = playerDoc.data();
            const playerId = playerDoc.id;
            const kills =
              Number(playerData["Confirmed Kills"] ?? playerData.confirmedKills ?? 0) || 0;

            if (!seasonPlayersMap.has(playerId)) {
              const imgUrl =
                playerData.images?.img_url ||
                playerData.img_url ||
                playerData.picture ||
                playerData.profilePicture ||
                "";
              seasonPlayersMap.set(playerId, {
                player_id: playerId,
                Rank: 999,
                Player: playerData.Player || "Unknown Player",
                Team: playerData.Team || "Unknown Team",
                Number: playerData.Number ?? "",
                "Confirmed Kills": 0,
                Gunfights: 0,
                Breakshooting: 0,
                Movement: 0,
                "Zone Coverage": 0,
                Pressure: 0,
                Trades: 0,
                Unclassified: 0,
                img_url: imgUrl || null,
                picture: imgUrl || "/placeholder.svg",
                pictureLoading: false,
              });
            }
            const row = seasonPlayersMap.get(playerId)!;
            row["Confirmed Kills"] = (Number(row["Confirmed Kills"]) || 0) + kills;
            row.Gunfights = (Number(row.Gunfights) || 0) + (Number(playerData.Gunfights) || 0);
            row.Breakshooting =
              (Number(row.Breakshooting) || 0) + (Number(playerData.Breakshooting) || 0);
            row.Movement = (Number(row.Movement) || 0) + (Number(playerData.Movement) || 0);
            row["Zone Coverage"] =
              (Number(row["Zone Coverage"]) || 0) +
              (Number(playerData["Zone Coverage"] ?? playerData.zoneCoverage) || 0);
            row.Pressure = (Number(row.Pressure) || 0) + (Number(playerData.Pressure) || 0);
            row.Trades = (Number(row.Trades) || 0) + (Number(playerData.Trades) || 0);
            row.Unclassified =
              (Number(row.Unclassified) || 0) + (Number(playerData.Unclassified) || 0);
            const label = event.name || event.id;
            row[label] = (Number(row[label]) || 0) + kills;
          });
        }

        const aggregated = Array.from(seasonPlayersMap.values()) as unknown as Player[];
        aggregated.sort(
          (a, b) =>
            (Number((b as any)["Confirmed Kills"]) || 0) -
            (Number((a as any)["Confirmed Kills"]) || 0)
        );
        aggregated.forEach((p, i) => {
          (p as any).Rank = i + 1;
        });

        setRowData(aggregated);
        setCurrentPage(1);
      } catch (error) {
        console.error("Error fetching season data:", error);
        setRowData([]);
      }
    }

    fetchSeasonData();
  }, [showSeasonTable, selectedSeasonYear, selectedYear, eventsList]);

  // Handle sorting separately to avoid infinite re-renders
  const sortedRowData = useMemo(() => {
    if (rowData.length > 0 && sortConfig) {
      return [...rowData].sort((a, b) => {
        const aValue = (a as any)[sortConfig.key];
        const bValue = (b as any)[sortConfig.key];

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
    return rowData;
  }, [rowData, sortConfig]);

  const seasonYearForView =
    selectedYear === "All" ? selectedSeasonYear : selectedYear;

  const eventsForSeasonView = useMemo(() => {
    if (!seasonYearForView) return [];
    return eventsList
      .filter(
        (e) =>
          String(e.year) === String(seasonYearForView) && e.status !== "season"
      )
      .sort((a, b) => {
        const sa = a.lockDate?.seconds ?? 0;
        const sb = b.lockDate?.seconds ?? 0;
        if (sb !== sa) return sb - sa;
        const pa = parseInt(a.event_place || "0", 10) || 0;
        const pb = parseInt(b.event_place || "0", 10) || 0;
        return pb - pa;
      });
  }, [eventsList, seasonYearForView]);

  /** Event columns left-to-right: most recent → oldest (then category stats in table) */
  const seasonEventColumnOrder = useMemo(() => {
    if (!showSeasonTable || sortedRowData.length === 0) return [];
    const row = sortedRowData[0] as unknown as Record<string, unknown>;
    const rowKeys = new Set(Object.keys(row));
    const ordered: string[] = [];
    for (const e of eventsForSeasonView) {
      if (rowKeys.has(e.name)) {
        ordered.push(e.name);
        continue;
      }
      const agg = AGGREGATE_EVENT_COLUMN_BY_EVENT_ID[e.id];
      if (agg && rowKeys.has(agg)) ordered.push(agg);
    }
    return ordered;
  }, [showSeasonTable, sortedRowData, eventsForSeasonView]);

  // Handle sort config changes — null means user completed the 3-click cycle, reset to default
  const handleSortChange = (newSortConfig: SortConfig | null) => {
    setSortConfig(newSortConfig ?? { key: "Rank", direction: "ascending" });
  };

  // Fetch player data based on the selected event
  useEffect(() => {
    async function fetchPlayers() {
      if (!selectedEvent || showSeasonTable) {
        return; // Don't clear data, let other useEffect handle it
      }

      try {
        // Clear existing data first
        setRowData([]);

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
            const aValue = (a as any)[sortConfig.key];
            const bValue = (b as any)[sortConfig.key];

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
        setCurrentPage(1);
      } catch (error: any) {
        console.error("Error fetching player data:", error.message);
      }
    }
    fetchPlayers();
  }, [selectedEvent, showSeasonTable]);

  // Handle event selection from the dropdown
  const handleEventSelect = (event: Event) => {
    // Don't allow selecting the same event again
    if (selectedEvent?.id === event.id && !showSeasonTable) {
      return;
    }
    setSelectedEvent(event);
    setShowSeasonTable(false);
    setRowData([]); // Clear existing data when switching to event
  };

  // Handle season card click
  const handleSeasonSelect = (year?: string) => {
    // Don't allow selecting the same season again
    if (showSeasonTable && selectedSeasonYear === year) {
      return;
    }
    setSelectedEvent(null);
    setShowSeasonTable(true);
    if (year) {
      setSelectedSeasonYear(year);
    } else {
      setSelectedSeasonYear(null);
    }
  };


  return (
    <div
      className="relative left-0 flex flex-col w-auto scroll-smooth overflow-y-scroll font-inter pb-20 bg-white dark:bg-stone-950"
      onScroll={reportStatsScroll}
    >
      <div>
        <section>
          <header className="flex relative flex-col items-start px-6 pt-32 w-full text-8xl leading-none text-white min-h-[250px] max-md:px-5 max-md:pt-24 max-md:max-w-full max-md:text-4xl">
            <div
              className="absolute inset-0 top-0 brightness-110"
              style={{
                backgroundImage: "url('/stats-center.webp')",
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

            <div className="relative z-[1] mx-auto flex w-full max-w-4xl flex-col items-center text-center px-4">
              <h1 className="font-azonix text-4xl text-white md:text-7xl">
                Statistics Center
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/85 md:text-base">
                Browse event and season leaderboards, compare player stats, and see how the field stacks up across the year.
              </p>
            </div>
          </header>

          {/* Year Filter */}
          <section
            className="mx-auto mt-6 max-w-4xl px-4"
            aria-labelledby="stats-year-heading"
          >
            <h2
              id="stats-year-heading"
              className="font-azonix text-center text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 dark:text-white/45"
            >
              Season filter
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-sm leading-relaxed text-gray-600 dark:text-white/55">
              Choose a year to narrow events, or keep <span className="font-semibold text-gray-800 dark:text-white/80">All</span> to see every season card.
            </p>
            <div className="mt-4 flex justify-center">
              <div className="flex flex-wrap justify-center gap-2">
              {years.map((year) => (
                <button
                  key={year}
                  onClick={() => {
                    setSelectedYear(year ? year : "");
                    // Don't clear selected event when changing year filter
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${selectedYear === year
                    ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                    : "bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white"
                    }`}
                >
                  {year}
                </button>
              ))}
              </div>
            </div>
          </section>

          {/* Main Content Area */}
          <div className="mt-8 flex flex-col gap-6 px-4 xl:flex-row">
            {/* Right Side - Events Carousel */}
            <div className="w-full">
              {/* Events Carousel */}
              <div className="rounded-xl bg-gray-100/90 p-4 backdrop-blur-sm dark:bg-gray-900/90">
                <h3 className="font-azonix text-lg font-bold text-gray-900 dark:text-white">
                  Select event
                </h3>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-600 dark:text-white/55">
                  Tap a season tile for combined rankings, or an individual event for full player breakdowns and categories.
                </p>
                <div className="mt-4 flex flex-row items-center gap-4 overflow-x-auto">
                  {/* Season Card - Show only for specific years, not "All" */}
                  {selectedYear !== "All" && (
                    <EventCard
                      key="season"
                      name={`Season ${selectedYear}`}
                      status="season"
                      onClick={() => handleSeasonSelect(selectedYear)}
                      isSelected={showSeasonTable}
                      event_logo={undefined}
                    />
                  )}
                  {/* Show season cards for all available years when "All" is selected */}
                  {selectedYear === "All" && years.filter(year => year !== "All").map((year) => (
                    <EventCard
                      key={`season-${year}`}
                      name={`Season ${year}`}
                      status="season"
                      onClick={() => handleSeasonSelect(year)}
                      isSelected={showSeasonTable && selectedSeasonYear === year}
                      event_logo={undefined}
                    />
                  ))}
                  {filteredEvents.map((event, index) => (
                    <EventCard
                      key={index}
                      name={event.name}
                      status={event.status}
                      onClick={() => handleEventSelect(event)}
                      isSelected={selectedEvent?.id === event.id && !showSeasonTable}
                      event_logo={event.event_logo}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Individual Event Table or Season Table */}
        <motion.section className="mt-8 px-4 pb-16">
          {showSeasonTable ? (
            // Season Table
            <>
              <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  <h3 className="font-azonix text-lg font-bold text-gray-900 dark:text-white md:text-xl">
                    Season{" "}
                    {selectedYear === "All"
                      ? selectedSeasonYear || "2025"
                      : selectedYear}{" "}
                    — player rankings
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-white/55">
                    Totals and per-event columns for everyone in this season. Sort any column to re-rank the table.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-blue-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white md:text-sm">
                  Season totals
                </span>
              </div>
              <MatchupTable
                data={sortedRowData}
                sortConfig={sortConfig}
                onSortChange={handleSortChange}
                myPicks={livePicks}
                currentEventId={selectedEvent?.id}
                isSeasonView={true}
                seasonEventColumnOrder={seasonEventColumnOrder}
              />
            </>
          ) : (
            // Individual Event Table
            <>
              <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  <h3 className="font-azonix text-lg font-bold text-gray-900 dark:text-white md:text-xl">
                    {selectedEvent?.name || "Select an event"} — player stats
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-white/55">
                    {selectedEvent
                      ? "Confirmed kills, category grades, and rankings for this event. Use the row above to switch events or open a season view."
                      : "Pick an event card above to load the full stat table for that tournament."}
                  </p>
                </div>
                {selectedEvent?.status === "live" && (
                  <span className="shrink-0 animate-pulse rounded-full bg-red-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white md:text-sm">
                    Live
                  </span>
                )}
              </div>
              <MatchupTable
                data={sortedRowData}
                sortConfig={sortConfig}
                onSortChange={handleSortChange}
                myPicks={livePicks}
                currentEventId={selectedEvent?.id}
              />
            </>
          )}
        </motion.section>
      </div>
    </div>
  );
}
