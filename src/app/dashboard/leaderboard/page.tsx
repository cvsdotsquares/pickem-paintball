"use client";

import { useState, useEffect, Fragment, useMemo, useCallback } from "react";
import { db, storage } from "@/src/lib/firebaseClient";
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  QueryConstraint,
  startAfter,
  DocumentSnapshot,
  doc,
  getDoc,
  orderBy,
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

// Simple in-memory cache for paginated participants
const participantsCache = new Map<string, {
  users: User[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}>();

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
  } catch {}
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
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
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
        className={`relative flex flex-col cursor-pointer md:w-[200px] shrink-0 grow-0 basis-auto md:h-[170px] w-[120px] h-[130px] ${
          isSelected ? "border-4 rounded-xl border-blue-500 dark:border-white" : ""
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
                    className={`text-center font-azonix ${
                      event.status === "live" ? "text-red-500" : "text-gray-300"
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
          
          // Special handling for tampa_bay_2025
          if (id === 'tampa_bay_2025') {
            console.log('Tampa Bay 2025 event found:', event);
            console.log('Raw document data:', doc.data());
          }
          
          return event;
        });

        // Debug: Log all events to check for Tampa
        console.log('All events fetched:', events.map(e => ({ id: e.id, name: e.name, year: e.year })));
        
        // Check specifically for Tampa events
        const tampaEvents = events.filter(e => e.name.toLowerCase().includes('tampa') || e.id.includes('tampa'));
        console.log('Tampa events found:', tampaEvents);
        
        // Force include tampa_bay_2025 if missing
        const hasTampa = events.some(e => e.id === 'tampa_bay_2025');
        console.log('Tampa Bay 2025 exists in events:', hasTampa);
        
        if (!hasTampa) {
          console.warn('tampa_bay_2025 not found in events, adding manually');
          events.push({
            id: 'tampa_bay_2025',
            name: 'Tampa Bay 2025',
            status: 'archived',
            event_place: '1',
            year: '2025',
            lockDate: null,
            event_logo: undefined
          });
        }
        
        // Debug final events list
        console.log('Final events list:', events.length, events.map(e => e.id));

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
        setLastDoc(null);
        participantsCache.clear();
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
    async function fetchSeasonUsers() {
      if (!isSeasonView || !selectedSeason) return;

      try {
        setUsersLoading(true);
        const usersCollection = collection(db, "users");
        
        // Get all users who participated in any 2025 event
        const season2025Events = allEvents.filter(e => e.year === '2025');
        console.log('Season 2025 events for user fetching:', season2025Events.map(e => ({ id: e.id, name: e.name })));
        
        const querySnapshot = await getDocs(usersCollection);
        
        const seasonUsers: User[] = [];
        querySnapshot.docs.forEach((userDoc) => {
          const pickems = userDoc.get("pickems") || {};
          const hasParticipated = season2025Events.some(event => 
            Array.isArray(pickems[event.id]) && pickems[event.id].length > 0
          );
          
          // Apply league filter if selected
          const isInLeague = selectedLeague 
            ? (userDoc.get("leagues") || []).includes(selectedLeague.id)
            : true;
          
          if (hasParticipated && isInLeague) {
            // Calculate total points across all 2025 events
            let totalPoints = 0;
            const eventPoints: Record<string, number> = {};
            season2025Events.forEach(event => {
              const pts = parseFloat(userDoc.get(`${event.id}PTS`)) || 0;
              totalPoints += pts;
              eventPoints[event.id] = pts;
            });
            
            // Debug: Log user data for Tampa specifically
            const tampaEvent = season2025Events.find(e => e.id === 'tampa_bay_2025');
            if (tampaEvent && userDoc.id === 'test-user-id') { // Replace with actual user ID for testing
              const tampaPts = userDoc.get(`${tampaEvent.id}PTS`);
              const tampaMvp = userDoc.get(`${tampaEvent.id}MVP`);
              const tampaRank = userDoc.get(`${tampaEvent.id}Rank`);
              console.log(`User ${userDoc.get('name')} Tampa data:`, { 
                pts: tampaPts, 
                mvp: tampaMvp, 
                rank: tampaRank,
                eventId: tampaEvent.id,
                allUserFields: Object.keys(userDoc.data() || {})
              });
            }
            
            seasonUsers.push({
              id: userDoc.id,
              displayName: userDoc.get("name") || userDoc.get("username") || "Unknown User",
              profilePicture: userDoc.get("profilePicture") || undefined,
              pickemData: userDoc.get("pickemData") || undefined,
              seasonTotalPoints: totalPoints,
            });
          }
        });
        
        console.log(`Found ${seasonUsers.length} users for season 2025`);
        
        // Sort by total points descending
        seasonUsers.sort((a, b) => {
          const aPts = a.seasonTotalPoints || 0;
          const bPts = b.seasonTotalPoints || 0;
          return bPts - aPts;
        });
        
        // Apply pagination for season view
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedUsers = seasonUsers.slice(startIndex, endIndex);
        
        setUsers(paginatedUsers);
        setHasMorePages(endIndex < seasonUsers.length);
        setUsersLoading(false);
      } catch (error) {
        console.error("Error fetching season users:", error);
        setUsersLoading(false);
      }
    }

    fetchSeasonUsers();
  }, [isSeasonView, selectedSeason, allEvents, page, itemsPerPage, selectedLeague]);

  // Fetch users with Firestore sorting by currentRank
  useEffect(() => {
    async function fetchParticipants() {
      if (!liveEvent || isSearchMode || isSeasonView) return;

      try {
        setPageLoading(true);
        const usersCollection = collection(db, "users");

        // Check cache first
        const cacheKey = `${liveEvent.id}:${itemsPerPage}:${page}:${selectedLeague?.id || 'all'}`;
        const cached = participantsCache.get(cacheKey);
        if (cached) {
          setUsers(cached.users);
          setLastDoc(cached.lastDoc);
          setHasMorePages(cached.hasMore);
          setPageLoading(false);
          return;
        }

        // Build query with dynamic event-specific rank field
        let constraints: QueryConstraint[];
        
        if (selectedLeague) {
          // For league filtering, get all league members
          constraints = [
            where('leagues', 'array-contains', selectedLeague.id),
            limit(1000)
          ];
        } else {
          // For all players, fetch users who participated in this event
          constraints = [
            where(`pickems.${liveEvent.id}`, '!=', null),
            limit(1000),
          ];
          
          // Debug for Tampa Bay
          if (liveEvent.id === 'tampa_bay_2025') {
            console.log('Fetching participants for Tampa Bay 2025');
          }
        }

        // Pagination with startAfter (only for non-league queries)
        if (page > 1 && lastDoc && !selectedLeague) {
          constraints.push(startAfter(lastDoc));
        }

        const participantsQuery = query(usersCollection, ...constraints);
        const querySnapshot = await getDocs(participantsQuery);

        // For league filtering, show ALL league members (not just those who participated)
        let participants: User[];
        
        if (selectedLeague) {
          participants = querySnapshot.docs
            .map((userDoc) => {
              const userData: User = {
                id: userDoc.id,
                displayName: userDoc.get("name") || userDoc.get("username") || "Unknown User",
                profilePicture: userDoc.get("profilePicture") || undefined,
                pickemData: userDoc.get("pickemData") || undefined,
              };
              userData[`${liveEvent.id}Rank`] = userDoc.get(`${liveEvent.id}Rank`);
              userData[`${liveEvent.id}PTS`] = userDoc.get(`${liveEvent.id}PTS`);
              userData[`${liveEvent.id}MVP`] = userDoc.get(`${liveEvent.id}MVP`);
              return userData;
            })
            .sort((a, b) => {
              const aPts = parseFloat(a[`${liveEvent.id}PTS`]) || 0;
              const bPts = parseFloat(b[`${liveEvent.id}PTS`]) || 0;
              if (bPts !== aPts) return bPts - aPts;
              
              const aRank = parseInt(a[`${liveEvent.id}Rank`]) || 999999;
              const bRank = parseInt(b[`${liveEvent.id}Rank`]) || 999999;
              return aRank - bRank;
            })
            .slice((page - 1) * itemsPerPage, page * itemsPerPage);
          
          setHasMorePages(querySnapshot.docs.length > page * itemsPerPage);
        } else {
          // For all players, filter for event participation
          const docsWithParticipation = querySnapshot.docs.filter((doc) => {
            const pickems = doc.get("pickems") || {};
            const hasPickems = Array.isArray(pickems[liveEvent.id]) && pickems[liveEvent.id].length > 0;
            const hasPTS = doc.get(`${liveEvent.id}PTS`) !== undefined;
            const hasRank = doc.get(`${liveEvent.id}Rank`) !== undefined;
            
            // Debug for Tampa Bay
            if (liveEvent.id === 'tampa_bay_2025' && hasPickems) {
              console.log(`User ${doc.get('name')} has Tampa picks:`, {
                picks: pickems[liveEvent.id],
                pts: doc.get(`${liveEvent.id}PTS`),
                rank: doc.get(`${liveEvent.id}Rank`),
                mvp: doc.get(`${liveEvent.id}MVP`)
              });
            }
            
            // For Tampa Bay 2025, show users even if they don't have PTS/Rank data
            if (liveEvent.id === 'tampa_bay_2025') {
              return hasPickems; // Show if they have picks, even without results
            }
            
            return hasPickems && (hasPTS || hasRank);
          });
          
          console.log(`Found ${docsWithParticipation.length} participants for ${liveEvent.id}`);
          
          const hasMore = docsWithParticipation.length > itemsPerPage;
          setHasMorePages(hasMore);
          
          const docsToDisplay = docsWithParticipation.slice(0, itemsPerPage);
          
          participants = docsToDisplay
            .map((userDoc) => {
              const userData: User = {
                id: userDoc.id,
                displayName: userDoc.get("name") || userDoc.get("username") || "Unknown User",
                profilePicture: userDoc.get("profilePicture") || undefined,
                pickemData: userDoc.get("pickemData") || undefined,
              };
              userData[`${liveEvent.id}Rank`] = userDoc.get(`${liveEvent.id}Rank`);
              userData[`${liveEvent.id}PTS`] = userDoc.get(`${liveEvent.id}PTS`);
              userData[`${liveEvent.id}MVP`] = userDoc.get(`${liveEvent.id}MVP`);
              return userData;
            })
            .sort((a, b) => {
              const aPts = parseFloat(a[`${liveEvent.id}PTS`]) || 0;
              const bPts = parseFloat(b[`${liveEvent.id}PTS`]) || 0;
              if (bPts !== aPts) return bPts - aPts;
              
              const aRank = parseInt(a[`${liveEvent.id}Rank`]) || 999999;
              const bRank = parseInt(b[`${liveEvent.id}Rank`]) || 999999;
              return aRank - bRank;
            });
          
          // Store last doc for pagination
          if (docsToDisplay.length > 0) {
            setLastDoc(docsToDisplay.at(-1) ?? null);
          }
        }

        setUsers(participants);

        // Save to cache
        participantsCache.set(cacheKey, {
          users: participants,
          lastDoc: selectedLeague ? null : (querySnapshot.docs.at(-1) ?? null),
          hasMore: selectedLeague ? (querySnapshot.docs.length > page * itemsPerPage) : hasMorePages,
        });

        setPageLoading(false);
        setUsersLoading(false);
      } catch (error) {
        console.error("Error fetching participants:", error);
        setPageLoading(false);
        setUsersLoading(false);
      }
    }

    fetchParticipants();
  }, [liveEvent, page, itemsPerPage, isSearchMode, selectedLeague, isSeasonView]);

  // Reset pagination and cache when liveEvent or selectedLeague changes
  useEffect(() => {
    if (liveEvent) {
      setPage(1);
      setLastDoc(null);
      participantsCache.clear();
      setExpandedUserId(null); // Close expanded rows when event changes
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
          const displayName = userDoc.get("name") || userDoc.get("username") || "Unknown User";
          const profilePicture = userDoc.get("profilePicture") || undefined;
          const pickemData = userDoc.get("pickemData") || undefined;

          setCurrentUserData({
            id: currentUserId,
            displayName,
            profilePicture,
            pickemData,
            rank: undefined, // Placeholder for now
            [`${liveEvent.id}Rank`]: userDoc.get(`${liveEvent.id}Rank`),
            [`${liveEvent.id}PTS`]: userDoc.get(`${liveEvent.id}PTS`),
            [`${liveEvent.id}MVP`]: userDoc.get(`${liveEvent.id}MVP`),
          });

          // Don't fetch user details immediately - let user click to expand
          // if (!userDetailsMap.has(currentUserId)) {
          //   await fetchUserDetails(currentUserId);
          // }
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
        const userEvents = allEvents.filter(event => userEventIds.includes(event.id)).map(event => ({
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
        const displayName = userDoc.get("name") || userDoc.get("username") || "Unknown User";
        const userId = userDoc.id;

        if (displayName.toLowerCase().includes(searchTermLower)) {
          const userData: User = {
            id: userId,
            displayName,
            profilePicture: userDoc.get("profilePicture") || undefined,
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
        const displayName = userDoc.get("name") || userDoc.get("username") || "Unknown User";

        if (displayName.toLowerCase().includes(searchTermLower)) {
          const userData: User = {
            id: userDoc.id,
            displayName,
            profilePicture: userDoc.get("profilePicture") || undefined,
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

  // Auto-refresh data every 3 minutes with wave effect
  useEffect(() => {
    if (!liveEvent) return;

    const autoRefresh = async () => {
      try {
        // Fetch fresh data
        const usersCollection = collection(db, "users");
        const eventRankField = `${liveEvent.id}Rank`;
        const constraints: QueryConstraint[] = [
          orderBy(eventRankField),
          limit(itemsPerPage + 1),
        ];

        if (page > 1 && lastDoc) {
          constraints.push(startAfter(lastDoc));
        }

        const participantsQuery = query(usersCollection, ...constraints);
        const querySnapshot = await getDocs(participantsQuery);
        const docsToDisplay = querySnapshot.docs.slice(0, itemsPerPage);

        const freshUsers: User[] = docsToDisplay
          .filter((userDoc) => {
            const pickems = userDoc.get("pickems") || {};
            return Array.isArray(pickems[liveEvent.id]) && pickems[liveEvent.id].length > 0;
          })
          .map((userDoc) => {
            const userData: User = {
              id: userDoc.id,
              displayName: userDoc.get("name") || userDoc.get("username") || "Unknown User",
              profilePicture: userDoc.get("profilePicture") || undefined,
              pickemData: userDoc.get("pickemData") || undefined,
            };
            userData[`${liveEvent.id}Rank`] = userDoc.get(`${liveEvent.id}Rank`);
            userData[`${liveEvent.id}PTS`] = userDoc.get(`${liveEvent.id}PTS`);
            userData[`${liveEvent.id}MVP`] = userDoc.get(`${liveEvent.id}MVP`);
            return userData;
          });

        // Wave update effect
        freshUsers.forEach((freshUser, index) => {
          setTimeout(() => {
            setUpdatingRows(prev => new Set(prev).add(freshUser.id));

            setTimeout(() => {
              setUsers(prevUsers =>
                prevUsers.map(user =>
                  user.id === freshUser.id ? freshUser : user
                )
              );

              setTimeout(() => {
                setUpdatingRows(prev => {
                  const next = new Set(prev);
                  next.delete(freshUser.id);
                  return next;
                });
              }, 300);
            }, 100);
          }, index * 150);
        });

      } catch (error) {
        console.error("Auto-refresh error:", error);
      }
    };

    const interval = setInterval(autoRefresh, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, [liveEvent, page, itemsPerPage, lastDoc]);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setItemsPerPage(newSize);
    setPage(1);
    setLastDoc(null);
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

  // Prefetch next page in background
  useEffect(() => {
    if (!isSearchMode && hasMorePages && !prefetchedPages.has(page + 1) && liveEvent) {
      const prefetchNextPage = async () => {
        try {
          const usersCollection = collection(db, "users");
          const constraints: QueryConstraint[] = [
            where(`pickems.${liveEvent.id}`, "!=", null),
            limit(itemsPerPage + 1),
          ];

          if (lastDoc) {
            constraints.push(startAfter(lastDoc));
          }

          const prefetchQuery = query(usersCollection, ...constraints);
          await getDocs(prefetchQuery);
          setPrefetchedPages((prev) => new Set(prev).add(page + 1));
        } catch (error) {
          console.error("Error prefetching next page:", error);
        }
      };

      const timer = setTimeout(prefetchNextPage, 500);
      return () => clearTimeout(timer);
    }
  }, [page, hasMorePages, isSearchMode, prefetchedPages, liveEvent, lastDoc, itemsPerPage]);

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
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                selectedYear === year
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
            {/* Season 2025 Card */}
            <article
              onClick={() => {
                setIsSeasonView(true);
                setSelectedSeason('2025');
                setLiveEvent(null);
                setPage(1);
                setLastDoc(null);
                participantsCache.clear();
              }}
              className={`relative flex flex-col cursor-pointer md:w-[200px] shrink-0 grow-0 basis-auto md:h-[170px] w-[120px] h-[130px] ${
                isSeasonView && selectedSeason === '2025' ? "border-4 rounded-xl border-blue-500 dark:border-white" : ""
              }`}
            >
              <div className="relative flex flex-col justify-center items-center w-full h-full overflow-hidden rounded-lg logographics">
                <img
                  src="/background0.jpg"
                  alt="Season 2025"
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
                    Season 2025
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
                  setLastDoc(null);
                  participantsCache.clear();
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
                        Confirmed Kills: {liveEvent && currentUserData[`${liveEvent.id}PTS`] !== undefined
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
                            className={`bg-gray-200/50 dark:bg-gray-700/50 p-2 rounded hover:bg-gray-300/70 dark:hover:bg-gray-700/70 transition-colors ${
                              pick.isCaptain ? "border-2 border-yellow-600 dark:border-yellow-400" : ""
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
                      className={`hover:bg-gray-400/60 dark:hover:bg-gray-600/60 transition-all duration-300 cursor-pointer ${
                        currentUserId === user.id ? "bg-blue-200/40 dark:bg-blue-900/40" : "bg-gray-200/60 dark:bg-gray-800/60"
                      } ${
                        updatingRows.has(user.id) ? "bg-blue-300/30 dark:bg-blue-500/30 scale-[1.02]" : ""
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
                          <div className="text-xs sm:text-sm truncate max-w-[100px] sm:max-w-[150px] text-gray-900 dark:text-white">
                            {user.displayName}
                          </div>
                        </div>
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                        {isSeasonView ? (
                          user.seasonTotalPoints || 0
                        ) : (
                          liveEvent && user[`${liveEvent.id}PTS`] !== undefined && user[`${liveEvent.id}PTS`] !== null
                            ? user[`${liveEvent.id}PTS`]
                            : "No Data"
                        )}
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap text-xs sm:text-sm text-gray-900 dark:text-gray-300 hidden sm:table-cell">
                        {isSeasonView ? (
                          "-"
                        ) : (
                          liveEvent && user[`${liveEvent.id}MVP`] !== undefined && user[`${liveEvent.id}MVP`] !== null
                            ? user[`${liveEvent.id}MVP`] || "None"
                            : "No Data"
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
                                                <div className="text-xs text-gray-600 dark:text-gray-400">
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
                                                        className={`bg-gray-200/50 dark:bg-gray-700/50 p-2 rounded hover:bg-gray-300/70 dark:hover:bg-gray-700/70 transition-colors ${
                                                          pick.isCaptain ? "border-2 border-yellow-600 dark:border-yellow-400" : ""
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
                                        className={`bg-gray-200/50 dark:bg-gray-700/50 p-2 rounded hover:bg-gray-300/70 dark:hover:bg-gray-700/70 transition-colors ${
                                          pick.isCaptain ? "border-2 border-yellow-600 dark:border-yellow-400" : ""
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
