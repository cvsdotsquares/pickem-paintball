/**
 * Final placings for every NXL event, from pbleagues.
 *
 *   node scripts/nxl-history/crawl-rankings.mjs                 # crawl + report
 *   node scripts/nxl-history/crawl-rankings.mjs --out file.json # and save
 *
 * Our workbook records how FAR a team got, so it ranks the bracket and nothing else —
 * exactly half of every field, every year. pbleagues ranks all of them, 1 to N, back to
 * 2015. This fetches one page per event and writes a fixture `build.mjs` can merge.
 *
 * THE JOIN IS CONFIRMED BY RESULTS, NOT BY NAMES.
 *
 * Matching our event to theirs on the label is the fragile path this project keeps being
 * bitten by — "Open" for the season opener, "Tamp Bay Open" for a typo, "Atlantic City
 * Major" for an event the workbook filed by venue. So names only NARROW the field, and a
 * mapping is accepted only when the crawled champion and the crawled field size both
 * match what we already hold. Two independent facts agreeing is a far stronger claim than
 * any string comparison, and an event that cannot be confirmed is reported rather than
 * guessed at.
 *
 * ⚠️ `/event/{id}/rankings` is the EVENT's placing; `/event/{id}/seasonRankings` is the
 * season table, and the league page links the latter using an arbitrary event's id. They
 * look alike — both are 20 rows of team and points — and confusing them would silently
 * file season standings as an event result.
 */

import { writeFileSync } from "node:fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const HISTORY = require("../../functions/data/nxlHistory.json");
const { CRAWLER_TEAM_ALIAS, EVENT_ALIAS } = await import("./clubs.mjs");

const BASE = "https://pbleagues.com";
const UA = { "User-Agent": "Mozilla/5.0 (nxl-rankings-crawler)" };
const DELAY_MS = 140;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isPro = (h) =>
  /Pro X-Ball/i.test(h) && !/Semi-?Pro/i.test(h) && !/3v3/i.test(h) && !/WNXL|Women|Female/i.test(h);

const clean = (h) =>
  h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();

async function get(path) {
  const r = await fetch(BASE + path, { headers: UA });
  await sleep(DELAY_MS);
  return r.ok ? r.text() : null;
}

/** Every event on the league page, grouped by the season heading it sits under. */
async function listEvents() {
  const html = await get("/leagues/316");
  const out = [];
  for (const part of html.split(/<td class="bold" colspan="2">/).slice(1)) {
    const year = (part.match(/^\s*(20\d\d)/) || [])[1];
    if (!year) continue;
    const seen = new Set();
    for (const [, id, path, label] of part.matchAll(/href="\/event\/(\d+)([^"]*)"[^>]*>([\s\S]{0,150}?)<\/a>/g)) {
      if (/seasonRankings/.test(path)) continue;
      const name = clean(label);
      if (!name || /Season Rankings/i.test(name) || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, year, name });
    }
  }
  return out;
}

/** The Pro division's full placing table for one event. */
export function parseRankings(html) {
  const divisions = [...html.matchAll(/<div class="ranking"[^>]*data-division="([^"]*)"([\s\S]*?)(?=<div class="ranking"|<\/body>)/g)];
  for (const [, division, body] of divisions) {
    if (!isPro(clean(division))) continue;
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .map(([, tr]) => [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(([, c]) => clean(c)))
      .filter((c) => c.length >= 3 && /^\d{1,2}$/.test(c[0]) && /[A-Za-z]/.test(c[1]))
      .map(([rank, team, points]) => ({ rank: Number(rank), team, points: Number(points.replace(/\D/g, "")) || 0 }));
    if (rows.length) return { division: clean(division), rows };
  }
  return null;
}

/**
 * Crawler's long club name -> the short name the workbook uses.
 *
 * The vocabulary is every club the WORKBOOK names, not `clubTeamId`. That map holds only
 * the 27 clubs with a PickEm team, so a club that folded before PickEm existed — Thunder,
 * Outlaws, Topgun — is absent from it, and 94 team-events went unmapped on the first run.
 */
const CLUBS = [...new Set(HISTORY.events.flatMap((e) => Object.keys(e.teams ?? {})))]
  /* Longest first: "Red Legion" must win over "Legion" when both could suffix-match. */
  .sort((a, b) => b.length - a.length);
const short = (name) => {
  const a = CRAWLER_TEAM_ALIAS[name] ?? name;
  /*
   * The city can sit on either end. "Tampa Bay Damage" carries it in front; the European
   * clubs carry it behind — "Lucky 15s Staffordshire", "Virst Factory Lodz". Exact first,
   * then either edge, longest club name first so "Red Legion" is preferred over "Legion".
   */
  return (
    CLUBS.find((c) => a === c) ??
    CLUBS.find((c) => a.endsWith(` ${c}`)) ??
    CLUBS.find((c) => a.startsWith(`${c} `)) ??
    a
  );
};

const norm = (s) =>
  s.toLowerCase().replace(/\bnxl\b/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

const main = async () => {
  const listed = await listEvents();
  console.log(`league page: ${listed.length} events across ${new Set(listed.map((e) => e.year)).size} seasons\n`);

  /* Crawl every listed event once; the join then works on results rather than on names. */
  const crawled = [];
  for (const e of listed) {
    const html = await get(`/event/${e.id}/rankings`);
    const r = html && parseRankings(html);
    if (!r) continue;
    const champion = short(r.rows.find((x) => x.rank === 1)?.team ?? "");
    crawled.push({ ...e, division: r.division, rows: r.rows, champion, size: r.rows.length });
  }
  console.log(`crawled a Pro table for ${crawled.length} of them\n`);

  const results = [];
  const unmatched = [];
  for (const ev of HISTORY.events) {
    const sameYear = crawled.filter((c) => c.year === ev.year);
    /* Confirmation: the champion AND the field size must both agree. */
    let hits = sameYear.filter((c) => c.champion === ev.champion && c.size === ev.fieldSize);
    let how = "champion + field size";

    /*
     * Two events a year can share a champion AND a field size — the same twenty clubs
     * attend everything, so PaintballFIT winning both Tampa Bay and Atlantic City in 2025
     * makes those two indistinguishable on results alone. Names break the tie, and where
     * the workbook's name is not the league's, `EVENT_ALIAS` already records which is
     * which: the 2022 Atlantic City Major is the league's Mid-Atlantic Major, filed by
     * venue, and "Tamp Bay Open" is a typo.
     */
    if (hits.length > 1) {
      const alias = EVENT_ALIAS[`${ev.year}|${ev.label}`];
      const target = norm(alias ?? ev.label);
      const byName = hits.filter((c) => {
        const n = norm(c.name);
        return n === target || n.includes(target) || target.includes(n);
      });
      if (byName.length === 1) { hits = byName; how = alias ? "champion + field size + EVENT_ALIAS" : "champion + field size + name"; }
    }
    if (hits.length === 1) {
      results.push({ key: ev.key, year: ev.year, label: ev.label, pbleaguesId: hits[0].id,
        pbleaguesName: hits[0].name, confirmedBy: how, fieldSize: ev.fieldSize,
        champion: ev.champion, rankings: hits[0].rows.map((r) => ({ rank: r.rank, team: short(r.team), crawledTeam: r.team, points: r.points })) });
    } else {
      unmatched.push({ key: ev.key, champion: ev.champion, fieldSize: ev.fieldSize,
        candidates: sameYear.map((c) => `${c.id} ${c.name} champ=${c.champion} n=${c.size}`) });
    }
  }

  console.log(`CONFIRMED  ${results.length} of ${HISTORY.events.length} events`);
  console.log(`UNMATCHED  ${unmatched.length}`);
  for (const u of unmatched) {
    console.log(`\n  ${u.key}  (ours: champion=${u.champion}, field=${u.fieldSize})`);
    u.candidates.slice(0, 6).forEach((c) => console.log(`      candidate: ${c}`));
    if (!u.candidates.length) console.log(`      no crawled event that year`);
  }

  const outAt = process.argv.indexOf("--out");
  if (outAt > 0 && process.argv[outAt + 1]) {
    writeFileSync(process.argv[outAt + 1], JSON.stringify({ crawledAt: new Date().toISOString(), events: results, unmatched }, null, 2));
    console.log(`\n-> ${process.argv[outAt + 1]}`);
  }
};

await main();
