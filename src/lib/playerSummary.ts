import { doc, getDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";
import { eventAxisLabel } from "@/src/lib/eventDisplayName";
import {
  KILL_TYPES,
  type AppearanceKind,
  type CareerAppearance,
  type KillType,
  type Participation,
  type PlayerCareer,
} from "@/src/lib/playerCareer";
import type { PlayerMatch } from "@/src/lib/playerMatches";

/**
 * One read for a whole career page.
 *
 * `playerSummaries/{playerId}` is a projection built by
 * `scripts/build-player-summaries.mjs` from `events/{id}/players`, `long_data` and
 * `users`. It replaces three queries that between them cost ~6,200 document reads —
 * all eight rosters for career rank, every user document for pick %, and a whole
 * event's long data for match detail — and that grew with every event added.
 *
 * Nothing here is authored: the document can be rebuilt from source at any time, and
 * that rebuild is the definition of correct. Labels are the one thing NOT stored, so
 * `individualEventDisplayName` and `eventAxisLabel` stay the single source of naming
 * rather than being baked into rows that would then drift from the charts.
 */

interface SummaryEventRow {
  eventId: string;
  eventName: string;
  year: string;
  brandColor: string | null;
  fieldSize: number;
  pickPct: number | null;
  kind: AppearanceKind;
  participation: Participation;
  participationReason: string | null;
  status: string | null;
  team: string;
  teamId: string | null;
  cost: number;
  kills: number;
  rank: number | null;
  types: Record<KillType, number>;
  costPerKill: number | null;
  teamKills: number;
  shareOfTeam: number | null;
}

interface SummaryDoc {
  playerId: string;
  name: string;
  number: string | number | null;
  imgUrl: string | null;
  leagueId: string | number | null;
  currentTeam: string;
  totalKills: number;
  playedCount: number;
  careerRank: number | null;
  careerRankField: number;
  avgKills: number;
  avgRank: number | null;
  bestRank: number | null;
  bestRankEvent: string | null;
  topTenCount: number;
  currentCost: number | null;
  typeTotals: { type: KillType; total: number; share: number }[];
  events: SummaryEventRow[];
  matches: (PlayerMatch & { eventId: string })[];
}

export interface PlayerSummary {
  career: PlayerCareer;
  /** eventId → pick %, frozen at lock for finished events. */
  ownership: Map<string, number>;
  /** Every match, across every event with long data loaded. */
  matches: (PlayerMatch & { eventId: string })[];
}

const emptyTypes = () =>
  Object.fromEntries(KILL_TYPES.map((t) => [t, 0])) as Record<KillType, number>;

export async function fetchPlayerSummary(playerId: string): Promise<PlayerSummary | null> {
  const snap = await getDoc(doc(db, "playerSummaries", playerId));
  if (!snap.exists()) return null;
  const d = snap.data() as SummaryDoc;

  const appearances: CareerAppearance[] = (d.events ?? []).map((r) => ({
    eventId: r.eventId,
    eventName: r.eventName,
    shortLabel: eventAxisLabel({ id: r.eventId, name: r.eventName, year: r.year }),
    year: r.year,
    brandColor: r.brandColor ?? null,
    kills: r.kills ?? 0,
    rank: r.rank ?? null,
    fieldSize: r.fieldSize ?? 0,
    team: r.team ?? "—",
    teamId: r.teamId ?? null,
    cost: r.cost ?? 0,
    status: r.status ?? null,
    participation: r.participation ?? "unknown",
    kind: r.kind ?? "played",
    types: { ...emptyTypes(), ...(r.types ?? {}) },
    costPerKill: r.costPerKill ?? null,
    teamKills: r.teamKills ?? 0,
    shareOfTeam: r.shareOfTeam ?? null,
  }));

  const ownership = new Map<string, number>();
  for (const r of d.events ?? []) {
    if (r.pickPct != null) ownership.set(r.eventId, r.pickPct);
  }

  return {
    career: {
      playerId: d.playerId,
      name: d.name,
      number: d.number ?? null,
      imgUrl: d.imgUrl ?? null,
      leagueId: d.leagueId ?? null,
      currentTeam: d.currentTeam ?? "—",
      appearances,
      totalKills: d.totalKills ?? 0,
      playedCount: d.playedCount ?? 0,
      careerRank: d.careerRank ?? null,
      careerRankField: d.careerRankField ?? 0,
      avgKills: d.avgKills ?? 0,
      avgRank: d.avgRank ?? null,
      bestRank: d.bestRank ?? null,
      bestRankEvent: d.bestRankEvent ?? null,
      topTenCount: d.topTenCount ?? 0,
      currentCost: d.currentCost ?? null,
      typeTotals: d.typeTotals ?? [],
    },
    ownership,
    matches: d.matches ?? [],
  };
}
