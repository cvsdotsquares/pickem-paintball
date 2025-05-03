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
    lockDate: Date | any;
    timeLeft: any;
  }>({
    id: null,
    name: "",
    lockDate: null,
    timeLeft: "", // This should match the `string` type
  });

  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const db = getFirestore();
  const { user } = useAuth();

  // Helper to fetch documents from Firestore
  const fetchFromFirestore = async (path: string) => {
    const ref = collection(db, path);
    const snapshot = await getDocs(ref);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  };

  // Fetch live event details
  useEffect(() => {
    const fetchLiveEvent = async () => {
      const events = await fetchFromFirestore("events");
      const live = events.find((e: any) => e.status === "live");
      if (live) {
        setLiveEvent({
          id: liveEvent.id,
          name: liveEvent.id.replace(/_/g, " "),
          lockDate: liveEvent.lockDate?.toDate() || new Date(),
          timeLeft: "",
        });
        fetchLeaderboard(liveEvent.id);
      } else {
        setLoading(false);
      }
    };
    fetchLiveEvent();
  }, []);

  // Fetch leaderboard data
  const fetchLeaderboard = async (eventId: string) => {
    try {
      const users: User[] = await fetchFromFirestore("users");
      const leaderboardData: {
        id: string;
        displayName: string;
        totalPoints: number;
      }[] = [];

      for (const userDoc of users) {
        const userId = userDoc.id;
        const pickems = userDoc.pickems || {}; // Safely default to an empty object
        const playerIds = pickems[eventId] || []; // Get the array of player IDs for the current event

        let totalPoints = 0;

        // Calculate points from player picks
        for (const playerId of playerIds) {
          if (!playerId) continue;
          const playerRef = doc(db, `events/${eventId}/players/${playerId}`);
          const playerDoc = await getDoc(playerRef);
          if (playerDoc.exists()) {
            totalPoints += playerDoc.get("Confirmed Kills") || 0;
          }
        }

        if (playerIds.length > 0) {
          leaderboardData.push({
            id: userId,
            displayName: userDoc?.name || userDoc?.username || "Unknown",
            totalPoints,
          });
        }
      }

      // Sort by points descending
      const sortedLeaderboard = leaderboardData.sort(
        (a, b) => b.totalPoints - a.totalPoints
      );
      setLeaderboard(sortedLeaderboard);

      // Find current user's rank if logged in
      if (user?.uid) {
        const rank = sortedLeaderboard.findIndex((u) => u.id === user.uid) + 1;
        setCurrentUserRank(rank > 0 ? rank : null);
      }

      setLoading(false);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      setLoading(false);
    }
  };

  // Update countdown timer
  useEffect(() => {
    const { lockDate } = liveEvent;
    if (!lockDate) return;

    const updateTimeLeft = () => {
      const now = new Date();
      const diff = lockDate.getTime() - now.getTime();
      if (diff <= 0) {
        setLiveEvent((prev) => ({ ...prev, timeLeft: "Picks locked!" }));
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setLiveEvent((prev) => ({
        ...prev,
        timeLeft: `${hours}h ${minutes}m ${seconds}s`,
      }));
    };

    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [liveEvent.lockDate]);

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
              <div className="mt-1 w-full text-xs font-normal">
                {liveEvent.timeLeft || "Loading..."}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 w-full text-sm leading-none text-center text-white max-md:max-w-full">
          <div className="p-4 rounded-2xl border-solid bg-[#101010] border-[1px] border-[rgba(255,255,255,0.43)] w-[100%] max-md:max-w-full">
            {loading ? (
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
                        {user.totalPoints} pts
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
                        {currentUserData.totalPoints} pts
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
