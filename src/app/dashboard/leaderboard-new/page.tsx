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

interface LiveEvent {
  id: string;
  name: string;
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
}

interface PlayerPick {
  id: string;
  name: string;
  kills: number;
  cost: number;
  rank?: number | string;
}

interface UserDetails {
  picks: PlayerPick[];
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
  const [liveEvent, setLiveEvent] = useState<LiveEvent | null>(null);
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
  const PAGE_SIZES = [10, 20, 50];
  const MAX_RETRIES = 3;

  const auth = getAuth();
  const currentUserId = auth.currentUser?.uid;

  // Fetch live event
  useEffect(() => {
    const fetchLiveEvent = async () => {
      try {
        
        // Check cache first
        const cachedEvent = getLiveEventFromCache();
        if (cachedEvent) {
          setLiveEvent(cachedEvent);
          return;
        }
        
        // Use get() with cache for better performance
        const eventsCollection = collection(db, "events");
        const liveEventQuery = query(
          eventsCollection,
          where("status", "==", "live"),
          limit(1)
        );

        const querySnapshot = await getDocs(liveEventQuery);

        if (!querySnapshot.empty) {
          const eventDoc = querySnapshot.docs[0];
          const eventData = eventDoc.data();

          const event = {
            id: eventDoc.id,
            name: eventData.name || "Current Event",
          };
          
          // Cache the event
          setLiveEventCache(event);
          
          setLiveEvent(event);
        } else {
          setLiveEvent(null);
        }
      } catch (error) {
        console.error("Error fetching live event:", error);
        setLiveEvent(null);
      } finally {
        setEventLoading(false);
        }

    };

    fetchLiveEvent();
  }, []);

  // Fetch users with Firestore sorting by currentRank
  useEffect(() => {
    async function fetchParticipants() {
      if (!liveEvent || isSearchMode) return;

      try {
        setPageLoading(true);
        const usersCollection = collection(db, "users");

        // Check cache first
        const cacheKey = `${liveEvent.id}:${itemsPerPage}:${page}`;
        const cached = participantsCache.get(cacheKey);
        if (cached) {
          setUsers(cached.users);
          setLastDoc(cached.lastDoc);
          setHasMorePages(cached.hasMore);
          setPageLoading(false);
          return;
        }

        // Build query with dynamic event-specific rank field
        const eventRankField = `${liveEvent.id}Rank`;
        const constraints: QueryConstraint[] = [
          orderBy(eventRankField),
          limit(itemsPerPage + 1),
        ];

        // Pagination with startAfter
        if (page > 1 && lastDoc) {
          constraints.push(startAfter(lastDoc));
        }

        const participantsQuery = query(usersCollection, ...constraints);
        const querySnapshot = await getDocs(participantsQuery);

        // Check if there are more pages
        const hasMore = querySnapshot.docs.length > itemsPerPage;
        setHasMorePages(hasMore);

        // Get only the required amount of documents
        const docsToDisplay = querySnapshot.docs.slice(0, itemsPerPage);

        // Create participants and filter for event participation
        const participants: User[] = docsToDisplay
          .filter((userDoc) => {
            const pickems = userDoc.get("pickems") || {};
            return Array.isArray(pickems[liveEvent.id]) && pickems[liveEvent.id].length > 0;
          })
          .map((userDoc) => ({
            id: userDoc.id,
            displayName: userDoc.get("name") || userDoc.get("username") || "Unknown User",
            profilePicture: userDoc.get("profilePicture") || undefined,
            pickemData: userDoc.get("pickemData") || undefined,
          }));

        // Adjust hasMore based on filtered results
        const filteredCount = participants.length;
        setHasMorePages(filteredCount === itemsPerPage && querySnapshot.docs.length > itemsPerPage);

        setUsers(participants);

        // Store the last document for next pagination
        if (docsToDisplay.length > 0) {
          setLastDoc(docsToDisplay.at(-1) ?? null);
        }

        // Save to cache
        participantsCache.set(cacheKey, {
          users: participants,
          lastDoc: docsToDisplay.at(-1) ?? null,
          hasMore,
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
  }, [liveEvent, page, itemsPerPage, isSearchMode]);

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
  const fetchUserDetails = async (userId: string, retry = 0, isCurrentUserCard = false): Promise<void> => {
    // Check if already cached
    if (userDetailsMap.has(userId)) {
      return;
    }

    // Check if request is already pending
    if (pendingRequests.has(userId)) {
      return;
    }

    setPendingRequests(prev => new Set(prev).add(userId));
    if (isCurrentUserCard) {
      setCurrentUserCardLoading(true);
    } else {
      setUserDetailsLoading(userId);
    }
    try {
      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : null;
      
      const response = await fetch(
        `/api/leaderboard/user-details?userId=${userId}&eventId=${liveEvent?.id}`,
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
      setUserDetailsMap((prev) => new Map(prev).set(userId, data));
      setRetryCount((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    } catch (error) {
      console.error("Error fetching user details:", error);

      // Retry logic
      if (retry < MAX_RETRIES) {
        const currentRetry = retry + 1;
        setRetryCount((prev) => new Map(prev).set(userId, currentRetry));
        setTimeout(() => {
          fetchUserDetails(userId, currentRetry);
        }, Math.pow(2, currentRetry) * 1000); // Exponential backoff
      }
    } finally {
      if (isCurrentUserCard) {
        setCurrentUserCardLoading(false);
      } else {
        setUserDetailsLoading(null);
      }
      setPendingRequests(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const toggleExpand = useCallback(async (userId: string) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
    } else {
      setExpandedUserId(userId);
      // Fetch details if not already cached
      if (!userDetailsMap.has(userId) && liveEvent) {
        await fetchUserDetails(userId, 0, false);
      }
    }
  }, [expandedUserId, userDetailsMap, liveEvent]);

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
          matchingUsers.push({
            id: userId,
            displayName,
            pickemData: userDoc.get("pickemData") || undefined,
          });

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
        limit(100), // Fetch more to filter client-side
      ];

      const searchQuery = query(usersCollection, ...constraints);
      const querySnapshot = await getDocs(searchQuery);

      // Filter matching users without fetching profile pictures initially
      const matchingUsers: User[] = [];
      const userDocsToFetch: Array<{ id: string; doc: any }> = [];

      for (const userDoc of querySnapshot.docs) {
        const displayName = userDoc.get("name") || userDoc.get("username") || "Unknown User";

        if (displayName.toLowerCase().includes(searchTermLower)) {
          matchingUsers.push({
            id: userDoc.id,
            displayName,
            profilePicture: userDoc.get("profilePicture") || undefined,
            pickemData: userDoc.get("pickemData") || undefined,
          });
          userDocsToFetch.push({ id: userDoc.id, doc: userDoc });
        }
      }

      // Sort: pickemData users first, then by rank
      matchingUsers.sort((a, b) => {
        const aHasData = a.pickemData?.[liveEvent.id]?.Rank;
        const bHasData = b.pickemData?.[liveEvent.id]?.Rank;

        // Users with pickemData always come first
        if (aHasData && !bHasData) return -1;
        if (!aHasData && bHasData) return 1;

        // If both have data, sort by rank (ascending)
        if (aHasData && bHasData) {
          return parseInt(aHasData) - parseInt(bHasData);
        }

        // If neither has data, sort alphabetically
        return a.displayName.localeCompare(b.displayName);
      });
      setUsers(matchingUsers);
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
      setShowSuggestions(true);
      // Debounce search suggestions
      const timer = setTimeout(() => {
        fetchSearchSuggestions(value);
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
    setUsers([user]);
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
          .map((userDoc) => ({
            id: userDoc.id,
            displayName: userDoc.get("name") || userDoc.get("username") || "Unknown User",
            profilePicture: userDoc.get("profilePicture") || undefined,
            pickemData: userDoc.get("pickemData") || undefined,
          }));
        
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
  if (!eventLoading && !liveEvent) {
    return (
      <div className="p-2 pt-0 sm:pt-0 pb-10 sm:pb-4 sm:p-4 h-[calc(100vh-48px)] min-h-[220px] overflow-auto bg-black text-white">
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-center text-white text-lg">
            No active event currently running.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 pt-0 sm:pt-0 pb-10 sm:pb-4 sm:p-4 h-[calc(100vh-48px)] min-h-[220px] overflow-auto bg-black text-white">
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
          Event Leaderboard
        </h1>
      </header>
      <div className="mb-4 text-center pt-3 sm:pt-7">
        {eventLoading ? (
          <div className="h-8 bg-gray-700 rounded w-48 mx-auto animate-pulse"></div>
        ) : (
          <h1 className="text-xl sm:text-2xl font-bold mb-1">{liveEvent?.name}</h1>
        )}
      </div>

      {/* Current User Card */}
      {currentUserLoading ? (
        <div className="sticky top-0 z-10 bg-black pt-4 pb-4 mb-4">
          <div className="bg-gray-800/100 rounded-lg shadow border border-gray-700 p-3">
            <div className="flex items-center">
              <div className="w-14 h-14 rounded-full bg-gray-700 animate-pulse mr-3"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-700 rounded w-32 mb-2 animate-pulse"></div>
                <div className="h-3 bg-gray-700 rounded w-24 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      ) : currentUserData && liveEvent && currentUserData.pickemData && currentUserData.pickemData[liveEvent.id] && (
        <div className="sticky top-0 z-10 bg-black pt-4 pb-4 mb-4">
          <div className="bg-gray-800/100 rounded-lg shadow border border-gray-700">
            <div
              className="p-2 sm:p-3 cursor-pointer"
              onClick={async () => {
                setExpandCurrentUser(!expandCurrentUser);
                // Fetch user details if not already cached
                if (!expandCurrentUser && !userDetailsMap.has(currentUserId) && liveEvent) {
                  await fetchUserDetails(currentUserId, 0, true);
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
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gray-700 flex items-center justify-center border-2 border-yellow-400">
                        <FaUser className="text-xl text-gray-400" />
                      </div>
                    )}
                    {liveEvent && currentUserData.pickemData && currentUserData.pickemData[liveEvent.id] && (
                      <div className="absolute -top-1 -right-1 bg-yellow-500 text-black w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-bold text-xs">
                        #{currentUserData.pickemData[liveEvent.id].Rank}
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
                        Confirmed Kills: {currentUserData?.pickemData && liveEvent && currentUserData.pickemData[liveEvent.id]
                          ? currentUserData.pickemData[liveEvent.id].PTS
                          : 0}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      MVP: {currentUserData?.pickemData && liveEvent && currentUserData.pickemData[liveEvent.id]
                        ? currentUserData.pickemData[liveEvent.id].MVP
                        : "None"}
                    </p>
                  </div>
                </div>
                {currentUserCardLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500"></div>
                ) : expandCurrentUser ? (
                  <FaChevronUp className="text-gray-400 text-sm" />
                ) : (
                  <FaChevronDown className="text-gray-400 text-sm" />
                )}
              </div>
            </div>
            <AnimatePresence>
              {expandCurrentUser && userDetailsMap.get(currentUserId) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="border-t border-gray-700/70"
                >
                  <div className="px-3 max-h-[280px] overflow-auto pb-3">
                    <h3 className="pt-3 text-xs font-medium text-white mb-2 border-b border-gray-700 pb-1 sticky top-0 bg-gray-800/100 z-10">
                      Your Team
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {userDetailsMap.get(currentUserId)!.picks
                        .slice()
                        .sort((a, b) => {
                          if (b.kills !== a.kills) return b.kills - a.kills;
                          return a.name.localeCompare(b.name);
                        })
                        .map((pick) => (
                          <div
                            key={pick.id}
                            className="bg-gray-700/50 p-2 rounded hover:bg-gray-700/70 transition-colors"
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-white text-xs font-medium truncate">
                                {pick.name}
                              </span>
                              <span className="text-green-400 text-xs font-medium">
                                Confirmed Kills: {pick.kills}
                              </span>
                            </div>
                            <div className="flex justify-between items-center mt-1 text-xs">
                              <span className="text-gray-400 w-1/3">
                                Rank: {pick.rank ?? 0}
                              </span>
                              <span className="flex text-gray-400 w-1/3">
                                <span className="w-1/2 text-end">Cost:</span>
                                <span className="w-1/2 text-start">&nbsp;${pick.cost}</span>
                              </span>
                              <span className="text-yellow-400 text-end w-1/3">
                                ROI: ${pick.kills === 0 || pick.cost === 0
                                  ? 0
                                  : (pick.cost / pick.kills).toFixed(2)}
                              </span>
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

      {/* Search Bar */}
      {eventLoading ? (
        <div className="relative mt-4 mb-4">
          <div className="h-10 bg-gray-700 rounded-lg animate-pulse"></div>
        </div>
      ) : (
      <div className="relative mt-4 mb-4">
        <form onSubmit={handleSearchSubmit} className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <FaSearch className="text-gray-400 text-sm" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => searchQuery.trim() && setShowSuggestions(true)}
            placeholder="Search players..."
            className="w-full pl-9 pr-10 py-2 text-sm bg-gray-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-white"
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

        {/* Search Suggestions Dropdown */}
        {showSuggestions && searchSuggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-gray-800 rounded-lg shadow-lg border border-gray-700 max-h-64 overflow-y-auto">
            {searchSuggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full px-3 py-2 hover:bg-gray-700 transition-colors text-left"
              >
                <span className="text-sm">{suggestion.displayName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      )}
      
      {/* Pagination */}
      {!eventLoading && !isSearchMode && users.length > 0 && (
        <div className="flex flex-row items-center justify-between my-4 gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-300">Rows:</span>
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
          <span className="text-xs text-gray-300">Page {page}</span>
          <button
            onClick={handlePreviousPage}
            disabled={page === 1 || pageLoading}
            className="px-3 py-1 rounded bg-gray-800 text-white text-xs disabled:opacity-50 hover:bg-gray-700 transition-colors"
          >
            Prev
          </button>
          <button
            onClick={handleNextPage}
            disabled={!hasMorePages || pageLoading}
            className="px-3 py-1 rounded bg-gray-800 text-white text-xs disabled:opacity-50 hover:bg-gray-700 transition-colors"
          >
            Next
          </button>
        </div>
      </div>
      )}

      {/* Leaderboard Table */}
      <div className="overflow-x-auto rounded-lg shadow bg-gray-800/50 backdrop-blur-sm">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-700/80">
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider sticky left-0 z-20">
                Rank
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                Player
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                Pts
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider hidden sm:table-cell">
                MVP
              </th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {(eventLoading || usersLoading || (pageLoading && page === 1)) ? (
              <LeaderboardSkeleton rows={itemsPerPage} />
            ) : users.length > 0 ? (
              users.map((user, index) => {
                const userDetails = userDetailsMap.get(user.id);
                const isExpanded = expandedUserId === user.id;
                const isLoading = userDetailsLoading === user.id;

                // Get rank from pickemData for current live event, fallback to pagination rank
                let displayRank = isSearchMode ? "-" : (page - 1) * itemsPerPage + index + 1;
                if (liveEvent && user.pickemData && user.pickemData[liveEvent.id]) {
                  displayRank = user.pickemData[liveEvent.id].Rank;
                }

                return (
                  <Fragment key={user.id}>
                    <tr
                      className={`hover:bg-gray-700/50 transition-all duration-300 cursor-pointer ${
                        currentUserId === user.id ? "bg-blue-900/30" : "bg-gray-800/30"
                      } ${
                        updatingRows.has(user.id) ? "bg-blue-500/20 scale-[1.02]" : ""
                      }`}
                      onClick={() => toggleExpand(user.id)}
                    >
                      <td className="px-2 py-2 whitespace-nowrap text-sm sticky left-0 z-10 bg-inherit">
                        <div className="flex items-center">
                          <span className="font-medium">{displayRank}</span>
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
                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center mr-2">
                              <FaUser className="text-gray-400 text-sm" />
                            </div>
                          )}
                          <div className="text-xs sm:text-sm truncate max-w-[100px] sm:max-w-[150px]">
                            {user.displayName}
                          </div>
                        </div>
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap text-xs sm:text-sm font-medium">
                        {liveEvent && user.pickemData && user.pickemData[liveEvent.id]
                          ? user.pickemData[liveEvent.id].PTS
                          : "-"}
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap text-xs sm:text-sm text-gray-300 hidden sm:table-cell">
                        {liveEvent && user.pickemData && user.pickemData[liveEvent.id]
                          ? user.pickemData[liveEvent.id].MVP
                          : "-"}
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap">
                        <button className="flex items-center justify-center w-full">
                          {isLoading ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500"></div>
                          ) : isExpanded ? (
                            <FaChevronUp className="text-gray-400 text-sm" />
                          ) : (
                            <FaChevronDown className="text-gray-400 text-sm" />
                          )}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded row for picks */}
                    <AnimatePresence>
                      {isExpanded && userDetails && (
                        <motion.tr
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                          className="bg-gray-800/70"
                        >
                          <td colSpan={5} className="px-2 py-2">
                            <div className="pb-2">
                              <h3 className="text-xs font-medium text-white mb-2 border-b border-gray-700 pb-1">
                                {user.displayName}'s Team
                              </h3>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {userDetails.picks
                                  .slice()
                                  .sort((a, b) => {
                                    if (b.kills !== a.kills) return b.kills - a.kills;
                                    return a.name.localeCompare(b.name);
                                  })
                                  .map((pick) => (
                                    <div
                                      key={pick.id}
                                      className="bg-gray-700/50 p-2 rounded hover:bg-gray-700/70 transition-colors"
                                    >
                                      <div className="flex justify-between items-center">
                                        <span className="text-white text-xs font-medium truncate">
                                          {pick.name}
                                        </span>
                                        <span className="text-green-400 text-xs font-medium">
                                          Confirmed Kills: {pick.kills}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center mt-1 text-xs">
                                        <span className="text-gray-400 w-1/3">
                                          Rank: {pick.rank ?? 0}
                                        </span>
                                        <span className="flex text-gray-400 w-1/3">
                                          <span className="w-1/2 text-end">Cost:</span>
                                          <span className="w-1/2 text-start">&nbsp;${pick.cost}</span>
                                        </span>
                                        <span className="text-yellow-400 text-end w-1/3">
                                          ROI: ${pick.kills === 0 || pick.cost === 0
                                            ? 0
                                            : (pick.cost / pick.kills).toFixed(0)}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-xs text-gray-400">
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
      {!isSearchMode && users.length > 0 && (
        <div className="flex flex-row items-center justify-between mt-4 gap-2 mb-7 sm:mb-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-300">Rows:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              disabled={pageLoading}
              className="bg-gray-800 text-white text-xs rounded px-2 py-1 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-300">Page {page}</span>
            <button
              onClick={handlePreviousPage}
              disabled={page === 1 || pageLoading}
              className="px-3 py-1 rounded bg-gray-800 text-white text-xs disabled:opacity-50 hover:bg-gray-700 transition-colors border border-gray-700"
            >
              Prev
            </button>
            <button
              onClick={handleNextPage}
              disabled={!hasMorePages || pageLoading}
              className="px-3 py-1 rounded bg-gray-800 text-white text-xs disabled:opacity-50 hover:bg-gray-700 transition-colors border border-gray-700"
            >
              Next
            </button>
          </div>
        </div>
      )}
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