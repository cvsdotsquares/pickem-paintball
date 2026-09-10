/**
 * The model behind a shareable career graphic.
 *
 * Pure shaping, no Firestore and no rendering: the PNG route and any preview of it must
 * agree about what a card says, and the only way to guarantee that is for neither to
 * decide. Give it a `playerSummaries/{id}` document and a scope, get back the numbers and
 * labels in the order they appear on the card.
 *
 * TWO STAT FAMILIES ON ONE CARD, deliberately. The league record (2015 to date) and
 * PickEm's confirmed kills (2025 to date) do not overlap in time and are not comparable,
 * so they are shaped into two named blocks rather than blended into one list. A card for
 * a 2019 season simply has no PickEm block, and that is a legitimate card — most of the
 * 710 players in the league file have never appeared in a PickEm event.
 *
 * ⚠️ A LEAGUE RECORD IS THE TEAM'S. Every W, title and Sunday here was won by the club
 * the player was rostered with at an event they took the field for. The card must say so
 * — on the site that caveat is one section away, but a graphic travels alone.
 */

export type ShareScope =
  | { kind: "career" }
  | { kind: "season"; year: string }
  /** `key` is the league event key ("2015|Great Lakes Open"), or a PickEm eventId. */
  | { kind: "event"; key: string };

export interface ShareStat {
  label: string;
  value: string;
  /** Optional supporting figure, shown inline after the value — "1st /710". */
  sub?: string;
}

/** One bar of the season strip — the graphic that carries both families at once. */
export interface ShareSeasonBar {
  year: string;
  /** Match win rate that season, 0-100. Null when the season has no decided matches. */
  winPct: number | null;
  /** Titles won that season, drawn as markers above the bar. */
  titles: number;
  /** Kills that season, where PickEm scored it. Null before 2025. */
  kills: number | null;
}

export interface ShareCard {
  playerId: string;
  name: string;
  team: string;
  imgUrl: string | null;
  /** Colour pulled from the event where the scope is one event, else the brand green. */
  accent: string;
  /** "CAREER", "2026 SEASON", "WORLD CUP 2025". */
  scopeLabel: string;
  /** "2015 — 2026", or the event's date. Sits under the scope label. */
  scopeRange: string;
  /** The single biggest true thing about this scope. */
  headline: { value: string; label: string; sub?: string };
  /**
   * League results, or null for a player we hold no NXL record for.
   *
   * NULL RATHER THAN ZEROS. A card reading "0-0 / 0 tournaments / 0 Sundays" states that
   * the player never won anything, when what is true is that we have no league id for
   * them — a claim about our data dressed up as a claim about their career. The career
   * page already refuses to do this; a graphic that travels without the page must refuse
   * it harder.
   */
  league: { title: string; caption: string; stats: ShareStat[] } | null;
  /** PickEm scoring. Null when the scope has no scored events. */
  pickem: { title: string; caption: string; stats: ShareStat[]; types: { type: string; share: number }[] } | null;
  /** Career card only — one bar per season. */
  seasons: ShareSeasonBar[];
  /**
   * Season and career cards — the tournaments in scope.
   *
   * `pickPct` is per EVENT, which is the only level it exists at: there is no such thing
   * as a pick % for a single match, so the event card's match list has no such column.
   */
  events: {
    label: string;
    finish: string;
    record: string;
    kills: number | null;
    pickPct: number | null;
  }[];
  /**
   * Event card only — every match the team played there.
   *
   * Two sources, because they cover different years: `nxl.matchLog` carries the league's
   * own results for events PickEm never scored, and `matches` carries the scored ones,
   * which also know how many kills the player had in each game. `kills` is null for the
   * former, and the card simply omits the column rather than printing a dash per row.
   */
  matches: { opponent: string; round: string; f: number; a: number; win: boolean; kills: number | null }[];
}

const BRAND_GREEN = "#00f976";

type AnyRec = Record<string, any>;

/** One decimal, but only when there is one — "24.5" and "24", never "24.0". */
export const num = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");

const pct = (n: number | null | undefined): string =>
  n == null ? "—" : `${Math.round(n)}%`;

/** "1st", "2nd", "3rd", "11th" — ranks read as places, not as bare integers. */
export const ordinal = (n: number): string => {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

const record = (w: number, l: number, t: number): string =>
  t > 0 ? `${w}–${l}–${t}` : `${w}–${l}`;

/**
 * The headline, chosen the same way the career page's hero tiers are.
 *
 * Titles, then Sundays, then matches played. A player with no titles is not shown a
 * zero — a graphic they are meant to want to post should lead with the best true thing
 * about them, and "0 titles" is true but is not what the card is for.
 */
function headlineFor(
  nxl: AnyRec,
  scoped: { titles: number; sundays: number; matches: number; w: number; l: number },
  /**
   * All-time ranks are CAREER figures and must not appear under a single season's total.
   * "1 NXL TITLE / 1st all-time of 710" reads as a claim about 2026 and is simply false;
   * on a graphic that travels without the site, a wrong caption cannot be clicked through
   * and corrected.
   */
  withAllTimeRank: boolean,
) {
  if (scoped.titles > 0) {
    return {
      value: String(scoped.titles),
      label: scoped.titles === 1 ? "NXL win" : "NXL wins",
      sub:
        withAllTimeRank && notableRank(nxl?.titlesRank, nxl?.rankField)
          ? `${ordinal(nxl.titlesRank)} all-time`
          : undefined,
    };
  }
  if (scoped.sundays > 0) {
    return {
      value: String(scoped.sundays),
      label: scoped.sundays === 1 ? "Sunday made" : "Sundays made",
      sub:
        withAllTimeRank && notableRank(nxl?.sundaysRank, nxl?.rankField)
          ? `${ordinal(nxl.sundaysRank)} all-time`
          : undefined,
    };
  }
  /*
   * The COUNT, not the record — the career page's bottom rung leads with matches played
   * and so must this. Leading with the record put "2-14" in the largest type on a card
   * whose owner has no kills to fall back on, and a match count at least says they turned
   * up. The record follows only when it is a winning one; there is no reason to volunteer
   * a losing one twice, and it is still a tile in the band below either way.
   */
  return {
    value: String(scoped.matches),
    label: scoped.matches === 1 ? "Match played" : "Matches played",
    sub: scoped.w >= scoped.l ? record(scoped.w, scoped.l, 0) : undefined,
  };
}

/**
 * Is this rank worth printing under the headline?
 *
 * Half of any population is below its median, so "358th all-time" is both true and the
 * reason a card does not get posted. The page can afford it — a reader went there to look
 * a player up, and the rank sits among context that explains it. A graphic is chosen by
 * its subject and shown to an audience, so a figure that reads as a put-down does not earn
 * the line. Top quartile keeps it meaningful without being flattery: it still means
 * something to be 150th of 710.
 */
const RANK_WORTH_SHOWING = 0.25;
const notableRank = (rank: number | null | undefined, field: number | null | undefined): boolean =>
  rank != null && field != null && field > 0 && rank / field <= RANK_WORTH_SHOWING;

/**
 * The best true thing about this player, across BOTH families.
 *
 * The league tiers were written for the career page, where the bottom rung — matches
 * played and a won-lost record — sits among context. On a share graphic it puts a LOSING
 * RECORD in the largest type on the canvas: "11-21" at 116px is nobody's post. So when the
 * league record would lead with a losing one and the player has scored, the kills lead
 * instead. Nothing is hidden: the record is still a tile in the band below.
 */
function bestHeadline(
  leagueHead: { value: string; label: string; sub?: string },
  leagueIsLosing: boolean,
  kills: number,
  killRank: number | null,
  killField: number | null,
  /** Names the scope: a season card must not label its own total "career kills". */
  killLabel = "Career kills",
): { value: string; label: string; sub?: string } {
  if (!leagueIsLosing || kills <= 0) return leagueHead;
  return {
    value: num(kills),
    label: killLabel,
    sub: notableRank(killRank, killField) ? `${ordinal(Number(killRank))} all-time` : undefined,
  };
}

/**
 * The four league figures, at whichever tier the player's record reaches.
 *
 * THIS IS `NxlHeroRow`'s LOGIC, deliberately duplicated in shape rather than approximated.
 * The card used to show a fixed Record / Match win % / Tournaments / Sundays, which meant
 * a shared graphic and the page it came from stated different things about the same
 * player. The page leads with the highest rung actually reached — count, rank, rate, then
 * match rate — because a zero is not a stat, and the card now does the same:
 *
 *   won a tournament   wins     · rank · win %        + match win %
 *   reached a bracket  Sundays  · rank · Sunday %     + match win %
 *   neither            matches  · rank · match win %  (no fourth — it would repeat)
 *
 * ⚠️ RANK IS A CAREER FIGURE. A season or event card passes `rank: null` and shows the
 * won-lost record in its place: "1st all-time of 710" under a single season's total reads
 * as a claim about that season, and is false.
 */
function leagueTiles(
  nxl: AnyRec,
  scoped: { titles: number; sundays: number; matches: number; w: number; l: number; t: number },
  ranks: { titles: number | null; sundays: number | null; matches: number | null; field: number | null } | null,
): ShareStat[] {
  const decided = scoped.w + scoped.l;
  const matchRate: ShareStat = {
    label: "Match win %",
    value: decided > 0 ? pct((scoped.w / decided) * 100) : "—",
  };
  const played = nxl.__tournaments ?? 0;
  /*
   * ONLY THE WINS RANK EARNS ITS BOX.
   *
   * "1st all-time" beside a win count is the reason someone posts the card. "306th
   * Sundays made rank" and "595th matches rank" are the same fact about a much larger
   * population and read as a put-down, so the other two tiers show the won-lost record
   * there instead — the one figure a reader actually wants beside a count of matches.
   *
   * The label names the scope on a career card only; a season card's header already says
   * which season it is, so "Career record" there would be wrong.
   */
  const recordTile: ShareStat = {
    label: ranks ? "Career record" : "Record",
    value: record(scoped.w, scoped.l, scoped.t),
  };

  if (scoped.titles > 0) {
    return [
      { label: "Wins", value: String(scoped.titles) },
      ranks && ranks.titles != null
        ? { label: "Wins rank", value: ordinal(ranks.titles) }
        : recordTile,
      { label: "Win %", value: played > 0 ? pct((scoped.titles / played) * 100) : "—" },
      matchRate,
    ];
  }
  if (scoped.sundays > 0) {
    return [
      { label: "Sundays made", value: String(scoped.sundays) },
      recordTile,
      { label: "Sundays made %", value: played > 0 ? pct((scoped.sundays / played) * 100) : "—" },
      matchRate,
    ];
  }
  /*
   * THREE TILES on this tier, deliberately. A fourth was added to keep the grid four wide
   * across every card, but the only figure left to put there was tournaments played, and
   * a box that exists to fill a row is worse than a shorter row. Three wider tiles read as
   * a card with less to say, which is the truth about this tier.
   */
  return [
    { label: "Matches", value: String(scoped.matches) },
    recordTile,
    matchRate,
  ];
}

/** Mean pick % across the events in scope. Null when none of them carry one. */
function meanPickPct(events: AnyRec[]): number | null {
  const vals = events.map((e) => e.pickPct).filter((v) => v != null).map(Number);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** A league event counts as a Sunday when its team reached the knockout bracket. */
const madeSunday = (e: AnyRec): boolean =>
  typeof e.finish === "string" && e.finish !== "" && !/^(prelims|group|did not)/i.test(e.finish);

const isTitle = (e: AnyRec): boolean => e.finishRank === 1;

/** Is there anything worth putting on a card? Used by the page to decide whether to offer one. */
export function hasShareableCareer(summary: AnyRec): boolean {
  if (!summary) return false;
  const tournaments = Number(summary.nxl?.tournaments ?? 0);
  const scored = (Array.isArray(summary.events) ? summary.events : []).some(
    (e: AnyRec) => e.kind === "played" && Number(e.kills ?? 0) > 0,
  );
  return tournaments > 0 || scored;
}

export function buildShareCard(summary: AnyRec, scope: ShareScope): ShareCard | null {
  if (!summary || !hasShareableCareer(summary)) return null;
  const nxl: AnyRec = summary.nxl ?? {};
  const leagueEvents: AnyRec[] = Array.isArray(nxl.events) ? nxl.events : [];
  const pickemEvents: AnyRec[] = Array.isArray(summary.events) ? summary.events : [];

  const base = {
    playerId: String(summary.playerId ?? ""),
    name: String(summary.name ?? "Unknown"),
    team: String(summary.currentTeam ?? ""),
    imgUrl: (summary.imgUrl as string) || null,
  };

  if (scope.kind === "event")
    return eventCard(
      base,
      scope.key,
      leagueEvents,
      pickemEvents,
      Array.isArray(nxl.matchLog) ? nxl.matchLog : [],
      Array.isArray(summary.matches) ? summary.matches : [],
    );
  if (scope.kind === "season") return seasonCard(base, scope.year, nxl, leagueEvents, pickemEvents);
  return careerCard(base, summary, nxl, leagueEvents, pickemEvents);
}

// ── Career ────────────────────────────────────────────────────────────────────

function careerCard(
  base: Pick<ShareCard, "playerId" | "name" | "team" | "imgUrl">,
  summary: AnyRec,
  nxl: AnyRec,
  leagueEvents: AnyRec[],
  pickemEvents: AnyRec[],
): ShareCard {
  const league: ShareStat[] = leagueTiles(
    { __tournaments: nxl.tournaments ?? 0 },
    {
      titles: nxl.titles ?? 0,
      sundays: nxl.sundays ?? 0,
      matches: nxl.matches ?? 0,
      w: nxl.matchW ?? 0,
      l: nxl.matchL ?? 0,
      t: nxl.matchT ?? 0,
    },
    {
      titles: nxl.titlesRank ?? null,
      sundays: nxl.sundaysRank ?? null,
      matches: nxl.matchesRank ?? null,
      field: nxl.rankField ?? null,
    },
  );

  const scored = pickemEvents.filter((e) => e.kind === "played" && (e.kills ?? 0) > 0);
  const careerPick = meanPickPct(scored);
  const pickem = scored.length
    ? {
        title: "PickEm stats",
        caption: `Confirmed kills, ${summary.trackedFrom ?? "2025"} to date`,
        /*
         * Drawn from the career page's PickEm hero so the two never disagree, with pick %
         * in place of average event rank — four tiles, matching the NXL band beside it.
         * Five made every label a size smaller and the band read as a different component.
         */
        stats: [
          { label: "Career kills", value: num(Number(summary.totalKills ?? 0)) },
          {
            label: "All-time rank",
            value: summary.careerRank ? ordinal(Number(summary.careerRank)) : "—",
          },
          { label: "Kills per event", value: num(Number(summary.avgKills ?? 0)) },
          { label: "Picked by", value: careerPick != null ? pct(careerPick) : "—" },
        ] as ShareStat[],
        types: (summary.typeTotals ?? []).slice(0, 5).map((t: AnyRec) => ({
          type: String(t.type),
          share: Number(t.share ?? 0),
        })),
      }
    : null;

  /**
   * No league record: the card becomes a PickEm card rather than a league card with the
   * numbers knocked out. The headline moves to kills, the league band goes entirely, and
   * the scored events fill the space the season strip would have taken — a player with one
   * season has no strip to draw either way.
   */
  const hasLeague = Number(nxl.tournaments ?? 0) > 0;
  const scoredEvents = scored
    .slice()
    .sort((a, b) => String(a.start ?? "").localeCompare(String(b.start ?? "")))
    .map((e) => ({
      label: String(e.eventName ?? ""),
      finish: e.rank ? `${ordinal(Number(e.rank))} for kills` : "",
      record: "",
      kills: Number(e.kills ?? 0),
      pickPct: e.pickPct != null ? Number(e.pickPct) : null,
    }));

  return {
    ...base,
    accent: BRAND_GREEN,
    scopeLabel: "Career stats",
    scopeRange: !hasLeague
      ? `${scored.length} ${scored.length === 1 ? "event" : "events"} scored`
      : nxl.firstYear && nxl.lastYear
        ? nxl.firstYear === nxl.lastYear
          ? String(nxl.firstYear)
          : `${nxl.firstYear} — ${nxl.lastYear}`
        : "",
    headline: hasLeague
      ? bestHeadline(
          headlineFor(
            nxl,
            {
              titles: nxl.titles ?? 0,
              sundays: nxl.sundays ?? 0,
              matches: nxl.matches ?? 0,
              w: nxl.matchW ?? 0,
              l: nxl.matchL ?? 0,
            },
            true,
          ),
          (nxl.titles ?? 0) === 0 && (nxl.sundays ?? 0) === 0 && (nxl.matchWinPct ?? 0) < 50,
          Number(summary.totalKills ?? 0),
          summary.careerRank ?? null,
          summary.careerRankField ?? null,
        )
      : {
          value: num(Number(summary.totalKills ?? 0)),
          label: "Confirmed kills",
          sub: summary.careerRank ? `${ordinal(Number(summary.careerRank))} all-time` : undefined,
        },
    league: hasLeague
      ? {
          title: "NXL record",
          caption: `Team results, ${nxl.trackedFrom ?? "2015"} to date`,
          stats: league,
        }
      : null,
    pickem,
    seasons: hasLeague ? seasonBars(leagueEvents, pickemEvents) : [],
    /*
     * The tournament list, for a career too short to fill the canvas any other way.
     *
     * A player with one stat band and a three-season strip leaves ~700px of black, and no
     * amount of redistributing it makes that look deliberate — stretch the bands and the
     * gaps read as a fault, collect the slack and it reads as a void. The answer is the
     * same one the event card needed: give the space something true to hold. The renderer
     * draws this only when the card is short of bands, so a twelve-season career is
     * unaffected.
     */
    events: hasLeague ? careerEventList(leagueEvents, pickemEvents) : scoredEvents,
    matches: [],
  };
}

/** Tournaments newest first, with the finish, the team's record, and kills where scored. */
function careerEventList(leagueEvents: AnyRec[], pickemEvents: AnyRec[]): ShareCard["events"] {
  return leagueEvents
    .slice()
    .sort((a, b) => String(b.start ?? "").localeCompare(String(a.start ?? "")))
    .map((e) => {
      const scored = pickemEvents.find((p) => p.eventId === e.pickemEventId && p.kind === "played");
      return {
        /*
         * The PickEm name already carries the year ("Tampa Bay 2025"), so appending it
         * gave "Tampa Bay 2025 2025". Only the league label, which does not, gets one.
         */
        label: scored?.eventName
          ? String(scored.eventName)
          : `${e.label ?? ""} ${e.year}`.trim(),
        finish: e.finishRank === 1 ? "Winner" : e.finishRank ? ordinal(Number(e.finishRank)) : String(e.finish ?? ""),
        record: record(Number(e.w ?? 0), Number(e.l ?? 0), Number(e.t ?? 0)),
        kills: scored ? Number(scored.kills ?? 0) : null,
        pickPct: scored?.pickPct != null ? Number(scored.pickPct) : null,
      };
    });
}

/**
 * One bar per season the player appeared in.
 *
 * This is the graphic that carries both families at once: the bar is the league win rate,
 * and a season PickEm scored also carries a kill figure. A career that predates 2025 is
 * still a full strip; only the kill overlay is missing.
 */
function seasonBars(leagueEvents: AnyRec[], pickemEvents: AnyRec[]): ShareSeasonBar[] {
  const byYear = new Map<string, { w: number; l: number; titles: number }>();
  for (const e of leagueEvents) {
    const y = String(e.year);
    const acc = byYear.get(y) ?? { w: 0, l: 0, titles: 0 };
    acc.w += Number(e.w ?? 0);
    acc.l += Number(e.l ?? 0);
    if (isTitle(e)) acc.titles += 1;
    byYear.set(y, acc);
  }
  const killsByYear = new Map<string, number>();
  for (const e of pickemEvents) {
    if (e.kind !== "played") continue;
    const y = String(e.year);
    killsByYear.set(y, (killsByYear.get(y) ?? 0) + Number(e.kills ?? 0));
  }
  return Array.from(byYear.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, a]) => ({
      year,
      winPct: a.w + a.l > 0 ? (a.w / (a.w + a.l)) * 100 : null,
      titles: a.titles,
      kills: killsByYear.get(year) ?? null,
    }));
}

// ── Season ────────────────────────────────────────────────────────────────────

function seasonCard(
  base: Pick<ShareCard, "playerId" | "name" | "team" | "imgUrl">,
  year: string,
  nxl: AnyRec,
  leagueEvents: AnyRec[],
  pickemEvents: AnyRec[],
): ShareCard {
  const evs = leagueEvents.filter((e) => String(e.year) === year);
  const w = evs.reduce((s, e) => s + Number(e.w ?? 0), 0);
  const l = evs.reduce((s, e) => s + Number(e.l ?? 0), 0);
  const t = evs.reduce((s, e) => s + Number(e.t ?? 0), 0);
  const titles = evs.filter(isTitle).length;
  const sundays = evs.filter(madeSunday).length;
  const decided = w + l;

  const pe = pickemEvents.filter((e) => String(e.year) === year && e.kind === "played");
  const kills = pe.reduce((s, e) => s + Number(e.kills ?? 0), 0);
  const bestRank = pe.reduce<number | null>(
    (best, e) => (e.rank != null && (best == null || e.rank < best) ? Number(e.rank) : best),
    null,
  );

  const types = new Map<string, number>();
  for (const e of pe) for (const [k, v] of Object.entries(e.types ?? {})) types.set(k, (types.get(k) ?? 0) + Number(v));
  const grand = Array.from(types.values()).reduce((s, v) => s + v, 0);

  return {
    ...base,
    accent: BRAND_GREEN,
    scopeLabel: `${year} season`,
    scopeRange: `${evs.length} ${evs.length === 1 ? "tournament" : "tournaments"}`,
    /*
     * Same rule as the career card: never lead with a losing record. This was fixed there
     * and not here, so a season card was still putting "2-6" in the largest type on the
     * canvas while the career card for the same player led with his kills.
     */
    headline: bestHeadline(
      headlineFor(nxl, { titles, sundays, matches: w + l + t, w, l }, false),
      titles === 0 && sundays === 0 && decided > 0 && w / decided < 0.5,
      kills,
      null,
      null,
      `${year} kills`,
    ),
    league: {
      title: `${year} NXL record`,
      caption: "Team results",
      stats: leagueTiles(
        { __tournaments: evs.length },
        { titles, sundays, matches: w + l + t, w, l, t },
        null,
      ),
    },
    pickem:
      pe.length && kills > 0
        ? {
            title: "PickEm stats",
            caption: `${year} confirmed kills`,
            stats: [
              { label: "Kills", value: num(kills) },
              { label: "Best event rank", value: bestRank != null ? ordinal(bestRank) : "—" },
              { label: "Kills per event", value: num(kills / pe.length) },
              { label: "Picked by", value: meanPickPct(pe) != null ? pct(meanPickPct(pe)) : "—" },
            ],
            types: Array.from(types.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([type, total]) => ({ type, share: grand > 0 ? (total / grand) * 100 : 0 })),
          }
        : null,
    seasons: [],
    /*
     * NEWEST FIRST, like the career list, because the table is capped and truncation has
     * to drop the least interesting end. Oldest-first cut the World Cup off a five-event
     * season — the finale, and for one player the only tournament anyone picked him at, so
     * the pick % column vanished from a card that had one.
     */
    events: evs
      .slice()
      .sort((a, b) => String(b.start ?? "").localeCompare(String(a.start ?? "")))
      .map((e) => {
        const scored = pickemEvents.find(
          (p) => p.eventId === e.pickemEventId && p.kind === "played",
        );
        return {
          /*
           * PickEm's name wins where there is one. The workbook labels the 2026 season
           * opener just "Open", which is meaningless once it is out of the context of a
           * year column — "Tampa Bay 2026" is the same event said usefully.
           */
          /*
           * No year on a SEASON card: the header already says which one, and the source
           * names disagree about carrying it — "World Cup" sat beside "Lone Star Open
           * 2025" in the same table. The career list keeps its years, where they matter.
           */
          label: String(scored?.eventName ?? e.label ?? "").replace(/\s+\d{4}$/, ""),
          finish: e.finishRank === 1 ? "Winner" : e.finishRank ? ordinal(Number(e.finishRank)) : String(e.finish ?? ""),
          record: record(Number(e.w ?? 0), Number(e.l ?? 0), Number(e.t ?? 0)),
          kills: scored ? Number(scored.kills ?? 0) : null,
          pickPct: scored?.pickPct != null ? Number(scored.pickPct) : null,
        };
      }),
    matches: [],
  };
}

// ── Event ─────────────────────────────────────────────────────────────────────

function eventCard(
  base: Pick<ShareCard, "playerId" | "name" | "team" | "imgUrl">,
  key: string,
  leagueEvents: AnyRec[],
  pickemEvents: AnyRec[],
  matchLog: AnyRec[],
  pickemMatches: AnyRec[],
): ShareCard | null {
  const le0 = leagueEvents.find((e) => e.key === key || e.pickemEventId === key) ?? null;
  const le: AnyRec | null = le0 ? { ...le0, __log: matchLog.filter((m) => m.k === le0.key) } : null;
  const pe = pickemEvents.find((e) => e.eventId === key || (le && e.eventId === le.pickemEventId)) ?? null;
  if (!le && !pe) return null;

  /*
   * PickEm's name wins. The workbook calls the season opener just "Open", which is a
   * heading in a year column and a mystery on a graphic — "Tampa Bay 2026" is the same
   * event said usefully. The league label is the fallback for events PickEm never scored.
   */
  const label = String(pe?.eventName ?? le?.label ?? "Event");
  const year = String(le?.year ?? pe?.year ?? "");
  const w = Number(le?.w ?? 0);
  const l = Number(le?.l ?? 0);
  const t = Number(le?.t ?? 0);

  /**
   * The club is already the card's team line, so it must not also be the headline label
   * AND the block caption — the first draft printed "Impact" three times in one card.
   * The headline says where they finished and out of how many; nothing else.
   */
  /** Scored here AND we have the per-match rows — the only case the merge is safe. */
  const scoredHere = !!(le && pe && Number(pe.kills ?? 0) > 0);

  const headline = le?.finish
    ? {
        value: le.finishRank === 1 ? "WINNER" : le.finishRank ? ordinal(Number(le.finishRank)) : String(le.finish),
        label: le.finishRank === 1 ? "Event winner" : "Finish",
        sub: undefined,
      }
    : {
        value: pe?.kills != null ? num(Number(pe.kills)) : "—",
        label: "Confirmed kills",
        sub: pe?.rank ? `${ordinal(Number(pe.rank))} for kills` : undefined,
      };

  return {
    ...base,
    team: String(le?.club ?? pe?.team ?? base.team),
    accent: (pe?.brandColor as string) || BRAND_GREEN,
    scopeLabel: label,
    scopeRange: year,
    headline,
    /**
     * ONE BAND, not two, when the match list is doing the work.
     *
     * An event card that carried "Team result" AND "PickEm scoring" AND a per-match list
     * was saying the same thing three times — the list already gives kills game by game,
     * which is the better version of a kills total. Collapsing them to four figures buys
     * the room to show every match instead of the first four, and the card stops repeating
     * itself. The finish and field size are not lost: they are the headline.
     */
    league: {
      title: scoredHere ? "At this event" : "Team result",
      caption: scoredHere
        ? "The team's record, and this player's kills"
        : "The team's record at this event",
      stats: le
        ? scoredHere
          ? /*
             * FOUR, because the tiles are a fixed width and a fifth simply runs off the
             * canvas — it does not wrap or shrink, it leaves. Match win % is the one to
             * drop: it is the record beside it restated as a percentage, and over five
             * matches that percentage is a coarse number anyway. Pick % cannot be derived
             * from anything else on the card.
             */
            [
              { label: "Record", value: record(w, l, t) },
              { label: "Kills", value: num(Number(pe.kills)) },
              { label: "Event rank", value: pe.rank ? ordinal(Number(pe.rank)) : "—" },
              { label: "Picked by", value: pe.pickPct != null ? pct(Number(pe.pickPct)) : "—" },
            ]
          : [
              /*
               * Two tiles. Finish and field size were both already the headline — "WINNER"
               * and "3rd" above, out of a field the reader is not asked to weigh — so a
               * tile for each said the same thing twice in a smaller size.
               */
              { label: "Record", value: record(w, l, t) },
              { label: "Match win %", value: w + l > 0 ? pct((w / (w + l)) * 100) : "—" },
            ]
        : [],
    },
    /*
     * A scored event keeps its kill-type chart, even though its four figures merged into
     * the band above. Merging was necessary — three bands and a match list do not fit —
     * but throwing the chart away with them left the card 300-450px short, and how a
     * player scored at an event is the most interesting thing PickEm knows about it.
     * An empty `stats` array is the signal to draw the chart alone.
     */
    pickem: scoredHere && Object.keys(pe.types ?? {}).length
      ? {
          title: "Kill types",
          caption: "How this player's kills broke down",
          stats: [],
          types: Object.entries(pe.types ?? {})
            .map(([type, total]) => ({ type, total: Number(total) }))
            .filter((t) => t.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 5)
            .map(({ type, total }) => {
              const grand = Object.values(pe.types ?? {}).reduce((x: number, v) => x + Number(v), 0);
              return { type, share: grand > 0 ? (total / grand) * 100 : 0 };
            }),
        }
      : !scoredHere && pe && (pe.kills ?? 0) > 0
        ? {
            title: "PickEm scoring",
            caption: "Confirmed kills at this event",
            stats: [
              { label: "Confirmed kills", value: num(Number(pe.kills)) },
              {
                label: "Event rank",
                value: pe.rank ? ordinal(Number(pe.rank)) : "—",
              },
              { label: "% of team's", value: pe.shareOfTeam != null ? pct(Number(pe.shareOfTeam)) : "—" },
              { label: "Cost per kill", value: pe.costPerKill != null ? `$${Math.round(Number(pe.costPerKill)).toLocaleString("en-US")}` : "—" },
            ],
            types: Object.entries(pe.types ?? {})
              .map(([type, total]) => ({ type, total: Number(total) }))
              .sort((a, b) => b.total - a.total)
              .slice(0, 5)
              .map(({ type, total }) => {
                const grand = Object.values(pe.types ?? {}).reduce((s: number, v) => s + Number(v), 0);
                return { type, share: grand > 0 ? (total / grand) * 100 : 0 };
              }),
          }
        : null,
    seasons: [],
    events: [],
    matches: eventMatches(le, pe, pickemMatches),
  };
}

/**
 * Where a round sits in an event, low to high.
 *
 * TWO VOCABULARIES, and they never appear together: PickEm's own rows name the prelim
 * DAYS and then the bracket, while the league's log names prelim GROUPS and uses the
 * Spanish bracket names. `eventMatches` picks one source or the other for a given event,
 * so both can share a table without the numbers needing to mean the same thing across it.
 *
 *   PickEm   Thursday · Friday · Saturday · Wildcard · Top 8 · Top 4 · Finals
 *   League   A-E Prelims · Ochos · Quarters · Semifinals · Final
 *
 * "Ochos" is the round of SIXTEEN (octavos de final), so it precedes the quarters rather
 * than being another name for them.
 *
 * A handful of 2022 World Cup rows carry a corrupted Round cell — a bare number where the
 * name should be — and those are prelims; see CAREER_PAGE_REVIEW.md. Anything else
 * unrecognised sorts last in the order it arrived, so a new round name appears at the
 * bottom of the table rather than silently reordering the ones above it.
 */
const ROUND_RANK: Record<string, number> = {
  thursday: 10,
  friday: 11,
  saturday: 12,
  "a prelims": 10,
  "b prelims": 11,
  "c prelims": 12,
  "d prelims": 13,
  "e prelims": 14,
  ochos: 20,
  wildcard: 21,
  wildcards: 21,
  top8: 22,
  quarters: 22,
  top4: 23,
  semifinals: 23,
  finals: 24,
  final: 24,
};

/**
 * What the row SAYS, once it is in the right place.
 *
 * Every prelim reads "Prelims" — the day names and the group letters are both ways of
 * saying "before the bracket", and neither is a distinction worth a column on a graphic.
 * The order still comes from the raw value, so Thursday's games sit above Friday's; only
 * the label is flattened, and only after sorting.
 */
function roundLabel(round: string): string {
  if (roundRank(round) < 20) return "Prelims";
  const key = String(round ?? "").trim().toLowerCase();
  if (key === "top8") return "Top 8";
  if (key === "top4") return "Top 4";
  return String(round ?? "");
}

function roundRank(round: string): number {
  const key = String(round ?? "").trim().toLowerCase();
  if (key in ROUND_RANK) return ROUND_RANK[key];
  if (/^\d+$/.test(key)) return 10; // corrupted Round cell — a prelim
  return 99;
}

/**
 * Every match the team played at one event, oldest first.
 *
 * Prefers the scored rows, which carry the player's kills per game; falls back to the
 * league's own log for the forty-odd events PickEm never scored. Never merges the two:
 * they describe the same matches from different sources, and a duplicate row would read
 * as a replay.
 */
function eventMatches(
  le: AnyRec | null,
  pe: AnyRec | null,
  matchLog: AnyRec[],
): ShareCard["matches"] {
  /* Stable within a round: same round keeps the order the source gave it. */
  const byRound = <T extends { round: string }>(rows: T[]): T[] =>
    rows
      .map((r, i) => ({ r, i }))
      .sort((a, b) => roundRank(a.r.round) - roundRank(b.r.round) || a.i - b.i)
      .map(({ r }) => ({ ...r, round: roundLabel(r.round) }));

  if (pe?.eventId) {
    const rows = matchLog.filter((m) => m.eventId === pe.eventId);
    if (rows.length) {
      return byRound(rows.map((m) => ({
        opponent: String(m.opponent ?? ""),
        round: String(m.round ?? ""),
        f: Number(m.scoreFor ?? 0),
        a: Number(m.scoreAgainst ?? 0),
        win: m.result === "W",
        kills: m.kills != null ? Number(m.kills) : null,
      })));
    }
  }
  if (!le) return [];
  return byRound(
    (Array.isArray(le.__log) ? le.__log : []).map((m: AnyRec) => ({
      opponent: String(m.o ?? ""),
      round: String(m.r ?? ""),
      f: Number(m.f ?? 0),
      a: Number(m.a ?? 0),
      win: Number(m.f ?? 0) > Number(m.a ?? 0),
      kills: null,
    })),
  );
}
