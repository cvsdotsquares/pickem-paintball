"use client";

import { db } from "@/src/lib/firebaseClient";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MatchupTable } from "../../../components/Dashboard/datatable";
import { Player } from "../pick-em/page";
import { useAuth } from "@/src/contexts/authProvider";
import EventCountdownBanner from "@/src/components/Dashboard/EventCountdownBanner";
import { eventRecordToBannerModel, getBannerAccentFromRecord } from "@/src/lib/eventCountdownBannerModel";
import { DASHBOARD_BANNER_PICK_CTA_CLASS } from "@/src/components/Dashboard/dashboardEventBannerShared";
import { cn } from "@/src/lib/utils";
import {
  EVENT_LOCATION_SHORT_LABEL_BY_EVENT_ID as AGGREGATE_EVENT_COLUMN_BY_EVENT_ID,
  individualEventDisplayName,
} from "@/src/lib/eventDisplayName";

export interface Event {
  id: string;
  name: string;
  status: string;
  event_place: string;
  year?: string;
  lockDate?: any; // Firestore timestamp
  event_logo?: string; // Event logo URL
  brand_color?: string | null;
  startDate?: string;
  endDate?: string;
  venue?: string;
  city?: string;
  eventNumber?: string;
  eventEndsAt?: unknown;
  nextPicksOpenAt?: unknown;
  nextEventImage?: string;
  nextEventName?: string;
  next_event_id?: string;
  next_brand_color?: string | null;
  eventDate?: string;
  nextEventDate?: string;
  eventLocation?: string;
  nextEventLocation?: string;
}
// sort type definitions
interface SortConfig {
  key: string;
  direction: "ascending" | "descending";
}

/** Season aggregate player docs use these labels; live aggregation uses `event.name` */

/** Stats nav chips only — do not use this pattern elsewhere (banners use raw `event.name`). */
function statsEventNavLabel(event: Event): string {
  return individualEventDisplayName(event).toUpperCase();
}

/** Firestore Timestamp or Date; missing/unparseable → MAX (sort last when ascending). */
function getPickLockSeconds(ev: Event): number {
  const ld = ev.lockDate;
  if (ld == null) return Number.MAX_SAFE_INTEGER;
  if (typeof ld === "object" && ld !== null && "seconds" in ld && typeof (ld as { seconds: number }).seconds === "number") {
    return (ld as { seconds: number }).seconds;
  }
  if (ld instanceof Date) return Math.floor(ld.getTime() / 1000);
  return Number.MAX_SAFE_INTEGER;
}

/** Newest pick lock first; events without lock date sort last. */
function navPickLockDesc(a: Event, b: Event): number {
  const key = (ev: Event) => {
    const s = getPickLockSeconds(ev);
    return s === Number.MAX_SAFE_INTEGER ? Number.NEGATIVE_INFINITY : s;
  };
  return key(b) - key(a);
}

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
            event_logo: doc.get("event_logo") || null,
            brand_color: doc.get("brand_color") ?? null,
            startDate: doc.get("startDate") || "",
            endDate: doc.get("endDate") || "",
            venue: doc.get("venue") || "",
            city: doc.get("city") || "",
            eventNumber:
              doc.get("eventNumber") != null ? String(doc.get("eventNumber")) : undefined,
            eventEndsAt: doc.get("eventEndsAt") ?? undefined,
            nextPicksOpenAt: doc.get("nextPicksOpenAt") ?? undefined,
            nextEventImage: doc.get("nextEventImage") || undefined,
            nextEventName: doc.get("nextEventName") || undefined,
            next_event_id: doc.get("next_event_id") || undefined,
            next_brand_color: doc.get("next_brand_color") ?? undefined,
            eventDate: doc.get("eventDate") || undefined,
            nextEventDate: doc.get("nextEventDate") || undefined,
            eventLocation: doc.get("eventLocation") || doc.get("event_location") || undefined,
            nextEventLocation: doc.get("nextEventLocation") || doc.get("next_event_location") || undefined,
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
  const years = useMemo((): string[] => {
    const uniqueYears = new Set(
      eventsList
        .map((event) => event.year)
        .filter((y): y is string => typeof y === "string" && y !== "2024"),
    );
    return [
      "All",
      ...Array.from(uniqueYears).sort(
        (a, b) => parseInt(b ? b : "1") - parseInt(a ? a : "1"),
      ),
    ];
  }, [eventsList]);

  // Filter events by selected year, excluding 2024
  const filteredEvents = useMemo(() => {
    let filtered = selectedYear === "All" ? eventsList : eventsList.filter((event) => event.year === selectedYear);
    // Always exclude 2024 events regardless of selection
    return filtered.filter((event) => event.year !== "2024");
  }, [eventsList, selectedYear]);

  /**
   * Row 2: by calendar year (newest first), each block is `{year} OVERALL` then events for that year
   * ordered by pick lock date (most recent lock first). Single-year filter: same overall + lock-sorted events.
   */
  const eventNavSecondRow = useMemo(() => {
    const nonSeason = filteredEvents.filter((e) => e.status !== "season");

    if (selectedYear === "All") {
      const yearOptions = years.filter((y) => y !== "All");
      const byYear = new Map<string, Event[]>();
      for (const e of nonSeason) {
        const y = e.year ?? "Unknown";
        if (y === "2024") continue;
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y)!.push(e);
      }
      for (const arr of Array.from(byYear.values())) {
        arr.sort(navPickLockDesc);
      }

      const out: (
        | { kind: "season"; year: string; label: string }
        | { kind: "event"; event: Event }
      )[] = [];
      for (const y of yearOptions) {
        out.push({ kind: "season", year: y, label: `${y} OVERALL` });
        for (const ev of byYear.get(y) ?? []) {
          out.push({ kind: "event", event: ev });
        }
      }
      return out;
    }

    const evs = [...nonSeason].sort(navPickLockDesc);
    return [
      {
        kind: "season" as const,
        year: selectedYear,
        label: `${selectedYear} OVERALL`,
      },
      ...evs.map((e) => ({ kind: "event" as const, event: e })),
    ];
  }, [years, selectedYear, filteredEvents]);

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
            playerData["Tampa Bay"] = data.tampa_bay_open_2025?.confirmedKills || 0;
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

  /** Row 1: pick year — filters row 2; clears season view when year changes */
  const handleYearSelect = (year: string) => {
    setSelectedYear(year);
    setShowSeasonTable(false);
    setSelectedSeasonYear(null);
    if (year === "All") {
      const ev = eventsList.find((e) => e.status === "live") ?? eventsList[0] ?? null;
      setSelectedEvent(ev);
    } else {
      const first = eventsList.find(
        (e) => String(e.year) === String(year) && e.year !== "2024",
      );
      setSelectedEvent(first ?? null);
    }
  };

  /** Row 2: season totals for a year (Season Totals / `players/season_{year}`) — does not change row 1 year */
  const selectSeasonOverall = (year: string) => {
    if (showSeasonTable && selectedSeasonYear === year) return;
    setSelectedEvent(null);
    setShowSeasonTable(true);
    setSelectedSeasonYear(year);
  };

  const statsNavBtn =
    "shrink-0 whitespace-nowrap rounded-md border-2 border-transparent bg-white px-3 py-2 font-azonix text-[10px] font-bold uppercase tracking-wide text-neutral-900 shadow-sm transition hover:bg-neutral-50 active:scale-[0.98] dark:bg-stone-800 dark:text-white dark:hover:bg-stone-700 md:text-[11px]";
  const statsNavBtnActive = "!bg-pickem-green !text-neutral-900 border-pickem-green dark:!text-neutral-900";
  /** Matches dashboard `sectionRowHeadingClass` accent — season OVERALL row-2 buttons only */
  const statsNavOverallAccentBar =
    "inline-block h-[1em] w-[3px] shrink-0 self-center rounded-[1px] bg-[#00f976]";

  return (
    <div className="relative left-0 flex w-full flex-col scroll-smooth font-inter bg-white dark:bg-stone-950">
      <div>
        <section>
          {liveEvent ? (
            <EventCountdownBanner
              variant="dashboard"
              mobileBlackBarFullBleed
              event={eventRecordToBannerModel(
                liveEvent as unknown as Record<string, unknown> & { id: string },
              )}
              showBudget={false}
              desktopCta={
                <Link
                  href="/dashboard/pick-em"
                  className={DASHBOARD_BANNER_PICK_CTA_CLASS}
                  style={{
                    backgroundColor: getBannerAccentFromRecord(
                      liveEvent as unknown as Record<string, unknown> & { id: string },
                    ),
                  }}
                >
                  Pick your team &gt;
                </Link>
              }
            />
          ) : null}
          <section
            className="mx-auto mt-2 max-w-7xl px-4 md:px-6"
            aria-label="Statistics navigation"
          >
            <div className="rounded-xl bg-neutral-100/90 p-3 dark:bg-stone-900/90">
              <div
                className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="toolbar"
                aria-label="Filter by year"
              >
                {years.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => handleYearSelect(year)}
                    className={cn(statsNavBtn, selectedYear === year && statsNavBtnActive)}
                  >
                    {year === "All" ? "ALL" : year}
                  </button>
                ))}
              </div>
              <div
                className="mt-2 flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="toolbar"
                aria-label={
                  selectedYear === "All"
                    ? "Season totals and all events"
                    : `Events for ${selectedYear}`
                }
              >
                {eventNavSecondRow.map((item) => {
                  if (item.kind === "season") {
                    const seasonSelected =
                      showSeasonTable && selectedSeasonYear === item.year;
                    return (
                      <button
                        key={`season-${item.year}`}
                        type="button"
                        onClick={() => selectSeasonOverall(item.year)}
                        className={cn(
                          statsNavBtn,
                          "flex items-center gap-2",
                          seasonSelected && statsNavBtnActive,
                        )}
                      >
                        <span className={statsNavOverallAccentBar} aria-hidden />
                        {item.label}
                      </button>
                    );
                  }
                  const ev = item.event;
                  const eventSelected = selectedEvent?.id === ev.id && !showSeasonTable;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => handleEventSelect(ev)}
                      className={cn(statsNavBtn, eventSelected && statsNavBtnActive)}
                    >
                      {statsEventNavLabel(ev)}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </section>

        {/* Individual Event Table or Season Table */}
        <section className="mx-auto mt-2 max-w-7xl px-4 md:px-6 pb-0 md:mt-3">
          {showSeasonTable ? (
            <MatchupTable
              data={sortedRowData}
              sortConfig={sortConfig}
              onSortChange={handleSortChange}
              myPicks={livePicks}
              currentEventId={selectedEvent?.id}
              isSeasonView={true}
              seasonEventColumnOrder={seasonEventColumnOrder}
            />
          ) : (
            <MatchupTable
              data={sortedRowData}
              sortConfig={sortConfig}
              onSortChange={handleSortChange}
              myPicks={livePicks}
              currentEventId={selectedEvent?.id}
            />
          )}
        </section>
      </div>
    </div>
  );
}
