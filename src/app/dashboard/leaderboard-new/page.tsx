"use client";

import { useState, useEffect, Fragment } from "react";
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
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { motion, AnimatePresence } from "framer-motion";
import { ProgressiveBlur } from "@/src/components/ui/progressive-blur";
import { FaChevronDown, FaChevronUp, FaUser, FaSearch, FaTimes } from "react-icons/fa";

interface LiveEvent {
  id: string;
  name: string;
}

interface User {
  id: string;
  displayName: string;
  profilePicture?: string;
}

interface PlayerPick {
  id: string;
  name: string;
  kills: number;
  cost: number;
  rank?: number | string;
}

interface UserDetails {
  totalPoints: number;
  mvp: string;
  picks: PlayerPick[];
}

// Simple in-memory cache for paginated participants
const participantsCache = new Map<string, {
  users: User[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}>();

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

export default function LeaderboardNew() {
  const [liveEvent, setLiveEvent] = useState<LiveEvent | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading] = useState<boolean>(true);
  const [pageLoading, setPageLoading] = useState<boolean>(false);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [userDetailsLoading, setUserDetailsLoading] = useState<string | null>(null);
  const [userDetailsMap, setUserDetailsMap] = useState<Map<string, UserDetails>>(new Map());
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchSuggestions, setSearchSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [isSearchMode, setIsSearchMode] = useState<boolean>(false);
  const [searchDebounceTimer, setSearchDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  const PAGE_SIZES = [10, 20, 50];

  // Fetch live event
  useEffect(() => {
    const fetchLiveEvent = async () => {
      try {
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

          setLiveEvent({
            id: eventDoc.id,
            name: eventData.name || "Current Event",
          });
        }
      } catch (error) {
        console.error("Error fetching live event:", error);
      }
    };

    fetchLiveEvent();
  }, []);

  // Fetch users who participated in the live event with pagination
  useEffect(() => {
    async function fetchParticipants() {
      if (!liveEvent || isSearchMode) return; // Skip if in search mode

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

        // Build query constraints
        const constraints: QueryConstraint[] = [
          where(`pickems.${liveEvent.id}`, "!=", null),
          // No explicit orderBy to satisfy Firestore limitation with '!=' on dynamic field
          limit(itemsPerPage + 1), // Fetch one extra to check if there are more pages
        ];

        // If not on first page, start after the last document
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

        // Create participants without profile pictures first (instant load)
        const participants: User[] = docsToDisplay.map((userDoc) => ({
          id: userDoc.id,
          displayName: userDoc.get("name") || userDoc.get("username") || "Unknown User",
          profilePicture: undefined,
        }));

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

        // Fetch profile pictures in background (don't block UI)
        setTimeout(() => {
          Promise.all(
            docsToDisplay.map(async (userDoc) => {
              const rawProfilePicturePath = userDoc.get("profilePicture");
              const profilePicturePath =
                typeof rawProfilePicturePath === "string" ? rawProfilePicturePath.trim() : "";

              if (profilePicturePath) {
                return {
                  id: userDoc.id,
                  url: await getProfilePictureUrl(profilePicturePath),
                };
              }
              return null;
            })
          ).then((results) => {
            // Update users with fetched profile pictures
            setUsers((prevUsers) => {
              const updatedUsers = prevUsers.map((user) => {
                const result = results.find((r) => r?.id === user.id);
                return result ? { ...user, profilePicture: result.url } : user;
              });

              // Keep cache aligned with resolved URLs
              const cachedPage = participantsCache.get(cacheKey);
              if (cachedPage) {
                participantsCache.set(cacheKey, { ...cachedPage, users: updatedUsers });
              }

              return updatedUsers;
            });
          });
        }, 0);

        setPageLoading(false);
      } catch (error) {
        console.error("Error fetching participants:", error);
        setPageLoading(false);
      }
    }

    fetchParticipants();
  }, [liveEvent, page, itemsPerPage, isSearchMode]); // Added isSearchMode dependency

  // Fetch user details when accordion is expanded
  const fetchUserDetails = async (userId: string) => {
    // Check if already cached
    if (userDetailsMap.has(userId)) {
      return;
    }

    setUserDetailsLoading(userId);
    try {
      const response = await fetch(
        `/api/leaderboard/user-details?userId=${userId}&eventId=${liveEvent?.id}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch user details");
      }

      const data = await response.json();
      setUserDetailsMap((prev) => new Map(prev).set(userId, data));
    } catch (error) {
      console.error("Error fetching user details:", error);
    } finally {
      setUserDetailsLoading(null);
    }
  };

  const toggleExpand = async (userId: string) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
    } else {
      setExpandedUserId(userId);
      // Fetch details if not already cached
      if (!userDetailsMap.has(userId)) {
        await fetchUserDetails(userId);
      }
    }
  };

  // Fetch search suggestions (autocomplete)
  const fetchSearchSuggestions = async (searchTerm: string) => {
    if (!liveEvent || !searchTerm.trim()) {
      setSearchSuggestions([]);
      return;
    }

    try {
      const usersCollection = collection(db, "users");
      const searchTermLower = searchTerm.toLowerCase();

      // Fetch users with pickems for this event
      const constraints: QueryConstraint[] = [
        where(`pickems.${liveEvent.id}`, "!=", null),
        limit(50), // Fetch more to filter client-side
      ];

      const searchQuery = query(usersCollection, ...constraints);
      const querySnapshot = await getDocs(searchQuery);

      // Filter results client-side for case-insensitive prefix match
      const matchingUsers: User[] = [];
      for (const userDoc of querySnapshot.docs) {
        const displayName = userDoc.get("name") || userDoc.get("username") || "Unknown User";

        if (displayName.toLowerCase().includes(searchTermLower)) {
          matchingUsers.push({
            id: userDoc.id,
            displayName,
          });

          if (matchingUsers.length >= 10) break;
        }
      }

      // Sort alphabetically
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
            profilePicture: undefined,
          });
          userDocsToFetch.push({ id: userDoc.id, doc: userDoc });
        }
      }

      // Sort alphabetically
      matchingUsers.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setUsers(matchingUsers);
      setHasMorePages(false); // No pagination in search mode
      setPageLoading(false);

      // Fetch profile pictures in background
      setTimeout(() => {
        Promise.all(
          userDocsToFetch.map(async ({ id, doc }) => {
            const rawProfilePicturePath = doc.get("profilePicture");
            const profilePicturePath =
              typeof rawProfilePicturePath === "string" ? rawProfilePicturePath.trim() : "";

            if (profilePicturePath) {
              return {
                id,
                url: await getProfilePictureUrl(profilePicturePath),
              };
            }
            return null;
          })
        ).then((results) => {
          setUsers((prevUsers) =>
            prevUsers.map((user) => {
              const result = results.find((r) => r?.id === user.id);
              return result ? { ...user, profilePicture: result.url } : user;
            })
          );
        });
      }, 0);
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
        setLastDoc(null);
      }
    }
  };

  // Handle search submit (Enter key or search button)
  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    executeSearch(searchQuery);
  };

  // Handle suggestion click
  const handleSuggestionClick = (user: User) => {
    setSearchQuery(user.displayName);
    setShowSuggestions(false);
    executeSearch(user.displayName);
  };

  // Clear search
  const handleClearSearch = () => {
    setSearchQuery("");
    setShowSuggestions(false);
    setSearchSuggestions([]);
    setIsSearchMode(false);
    setPage(1);
    setLastDoc(null);
  };

  const handlePageSizeChange = (newSize: number) => {
    setItemsPerPage(newSize);
    setPage(1);
    setLastDoc(null);
  };

  const handleNextPage = () => {
    if (hasMorePages) {
      setPage((p) => p + 1);
    }
  };

  const handlePreviousPage = () => {
    if (page > 1) {
      setPage((p) => p - 1);
    }
  };

  if (loading && !liveEvent) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!liveEvent) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-center text-white text-lg">
          No active event currently running.
        </p>
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
        <h1 className="text-xl sm:text-2xl font-bold mb-1">{liveEvent.name}</h1>
      </div>

      {/* Search Bar */}
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
      {/* Pagination */}
      {!isSearchMode && users.length > 0 && (
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
            {pageLoading && page === 1 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                  </div>
                </td>
              </tr>
            ) : users.length > 0 ? (
              users.map((user, index) => {
                const userDetails = userDetailsMap.get(user.id);
                const isExpanded = expandedUserId === user.id;
                const isLoading = userDetailsLoading === user.id;
                const displayRank = isSearchMode ? "-" : (page - 1) * itemsPerPage + index + 1;

                return (
                  <Fragment key={user.id}>
                    <tr
                      className="hover:bg-gray-700/50 transition-colors bg-gray-800/30 cursor-pointer"
                      onClick={() => toggleExpand(user.id)}
                    >
                      <td className="px-2 py-2 whitespace-nowrap text-sm sticky left-0 z-10 bg-inherit">
                        <div className="flex items-center">
                          <span className="font-medium">{displayRank}</span>
                        </div>
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap">
                        <div className="flex items-center">
                          {user.profilePicture ? (
                            <img
                              src={user.profilePicture}
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
                        {userDetails ? userDetails.totalPoints : "-"}
                      </td>

                      <td className="px-2 py-2 whitespace-nowrap text-xs sm:text-sm text-gray-300 hidden sm:table-cell">
                        {userDetails ? userDetails.mvp : "-"}
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