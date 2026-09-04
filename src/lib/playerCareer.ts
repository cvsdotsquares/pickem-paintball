import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";
import { eventAxisLabel } from "@/src/lib/eventDisplayName";

/**
 * A player's career is just their row from each event, fetched in parallel.
 *
 * There is deliberately no pre-aggregated career document. With 8 events and a known
 * player id these are direct lookups — cheaper than maintaining a second copy of the
 * data that could drift from the events it is derived from. Revisit if the event count
 * gets into the twenties.
 *
 * 2024 events are excluded everywhere: they were test events and are already filtered
 * out of the stats page.
 */

export const KILL_TYPES = [
  "Gunfights",
  "Breakshooting",
  "Movement",
  "Zone Coverage",
  "Pressure",
  "Trades",
  "Unclassified",
] as const;

export type KillType = (typeof KILL_TYPES)[number];

/**
 * Did the player take the field at this event?
 *
 * Resolved offline by `scripts/apply-participation.mjs` from three sources, in order:
 * kills scored (unfalsifiable), the official NXL team sheet, then our own roster
 * status flag. `unknown` means we could not tell — treat it exactly as `played`,
 * since claiming an absence we cannot evidence is the failure this exists to prevent.
 */
export type Participation = "played" | "absent" | "unknown";

/** Absence is the only verdict that suppresses data; everything else is shown. */
export const isAbsent = (p: Participation | null | undefined) => p === "absent";

/**
 * How one league event sits in a player's history.
 *
 * There are three states, not two, and conflating the last two is a real bug: an
 * event the player was rostered for but sat out is a different fact from one they
 * were never named for. The first was pickable and returned nothing; the second was
 * never available to pick at all.
 *
 * Before this existed the page was built from roster documents, so `not-rostered`
 * events simply vanished — one player could show a DNP for one missed event and
 * nothing at all for another in the same season.
 */
export type AppearanceKind = "played" | "dnp" | "not-rostered";

/**
 * How a player's TEAM did at one league event.
 *
 * A team fact sitting on a player's row, which is why the page heads the column with
 * the team's code rather than presenting it as something the player did alone. Comes
 * from the league's own results (`functions/nxlHistory.js`), not from our kill data —
 * a point is won by hanging the flag, so a team can lose a game it out-killed and no
 * amount of kill arithmetic will ever produce a W.
 */
export interface TeamEventRecord {
  w: number;
  l: number;
  t: number;
  /** "Winner", "Runner-up", "Semi-finals", "Quarter-finals", "Ochos", "Prelims". */
  finish: string;
  /** 1, 2, 3, 5, 9 — or null for a team that never reached the bracket. */
  finishRank: number | null;
  champion: boolean;
}

export interface CareerAppearance {
  eventId: string;
  eventName: string;
  /** Short label for chart axes, e.g. "MW 26". */
  shortLabel: string;
  year: string;
  brandColor: string | null;
  kills: number;
  rank: number | null;
  /**
   * The field size behind `rank` — players who actually took the field, not the whole
   * roster. Someone who never played was never competing, so counting them would
   * inflate every rank denominator at the event.
   */
  fieldSize: number;
  team: string;
  teamId: string | null;
  cost: number;
  status: string | null;
  participation: Participation;
  kind: AppearanceKind;
  types: Record<KillType, number>;
  /**
   * Roster cost divided by kills — what each kill cost to buy. LOWER IS BETTER.
   * Null when the player scored nothing, or had no cost, since neither is meaningful.
   */
  costPerKill: number | null;
  /** Every kill their team scored at this event — the denominator for `shareOfTeam`. */
  teamKills: number;
  /**
   * What portion of the team's kills came from this player, as a percentage.
   *
   * Derived from the event roster rather than long data, so it works for all events
   * rather than only the ones with kill-by-kill rows loaded. Null when the team scored
   * nothing, or when we cannot tell which team they were on.
   */
  shareOfTeam: number | null;
  /**
   * Their team's win-loss record and finish here. Null while an event has a roster but
   * no results yet — a live tournament has both for a day or two.
   */
  record: TeamEventRecord | null;
  /** ISO date, from the event's lock date — used to order rows against league events. */
  start: string | null;
}

/**
 * A player's whole NXL record, 2015 to now.
 *
 * A DIFFERENT SCOPE from everything else on this type, deliberately. PickEm scores eight
 * events, because that is where kills exist; the league has results for fifty-one. A page
 * that told a three-time champion he had won nothing would be worse than one that carries
 * two scopes and labels them, so every consumer must present this as the NXL career and
 * never blend it into the kill columns.
 *
 * A win here is the TEAM's, at an event the player took the field for. Crediting only the
 * matches they were personally on the field for is not possible: pbleagues publishes
 * per-point lineups reliably for 2023 alone.
 */
export interface NxlEvent {
  key: string;
  year: string;
  label: string;
  start: string | null;
  /** Set only for the eight events PickEm also scores. */
  pickemEventId: string | null;
  club: string;
  teamId: string | null;
  w: number;
  l: number;
  t: number;
  finish: string;
  finishRank: number | null;
  fieldSize: number;
}

export interface NxlCareer {
  leagueId: string;
  /** Oldest first. */
  events: NxlEvent[];
  tournaments: number;
  titles: number;
  /** Finals reached, winners included. */
  finals: number;
  /**
   * TOP FOUR, NOT PODIUM. This format has no third-place match, so the beaten
   * semi-finalists are joint third and no event decides a 3rd place at all.
   */
  topFours: number;
  /**
   * Tournaments where the team reached the knockout bracket — "made Sunday".
   *
   * The paintball term, not a claim about the calendar: the whole bracket is played on
   * an event's final day, which has occasionally been a Saturday.
   */
  sundays: number;
  titleRate: number | null;
  sundayRate: number | null;
  /**
   * All-time position on each figure, among every player who has appeared on an NXL Pro
   * roster since 2015 — not just those on a current PickEm roster. Standard competition
   * ranking, so ties share a place.
   */
  titlesRank: number | null;
  sundaysRank: number | null;
  matchesRank: number | null;
  /**
   * Every match at an event PickEm does NOT score.
   *
   * Single-letter keys because Firestore forbids nested arrays, so the compact tuple
   * form is unavailable and the field names would otherwise be most of the payload:
   * `k` event key, `r` round, `o` opponent, `f` scored for, `a` scored against.
   *
   * PickEm's own eight events are absent by design: those rows already exist on
   * `matches`, built from long data and carrying kills.
   */
  matchLog: { k: string; r: string; o: string; f: number; a: number }[];
  /**
   * The first season the league file covers — 2015 — NOT this player's debut.
   *
   * The header above these numbers states where our data starts, so it must read the
   * same on every page. Paintball is far older; the results before this are simply hard
   * to come by, and saying so plainly is the point.
   */
  trackedFrom: string | null;
  /** How many players those ranks are out of. */
  rankField: number;
  matchW: number;
  matchL: number;
  matchT: number;
  /** Every match played, the denominator behind `matchWinPct`. */
  matches: number;
  /** Wins per DECIDED match. One tie exists in 2,393, so ties are simply excluded. */
  matchWinPct: number | null;
  firstYear: string | null;
  lastYear: string | null;
  seasons: number;
}

export interface PlayerCareer {
  playerId: string;
  name: string;
  number: string | number | null;
  imgUrl: string | null;
  leagueId: string | number | null;
  currentTeam: string;
  appearances: CareerAppearance[];
  totalKills: number;
  /** How many of `appearances` the player actually took the field for. */
  playedCount: number;
  /** Position by career kills among every player who played in the in-scope events. */
  careerRank: number | null;
  /** How many players that rank is out of. */
  careerRankField: number;
  /** Mean kills per event actually played. Absences are excluded, not scored as zero. */
  avgKills: number;
  /** Mean finishing position across events where a rank was recorded. */
  avgRank: number | null;
  bestRank: number | null;
  bestRankEvent: string | null;
  topTenCount: number;
  currentCost: number | null;
  /** Career totals per kill type, plus each as a share of the total. */
  typeTotals: { type: KillType; total: number; share: number }[];
  /** The league record. Null when we hold no NXL id for the player. */
  nxl: NxlCareer | null;
  /** The first season PickEm scored. Coverage, not this player's debut — see `trackedFrom` on NxlCareer. */
  trackedFrom: string | null;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// Short axis labels come from `eventAxisLabel`, which derives initials from the canonical
// location rather than the raw stored name — see eventDisplayName.ts for why.

/** Events in chronological order, newest last. Excludes 2024. */
export async function fetchCareerEvents() {
  const snap = await getDocs(collection(db, "events"));
  return snap.docs
    .map((d) => {
      const year = d.id.split("_").pop() ?? "";
      return {
        id: d.id,
        name: (d.get("name") as string) || d.id,
        year,
        brandColor: (d.get("brand_color") as string) ?? null,
        lockSeconds: (d.get("lockDate") as { seconds?: number } | undefined)?.seconds ?? 0,
      };
    })
    .filter((e) => e.year !== "2024" && e.year.length === 4)
    .sort((a, b) => a.lockSeconds - b.lockSeconds);
}

/**
 * Ownership (% of entrants who picked this player) per event.
 *
 * TEMPORARY: scans every user document, which is far too expensive to keep on a page
 * load. Ownership is frozen the moment picks lock, so the real implementation computes
 * it once at lock and stores one summary doc per event — the logic already exists in
 * `functions/extract-pick-percentages.js`, it just writes a spreadsheet today.
 * Swap this out for a single read of that doc; the shape below stays the same.
 */
export async function fetchOwnership(playerId: string): Promise<Map<string, number>> {
  const usersSnap = await getDocs(collection(db, "users"));
  const entrants = new Map<string, number>();
  const picked = new Map<string, number>();

  usersSnap.docs.forEach((u) => {
    const pickems = (u.get("pickems") || {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(pickems)) {
      if (key.includes("_captain") || key.endsWith("_draft")) continue;
      if (!Array.isArray(value) || value.length === 0) continue;
      entrants.set(key, (entrants.get(key) ?? 0) + 1);
      if (value.some((id) => String(id) === playerId)) {
        picked.set(key, (picked.get(key) ?? 0) + 1);
      }
    }
  });

  const out = new Map<string, number>();
  for (const [eventId, total] of Array.from(entrants)) {
    if (total > 0) out.set(eventId, ((picked.get(eventId) ?? 0) / total) * 100);
  }
  return out;
}

/**
 * FALLBACK ONLY, for when `playerSummaries/{id}` is missing — see playerSummary.ts.
 *
 * `record` and `nxl` are null throughout: both are joins against the league's own
 * results, which live beside the Cloud Function that builds the projection. Rendering
 * them blank is the honest failure; there is nothing in Firestore this path could
 * derive a win from, because kills do not decide points.
 */
export async function fetchPlayerCareer(playerId: string): Promise<PlayerCareer | null> {
  const events = await fetchCareerEvents();

  /**
   * Career kills for EVERY player, accumulated as we go.
   *
   * We already read each event's full roster to get the field size behind `rank`, so
   * ranking the whole population by career kills costs nothing extra — no separate
   * query, no stored aggregate to keep in sync.
   */
  const careerKillsByPlayer = new Map<string, number>();

  const rows = await Promise.all(
    events.map(async (ev) => {
      const [playerSnap, rosterSnap] = await Promise.all([
        getDoc(doc(db, "events", ev.id, "players", playerId)),
        getDocs(collection(db, "events", ev.id, "players")),
      ]);
      // Absences are skipped on both counts: they do not contribute kills, and a
      // player who never took the field was never in the running, so they must not
      // pad the population that career rank is measured against.
      rosterSnap.docs.forEach((r) => {
        if (isAbsent(r.get("participation") as Participation)) return;
        careerKillsByPlayer.set(
          r.id,
          (careerKillsByPlayer.get(r.id) ?? 0) + num(r.get("Confirmed Kills")),
        );
      });
      const fieldSize = rosterSnap.docs.filter(
        (r) => !isAbsent(r.get("participation") as Participation),
      ).length;

      /** Team totals for this event, so a player's kills can be read as a share. */
      const teamKillsById = new Map<string, number>();
      rosterSnap.docs.forEach((r) => {
        const tid = (r.get("team_id") as string) ?? null;
        if (!tid) return;
        teamKillsById.set(tid, (teamKillsById.get(tid) ?? 0) + num(r.get("Confirmed Kills")));
      });

      // Not on this event's roster at all. Kept as a slot so the gap is visible; the
      // caller trims these off both ends so a player never carries empty events from
      // before they joined the league.
      if (!playerSnap.exists()) {
        return {
          ev,
          data: null,
          appearance: {
            eventId: ev.id,
            eventName: ev.name,
            shortLabel: eventAxisLabel({ id: ev.id, name: ev.name, year: ev.year }),
            year: ev.year,
            brandColor: ev.brandColor,
            kills: 0,
            rank: null,
            fieldSize,
            team: "\u2014",
            teamId: null,
            cost: 0,
            status: null,
            participation: "absent" as Participation,
            kind: "not-rostered" as AppearanceKind,
            teamKills: 0,
            shareOfTeam: null,
            types: Object.fromEntries(KILL_TYPES.map((t) => [t, 0])) as Record<KillType, number>,
            costPerKill: null,
            // The league record lives in the projection, not in this fallback — see
            // the note on `fetchPlayerCareer` below.
            record: null,
            start: null,
          } satisfies CareerAppearance,
        };
      }
      const d = playerSnap.data();
      const cost = num(d.Cost);
      const kills = num(d["Confirmed Kills"]);
      const teamKills = teamKillsById.get((d.team_id as string) ?? "") ?? 0;
      const types = Object.fromEntries(
        KILL_TYPES.map((t) => [t, num(d[t])]),
      ) as Record<KillType, number>;

      return {
        ev,
        data: d,
        appearance: {
          eventId: ev.id,
          eventName: ev.name,
          shortLabel: eventAxisLabel({ id: ev.id, name: ev.name, year: ev.year }),
          year: ev.year,
          brandColor: ev.brandColor,
          kills,
          rank: d.Rank != null ? num(d.Rank) : null,
          fieldSize,
          team: (d.Team as string) || "—",
          teamId: (d.team_id as string) ?? null,
          cost,
          status: (d.Status as string) ?? null,
          participation: ((d.participation as Participation) ?? "unknown"),
          kind: (isAbsent(d.participation as Participation) ? "dnp" : "played") as AppearanceKind,
          types,
          costPerKill: cost > 0 && kills > 0 ? cost / kills : null,
          teamKills,
          shareOfTeam: teamKills > 0 ? (kills / teamKills) * 100 : null,
          record: null,
          start: null,
        } satisfies CareerAppearance,
      };
    }),
  );

  /**
   * Trim to the player's own span: first event they were rostered for through to the
   * last. Everything between is kept, including events they were never named for, so
   * a gap mid-career is visible rather than silently closed. Nothing before their
   * debut is carried — a 2026 newcomer must not show empty 2025 slots.
   */
  const all = rows.filter((r): r is NonNullable<typeof r> => r !== null);
  const firstIdx = all.findIndex((r) => r.appearance.kind !== "not-rostered");
  const lastIdx = all.map((r) => r.appearance.kind !== "not-rostered").lastIndexOf(true);
  if (firstIdx === -1) return null;
  const span = all.slice(firstIdx, lastIdx + 1);
  const found = span.filter((r) => r.data !== null);

  const appearances = span.map((r) => r.appearance);
  const latest = found[found.length - 1];

  const totalKills = appearances.reduce((a, x) => a + x.kills, 0);

  /**
   * Every career average runs over this, not over `appearances`.
   *
   * An event the player sat out contributes a zero to kills and a meaningless rank.
   * Averaging those in punishes a player for not being there, which is exactly the
   * unfairness this whole participation model exists to remove.
   */
  const playedAppearances = appearances.filter((a) => a.kind === "played");
  const ranked = playedAppearances.filter((a) => a.rank != null && a.rank > 0);
  const best = ranked.length
    ? ranked.reduce((a, b) => ((b.rank as number) < (a.rank as number) ? b : a))
    : null;

  // Standard competition ranking: ties share a position.
  const sortedCareer = Array.from(careerKillsByPlayer.values()).sort((a, b) => b - a);
  const careerRank = sortedCareer.findIndex((k) => k <= totalKills) + 1 || null;

  const rankValues = ranked.map((a) => a.rank as number);
  const avgRank = rankValues.length
    ? rankValues.reduce((a, b) => a + b, 0) / rankValues.length
    : null;

  const typeSum = KILL_TYPES.map((type) => ({
    type,
    total: playedAppearances.reduce((a, x) => a + x.types[type], 0),
  }));
  const typeGrand = typeSum.reduce((a, x) => a + x.total, 0);

  return {
    playerId,
    name: (latest.data.Player as string) || "Unknown player",
    number: (latest.data.Number as string | number) ?? null,
    imgUrl: (latest.data.img_url as string) ?? null,
    leagueId: (latest.data.league_id as string | number) ?? null,
    currentTeam: (latest.data.Team as string) || "—",
    appearances,
    totalKills,
    careerRank,
    careerRankField: careerKillsByPlayer.size,
    playedCount: playedAppearances.length,
    avgKills: playedAppearances.length ? totalKills / playedAppearances.length : 0,
    avgRank,
    bestRank: best?.rank ?? null,
    bestRankEvent: best?.eventName ?? null,
    topTenCount: ranked.filter((a) => (a.rank as number) <= 10).length,
    currentCost: latest.appearance.cost || null,
    typeTotals: typeSum
      .map((t) => ({ ...t, share: typeGrand > 0 ? (t.total / typeGrand) * 100 : 0 }))
      .filter((t) => t.total > 0)
      .sort((a, b) => b.total - a.total),
    nxl: null,
    trackedFrom: events.length ? events[0].year : null,
  };
}
