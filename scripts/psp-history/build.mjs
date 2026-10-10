/**
 * PSP (2003-2015) history, in the same shape as functions/data/nxlHistory.json.
 *
 *   node scripts/psp-history/build.mjs           report only
 *   node scripts/psp-history/build.mjs --write   also writes functions/data/pspHistory.json
 *
 * SOURCE: the offline archive at ~/Documents/nxl-pro-players/psp_archive, saved because
 * pbleagues is expected to take this data down. Nothing here touches the network.
 *   raw/event/{id}/{info,teams,schedule}.html.gz   public pages, 2004 World Cup and 2006+
 *   raw/roster/{rosterId}.html.gz                 public top-division rosters
 *   logged_in/profiles.jsonl                      every player's 2003-05 PSP rows, read
 *                                                 from their (logged-in) profile, because the
 *                                                 2003-05 roster pages are archived
 *
 * DECISIONS (James, 10 Oct 2026) — each is a place PSP differs from NXL:
 *  - "Pro" is whatever the event's TOP division was called: Division 1 X-Ball (2003-mid
 *    2004), Pro X-Ball (2004 World Cup, 2006+), Open X-Ball (2005), Pro RaceTo-7/RaceTo-X.
 *    Pro Challengers and Semi-Pro are not Pro.
 *  - PSP's "Finals" round is NXL's "Final". "1/16", "1/32" (2013-15) are the Wildcard.
 *  - 2006-07 "Finals" is a round robin, so the champion is the league's rank 1, not the
 *    winner of one game.
 *  - From mid-2013 the league table lists Champions AND Challengers as one 20-team "Pro"
 *    division; the schedule keeps them apart. Pro = the teams in the main Pro schedule.
 *  - Excluded: 2003 Chicago + Philadelphia (rosters incomplete), 2004 Mardi Gras (5-man
 *    only), 2006 Mid-Atlantic (an all-star game), 2015 Nashville (cancelled), and the two
 *    non-events in the league ("Season Entry Fees", "UWL @ World Cup").
 *  - Events with NO match results (2003-05, 2006 Texas) are kept for placings and titles
 *    and flagged `results: false`; their bracket depth is unknown.
 */
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
/* No NXL parser here: it reads one division per schedule ROW, but a row holds two games
   and PSP files a Challengers or Division 1 game second in a "Pro X-Ball" row. */

const ARCHIVE = "/Users/jamesgreen/Documents/nxl-pro-players/psp_archive";
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT = path.join(REPO, "functions/data/pspHistory.json");

const EXCLUDED = {
  1: "2003 Chicago Open — 8 of 11 teams' rosters recoverable",
  2: "2003 Philadelphia Open — 6 of 8 teams' rosters recoverable",
  36: "2004 Mardi Gras Open — 5-man event, no X-Ball division",
  209: "2006 Mid-Atlantic Open — Pro division was an NXL all-star game",
  2210: "Season Entry Fees — not an event",
  3101: "UWL @ World Cup — not a PSP Pro event",
  3839: "2015 Nashville Open — cancelled",
};
/** 2003-05: rosters exist only via player profiles. */
const PROFILE_EVENTS = new Set(["20", "40", "58", "60", "62", "75", "103", "143", "158", "173", "183"]);

/* Same tables as build.mjs — PSP must score by the NXL rules, not its own. */
const KNOCKOUT_DEPTH = { Final: 1, Semifinals: 2, "1/6": 2.5, Quarters: 3, Ochos: 4, Wildcard: 5 };
const FINISH = {
  winner: { rank: 1, label: "Winner" },
  Final: { rank: 2, label: "Runner-up" },
  Semifinals: { rank: 3, label: "Semi-finals" },
  /* PSP 2008 only (B9): made Sunday, not top four. The career code's MADE_BRACKET must list it. */
  "1/6": { rank: 3, label: "1/6" },
  Quarters: { rank: 5, label: "Quarter-finals" },
  Ochos: { rank: 9, label: "Ochos" },
  Wildcard: { rank: 17, label: "Wildcard" },
  prelims: { rank: null, label: "Prelims" },
};
/**
 * B1 (James, 10 Oct 2026): at these events the whole Sunday bracket is labelled "Finals" —
 * quarters, semis, a 3rd-place game and the final alike. Rebuilt by elimination, every one
 * is a clean 8-team knockout whose quarter-finalists are exactly league #1-#8, final
 * winner #1, loser #2 (checks/b1_brackets.py). So the rounds are relabelled from the order
 * of games: two teams in their first game = quarter-final; two semi losers = 3rd place;
 * two unbeaten teams in their second game = semi, third = final.
 */
const BRACKET_BY_ELIMINATION = new Set(["206", "207", "208", "210", "398", "495", "517", "529"]);
/**
 * B1.3: the 2006 World Cup's final and 3rd-place game carry no score. The league table
 * says who won each (#1 beat #2, #3 beat #4), so the games are kept with the winner and a
 * blank score: they count in win-loss, not in points.
 */
const UNSCORED_WINNER_FROM_PLACINGS = new Set(["210"]);
/**
 * B2 (James, 10 Oct 2026): the 2007 World Cup's "Finals" are best-of-3 SERIES, like NBA
 * playoffs — quarters Thu-Fri, semis Sat, final Sun, matching the league placings exactly.
 * Each series is one round; each game is stored as "<Round> G<n>" (e.g. "Final G2") and
 * counts as a match in win-loss. An unneeded third game posts 0-0 and is dropped.
 */
const SERIES_BRACKET = new Set(["540"]);
/**
 * B3 (James, 10 Oct 2026): 2009-2010 events carry two "Finals" games — the final (#1 v #2)
 * and a 3rd-place game between the beaten semi-finalists (#3 v #4). Told apart by the league
 * placings; at all 8 events the higher-ranked team won both. The 3rd-place game counts in
 * win-loss but adds no depth (both teams are already semi-finalists).
 * B4: the 2009 World Cup is in this set too, and its quarters, semis and final are best-of-3
 * series (as B2) — consecutive games between the same pair in one round get " G<n>".
 */
/**
 * B9 (James, 10 Oct 2026): at 2008 Phoenix, Mid-Atlantic, Chicago and Northeast six teams
 * made Sunday and played two round-robin groups of three (worked out from who played whom —
 * pbleagues labels the games "Quarters" at Phoenix, "Semifinals" elsewhere). Each group's
 * best team reached the final; where all three went 1-1 (Chicago, Northeast) it was margin.
 * The group games and the four non-finalists' finish are both "1/6": Sunday, not top four.
 */
const SUNDAY_SIX = new Set(["604", "730", "771", "782"]);
const FINALS_BY_PLACING = new Set(["874", "986", "1119", "1164", "1315", "1448", "1514", "1515"]);
/** "Final G2" -> "Final": the game number is display only; depth reads the round. */
const baseRound = (r) => String(r ?? "").replace(/ G\d+$/, "");
/**
 * B1.1: 2006 Texas has a Pro table (the same 15 teams as Las Vegas a month later) but no Pro
 * games. Every 2006-07 event with results ran an 8-team knockout whose places map exactly
 * onto the table, so the finishes are inferred from the table and the event says so.
 */
const FINISH_FROM_PLACINGS = new Set(["205"]);
/**
 * C2 (James, 10 Oct 2026): 2008 World Cup — one prelim group's 10 games survive, the other
 * group's are missing entirely, there are no quarters/semis and the final (Ironmen v Philly)
 * has no scores. Placings only, like 2003-05: every game dropped so half the field doesn't
 * get a match record; champion from the placings; out of Sunday %.
 */
const PLACINGS_ONLY = new Set(["795"]);
const placingFinish = (r) => (r === 1 ? "Winner" : r === 2 ? "Runner-up" : r <= 4 ? "Semi-finals" : r <= 8 ? "Quarter-finals" : "Prelims");

/** PSP's round names -> the career code's. Everything not here keeps its own name. */
const PSP_ROUND = { Finals: "Final" };
/**
 * B5 (James, 10 Oct 2026): from 2013 the bottom Pro teams play RELEGATION games, labelled
 * "Ochos", "1/16" or "1/32" on pbleagues. Their losers are in the Challengers division at
 * the next event and their winners stay Pro — checked for all 18 games (checks/relegation.py).
 * A knockout game whose teams never reach the main bracket (Quarters/Semifinals/Final) is
 * relabelled "Relegation": it counts in win-loss but is NOT a Sunday.
 */
const RELEGATION_EVENTS = new Set(["2639", "2641", "2640", "3002", "2642", "3215", "3216", "3217", "3218", "3219"]); // 3219: 2014 World Cup, confirmed by James's manual review (no Challengers in 2015 to check against)
/** Rounds that are knockout games but decide no depth — a 3rd-place game adds nothing to a semi-finalist's run. */
const NEUTRAL_ROUNDS = new Set(["3rd Place", "Relegation", "Placement"]);
/**
 * B5 (James, 10 Oct 2026): 2015 Dallas — #1-#8 play the standard knockout; #9-#16 play a
 * ladder (1/32 -> 1/16 -> "Ochos") for 9th-16th. No Challengers existed to relegate to, so
 * those games are "Placement": win-loss counts, not a Sunday.
 */
const PLACEMENT_EVENTS = new Set(["3838"]);

const gz = (p) => (fs.existsSync(p) ? zlib.gunzipSync(fs.readFileSync(p)).toString("utf8") : "");
const text = (h) => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#039;|&apos;/g, "'")
  .replace(/&quot;/g, '"').replace(/&trade;/g, "™").replace(/\s+/g, " ").trim();
const MONTH = Object.fromEntries("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ").map((m, i) => [m, i + 1]));
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** The PSP top division's league table. NOT parseRankings: its isPro rejects "Pro RaceTo-7". */
const isPspPro = (d) => /^\s*Pro\b/i.test(d) && !/Semi|Challeng|3v3|Women|Female|10-man|5-man|5v5/i.test(d);
function rankings(html) {
  for (const [, division, body] of html.matchAll(/<div class="ranking"[^>]*data-division="([^"]*)"([\s\S]*?)(?=<div class="ranking"|<\/body>)/g)) {
    if (!isPspPro(text(division))) continue;
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .map(([, tr]) => [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(([, c]) => text(c)))
      .filter((c) => c.length >= 2 && /^\d{1,2}$/.test(c[0]))
      .map(([rank, team]) => ({ rank: Number(rank), team }));
    if (rows.length) return { division: text(division), rows };
  }
  return { division: null, rows: [] };
}

/**
 * Every PSP game whose OWN division is "Pro X-Ball".
 *
 * James, 10 Oct 2026: the true Pro games are labelled "Pro X-Ball", Challengers games
 * "Pro Challengers X-Ball". The label is per GAME: a schedule row holds two games and
 * `data-division="Pro X-Ball™|Pro Challengers X-Ball™"` names each, pipe-separated, the
 * same way `data-group` does. Reading only the part before the pipe (as the NXL crawler
 * does) files the second game under the first's division — at the 2013 West Coast Open
 * that let all ten Challengers and four Division 1 teams in.
 */
function proGames(html, { keepUnscored = false } = {}) {
  const out = [];
  for (const [, matchId, body] of html.matchAll(/<div class="match[^"]*"[^>]*id="match-(\d+)"([\s\S]*?)(?=<div class="match |<\/body>)/g)) {
    const divs = ((body.match(/data-division="([^"]*)"/) || [])[1] || "").split("|").map((d) => text(d));
    const roundName = (body.match(/<div class="round"[^>]*data-round="([^"]*)"/) || [])[1] ?? null;
    const groups = ((body.match(/<div class="round"[^>]*data-group="([^"]*)"/) || [])[1] ?? "").split("|").map((g) => g.trim());
    const date = (body.match(/data-date="([^"]*)"/) || [])[1] ?? null;
    const time = (body.match(/<div class="startTime"[^>]*>\s*([^<]*?)\s*</) || [])[1] ?? null;
    const team = (cls) => {
      const m = body.match(new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*data-team="([^"]*)"`)) ?? body.match(new RegExp(`data-team="([^"]*)"[^>]*class="[^"]*\\b${cls}\\b[^"]*"`));
      return m ? text(m[1]) : null;
    };
    const score = (cls) => {
      const b = body.match(new RegExp(`<div class="${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`));
      const n = b ? [...b[1].matchAll(/<span class="s[12][^"]*"[^>]*>\s*(\d+)\s*<\/span>/g)].map((m) => Number(m[1])) : [];
      return n.length >= 2 ? n : null;
    };
    const pairs = [[team("team1_name"), team("team2_name"), score("score1"), 0], [team("dual_team1_name"), team("dual_team2_name"), score("score2"), 1]];
    for (const [a, b, sc, i] of pairs) {
      if (!a || !b || !/^Pro X-Ball/i.test(divs[i] || "")) continue;   // per-game division
      const unscored = !sc || sc[0] + sc[1] === 0;                       // unplayed games post 0-0
      if (unscored && !keepUnscored) continue;
      out.push({ id: Number(matchId), round: roundName ? [groups[i], roundName].filter(Boolean).join(" ") : null, date, time,
        teamA: a, teamB: b, scoreA: unscored ? null : sc[0], scoreB: unscored ? null : sc[1] });
    }
  }
  return out;
}

/** Roster links under the top division heading on the teams page: team name -> roster id. */
function topRosterLinks(html) {
  for (const part of html.split(/<h[2-5][^>]*>/).slice(1)) {
    const links = [...part.matchAll(/href="\/team\/roster\/([A-Za-z0-9]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(([, id, n]) => [text(n), id]);
    if (links.length) return new Map(links);
  }
  return new Map();
}

function eventMeta(id) {
  const info = text(gz(`${ARCHIVE}/raw/event/${id}/info.html.gz`));
  const title = (gz(`${ARCHIVE}/raw/event/${id}/teams.html.gz`).match(/<title>\s*(?:Rankings:\s*)?([^<|]*)/) || [])[1];
  const m = info.match(/Event Date:\s*\w+, (\d{1,2}) (\w+)(?: (\d{4}))?.*? to \w+, \d{1,2} \w+, (\d{4})/);
  const year = m ? (m[3] || m[4]) : null;
  return { year, start: m ? iso(year, MONTH[m[2].slice(0, 3)], m[1]) : null, label: title ? text(title).replace(/^PSP\s+/i, "") : null };
}

/** Players (not coaches or staff) on a saved public roster page. */
function rosterPlayers(rosterId) {
  const html = gz(`${ARCHIVE}/raw/roster/${rosterId}.html.gz`);
  const table = (html.match(/id="roster-player"([\s\S]*?)<\/table>/) || [])[1] || "";
  return [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)].map(([tr]) => {
    const a = tr.match(/href="\/profile\/([A-Za-z0-9]{16})[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) return null;
    const num = (tr.match(/\/pictures(?:_crop)?\/(\d+)\./) || [])[1] || null;
    return { num, epid: a[1], name: text(a[2]) };
  }).filter(Boolean);
}

const warnings = { unknownRounds: [], championMismatch: [], rankingNotInSchedule: [], noRoster: [], notes: [] };
const events = [];
const appear = new Map();      // numeric id -> [[key, club]]
const appearEpid = new Map();  // epid (players with no numeric id) -> [[key, club]]
const names = {};
const add = (p, key, club) => {
  /* Names by whichever id the appearance is filed under — numeric, or EPID for no photo. */
  if (p.name && (p.num || p.epid)) names[p.num || p.epid] = p.name;
  const [map, id] = p.num ? [appear, p.num] : [appearEpid, p.epid];
  if (!id) return;
  const list = map.get(id) ?? map.set(id, []).get(id);
  if (!list.some(([k]) => k === key)) list.push([key, club]);
};

// ---- 1. 2003-05, from player profiles --------------------------------------------
const rank = (d) => (/^Pro/.test(d) ? 0 : /^Open/.test(d) ? 1 : 2);
const early = new Map(); // event id -> { meta, rosters: erid -> {club, place, field, players:[]} }
for (const line of fs.readFileSync(`${ARCHIVE}/logged_in/profiles.jsonl`, "utf8").split("\n").filter(Boolean)) {
  const p = JSON.parse(line);
  const num = (String(p.pic || "").match(/\/pictures\/(\d+)\./) || [])[1] || null;
  for (const [date, ev, evname, team, erid, div, place, score] of p.rows || []) {
    if (!PROFILE_EVENTS.has(ev) || !/^(Pro|Open|Division 1) X-Ball/.test(div)) continue;
    const E = early.get(ev) ?? early.set(ev, { evname, dates: [], byDiv: new Map() }).get(ev);
    E.dates.push(date);
    const D = E.byDiv.get(div) ?? E.byDiv.set(div, new Map()).get(div);
    const R = D.get(erid) ?? D.set(erid, { club: team, place, players: new Map() }).get(erid);
    if (score !== "Staff") R.players.set(p.epid, { num, epid: p.epid, name: p.name });
  }
}
for (const [ev, E] of early) {
  const div = [...E.byDiv.keys()].sort((a, b) => rank(a) - rank(b))[0];
  const [d, mo, y] = E.dates.map((s) => s.split("/")).sort((a, b) => (a[2] + a[1] + a[0]).localeCompare(b[2] + b[1] + b[0]))[0];
  const label = E.evname.replace(/^PSP\s*-\s*/i, "").replace(/^PSP\s+/i, "");
  const key = `${y}|PSP ${label}`;
  const teams = {};
  let field = 0, champion = null;
  for (const R of E.byDiv.get(div).values()) {
    const [, r, n] = R.place.match(/(\d+)\D+of (\d+)/) || [];
    field = Math.max(field, Number(n) || 0);
    teams[R.club] = { w: 0, l: 0, t: 0, finishRank: Number(r) || null, finish: Number(r) === 1 ? "Winner" : "Unknown" };
    if (Number(r) === 1) champion = R.club;
    for (const p of R.players.values()) add(p, key, R.club);
    /* The 2004 World Cup is the one early event whose public rosters survive — union them in. */
  }
  if (ev === "75") {
    const links = topRosterLinks(gz(`${ARCHIVE}/raw/event/75/teams.html.gz`));
    for (const [club, rid] of links) for (const p of rosterPlayers(rid)) add(p, key, Object.keys(teams).find((c) => c.toLowerCase() === club.toLowerCase()) ?? club);
  }
  if (Object.keys(teams).length !== field) warnings.notes.push(`${key}: ${Object.keys(teams).length} teams recovered, league says ${field}`);
  events.push({ key, league: "PSP", pbleaguesId: ev, year: y, label, start: iso(y, mo, d), fieldSize: field, champion, pickemEventId: null,
    division: div, results: false, teams, matches: [] });
}

// ---- 2. 2006-2015, from the public pages ----------------------------------------
for (const id of fs.readdirSync(`${ARCHIVE}/raw/event`).sort((a, b) => a - b)) {
  if (EXCLUDED[id] || PROFILE_EVENTS.has(id)) continue;
  const teamsHtml = gz(`${ARCHIVE}/raw/event/${id}/teams.html.gz`);
  if (!teamsHtml) { warnings.notes.push(`event ${id}: no saved pages`); continue; }
  const meta = eventMeta(id);
  const key = `${meta.year}|PSP ${meta.label}`;
  const rk = rankings(teamsHtml);
  const ranked = new Map(rk.rows.map((r) => [r.team, r.rank]));
  const sched = proGames(gz(`${ARCHIVE}/raw/event/${id}/schedule.html.gz`), { keepUnscored: UNSCORED_WINNER_FROM_PLACINGS.has(id) })
    .filter((m) => ranked.has(m.teamA) && ranked.has(m.teamB));
  const notes = [];
  if (PLACINGS_ONLY.has(id)) {
    notes.push(`Placings only: ${sched.length} Pro games survive (one prelim group, plus an unscored final); all dropped so no team gets a partial record`);
    sched.length = 0;
  }
  for (const m of sched) if (m.scoreA == null) {
    m.winner = ranked.get(m.teamA) < ranked.get(m.teamB) ? m.teamA : m.teamB;
    notes.push(`${m.teamA} v ${m.teamB} (${m.round}): no score recorded; winner ${m.winner} taken from the league placings`);
  }
  if (SERIES_BRACKET.has(id)) {
    const mins = (t) => { const x = String(t || "").match(/(\d+):(\d+)\s*([AP]M)/); return x ? (Number(x[1]) % 12 + (x[3] === "PM" ? 12 : 0)) * 60 + Number(x[2]) : 0; };
    const day = (d) => Number((String(d).match(/(\d{1,2}) \w{3}/) || [])[1] || 0);
    const ko = sched.filter((m) => m.round === "Finals").sort((x, y) => day(x.date) - day(y.date) || mins(x.time) - mins(y.time) || x.id - y.id);
    const series = new Map(); // pair -> games, in the order the series started
    for (const m of ko) { const k = [m.teamA, m.teamB].sort().join("|"); (series.get(k) ?? series.set(k, []).get(k)).push(m); }
    const seen = new Map(), out = new Set();
    for (const games of series.values()) {
      const [a, b] = [games[0].teamA, games[0].teamB];
      const na = seen.get(a) ?? 0, nb = seen.get(b) ?? 0;
      const round = na === 0 && nb === 0 ? "Quarters" : out.has(a) && out.has(b) ? "3rd Place" : Math.max(na, nb) === 1 ? "Semifinals" : "Final";
      games.forEach((m, i) => { m.round = `${round} G${i + 1}`; });
      const wins = new Map();
      for (const m of games) { const w = m.scoreA > m.scoreB ? m.teamA : m.teamB; wins.set(w, (wins.get(w) ?? 0) + 1); }
      const winner = [...wins].sort((x, y) => y[1] - x[1])[0][0];
      for (const m of games) m.seriesWinner = winner;
      seen.set(a, na + 1); seen.set(b, nb + 1); out.add(winner === a ? b : a);
    }
    notes.push(`Knockout rounds were best-of-3 series (labelled "Finals" on pbleagues); each game is listed as "<Round> G<n>" and counts as a match`);
  }
  if (SUNDAY_SIX.has(id)) {
    let n = 0;
    for (const m of sched) if (m.round === "Quarters" || m.round === "Semifinals") { m.round = "1/6"; n++; }
    notes.push(`Six teams made Sunday and played two round-robin groups of three (${n} games, labelled "${id === "604" ? "Quarters" : "Semifinals"}" on pbleagues); listed as "1/6". Each group's best team reached the final — on margin where all three went 1-1`);
  }
  if (RELEGATION_EVENTS.has(id)) {
    const main = new Set(sched.filter((m) => /^(Quarters|Semifinals|Finals)$/.test(m.round)).flatMap((m) => [m.teamA, m.teamB]));
    let n = 0;
    for (const m of sched) if (/^(Ochos|1\/16|1\/32)$/.test(m.round) && !main.has(m.teamA) && !main.has(m.teamB)) { m.round = "Relegation"; n++; }
    if (n) notes.push(`${n} relegation games among the bottom Pro teams (labelled "${"Ochos/1-16/1-32"}" on pbleagues) are listed as Relegation — they count in win-loss but not as making Sunday`);
  }
  if (PLACEMENT_EVENTS.has(id)) {
    const main = new Set(sched.filter((m) => /^(Quarters|Semifinals|Finals)$/.test(m.round)).flatMap((m) => [m.teamA, m.teamB]));
    let n = 0;
    for (const m of sched) if (/^(Ochos|1\/16|1\/32)$/.test(m.round) && !main.has(m.teamA) && !main.has(m.teamB)) { m.round = "Placement"; n++; }
    if (n) notes.push(`${n} placement games for 9th-16th (labelled "1/32", "1/16" and "Ochos" on pbleagues) are listed as Placement — they count in win-loss but not as making Sunday`);
  }
  if (FINALS_BY_PLACING.has(id)) {
    for (const m of sched) {
      if (m.round !== "Finals") continue;
      const pair = [ranked.get(m.teamA), ranked.get(m.teamB)].sort((x, y) => x - y).join("v");
      if (pair === "1v2") m.round = "Final";
      else if (pair === "3v4") m.round = "3rd Place";
      else warnings.notes.push(`${key}: "Finals" game ${m.teamA} v ${m.teamB} is neither #1v#2 nor #3v#4`);
    }
    const byPair = new Map();
    for (const m of sched) {
      if (/prelim/i.test(m.round ?? "")) continue;
      const k = `${m.round}|${[m.teamA, m.teamB].sort().join("|")}`;
      (byPair.get(k) ?? byPair.set(k, []).get(k)).push(m);
    }
    let series = false;
    for (const games of byPair.values()) {
      if (games.length < 2) continue;
      series = true;
      games.sort((x, y) => x.id - y.id);
      const wins = new Map();
      for (const m of games) { const w = m.scoreA > m.scoreB ? m.teamA : m.teamB; wins.set(w, (wins.get(w) ?? 0) + 1); }
      const winner = [...wins].sort((x, y) => y[1] - x[1])[0][0];
      games.forEach((m, i) => { m.round = `${m.round} G${i + 1}`; m.seriesWinner = winner; });
    }
    notes.push(series
      ? `Knockout rounds were best-of-3 series; each game is listed as "<Round> G<n>" and counts as a match. A 3rd-place game ("Finals" on pbleagues) was told apart from the final by the league placings`
      : `Two games are labelled "Finals" on pbleagues: the final (#1 v #2) and a 3rd-place game (#3 v #4), told apart by the league placings`);
  }
  if (BRACKET_BY_ELIMINATION.has(id)) {
    const mins = (t) => { const x = String(t || "").match(/(\d+):(\d+)\s*([AP]M)/); return x ? (Number(x[1]) % 12 + (x[3] === "PM" ? 12 : 0)) * 60 + Number(x[2]) : 0; };
    const day = (d) => Number((String(d).match(/(\d{1,2}) \w{3}/) || [])[1] || 0);
    const ko = sched.filter((m) => m.round === "Finals").sort((x, y) => day(x.date) - day(y.date) || mins(x.time) - mins(y.time) || x.id - y.id);
    const played = new Map(), out = new Set();
    for (const m of ko) {
      const na = played.get(m.teamA) ?? 0, nb = played.get(m.teamB) ?? 0;
      m.round = na === 0 && nb === 0 ? "Quarters" : out.has(m.teamA) && out.has(m.teamB) ? "3rd Place" : Math.max(na, nb) === 1 ? "Semifinals" : "Final";
      played.set(m.teamA, na + 1); played.set(m.teamB, nb + 1);
      const w = m.winner ?? (m.scoreA > m.scoreB ? m.teamA : m.teamB);
      out.add(w === m.teamA ? m.teamB : m.teamA);
    }
    notes.push(`Every Sunday game is labelled "Finals" on pbleagues; quarters/semis/final rebuilt by elimination and checked against the league placings`);
  }
  const scheduled = new Set(sched.flatMap((m) => [m.teamA, m.teamB]));
  /* Champions vs Challengers: a ranked team that never played the main Pro schedule is not Pro. */
  let pro = [...ranked.keys()];
  /* Only an event that actually ran a Challengers division can have ranked teams who aren't
     Pro. 2008 World Cup has no Challengers but half its prelims are missing, and an
     unconditional drop threw out five Pro teams — the champion among them. */
  const hasChallengers = /data-division="[^"]*Challeng/i.test(gz(`${ARCHIVE}/raw/event/${id}/schedule.html.gz`));
  if (sched.length && hasChallengers) {
    const outside = pro.filter((t) => !scheduled.has(t));
    if (outside.length) { warnings.rankingNotInSchedule.push(`${key}: dropped ${outside.length} (${outside.join(", ")})`); pro = pro.filter((t) => scheduled.has(t)); }
  }
  const year = meta.year;
  const seriesWinner = new Map(); // match row -> who won its series (B2)
  const matches = sched.map((m) => {
    const round = PSP_ROUND[m.round] ?? m.round;
    if (KNOCKOUT_DEPTH[baseRound(round)] == null && !NEUTRAL_ROUNDS.has(baseRound(round)) && !/prelim/i.test(round ?? "")) warnings.unknownRounds.push(`${key}: "${m.round}" ${m.teamA} v ${m.teamB}`);
    const [, dd, mon] = String(m.date).match(/(\d{1,2}) (\w{3})/) || [];
    /* An unscored game carries its winner as a 7th element; its score stays null. */
    const row = [round, dd ? iso(year, MONTH[mon], dd) : null, m.teamA, m.teamB, m.scoreA, m.scoreB];
    if (m.seriesWinner) seriesWinner.set(row, m.seriesWinner);
    if (m.winner) row.push(m.winner);
    return row;
  });

  // Score exactly as build.mjs does.
  const rec = new Map(pro.map((c) => [c, { w: 0, l: 0, t: 0, deepest: null }]));
  let champion = null;
  const finals = matches.filter((m) => m[0] === "Final");
  const seriesFinal = matches.some((m) => /^Final G\d+$/.test(m[0]));
  for (const matchRow of matches) {
    const [round, , a, b, sa, sb, winner] = matchRow;
    const A = rec.get(a), B = rec.get(b);
    if (!A || !B) continue;
    const aWon = winner ? winner === a : sa > sb;
    const bWon = winner ? winner === b : sb > sa;
    if (aWon) { A.w++; B.l++; } else if (bWon) { B.w++; A.l++; } else { A.t++; B.t++; }
    const depth = KNOCKOUT_DEPTH[baseRound(round)];
    if (depth != null) {
      for (const t of [A, B]) t.deepest = t.deepest == null ? depth : Math.min(t.deepest, depth);
      if (baseRound(round) === "Final") champion = seriesWinner.get(matchRow) ?? (aWon ? a : b);
    }
  }
  const rank1 = rk.rows.find((r) => r.rank === 1 && pro.includes(r.team))?.team ?? null;
  /* A round-robin "Finals" (2006-07) has no single deciding game — the league table decides. */
  if (finals.length > 1) champion = rank1;
  if (seriesFinal && champion !== rank1) warnings.championMismatch.push(`${key}: Final series won by ${champion}, league rank 1 is ${rank1}`);
  if (finals.length === 1 && champion !== rank1) warnings.championMismatch.push(`${key}: Final won by ${champion}, league rank 1 is ${rank1}`);
  if (!matches.length) champion = rank1;
  if (FINISH_FROM_PLACINGS.has(id)) notes.push("No Pro games survive; finishes inferred from the league placings using the 2006 format (8-team Sunday knockout)");

  const teams = {};
  for (const [club, r] of rec) {
    const stage = Object.keys(KNOCKOUT_DEPTH).find((k) => KNOCKOUT_DEPTH[k] === r.deepest);
    const f = FINISH_FROM_PLACINGS.has(id) ? { label: placingFinish(ranked.get(club)) }
      : club === champion ? FINISH.winner : (!matches.length ? { rank: null, label: "Unknown" } : stage ? FINISH[stage] : FINISH.prelims);
    teams[club] = { w: r.w, l: r.l, t: r.t, finishRank: ranked.get(club) ?? f.rank, finish: f.label };
  }
  /* Rank among the Pro teams only — the 2013 table ranks Challengers alongside them. */
  /* Only renumber where Challengers were removed; elsewhere keep the league's own numbers,
     ties included (2008 World Cup has two teams at #3, #5 and #6). */
  if (pro.length < ranked.size) {
    const order = [...pro].sort((a, b) => (ranked.get(a) ?? 99) - (ranked.get(b) ?? 99));
    order.forEach((c, i) => { teams[c].finishRank = i + 1; });
  }

  const links = topRosterLinks(teamsHtml);
  for (const club of pro) {
    const rid = links.get(club);
    const players = rid ? rosterPlayers(rid) : [];
    if (!players.length) warnings.noRoster.push(`${key}: ${club}`);
    for (const p of players) add(p, key, club);
  }
  events.push({ key, league: "PSP", pbleaguesId: id, year, label: meta.label, start: meta.start, fieldSize: pro.length, champion, pickemEventId: null,
    division: rk.division, results: matches.length > 0, finishInferred: FINISH_FROM_PLACINGS.has(id) || undefined,
    notes: notes.length ? notes : undefined, teams, matches });
}

events.sort((a, b) => (a.start || "").localeCompare(b.start || ""));

// ---- 3. One name per team (EDGE_CASES.md F) ----------------------------------------
/**
 * pbleagues files every roster under a permanent team id, whatever name the team entered
 * under that season, and each team's page lists that history. `team-names.json` is built
 * from those pages (archive checks/team_names.py): a team that carried on into NXL takes
 * its NXL club name ("San Diego Dynasty", "DYNASTY" -> "Dynasty"), a PSP-only team its
 * shared core name, and the three that were neither were James's call. The entered name
 * is kept as `rosterName`.
 */
const TEAM_NAMES = JSON.parse(fs.readFileSync(new URL("./team-names.json", import.meta.url), "utf8"));
/**
 * Then James's merges of teams pbleagues keeps under different ids (EDGE_CASES.md F2) —
 * each flagged for expert review, and marked on the entry as `merged`.
 */
const MERGES = new Map(JSON.parse(fs.readFileSync(new URL("./team-merges.json", import.meta.url), "utf8")).merges.map((x) => [x.from, x]));
const renameOf = new Map(); // event key -> (entered name -> club)
const mergedEntry = new Set(); // "eventKey|club" that came from a merge
for (const e of events) {
  const m = new Map();
  for (const club of Object.keys(e.teams)) {
    const hit = TEAM_NAMES[`${e.pbleaguesId}|${club}`];
    const named = hit ? hit.club : club;
    const merge = MERGES.get(named);
    if (merge) mergedEntry.add(`${e.key}|${merge.to}`);
    const final = merge ? merge.to : named;
    if (final !== club) m.set(club, final);
  }
  const target = [...Object.keys(e.teams)].map((c) => m.get(c) ?? c);
  if (new Set(target).size !== target.length) throw new Error(`${e.key}: two teams would share one name`);
  if (!m.size) continue;
  renameOf.set(e.key, m);
  const to = (c) => m.get(c) ?? c;
  e.teams = Object.fromEntries(Object.entries(e.teams).map(([c, t]) => {
    const club = to(c);
    const out = m.has(c) ? { ...t, rosterName: c } : t;
    if (mergedEntry.has(`${e.key}|${club}`)) out.merged = "needs expert review";
    return [club, out];
  }));
  if (e.champion) e.champion = to(e.champion);
  e.matches = e.matches.map((r) => { const x = [...r]; x[2] = to(x[2]); x[3] = to(x[3]); if (x.length > 6) x[6] = to(x[6]); return x; });
}
for (const map of [appear, appearEpid]) {
  for (const list of map.values()) for (const a of list) { const m = renameOf.get(a[0]); if (m?.has(a[1])) a[1] = m.get(a[1]); }
}
const data = {
  generated: new Date().toISOString(),
  league: "PSP",
  sources: { archive: ARCHIVE },
  clubTeamId: {},
  events,
  appearances: Object.fromEntries(appear),
  appearancesByEpid: Object.fromEntries(appearEpid),
  names,
  warnings,
};

// ---- report ----------------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
console.log(`\nPSP history: ${events.length} events, ${appear.size} players by numeric id + ${appearEpid.size} by profile only\n`);
for (const e of events) {
  const sundays = Object.values(e.teams).filter((t) => ["Winner", "Runner-up", "Semi-finals", "1/6", "Quarter-finals", "Ochos", "Wildcard"].includes(t.finish)).length;
  const players = [...appear.values(), ...appearEpid.values()].filter((l) => l.some(([k]) => k === e.key)).length;
  console.log(`${pad(e.key, 38)} ${pad(e.results ? "results" : "NO RESULTS", 10)} teams ${pad(e.fieldSize, 3)} matches ${pad(e.matches.length, 3)} players ${pad(players, 4)} champion ${pad(e.champion ?? "-", 24)} sundays ${e.results ? sundays : "-"}`);
}
for (const [k, v] of Object.entries(warnings)) if (v.length) { console.log(`\n${k} (${v.length}):`); for (const x of v) console.log("   " + x); }
console.log("\nExcluded:"); for (const [id, why] of Object.entries(EXCLUDED)) console.log(`   ${id}: ${why}`);

if (process.argv.includes("--write")) {
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log(`\nWrote ${OUT} - ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
} else console.log("\nNo --write flag, so nothing was written.");
