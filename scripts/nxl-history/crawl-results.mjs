/**
 * Match results and final rankings for one NXL event, from pbleagues.
 *
 *   node scripts/nxl-history/crawl-results.mjs 9320
 *   node scripts/nxl-history/crawl-results.mjs 9320 --xlsx out.xlsx
 *
 * WHY THIS EXISTS. Match results reach us today through a workbook somebody updates by
 * hand, which is fine for a season that has finished and useless while an event is being
 * played. pbleagues publishes the same results as the games end, so this is the path to
 * career pages that update during an event rather than days after it.
 *
 * TWO PAGES, and only two:
 *   /event/{id}/schedule   every match — teams, score, round, kickoff
 *   /event/{id}/rankings   the final placing of every team, including the ones that
 *                          never reached the bracket
 *
 * The second is the one the workbook cannot give us at all: it records how far a team GOT,
 * so 479 of 964 team-events in our own history have no placing. The league ranks everyone.
 *
 * COST. The schedule page is the whole event in one request — no per-match fetches, because
 * the score is on the row. Lone Star 2026 is 95KB; a finished event with every division on
 * it reaches 2.4MB, which is why the division filter runs before anything is parsed.
 */

import { writeFileSync } from "node:fs";

const BASE = "https://pbleagues.com";
const UA = { "User-Agent": "Mozilla/5.0 (nxl-results-crawler)" };
const DELAY_MS = 120;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(path) {
  const res = await fetch(BASE + path, { headers: UA });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  await sleep(DELAY_MS);
  return res.text();
}

/**
 * Pro X-Ball only, and the heading is not one fixed string.
 *
 * "Pro X-Ball", "Pro X-Ball™", "Championship - Pro X-Ball" all qualify; "Pro X-Ball 3v3",
 * "Semi-Pro" and the women's division do not. Same test the roster crawler uses — keep them
 * in step, because a division slipping through here would quietly add another league's
 * matches to a player's record.
 */
const isPro = (h) =>
  /Pro X-Ball/i.test(h) && !/Semi-?Pro/i.test(h) && !/3v3/i.test(h) && !/WNXL|Women|Female/i.test(h);

/** Collapse an HTML fragment to plain text. */
const text = (h) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/**
 * Every Pro match on the schedule page.
 *
 * PARSED FROM THE MARKUP'S OWN STRUCTURE, not from the order text happens to appear in.
 * A first attempt stripped the tags and guessed which cells were teams, and it read the
 * field name and a leftover `data-id` attribute as team names — the block starts mid-tag,
 * so its own attributes are inside it.
 *
 * A schedule row is a DUAL: two matches sharing one block, and the classes say which is
 * which.
 *
 *   team1_name       / team2_name        the first match
 *   dual_team1_name  / dual_team2_name   the second
 *   .score1 > .s1,.s2                    the first match's score
 *   .score2 > .s1,.s2                    the second's
 *
 * A block with no `dual_` teams is a single match and yields one row.
 */
export function parseSchedule(html, { teams = null } = {}) {
  const all = [...html.matchAll(/<div class="match[^"]*"[^>]*id="match-(\d+)"([\s\S]*?)(?=<div class="match |<\/body>)/g)];

  /**
   * ONE Pro competition per event, not every division whose name contains "Pro X-Ball".
   *
   * The World Cup runs two. In 2025 the schedule carries `Pro X-Ball™` — 24 teams, the NXL
   * season's field — alongside a separate `Pro X-Ball` of another 24, the international
   * bracket with Manawatu Titans and Wyldside Distortion in it. Both pass a name test, and
   * taking both handed us 87 matches where the workbook has 57.
   *
   * So the divisions are grouped by their exact name and the LARGEST is the event's Pro
   * competition. That also gathers the finals, which sit under a truncated `Pro X-Ball™|`
   * but share the first segment.
   */
  const groups = new Map();
  for (const b of all) {
    const division = ((b[2].match(/data-division="([^"]*)"/) || [])[1] || "").split("|")[0];
    if (!isPro(division)) continue;
    (groups.get(division) ?? groups.set(division, []).get(division)).push(b);
  }
  const blocks = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  const out = [];

  const teamBy = (body, cls) => {
    const m = body.match(new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*data-team="([^"]*)"`))
      ?? body.match(new RegExp(`data-team="([^"]*)"[^>]*class="[^"]*\\b${cls}\\b[^"]*"`));
    return m ? m[1].trim() : null;
  };
  const scoreBy = (body, cls) => {
    const block = body.match(new RegExp(`<div class="${cls}([^"]*)"[^>]*>([\\s\\S]*?)<\\/div>`));
    if (!block) return null;
    const nums = [...block[2].matchAll(/<span class="s[12][^"]*"[^>]*>\s*(\d+)\s*<\/span>/g)].map((m) => Number(m[1]));
    if (nums.length < 2) return null;
    return { a: nums[0], b: nums[1], approved: /\bapproved\b/.test(block[1]) };
  };

  for (const [, blockId, body] of blocks) {
    const division = ((body.match(/data-division="([^"]*)"/) || [])[1] || "").split("|")[0];
    if (!isPro(division)) continue;

    const date = (body.match(/data-date="([^"]*)"/) || [])[1] ?? null;
    const time = (body.match(/<div class="startTime"[^>]*>\s*([^<]*?)\s*</) || [])[1] ?? null;

    /*
     * The round is an attribute, and the GROUP is pipe-separated across the dual.
     *
     *   <div class="round" data-round="Prelims" data-group="C|D">
     *
     * so the first match is C Prelims and the second is D Prelims. Reading the visible text
     * instead does not work: it is split across lines around a stats-link icon, which is
     * why the first attempt found nothing. Bracket rounds carry no group and stand alone.
     */
    const roundName = (body.match(/<div class="round"[^>]*data-round="([^"]*)"/) || [])[1] ?? null;
    const groups = ((body.match(/<div class="round"[^>]*data-group="([^"]*)"/) || [])[1] ?? "")
      .split("|")
      .map((g) => g.trim());
    const roundFor = (i) =>
      roundName ? [groups[i], roundName].filter(Boolean).join(" ") : null;

    /* The per-match stats page id, for the point-level crawl this does not yet do. */
    const statIds = [...body.matchAll(/action=stats&(?:amp;)?id=(\d+)/g)].map((m) => m[1]);

    const pairs = [
      { teamA: teamBy(body, "team1_name"), teamB: teamBy(body, "team2_name"), score: scoreBy(body, "score1"), round: roundFor(0), matchId: statIds[0] ?? null },
      { teamA: teamBy(body, "dual_team1_name"), teamB: teamBy(body, "dual_team2_name"), score: scoreBy(body, "score2"), round: roundFor(1), matchId: statIds[1] ?? null },
    ];

    for (const p of pairs) {
      if (!p.teamA || !p.teamB || !p.score) continue;
      /*
       * A schedule ROW can pair two matches from DIFFERENT divisions, and `data-division`
       * names only the first — so a Pro-labelled block whose dual partner is a women's
       * 3v3 game yields "Femmes Fatale 4-3 Dallas Vibe" under Pro X-Ball. The division
       * attribute cannot catch that; the event's own Pro ranking table can, because it
       * lists exactly the teams that competed.
       */
      if (teams && (!teams.has(p.teamA) || !teams.has(p.teamB))) continue;
      out.push({
        blockId,
        matchId: p.matchId,
        division,
        date,
        time,
        round: p.round ?? null,
        teamA: p.teamA,
        teamB: p.teamB,
        scoreA: p.score.a,
        scoreB: p.score.b,
        /* An unplayed match posts 0-0; `approved` is the league marking it final. */
        played: p.score.a + p.score.b > 0,
        approved: p.score.approved,
      });
    }
  }
  return out;
}

/**
 * The final placing of every team in the Pro division.
 *
 * Each division is its own `<div class="ranking" data-division="...">` carrying one table
 * of rank / team / points — the same `data-division` attribute the schedule uses, so the
 * Pro filter is the one test in both places.
 *
 * ⚠️ THIS IS THE NUMBER THE WORKBOOK HAS NEVER HAD. It records how far a team got, so 479
 * of 964 team-events in our history carry no placing at all. The league ranks everyone,
 * including the teams knocked out in the prelims.
 */
export function parseRankings(html) {
  const divisions = [...html.matchAll(/<div class="ranking"[^>]*data-division="([^"]*)"([\s\S]*?)(?=<div class="ranking"|<\/body>)/g)];
  for (const [, division, body] of divisions) {
    if (!isPro(division)) continue;
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .map(([, tr]) => [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(([, c]) => text(c)))
      .filter((cells) => cells.length >= 3 && /^\d{1,2}$/.test(cells[0]))
      .map(([rank, team, points]) => ({ rank: Number(rank), team, points: Number(points.replace(/[^\d]/g, "")) || 0 }));
    if (rows.length) return { division, rows };
  }
  return { division: null, rows: [] };
}

export async function crawlEvent(eventId) {
  const [schedule, rankings] = [
    await fetchText(`/event/${eventId}/schedule`),
    await fetchText(`/event/${eventId}/rankings`),
  ];
  const name = (schedule.match(/<title>\s*Schedule:\s*([^|<]*)/) || [])[1]?.trim() ?? `event ${eventId}`;
  const ranked = parseRankings(rankings);
  /* The ranking table is the event's team list, and the only reliable one. */
  const teams = ranked.rows.length ? new Set(ranked.rows.map((r) => r.team)) : null;
  return { eventId, name, matches: parseSchedule(schedule, { teams }), division: ranked.division, rankings: ranked.rows };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const eventId = process.argv[2];
  if (!eventId) { console.error("usage: crawl-results.mjs <pbleagues event id> [--xlsx file]"); process.exit(1); }
  const data = await crawlEvent(eventId);
  console.log(`\n${data.name}  (pbleagues event ${eventId})`);
  console.log(`  Pro matches : ${data.matches.length}  (${data.matches.filter((m) => m.played).length} played)`);
  console.log(`  ranked teams: ${data.rankings.length}`);
  console.log(`\n  first matches:`);
  data.matches.slice(0, 5).forEach((m) =>
    console.log(`    ${String(m.round ?? "?").padEnd(14)} ${m.teamA} ${m.scoreA}-${m.scoreB} ${m.teamB}`),
  );
  console.log(`\n  top of the ranking:`);
  data.rankings.slice(0, 5).forEach((r) => console.log(`    ${String(r.rank).padStart(2)}  ${r.team.padEnd(26)} ${r.points} pts`));
  const out = process.argv.includes("--xlsx") ? process.argv[process.argv.indexOf("--xlsx") + 1] : null;
  if (out) { writeFileSync(out.replace(/\.xlsx$/, ".json"), JSON.stringify(data, null, 2)); console.log(`\nraw JSON -> ${out.replace(/\.xlsx$/, ".json")}`); }
}
