import { useAuth } from "@/src/contexts/authProvider";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  getFirestore,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { FaTrophy, FaUser } from "react-icons/fa";

const DivisionInfo = () => {
  interface User {
    id: string;
    name?: string;
    username?: string;
    pickems?: Record<string, string[]>; // Map of event IDs to arrays of player IDs
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

  // Helper to fetch documents from Firestore
  const fetchFromFirestore = async (path: string) => {
    try {
      console.log(`Fetching from Firestore path: ${path}`);
      const ref = collection(db, path);
      const snapshot = await getDocs(ref);
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      console.log(`Successfully fetched ${data.length} documents from ${path}`);
      return data;
    } catch (err) {
      console.error(`Error fetching from ${path}:`, err);
      setError(`Failed to load data from ${path}`);
      throw err;
    }
  };

  // Fetch live event details
  useEffect(() => {
    console.log("Starting to fetch live event");
    const fetchLiveEvent = async () => {
      try {
        const events = await fetchFromFirestore("events");
        const live = events.find((e: any) => e.status === "live");

        if (live) {
          console.log("Found live event:", live.id);
          const eventData = {
            id: live.id,
            name: live.id.replace(/_/g, " "),
          };
          setLiveEvent(eventData);
          await fetchLeaderboard(live.id);
        } else {
          console.log("No live event found");
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

  // Fetch leaderboard data with optimized loading
  const fetchLeaderboard = async (eventId: string) => {
    console.log(`Starting to fetch leaderboard for event ${eventId}`);
    try {
      const users: User[] = await fetchFromFirestore("users");
      console.log(`Fetched ${users.length} users`);

      // First pass - get basic leaderboard data without player details
      const initialLeaderboardData = users
        .map((userDoc) => {
          const pickems = userDoc.pickems || {};
          const playerIds = pickems[eventId] || [];
          return {
            id: userDoc.id,
            displayName: userDoc?.name || userDoc?.username || "Unknown",
            playerIds,
            totalPoints: 0, // Temporary, will be updated
            loadingPoints: playerIds.length > 0,
          };
        })
        .filter((user) => user.playerIds.length > 0);

      // Set initial leaderboard with names while we load points
      setLeaderboard(initialLeaderboardData);

      // Second pass - load player details and calculate points
      const leaderboardWithPoints = await Promise.all(
        initialLeaderboardData.map(async (user) => {
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
          return { ...user, totalPoints, loadingPoints: false };
        })
      );

      // Sort by points descending
      const sortedLeaderboard = leaderboardWithPoints.sort(
        (a, b) => b.totalPoints - a.totalPoints
      );
      console.log("Leaderboard sorted:", sortedLeaderboard);
      setLeaderboard(sortedLeaderboard);

      // Find current user's rank if logged in
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

  // Update countdown timer

  // Get top 3 users
  const topUsers = leaderboard.slice(0, 3);
  const currentUserData = user?.uid
    ? leaderboard.find((u) => u.id === user.uid)
    : null;

  return (
    <section className="flex flex-col justify-center p-4 mt-6 w-full rounded-2xl bg-white bg-opacity-10 max-md:max-w-full">
      <div className="w-full max-md:max-w-full">
        <div className="flex flex-wrap gap-2 items-end w-full max-md:max-w-full">
          <div className="flex flex-1 shrink gap-10 justify-between items-end basis-0 min-w-60 max-md:max-w-full">
            <div className="text-sm font-bold leading-none text-white">
              <div className="flex items-center w-full">
                <span className="self-stretch my-auto">
                  {liveEvent.name || "Event"} Leaderboard
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 w-full text-sm leading-none text-center text-white max-md:max-w-full">
          <div className="p-4 rounded-2xl border-solid bg-[#101010] border-[1px] border-[rgba(255,255,255,0.43)] w-[100%] max-md:max-w-full">
            {error ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-2">
                <p className="text-red-400">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 text-sm"
                >
                  Retry
                </button>
              </div>
            ) : loading ? (
              <div className="flex justify-center items-center py-8">
                <p>Loading leaderboard...</p>
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="flex justify-center items-center py-8">
                <p>No entries yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Top 3 Users */}
                <div className="flex justify-between items-center gap-4">
                  {topUsers.map((user, index) => (
                    <div
                      key={user.id}
                      className={`flex-1 p-3 rounded-lg ${
                        index === 0
                          ? "bg-gradient-to-b from-yellow-600/30 to-yellow-800/30"
                          : "bg-gray-800/50"
                      }`}
                    >
                      <div className="flex items-center justify-center mb-2">
                        {index === 0 ? (
                          <FaTrophy className="text-yellow-400 text-lg" />
                        ) : (
                          <span className="text-gray-300 font-bold">
                            {index + 1}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium truncate">
                        {user.displayName}
                      </div>
                      <div className="text-xs text-gray-300">
                        {user.loadingPoints
                          ? "Loading..."
                          : `${user.totalPoints} pts`}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Current User */}
                {currentUserData && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="text-xs text-gray-400 mb-2">
                      YOUR POSITION
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-900/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                          <FaUser className="text-gray-300" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">You</div>
                          <div className="text-xs text-gray-300">
                            {currentUserRank
                              ? `#${currentUserRank}`
                              : "Not ranked"}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm font-bold">
                        {currentUserData.loadingPoints
                          ? "..."
                          : `${currentUserData.totalPoints} pts`}
                      </div>
                    </div>
                  </div>
                )}

                {!currentUserData && user?.uid && (
                  <div className="mt-4 pt-4 border-t border-gray-700 text-sm">
                    You haven't entered this event yet
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
