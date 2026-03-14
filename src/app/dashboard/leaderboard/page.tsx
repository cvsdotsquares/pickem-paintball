"use client";

import { useState, useEffect, Fragment, useMemo, useCallback } from "react";
import { db, storage } from "@/src/lib/firebaseClient";
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { motion, AnimatePresence } from "framer-motion";
import { ProgressiveBlur } from "@/src/components/ui/progressive-blur";
import { FaChevronDown, FaChevronUp, FaUser, FaSearch, FaTimes, FaTrophy } from "react-icons/fa";
import { getAuth } from "firebase/auth";
import { LeaderboardSkeleton } from "@/src/components/LoadingSkeleton";
import { ErrorBoundaryWrapper } from "@/src/components/ErrorBoundaryWrapper";
import { getFirebaseStorageUrl } from "@/src/lib/storage";
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

// Cache for profile picture download URLs to avoid repeated Storage API calls
const profilePictureUrlCache = new Map<string, string>();

// Helper to get download URL with caching
const getProfilePictureUrl = async (storagePath: string): Promise<string | undefined> => {
  const normalizedPath = typeof storagePath === "string" ? storagePath.trim() : "";
  if (!normalizedPath) return undefined;

  // If it's already a URL (including protocol-relative) or data URI, return as-is
  if (/^(https?:)?\/\//i.test(normalizedPath) || normalizedPath.startsWith("data:")) {
    return normalizedPath.startsWith("//") ? `https:${normalizedPath}` : normalizedPath;
  }

  // Check cache first
  if (profilePictureUrlCache.has(normalizedPath)) {
    return profilePictureUrlCache.get(normalizedPath);
  }

  try {
    const storageRef = ref(storage, normalizedPath);
    const url = await getDownloadURL(storageRef);
    // Cache the URL
    profilePictureUrlCache.set(normalizedPath, url);
    return url;
  } catch {
    // Silently ignore if image doesn't exist
    return undefined;
  }
};

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
  const [itemsPerPage, setItemsPerPage] = useState(10);
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

  // League modals
  const [showCreateLeague, setShowCreateLeague] = useState(false);
  const [showJoinLeague, setShowJoinLeague] = useState(false);

  const PAGE_SIZES = [10, 20, 50];
  const MAX_RETRIES = 3;

  // Event Card Component
  let backgroundIndex = 0;
  function EventCard({ event, isSelected, onClick }: { event: LiveEvent; isSelected: boolean; onClick: () => void }) {
    const backgroundSrc = `/background${backgroundIndex}.jpg`;
    backgroundIndex = (backgroundIndex + 1) % 3;

    return (
      <article
        onClick={onClick}
        className={`relative flex flex-col cursor-pointer md:w-[200px] shrink-0 grow-0 basis-auto md:h-[170px] w-[120px] h-[130px] ${isSelected ? "border-4 rounded-xl border-blue-500 dark:border-white" : ""
          }`}
      >
        <div className="relative flex flex-col justify-center items-center w-full h-full overflow-hidden rounded-lg logographics">
          {event.event_logo ? (
            <>
              <div className="absolute inset-0 bg-white dark:bg-black rounded-lg"></div>
              <img
                src={event.event_logo}
                alt={`${event.name} logo`}
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
              <div className="relative flex flex-col items-center justify-center p-4 text-white overflow-auto">
                {event.name && (
                  <div
                    className="text-center font-azonix"
                    style={{
                      fontSize: "clamp(0.8rem, 2vw, 1.5rem)",
                      lineHeight: "1.2",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "wrap",
                    }}
                  >
                    {event.name}
                  </div>
                )}
                {event.status && (
                  <div
                    className={`text-center font-azonix ${event.status === "live" ? "text-red-500" : "text-gray-300"
                      }`}
                    style={{
                      fontSize: "clamp(0.5rem, 1.5vw, 1rem)",
                      lineHeight: "1.2",
                    }}
                  >
                    {event.status}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </article>
    );
  }

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

          const event = {
            id,
            name: doc.get("name") || "Unnamed Event",
            status: doc.get("status") || "archived",
            event_place: doc.get("event_place") || "0",
            year: doc.get("year") || yearFromId,
            lockDate: doc.get("lockDate") || null,
            event_logo: doc.get("event_logo") || undefined,
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
    const unsub = onSnapshot(doc(db, "leaderboards", `season_${selectedSeason}`), (snap) => {
      if (!snap.exists()) {
        setUsers([]);
        setHasMorePages(false);
        setUsersLoading(false);
        return;
      }

      const allUsers: any[] = snap.data()?.users || [];

      // Apply league filter client-side
      const filtered = selectedLeague
        ? allUsers.filter(u => (u.leagues || []).includes(selectedLeague.id))
        : allUsers;

      const start = (page - 1) * itemsPerPage;
      setUsers(filtered.slice(start, start + itemsPerPage));
      setHasMorePages(filtered.length > start + itemsPerPage);
      setUsersLoading(false);
    });

    return () => unsub();
  }, [isSeasonView, selectedSeason, page, itemsPerPage, selectedLeague?.id]);

  // Fetch users with Firestore sorting by currentRank
  // ── Live leaderboard: onSnapshot on summary doc written by Cloud Function ──
  useEffect(() => {
    if (!liveEvent || isSearchMode || isSeasonView) return;

    setPageLoading(true);
    const unsub = onSnapshot(doc(db, "leaderboards", liveEvent.id), (snap) => {
      if (!snap.exists()) {
        // Summary doc not yet created (first deploy / new event) — fall back to empty
        setUsers([]);
        setTotalParticipants(0);
        setHasMorePages(false);
        setPageLoading(false);
        setUsersLoading(false);
        return;
      }

      const allUsers: any[] = snap.data()?.users || [];
      setTotalParticipants(snap.data()?.totalParticipants || allUsers.length);

      // Apply league filter client-side
      const filtered = selectedLeague
        ? allUsers.filter(u => (u.leagues || []).includes(selectedLeague.id))
        : allUsers;

      // Normalise to the shape the rest of the page expects
      const normalised: User[] = filtered.map(u => ({
        id: u.id,
        displayName: u.displayName,
        profilePicture: u.profilePicture || undefined,
        isSubscribed: u.isSubscribed || false,
        leagues: u.leagues,
        [`${liveEvent.id}Rank`]: u.eventRank,
        [`${liveEvent.id}PTS`]: u.eventPTS,
        [`${liveEvent.id}MVP`]: u.mvp,
      }));

      // Paginate client-side
      const start = (page - 1) * itemsPerPage;
      setUsers(normalised.slice(start, start + itemsPerPage));
      setHasMorePages(filtered.length > start + itemsPerPage);
      setPageLoading(false);
      setUsersLoading(false);
    });

    return () => unsub();
  }, [liveEvent?.id, isSearchMode, isSeasonView, selectedLeague?.id, page, itemsPerPage]);

  // Reset pagination when event or league changes
  useEffect(() => {
    if (liveEvent) {
      setPage(1);
      setExpandedUserId(null);
      setTotalParticipants(0);
    }
  }, [liveEvent?.id, selectedLeague?.id]);

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
      setLastDoc(null);
      return;
    }

    try {
      setPageLoading(true);
      setIsSearchMode(true);
      setShowSuggestions(false);

      const usersCollection = collection(db, "users");
      const searchTermLower = searchTerm.toLowerCase();

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
          return parseInt(aRank) - parseInt(bRank);
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
      <div className="p-2 pt-0 sm:pt-0 pb-24 sm:pb-4 sm:p-4 h-[calc(100vh-48px)] min-h-[220px] overflow-auto bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-center text-white text-lg">
            No active event currently running.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 pt-0 sm:pt-0 pb-24 sm:pb-4 sm:p-4 h-[calc(100vh-48px)] min-h-[220px] overflow-auto bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
      {/* Event Header */}
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

        <h1 className="relative font-azonix max-w-full m-auto md:text-7xl text-4xl">
          Leaderboard
        </h1>
      </header>

      {/* Year Filter */}
      <div className="flex justify-center px-4 mt-4">
        <div className="flex flex-wrap gap-2 justify-center">
          {useMemo(() => {
            const uniqueYears = new Set(allEvents.map((event) => event.year).filter(year => year !== "2024"));
            return [
              "All",
              ...Array.from(uniqueYears).sort(
                (a, b) => parseInt(b || "0") - parseInt(a || "0")
              ),
            ];
          }, [allEvents]).map((year) => (
            <button
              key={year}
              onClick={() => setSelectedYear(year || "All")}
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

      {/* Events Carousel */}
      <div className="px-4 mt-6">
        <div className="bg-gray-100/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-xl p-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white font-azonix mb-4">Select Event</h3>
          <div className="flex flex-row overflow-x-auto gap-4 items-center">
            {/* Season Cards - Generate dynamically for each year based on selected year filter */}
            {useMemo(() => {
              // Get unique years from all events (excluding 2024)
              const allUniqueYears = Array.from(new Set(allEvents.map((event) => event.year).filter(year => year !== "2024")));

              // Filter years based on selectedYear
              const yearsToShow = selectedYear === "All"
                ? allUniqueYears
                : allUniqueYears.filter(year => year === selectedYear);

              return yearsToShow.sort((a, b) => parseInt(b || "0") - parseInt(a || "0")).map((year) => (
                <article
                  key={`season-${year}`}
                  onClick={() => {
                    setIsSeasonView(true);
                    setSelectedSeason(year || '2025');
                    setLiveEvent(null);
                    setPage(1);
                    setUserEventsMap(new Map());
                  }}
                  className={`relative flex flex-col cursor-pointer md:w-[200px] shrink-0 grow-0 basis-auto md:h-[170px] w-[120px] h-[130px] ${isSeasonView && selectedSeason === year ? "border-4 rounded-xl border-blue-500 dark:border-white" : ""
                    }`}
                >
                  <div className="relative flex flex-col justify-center items-center w-full h-full overflow-hidden rounded-lg logographics">
                    <img
                      src="/background0.jpg"
                      alt={`Season ${year}`}
                      className="absolute inset-0 w-full h-full object-cover rounded-lg"
                    />
                    <div className="relative flex flex-col items-center justify-center p-4 text-white overflow-auto">
                      <div
                        className="text-center font-azonix"
                        style={{
                          fontSize: "clamp(0.8rem, 2vw, 1.5rem)",
                          lineHeight: "1.2",
                        }}
                      >
                        Season {year}
                      </div>
                      <div
                        className="text-center font-azonix text-yellow-400"
                        style={{
                          fontSize: "clamp(0.5rem, 1.5vw, 1rem)",
                          lineHeight: "1.2",
                        }}
                      >
                        All Events
                      </div>
                    </div>
                  </div>
                </article>
              ));
            }, [allEvents, isSeasonView, selectedSeason, selectedYear])}

            {allEvents.filter(event => selectedYear === "All" || event.year === selectedYear).map((event) => (
              <EventCard
                key={event.id}
                event={event}
                isSelected={!isSeasonView && liveEvent?.id === event.id}
                onClick={() => {
                  setIsSeasonView(false);
                  setSelectedSeason(null);
                  setLiveEvent(event);
                  setPage(1);
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4 text-center pt-3 sm:pt-7">
        {/* {eventLoading ? (
          <div className="h-8 bg-gray-700 rounded w-48 mx-auto animate-pulse"></div>
        ) : (
          <h1 className="text-xl sm:text-2xl font-bold mb-1">{liveEvent?.name}</h1>
        )} */}
      </div>

      {/* Current User Card */}
      {currentUserLoading ? (
        <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 pt-4 pb-4 mb-4">
          <div className="bg-gray-200/100 dark:bg-gray-800/100 rounded-lg shadow border border-gray-300 dark:border-gray-700 p-3">
            <div className="flex items-center">
              <div className="w-14 h-14 rounded-full bg-gray-700 animate-pulse mr-3"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-700 rounded w-32 mb-2 animate-pulse"></div>
                <div className="h-3 bg-gray-700 rounded w-24 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      ) : currentUserData && liveEvent && (
        <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 pt-4 pb-4 mb-4">
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
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="relative">
                    {currentUserData.profilePicture ? (
                      <img
                        src={getFirebaseStorageUrl(currentUserData.profilePicture)}
                        alt="Profile"
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-yellow-400"
                      />
                    ) : (
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center border-2 border-yellow-400">
                        <FaUser className="text-xl text-gray-500 dark:text-gray-400" />
                      </div>
                    )}
                    {liveEvent && currentUserData[`${liveEvent.id}Rank`] && (
                      <div className="absolute -top-1 -right-1 bg-yellow-500 text-black w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-bold text-xs">
                        #{currentUserData[`${liveEvent.id}Rank`]}
                      </div>
                    )}
                  </div>
                  <div className="ml-3">
                    <h3 className="font-bold text-sm sm:text-base flex items-center">
                      {currentUserData.displayName}
                      <span className="ml-1 text-xs bg-blue-600 px-1.5 py-0.5 rounded">
                        You
                      </span>
                    </h3>
                    <div className="flex items-center mt-0.5">
                      <FaTrophy className="text-yellow-400 mr-1 text-sm" />
                      <span className="font-medium text-sm">
                        Points: {liveEvent && currentUserData[`${liveEvent.id}PTS`] !== undefined
                          ? currentUserData[`${liveEvent.id}PTS`]
                          : 0}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      MVP: {liveEvent && currentUserData[`${liveEvent.id}MVP`] !== undefined
                        ? currentUserData[`${liveEvent.id}MVP`] || "None"
                        : "None"}
                    </p>
                  </div>
                </div>
                {currentUserCardLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500"></div>
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
                                <div className="text-gray-600 dark:text-gray-400">Score: <span className="text-green-600 dark:text-green-400 font-medium">{pick.points}</span></div>
                                <div className="text-gray-600 dark:text-gray-400">Cost: <span className="text-gray-900 dark:text-white">${pick.cost}</span></div>
                                <div className="text-gray-600 dark:text-gray-400">ROI: <span className="text-yellow-600 dark:text-yellow-400">${pick.kills === 0 || pick.cost === 0 ? 0 : (pick.cost / pick.kills).toFixed(2)}</span></div>
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

      {/* League Selector */}
      {!eventLoading && (liveEvent || isSeasonView) && (
        <LeagueSelector
          onCreateLeague={() => setShowCreateLeague(true)}
          onJoinLeague={() => setShowJoinLeague(true)}
        />
      )}

      {/* Search Bar */}
      {eventLoading ? (
        <div className="relative mt-4 mb-4">
          <div className="h-10 bg-gray-700 rounded-lg animate-pulse"></div>
        </div>
      ) : (
        <div className="relative mt-4 mb-4">
          <form onSubmit={handleSearchSubmit} className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FaSearch className="text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search players..."
              className="w-full pl-9 pr-10 py-2 text-sm bg-gray-200 dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                <FaTimes className="text-gray-400 hover:text-white text-sm" />
              </button>
            )}
          </form>

        </div>
      )}

      {/* Participant count */}
      {!eventLoading && !isSearchMode && !isSeasonView && totalParticipants > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          {totalParticipants} team{totalParticipants !== 1 ? 's' : ''} entered
        </div>
      )}

      {/* Pagination */}
      {!eventLoading && !isSearchMode && users.length > 0 && (
        <div className="flex flex-row items-center justify-between my-4 gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 dark:text-gray-300">Rows:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              disabled={pageLoading}
              className="bg-gray-800 text-white text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-row items-center gap-2">
            <span className="text-xs text-gray-600 dark:text-gray-300">Page {page}</span>
            <button
              onClick={handlePreviousPage}
              disabled={page === 1 || pageLoading}
              className="px-3 py-1 rounded bg-gray-800 text-white text-xs disabled:opacity-50 hover:bg-gray-700 transition-colors"
            >
              Prev
            </button>
            <button
              onClick={handleNextPage}
              disabled={!hasMorePages || pageLoading || usersLoading}
              className="px-3 py-1 rounded bg-gray-800 text-white text-xs disabled:opacity-50 hover:bg-gray-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Leaderboard Table */}
      <div className="overflow-x-auto rounded-lg shadow bg-gray-200/50 dark:bg-gray-800/50 backdrop-blur-sm">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-300/80 dark:bg-gray-700/80">
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider sticky left-0 z-20">
                Rank
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Player
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Pts
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider hidden sm:table-cell">
                MVP
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300/50 dark:divide-gray-700/50">
            {(eventLoading || usersLoading || (pageLoading && page === 1)) ? (
              <LeaderboardSkeleton rows={itemsPerPage} />
            ) : users.length > 0 ? (
              users.map((user, index) => {
                const userEvents = userEventsMap.get(user.id) || [];
                const isExpanded = expandedUserId === user.id;
                const cacheKey = liveEvent ? `${user.id}:${liveEvent.id}` : user.id;
                const isLoading = isSeasonView ? false : userDetailsLoading === cacheKey;

                let displayRank: string | number;
                if (isSeasonView) {
                  // For season view, show sequential rank based on sorted order
                  displayRank = (page - 1) * itemsPerPage + index + 1;
                } else if (isSearchMode) {
                  displayRank = index + 1;
                } else {
                  // For individual events, show sequential rank based on sorted order
                  displayRank = (page - 1) * itemsPerPage + index + 1;
                }

                return (
                  <Fragment key={user.id}>
                    <tr
                      className={`hover:bg-gray-400/60 dark:hover:bg-gray-600/60 transition-all duration-300 cursor-pointer ${currentUserId === user.id ? "bg-blue-200/40 dark:bg-blue-900/40" : "bg-gray-200/60 dark:bg-gray-800/60"
                        } ${updatingRows.has(user.id) ? "bg-blue-300/30 dark:bg-blue-500/30 scale-[1.02]" : ""
                        }`}
                      onClick={() => toggleExpand(user.id)}
                    >
                      <td className="px-2 py-2 whitespace-nowrap text-sm sticky left-0 z-10 bg-inherit">
                        <div className="flex items-center">
                          <span className="font-medium text-gray-900 dark:text-white">{displayRank}</span>
                          {currentUserId === user.id && (
                            <span className="ml-1 text-xs bg-blue-600 px-1 py-0.5 rounded">
                              YOU
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap">
                        <div className="flex items-center">
                          {user.profilePicture ? (
                            <img
                              src={getFirebaseStorageUrl(user.profilePicture)}
                              alt={user.displayName}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-full object-cover mr-2"
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                setUsers((prev) =>
                                  prev.map((u) =>
                                    u.id === user.id ? { ...u, profilePicture: undefined } : u
                                  )
                                );
                              }}
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center mr-2">
                              <FaUser className="text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm" />
                            </div>
                          )}
                          <div className="flex items-center gap-0 max-w-[100px] sm:max-w-[150px]">
                            <span className="text-xs sm:text-sm truncate text-gray-900 dark:text-white">
                              {user.displayName}
                            </span>
                            {user.isSubscribed && <SubscriberBadge displayName={user.displayName} />}
                          </div>
                        </div>
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                        {isSeasonView ? (
                          user.seasonTotalPoints || 0
                        ) : (
                          liveEvent
                            ? (userDetailsMap.get(user.id)?.totalPoints ?? (user.id === currentUserId && currentUserData ? currentUserData[`${liveEvent.id}PTS`] : null) ?? (user[`${liveEvent.id}PTS`] !== undefined && user[`${liveEvent.id}PTS`] !== null ? user[`${liveEvent.id}PTS`] : 0))
                            : "No Data"
                        )}
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap text-xs sm:text-sm text-gray-900 dark:text-gray-300 hidden sm:table-cell">
                        {isSeasonView ? (
                          user.seasonmvpname || "N/A"
                        ) : (
                          liveEvent && user[`${liveEvent.id}MVP`] !== undefined && user[`${liveEvent.id}MVP`] !== null
                            ? user[`${liveEvent.id}MVP`] || "None"
                            : "None"
                        )}
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap">
                        <button className="flex items-center justify-center w-full">
                          {isLoading ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500"></div>
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
                                                  <span className="text-green-600 dark:text-green-400 font-medium">{event.points} pts</span>
                                                  {mvpName !== "None" && (
                                                    <span className="ml-2 text-yellow-600 dark:text-yellow-400">
                                                      • MVP: {mvpName}
                                                    </span>
                                                  )}
                                                </div>
                                                {isEventLoading ? (
                                                  <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-blue-500"></div>
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
                                                            <div className="text-gray-600 dark:text-gray-400">Score: <span className="text-green-600 dark:text-green-400 font-medium">{pick.points}</span></div>
                                                            <div className="text-gray-600 dark:text-gray-400">Cost: <span className="text-gray-900 dark:text-white">${pick.cost}</span></div>
                                                            <div className="text-gray-600 dark:text-gray-400">ROI: <span className="text-yellow-600 dark:text-yellow-400">${pick.kills === 0 || pick.cost === 0 ? 0 : (pick.cost / pick.kills).toFixed(0)}</span></div>
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
                                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
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
                                            <div className="text-gray-600 dark:text-gray-400">Score: <span className="text-green-600 dark:text-green-400 font-medium">{pick.points}</span></div>
                                            <div className="text-gray-600 dark:text-gray-400">Cost: <span className="text-gray-900 dark:text-white">${pick.cost}</span></div>
                                            <div className="text-gray-600 dark:text-gray-400">ROI: <span className="text-yellow-600 dark:text-yellow-400">${pick.kills === 0 || pick.cost === 0 ? 0 : (pick.cost / pick.kills).toFixed(0)}</span></div>
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
