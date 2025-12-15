
"use client";

import { useState, useEffect, Fragment, ReactNode, useRef } from "react";
import { db, storage } from "@/src/lib/firebaseClient";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getDownloadURL, ref } from "firebase/storage";
import { motion, AnimatePresence } from "framer-motion";
import { ProgressiveBlur } from "@/src/components/ui/progressive-blur";
import {
  FaChevronDown,
  FaChevronUp,
  FaUser,
  FaSearch,
  FaTrophy,
} from "react-icons/fa";

interface User {
  rank: ReactNode;
  id: string;
  displayName: string;
  totalPoints: number;
  mvp: string;
  picks: PlayerPick[];
  profilePicture?: string;
}

interface PlayerPick {
  id: string;
  name: string;
  kills: number;
  cost: number;
  rank?: number | string;
}

interface LiveEvent {
  id: string;
  name: string;
  lockDate: Date | null;
  timeLeft: string;
}

// Reusable component for displaying picks grid
const PicksGrid = ({ picks }: { picks: PlayerPick[] }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
    {picks
      .sort((a, b) => (b.kills !== a.kills ? b.kills - a.kills : a.name.localeCompare(b.name)))
      .map((pick) => (
        <div key={pick.id} className="bg-gray-700/50 p-2 rounded hover:bg-gray-700/70 transition-colors">
          <div className="flex justify-between items-center">
            <span className="text-white text-xs font-medium truncate">{pick.name}</span>
            <span className="text-green-400 text-xs font-medium">Confirmed Kills: {pick.kills}</span>
          </div>
          <div className="flex justify-between items-center mt-1 text-xs">
            <span className="text-gray-400 w-1/3">Rank: {pick.rank ?? 0}</span>
            <span className="flex text-gray-400 w-1/3">
              <span className="w-1/2 text-end">Cost:</span>
              <span className="w-1/2 text-start">&nbsp;${pick.cost}</span>
            </span>
            <span className="text-yellow-400 text-end w-1/3">
              ROI: ${pick.kills === 0 || pick.cost === 0 ? 0 : (pick.cost / pick.kills).toFixed(2)}
            </span>
          </div>
        </div>
      ))}
  </div>
);

export default function Leaderboard() {
  // State for expanding/collapsing current user's picks (hidden by default)
  const [expandCurrentUser, setExpandCurrentUser] = useState<boolean>(false);
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [liveEvent, setLiveEvent] = useState<LiveEvent | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentUserData, setCurrentUserData] = useState<User | null>(null);
  // Height management for expanded picks scroll
  const cardWrapperRef = useRef<HTMLDivElement | null>(null);
  const picksContainerRef = useRef<HTMLDivElement | null>(null);
  const [picksMaxHeight, setPicksMaxHeight] = useState<number | null>(null);
  // Profile picture cache (persists across re-renders)
  const profilePictureCache = useRef<Map<string, string | null>>(new Map());
  // Data cache key and timestamp
  const CACHE_KEY = 'leaderboard_data_cache';
  const CACHE_TIMESTAMP_KEY = 'leaderboard_cache_timestamp';
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const PAGE_SIZES = [10, 20, 50];
  const totalPages = Math.ceil(filteredUsers.length / pageSize);

  const auth = getAuth();
  const currentUserId = auth.currentUser?.uid;

  // Toggle expanded view for user picks
  const toggleExpand = (userId: string) => {
    setExpandedUserId(expandedUserId === userId ? null : userId);
    setExpandCurrentUser(false);
  };
  const toggleTopExpand = () => {
    setExpandedUserId(null);
    setExpandCurrentUser((prev) => !prev);
  };

  // Compute available height for picks when expanded so the card stays pinned
  useEffect(() => {
    if (!expandCurrentUser) { setPicksMaxHeight(null); return; }
    const compute = () => {
      if (!cardWrapperRef.current) return;
      const rect = cardWrapperRef.current.getBoundingClientRect();
      const viewportH = window.innerHeight;
      // Space left below the card container (including its non-expanded content already rendered)
      const remaining = viewportH - rect.top - 150; // 24px bottom padding margin allowance
      // Minimum sensible height
      setPicksMaxHeight(Math.max(remaining, 120));
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('orientationchange', compute);
    };
  }, [expandCurrentUser, currentUserData]);

  // Fetch live event using optimized query
  useEffect(() => {
    const fetchLiveEvent = async () => {
      try {
        const eventsRef = collection(db, "events");
        const q = query(eventsRef, where("status", "==", "live"));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const eventDoc = querySnapshot.docs[0];
          const eventData = eventDoc.data() as any;
          const lockDate = eventData.lockDate?.toDate?.() || null;

          setLiveEvent({
            id: eventDoc.id,
            name: eventData.name || "Current Event",
            lockDate,
            timeLeft: "",
          });
        }
      } catch (error) {
        console.error("Error fetching live event:", error);
      }
    };
    fetchLiveEvent();
  }, []);

  // Fetch profile picture from Firebase Storage with caching
  const fetchProfilePicture = async (userId: string) => {
    // Check cache first
    if (profilePictureCache.current.has(userId)) {
      return profilePictureCache.current.get(userId);
    }

    try {
      const storagePath = `user/${userId}/profile_200x200`;
      const storageRef = ref(storage, storagePath);
      const url = await getDownloadURL(storageRef);
      // Cache successful result
      profilePictureCache.current.set(userId, url);
      return url;
    } catch (error) {
      // Cache null to avoid re-fetching 404s
      profilePictureCache.current.set(userId, null);
      return null;
    }
  };

  // Fetch player details for a user's picks
  const fetchPlayerDetails = async (playerIds: string[], eventId: string) => {
    let totalPoints = 0;
    let mvp = { playerName: "None", kills: 0 };
    const picks: PlayerPick[] = [];

    await Promise.all(
      playerIds.map(async (playerId) => {
        if (!playerId) return;
        try {
          const playerRef = doc(db, `events/${eventId}/players/${playerId}`);
          const playerDoc = await getDoc(playerRef);

          if (playerDoc.exists()) {
            const kills = playerDoc.get("Confirmed Kills") || 0;
            const name = playerDoc.get("Player") || "Unknown Player";
            const cost = playerDoc.get("Cost") || 0;
            const rank = playerDoc.get("Rank") ?? 0;

            totalPoints += kills;
            picks.push({ id: playerId, name, kills, cost, rank });

            if (kills > mvp.kills) {
              mvp = { playerName: name, kills };
            }
          }
        } catch (error) {
          console.error(`Error fetching player ${playerId}:`, error);
        }
      })
    );

    return { totalPoints, mvp, picks };
  };

  useEffect(() => {
    if (!liveEvent) return;

    // Helper to load cached data
    const loadFromCache = () => {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);

        if (cached && timestamp) {
          const age = Date.now() - parseInt(timestamp);
          if (age < CACHE_DURATION) {
            const cachedData = JSON.parse(cached);
            if (cachedData.eventId === liveEvent.id) {
              const sortedUsers = cachedData.users.map((user: User, idx: number) => ({
                ...user,
                rank: idx + 1
              }));

              const top10 = sortedUsers.slice(0, 10);
              setUsers(top10);
              setFilteredUsers(top10);

              if (currentUserId) {
                const currentUser = sortedUsers.find((u: User) => u.id === currentUserId);
                currentUser && setCurrentUserData(currentUser);
              }

              setLoading(false);
              return true; // Cache loaded successfully
            }
          }
        }
      } catch (error) {
        console.error('Error loading cache:', error);
      }
      return false; // Cache not available
    };

    // Helper to save data to cache
    const saveToCache = (users: User[]) => {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          eventId: liveEvent.id,
          users,
        }));
        localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
      } catch (error) {
        console.error('Error saving cache:', error);
      }
    };

    // Try to load from cache first
    const cacheLoaded = loadFromCache();

    (async () => {
      try {
        const snapshot = await getDocs(
          query(collection(db, "users"), where(`pickems.${liveEvent.id}`, "!=", null))
        );

        const usersWithPicks = snapshot.docs
          .map((userDoc) => {
            const playerIds = userDoc.get(`pickems.${liveEvent.id}`) || [];
            return Array.isArray(playerIds) && playerIds.length > 0
              ? {
                  id: userDoc.id,
                  displayName: userDoc.get("name") || userDoc.get("username") || "Unknown User",
                  playerIds,
                }
              : null;
          })
          .filter((item): item is { id: string; displayName: string; playerIds: string[] } => item !== null);

        if (usersWithPicks.length === 0) {
          setLoading(false);
          return;
        }

        const allUserData = await Promise.all(
          usersWithPicks.map(async (user) => {
            const { totalPoints, mvp, picks } = await fetchPlayerDetails(user.playerIds, liveEvent.id);
            return {
              id: user.id,
              displayName: user.displayName,
              totalPoints,
              mvp: mvp.playerName,
              picks,
              profilePicture: undefined,
            };
          })
        );

        const sortedUsers = allUserData
          .sort((a, b) => b.totalPoints - a.totalPoints)
          .map((user, idx) => ({ ...user, rank: idx + 1 }));

        // Save fresh data to cache
        saveToCache(sortedUsers);

        const top10Users = sortedUsers.slice(0, 10);
        const remainingUsers = sortedUsers.slice(10);

        // Update UI with fresh data (only if different from cache)
        setUsers(top10Users);
        setFilteredUsers(top10Users);
        if (currentUserId) {
          const currentUser = sortedUsers.find((u) => u.id === currentUserId);
          currentUser && setCurrentUserData(currentUser);
        }

        // If cache wasn't loaded, now we can hide loading
        if (!cacheLoaded) {
          setLoading(false);
        }

        Promise.all(sortedUsers.map((user) => fetchProfilePicture(user.id))).then((pictures) => {
          const profileMap = new Map(sortedUsers.map((user, idx) => [user.id, pictures[idx]]));
          const updateWithPictures = (prev: User[]) =>
            prev.map((user) => ({ ...user, profilePicture: profileMap.get(user.id) || undefined }));

          setUsers(updateWithPictures);
          setFilteredUsers(updateWithPictures);
          if (currentUserId) {
            setCurrentUserData((prev) =>
              prev ? { ...prev, profilePicture: profileMap.get(currentUserId) || undefined } : prev
            );
          }
        });

        if (remainingUsers.length > 0) {
          setTimeout(() => {
            setUsers(sortedUsers);
            setFilteredUsers(sortedUsers);
          }, 500);
        }
      } catch (error) {
        console.error("Error fetching leaderboard data:", error);
        if (!cacheLoaded) {
          setLoading(false);
        }
      }
    })();
  }, [liveEvent, currentUserId]);  // Filter users based on search query
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredUsers(users);
      setPage(1);
    } else {
      const filtered = users.filter((user) =>
        user.displayName.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredUsers(filtered);
      setPage(1);
    }
  }, [searchQuery, users]);

  if (loading) {
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

  // Get current user's rank from user.rank property
  const currentUserRank = currentUserData?.rank ?? null;

  // Slice the users array for current page display
  const paginatedUsers = filteredUsers.slice(
    (page - 1) * pageSize,
    page * pageSize
  );
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

      {/* Current User Card (sticky on mobile) */}
      {currentUserData && (
        <>
          <div ref={cardWrapperRef} className="sticky top-0 z-10 bg-black pt-4 pb-4 mb-4 sm:mb-0">
            <div className="bg-gray-800/100 rounded-lg  shadow border border-gray-700">
              <div
                className=" mb-0  p-2 sm:p-3 cursor-pointer"
                onClick={() => toggleTopExpand()}
                aria-label={expandCurrentUser ? 'Collapse picks' : 'Expand picks'}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="relative">
                      {currentUserData.profilePicture ? (
                        <img
                          src={currentUserData.profilePicture}
                          alt="Profile"
                          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-yellow-400"
                        />
                      ) : (
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gray-700 flex items-center justify-center border-2 border-yellow-400">
                          <FaUser className="text-xl text-gray-400" />
                        </div>
                      )}
                      {currentUserRank && (
                        <div className="absolute -top-1 -right-1 bg-yellow-500 text-black w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-bold text-xs">
                          #{currentUserRank}
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
                          Confirmed Kills: {currentUserData.totalPoints}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        MVP: {currentUserData.mvp}
                      </p>
                    </div>
                  </div>
                  {expandCurrentUser ? (
                    <FaChevronUp className="text-gray-400 text-sm" />
                  ) : (
                    <FaChevronDown className="text-gray-400 text-sm" />
                  )}
                </div>
              </div>
              {/* Expanded row for current user's picks */}
              <AnimatePresence>
                {expandCurrentUser && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mb-0 p-0 "
                  >
                    <div
                      ref={picksContainerRef}
                      className="px-3 max-h-[280px] overflow-auto pb-3 border-t border-gray-700/70 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-600"
                    >
                      <h3 className="pt-3 text-xs font-medium text-white mb-2 border-b border-gray-700 pb-1 sticky top-0 bg-gray-800/100 z-10">
                        Your Team
                      </h3>
                      <PicksGrid picks={currentUserData.picks} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </>
      )}

      {/* Search Bar */}
      <div className="relative mt-4 mb-4">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FaSearch className="text-gray-400 text-sm" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search players..."
          className="w-full pl-9 pr-3 py-2 text-sm bg-gray-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-white"
        />
      </div>
      {/* Pagination */}
      {filteredUsers.length > 0 && (
        <div className="flex flex-row items-center justify-between my-4 gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-300">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="bg-gray-800 text-white text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-row items-center gap-2">
            <span className="text-xs text-gray-300">
              {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded bg-gray-800 text-white text-xs disabled:opacity-50 hover:bg-gray-700 transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
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
            {paginatedUsers.length > 0 ? (
              paginatedUsers.map((user, index) => (
                <Fragment key={user.id}>
                  <tr
                    className={`hover:bg-gray-700/50 transition-colors ${currentUserId === user.id
                      ? "bg-blue-900/30"
                      : "bg-gray-800/30"
                      }`}
                    onClick={() => toggleExpand(user.id)}
                  >
                    <td className="px-2 py-2 whitespace-nowrap text-sm sticky left-0 z-10 bg-inherit">
                      <div className="flex items-center">
                        <span className="font-medium">
                          {user.rank}
                        </span>
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
                            src={user.profilePicture}
                            alt={user.displayName}
                            className="w-8 h-8 rounded-full object-cover mr-2"
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
                      {user.totalPoints}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs sm:text-sm text-gray-300 hidden sm:table-cell">
                      {user.mvp}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <button className="flex items-center justify-center w-full">
                        {expandedUserId === user.id ? (
                          <FaChevronUp className="text-gray-400 text-sm" />
                        ) : (
                          <FaChevronDown className="text-gray-400 text-sm" />
                        )}
                      </button>
                    </td>
                  </tr>

                  {/* Expanded row for picks */}
                  <AnimatePresence>
                    {expandedUserId === user.id && (
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
                            <PicksGrid picks={user.picks} />
                          </div>
                        </td>
                      </motion.tr>
                    )}
                  </AnimatePresence>
                </Fragment>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-4 text-center text-xs text-gray-400"
                >
                  No players found matching your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filteredUsers.length > 0 && (
        <div className="flex flex-row items-center justify-between mt-4 gap-2 mb-7 sm:mb-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-300">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="bg-gray-800 text-white text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-row items-center gap-2">
            <span className="text-xs text-gray-300">
              {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded bg-gray-800 text-white text-xs disabled:opacity-50 hover:bg-gray-700 transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded bg-gray-800 text-white text-xs disabled:opacity-50 hover:bg-gray-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
