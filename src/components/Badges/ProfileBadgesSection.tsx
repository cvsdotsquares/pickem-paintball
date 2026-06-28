"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";
import { useAuth } from "@/src/contexts/authProvider";
import { useSubscription } from "@/src/contexts/SubscriptionContext";
import { sortUserBadges, type BadgeId, type UserBadges } from "@/src/lib/badges";
import BadgeCollectionGrid from "./BadgeCollectionGrid";

const MAX_DISPLAY_BADGES = 3;

export default function ProfileBadgesSection() {
  const { userId } = useAuth();
  const { isSubscribed, showModal } = useSubscription();
  const [badges, setBadges] = useState<UserBadges | null>(null);
  const [displayBadges, setDisplayBadges] = useState<BadgeId[]>([]);

  useEffect(() => {
    if (!userId) {
      setBadges(null);
      setDisplayBadges([]);
      return;
    }
    const unsub = onSnapshot(doc(db, "users", userId), (snap) => {
      const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
      setBadges((data?.badges ?? null) as UserBadges | null);
      setDisplayBadges((data?.displayBadges ?? []) as BadgeId[]);
    });
    return () => unsub();
  }, [userId]);

  const earned = sortUserBadges(badges ?? {});
  const totalCount = earned.reduce((sum, b) => sum + b.count, 0);

  const handleToggle = (id: BadgeId) => {
    if (!userId || !isSubscribed) return;
    const current = displayBadges;
    let next: BadgeId[];
    if (current.includes(id)) {
      next = current.filter((x) => x !== id);
    } else if (current.length < MAX_DISPLAY_BADGES) {
      next = [...current, id];
    } else {
      return; // at max
    }
    setDisplayBadges(next); // optimistic
    void updateDoc(doc(db, "users", userId), { displayBadges: next });
  };

  return (
    <div className="flex flex-col items-start w-full">
      <p className="text-sm text-gray-600 dark:text-white/60 mb-6 max-w-md">
        {totalCount > 0
          ? `You've won ${totalCount} badge${totalCount === 1 ? "" : "s"} so far. Keep playing to collect them all.`
          : "Keep playing to earn badges and show you know ball!"}
      </p>
      <BadgeCollectionGrid
        badges={badges}
        align="start"
        selectable={isSubscribed}
        selected={displayBadges}
        onToggleSelect={handleToggle}
        maxSelect={MAX_DISPLAY_BADGES}
        emptyHint={
          isSubscribed
            ? "Tap up to 3 badges to feature on your team card — the order you tap is the order they show"
            : "Hover or tap a badge to see how to earn it"
        }
      />
      <div className="mt-2 flex flex-col items-start">
        {isSubscribed ? (
          <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500 dark:text-white/50 max-w-md">
            Your featured badges show on your team card. All earned badges show
            next to your name on the leaderboard.
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
