"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";
import { getAuth } from "firebase/auth";
import { useAuth } from "@/src/contexts/authProvider";
import { useSubscription } from "@/src/contexts/SubscriptionContext";
import {
  type BadgeId,
  type UserBadges,
  rankToEventBadge,
} from "@/src/lib/badges";
import PostEventModal, { type TeamHighlight } from "./PostEventModal";

interface PostEventTarget {
  id: string;
  name: string;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null) {
    const maybe = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybe.toDate === "function") return maybe.toDate();
    if (typeof maybe.seconds === "number") return new Date(maybe.seconds * 1000);
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Picks the event whose post-event modal should be shown right now.
 *
 * Rule: the most recent event that has ended (status==="archived" OR
 * eventEndsAt in the past), AS LONG AS the next event's picks haven't
 * locked yet. Once the next event locks, this modal becomes unreachable.
 */
async function loadPostEventTarget(): Promise<PostEventTarget | null> {
  const snap = await getDocs(collection(db, "events"));
  const now = Date.now();

  type Row = {
    id: string;
    name: string;
    lockDate: Date | null;
    eventEndsAt: Date | null;
    status: string | null;
  };
  const rows: Row[] = [];

  for (const d of snap.docs) {
    const data = d.data();
    rows.push({
      id: d.id,
      name: typeof data.name === "string" ? data.name : d.id,
      lockDate: toDate(data.lockDate),
      eventEndsAt: toDate(data.eventEndsAt),
      status: typeof data.status === "string" ? data.status : null,
    });
  }

  const closed = rows
    .filter(
      (r) =>
        r.status === "archived" ||
        (r.eventEndsAt !== null && r.eventEndsAt.getTime() <= now),
    )
    .sort((a, b) => {
      const al = a.lockDate?.getTime() ?? 0;
      const bl = b.lockDate?.getTime() ?? 0;
      return bl - al;
    });

  const latestClosed = closed[0];
  if (!latestClosed) return null;

  // Find the next event (chronologically after latestClosed). If its picks
  // have already locked, we're into the next event's active phase — hide.
  const latestLockTime = latestClosed.lockDate?.getTime() ?? 0;
  const nextEvent = rows
    .filter(
      (r) =>
        r.id !== latestClosed.id &&
        r.lockDate !== null &&
        r.lockDate.getTime() > latestLockTime,
    )
    .sort(
      (a, b) => (a.lockDate?.getTime() ?? 0) - (b.lockDate?.getTime() ?? 0),
    )[0];

  if (nextEvent && (nextEvent.lockDate?.getTime() ?? 0) <= now) return null;

  return { id: latestClosed.id, name: latestClosed.name };
}

interface Props {
  onSubscribeClick?: () => void;
}

export default function BadgesModalsController({ onSubscribeClick }: Props) {
  const { userId } = useAuth();
  const { isSubscribed, showModal } = useSubscription();
  const subscribeHandler =
    onSubscribeClick ?? (() => showModal("soft-gate"));

  const [userData, setUserData] = useState<Record<string, unknown> | null>(
    null,
  );
  const [target, setTarget] = useState<PostEventTarget | null>(null);
  const [showPostEvent, setShowPostEvent] = useState(false);
  const [teamHighlights, setTeamHighlights] = useState<TeamHighlight[]>([]);
  const [killLeaderId, setKillLeaderId] = useState<string | null>(null);
  const [seasonRankFromDoc, setSeasonRankFromDoc] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) {
      setUserData(null);
      return;
    }
    const ref = doc(db, "users", userId);
    const unsub = onSnapshot(ref, (snap) => {
      setUserData(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
    });
    return () => unsub();
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setTarget(null);
      return;
    }
    let cancelled = false;
    loadPostEventTarget().then((t) => {
      if (!cancelled) setTarget(t);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userData || !userId || !target) return;
    if (userData.lastBadgeCalcEvent === target.id) return;

    let cancelled = false;
    (async () => {
      try {
        const user = getAuth().currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const res = await fetch("/api/badges/recalculate-self", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          console.error("[badges] recalculate-self failed", await res.text());
        }
      } catch (err) {
        if (!cancelled) console.error("[badges] recalculate-self error", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userData, userId, target]);

  useEffect(() => {
    if (!userData || !userId) return;
    if (userData.badgesAnnouncementSeen !== true) return;
    if (!target) return;
    if (userData.postEventModalSeen === target.id) return;
    if (userData.lastBadgeCalcEvent !== target.id) return;

    const pickems = (userData.pickems ?? {}) as Record<string, unknown>;
    const userPicks = pickems[target.id];
    if (!Array.isArray(userPicks) || userPicks.length === 0) return;

    setShowPostEvent(true);
  }, [userData, userId, target]);

  useEffect(() => {
    if (!showPostEvent || !target || !userData) return;

    let cancelled = false;
    (async () => {
      const pickems = (userData.pickems ?? {}) as Record<string, unknown>;
      const picks = (pickems[target.id] ?? []) as string[];
      if (picks.length === 0) {
        if (!cancelled) {
          setTeamHighlights([]);
          setKillLeaderId(null);
        }
        return;
      }
      const playerDocs = await Promise.all(
        picks.map((pid) =>
          getDoc(doc(db, `events/${target.id}/players`, pid)).catch(() => null),
        ),
      );
      const highlights: TeamHighlight[] = [];
      for (const pd of playerDocs) {
        if (!pd || !pd.exists()) continue;
        highlights.push({
          playerName: String(pd.get("Player") ?? "Unknown"),
          playerTeam: String(pd.get("Team") ?? ""),
          kills: Number(pd.get("Confirmed Kills") ?? 0),
        });
      }
      highlights.sort((a, b) => b.kills - a.kills);

      const leaderQ = query(
        collection(db, `events/${target.id}/players`),
        orderBy("Confirmed Kills", "desc"),
        limit(1),
      );
      const leaderSnap = await getDocs(leaderQ).catch(() => null);
      const leader = leaderSnap?.docs[0];
      const leaderId =
        leader && Number(leader.get("Confirmed Kills") ?? 0) > 0
          ? leader.id
          : null;

      if (!cancelled) {
        setTeamHighlights(highlights);
        setKillLeaderId(leaderId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showPostEvent, target, userData]);

  useEffect(() => {
    if (!target || !userId) {
      setSeasonRankFromDoc(null);
      return;
    }
    const yearMatch = target.id.match(/(20\d{2})/);
    const year = yearMatch ? yearMatch[1] : null;
    if (!year) {
      setSeasonRankFromDoc(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "leaderboards", `season_${year}`));
        if (!snap.exists()) {
          if (!cancelled) setSeasonRankFromDoc(null);
          return;
        }
        const users = (snap.get("users") ?? []) as Array<Record<string, unknown>>;
        const me = users.find((u) => u.id === userId);
        const rankRaw = me?.seasonRank;
        const rank = typeof rankRaw === "number" ? rankRaw : Number(rankRaw);
        if (!cancelled) {
          setSeasonRankFromDoc(Number.isFinite(rank) && rank > 0 ? rank : null);
        }
      } catch (err) {
        console.error("[badges] seasonRank load failed", err);
        if (!cancelled) setSeasonRankFromDoc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target, userId]);

  const closePostEvent = async () => {
    setShowPostEvent(false);
    if (userId && target) {
      try {
        await updateDoc(doc(db, "users", userId), {
          postEventModalSeen: target.id,
        });
      } catch (err) {
        console.error("[badges] failed to mark post-event seen", err);
      }
    }
  };

  const newBadgesForEvent = useMemo(() => {
    if (!showPostEvent || !target || !userData) return [];
    const result: Array<{ id: BadgeId; count: number; delta?: number }> = [];
    const rankRaw = userData[`${target.id}Rank`];
    const rank = typeof rankRaw === "number" ? rankRaw : Number(rankRaw);
    const storedBadges = (userData.badges ?? {}) as UserBadges;
    const eventBadge = rankToEventBadge(rank);
    if (eventBadge) {
      const cumulative = storedBadges[eventBadge]?.count ?? 1;
      result.push({ id: eventBadge, count: cumulative, delta: 1 });
    }

    const pickems = (userData.pickems ?? {}) as Record<string, unknown>;
    const picks = (pickems[target.id] ?? []) as string[];
    if (killLeaderId && Array.isArray(picks) && picks.includes(killLeaderId)) {
      const cumulative = storedBadges.event_mvp?.count ?? 1;
      result.push({ id: "event_mvp", count: cumulative, delta: 1 });
    }

    const streakCount = storedBadges.streak?.count ?? 0;
    if (streakCount >= 2) {
      result.push({ id: "streak", count: streakCount, delta: 1 });
    }

    return result;
  }, [showPostEvent, target, userData, killLeaderId]);

  const eventRank = useMemo(() => {
    if (!target || !userData) return null;
    const r = Number(userData[`${target.id}Rank`]);
    return Number.isFinite(r) && r > 0 ? r : null;
  }, [userData, target]);

  const eventPoints = useMemo(() => {
    if (!target || !userData) return null;
    const p = Number(userData[`${target.id}PTS`]);
    return Number.isFinite(p) ? p : null;
  }, [userData, target]);

  const seasonRank = seasonRankFromDoc;

  if (!userId || !target) return null;

  return (
    <PostEventModal
      isOpen={showPostEvent}
      onClose={closePostEvent}
      eventName={target.name}
      eventRank={eventRank}
      eventPoints={eventPoints}
      seasonRank={seasonRank}
      newBadges={newBadgesForEvent}
      teamHighlights={teamHighlights}
      isSubscribed={isSubscribed}
      onSubscribeClick={subscribeHandler}
    />
  );
}
