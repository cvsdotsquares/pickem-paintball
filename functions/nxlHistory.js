/**
 * A player's NXL win/loss record, read from `data/nxlHistory.json`.
 *
 * THIS IS REFERENCE DATA, NOT A PROJECTION
 * The JSON is built offline by `scripts/nxl-history/build.mjs` from the league's own
 * results and the pbleagues roster crawl, and committed. Nothing here reads Firestore
 * and nothing writes back, so a rebuild costs no reads and a bad import is a revert.
 *
 * TWO SCOPES ON ONE PAGE, DELIBERATELY
 * PickEm scores eight events. The league has been running since 2015. Kills therefore
 * exist for eight tournaments and results exist for fifty-one, and no amount of care
 * makes those the same number — a career page that showed "0 tournament wins" for a
 * three-time champion would be worse than one that admits to two scopes. So the record
 * here is labelled as the NXL career throughout, and the kill columns stay PickEm's.
 *
 * WHAT A WIN MEANS HERE
 * A player is credited with their TEAM's result at every event they were rostered for
 * and took the field at. That is a claim about the team, not about the individual, and
 * the page must say so. The alternative — crediting only matches they were physically
 * on the field for — is not available: pbleagues publishes per-point lineups reliably
 * for 2023 alone.
 */

const HISTORY = require("./data/nxlHistory.json");

/** club name -> our `team_id`, for the events PickEm also scores. */
const CLUB_TEAM_ID = HISTORY.clubTeamId || {};
const TEAM_ID_CLUB = new Map(Object.entries(CLUB_TEAM_ID).map(([club, id]) => [id, club]));

const EVENT_BY_KEY = new Map(HISTORY.events.map((e) => [e.key, e]));

/** Firestore event id -> the league event it is, for the eight PickEm scores. */
const EVENT_BY_PICKEM_ID = new Map(
  HISTORY.events.filter((e) => e.pickemEventId).map((e) => [e.pickemEventId, e]),
);

/**
 * Our long-data round labels -> the league's.
 *
 * Same map as `scripts/backfill/fixtures.mjs`, and for the same reason: we record the
 * knockout stages by bracket size and the league records them by name. Prelims are
 * absent on purpose — we label those by the DAY they were played and the league labels
 * them by GROUP, and those two cannot be translated.
 */
const PLAYOFF_ROUND = {
  Wildcard: "Ochos",
  Top8: "Quarters",
  Top4: "Semifinals",
  Finals: "Final",
};

/** The league's own knockout labels, so everything else is a group game. */
const PLAYOFF_ROUND_SET = new Set(Object.values(PLAYOFF_ROUND));

const pairKey = (a, b) => [a, b].sort().join("|");

/**
 * Every match at one league event, indexed the two ways a game can be identified.
 *
 * Built lazily and cached: only the eight PickEm events are ever asked for, so indexing
 * all fifty-one up front would be work thrown away.
 */
const matchIndexCache = new Map();
function matchIndex(event) {
  if (matchIndexCache.has(event.key)) return matchIndexCache.get(event.key);

  const byRound = new Map(); // "Final|DAM|IMP" -> [match]
  const byPrelimPair = new Map(); // "DAM|TON" -> [match]

  for (const [round, date, a, b, sa, sb] of event.matches) {
    const ta = CLUB_TEAM_ID[a];
    const tb = CLUB_TEAM_ID[b];
    // A club with no team_id never played a PickEm event, so its games can never be
    // asked for. Skipping keeps the index to the teams that can actually be matched.
    if (!ta || !tb) continue;
    const m = { round, date, a, b, ta, tb, sa, sb };
    const pair = pairKey(ta, tb);
    const rk = `${round}|${pair}`;
    if (!byRound.has(rk)) byRound.set(rk, []);
    byRound.get(rk).push(m);
    if (!PLAYOFF_ROUND_SET.has(round)) {
      if (!byPrelimPair.has(pair)) byPrelimPair.set(pair, []);
      byPrelimPair.get(pair).push(m);
    }
  }

  const idx = { byRound, byPrelimPair };
  matchIndexCache.set(event.key, idx);
  return idx;
}

/**
 * The league's result for one of our games, or null.
 *
 * KNOCKOUT GAMES MATCH ON ROUND, GROUP GAMES ON THE TEAM PAIR.
 *
 * The obvious key for a prelim is the date, and it does not work: our sheets and the
 * workbook disagree by a day at four of the eight events (Tampa Bay 2025 and 2026,
 * Atlantic City, Midwest 2025 — every prelim shifted +1). Matching on date resolved
 * 60% of games and the failures were whole events at a time, which is the shape of a
 * key that is wrong rather than data that is missing.
 *
 * The team pair is the reliable key instead, because the group stage is a round-robin:
 * across all 51 events a pair meets twice in the prelims exactly ONCE (Boom v Infamous,
 * 2017 World Cup — a season with no long data). A pair that does meet twice falls back
 * to the date, and returns null if that cannot separate them either.
 *
 * Null rather than a guess in every uncertain case. A blank cell is honest; a wrong W
 * on a player's record is not.
 *
 * @param {string} pickemEventId  e.g. "world_cup_2025"
 * @param {string} round          OUR label: "Friday", "Top8", ...
 * @param {string|null} date      ISO date of the game, from the long rows
 * @param {string} teamId         the player's team
 * @param {string} opponentId
 * @return {{result: "W"|"L"|"T", for: number, against: number, round: string}|null}
 */
function matchResult(pickemEventId, round, date, teamId, opponentId) {
  const event = EVENT_BY_PICKEM_ID.get(pickemEventId);
  if (!event || !teamId || !opponentId) return null;

  const { byRound, byPrelimPair } = matchIndex(event);
  const pair = pairKey(teamId, opponentId);

  const leagueRound = PLAYOFF_ROUND[round];
  let hits = leagueRound ? byRound.get(`${leagueRound}|${pair}`) : byPrelimPair.get(pair);

  // The one case the pair cannot settle: two group meetings. Dates disagree by a day
  // between the sources, so allow that much slack and insist on a single survivor.
  if (!leagueRound && hits && hits.length > 1 && date) {
    hits = hits.filter((m) => m.date && Math.abs(Date.parse(m.date) - Date.parse(date)) <= 86400000);
  }

  if (!hits || hits.length !== 1) return null;
  const m = hits[0];

  const mine = m.ta === teamId ? m.sa : m.sb;
  const theirs = m.ta === teamId ? m.sb : m.sa;
  return {
    result: mine > theirs ? "W" : mine < theirs ? "L" : "T",
    for: mine,
    against: theirs,
    round: m.round,
  };
}

/**
 * All-time standings, for the rank tile — built once, on first use.
 *
 * RANKED AGAINST EVERY PRO PLAYER IN THE FILE, not against PickEm's current rosters.
 * The population is the 699 people who have appeared on an NXL Pro roster since 2015,
 * which is what "all-time" has to mean: ranking a player only against the ~230 who
 * happen to be on a 2026 roster would quietly promote everyone as the veterans retire,
 * and a career total is exactly the sort of number a reader will compare across eras.
 *
 * Totals here are RAW — no participation filter, because absence is only knowable for
 * PickEm's eight events and applying it to a twelve-year population would mean holding
 * two different standards inside one ranking. A player's own displayed figure DOES drop
 * events they sat out, so someone who missed a tournament they would have won can sit a
 * place lower than their raw record implies. That is the right way round: it never
 * credits an absence, and the gap is at most a place or two.
 */
let standings = null;
function allTimeStandings() {
  if (standings) return standings;

  const titles = [];
  const sundays = [];
  const matches = [];

  for (const appearances of Object.values(HISTORY.appearances)) {
    let t = 0;
    let s = 0;
    let m = 0;
    for (const [eventKey, club] of appearances) {
      const e = EVENT_BY_KEY.get(eventKey);
      const r = e && e.teams[club];
      if (!r) continue;
      if (r.finishRank === 1) t++;
      if (r.finishRank != null) s++;
      m += r.w + r.l + r.t;
    }
    titles.push(t);
    sundays.push(s);
    matches.push(m);
  }

  const desc = (a) => a.sort((x, y) => y - x);
  standings = {
    titles: desc(titles),
    sundays: desc(sundays),
    matches: desc(matches),
    population: Object.keys(HISTORY.appearances).length,
  };
  return standings;
}

/**
 * Standard competition ranking: ties share a position, and the next value skips.
 *
 * Same rule as the career-kills rank on the PickEm row, so two ranks sitting inches
 * apart on the same page cannot be counting differently.
 */
function rankIn(sortedDesc, value) {
  const i = sortedDesc.findIndex((v) => v <= value);
  return i === -1 ? null : i + 1;
}

/**
 * One player's whole NXL record.
 *
 * `absentEventIds` are the PickEm events our own `participation` verdict says the player
 * sat out. Those are dropped: crediting someone with a tournament win they watched from
 * the pit is the exact unfairness the participation model exists to remove. Absence is
 * only knowable for the eight events PickEm scores — every league event before those is
 * counted as played, because a roster appearance is the only evidence that exists.
 *
 * @param {string|number|null} leagueId
 * @param {{absentEventIds?: Set<string>}} opts
 */
function nxlCareer(leagueId, { absentEventIds = new Set() } = {}) {
  const key = leagueId == null ? null : String(leagueId);
  const appearances = key ? HISTORY.appearances[key] : null;
  if (!appearances || appearances.length === 0) return null;

  const events = [];
  for (const [eventKey, club] of appearances) {
    const e = EVENT_BY_KEY.get(eventKey);
    if (!e) continue;
    if (e.pickemEventId && absentEventIds.has(e.pickemEventId)) continue;
    const r = e.teams[club];
    if (!r) continue;
    events.push({
      key: e.key,
      year: e.year,
      label: e.label,
      start: e.start,
      pickemEventId: e.pickemEventId,
      club,
      teamId: CLUB_TEAM_ID[club] || null,
      w: r.w,
      l: r.l,
      t: r.t,
      finish: r.finish,
      finishRank: r.finishRank,
      fieldSize: e.fieldSize,
    });
  }
  if (events.length === 0) return null;

  const sum = (f) => events.reduce((a, x) => a + f(x), 0);
  const matchW = sum((x) => x.w);
  const matchL = sum((x) => x.l);
  const matchT = sum((x) => x.t);
  const decided = matchW + matchL;

  /**
   * Ties are excluded from the denominator rather than scored as half a win.
   *
   * There is exactly ONE tie in 2,393 matches (2015), so any convention is arithmetically
   * irrelevant and the simplest defensible one wins: a win rate is wins per decided match.
   */
  const titles = events.filter((x) => x.finishRank === 1).length;

  /**
   * TOP FOUR, NOT PODIUM.
   *
   * This format has no third-place match, so the two beaten semi-finalists are joint
   * third and no event ever produces a distinct 3rd place. "Top 3" cannot be computed
   * from a bracket that does not decide it; top four can, and is what the label says.
   */
  const topFours = events.filter((x) => x.finishRank != null && x.finishRank <= 3).length;
  const finals = events.filter((x) => x.finishRank != null && x.finishRank <= 2).length;

  /**
   * SUNDAYS — tournaments where the team reached the knockout bracket.
   *
   * `finishRank` is null for a team that went out in the group stage and a number for
   * every bracket round, so "made the bracket" is simply a rank existing. At every NXL
   * event in the file the whole bracket is played on the final day, which is what the
   * sport means by making Sunday; the name is the paintball term rather than a claim
   * about the calendar, and a handful of finals have in fact fallen on a Saturday.
   *
   * This exists because "tournament wins" flattens most careers to a zero. Across the
   * title-less players with ten or more events it separates Tj Danner (84%) from Joel
   * Eaton (30%) — two records a "0 wins" tile calls identical.
   */
  const sundays = events.filter((x) => x.finishRank != null).length;

  const years = events.map((x) => x.year).filter(Boolean);
  /**
   * The first season the LEAGUE FILE covers, not the player's debut.
   *
   * The header above these numbers is a statement about our coverage — paintball is far
   * older than 2015 and the results before it are hard to come by — so it has to read
   * the same on every player's page. Derived rather than hardcoded so that backfilling
   * an earlier season updates the claim by itself.
   */
  const trackedFrom = HISTORY.events.length ? HISTORY.events[0].year : null;
  const board = allTimeStandings();
  const matches = matchW + matchL + matchT;

  /**
   * Every match the player's team played at an event PickEm does NOT score.
   *
   * The match table shows a whole career, so it needs rows for the forty-odd events
   * that have results but no kill data. PickEm's own eight are deliberately absent
   * here: their rows already exist on the summary, built from long data and carrying
   * kills, and duplicating them would mean two sources for one row.
   *
   * ⚠️ OBJECTS, NOT TUPLES. Firestore rejects an array whose elements are themselves
   * arrays — "Property nxl contains an invalid nested entity" — so the compact
   * `[key, round, opponent, for, against]` form this started as cannot be stored. Keys
   * are single letters to claw back the bytes that costs: k = event key, r = round,
   * o = opponent, f = scored for, a = scored against.
   */
  const matchLog = [];
  for (const ev of events) {
    if (ev.pickemEventId) continue;
    const source = EVENT_BY_KEY.get(ev.key);
    if (!source) continue;
    for (const [round, , a, b, sa, sb] of source.matches) {
      if (a !== ev.club && b !== ev.club) continue;
      const mine = a === ev.club ? sa : sb;
      const theirs = a === ev.club ? sb : sa;
      matchLog.push({ k: ev.key, r: round, o: a === ev.club ? b : a, f: mine, a: theirs });
    }
  }

  return {
    leagueId: key,
    events,
    tournaments: events.length,
    titles,
    finals,
    topFours,
    sundays,
    titleRate: events.length ? (titles / events.length) * 100 : null,
    sundayRate: events.length ? (sundays / events.length) * 100 : null,
    matchW,
    matchL,
    matchT,
    /** Every match played, the denominator behind `matchWinPct`. */
    matches,
    /** All-time position on each figure, among every Pro player since 2015. */
    matchLog,
    trackedFrom,
    titlesRank: rankIn(board.titles, titles),
    sundaysRank: rankIn(board.sundays, sundays),
    matchesRank: rankIn(board.matches, matches),
    rankField: board.population,
    matchWinPct: decided ? (matchW / decided) * 100 : null,
    firstYear: years.length ? years.reduce((a, b) => (a < b ? a : b)) : null,
    lastYear: years.length ? years.reduce((a, b) => (a > b ? a : b)) : null,
    seasons: new Set(years).size,
  };
}

/** The league's record for one team at one PickEm event — the event table's W-L cell. */
function eventRecord(pickemEventId, teamId) {
  const e = EVENT_BY_PICKEM_ID.get(pickemEventId);
  if (!e || !teamId) return null;
  const club = TEAM_ID_CLUB.get(teamId);
  const r = club && e.teams[club];
  if (!r) return null;
  return { w: r.w, l: r.l, t: r.t, finish: r.finish, finishRank: r.finishRank, champion: e.champion === club };
}

/** True once the workbook carries results for this event; the W-L columns key off it. */
const hasResults = (pickemEventId) => EVENT_BY_PICKEM_ID.has(pickemEventId);

module.exports = {
  nxlCareer,
  matchResult,
  eventRecord,
  hasResults,
  generated: HISTORY.generated,
};
