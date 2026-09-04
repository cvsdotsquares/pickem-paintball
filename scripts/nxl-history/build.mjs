/**
 * Build `functions/data/nxlHistory.json` — the NXL win/loss record, 2015–2026.
 *
 *   node scripts/nxl-history/build.mjs          # report only, writes nothing
 *   node scripts/nxl-history/build.mjs --write
 *
 * WHY A COMMITTED FILE RATHER THAN A COLLECTION
 * This is static reference data about tournaments that have already happened. It changes
 * three or four times a year, when an event finishes and the workbook is updated. Putting
 * it in Firestore would add ~2,400 document reads to every projection rebuild to fetch
 * numbers that had not moved; committing it means the diff is reviewable, the Cloud
 * Function reads it for free, and a bad import is a revert rather than a migration.
 *
 * TWO INPUTS, JOINED
 *   1. Power Rankings workbook, `5. Historic Results (Input)` — every match played,
 *      2015–2026, with scores. The league is the authority on who won.
 *   2. `Player_Roster_Historic.csv` from the pbleagues crawler — who was on which team
 *      at which event, keyed on the permanent numeric player id.
 *
 * The join is team-and-event WITHIN A YEAR, which is what makes it safe: the field is
 * only ~20 clubs wide in any season, so a suffix match is unambiguous where a global one
 * would not be. Everything the automatic pass cannot pair is named in clubs.mjs with the
 * evidence for it, and anything left over fails the run rather than being dropped.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It does not attempt per-point lineups. pbleagues carries them only for 2023 and about
 * half of 2025-26, so a "matches actually played" figure would be blank for most of a
 * career. A player is credited with their team's results at events they took the field
 * for; `participation` decides that, downstream, from our own data.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import {
  CLUB_TEAM_ID,
  CRAWLER_TEAM_ALIAS,
  EVENTS_WITHOUT_RESULTS,
  EVENT_ALIAS,
  PICKEM_EVENT_ID,
} from "./clubs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");

const FIXTURES = "/Users/jamesgreen/Documents/PickEm Paintball/historic data/NXL_Power_Rankings_2026_v17.xlsx";
const ROSTERS = "/Users/jamesgreen/Documents/nxl-pro-players/Player_Roster_Historic.csv";
const OUT = path.join(REPO, "functions/data/nxlHistory.json");

/**
 * Knockout depth, shallowest number = deepest run.
 *
 * 2015-2017 had no Ochos round; a team's finish is read from the deepest round it
 * actually appears in, so a format change needs no special case. A bye straight into
 * the quarters is likewise just an absence from the Ochos.
 */
const KNOCKOUT_DEPTH = { Final: 1, Semifinals: 2, Quarters: 3, Ochos: 4 };

/**
 * Where a run ended, and the position that implies.
 *
 * There is no third-place match in this format, so the two beaten semi-finalists are
 * joint third and no tournament produces a distinct 3rd place. That is why the page
 * counts top-four finishes rather than podiums.
 */
const FINISH = {
  winner: { rank: 1, label: "Winner" },
  Final: { rank: 2, label: "Runner-up" },
  Semifinals: { rank: 3, label: "Semi-finals" },
  Quarters: { rank: 5, label: "Quarter-finals" },
  Ochos: { rank: 9, label: "Ochos" },
  prelims: { rank: null, label: "Prelims" },
};

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** Event names, with the league prefix and any year stripped so the two sources meet. */
const normEvent = (s) => norm(String(s ?? "").replace(/\bNXL\b/gi, "").replace(/\b20\d\d\b/g, ""));

const iso = (v) => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const m = String(v ?? "").match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
};

/** Minimal RFC-4180 reader — names can carry commas and a positional split loses them. */
function readCsv(file) {
  const text = fs.readFileSync(file, "utf8").split("\r\n").join("\n").trim();
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  row.push(cell); rows.push(row);
  const head = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

// -- 1. Matches, grouped into events ------------------------------------------

function loadEvents() {
  const wb = XLSX.readFile(FIXTURES, { cellDates: true });
  const raw = XLSX.utils.sheet_to_json(wb.Sheets["5. Historic Results (Input)"], {
    range: 2, defval: null, raw: true,
  });

  const events = new Map(); // "{year}|{label}" -> event
  const badRounds = [];

  for (const r of raw) {
    const year = String(r.Year ?? "").trim();
    const label = String(r.Event ?? "").trim();
    const round = String(r.Round ?? "").trim();
    const a = String(r["Team 1"] ?? "").trim();
    const b = String(r["Team 2"] ?? "").trim();
    if (!year || !label || !a || !b) continue;

    /**
     * A Round cell we cannot read is a PRELIM, not a row to drop.
     *
     * The 2022 World Cup carries eight rows whose Round holds a corrupted date. Dropping
     * them lost eight real results, so the evidence was checked instead: adding them back
     * gives every one of the 24 teams exactly 3 or 4 group games, which is a complete
     * stage — six of them are the top seeds' own group (Dynasty, Heat, Impact, TonTons,
     * who play no other prelim), and two are play-ins for teams that then appear in the
     * Ochos. None of the eight is a knockout tie.
     *
     * Treating them as prelims is therefore conservative in the only direction that
     * matters: they count towards win/loss, and can never invent a bracket finish. Any
     * such row is still reported, so a NEW unreadable round gets looked at rather than
     * quietly absorbed.
     */
    const known = KNOCKOUT_DEPTH[round] != null || /prelim/i.test(round);
    if (!known) badRounds.push({ year, label, round, a, b });

    const key = `${year}|${label}`;
    if (!events.has(key)) {
      events.set(key, { key, year, label, matches: [], teams: new Set() });
    }
    const ev = events.get(key);
    ev.matches.push({
      round,
      date: iso(r.Date),
      a, b,
      sa: Number(r["Score 1"]),
      sb: Number(r["Score 2"]),
    });
    ev.teams.add(a); ev.teams.add(b);
  }
  return { events, badRounds };
}

/** Per-team record and finishing position at one event. */
function scoreEvent(ev) {
  const rec = new Map(); // club -> {w,l,t,deepest}
  const take = (club) => {
    if (!rec.has(club)) rec.set(club, { w: 0, l: 0, t: 0, deepest: null });
    return rec.get(club);
  };

  let champion = null;
  for (const m of ev.matches) {
    const A = take(m.a), B = take(m.b);
    if (m.sa > m.sb) { A.w++; B.l++; }
    else if (m.sb > m.sa) { B.w++; A.l++; }
    else { A.t++; B.t++; }

    const depth = KNOCKOUT_DEPTH[m.round];
    if (depth != null) {
      for (const t of [A, B]) t.deepest = t.deepest == null ? depth : Math.min(t.deepest, depth);
      if (m.round === "Final") champion = m.sa > m.sb ? m.a : m.b;
    }
  }

  const teams = {};
  for (const [club, r] of rec) {
    const stage = Object.keys(KNOCKOUT_DEPTH).find((k) => KNOCKOUT_DEPTH[k] === r.deepest);
    const f = club === champion ? FINISH.winner : (stage ? FINISH[stage] : FINISH.prelims);
    teams[club] = { w: r.w, l: r.l, t: r.t, finishRank: f.rank, finish: f.label };
  }
  return { teams, champion };
}

// -- 2. Roster appearances, joined to those events -----------------------------

/**
 * Pair the crawler's team names to the fixture list's, one season at a time.
 *
 * MANY crawler names may map to ONE fixture club: a club is routinely listed under two
 * names inside a single season (San Diego Aftermath and ASG Aftermath both appear in
 * 2023, sharing 10 of 12 players). The reverse is never allowed — two fixture clubs
 * collapsing into one crawler name would silently merge two teams' records.
 */
function resolveTeams(fixtureTeams, crawlerTeams) {
  const map = new Map(); // crawler name -> fixture name
  const left = [];

  for (const c of crawlerTeams) {
    const aliased = CRAWLER_TEAM_ALIAS[c];
    if (aliased && fixtureTeams.includes(aliased)) { map.set(c, aliased); continue; }
    const nc = norm(c);
    const exact = fixtureTeams.filter((f) => norm(f) === nc || nc.endsWith(norm(f)));
    if (exact.length === 1) { map.set(c, exact[0]); continue; }
    const loose = fixtureTeams.filter((f) => nc.includes(norm(f)) || norm(f).includes(nc));
    if (loose.length === 1) { map.set(c, loose[0]); continue; }
    left.push({ crawler: c, candidates: exact.length ? exact : loose });
  }

  const covered = new Set(map.values());
  return { map, unresolvedCrawler: left, unmatchedFixture: fixtureTeams.filter((f) => !covered.has(f)) };
}

function resolveEvents(year, fixtureLabels, crawlerLabels) {
  const map = new Map(); // crawler label -> fixture label
  const left = [];
  const aliasTargets = new Map(
    Object.entries(EVENT_ALIAS)
      .filter(([k]) => k.startsWith(`${year}|`))
      .map(([k, v]) => [v, k.slice(year.length + 1)]),
  );

  for (const c of crawlerLabels) {
    const aliased = aliasTargets.get(c);
    if (aliased && fixtureLabels.includes(aliased)) { map.set(c, aliased); continue; }
    const nc = normEvent(c);
    const exact = fixtureLabels.filter((f) => normEvent(f) === nc);
    if (exact.length === 1) { map.set(c, exact[0]); continue; }
    const loose = fixtureLabels.filter((f) => nc.includes(normEvent(f)) || normEvent(f).includes(nc));
    if (loose.length === 1) { map.set(c, loose[0]); continue; }
    left.push(c);
  }
  const covered = new Set(map.values());
  return { map, unresolvedCrawler: left, unmatchedFixture: fixtureLabels.filter((f) => !covered.has(f)) };
}

// -- 3. Build ------------------------------------------------------------------

function build() {
  const { events, badRounds } = loadEvents();
  const roster = readCsv(ROSTERS);

  const warnings = { badRounds, byYear: [], noResults: [], coachOnly: 0, noNumericId: 0 };

  const fixtureByYear = new Map();
  for (const ev of events.values()) {
    if (!fixtureByYear.has(ev.year)) fixtureByYear.set(ev.year, []);
    fixtureByYear.get(ev.year).push(ev);
  }

  const crawlerByYear = new Map();
  for (const r of roster) {
    if (!crawlerByYear.has(r.year)) crawlerByYear.set(r.year, []);
    crawlerByYear.get(r.year).push(r);
  }

  // year -> { events: Map(crawlerLabel->fixtureLabel), teams: Map(crawlerTeam->club) }
  const lookup = new Map();
  const knownGaps = new Set(EVENTS_WITHOUT_RESULTS);

  for (const [year, rows] of crawlerByYear) {
    const evs = fixtureByYear.get(year) ?? [];
    const fixtureLabels = evs.map((e) => e.label);
    const fixtureTeams = [...new Set(evs.flatMap((e) => [...e.teams]))];
    const crawlerLabels = [...new Set(rows.map((r) => r.event))];
    const crawlerTeams = [...new Set(rows.map((r) => r.team))];

    const E = resolveEvents(year, fixtureLabels, crawlerLabels);
    const T = resolveTeams(fixtureTeams, crawlerTeams);

    const unexplainedEvents = E.unresolvedCrawler.filter((c) => !knownGaps.has(`${year}|${c}`));
    warnings.byYear.push({
      year,
      unresolvedEvents: unexplainedEvents,
      unmatchedFixtureEvents: E.unmatchedFixture,
      unresolvedTeams: T.unresolvedCrawler,
      unmatchedFixtureTeams: T.unmatchedFixture,
    });
    for (const c of E.unresolvedCrawler) {
      if (knownGaps.has(`${year}|${c}`)) warnings.noResults.push(`${year} ${c}`);
    }
    lookup.set(year, { events: E.map, teams: T.map });
  }

  // Per-event records.
  const out = [];
  for (const ev of events.values()) {
    const { teams, champion } = scoreEvent(ev);
    const dates = ev.matches.map((m) => m.date).filter(Boolean).sort();
    out.push({
      key: ev.key,
      year: ev.year,
      label: ev.label,
      start: dates[0] ?? null,
      fieldSize: ev.teams.size,
      champion,
      pickemEventId: PICKEM_EVENT_ID[ev.key] ?? null,
      teams,
      matches: ev.matches.map((m) => [m.round, m.date, m.a, m.b, m.sa, m.sb]),
    });
  }
  out.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "") || a.key.localeCompare(b.key));

  // Appearances, keyed on the permanent numeric player id.
  const appearances = new Map();
  const names = new Map();
  for (const r of roster) {
    if (r.role !== "Player") { warnings.coachOnly++; continue; }
    if (!r.numeric_id) { warnings.noNumericId++; continue; }
    const L = lookup.get(r.year);
    const fixtureLabel = L?.events.get(r.event);
    const club = L?.teams.get(r.team);
    if (!fixtureLabel || !club) continue; // an event with no results, already reported
    const key = `${r.year}|${fixtureLabel}`;
    if (!events.has(key)) continue;
    if (!appearances.has(r.numeric_id)) appearances.set(r.numeric_id, new Map());
    appearances.get(r.numeric_id).set(key, club);
    names.set(r.numeric_id, r.name);
  }

  /**
   * Chronological, oldest first — the order a career reads in.
   *
   * The crawler emits rows grouped by event id, which is neither alphabetical nor
   * chronological, so an unsorted list put Tampa Bay third in a 2025 season it opened.
   * Sorting here rather than downstream keeps every consumer honest about sequence
   * without each one having to re-derive it.
   */
  const startOf = new Map(out.map((e) => [e.key, e.start ?? ""]));
  const appearanceOut = {};
  for (const [id, m] of appearances) {
    appearanceOut[id] = [...m]
      .sort((a, b) => (startOf.get(a[0]) ?? "").localeCompare(startOf.get(b[0]) ?? ""))
      .map(([k, club]) => [k, club]);
  }

  return {
    generated: new Date().toISOString(),
    sources: { fixtures: path.basename(FIXTURES), rosters: path.basename(ROSTERS) },
    clubTeamId: CLUB_TEAM_ID,
    events: out,
    appearances: appearanceOut,
    warnings,
    names: Object.fromEntries(names),
  };
}

// -- 4. Report -----------------------------------------------------------------

const data = build();
const w = data.warnings;

console.log(`\nEvents with results   ${data.events.length}`);
console.log(`Matches               ${data.events.reduce((a, e) => a + e.matches.length, 0)}`);
console.log(`Players with a record ${Object.keys(data.appearances).length}`);
console.log(`Appearances joined    ${Object.values(data.appearances).reduce((a, x) => a + x.length, 0)}`);
console.log(`Coach rows skipped    ${w.coachOnly}`);
console.log(`No numeric id         ${w.noNumericId}`);

let hard = 0;
for (const y of w.byYear) {
  const problems = [
    y.unresolvedEvents.length && `events unpaired: ${y.unresolvedEvents.join(", ")}`,
    y.unmatchedFixtureEvents.length && `fixture events with no roster: ${y.unmatchedFixtureEvents.join(", ")}`,
    y.unresolvedTeams.length && `teams unpaired: ${y.unresolvedTeams.map((t) => t.crawler).join(", ")}`,
    y.unmatchedFixtureTeams.length && `fixture teams with no roster: ${y.unmatchedFixtureTeams.join(", ")}`,
  ].filter(Boolean);
  if (problems.length) { hard++; console.log(`\n  ${y.year}  ${problems.join("\n        ")}`); }
}

if (w.noResults.length) {
  console.log(`\nKnown gaps (rostered, no results in the workbook):`);
  w.noResults.forEach((e) => console.log(`  ${e}`));
}
if (w.badRounds.length) {
  console.log(`\nRows with an unreadable Round, counted as prelims:`);
  w.badRounds.forEach((r) => console.log(`  ${r.year} ${r.label}  "${String(r.round).slice(0, 24)}"  ${r.a} v ${r.b}`));
}

if (hard) {
  console.error(`\n${hard} season(s) did not resolve cleanly. Fix scripts/nxl-history/clubs.mjs before writing.\n`);
  process.exit(1);
}

console.log(`\nChampions, most recent six:`);
for (const e of data.events.slice(-6)) console.log(`  ${e.year} ${e.label.padEnd(22)} ${e.champion ?? "-"}`);

if (!process.argv.includes("--write")) {
  console.log(`\nNo --write flag, so nothing was written.\n`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data));
console.log(`\nWrote ${OUT} - ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB\n`);
