"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";
import { useAuth } from "@/src/contexts/authProvider";
import { useSubscription } from "@/src/contexts/SubscriptionContext";
import { sortUserBadges, type UserBadges } from "@/src/lib/badges";
import BadgeCollectionGrid from "./BadgeCollectionGrid";

export default function ProfileBadgesSection() {
  const { userId } = useAuth();
  const { isSubscribed, showModal } = useSubscription();
  const [badges, setBadges] = useState<UserBadges | null>(null);

  useEffect(() => {
    if (!userId) {
      setBadges(null);
      return;
    }
    const unsub = onSnapshot(doc(db, "users", userId), (snap) => {
      const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
      setBadges((data?.badges ?? null) as UserBadges | null);
    });
    return () => unsub();
  }, [userId]);

  const earned = sortUserBadges(badges ?? {});
  const totalCount = earned.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="flex flex-col items-start w-full">
      <p className="text-sm text-gray-600 dark:text-white/60 mb-6 max-w-md">
        {totalCount > 0
          ? `You've won ${totalCount} badge${totalCount === 1 ? "" : "s"} so far. Keep playing to collect them all.`
          : "Keep playing to earn badges and show you know ball!"}
      </p>
      <BadgeCollectionGrid badges={badges} align="start" />
      <div className="mt-2 flex flex-col items-start">
        {isSubscribed ? (
          <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500 dark:text-white/50">
            Your badges show next to your name on every leaderboard
          </p>
        ) : (
          <button
            type="button"
            onClick={() => showModal("soft-gate")}
            className="bg-[#00f976] hover:opacity-90 text-black font-black text-xs uppercase tracking-widest rounded-lg px-6 py-3"
          >
            Subscribe to Display
          </button>
        )}
      </div>
    </div>
  );
}
