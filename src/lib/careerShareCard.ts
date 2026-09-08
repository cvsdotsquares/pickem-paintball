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
  /** Season card only — the tournaments that year. */
  events: { label: string; finish: string; record: string; kills: number | null }[];
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
      label: scoped.titles === 1 ? "NXL title" : "NXL titles",
      sub:
        withAllTimeRank && nxl?.titlesRank && nxl?.rankField
          ? `${ordinal(nxl.titlesRank)} all-time of ${nxl.rankField}`
          : undefined,
    };
  }
  if (scoped.sundays > 0) {
    return {
      value: String(scoped.sundays),
      label: scoped.sundays === 1 ? "Sunday made" : "Sundays made",
      sub:
        withAllTimeRank && nxl?.sundaysRank && nxl?.rankField
          ? `${ordinal(nxl.sundaysRank)} all-time of ${nxl.rankField}`
          : undefined,
    };
  }
  return {
    value: record(scoped.w, scoped.l, 0),
    label: "Match record",
    sub: scoped.matches > 0 ? `${scoped.matches} matches` : undefined,
  };
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
  const league: ShareStat[] = [
    { label: "Record", value: record(nxl.matchW ?? 0, nxl.matchL ?? 0, nxl.matchT ?? 0) },
    { label: "Match win %", value: pct(nxl.matchWinPct) },
    { label: "Tournaments", value: String(nxl.tournaments ?? 0) },
    { label: "Sundays", value: String(nxl.sundays ?? 0) },
  ];

  const scored = pickemEvents.filter((e) => e.kind === "played" && (e.kills ?? 0) > 0);
  const pickem = scored.length
    ? {
        title: "PickEm scoring",
        caption: `Confirmed kills, ${summary.trackedFrom ?? "2025"} to date`,
        stats: [
          { label: "Confirmed kills", value: num(Number(summary.totalKills ?? 0)) },
          {
            label: "Kills rank",
            value: summary.careerRank ? ordinal(Number(summary.careerRank)) : "—",
            sub: summary.careerRankField ? `of ${summary.careerRankField}` : undefined,
          },
          { label: "Per event", value: num(Number(summary.avgKills ?? 0)) },
          { label: "Best event rank", value: summary.bestRank ? ordinal(Number(summary.bestRank)) : "—" },
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
    }));

  return {
    ...base,
    accent: BRAND_GREEN,
    scopeLabel: hasLeague ? "NXL career" : "PickEm career",
    scopeRange: !hasLeague
      ? `${scored.length} ${scored.length === 1 ? "event" : "events"} scored`
      : nxl.firstYear && nxl.lastYear
        ? nxl.firstYear === nxl.lastYear
          ? String(nxl.firstYear)
          : `${nxl.firstYear} — ${nxl.lastYear}`
        : "",
    headline: hasLeague
      ? headlineFor(
          nxl,
          {
            titles: nxl.titles ?? 0,
            sundays: nxl.sundays ?? 0,
            matches: nxl.matches ?? 0,
            w: nxl.matchW ?? 0,
            l: nxl.matchL ?? 0,
          },
          true,
        )
      : {
          value: num(Number(summary.totalKills ?? 0)),
          label: "Confirmed kills",
          sub: summary.careerRank
            ? `${ordinal(Number(summary.careerRank))} of ${summary.careerRankField ?? "—"}`
            : undefined,
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
    events: hasLeague ? [] : scoredEvents,
    matches: [],
  };
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
    headline: headlineFor(nxl, { titles, sundays, matches: w + l + t, w, l }, false),
    league: {
      title: `${year} NXL record`,
      caption: "Team results",
      stats: [
        { label: "Record", value: record(w, l, t) },
        { label: "Match win %", value: decided > 0 ? pct((w / decided) * 100) : "—" },
        { label: "Tournaments", value: String(evs.length) },
        { label: "Sundays", value: String(sundays) },
      ],
    },
    pickem:
      pe.length && kills > 0
        ? {
            title: "PickEm scoring",
            caption: `${year} confirmed kills`,
            stats: [
              { label: "Confirmed kills", value: num(kills) },
              { label: "Best event rank", value: bestRank != null ? ordinal(bestRank) : "—" },
              { label: "Events scored", value: String(pe.length) },
              { label: "Per event", value: num(kills / pe.length) },
            ],
            types: Array.from(types.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([type, total]) => ({ type, share: grand > 0 ? (total / grand) * 100 : 0 })),
          }
        : null,
    seasons: [],
    events: evs
      .slice()
      .sort((a, b) => String(a.start ?? "").localeCompare(String(b.start ?? "")))
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
          label: String(scored?.eventName ?? e.label ?? ""),
          finish: e.finishRank === 1 ? "Winner" : e.finishRank ? ordinal(Number(e.finishRank)) : String(e.finish ?? ""),
          record: record(Number(e.w ?? 0), Number(e.l ?? 0), Number(e.t ?? 0)),
          kills: scored ? Number(scored.kills ?? 0) : null,
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

  const label = String(le?.label ?? pe?.eventName ?? "Event");
  const year = String(le?.year ?? pe?.year ?? "");
  const w = Number(le?.w ?? 0);
  const l = Number(le?.l ?? 0);
  const t = Number(le?.t ?? 0);

  /**
   * The club is already the card's team line, so it must not also be the headline label
   * AND the block caption — the first draft printed "Impact" three times in one card.
   * The headline says where they finished and out of how many; nothing else.
   */
  const headline = le?.finish
    ? {
        value: le.finishRank === 1 ? "WINNER" : le.finishRank ? ordinal(Number(le.finishRank)) : String(le.finish),
        label: le.fieldSize ? `of ${le.fieldSize} teams` : "Finish",
        sub: undefined,
      }
    : {
        value: pe?.kills != null ? num(Number(pe.kills)) : "—",
        label: "Confirmed kills",
        sub: pe?.rank ? `${ordinal(Number(pe.rank))} of ${pe.fieldSize}` : undefined,
      };

  return {
    ...base,
    team: String(le?.club ?? pe?.team ?? base.team),
    accent: (pe?.brandColor as string) || BRAND_GREEN,
    scopeLabel: label,
    scopeRange: year,
    headline,
    league: {
      title: "Team result",
      caption: "The team's record at this event",
      stats: le
        ? [
            { label: "Record", value: record(w, l, t) },
            { label: "Match win %", value: w + l > 0 ? pct((w / (w + l)) * 100) : "—" },
            { label: "Finish", value: le.finishRank ? ordinal(Number(le.finishRank)) : String(le.finish) },
            { label: "Field", value: `${le.fieldSize} teams` },
          ]
        : [],
    },
    pickem:
      pe && (pe.kills ?? 0) > 0
        ? {
            title: "PickEm scoring",
            caption: "Confirmed kills at this event",
            stats: [
              { label: "Confirmed kills", value: num(Number(pe.kills)) },
              {
                label: "Event rank",
                value: pe.rank ? ordinal(Number(pe.rank)) : "—",
                sub: pe.fieldSize ? `of ${pe.fieldSize}` : undefined,
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
  if (pe?.eventId) {
    const rows = matchLog.filter((m) => m.eventId === pe.eventId);
    if (rows.length) {
      return rows.map((m) => ({
        opponent: String(m.opponent ?? ""),
        round: String(m.round ?? ""),
        f: Number(m.scoreFor ?? 0),
        a: Number(m.scoreAgainst ?? 0),
        win: m.result === "W",
        kills: m.kills != null ? Number(m.kills) : null,
      }));
    }
  }
  if (!le) return [];
  return (Array.isArray(le.__log) ? le.__log : []).map((m: AnyRec) => ({
    opponent: String(m.o ?? ""),
    round: String(m.r ?? ""),
    f: Number(m.f ?? 0),
    a: Number(m.a ?? 0),
    win: Number(m.f ?? 0) > Number(m.a ?? 0),
    kills: null,
  }));
}
