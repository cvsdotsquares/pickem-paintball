import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";
import { KILL_TYPES, type KillType } from "@/src/lib/playerCareer";

/**
 * Match-by-match detail for one player at one event, built from `long_data`.
 *
 * Long data is one row per kill, so a player's own rows only prove the matches they
 * SCORED in. The match list is therefore derived from their team's games — every game
 * the team appears in, whether or not the player got on the board — and their kills are
 * summed into it. Otherwise a quiet game would silently vanish from their record, which
 * is the same class of bug the participation work removed from the event history.
 */

/** Long-data `type` → the kill-type column we display. Mirrors `TYPE_FIELD` in
 *  `functions/longDataRecompute.js`; `Other` and blank fall through to Unclassified. */
const TYPE_FIELD: Record<string, KillType> = {
  Gunfight: "Gunfights",
  Breakshooting: "Breakshooting",
  Movement: "Movement",
  "Zone Coverage": "Zone Coverage",
  Pressure: "Pressure",
  Trade: "Trades",
};

/** Tournament order, so matches sort as they were played rather than alphabetically. */
const ROUND_ORDER = ["Thursday", "Friday", "Saturday", "Sunday", "Wildcard", "Top8", "Top4", "Finals"];
const roundRank = (r: string) => {
  const i = ROUND_ORDER.indexOf(r);
  return i === -1 ? ROUND_ORDER.length : i;
};

/** The knockout stages. Everything else is a preliminary round. */
const KNOCKOUT = new Set(["Wildcard", "Top8", "Top4", "Finals"]);

/**
 * What a round is called on the page.
 *
 * Group games are stored by the DAY they were played — Thursday, Friday, Saturday —
 * because that is what the scorers record. The league records them by group instead
 * (A–E Prelims), so the day is ours alone and carries no meaning to a reader: nobody
 * asks which day a prelim was. Worse, it is the one label with nothing external to
 * validate against, so a typo in it survives every check — Tampa Bay 2026 has two
 * games marked Thursday that were played on the Friday.
 *
 * Collapsing them to "Prelims" removes a distinction that was never useful and takes
 * a whole class of silent error off the page with it. Sorting still uses the stored
 * day, so prelims stay in the order they were played.
 */
export const displayRound = (round: string) =>
  KNOCKOUT.has(round) ? round : "Prelims";

export interface PlayerMatch {
  gameId: string;
  round: string;
  /** Display name of the other team. */
  opponent: string;
  opponentId: string | null;
  /** Points contested in the match — the denominator the player's kills sit against. */
  points: number;
  kills: number;
  teamKills: number;
  opponentKills: number;
  types: Record<KillType, number>;
}

interface LongRow {
  gameId?: string;
  round?: string;
  team?: string;
  teamId?: string;
  opponent?: string;
  opponentId?: string;
  point?: number;
  playerId?: string | number | null;
  type?: string;
  weight?: number;
}

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * TEMPORARY SHAPE: reads every long row for the event and filters in memory.
 *
 * Scoping this to the team would need a composite index on (eventId, teamId), and the
 * opponent's rows are needed anyway to score the match. One event is ~2,900 rows today.
 * If the page gets slow, the fix is a per-game summary written at recompute time — the
 * same move the pick-% path needs.
 */
export async function fetchPlayerMatches(
  playerId: string,
  eventId: string,
  teamId: string | null,
): Promise<PlayerMatch[]> {
  if (!teamId) return [];

  const snap = await getDocs(
    query(collection(db, "long_data"), where("eventId", "==", eventId)),
  );
  const rows = snap.docs.map((d) => d.data() as LongRow);
  if (rows.length === 0) return [];

  // Games are stored twice, once from each side, so a game involving this team appears
  // with teamId on either half of the row.
  const games = new Map<string, LongRow[]>();
  for (const r of rows) {
    if (!r.gameId) continue;
    if (r.teamId !== teamId && r.opponentId !== teamId) continue;
    const bucket = games.get(r.gameId);
    if (bucket) bucket.push(r);
    else games.set(r.gameId, [r]);
  }

  /**
   * A game whose every row is voided never happened.
   *
   * Weight 0 is the pipeline's tombstone (see longDataRecompute), but a voided row
   * still carries a round and a team pair, so it mints a gameId. Three such rows once
   * created two phantom games here, which then handed a 0-kill match row to all 25
   * players on the three teams involved — for matches that were never played.
   * Scoring was unaffected; the fixture list was not.
   */
  for (const [gameId, rs] of Array.from(games)) {
    if (rs.every((r) => num(r.weight) === 0)) games.delete(gameId);
  }

  const out: PlayerMatch[] = [];
  for (const [gameId, gameRows] of Array.from(games)) {
    const mine = gameRows.filter((r) => String(r.playerId ?? "") === playerId);
    const types = Object.fromEntries(KILL_TYPES.map((t) => [t, 0])) as Record<KillType, number>;
    let kills = 0;
    for (const r of mine) {
      const w = num(r.weight);
      if (w === 0) continue; // voided rows are tombstoned at weight 0
      kills += w;
      // Unmapped and blank types are Unclassified, matching the aggregate's residual.
      types[TYPE_FIELD[String(r.type ?? "").trim()] ?? "Unclassified"] += w;
    }

    // A row scores for the team named on it, so "ours" and "theirs" split on teamId.
    // Rows with no playerId are the Missed / Penalty sentinels and score for nobody.
    const scoring = gameRows.filter((r) => r.playerId != null && num(r.weight) !== 0);
    const teamKills = scoring
      .filter((r) => r.teamId === teamId)
      .reduce((a, r) => a + num(r.weight), 0);
    const opponentKills = scoring
      .filter((r) => r.teamId !== teamId)
      .reduce((a, r) => a + num(r.weight), 0);

    const sample = gameRows.find((r) => r.teamId === teamId) ?? gameRows[0];
    const opponentName =
      sample.teamId === teamId ? (sample.opponent ?? "—") : (sample.team ?? "—");
    const opponentId =
      (sample.teamId === teamId ? sample.opponentId : sample.teamId) ?? null;

    out.push({
      gameId,
      round: sample.round ?? "—",
      opponent: opponentName,
      opponentId,
      points: new Set(gameRows.map((r) => r.point)).size,
      kills,
      teamKills,
      opponentKills,
      types,
    });
  }

  // Newest first, matching the event history table above it.
  return out.sort((a, b) => roundRank(b.round) - roundRank(a.round));
}
