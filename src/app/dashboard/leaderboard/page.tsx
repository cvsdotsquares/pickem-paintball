"use client";

import { useState, useEffect, Fragment } from "react";
import { db, storage } from "@/src/lib/firebaseClient";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getDownloadURL, ref } from "firebase/storage";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaChevronDown,
  FaChevronUp,
  FaUser,
  FaSearch,
  FaTrophy,
} from "react-icons/fa";

interface User {
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
}

interface LiveEvent {
  id: string;
  name: string;
  lockDate: Date | null;
  timeLeft: string;
}

export default function Leaderboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [liveEvent, setLiveEvent] = useState<LiveEvent | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentUserData, setCurrentUserData] = useState<User | null>(null);

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
  };

  // Fetch live event
  useEffect(() => {
    const fetchLiveEvent = async () => {
      try {
        const eventsCollection = collection(db, "events");
        const querySnapshot = await getDocs(eventsCollection);
        const events = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        const liveEvent = events.find((e: any) => e.status === "live");

        if (liveEvent) {
          const eventRef = doc(db, "events", liveEvent.id);
          const eventSnap = await getDoc(eventRef);

          if (eventSnap.exists()) {
            const eventData = eventSnap.data();
            const lockDate = eventData.lockDate?.toDate
              ? eventData.lockDate.toDate()
              : null;

            setLiveEvent({
              id: liveEvent.id,
              name: eventData.name || "Current Event",
              lockDate,
              timeLeft: "",
            });
          }
        }
      } catch (error) {
        console.error("Error fetching live event:", error);
      }
    };

    fetchLiveEvent();
  }, []);

  // Fetch profile picture from Firebase Storage
  const fetchProfilePicture = async (userId: string) => {
    try {
      const storagePath = `user/${userId}/profile_200x200`;
      const storageRef = ref(storage, storagePath);
      return await getDownloadURL(storageRef);
    } catch (error) {
      return null;
    }
  };

  useEffect(() => {
    async function fetchLeaderboardData() {
      if (!liveEvent) return;

      try {
        const usersCollection = collection(db, "users");
        const querySnapshot = await getDocs(usersCollection);

        const usersData = await Promise.all(
          querySnapshot.docs.map(async (userDoc) => {
            const userId = userDoc.id;
            const displayName =
              userDoc.get("name") || userDoc.get("username") || "Unknown User";

            // Fetch profile picture
            let profilePicture = null;
            try {
              profilePicture = await fetchProfilePicture(userId);
            } catch (error) {
              console.error(`Error fetching profile for ${userId}:`, error);
            }

            const pickems = userDoc.get("pickems") || {};
            const playerIds = Array.isArray(pickems[liveEvent.id])
              ? pickems[liveEvent.id]
              : [];

            let totalPoints = 0;
            let mvp = { playerName: "None", kills: 0 };
            const picks: PlayerPick[] = [];

            await Promise.allSettled(
              playerIds.map(async (playerId: string | null) => {
                if (!playerId) return;

                try {
                  const playerPath = `events/${liveEvent.id}/players/${playerId}`;
                  const playerRef = doc(db, playerPath);
                  const playerDoc = await getDoc(playerRef);

                  if (playerDoc.exists()) {
                    const totalKills = playerDoc.get("Confirmed Kills") || 0;
                    const playerName =
                      playerDoc.get("Player") || "Unknown Player";
                    const playerCost = playerDoc.get("Cost") || 0;

                    totalPoints += totalKills;
                    picks.push({
                      id: playerId,
                      name: playerName,
                      kills: totalKills,
                      cost: playerCost,
                    });

                    if (totalKills > mvp.kills) {
                      mvp = { playerName, kills: totalKills };
                    }
                  }
                } catch (error) {
                  console.error(
                    `Error fetching player data for ID: ${playerId}`,
                    error
                  );
                }
              })
            );

            return {
              id: userId,
              displayName,
              totalPoints,
              mvp: mvp.playerName,
              picks,
              profilePicture: profilePicture || undefined,
            };
          })
        );

        // Filter out users with no picks and sort by totalPoints
        const sortedUsers = usersData
          .filter((user) => user.picks.length > 0)
          .sort((a, b) => b.totalPoints - a.totalPoints);

        setUsers(sortedUsers);
        setFilteredUsers(sortedUsers);

        // Find and set current user data if logged in
        if (currentUserId) {
          const currentUser = sortedUsers.find(
            (user) => user.id === currentUserId
          );
          if (currentUser) {
            setCurrentUserData(currentUser);
          }
        }

        setLoading(false);
      } catch (error) {
        console.error("Error fetching leaderboard data:", error);
        setLoading(false);
      }
    }

    fetchLeaderboardData();
  }, [liveEvent, currentUserId]);

  // Filter users based on search query
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

  // Get current user's rank
  const currentUserRank = currentUserData
    ? filteredUsers.findIndex((user) => user.id === currentUserId) + 1
    : null;

  // Slice the users array for current page display
  const paginatedUsers = filteredUsers.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  return (
    <div className="p-2 sm:p-4 my-16 min-h-screen overflow-auto bg-black text-white">
      {/* Event Header */}
      <div className="mb-4 text-center">
        <h1 className="text-xl sm:text-2xl font-bold mb-1">{liveEvent.name}</h1>
        <p className="text-sm sm:text-base">Event Leaderboard</p>
      </div>

      {/* Current User Card (sticky on mobile) */}
      {currentUserData && (
        <div className="sticky top-0 z-10 mb-4 bg-gray-800/80 backdrop-blur-sm rounded-lg p-2 sm:p-3 shadow border border-gray-700">
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
                  {currentUserData.totalPoints} kills
                </span>
              </div>
              <p className="text-xs text-gray-400">
                MVP: {currentUserData.mvp}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative mb-4">
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
                    className={`hover:bg-gray-700/50 transition-colors ${
                      currentUserId === user.id
                        ? "bg-blue-900/30"
                        : "bg-gray-800/30"
                    }`}
                    onClick={() => toggleExpand(user.id)}
                  >
                    <td className="px-2 py-2 whitespace-nowrap text-sm sticky left-0 z-10 bg-inherit">
                      <div className="flex items-center">
                        <span className="font-medium">
                          {index + 1 + (page - 1) * pageSize}
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {user.picks
                                .sort((a, b) => {
                                  if (b.kills !== a.kills)
                                    return b.kills - a.kills; // Sort by kills descending
                                  return a.name.localeCompare(b.name); // If kills equal, sort by name ascending
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
                                        {pick.kills} kills
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center mt-1 text-xs">
                                      <span className="text-gray-400">
                                        ${pick.cost}
                                      </span>
                                      <span className="text-yellow-400">
                                        {(
                                          (pick.kills / pick.cost) *
                                          100
                                        ).toFixed(1)}
                                        %
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
        <div className="flex flex-row items-center justify-between mt-4 gap-2">
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
