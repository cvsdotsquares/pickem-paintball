import type { Firestore } from "firebase-admin/firestore";
import {
  BADGE_DEFINITIONS,
  COMPLETED_SEASON_YEARS,
  type BadgeId,
  type UserBadges,
  rankToEventBadge,
  rankToSeasonBadge,
} from "./badges";

interface EventInfo {
  id: string;
  killCountLeaderId: string | null;
  lockDate: Date | null;
  year: string | null;
}

interface CalculateResult {
  usersUpdated: number;
  eventsProcessed: number;
  seasonsComplete: string[];
}

function extractYear(eventId: string, eventData: Record<string, unknown>): string | null {
  const yearField = eventData.year;
  if (typeof yearField === "string" && yearField.trim()) return yearField.trim();
  if (typeof yearField === "number") return String(yearField);
  const match = eventId.match(/(20\d{2})/);
  return match ? match[1] : null;
}

async function loadEvents(db: Firestore): Promise<EventInfo[]> {
  const eventsSnap = await db.collection("events").get();
  const events: EventInfo[] = [];
  const now = Date.now();

  for (const eventDoc of eventsSnap.docs) {
    const eventId = eventDoc.id;
    const eventData = eventDoc.data();

    const eventEndsAt = eventData.eventEndsAt?.toDate?.() ?? null;
    const status = typeof eventData.status === "string" ? eventData.status : null;
    // Only include closed events. An event is closed if status === "archived"
    // (the canonical post-event flag) OR its eventEndsAt is in the past
    // (covers events whose status hasn't flipped yet).
    const isArchived = status === "archived";
    const hasEnded = eventEndsAt !== null && eventEndsAt.getTime() <= now;
    if (!isArchived && !hasEnded) continue;

    const playersSnap = await db.collection(`events/${eventId}/players`).get();
    let killCountLeaderId: string | null = null;
    let maxKills = -1;
    for (const playerDoc of playersSnap.docs) {
      const kills = Number(playerDoc.get("Confirmed Kills") ?? 0);
      if (kills > maxKills) {
        maxKills = kills;
        killCountLeaderId = playerDoc.id;
      }
    }

    const lockRaw = eventData.lockDate;
    let lockDate: Date | null = null;
    if (lockRaw && typeof (lockRaw as { toDate?: () => Date }).toDate === "function") {
      lockDate = (lockRaw as { toDate: () => Date }).toDate();
    } else if (typeof lockRaw === "string" || typeof lockRaw === "number") {
      const d = new Date(lockRaw);
      if (!Number.isNaN(d.getTime())) lockDate = d;
    }

    events.push({
      id: eventId,
      killCountLeaderId,
      lockDate,
      year: extractYear(eventId, eventData),
    });
  }

  // Sort chronologically. Primary key is the year parsed from the event id
  // (so legacy 2024 events with no lockDate still come before 2025). Secondary
  // key is lockDate within a year.
  events.sort((a, b) => {
    const ay = Number(a.year) || 0;
    const by = Number(b.year) || 0;
    if (ay !== by) return ay - by;
    const aTime = a.lockDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.lockDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  return events;
}

/**
 * Map of userId -> map of seasonYear -> seasonRank, loaded from the
 * `leaderboards/season_{year}` docs for every closed season.
 */
type SeasonRanksByUser = Map<string, Map<string, number>>;

async function loadCompletedSeasonRanks(
  db: Firestore,
  events: EventInfo[],
): Promise<SeasonRanksByUser> {
  const out: SeasonRanksByUser = new Map();

  for (const year of COMPLETED_SEASON_YEARS) {
    // Prefer the cloud-function-built leaderboard doc when present.
    const snap = await db.collection("leaderboards").doc(`season_${year}`).get();
    let usedDoc = false;
    if (snap.exists) {
      const users = (snap.get("users") ?? []) as Array<Record<string, unknown>>;
      if (Array.isArray(users) && users.length > 0) {
        usedDoc = true;
        for (const u of users) {
          const id = typeof u.id === "string" ? u.id : null;
          if (!id) continue;
          const rankRaw = u.seasonRank;
          const rank = typeof rankRaw === "number" ? rankRaw : Number(rankRaw);
          if (!Number.isFinite(rank) || rank < 1) continue;
          const userMap = out.get(id) ?? new Map<string, number>();
          userMap.set(year, rank);
          out.set(id, userMap);
        }
      }
    }
    if (usedDoc) continue;

    // Fallback: compute season ranks from user docs by summing per-event PTS
    // for events of this year. Required for closed seasons where the cloud
    // function never populated `leaderboards/season_${year}`.
    const yearEventIds = events.filter((e) => e.year === year).map((e) => e.id);
    if (yearEventIds.length === 0) continue;

    const usersSnap = await db.collection("users").get();
    const totals: Array<{ id: string; pts: number }> = [];
    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data();
      let total = 0;
      let played = false;
      for (const eid of yearEventIds) {
        const pts = parseFloat(String(data[`${eid}PTS`] ?? 0));
        if (Number.isFinite(pts) && pts !== 0) {
          total += pts;
          played = true;
        }
      }
      if (played) totals.push({ id: userDoc.id, pts: total });
    }
    totals.sort((a, b) => b.pts - a.pts);

    let lastPts: number | null = null;
    let currentRank = 0;
    totals.forEach((t, i) => {
      if (lastPts === null || t.pts !== lastPts) {
        currentRank = i + 1;
        lastPts = t.pts;
      }
      const userMap = out.get(t.id) ?? new Map<string, number>();
      userMap.set(year, currentRank);
      out.set(t.id, userMap);
    });
  }
  return out;
}

function computeUserBadges(
  userData: Record<string, unknown>,
  events: EventInfo[],
  completedSeasonRanks: Map<string, number> = new Map(),
): UserBadges {
  const badges: UserBadges = {};
  const pickems = (userData.pickems ?? {}) as Record<string, unknown>;

  const eventsPlayed = new Set<string>();

  for (const event of events) {
    const picks = pickems[event.id];
    const hasPlayed = Array.isArray(picks) && picks.length > 0;
    if (!hasPlayed) continue;

    eventsPlayed.add(event.id);

    const rankRaw = userData[`${event.id}Rank`];
    const rank = typeof rankRaw === "number" ? rankRaw : Number(rankRaw);
    const eventBadge = rankToEventBadge(rank);
    if (eventBadge) {
      const existing = badges[eventBadge] ?? { count: 0 };
      badges[eventBadge] = { count: existing.count + 1 };
    }

    if (
      event.killCountLeaderId &&
      (picks as string[]).includes(event.killCountLeaderId)
    ) {
      const existing = badges.event_mvp ?? { count: 0 };
      badges.event_mvp = { count: existing.count + 1 };
    }
  }

  // Current active streak: consecutive played events ending at the most
  // recent closed event. Missing any event breaks the streak.
  let currentStreak = 0;
  for (const event of events) {
    if (eventsPlayed.has(event.id)) {
      currentStreak += 1;
    } else {
      currentStreak = 0;
    }
  }
  if (currentStreak >= 2) {
    badges.streak = { count: currentStreak };
  }

  completedSeasonRanks.forEach((rank) => {
    const seasonBadge = rankToSeasonBadge(rank);
    if (!seasonBadge) return;
    const existing = badges[seasonBadge] ?? { count: 0 };
    badges[seasonBadge] = { count: existing.count + 1 };
  });

  return badges;
}

export async function calculateBadgesForAllUsers(
  db: Firestore,
): Promise<CalculateResult> {
  const events = await loadEvents(db);
  const seasonRanksByUser = await loadCompletedSeasonRanks(db, events);
  const usersSnap = await db.collection("users").get();
  const latestEventId = events.length > 0 ? events[events.length - 1].id : null;

  const writer = db.bulkWriter();
  let usersUpdated = 0;
  const counts: Record<string, number> = {};

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    const userSeasonRanks = seasonRanksByUser.get(userDoc.id) ?? new Map();
    const badges = computeUserBadges(userData, events, userSeasonRanks);

    for (const [id, entry] of Object.entries(badges)) {
      if (entry && entry.count > 0) counts[id] = (counts[id] ?? 0) + 1;
    }

    writer.update(userDoc.ref, {
      badges,
      badgesCalculatedAt: new Date(),
      lastBadgeCalcEvent: latestEventId,
    });
    usersUpdated += 1;
  }

  await writer.close();

  await db.collection("stats").doc("badges").set({
    totalUsers: usersUpdated,
    counts,
    updatedAt: new Date(),
  });

  return {
    usersUpdated,
    eventsProcessed: events.length,
    seasonsComplete: [...COMPLETED_SEASON_YEARS],
  };
}

export async function calculateBadgesForUser(
  db: Firestore,
  userId: string,
): Promise<UserBadges> {
  const events = await loadEvents(db);
  const seasonRanksByUser = await loadCompletedSeasonRanks(db, events);
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) {
    throw new Error(`User ${userId} not found`);
  }
  const userSeasonRanks = seasonRanksByUser.get(userId) ?? new Map();
  const badges = computeUserBadges(userDoc.data() ?? {}, events, userSeasonRanks);
  const latestEventId = events.length > 0 ? events[events.length - 1].id : null;
  await userDoc.ref.update({
    badges,
    badgesCalculatedAt: new Date(),
    lastBadgeCalcEvent: latestEventId,
  });
  return badges;
}

export const _internal = {
  computeUserBadges,
  loadEvents,
  loadCompletedSeasonRanks,
  BADGE_DEFINITIONS,
};
