import type { Timestamp } from "firebase/firestore";

export type BadgeId =
  | "streak"
  | "event_winner"
  | "event_top10"
  | "event_top25"
  | "event_top50"
  | "event_mvp"
  | "season_winner"
  | "season_top10"
  | "season_top25"
  | "season_top50";

export type BadgeCategory = "event" | "season" | "special";

export interface BadgeDefinition {
  id: BadgeId;
  name: string;
  description: string;
  category: BadgeCategory;
  imageSrc: string;
  showCount: boolean;
}

export interface UserBadge {
  count: number;
  lastEarnedAt?: Timestamp | null;
}

export type UserBadges = Partial<Record<BadgeId, UserBadge>>;

export const BADGE_DEFINITIONS: Record<BadgeId, BadgeDefinition> = {
  streak: {
    id: "streak",
    name: "Streak",
    description: "Played consecutive events in a row",
    category: "special",
    imageSrc: "/badges/streak.webp",
    showCount: true,
  },
  event_winner: {
    id: "event_winner",
    name: "Event Winner",
    description: "Finished an event at rank #1",
    category: "event",
    imageSrc: "/badges/event-winner.webp",
    showCount: true,
  },
  event_top10: {
    id: "event_top10",
    name: "Event Top 10",
    description: "Finished an event in the top 10",
    category: "event",
    imageSrc: "/badges/event-top10.webp",
    showCount: true,
  },
  event_top25: {
    id: "event_top25",
    name: "Event Top 25",
    description: "Finished an event in the top 25",
    category: "event",
    imageSrc: "/badges/event-top25.webp",
    showCount: true,
  },
  event_top50: {
    id: "event_top50",
    name: "Event Top 50",
    description: "Finished an event in the top 50",
    category: "event",
    imageSrc: "/badges/event-top50.webp",
    showCount: true,
  },
  event_mvp: {
    id: "event_mvp",
    name: "MVP",
    description: "Picked the event's kill count leader",
    category: "event",
    imageSrc: "/badges/event-mvp.webp",
    showCount: true,
  },
  season_winner: {
    id: "season_winner",
    name: "Season Winner",
    description: "Finished a season at rank #1",
    category: "season",
    imageSrc: "/badges/season-winner.webp",
    showCount: true,
  },
  season_top10: {
    id: "season_top10",
    name: "Season Top 10",
    description: "Finished a season in the top 10",
    category: "season",
    imageSrc: "/badges/season-top10.webp",
    showCount: true,
  },
  season_top25: {
    id: "season_top25",
    name: "Season Top 25",
    description: "Finished a season in the top 25",
    category: "season",
    imageSrc: "/badges/season-top25.webp",
    showCount: true,
  },
  season_top50: {
    id: "season_top50",
    name: "Season Top 50",
    description: "Finished a season in the top 50",
    category: "season",
    imageSrc: "/badges/season-top50.webp",
    showCount: true,
  },
};

export const BADGE_DISPLAY_ORDER: BadgeId[] = [
  "event_winner",
  "season_winner",
  "event_top10",
  "season_top10",
  "event_top25",
  "season_top25",
  "event_top50",
  "season_top50",
  "event_mvp",
  "streak",
];

export const BADGES_LAUNCH_DATE = new Date("2026-04-20T00:00:00.000Z");

/**
 * Seasons that are closed and eligible for season-badge awards.
 * Add new years here once their season finishes (or wire up automation).
 * Each entry maps to a Firestore doc at `leaderboards/season_{year}`.
 */
export const COMPLETED_SEASON_YEARS: readonly string[] = ["2025"];

export function rankToEventBadge(rank: number): BadgeId | null {
  if (!Number.isFinite(rank) || rank < 1) return null;
  if (rank === 1) return "event_winner";
  if (rank <= 10) return "event_top10";
  if (rank <= 25) return "event_top25";
  if (rank <= 50) return "event_top50";
  return null;
}

export function rankToSeasonBadge(rank: number): BadgeId | null {
  if (!Number.isFinite(rank) || rank < 1) return null;
  if (rank === 1) return "season_winner";
  if (rank <= 10) return "season_top10";
  if (rank <= 25) return "season_top25";
  if (rank <= 50) return "season_top50";
  return null;
}

export function sortUserBadges(badges: UserBadges): Array<{ id: BadgeId; count: number }> {
  const result: Array<{ id: BadgeId; count: number }> = [];
  for (const id of BADGE_DISPLAY_ORDER) {
    const entry = badges[id];
    if (entry && entry.count > 0) {
      result.push({ id, count: entry.count });
    }
  }
  return result;
}
