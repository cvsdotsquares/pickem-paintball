"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";
import type { BadgeId } from "@/src/lib/badges";

interface BadgeStats {
  totalUsers: number;
  counts: Partial<Record<BadgeId, number>>;
}

export function useBadgeRarity(): (id: BadgeId) => string | null {
  const [stats, setStats] = useState<BadgeStats | null>(null);

  useEffect(() => {
    const ref = doc(db, "stats", "badges");
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setStats(null);
        return;
      }
      const data = snap.data();
      setStats({
        totalUsers: Number(data.totalUsers) || 0,
        counts: (data.counts ?? {}) as Partial<Record<BadgeId, number>>,
      });
    });
    return () => unsub();
  }, []);

  return (id: BadgeId) => {
    if (!stats || stats.totalUsers <= 0) return null;
    const held = stats.counts[id] ?? 0;
    if (held <= 0) return null;
    const pct = (held / stats.totalUsers) * 100;
    if (pct < 1) return "<1%";
    return `${Math.round(pct)}%`;
  };
}
