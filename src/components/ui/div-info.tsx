import { useAuth } from "@/src/contexts/authProvider";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  getFirestore,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { FaTrophy } from "react-icons/fa";

const DivisionInfo = () => {
  interface User {
    id: string;
    name?: string;
    username?: string;
    pickems?: Record<string, string[]>;
  }

  const [liveEvent, setLiveEvent] = useState<{
    id: string | any;
    name: any;
  }>({
    id: null,
    name: "",
  });

  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const db = getFirestore();
  const { user } = useAuth();

  const fetchFromFirestore = async (path: string) => {
    try {
      const ref = collection(db, path);
      const snapshot = await getDocs(ref);
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return data;
    } catch (err) {
      console.error(`Error fetching from ${path}:`, err);
      setError(`Failed to load data from ${path}`);
      throw err;
    }
  };

  useEffect(() => {
    const fetchLiveEvent = async () => {
      try {
        const events = await fetchFromFirestore("events");
        const live = events.find((e: any) => e.status === "live");

        if (live) {
          const eventData = {
            id: live.id,
            name: live.id.replace(/_/g, " "),
          };
          setLiveEvent(eventData);
          await fetchLeaderboard(live.id);
        } else {
          setError("No active event currently running");
          setLoading(false);
        }
      } catch (err) {
        console.error("Error in fetchLiveEvent:", err);
        setError("Failed to load event data");
        setLoading(false);
      }
    };
    fetchLiveEvent();
  }, []);

  const fetchLeaderboard = async (eventId: string) => {
    try {
      const users: User[] = await fetchFromFirestore("users");

      const usersWithPickems = users
        .map((userDoc) => {
          const pickems = userDoc.pickems || {};
          const playerIds = pickems[eventId] || [];
          return {
            id: userDoc.id,
            displayName: userDoc?.name || userDoc?.username || "Unknown",
            playerIds,
          };
        })
        .filter((user) => user.playerIds.length > 0);

      const leaderboardWithPoints = await Promise.all(
        usersWithPickems.map(async (user) => {
          let totalPoints = 0;
          const playerLoadPromises = user.playerIds.map(async (playerId) => {
            if (!playerId) return 0;
            try {
              const playerRef = doc(
                db,
                `events/${eventId}/players/${playerId}`
              );
              const playerDoc = await getDoc(playerRef);
              return playerDoc.exists()
                ? playerDoc.get("Confirmed Kills") || 0
                : 0;
            } catch (err) {
              console.error(`Error loading player ${playerId}:`, err);
              return 0;
            }
          });

          const points = await Promise.all(playerLoadPromises);
          totalPoints = points.reduce((sum, point) => sum + point, 0);
          return { ...user, totalPoints };
        })
      );

      const sortedLeaderboard = leaderboardWithPoints.sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) {
          return b.totalPoints - a.totalPoints;
        }
        return a.displayName.localeCompare(b.displayName);
      });
      setLeaderboard(sortedLeaderboard);

      if (user?.uid) {
        const rank = sortedLeaderboard.findIndex((u) => u.id === user.uid) + 1;
        setCurrentUserRank(rank > 0 ? rank : null);
      }

      setLoading(false);
      setError(null);
    } catch (error) {
      console.error("Error in fetchLeaderboard:", error);
      setError("Failed to load leaderboard data");
      setLoading(false);
    }
  };

  const topUsers = leaderboard.slice(0, 3);
  const currentUserData = user?.uid
    ? leaderboard.find((u) => u.id === user.uid)
    : null;

  return (
    <section className="w-full p-2 md:p-4 rounded-xl bg-white/10 dark:bg-white/10">
      <div className="w-full">
        <div className="flex items-center mb-3">
          <h2 className="text-md font-bold text-white dark:text-white capitalize truncate">
            {liveEvent.name || "Event"} Leaderboard
          </h2>
        </div>

        <div className="w-full text-sm text-white dark:text-white">
          <div className="p-3 rounded-xl bg-[#101010] dark:bg-[#101010] border border-white/20 dark:border-white/20">
            {error ? (
              <div className="flex flex-col items-center justify-center py-4 space-y-2">
                <p className="text-red-400 text-sm">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-3 py-1.5 bg-blue-600 rounded hover:bg-blue-700 text-xs"
                >
                  Retry
                </button>
              </div>
            ) : loading ? (
              <div className="flex justify-center items-center py-4">
                <p className="text-sm">Loading leaderboard...</p>
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="flex justify-center items-center py-4">
                <p className="text-sm">No entries yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col lg:flex-row gap-2">
                  {topUsers.map((user, index) => (
                    <div
                      key={user.id}
                      className={`lg:w-1/3 p-2 rounded-lg ${
                        index === 0
                          ? "bg-gradient-to-b from-yellow-600/30 to-yellow-800/30 order-first"
                          : "bg-gray-800/50"
                      }`}
                    >
                      <div className="flex flex-col items-center">
                        <div className="flex items-center justify-center mb-1">
                          {index === 0 ? (
                            <FaTrophy className="text-yellow-400 text-md" />
                          ) : (
                            <span className="text-gray-300 font-bold text-sm">
                              {index + 1}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-medium truncate w-full text-center">
                          {user.displayName}
                        </div>
                        <div className="text-xs text-gray-300">
                          {user.totalPoints} pts
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {currentUserData && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="text-xs text-gray-400 mb-1">
                      YOUR POSITION
                    </div>
                    <div className="flex items-center justify-between p-2 bg-blue-900/30 dark:bg-blue-900/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="text-xs font-medium">You</div>
                          <div className="text-xs text-gray-300">
                            {currentUserRank
                              ? `#${currentUserRank}`
                              : "Not ranked"}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs font-bold">
                        {currentUserData.totalPoints} pts
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default DivisionInfo;
