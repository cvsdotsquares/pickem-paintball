import { useAuth } from "@/src/contexts/authProvider";
import { doc, getFirestore, onSnapshot, collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import { FaTrophy } from "react-icons/fa";

const DivisionInfo = () => {
  const [liveEventId, setLiveEventId] = useState<string | null>(null);
  const [liveEventName, setLiveEventName] = useState<string>("");
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const db = getFirestore();
  const { user } = useAuth();

  // Resolve the current live event once
  useEffect(() => {
    const fetchLiveEvent = async () => {
      try {
        const snap = await getDocs(collection(db, "events"));
        const live = snap.docs.find(d => d.data().status === "live");
        if (live) {
          setLiveEventId(live.id);
          setLiveEventName(live.data().name || live.id.replace(/_/g, " "));
        } else {
          setError("No active event currently running");
          setLoading(false);
        }
      } catch {
        setError("Failed to load event data");
        setLoading(false);
      }
    };
    fetchLiveEvent();
  }, []);

  // Subscribe to the pre-computed summary doc — updates whenever Cloud Function runs
  useEffect(() => {
    if (!liveEventId) return;

    const unsub = onSnapshot(doc(db, "leaderboards", liveEventId), (snap) => {
      if (!snap.exists()) {
        // Summary doc created on first macro run — show neutral state until then
        setLeaderboard([]);
        setLoading(false);
        return;
      }

      const users: any[] = snap.data()?.users || [];
      // Sort is pre-applied by Cloud Function; just use the array as-is
      setLeaderboard(users);

      if (user?.uid) {
        const idx = users.findIndex(u => u.id === user.uid);
        setCurrentUserRank(idx >= 0 ? idx + 1 : null);
      }

      setLoading(false);
      setError(null);
    });

    return () => unsub();
  }, [liveEventId, user?.uid]);

  const topUsers = leaderboard.slice(0, 3);
  const currentUserData = user?.uid
    ? leaderboard.find(u => u.id === user.uid)
    : null;

  return (
    <section className="w-full p-2 md:p-4 rounded-xl bg-white/10 dark:bg-white/10">
      <div className="w-full">
        <div className="flex items-center mb-3">
          <h2 className="text-md font-bold text-white dark:text-white capitalize truncate">
            {liveEventName || "Event"} Leaderboard
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
              <div className="flex flex-col items-center justify-center py-4 gap-1">
                <p className="text-sm font-semibold text-white">{liveEventName}</p>
                <p className="text-xs text-gray-400">Leaderboard will update when event is live</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col lg:flex-row gap-2">
                  {topUsers.map((u, index) => (
                    <div
                      key={u.id}
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
                          {u.displayName}
                        </div>
                        <div className="text-xs text-gray-300">
                          {u.eventPTS ?? 0} pts
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {currentUserData && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="text-xs text-gray-400 mb-1">YOUR POSITION</div>
                    <div className="flex items-center justify-between p-2 bg-blue-900/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="text-xs font-medium">You</div>
                          <div className="text-xs text-gray-300">
                            {currentUserRank ? `#${currentUserRank}` : "Not ranked"}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs font-bold">
                        {currentUserData.eventPTS ?? 0} pts
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
