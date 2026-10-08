/**
 * Does the pbleagues crawl agree with the history we already hold?
 *
 *   node scripts/nxl-history/validate-crawl.mjs 9320 "2026|Midwest Open"
 *
 * The workbook is the source today and the crawl is the candidate replacement, so the only
 * question worth asking is whether they describe the same tournament. Three checks:
 *
 *   1. every match in the workbook appears in the crawl, with the same score
 *   2. every match in the crawl appears in the workbook
 *   3. the finishes agree — and where they cannot, that the DISAGREEMENT is the expected one
 *
 * ⚠️ (3) WILL NOT MATCH EXACTLY, BY DESIGN. Our `finishRank` is standard competition
 * ranking, so both beaten semi-finalists are joint 3rd. pbleagues publishes a strict
 * ordering, so one of them is 3rd and the other 4th. A "mismatch" there is the two systems
 * doing different things correctly, and the check reports it as such rather than as an
 * error.
 */

import { createRequire } from "module";
import { crawlEvent } from "./crawl-results.mjs";
import { CRAWLER_TEAM_ALIAS } from "./clubs.mjs";

const require = createRequire(import.meta.url);
const HISTORY = require("../../functions/data/nxlHistory.json");

const eventId = process.argv[2];
const key = process.argv[3];
if (!eventId || !key) { console.error('usage: validate-crawl.mjs <pbleagues id> "<year|label>"'); process.exit(1); }

/** Crawler's long club name -> the short name the workbook and our rosters use. */
const short = (name) => {
  const aliased = CRAWLER_TEAM_ALIAS[name] ?? name;
  const clubs = Object.keys(HISTORY.clubTeamId ?? {});
  return clubs.find((c) => aliased === c) ?? clubs.find((c) => aliased.endsWith(c)) ?? aliased;
};

const data = await crawlEvent(eventId);
const event = (HISTORY.events ?? []).find((e) => e.key === key);
if (!event) { console.error(`No event "${key}" in nxlHistory.json`); process.exit(1); }
/* `matches` is a tuple array: [round, date, teamA, teamB, scoreA, scoreB]. */
const ours = (event.matches ?? []).map(([round, date, a, b, sa, sb]) => ({ round, date, a, b, sa, sb }));
const finishes = event.teams ?? {};

console.log(`\n${data.name} (pbleagues ${eventId})  vs  ${key}\n`);
console.log(`  crawl : ${data.matches.length} Pro matches, ${data.rankings.length} ranked teams`);
console.log(`  ours  : ${ours.length} matches, ${Object.keys(finishes).length} teams\n`);

/* A match is the unordered team pair plus the unordered score — the sides can be swapped. */
const sig = (a, b, sa, sb) => (a < b ? `${a}|${b}|${sa}-${sb}` : `${b}|${a}|${sb}-${sa}`);
const crawlSigs = new Map();
for (const m of data.matches) {
  if (!m.played) continue;
  crawlSigs.set(sig(short(m.teamA), short(m.teamB), m.scoreA, m.scoreB), m);
}
const ourSigs = new Map();
for (const m of ours) ourSigs.set(sig(m.a, m.b, m.sa, m.sb), m);

const missingFromCrawl = [...ourSigs.keys()].filter((k) => !crawlSigs.has(k));
const missingFromOurs = [...crawlSigs.keys()].filter((k) => !ourSigs.has(k));

console.log(`  MATCHES`);
console.log(`    in both                 ${[...ourSigs.keys()].filter((k) => crawlSigs.has(k)).length}`);
console.log(`    ours, not in the crawl  ${missingFromCrawl.length}`);
missingFromCrawl.slice(0, 8).forEach((k) => console.log(`        ${k}`));
console.log(`    crawl, not in ours      ${missingFromOurs.length}`);
missingFromOurs.slice(0, 8).forEach((k) => console.log(`        ${k}`));

console.log(`\n  FINISHES  (ours is competition ranking; theirs is a strict order)`);
const rows = data.rankings.map((r) => ({ ...r, club: short(r.team) }));
for (const r of rows) {
  const t = finishes[r.club];
  const flag = !t
    ? "⚠️  club not in ours"
    : t.finishRank == null
      ? `ours: ${t.finish} (no rank)`
      : t.finishRank === r.rank
        ? `= ${t.finish}`
        : `ours ${t.finishRank} (${t.finish})`;
  console.log(`    ${String(r.rank).padStart(2)}  ${r.club.padEnd(16)} ${String(r.points).padStart(4)} pts   ${flag}`);
}

/* --json <path> dumps the comparison for the workbook builder. */
const jsonAt = process.argv.indexOf("--json");
if (jsonAt > 0 && process.argv[jsonAt + 1]) {
  const { writeFileSync } = await import("node:fs");
  const ourBySig = new Map([...ourSigs.entries()]);
  writeFileSync(
    process.argv[jsonAt + 1],
    JSON.stringify(
      {
        eventId,
        key,
        crawledName: data.name,
        division: data.division,
        crawledAt: new Date().toISOString(),
        matches: data.matches.map((m) => {
          const a = short(m.teamA);
          const b = short(m.teamB);
          const s = sig(a, b, m.scoreA, m.scoreB);
          return {
            round: m.round,
            date: m.date,
            teamACrawled: m.teamA,
            teamAShort: a,
            scoreA: m.scoreA,
            scoreB: m.scoreB,
            teamBCrawled: m.teamB,
            teamBShort: b,
            approved: m.approved,
            inOurs: ourBySig.has(s),
            matchId: m.matchId,
          };
        }),
        onlyInOurs: missingFromCrawl,
        rankings: rows.map((r) => {
          const t = finishes[r.club] ?? null;
          return {
            rank: r.rank,
            teamCrawled: r.team,
            teamShort: r.club,
            points: r.points,
            ourFinish: t?.finish ?? null,
            ourFinishRank: t?.finishRank ?? null,
            ourRecord: t ? `${t.w}-${t.l}${t.t ? `-${t.t}` : ""}` : null,
          };
        }),
      },
      null,
      2,
    ),
  );
  console.log(`\nJSON -> ${process.argv[jsonAt + 1]}`);
}
