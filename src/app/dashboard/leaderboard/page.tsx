"use client";

import { useState, useEffect, useRef, Fragment, useMemo, useCallback } from "react";
import { db } from "@/src/lib/firebaseClient";
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
  QueryConstraint,
} from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  FaAngleLeft,
  FaAngleRight,
  FaChevronDown,
  FaChevronUp,
  FaUser,
  FaSearch,
  FaTimes,
  FaTrophy,
} from "react-icons/fa";
import { getAuth } from "firebase/auth";
import { LeaderboardSkeleton } from "@/src/components/LoadingSkeleton";
import { ErrorBoundaryWrapper } from "@/src/components/ErrorBoundaryWrapper";
import {
  invalidateProfilePictureCacheEntry,
  resolveProfilePictureToUrl,
  subscribeProfileImagesRefresh,
} from "@/src/lib/resolveProfilePictureUrl";

/** Same default as dashboard top bar / profile when no photo. */
const LEADERBOARD_DEFAULT_AVATAR_URL =
  "https://cdn-icons-png.freepik.com/256/14024/14024658.png?semt=ais_hybrid";
import { cn } from "@/src/lib/utils";
import { individualEventDisplayName } from "@/src/lib/eventDisplayName";
import EventCountdownBanner from "@/src/components/Dashboard/EventCountdownBanner";
import { eventRecordToBannerModel } from "@/src/lib/eventCountdownBannerModel";
import { DASHBOARD_BANNER_PICK_CTA_CLASS } from "@/src/components/Dashboard/dashboardEventBannerShared";
import LeagueSelector from "../../../components/Leagues/LeagueSelector";
import CreateLeagueModal from "../../../components/Leagues/CreateLeagueModal";
import JoinLeagueModal from "../../../components/Leagues/JoinLeagueModal";
import { useLeague } from "../../../contexts/LeagueContext";

interface LiveEvent {
  id: string;
  name: string;
  status?: string;
  event_place?: string;
  year?: string;
  lockDate?: any;
  event_logo?: string;
  brand_color?: string | null;
  startDate?: string;
  endDate?: string;
  venue?: string;
  city?: string;
  eventNumber?: string;
  points?: number;
  mvp?: string;
}

interface User {
  id: string;
  displayName: string;
  profilePicture?: string;
  isSubscribed?: boolean;
  pickemData?: Record<string, {
    Rank: string;
    MVP: string;
    PTS: string;
    Status: string;
  }>;
  [key: string]: any; // Allow dynamic event fields like world_cup_2025Rank
}

interface PlayerPick {
  id: string;
  name: string;
  kills: number;
  cost: number;
  rank?: number | string;
  isCaptain?: boolean;
  points: number;
}

interface UserDetails {
  picks: PlayerPick[];
  totalPoints: number;
  captain: string | null;
}

/** Same labels as stats page event nav (Location - YY, uppercase). */
function leaderboardNavLabel(event: LiveEvent): string {
  return individualEventDisplayName(event).toUpperCase();
}

function getPickLockSeconds(ev: LiveEvent): number {
  const ld = ev.lockDate;
  if (ld == null) return Number.MAX_SAFE_INTEGER;
  if (
    typeof ld === "object" &&
    ld !== null &&
    "seconds" in ld &&
    typeof (ld as { seconds: number }).seconds === "number"
  ) {
    return (ld as { seconds: number }).seconds;
  }
  if (ld instanceof Date) return Math.floor(ld.getTime() / 1000);
  return Number.MAX_SAFE_INTEGER;
}

function navPickLockDesc(a: LiveEvent, b: LiveEvent): number {
  const key = (ev: LiveEvent) => {
    const s = getPickLockSeconds(ev);
    return s === Number.MAX_SAFE_INTEGER ? Number.NEGATIVE_INFINITY : s;
  };
  return key(b) - key(a);
}

/**
 * Within a filtered league subset, recompute event ranks by PTS (desc).
 * Same PTS ⇒ same rank (1,1,3…); tie-breaker uses stored global rank when PTS equal.
 */
function assignLeagueLocalRanksForEvent(users: User[], eventId: string): User[] {
  const ptsKey = `${eventId}PTS`;
  const rankKey = `${eventId}Rank`;
  const sorted = [...users].sort((a, b) => {
    const ap = parseFloat(String((a as Record<string, unknown>)[ptsKey] ?? 0)) || 0;
    const bp = parseFloat(String((b as Record<string, unknown>)[ptsKey] ?? 0)) || 0;
    if (bp !== ap) return bp - ap;
    const ar =
      parseInt(String((a as Record<string, unknown>)[rankKey] ?? 999999), 10) ||
      999999;
    const br =
      parseInt(String((b as Record<string, unknown>)[rankKey] ?? 999999), 10) ||
      999999;
    return ar - br;
  });
  let lastPts: number | null = null;
  let currentRank = 0;
  return sorted.map((u, i) => {
    const pts =
      parseFloat(String((u as Record<string, unknown>)[ptsKey] ?? 0)) || 0;
    const next = { ...u };
    if (lastPts === null || pts !== lastPts) {
      currentRank = i + 1;
      lastPts = pts;
    }
    (next as Record<string, unknown>)[rankKey] = currentRank;
    return next;
  });
}

/** Season leaderboard: recompute ranks within a league subset by season total PTS. */
function assignLeagueLocalRanksForSeason(users: User[]): User[] {
  const sorted = [...users].sort((a, b) => {
    const ap = parseFloat(String(a.seasonTotalPoints ?? 0)) || 0;
    const bp = parseFloat(String(b.seasonTotalPoints ?? 0)) || 0;
    return bp - ap;
  });
  let lastPts: number | null = null;
  let currentRank = 0;
  return sorted.map((u, i) => {
    const pts = parseFloat(String(u.seasonTotalPoints ?? 0)) || 0;
    const next = { ...u };
    if (lastPts === null || pts !== lastPts) {
      currentRank = i + 1;
      lastPts = pts;
    }
    next.seasonRank = currentRank;
    return next;
  });
}

/** Shared focus ring for filters + toolbar (pickem brand green). */
const LEADERBOARD_FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pickem-green/80 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-50 dark:focus-visible:ring-offset-gray-900";

const STATS_NAV_BTN =
  "shrink-0 whitespace-nowrap rounded-md border-2 border-transparent bg-white px-3 py-2 font-azonix text-[10px] font-bold uppercase tracking-wide text-neutral-900 shadow-sm transition hover:bg-neutral-50 active:scale-[0.98] dark:bg-stone-800 dark:text-white dark:hover:bg-stone-700 md:text-[11px] " +
  LEADERBOARD_FOCUS_RING;
/** Active chip — pickem brand green (same as stats / league nav). */
const STATS_NAV_BTN_ACTIVE = "border-pickem-green";

/** YOU / current-user badges: solid pickem green, dark text for contrast (matches dashboard CTAs). */
const LEADERBOARD_YOU_BADGE_CLASS =
  "bg-pickem-green px-1.5 py-0.5 font-semibold text-neutral-950";

/** Highlight row for the signed-in user. */
const LEADERBOARD_YOU_ROW_CLASS =
  "bg-pickem-green/12 dark:bg-pickem-green/16";
const STATS_NAV_OVERALL_ACCENT_BAR =
  "inline-block h-[1em] w-[3px] shrink-0 self-center rounded-[1px] bg-[#00f976]";

/** Neutral ring + explicit pickem green arc (#00f976) — reliable vs `border-pickem-green` on partial borders. */
const LEADERBOARD_SPINNER_BASE =
  "inline-block shrink-0 animate-spin rounded-full border-2 border-solid border-gray-300/90 border-t-[#00f976] dark:border-gray-600 dark:border-t-[#00f976]";

// Cache for live event to avoid repeated queries
const LIVE_EVENT_CACHE_KEY = 'leaderboard_live_event';
const LIVE_EVENT_CACHE_DURATION = 3 * 60 * 1000; // 3 minutes

const getLiveEventFromCache = (): LiveEvent | null => {
  try {
    const cached = localStorage.getItem(LIVE_EVENT_CACHE_KEY);
    if (!cached) return null;
    const { event, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > LIVE_EVENT_CACHE_DURATION) {
      localStorage.removeItem(LIVE_EVENT_CACHE_KEY);
      return null;
    }
    return event;
  } catch {
    return null;
  }
};

const setLiveEventCache = (event: LiveEvent) => {
  try {
    localStorage.setItem(LIVE_EVENT_CACHE_KEY, JSON.stringify({ event, timestamp: Date.now() }));
  } catch { }
};

/** Leaderboard avatars: resolve with resolveProfilePictureToUrl (multi-bucket + path variants). */
function LeaderboardProfileAvatar({
  storagePath,
  userId,
  displayName,
  className,
}: {
  storagePath?: string;
  userId?: string;
  displayName: string;
  className: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const imgErrorRetries = useRef(0);

  useEffect(() => {
    return subscribeProfileImagesRefresh(() => setRefreshEpoch((n) => n + 1));
  }, []);

  useEffect(() => {
    imgErrorRetries.current = 0;
  }, [storagePath, userId]);

  useEffect(() => {
    setFailed(false);
    setDone(false);
    setSrc(null);

    const p = storagePath?.trim();
    if (!p && !userId) {
      setDone(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const url = await resolveProfilePictureToUrl(p || null, { userId });
        if (!cancelled) setSrc(url ?? null);
      } catch {
        if (!cancelled) setSrc(null);
      } finally {
        if (!cancelled) setDone(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storagePath, userId, refreshEpoch]);

  const showDefaultAvatar = failed || (done && !src);

  if (showDefaultAvatar) {
    return (
      <img
        src={LEADERBOARD_DEFAULT_AVATAR_URL}
        alt={displayName}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={cn(className, "object-cover bg-gray-200 dark:bg-gray-700")}
      />
    );
  }

  if (!done || !src) {
    return (
      <div
        className={cn(
          className,
          "flex items-center justify-center bg-gray-300/80 dark:bg-gray-600/80 animate-pulse",
        )}
        aria-hidden
      >
        <FaUser className="shrink-0 text-gray-500 dark:text-gray-400 text-lg opacity-70" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={displayName}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className}
      onError={() => {
        const p = storagePath?.trim();
        invalidateProfilePictureCacheEntry(p || null, { userId });
        if (imgErrorRetries.current < 2) {
          imgErrorRetries.current += 1;
          setRefreshEpoch((n) => n + 1);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

// Display name hierarchy: username → firstName+lastName → name → displayName → fallback
const resolveDisplayName = (userDoc: { get: (field: string) => any }): string =>
  userDoc.get("username") ||
  (userDoc.get("firstName") && userDoc.get("lastName")
    ? `${userDoc.get("firstName")} ${userDoc.get("lastName")}`
    : null) ||
  userDoc.get("name") ||
  userDoc.get("displayName") ||
  "Unknown User";

function LeaderboardNewContent() {
  const { selectedLeague } = useLeague();
  const [liveEvent, setLiveEvent] = useState<LiveEvent | null>(null);
  const [allEvents, setAllEvents] = useState<LiveEvent[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("All");
  const [isSeasonView, setIsSeasonView] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [eventLoading, setEventLoading] = useState<boolean>(true);
  const [usersLoading, setUsersLoading] = useState<boolean>(true);
  const [currentUserLoading, setCurrentUserLoading] = useState<boolean>(true);
  const [pageLoading, setPageLoading] = useState<boolean>(false);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [expandedUserEventId, setExpandedUserEventId] = useState<string | null>(null);
  const [userEventsMap, setUserEventsMap] = useState<Map<string, LiveEvent[]>>(new Map());
  const [userDetailsLoading, setUserDetailsLoading] = useState<string | null>(null);
  const [currentUserCardLoading, setCurrentUserCardLoading] = useState<boolean>(false);
  const [userDetailsMap, setUserDetailsMap] = useState<Map<string, UserDetails>>(new Map());
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchSuggestions, setSearchSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [isSearchMode, setIsSearchMode] = useState<boolean>(false);
  const [searchDebounceTimer, setSearchDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Set<string>>(new Set());
  const [prefetchedPages, setPrefetchedPages] = useState<Set<number>>(new Set());
  const [retryCount, setRetryCount] = useState<Map<string, number>>(new Map());
  const [currentUserData, setCurrentUserData] = useState<User & { rank?: number } | null>(null);
  const [expandCurrentUser, setExpandCurrentUser] = useState<boolean>(false);
  const [updatingRows, setUpdatingRows] = useState<Set<string>>(new Set());
  const [totalParticipants, setTotalParticipants] = useState<number>(0);

  // Live member IDs for the selected league — fetched directly from the
  // leagues doc so the filter is never based on stale leaderboard cache data.
  const [leagueMemberIds, setLeagueMemberIds] = useState<Set<string> | null>(null);

  // League modals
  const [showCreateLeague, setShowCreateLeague] = useState(false);
  const [showJoinLeague, setShowJoinLeague] = useState(false);

  const PAGE_SIZES = [100, 200, 300, 400, 500];
  const MAX_RETRIES = 3;

  const years = useMemo((): string[] => {
    const uniqueYears = new Set(
      allEvents
        .map((event) => event.year)
        .filter((y): y is string => typeof y === "string" && y !== "2024"),
    );
    return [
      "All",
      ...Array.from(uniqueYears).sort(
        (a, b) => parseInt(b ? b : "1") - parseInt(a ? a : "1"),
      ),
    ];
  }, [allEvents]);

  const filteredEvents = useMemo(() => {
    const filtered =
      selectedYear === "All"
        ? allEvents
        : allEvents.filter((event) => event.year === selectedYear);
    return filtered.filter((event) => event.year !== "2024");
  }, [allEvents, selectedYear]);

  const eventNavSecondRow = useMemo(() => {
    const nonSeason = filteredEvents.filter((e) => e.status !== "season");

    if (selectedYear === "All") {
      const yearOptions = years.filter((y) => y !== "All");
      const byYear = new Map<string, LiveEvent[]>();
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
        | { kind: "event"; event: LiveEvent }
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

  const handleYearSelect = useCallback((year: string) => {
    setSelectedYear(year);
    setIsSeasonView(false);
    setSelectedSeason(null);
    if (year === "All") {
      const ev = allEvents.find((e) => e.status === "live") ?? allEvents[0] ?? null;
      setLiveEvent(ev);
    } else {
      const first = allEvents.find(
        (e) => String(e.year) === String(year) && e.year !== "2024",
      );
      setLiveEvent(first ?? null);
    }
    setPage(1);
    setUserEventsMap(new Map());
  }, [allEvents]);

  const handleEventSelect = useCallback(
    (event: LiveEvent) => {
      if (liveEvent?.id === event.id && !isSeasonView) return;
      setLiveEvent(event);
      setIsSeasonView(false);
      setSelectedSeason(null);
      setPage(1);
      setUserEventsMap(new Map());
    },
    [liveEvent?.id, isSeasonView],
  );

  const selectSeasonOverall = useCallback(
    (year: string) => {
      if (isSeasonView && selectedSeason === year) return;
      setLiveEvent(null);
      setIsSeasonView(true);
      setSelectedSeason(year);
      setPage(1);
      setUserEventsMap(new Map());
    },
    [isSeasonView, selectedSeason],
  );

  /**
   * Countdown banner always promotes the next/live event — not the leaderboard tab selection.
   */
  const bannerEvent = useMemo(() => {
    if (allEvents.length === 0) return null;
    return allEvents.find((e) => e.status === "live") ?? allEvents[0] ?? null;
  }, [allEvents]);

  const auth = getAuth();
  const currentUserId = auth.currentUser?.uid;
  const currentUserDetails = currentUserId && liveEvent ? userDetailsMap.get(`${currentUserId}:${liveEvent.id}`) : undefined;

  // Fetch all events
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const eventsCollection = collection(db, "events");
        const querySnapshot = await getDocs(eventsCollection);

        const events: LiveEvent[] = querySnapshot.docs.map((doc) => {
          const id = doc.id;
          const yearFromId = id.split("_").pop() ?? new Date().getFullYear().toString();

          const event: LiveEvent = {
            id,
            name: doc.get("name") || "Unnamed Event",
            status: doc.get("status") || "archived",
            event_place: doc.get("event_place") || "0",
            year: doc.get("year") || yearFromId,
            lockDate: doc.get("lockDate") || null,
            event_logo: doc.get("event_logo") || undefined,
            brand_color: doc.get("brand_color") ?? null,
            startDate: doc.get("startDate") || "",
            endDate: doc.get("endDate") || "",
            venue: doc.get("venue") || "",
            city: doc.get("city") || "",
            eventNumber:
              doc.get("eventNumber") != null ? String(doc.get("eventNumber")) : undefined,
          };

          return event;
        });

        // Sort events, excluding 2024 events completely
        const eventsByYear = events
          .filter(event => event.year !== "2024") // Filter out 2024 events completely
          .reduce((acc, event) => {
            const year = event.year ?? "Unknown";
            if (!acc[year]) acc[year] = [];
            acc[year].push(event);
            return acc;
          }, {} as Record<string, LiveEvent[]>);

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
              if (placeB !== placeA) return placeB - placeA;
              if (a.lockDate && b.lockDate) {
                return b.lockDate.seconds - a.lockDate.seconds;
              }
              return 0;
            })
          );

        setAllEvents(sortedEvents);

        // Set default to live event or first event
        const defaultEvent = sortedEvents.find((e) => e.status === "live") ?? sortedEvents[0];
        if (defaultEvent) {
          setLiveEvent(defaultEvent);
        }

        setPage(1);
      } catch (error) {
        console.error("Error fetching events:", error);
        setLiveEvent(null);
      } finally {
        setEventLoading(false);
      }
    };

    fetchEvents();
  }, []);

  // Fetch users for season view
  useEffect(() => {
    if (!isSeasonView || !selectedSeason) return;

    setUsersLoading(true);
    const unsub = onSnapshot(doc(db, "leaderboards", `season_${selectedSeason}`), async (snap) => {
      if (!snap.exists()) {
        // Fall back to direct calculation from stored flat fields
        try {
          const seasonEvents = allEvents.filter(e => e.year === selectedSeason);
          const qs = await getDocs(collection(db, "users"));
          const fallback: User[] = [];

          qs.docs.forEach(userDoc => {
            const data = userDoc.data();
            const pickems = data.pickems || {};
            const participated = seasonEvents.some(
              e => Array.isArray(pickems[e.id]) && pickems[e.id].length > 0
            );
            if (!participated) return;

            let seasonTotalPoints = 0;
            let seasonmvppts = 0;
            let seasonmvpname = "n/a";
            seasonEvents.forEach(e => {
              const pts = parseFloat(data[`${e.id}PTS`]) || 0;
              seasonTotalPoints += pts;
              const mvpPts = parseFloat(data[`${e.id}MVPPTS`]) || 0;
              if (mvpPts > seasonmvppts) {
                seasonmvppts = mvpPts;
                seasonmvpname = data[`${e.id}MVP`] || "n/a";
              }
            });

            fallback.push({
              id: userDoc.id,
              displayName: resolveDisplayName(userDoc),
              profilePicture: data.profilePicture || undefined,
              isSubscribed: data.isSubscribed || false,
              seasonTotalPoints,
              seasonmvpname,
              seasonmvppts,
            });
          });

          fallback.sort((a, b) => (b.seasonTotalPoints || 0) - (a.seasonTotalPoints || 0));
          let seasonList = fallback;
          if (leagueMemberIds?.size) {
            seasonList = fallback.filter((u) => leagueMemberIds.has(u.id));
          }
          const rankedSeason =
            leagueMemberIds?.size && seasonList.length > 0
              ? assignLeagueLocalRanksForSeason(seasonList)
              : seasonList;
          const start = (page - 1) * itemsPerPage;
          setUsers(rankedSeason.slice(start, start + itemsPerPage));
          setHasMorePages(rankedSeason.length > start + itemsPerPage);
        } catch {
          setUsers([]);
        }
        setUsersLoading(false);
        return;
      }

      const allUsers: any[] = snap.data()?.users || [];
      const filtered = leagueMemberIds
        ? allUsers.filter((u) => leagueMemberIds.has(u.id))
        : allUsers;
      const mapped: User[] = filtered.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        profilePicture: u.profilePicture || undefined,
        isSubscribed: u.isSubscribed || false,
        seasonTotalPoints: u.seasonTotalPoints,
        seasonmvpname: u.seasonmvpname,
        seasonmvppts: u.seasonmvppts,
        seasonRank: u.seasonRank,
      }));
      const rankedSeason =
        leagueMemberIds?.size && mapped.length > 0
          ? assignLeagueLocalRanksForSeason(mapped)
          : mapped;
      const start = (page - 1) * itemsPerPage;
      setUsers(rankedSeason.slice(start, start + itemsPerPage));
      setHasMorePages(rankedSeason.length > start + itemsPerPage);
      setUsersLoading(false);
    });

    return () => unsub();
  }, [isSeasonView, selectedSeason, allEvents, page, itemsPerPage, selectedLeague?.id, leagueMemberIds]);

  // Tracks whether the summary doc has delivered real data — prevents the async
  // fallback from overwriting snapshot data if it resolves after the snapshot fires.
  const hasSummaryData = useRef(false);

  // ── Fallback: one-time query while CF hasn't run yet ─────────────────────────
  useEffect(() => {
    if (!liveEvent || isSearchMode || isSeasonView) return;
    hasSummaryData.current = false; // reset on event change

    let cancelled = false;
    const runFallback = async () => {
      try {
        const qs = await getDocs(
          query(collection(db, "users"), where(`pickems.${liveEvent.id}`, "!=", null), limit(1000))
        );
        if (cancelled || hasSummaryData.current) return; // snapshot beat us — don't overwrite
        const fallback: User[] = qs.docs
          .filter(d => {
            const p = d.get("pickems") || {};
            return Array.isArray(p[liveEvent.id]) && p[liveEvent.id].length > 0;
          })
          .map(d => ({
            id: d.id,
            displayName: resolveDisplayName(d),
            profilePicture: d.get("profilePicture") || undefined,
            isSubscribed: d.get("isSubscribed") || false,
            [`${liveEvent.id}Rank`]: d.get(`${liveEvent.id}Rank`),
            [`${liveEvent.id}PTS`]: d.get(`${liveEvent.id}PTS`) ?? 0,
            [`${liveEvent.id}MVP`]: d.get(`${liveEvent.id}MVP`),
          }));
        fallback.sort((a, b) => {
          const aPts = parseFloat(a[`${liveEvent.id}PTS`]) || 0;
          const bPts = parseFloat(b[`${liveEvent.id}PTS`]) || 0;
          if (bPts !== aPts) return bPts - aPts;
          const aRank = parseInt(a[`${liveEvent.id}Rank`]) || 999999;
          const bRank = parseInt(b[`${liveEvent.id}Rank`]) || 999999;
          return aRank - bRank;
        });
        let list = fallback;
        if (leagueMemberIds?.size) {
          list = fallback.filter((u) => leagueMemberIds.has(u.id));
        }
        const ranked =
          leagueMemberIds?.size && list.length > 0
            ? assignLeagueLocalRanksForEvent(list, liveEvent.id)
            : list;
        if (cancelled || hasSummaryData.current) return;
        setTotalParticipants(ranked.length);
        const start = (page - 1) * itemsPerPage;
        setUsers(ranked.slice(start, start + itemsPerPage));
        setHasMorePages(ranked.length > start + itemsPerPage);

        if (currentUserId && liveEvent) {
          const me = ranked.find((u) => u.id === currentUserId);
          if (me) {
            const rk = me[`${liveEvent.id}Rank`];
            setCurrentUserData((prev) => {
              if (!prev || prev.id !== currentUserId) return prev;
              if (prev[`${liveEvent.id}Rank`] === rk) return prev;
              return { ...prev, [`${liveEvent.id}Rank`]: rk };
            });
          }
        }

        setPageLoading(false);
        setUsersLoading(false);
      } catch {
        if (!cancelled && !hasSummaryData.current) setUsers([]);
        setPageLoading(false);
        setUsersLoading(false);
      }
    };
    runFallback();
    return () => { cancelled = true; };
  }, [liveEvent?.id, isSearchMode, isSeasonView, leagueMemberIds, page, itemsPerPage, currentUserId]);

  // ── Live leaderboard: onSnapshot on summary doc written by Cloud Function ────
  useEffect(() => {
    if (!liveEvent || isSearchMode || isSeasonView) return;

    setPageLoading(true);
    const unsub = onSnapshot(doc(db, "leaderboards", liveEvent.id), (snap) => {
      if (!snap.exists()) {
        // Fallback effect handles the empty state — nothing to do here
        return;
      }

      // Mark that real data has arrived so the fallback won't overwrite it
      hasSummaryData.current = true;

      const allUsers: any[] = snap.data()?.users || [];

      // Apply league filter using live membership from leagues doc,
      // not the stale leagues field cached in the leaderboard summary.
      const filtered = leagueMemberIds
        ? allUsers.filter((u) => leagueMemberIds.has(u.id))
        : allUsers;

      // Normalise to the shape the rest of the page expects
      let normalised: User[] = filtered.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        profilePicture: u.profilePicture || undefined,
        isSubscribed: u.isSubscribed || false,
        leagues: u.leagues,
        [`${liveEvent.id}Rank`]: u.eventRank,
        [`${liveEvent.id}PTS`]: u.eventPTS,
        [`${liveEvent.id}MVP`]: u.mvp,
      }));

      // Within a custom league, ranks must be recomputed for the subset only.
      if (leagueMemberIds && leagueMemberIds.size > 0) {
        normalised = assignLeagueLocalRanksForEvent(normalised, liveEvent.id);
      }

      setTotalParticipants(
        leagueMemberIds && leagueMemberIds.size > 0
          ? filtered.length
          : snap.data()?.totalParticipants || allUsers.length,
      );

      // Paginate client-side
      const start = (page - 1) * itemsPerPage;
      setUsers(normalised.slice(start, start + itemsPerPage));
      setHasMorePages(normalised.length > start + itemsPerPage);

      if (currentUserId && liveEvent) {
        const me = normalised.find((u) => u.id === currentUserId);
        if (me) {
          const rk = me[`${liveEvent.id}Rank`];
          setCurrentUserData((prev) => {
            if (!prev || prev.id !== currentUserId) return prev;
            if (prev[`${liveEvent.id}Rank`] === rk) return prev;
            return { ...prev, [`${liveEvent.id}Rank`]: rk };
          });
        }
      }

      setPageLoading(false);
      setUsersLoading(false);
    });

    return () => unsub();
  }, [
    liveEvent?.id,
    isSearchMode,
    isSeasonView,
    selectedLeague?.id,
    leagueMemberIds,
    page,
    itemsPerPage,
    currentUserId,
  ]);

  // Reset pagination when event or league changes
  useEffect(() => {
    if (liveEvent) {
      setPage(1);
      setExpandedUserId(null);
      setTotalParticipants(0);
    }
  }, [liveEvent?.id, selectedLeague?.id]);

  // Localhost only: enrich users with fresh isSubscribed from Firestore.
  // Leaderboard summary can be stale (built before users subscribed); this fixes PRO badges.
  useEffect(() => {
    if (typeof window === "undefined" || window.location.hostname !== "localhost") return;
    if (users.length === 0) return;

    let cancelled = false;
    Promise.all(users.map((u) => getDoc(doc(db, "users", u.id))))
      .then((docs) => {
        if (cancelled) return;
        const freshMap = new Map<string, boolean>();
        docs.forEach((d, i) => {
          if (d?.exists()) freshMap.set(users[i].id, !!d.get("isSubscribed"));
        });
        const hasUpdates = users.some((u) => {
          const fresh = freshMap.get(u.id);
          return fresh !== undefined && fresh !== !!u.isSubscribed;
        });
        if (!hasUpdates) return;
        setUsers((prev) =>
          prev.map((u) => {
            const fresh = freshMap.get(u.id);
            if (fresh === undefined) return u;
            return { ...u, isSubscribed: fresh };
          })
        );
      })
      .catch((err) => console.warn("[localhost] PRO badge enrichment failed:", err));
    return () => {
      cancelled = true;
    };
  }, [users]);

  // Merge profilePicture from users/{id} when leaderboard summary is missing or stale (patrick23-style cases).
  const enrichAvatarIdsKey = useMemo(() => users.map((u) => u.id).join(","), [users]);

  useEffect(() => {
    if (!enrichAvatarIdsKey) return;
    const ids = enrichAvatarIdsKey.split(",");
    let cancelled = false;
    Promise.all(ids.map((id) => getDoc(doc(db, "users", id))))
      .then((docs) => {
        if (cancelled) return;
        setUsers((prev) => {
          if (prev.length !== ids.length) return prev;
          for (let i = 0; i < ids.length; i++) {
            if (prev[i]?.id !== ids[i]) return prev;
          }
          let changed = false;
          const next = prev.map((u, i) => {
            const d = docs[i];
            if (!d?.exists()) return u;
            const fresh = d.get("profilePicture");
            if (typeof fresh !== "string" || !fresh.trim()) return u;
            const t = fresh.trim();
            if (t === (u.profilePicture || "").trim()) return u;
            changed = true;
            return { ...u, profilePicture: t };
          });
          return changed ? next : prev;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enrichAvatarIdsKey]);

  // Fetch live league membership directly from the leagues collection.
  // This ensures the filter is always accurate regardless of when the
  // leaderboard summary doc was last rebuilt by the Cloud Function.
  useEffect(() => {
    if (!selectedLeague) {
      setLeagueMemberIds(null);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "leagues", selectedLeague.id)).then((snap) => {
      if (cancelled || !snap.exists()) return;
      const members: string[] = snap.data()?.members || [];
      setLeagueMemberIds(new Set(members));
    }).catch(() => setLeagueMemberIds(null));
    return () => { cancelled = true; };
  }, [selectedLeague?.id]);

  // Fetch current user data
  useEffect(() => {
    async function fetchCurrentUser() {
      if (!liveEvent || !currentUserId) return;

      try {
        const userDocRef = doc(db, "users", currentUserId);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const displayName = resolveDisplayName(userDoc);
          const profilePicture = userDoc.get("profilePicture") || undefined;
          const pickemData = userDoc.get("pickemData") || undefined;

          // Calculate live PTS from picks with captain 1.5x multiplier
          let livePTS: number | undefined = userDoc.get(`${liveEvent.id}PTS`);
          const pickems = userDoc.get("pickems") || {};
          const playerIds: string[] = Array.isArray(pickems[liveEvent.id]) ? pickems[liveEvent.id] : [];
          const captainIdValue: string | null = pickems[`${liveEvent.id}_captain`] || null;
          if (playerIds.length > 0) {
            const playerDocs = await Promise.all(
              playerIds.map((id) => getDoc(doc(db, `events/${liveEvent.id}/players`, id.toString())))
            );
            const calculated = playerDocs.reduce((sum, d) => {
              if (!d.exists()) return sum;
              const kills = d.get("Confirmed Kills") || 0;
              return sum + (d.id === captainIdValue ? kills * 1.5 : kills);
            }, 0);
            if (calculated > 0) livePTS = calculated;
          }

          setCurrentUserData({
            id: currentUserId,
            displayName,
            profilePicture,
            pickemData,
            rank: undefined,
            [`${liveEvent.id}Rank`]: userDoc.get(`${liveEvent.id}Rank`),
            [`${liveEvent.id}PTS`]: livePTS,
            [`${liveEvent.id}MVP`]: userDoc.get(`${liveEvent.id}MVP`),
          });
        }
      } catch (error) {
        console.error("Error fetching current user:", error);
      } finally {
        setCurrentUserLoading(false);
      }
    }

    fetchCurrentUser();
  }, [liveEvent, currentUserId]);

  // Fetch user details when accordion is expanded with retry logic
  const fetchUserDetails = async (userId: string, retry = 0, isCurrentUserCard = false, eventId?: string): Promise<void> => {
    const cacheKey = eventId ? `${userId}:${eventId}` : userId;
    const targetEventId = eventId || liveEvent?.id;

    if (!targetEventId) return;

    // Check if already cached
    if (userDetailsMap.has(cacheKey)) {
      return;
    }

    // Check if request is already pending
    if (pendingRequests.has(cacheKey)) {
      return;
    }

    setPendingRequests(prev => new Set(prev).add(cacheKey));
    if (isCurrentUserCard) {
      setCurrentUserCardLoading(true);
    } else {
      setUserDetailsLoading(cacheKey);
    }
    try {
      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : null;

      const response = await fetch(
        `/api/leaderboard/user-details?userId=${userId}&eventId=${targetEventId}`,
        {
          cache: 'no-store',
          headers: {
            ...(token && { 'Authorization': `Bearer ${token}` })
          }
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch user details");
      }

      const data = await response.json();
      setUserDetailsMap((prev) => new Map(prev).set(cacheKey, data));
      setRetryCount((prev) => {
        const next = new Map(prev);
        next.delete(cacheKey);
        return next;
      });
    } catch (error) {
      console.error("Error fetching user details:", error);

      // Retry logic
      if (retry < MAX_RETRIES) {
        const currentRetry = retry + 1;
        setRetryCount((prev) => new Map(prev).set(cacheKey, currentRetry));
        setTimeout(() => {
          fetchUserDetails(userId, currentRetry, isCurrentUserCard, eventId);
        }, Math.pow(2, currentRetry) * 1000);
      }
    } finally {
      if (isCurrentUserCard) {
        setCurrentUserCardLoading(false);
      } else {
        setUserDetailsLoading(null);
      }
      setPendingRequests(prev => {
        const next = new Set(prev);
        next.delete(cacheKey);
        return next;
      });
    }
  };

  // Fetch user's all events when row is expanded
  const fetchUserEvents = async (userId: string): Promise<void> => {
    if (userEventsMap.has(userId)) return;

    try {
      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const pickems = userDoc.get("pickems") || {};
        const userEventIds = Object.keys(pickems).filter(eventId =>
          Array.isArray(pickems[eventId]) && pickems[eventId].length > 0
        );

        // Get event details for user's events with points and MVP
        // Filter by selected season if in season view
        const userEvents = allEvents
          .filter(event => {
            const hasParticipated = userEventIds.includes(event.id);
            const matchesSeason = selectedSeason ? event.year === selectedSeason : true;
            return hasParticipated && matchesSeason;
          })
          .map(event => ({
            ...event,
            points: userDoc.get(`${event.id}PTS`) || 0,
            mvp: userDoc.get(`${event.id}MVP`) || "None"
          }));
        setUserEventsMap(prev => new Map(prev).set(userId, userEvents));
      }
    } catch (error) {
      console.error("Error fetching user events:", error);
    }
  };

  const toggleExpand = useCallback(async (userId: string) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      setExpandedUserEventId(null);
    } else {
      setExpandedUserId(userId);
      setExpandedUserEventId(null);
      if (isSeasonView) {
        await fetchUserEvents(userId);
      } else {
        const cacheKey = liveEvent ? `${userId}:${liveEvent.id}` : userId;
        if (!userDetailsMap.has(cacheKey) && liveEvent) {
          await fetchUserDetails(userId, 0, false, liveEvent.id);
        }
      }
    }
  }, [expandedUserId, liveEvent, userDetailsMap, fetchUserDetails, isSeasonView]);

  const toggleEventExpand = useCallback(async (userId: string, eventId: string) => {
    if (expandedUserEventId === eventId) {
      setExpandedUserEventId(null);
    } else {
      setExpandedUserEventId(eventId);
      const cacheKey = `${userId}:${eventId}`;
      if (!userDetailsMap.has(cacheKey)) {
        await fetchUserDetails(userId, 0, false, eventId);
      }
    }
  }, [expandedUserEventId, userDetailsMap]);

  // Fetch search suggestions (autocomplete)
  const fetchSearchSuggestions = async (searchTerm: string) => {
    if (!liveEvent || !searchTerm.trim()) {
      setSearchSuggestions([]);
      return;
    }

    try {
      const searchTermLower = searchTerm.toLowerCase();
      const usersCollection = collection(db, "users");
      const constraints: QueryConstraint[] = [
        where(`pickems.${liveEvent.id}`, "!=", null),
      ];

      const searchQuery = query(usersCollection, ...constraints);
      const querySnapshot = await getDocs(searchQuery);

      const matchingUsers: User[] = [];
      for (const userDoc of querySnapshot.docs) {
        const displayName = resolveDisplayName(userDoc);
        const userId = userDoc.id;

        if (displayName.toLowerCase().includes(searchTermLower)) {
          const userData: User = {
            id: userId,
            displayName,
            profilePicture: userDoc.get("profilePicture") || undefined,
            isSubscribed: userDoc.get("isSubscribed") || false,
            pickemData: userDoc.get("pickemData") || undefined,
          };
          if (liveEvent) {
            userData[`${liveEvent.id}Rank`] = userDoc.get(`${liveEvent.id}Rank`);
            userData[`${liveEvent.id}PTS`] = userDoc.get(`${liveEvent.id}PTS`);
            userData[`${liveEvent.id}MVP`] = userDoc.get(`${liveEvent.id}MVP`);
          }
          matchingUsers.push(userData);

          if (matchingUsers.length >= 10) break;
        }
      }

      matchingUsers.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setSearchSuggestions(matchingUsers);
    } catch (error) {
      console.error("Error fetching search suggestions:", error);
    }
  };

  // Execute full search
  const executeSearch = async (searchTerm: string) => {
    if (!liveEvent || !searchTerm.trim()) {
      setIsSearchMode(false);
      setPage(1);
      return;
    }

    try {
      setPageLoading(true);
      setIsSearchMode(true);
      setShowSuggestions(false);

      const searchTermLower = searchTerm.toLowerCase();

      // Custom league: search must use the same ranked subset as the table (not global ranks).
      if (leagueMemberIds && leagueMemberIds.size > 0) {
        const snap = await getDoc(doc(db, "leaderboards", liveEvent.id));
        if (!snap.exists()) {
          setUsers([]);
          setHasMorePages(false);
          setPageLoading(false);
          return;
        }
        const allUsers: any[] = snap.data()?.users || [];
        const filtered = allUsers.filter((u) => leagueMemberIds.has(u.id));
        let ranked: User[] = filtered.map((u) => ({
          id: u.id,
          displayName: u.displayName,
          profilePicture: u.profilePicture || undefined,
          isSubscribed: u.isSubscribed || false,
          leagues: u.leagues,
          [`${liveEvent.id}Rank`]: u.eventRank,
          [`${liveEvent.id}PTS`]: u.eventPTS,
          [`${liveEvent.id}MVP`]: u.mvp,
        }));
        ranked = assignLeagueLocalRanksForEvent(ranked, liveEvent.id);
        const nameMatches = ranked.filter((u) =>
          u.displayName.toLowerCase().includes(searchTermLower),
        );
        setUsers(nameMatches.slice(0, itemsPerPage));
        setHasMorePages(false);
        setPageLoading(false);
        return;
      }

      const usersCollection = collection(db, "users");

      const constraints: QueryConstraint[] = [
        where(`pickems.${liveEvent.id}`, "!=", null),
        limit(500), // Increased limit to get more users
      ];

      const searchQuery = query(usersCollection, ...constraints);
      const querySnapshot = await getDocs(searchQuery);

      // Filter matching users without fetching profile pictures initially
      const matchingUsers: User[] = [];
      const userDocsToFetch: Array<{ id: string; doc: any }> = [];

      for (const userDoc of querySnapshot.docs) {
        const displayName = resolveDisplayName(userDoc);

        if (displayName.toLowerCase().includes(searchTermLower)) {
          const userData: User = {
            id: userDoc.id,
            displayName,
            profilePicture: userDoc.get("profilePicture") || undefined,
            isSubscribed: userDoc.get("isSubscribed") || false,
            pickemData: userDoc.get("pickemData") || undefined,
          };
          if (liveEvent) {
            userData[`${liveEvent.id}Rank`] = userDoc.get(`${liveEvent.id}Rank`);
            userData[`${liveEvent.id}PTS`] = userDoc.get(`${liveEvent.id}PTS`);
            userData[`${liveEvent.id}MVP`] = userDoc.get(`${liveEvent.id}MVP`);
          }
          matchingUsers.push(userData);
          userDocsToFetch.push({ id: userDoc.id, doc: userDoc });
        }
      }

      // Sort: users with rank data first, then by rank (ascending)
      matchingUsers.sort((a, b) => {
        const aRank = liveEvent ? a[`${liveEvent.id}Rank`] : null;
        const bRank = liveEvent ? b[`${liveEvent.id}Rank`] : null;

        // Users with rank data always come first
        if (aRank && !bRank) return -1;
        if (!aRank && bRank) return 1;

        // If both have rank data, sort by rank (ascending)
        if (aRank && bRank) {
          return parseInt(String(aRank)) - parseInt(String(bRank));
        }

        // If neither has rank data, sort alphabetically
        return a.displayName.localeCompare(b.displayName);
      });

      // Limit results to itemsPerPage
      const limitedUsers = matchingUsers.slice(0, itemsPerPage);
      setUsers(limitedUsers);
      setHasMorePages(false); // No pagination in search mode
      setPageLoading(false);

      // Profile pictures already loaded from user data
    } catch (error) {
      console.error("Error executing search:", error);
      setPageLoading(false);
    }
  };

  // Handle search input change with debounce
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);

    // Clear previous debounce timer
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    if (value.trim()) {
      // Debounce search execution
      const timer = setTimeout(() => {
        executeSearch(value);
      }, 300);
      setSearchDebounceTimer(timer);
    } else {
      setShowSuggestions(false);
      setSearchSuggestions([]);
      // Clear search mode if query is empty
      if (isSearchMode) {
        setIsSearchMode(false);
        setPage(1);
      }
    }
  };

  // Handle search submit (Enter key or search button)
  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    executeSearch(searchQuery);
  };

  // Handle suggestion click
  const handleSuggestionClick = useCallback(async (user: User) => {
    setSearchQuery(user.displayName);
    setShowSuggestions(false);
    setIsSearchMode(true);
    setPageLoading(true);

    // User already has profilePicture and pickemData from search
    setUsers([{
      ...user,
      ...(liveEvent && {
        [`${liveEvent.id}Rank`]: user[`${liveEvent.id}Rank`],
        [`${liveEvent.id}PTS`]: user[`${liveEvent.id}PTS`],
        [`${liveEvent.id}MVP`]: user[`${liveEvent.id}MVP`],
      })
    }]);
    setHasMorePages(false);
    setPageLoading(false);
  }, [liveEvent]);

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setShowSuggestions(false);
    setSearchSuggestions([]);
    setIsSearchMode(false);
    setPage(1);
  }, []);

  // Auto-refresh is handled by onSnapshot — no polling needed

  const handlePageSizeChange = useCallback((newSize: number) => {
    setItemsPerPage(newSize);
    setPage(1);
  }, []);

  const handleNextPage = useCallback(() => {
    if (hasMorePages) {
      setPage((p) => p + 1);
    }
  }, [hasMorePages]);

  const handlePreviousPage = useCallback(() => {
    if (page > 1) {
      setPage((p) => p - 1);
    }
  }, [page]);

  // Prefetch not needed — pagination is client-side from summary doc

  const SubscriberBadge = ({ displayName }: { displayName: string }) => (
    <div className="relative group inline-flex items-center ml-1.5 flex-shrink-0">
      <span className="bg-gradient-to-r from-purple-600 to-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full cursor-default select-none">
        PRO
      </span>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-50 pointer-events-none">
        <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg border border-gray-700">
          {displayName} is a subscriber
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </div>
    </div>
  );

  // Show "No active event" only after loading is complete and no event found
  if (!eventLoading && !liveEvent && !isSeasonView) {
    return (
      <div className="min-h-[220px] bg-gray-50 p-2 pb-10 pt-0 text-gray-900 dark:bg-gray-900 dark:text-white sm:p-4 sm:pb-4 sm:pt-0">
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-center text-white text-lg">
            No active event currently running.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[220px] bg-gray-50 p-2 pb-10 pt-0 text-gray-900 dark:bg-gray-900 dark:text-white sm:p-4 sm:pb-4 sm:pt-0">
      {bannerEvent ? (
        <EventCountdownBanner
          variant="dashboard"
          mobileBlackBarFullBleed
          event={eventRecordToBannerModel(
            bannerEvent as unknown as Record<string, unknown> & { id: string },
          )}
          showBudget={false}
          desktopCta={
            <Link
              href="/dashboard/pick-em"
              className={DASHBOARD_BANNER_PICK_CTA_CLASS}
              style={{ backgroundColor: bannerEvent.brand_color || "#b91c1c" }}
            >
              Pick your team &gt;
            </Link>
          }
        />
      ) : null}

      <main className="mx-auto max-w-5xl px-4 pt-4">
      {/* Custom leagues — above event/year filtering */}
      {!eventLoading && (liveEvent || isSeasonView) && (
        <div className="mb-4">
          <LeagueSelector
            onCreateLeague={() => setShowCreateLeague(true)}
            onJoinLeague={() => setShowJoinLeague(true)}
          />
        </div>
      )}

      <section
        className="mt-0"
        aria-label="Leaderboard navigation"
      >
        <div className="rounded-xl bg-neutral-50/70 p-2 ring-1 ring-black/[0.06] dark:bg-stone-950/50 dark:ring-white/10">
          <div
            className="flex items-center gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="toolbar"
            aria-label="Filter by year"
          >
            {years.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => handleYearSelect(year)}
                className={cn(STATS_NAV_BTN, selectedYear === year && STATS_NAV_BTN_ACTIVE)}
              >
                {year === "All" ? "ALL" : year}
              </button>
            ))}
          </div>
          <div
            className="mt-2 flex items-center gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                  isSeasonView && selectedSeason === item.year;
                return (
                  <button
                    key={`season-${item.year}`}
                    type="button"
                    onClick={() => selectSeasonOverall(item.year)}
                    className={cn(
                      STATS_NAV_BTN,
                      "flex items-center gap-2",
                      seasonSelected && STATS_NAV_BTN_ACTIVE,
                    )}
                  >
                    <span className={STATS_NAV_OVERALL_ACCENT_BAR} aria-hidden={true} />
                    {item.label}
                  </button>
                );
              }
              const ev = item.event;
              const eventSelected =
                liveEvent?.id === ev.id && !isSeasonView;
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => handleEventSelect(ev)}
                  className={cn(
                    STATS_NAV_BTN,
                    eventSelected && STATS_NAV_BTN_ACTIVE,
                  )}
                >
                  {leaderboardNavLabel(ev)}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <h2
        id="leaderboard-standings-heading"
        className="text-xs font-medium text-gray-600 dark:text-gray-400 mt-2 mb-1 min-h-[1.125rem]"
      >
        {eventLoading ? (
          <span
            className="inline-block h-3 w-32 max-w-full rounded bg-gray-300 dark:bg-gray-700 animate-pulse"
            aria-hidden
          />
        ) : !isSeasonView && totalParticipants > 0 ? (
          <>
            {totalParticipants} team{totalParticipants !== 1 ? "s" : ""} entered
          </>
        ) : (
          <span className="sr-only">Standings</span>
        )}
      </h2>

      {/* Current User Card */}
      {currentUserLoading ? (
        <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 pt-2 pb-2 mb-2 sm:pt-3 sm:pb-3">
          <div className="bg-gray-200/100 dark:bg-gray-800/100 rounded-lg shadow border border-gray-300 dark:border-gray-700 p-2 sm:p-3">
            <div className="flex items-center">
              <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-full bg-gray-700 animate-pulse mr-3"></div>
              <div className="flex-1 min-w-0">
                <div className="h-4 bg-gray-700 rounded w-32 mb-2 animate-pulse"></div>
                <div className="h-3 bg-gray-700 rounded w-24 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      ) : currentUserData && liveEvent && (
        <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 pt-2 pb-2 mb-2 sm:pt-3 sm:pb-3">
          <div className="bg-gray-200/100 dark:bg-gray-800/100 rounded-lg shadow border border-gray-300 dark:border-gray-700">
            <div
              className="p-2 sm:p-3 cursor-pointer"
              onClick={async () => {
                setExpandCurrentUser(!expandCurrentUser);
                // Fetch user details if not already cached - use current selected event
                if (currentUserId && !expandCurrentUser && liveEvent) {
                  const cacheKey = `${currentUserId}:${liveEvent.id}`;
                  if (!userDetailsMap.has(cacheKey)) {
                    await fetchUserDetails(currentUserId, 0, true, liveEvent.id);
                  }
                }
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center">
                  <div className="relative shrink-0">
                    <LeaderboardProfileAvatar
                      userId={currentUserId}
                      storagePath={currentUserData.profilePicture}
                      displayName="Profile"
                      className="w-11 h-11 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-yellow-400"
                    />
                    {liveEvent && currentUserData[`${liveEvent.id}Rank`] && (
                      <div
                        className={cn(
                          "absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-yellow-500 font-bold tabular-nums leading-none text-black",
                          String(currentUserData[`${liveEvent.id}Rank`]).length >= 3
                            ? "h-6 min-w-[1.75rem] max-w-[3rem] shrink-0 px-1 text-[8px] sm:h-7 sm:min-w-[2rem] sm:max-w-none sm:px-1.5 sm:text-[11px]"
                            : "h-6 w-6 text-[10px] sm:h-7 sm:w-7 sm:text-xs",
                        )}
                      >
                        #{currentUserData[`${liveEvent.id}Rank`]}
                      </div>
                    )}
                  </div>
                  <div className="ml-2 min-w-0 sm:ml-3">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <h3 className="font-bold text-sm sm:text-base flex min-w-0 items-center">
                        <span className="truncate">{currentUserData.displayName}</span>
                        <span
                          className={cn(
                            "ml-1 shrink-0 rounded text-xs",
                            LEADERBOARD_YOU_BADGE_CLASS,
                          )}
                        >
                          You
                        </span>
                      </h3>
                      <span className="inline-flex items-center gap-1 font-medium text-xs sm:text-sm tabular-nums">
                        <FaTrophy className="text-yellow-400 shrink-0 text-sm" aria-hidden={true} />
                        {liveEvent && currentUserData[`${liveEvent.id}PTS`] !== undefined
                          ? currentUserData[`${liveEvent.id}PTS`]
                          : 0}
                        <span className="font-normal text-gray-500 dark:text-gray-400">pts</span>
                      </span>
                    </div>
                    <p className="hidden text-xs text-gray-600 dark:text-gray-400 sm:block">
                      MVP: {liveEvent && currentUserData[`${liveEvent.id}MVP`] !== undefined
                        ? currentUserData[`${liveEvent.id}MVP`] || "None"
                        : "None"}
                    </p>
                  </div>
                </div>
                {currentUserCardLoading ? (
                  <div className={cn(LEADERBOARD_SPINNER_BASE, "h-4 w-4")} aria-hidden={true} />
                ) : expandCurrentUser ? (
                  <FaChevronUp className="text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm" />
                ) : (
                  <FaChevronDown className="text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm" />
                )}
              </div>
            </div>
            <AnimatePresence>
              {expandCurrentUser && currentUserDetails && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="border-t border-gray-300 dark:border-gray-700/70"
                >
                  <div className="px-3 max-h-[280px] overflow-auto pb-3">
                    <h3 className="pt-3 text-xs font-medium text-gray-900 dark:text-white mb-2 border-b border-gray-300 dark:border-gray-700 pb-1 sticky top-0 bg-gray-200/100 dark:bg-gray-800/100 z-10">
                      Your Team
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                      {currentUserDetails.picks
                        .slice()
                        .sort((a, b) => b.points - a.points)
                        .map((pick, pickIndex) => (
                          <div
                            key={`current-user-${pick.id}-${pickIndex}`}
                            className={`bg-gray-300/50 dark:bg-gray-700/50 p-2 rounded hover:bg-gray-300/70 dark:hover:bg-gray-700/70 transition-colors ${pick.isCaptain ? "border-2 border-yellow-600 dark:border-yellow-400" : ""
                              }`}
                          >
                            <div className="grid grid-cols-2 gap-x-4 text-xs">
                              <div>
                                <div className="text-gray-900 dark:text-white font-medium truncate mb-1 flex items-center gap-1">
                                  {pick.name}
                                  {pick.isCaptain && (
                                    <span className="w-4 h-4 rounded-full bg-yellow-600 dark:bg-yellow-400 text-white dark:text-black text-[10px] font-bold flex items-center justify-center shadow-lg">
                                      C
                                    </span>
                                  )}
                                </div>
                                <div className="text-gray-600 dark:text-gray-400">Rank: <span className="text-gray-900 dark:text-white">{pick.rank ?? 0}</span></div>
                              </div>
                              <div className="space-y-1">
                                <div className="text-gray-600 dark:text-gray-400">Score: <span className="font-medium text-gray-900 dark:text-white">{pick.points}</span></div>
                                <div className="text-gray-600 dark:text-gray-400">Cost: <span className="text-gray-900 dark:text-white">${pick.cost}</span></div>
                                <div className="text-gray-600 dark:text-gray-400">ROI: <span className="pickem-numeric text-yellow-600 dark:text-yellow-400">${pick.kills === 0 || pick.cost === 0 ? 0 : (pick.cost / pick.kills).toFixed(2)}</span></div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Search + rows + pagination — single row */}
      {eventLoading ? (
        <div className="mb-2 mt-2 flex min-h-9 flex-nowrap items-center gap-2">
          <div
            className="h-9 min-w-0 flex-1 rounded-lg bg-gray-700 animate-pulse"
            aria-hidden
          />
        </div>
      ) : (
        <div className="mb-2 mt-2 flex min-w-0 flex-nowrap items-center gap-4 sm:gap-6">
          <form
            onSubmit={handleSearchSubmit}
            className="relative min-h-9 min-w-0 flex-1"
          >
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <FaSearch className="text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search players..."
              aria-label="Search players"
              className={cn(
                "h-9 w-full min-w-0 pl-9 pr-10 py-1.5 text-sm bg-gray-200 dark:bg-gray-800 rounded-lg text-gray-900 dark:text-white sm:py-2",
                LEADERBOARD_FOCUS_RING,
              )}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute inset-y-0 right-0 flex items-center pr-3"
              >
                <FaTimes className="text-gray-400 hover:text-white text-sm" />
              </button>
            )}
          </form>
          {!isSearchMode && users.length > 0 && (
            <>
              <div className="flex shrink-0 items-center gap-2 border-l border-gray-200 pl-4 dark:border-gray-700 sm:pl-6">
                <span className="whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">
                  Rows
                </span>
                <select
                  value={itemsPerPage}
                  onChange={(e) =>
                    handlePageSizeChange(Number(e.target.value))
                  }
                  disabled={pageLoading}
                  aria-label="Rows per page"
                  className={cn(
                    "h-9 rounded bg-gray-800 px-2 text-xs text-white disabled:opacity-50",
                    LEADERBOARD_FOCUS_RING,
                  )}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
              <div
                className="flex shrink-0 items-center gap-2 border-l border-gray-200 pl-4 dark:border-gray-700 sm:pl-6"
                role="navigation"
                aria-label="Table pages"
              >
                <span className="sr-only">
                  Page {page}
                </span>
                <button
                  type="button"
                  onClick={handlePreviousPage}
                  disabled={page === 1 || pageLoading}
                  aria-label="Previous page"
                  className={cn(
                    "box-border flex h-9 w-9 shrink-0 items-center justify-center rounded bg-gray-200 text-gray-700 transition-colors hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700",
                    LEADERBOARD_FOCUS_RING,
                  )}
                >
                  <FaAngleLeft className="h-3.5 w-3.5" aria-hidden={true} />
                </button>
                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={!hasMorePages || pageLoading || usersLoading}
                  aria-label="Next page"
                  className={cn(
                    "box-border flex h-9 w-9 shrink-0 items-center justify-center rounded bg-gray-200 text-gray-700 transition-colors hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700",
                    LEADERBOARD_FOCUS_RING,
                  )}
                >
                  <FaAngleRight className="h-3.5 w-3.5" aria-hidden={true} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Leaderboard Table */}
      <section aria-labelledby="leaderboard-standings-heading">
      <div className="overflow-x-auto rounded-lg pr-2 shadow bg-gray-200/50 dark:bg-gray-800/50 backdrop-blur-sm [-webkit-overflow-scrolling:touch]">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-14 sm:w-16" />
            <col />
            <col className="w-24 sm:w-28" />
            <col className="hidden min-w-0 sm:table-column sm:w-[28%]" />
            <col className="w-16" />
          </colgroup>
          <thead>
            <tr className="bg-gray-300/80 dark:bg-gray-700/80">
              <th className="sticky left-0 z-20 bg-gray-300/80 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-700 shadow-[2px_0_0_0_rgb(209_213_219_/_0.5)] dark:bg-gray-700/80 dark:text-gray-300 dark:shadow-[2px_0_0_0_rgb(75_85_99_/_0.5)]">
                Rank
              </th>
              <th className="min-w-0 px-3 py-2.5 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Player
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider tabular-nums">
                Pts
              </th>
              <th className="hidden min-w-0 px-3 py-2.5 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider sm:table-cell">
                MVP
              </th>
              <th className="w-16 max-w-16 px-2 py-2.5 text-center text-[10px] font-medium uppercase tracking-tight text-gray-700 dark:text-gray-300 sm:text-xs sm:tracking-wide">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300/50 dark:divide-gray-700/50">
            {(eventLoading || usersLoading || (pageLoading && page === 1)) ? (
              <LeaderboardSkeleton
                rows={Math.min(itemsPerPage, 25)}
              />
            ) : users.length > 0 ? (
              users.map((user, index) => {
                const userEvents = userEventsMap.get(user.id) || [];
                const isExpanded = expandedUserId === user.id;
                const cacheKey = liveEvent ? `${user.id}:${liveEvent.id}` : user.id;
                const isLoading = isSeasonView ? false : userDetailsLoading === cacheKey;

                let displayRank: string | number;
                if (isSeasonView) {
                  // For season view, use stored seasonRank if available, else sequential
                  const stored = user.seasonRank ?? user.seasonrank;
                  displayRank = stored ?? (page - 1) * itemsPerPage + index + 1;
                } else if (liveEvent && user[`${liveEvent.id}Rank`] != null && user[`${liveEvent.id}Rank`] !== undefined) {
                  // For events (incl. search), show true global rank from data
                  displayRank = user[`${liveEvent.id}Rank`];
                } else {
                  displayRank = (page - 1) * itemsPerPage + index + 1;
                }

                return (
                  <Fragment key={user.id}>
                    <tr
                      className={`hover:bg-gray-400/60 dark:hover:bg-gray-600/60 transition-all duration-300 cursor-pointer ${currentUserId === user.id ? LEADERBOARD_YOU_ROW_CLASS : "bg-gray-200/60 dark:bg-gray-800/60"
                        } ${updatingRows.has(user.id) ? "scale-[1.02] bg-pickem-green/20 dark:bg-pickem-green/25" : ""
                        }`}
                      onClick={() => toggleExpand(user.id)}
                    >
                      <td className="px-3 py-2.5 text-sm sticky left-0 z-10 bg-inherit whitespace-nowrap align-middle shadow-[2px_0_0_0_rgb(209_213_219_/_0.35)] dark:shadow-[2px_0_0_0_rgb(75_85_99_/_0.35)]">
                        <div className="flex items-center">
                          <span className="font-medium text-gray-900 dark:text-white tabular-nums">
                            {displayRank}
                          </span>
                          {currentUserId === user.id && (
                            <span
                              className={cn(
                                "ml-1 rounded text-xs",
                                LEADERBOARD_YOU_BADGE_CLASS,
                              )}
                            >
                              YOU
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="min-w-0 px-3 py-2.5 align-middle">
                        <div className="flex min-w-0 items-center">
                          <LeaderboardProfileAvatar
                            userId={user.id}
                            storagePath={user.profilePicture}
                            displayName={user.displayName}
                            className="h-8 w-8 shrink-0 rounded-full object-cover mr-2"
                          />
                          <div className="flex min-w-0 items-center gap-0">
                            <span
                              className="truncate text-xs text-gray-900 dark:text-white sm:text-sm"
                              title={user.displayName}
                            >
                              {user.displayName}
                            </span>
                            {user.isSubscribed && <SubscriberBadge displayName={user.displayName} />}
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-2.5 text-right text-xs font-medium tabular-nums text-gray-900 dark:text-white sm:text-sm align-middle whitespace-nowrap">
                        {isSeasonView ? (
                          user.seasonTotalPoints || 0
                        ) : (
                          liveEvent
                            ? (userDetailsMap.get(user.id)?.totalPoints ?? (user.id === currentUserId && currentUserData ? currentUserData[`${liveEvent.id}PTS`] : null) ?? (user[`${liveEvent.id}PTS`] !== undefined && user[`${liveEvent.id}PTS`] !== null ? user[`${liveEvent.id}PTS`] : 0))
                            : "No Data"
                        )}
                      </td>

                      <td className="hidden min-w-0 px-3 py-2.5 text-left text-xs text-gray-900 dark:text-gray-300 sm:table-cell sm:text-sm align-middle">
                        <span
                          className="block truncate"
                          title={
                            isSeasonView
                              ? (user.seasonmvpname || undefined)
                              : liveEvent && user[`${liveEvent.id}MVP`]
                                ? String(user[`${liveEvent.id}MVP`] || "None")
                                : undefined
                          }
                        >
                          {isSeasonView ? (
                            user.seasonmvpname || "N/A"
                          ) : (
                            liveEvent && user[`${liveEvent.id}MVP`] !== undefined && user[`${liveEvent.id}MVP`] !== null
                              ? user[`${liveEvent.id}MVP`] || "None"
                              : "None"
                          )}
                        </span>
                      </td>

                      <td className="w-16 max-w-16 px-2 py-2.5 text-left align-middle whitespace-nowrap">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center"
                          aria-label={isExpanded ? "Collapse row" : "Expand row"}
                        >
                          {isLoading ? (
                            <div className={cn(LEADERBOARD_SPINNER_BASE, "h-4 w-4")} aria-hidden={true} />
                          ) : isExpanded ? (
                            <FaChevronUp className="text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm" />
                          ) : (
                            <FaChevronDown className="text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm" />
                          )}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded row for current event details or season events */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.tr
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                          className="bg-gray-200/70 dark:bg-gray-800/70"
                        >
                          <td colSpan={5} className="px-2 py-2">
                            {isSeasonView ? (
                              <div className="pb-2">
                                <h3 className="text-xs font-medium text-gray-900 dark:text-white mb-2 border-b border-gray-300 dark:border-gray-700 pb-1">
                                  {user.displayName}&apos;s Events
                                </h3>
                                {userEvents.length === 0 ? (
                                  <p className="text-xs text-gray-600 dark:text-gray-400">No events participated</p>
                                ) : (
                                  <div className="space-y-2">
                                    {userEvents.map((event) => {
                                      const eventCacheKey = `${user.id}:${event.id}`;
                                      const eventDetails = userDetailsMap.get(eventCacheKey);
                                      const isEventExpanded = expandedUserEventId === event.id;
                                      const isEventLoading = userDetailsLoading === eventCacheKey;

                                      // Calculate MVP from picks (rank 1 player) or use stored MVP
                                      let mvpName = "None";
                                      if (eventDetails?.picks) {
                                        const mvpPlayer = eventDetails.picks.find(pick => pick.rank === 1 || pick.rank === "1");
                                        mvpName = mvpPlayer?.name || "None";
                                      }
                                      // Fallback to stored MVP if no picks MVP found
                                      if (mvpName === "None" && event.mvp) {
                                        mvpName = event.mvp;
                                      }

                                      // Auto-fetch MVP event details for season view if not already loaded
                                      if (isSeasonView && mvpName !== "None" && !eventDetails && !userDetailsLoading) {
                                        fetchUserDetails(user.id, 0, false, event.id);
                                      }

                                      return (
                                        <div key={event.id} className="bg-gray-300/30 dark:bg-gray-700/30 rounded">
                                          <div
                                            className="flex items-center justify-between p-2 cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-700/50"
                                            onClick={() => toggleEventExpand(user.id, event.id)}
                                          >
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0">
                                              <div className="flex items-center gap-2">
                                                <span className="text-gray-900 dark:text-white text-xs font-medium">{event.name}</span>
                                                {/* Only show Live status, hide Finished */}
                                                {event.status === "live" && (
                                                  <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-600 dark:text-red-400">
                                                    {event.status}
                                                  </span>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-3">
                                                <div className="text-xs text-gray-600 dark:text-gray-400 ml-2">
                                                  <span className="font-medium text-gray-900 dark:text-white">{event.points} pts</span>
                                                  {mvpName !== "None" && (
                                                    <span className="ml-2 text-yellow-600 dark:text-yellow-400">
                                                      • MVP: {mvpName}
                                                    </span>
                                                  )}
                                                </div>
                                                {isEventLoading ? (
                                                  <div className={cn(LEADERBOARD_SPINNER_BASE, "h-3 w-3")} aria-hidden={true} />
                                                ) : isEventExpanded ? (
                                                  <FaChevronUp className="text-gray-500 dark:text-gray-400 text-xs" />
                                                ) : (
                                                  <FaChevronDown className="text-gray-500 dark:text-gray-400 text-xs" />
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                          <AnimatePresence>
                                            {isEventExpanded && eventDetails && (
                                              <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                exit={{ opacity: 0, height: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="border-t border-gray-700/50 p-2"
                                              >
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                                                  {eventDetails.picks
                                                    .slice()
                                                    .sort((a, b) => b.points - a.points)
                                                    .map((pick, pickIndex) => (
                                                      <div
                                                        key={`${event.id}-${pick.id}-${pickIndex}`}
                                                        className={`bg-gray-300/50 dark:bg-gray-700/50 p-2 rounded hover:bg-gray-300/80 dark:hover:bg-gray-700/70 transition-colors ${pick.isCaptain ? "border-2 border-yellow-600 dark:border-yellow-400" : ""
                                                          }`}
                                                      >
                                                        <div className="grid grid-cols-2 gap-x-4 text-xs">
                                                          <div>
                                                            <div className="text-gray-900 dark:text-white font-medium truncate mb-1 flex items-center gap-1">
                                                              {pick.name}
                                                              {pick.isCaptain && (
                                                                <span className="w-4 h-4 rounded-full bg-yellow-600 dark:bg-yellow-400 text-white dark:text-black text-[10px] font-bold flex items-center justify-center shadow-lg">
                                                                  C
                                                                </span>
                                                              )}
                                                            </div>
                                                            <div className="text-gray-600 dark:text-gray-400">Rank: <span className="text-gray-900 dark:text-white">{pick.rank ?? 0}</span></div>
                                                          </div>
                                                          <div className="space-y-1">
                                                            <div className="text-gray-600 dark:text-gray-400">Score: <span className="font-medium text-gray-900 dark:text-white">{pick.points}</span></div>
                                                            <div className="text-gray-600 dark:text-gray-400">Cost: <span className="text-gray-900 dark:text-white">${pick.cost}</span></div>
                                                            <div className="text-gray-600 dark:text-gray-400">ROI: <span className="pickem-numeric text-yellow-600 dark:text-yellow-400">${pick.kills === 0 || pick.cost === 0 ? 0 : (pick.cost / pick.kills).toFixed(0)}</span></div>
                                                          </div>
                                                        </div>
                                                      </div>
                                                    ))}
                                                </div>
                                              </motion.div>
                                            )}
                                          </AnimatePresence>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            ) : isLoading ? (
                              <div className="flex items-center justify-center py-4">
                                <div className={cn(LEADERBOARD_SPINNER_BASE, "h-6 w-6")} aria-hidden={true} />
                              </div>
                            ) : userDetailsMap.has(liveEvent ? `${user.id}:${liveEvent.id}` : user.id) ? (
                              <div className="pb-2">
                                <h3 className="text-xs font-medium text-gray-900 dark:text-white mb-2 border-b border-gray-300 dark:border-gray-700 pb-1">
                                  {user.displayName}&apos;s Team
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                                  {userDetailsMap.get(liveEvent ? `${user.id}:${liveEvent.id}` : user.id)?.picks
                                    .slice()
                                    .sort((a, b) => b.points - a.points)
                                    .map((pick, pickIndex) => (
                                      <div
                                        key={`${user.id}-${pick.id}-${pickIndex}`}
                                        className={`bg-gray-300/50 dark:bg-gray-700/50 p-2 rounded hover:bg-gray-300/80 dark:hover:bg-gray-700/70 transition-colors ${pick.isCaptain ? "border-2 border-yellow-600 dark:border-yellow-400" : ""
                                          }`}
                                      >
                                        <div className="grid grid-cols-2 gap-x-4 text-xs">
                                          <div>
                                            <div className="text-gray-900 dark:text-white font-medium truncate mb-1 flex items-center gap-1">
                                              {pick.name}
                                              {pick.isCaptain && (
                                                <span className="w-4 h-4 rounded-full bg-yellow-600 dark:bg-yellow-400 text-white dark:text-black text-[10px] font-bold flex items-center justify-center shadow-lg">
                                                  C
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-gray-600 dark:text-gray-400">Rank: <span className="text-gray-900 dark:text-white">{pick.rank ?? 0}</span></div>
                                          </div>
                                          <div className="space-y-1">
                                            <div className="text-gray-600 dark:text-gray-400">Score: <span className="font-medium text-gray-900 dark:text-white">{pick.points}</span></div>
                                            <div className="text-gray-600 dark:text-gray-400">Cost: <span className="text-gray-900 dark:text-white">${pick.cost}</span></div>
                                            <div className="text-gray-600 dark:text-gray-400">ROI: <span className="pickem-numeric text-yellow-600 dark:text-yellow-400">${pick.kills === 0 || pick.cost === 0 ? 0 : (pick.cost / pick.kills).toFixed(0)}</span></div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 py-2">No team data available</p>
                            )}
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-xs text-gray-600 dark:text-gray-400">
                  {isSearchMode
                    ? `No participants found matching "${searchQuery}".`
                    : "No participants found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </section>

      {/* Pagination - Bottom */}
      {
        // !isSearchMode && users.length > 0 && (
        //   <div className="flex flex-row items-center justify-between mt-4 gap-2 mb-7 sm:mb-0">
        //     <div className="flex items-center gap-2">
        //       <span className="text-xs text-gray-600 dark:text-gray-300">Rows:</span>
        //       <select
        //         value={itemsPerPage}
        //         onChange={(e) => handlePageSizeChange(Number(e.target.value))}
        //         disabled={pageLoading}
        //         className="bg-gray-800 text-white text-xs rounded px-2 py-1 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        //       >
        //         {PAGE_SIZES.map((size) => (
        //           <option key={size} value={size}>
        //             {size}
        //           </option>
        //         ))}
        //       </select>
        //     </div>

        //     <div className="flex items-center gap-2">
        //       <span className="text-xs text-gray-600 dark:text-gray-300">Page {page}</span>
        //       <button
        //         onClick={handlePreviousPage}
        //         disabled={page === 1 || pageLoading}
        //         className="px-3 py-1 rounded bg-gray-800 text-white text-xs disabled:opacity-50 hover:bg-gray-700 transition-colors border border-gray-700"
        //       >
        //         Prev
        //       </button>
        //       <button
        //         onClick={handleNextPage}
        //         disabled={!hasMorePages || pageLoading}
        //         className="px-3 py-1 rounded bg-gray-800 text-white text-xs disabled:opacity-50 hover:bg-gray-700 transition-colors border border-gray-700"
        //       >
        //         Next
        //       </button>
        //     </div>
        //   </div>
        // )
      }
      </main>
      {/* League Modals */}
      <CreateLeagueModal
        isOpen={showCreateLeague}
        onClose={() => setShowCreateLeague(false)}
      />
      <JoinLeagueModal
        isOpen={showJoinLeague}
        onClose={() => setShowJoinLeague(false)}
      />
    </div>
  );
}

export default function LeaderboardNew() {
  return (
    <ErrorBoundaryWrapper>
      <LeaderboardNewContent />
    </ErrorBoundaryWrapper>
  );
}
