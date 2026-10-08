/**
 * Every match, crawl versus workbook, across all 51 events.
 *
 *   node scripts/nxl-history/reconcile-matches.mjs --json out.json
 *
 * The workbook is what the site has always been built from and it carries hand corrections
 * — a Round cell fixed, a score put right. The crawl is the candidate replacement, so the
 * question is not "do they roughly agree" but "where exactly do they differ, and which is
 * right". Every difference is listed rather than counted.
 *
 * A match is identified by its unordered team pair within an event, so the sides being
 * swapped between sources is not a difference. That means a pair meeting TWICE in one event
 * is ambiguous, and those are reported separately instead of being matched arbitrarily.
 */

import { writeFileSync } from "node:fs";
import { createRequire } from "module";
import { parseSchedule } from "./crawl-results.mjs";

const require = createRequire(import.meta.url);
const HISTORY = require("../../functions/data/nxlHistory.json");
const FIXTURE = require("./fixtures/event-rankings.json");
const { CRAWLER_TEAM_ALIAS } = await import("./clubs.mjs");

const UA = { "User-Agent": "Mozilla/5.0 (nxl-reconcile)" };
const CLUBS = [...new Set(HISTORY.events.flatMap((e) => Object.keys(e.teams ?? {})))].sort((a, b) => b.length - a.length);
const short = (n) => {
  const a = CRAWLER_TEAM_ALIAS[n] ?? n;
  return CLUBS.find((c) => a === c) ?? CLUBS.find((c) => a.endsWith(` ${c}`)) ?? CLUBS.find((c) => a.startsWith(`${c} `)) ?? a;
};
const pair = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Prelims are one bucket; bracket rounds keep their name.
 *
 * The two sources name prelims differently — the workbook by group ("A Prelims"), the
 * crawl by group too but not always the same letter, and a handful of 2022 rows carry a
 * corrupted number. None of that distinguishes a match, so it all collapses to "prelims",
 * which is enough to tell a group game from a quarter-final when a pair met twice.
 */
const normRound = (r) => {
  const k = String(r ?? "").trim().toLowerCase();
  if (!k || /prelim/.test(k) || /^\d+$/.test(k)) return "prelims";
  if (/^top ?8$/.test(k) || k === "quarters") return "quarters";
  if (/^top ?4$/.test(k) || k === "semifinals") return "semifinals";
  if (/^finals?$/.test(k)) return "final";
  return k.replace(/\s+/g, "");
};
const key = (a, b, round) => `${pair(a, b)}@${normRound(round)}`;
const score = (a, b, sa, sb) => (a < b ? `${sa}-${sb}` : `${sb}-${sa}`);

const rows = [];
const summary = [];
for (const ev of FIXTURE.events) {
  const ours = HISTORY.events.find((e) => e.key === ev.key);
  const res = await fetch(`https://pbleagues.com/event/${ev.pbleaguesId}/schedule`, { headers: UA });
  await new Promise((r) => setTimeout(r, 150));
  if (!res.ok) { summary.push({ key: ev.key, error: `HTTP ${res.status}` }); continue; }

  /* The crawled ranking names every team that competed — use it to reject other divisions. */
  const allow = new Set(ev.rankings.map((r) => r.crawledTeam));
  const crawled = parseSchedule(await res.text(), { teams: allow })
    .filter((m) => m.played)
    .map((m) => ({ p: key(short(m.teamA), short(m.teamB), m.round), s: score(short(m.teamA), short(m.teamB), m.scoreA, m.scoreB), round: m.round }));
  const mine = (ours.matches ?? []).map(([round, , a, b, sa, sb]) => ({ p: key(a, b, round), s: score(a, b, sa, sb), round }));

  /* Group by pair so a repeated fixture is visible rather than silently mismatched. */
  const group = (list) => {
    const m = new Map();
    for (const x of list) (m.get(x.p) ?? m.set(x.p, []).get(x.p)).push(x);
    return m;
  };
  const C = group(crawled);
  const O = group(mine);

  let agree = 0;
  const diffs = [];
  for (const [p, os] of O) {
    const cs = C.get(p) ?? [];
    if (os.length > 1 || cs.length > 1) {
      /* Same pair, same round, twice — genuinely indistinguishable. Compare as multisets. */
      const a = os.map((x) => x.s).sort().join(" & ");
      const b = cs.map((x) => x.s).sort().join(" & ");
      if (a === b) { agree += os.length; continue; }
      diffs.push({ type: "same pair and round twice", pair: p, ours: a, crawl: b });
      continue;
    }
    if (!cs.length) { diffs.push({ type: "only in workbook", pair: p, ours: os[0].s, crawl: "" }); continue; }
    if (cs[0].s !== os[0].s) { diffs.push({ type: "score differs", pair: p, ours: os[0].s, crawl: cs[0].s }); continue; }
    agree++;
  }
  for (const [p, cs] of C) if (!O.has(p)) diffs.push({ type: "only in crawl", pair: p, ours: "", crawl: cs.map((x) => x.s).join(" & ") });

  summary.push({ key: ev.key, year: ev.year, ours: mine.length, crawl: crawled.length, agree, diffs: diffs.length });
  for (const d of diffs) rows.push({ key: ev.key, year: ev.year, ...d });
  process.stdout.write(`\r  ${summary.length}/${FIXTURE.events.length} events…`);
}

console.log("\n");
const totOurs = summary.reduce((s, x) => s + (x.ours ?? 0), 0);
const totCrawl = summary.reduce((s, x) => s + (x.crawl ?? 0), 0);
const totAgree = summary.reduce((s, x) => s + (x.agree ?? 0), 0);
console.log(`events            ${summary.length}`);
console.log(`matches: workbook ${totOurs}   crawl ${totCrawl}   agreeing ${totAgree}`);
console.log(`differences       ${rows.length}\n`);
const byType = {};
for (const r of rows) byType[r.type] = (byType[r.type] ?? 0) + 1;
for (const [t, n] of Object.entries(byType)) console.log(`  ${t.padEnd(20)} ${n}`);
console.log("");
for (const r of rows.slice(0, 25)) console.log(`  ${r.key.padEnd(26)} ${r.type.padEnd(18)} ${r.pair.padEnd(28)} ours=${r.ours || "—"} crawl=${r.crawl || "—"}`);
if (rows.length > 25) console.log(`  … ${rows.length - 25} more`);

const at = process.argv.indexOf("--json");
if (at > 0 && process.argv[at + 1]) {
  writeFileSync(process.argv[at + 1], JSON.stringify({ summary, differences: rows }, null, 2));
  console.log(`\n-> ${process.argv[at + 1]}`);
}
