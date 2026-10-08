/**
 * Reading match results off pbleagues, for the live event crawl.
 *
 * A CommonJS port of `scripts/nxl-history/crawl-results.mjs`, which cannot be imported
 * here: that file is an ES module and the functions runtime is CommonJS. The two must stay
 * in step — the offline reconciliation is what proves this parser correct, and it found
 * 2,374 of 2,393 historic matches exactly.
 *
 * TWO PAGES PER EVENT, and no per-match fetches: the score sits on the schedule row.
 *   /event/{id}/schedule   teams, score, round, kickoff, and whether the score is approved
 *   /event/{id}/rankings   the Pro field, which doubles as the team allowlist below
 *
 * Three traps, each of which cost real time offline and all of which are handled here:
 *
 *   1. A World Cup runs TWO Pro competitions. In 2025 `Pro X-Ball™` is the NXL field and a
 *      separate `Pro X-Ball` is the international bracket; both pass a name test, and
 *      taking both gave 87 matches where the truth was 57. The largest division wins.
 *   2. A schedule ROW pairs two matches — a "dual" — and `data-division` names only the
 *      first, so a Pro-labelled row can carry a women's 3v3 game as its partner. No
 *      division attribute catches that; the ranking table's team list does.
 *   3. The round is an ATTRIBUTE, with the group pipe-separated across the dual:
 *      `data-round="Prelims" data-group="C|D"` is C Prelims and D Prelims. The visible
 *      text is split around an icon and cannot be read.
 */

const isPro = (h) =>
  /Pro X-Ball/i.test(h) && !/Semi-?Pro/i.test(h) && !/3v3/i.test(h) && !/WNXL|Women|Female/i.test(h);

const text = (h) =>
  String(h)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** The Pro division's full placing table — also the authoritative list of who competed. */
function parseRankings(html) {
  const divisions = [
    ...html.matchAll(
      /<div class="ranking"[^>]*data-division="([^"]*)"([\s\S]*?)(?=<div class="ranking"|<\/body>)/g,
    ),
  ];
  for (const [, division, body] of divisions) {
    if (!isPro(text(division))) continue;
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .map(([, tr]) => [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(([, c]) => text(c)))
      .filter((c) => c.length >= 3 && /^\d{1,2}$/.test(c[0]) && /[A-Za-z]/.test(c[1]))
      .map(([rank, team, points]) => ({
        rank: Number(rank),
        team,
        points: Number(String(points).replace(/\D/g, "")) || 0,
      }));
    if (rows.length) return { division: text(division), rows };
  }
  return { division: null, rows: [] };
}

/**
 * Every Pro match on the schedule page.
 *
 * `teams` is the allowlist from the ranking table. Without it a dual's cross-division
 * partner is indistinguishable from a real Pro match.
 */
function parseSchedule(html, { teams = null } = {}) {
  const all = [
    ...html.matchAll(
      /<div class="match[^"]*"[^>]*id="match-(\d+)"([\s\S]*?)(?=<div class="match |<\/body>)/g,
    ),
  ];

  const groups = new Map();
  for (const b of all) {
    const division = ((b[2].match(/data-division="([^"]*)"/) || [])[1] || "").split("|")[0];
    if (!isPro(division)) continue;
    if (!groups.has(division)) groups.set(division, []);
    groups.get(division).push(b);
  }
  const blocks = [...groups.values()].sort((a, b) => b.length - a.length)[0] || [];

  const teamBy = (body, cls) => {
    const m =
      body.match(new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*data-team="([^"]*)"`)) ||
      body.match(new RegExp(`data-team="([^"]*)"[^>]*class="[^"]*\\b${cls}\\b[^"]*"`));
    return m ? m[1].trim() : null;
  };
  const scoreBy = (body, cls) => {
    const block = body.match(new RegExp(`<div class="${cls}([^"]*)"[^>]*>([\\s\\S]*?)<\\/div>`));
    if (!block) return null;
    const nums = [...block[2].matchAll(/<span class="s[12][^"]*"[^>]*>\s*(\d+)\s*<\/span>/g)].map(
      (m) => Number(m[1]),
    );
    if (nums.length < 2) return null;
    /* `approved` is the league marking the result final. An unplayed match has no class. */
    return { a: nums[0], b: nums[1], approved: /\bapproved\b/.test(block[1]) };
  };

  const out = [];
  for (const [, blockId, body] of blocks) {
    const division = ((body.match(/data-division="([^"]*)"/) || [])[1] || "").split("|")[0];
    const date = (body.match(/data-date="([^"]*)"/) || [])[1] || null;
    const time = (body.match(/<div class="startTime"[^>]*>\s*([^<]*?)\s*</) || [])[1] || null;
    const state = (body.match(/<div class="matchState([^"]*)"/) || [])[1] || "";
    const roundName = (body.match(/<div class="round"[^>]*data-round="([^"]*)"/) || [])[1] || null;
    const groupsAttr = ((body.match(/<div class="round"[^>]*data-group="([^"]*)"/) || [])[1] || "")
      .split("|")
      .map((g) => g.trim());
    const roundFor = (i) => (roundName ? [groupsAttr[i], roundName].filter(Boolean).join(" ") : null);
    const statIds = [...body.matchAll(/action=stats&(?:amp;)?id=(\d+)/g)].map((m) => m[1]);

    const pairs = [
      {
        teamA: teamBy(body, "team1_name"),
        teamB: teamBy(body, "team2_name"),
        score: scoreBy(body, "score1"),
        round: roundFor(0),
        matchId: statIds[0] || null,
      },
      {
        teamA: teamBy(body, "dual_team1_name"),
        teamB: teamBy(body, "dual_team2_name"),
        score: scoreBy(body, "score2"),
        round: roundFor(1),
        matchId: statIds[1] || null,
      },
    ];

    for (const p of pairs) {
      if (!p.teamA || !p.teamB || !p.score) continue;
      if (teams && (!teams.has(p.teamA) || !teams.has(p.teamB))) continue;
      out.push({
        blockId,
        matchId: p.matchId,
        division,
        date,
        time,
        state: state.trim(),
        round: p.round,
        teamA: p.teamA,
        teamB: p.teamB,
        scoreA: p.score.a,
        scoreB: p.score.b,
        approved: p.score.approved,
        played: p.score.a + p.score.b > 0,
      });
    }
  }
  return out;
}

/**
 * Crawler club name -> the name our history uses, where no suffix or prefix match works.
 *
 * Ported from scripts/nxl-history/clubs.mjs and kept deliberately identical. Without it
 * "TonTon Arsenal" resolves to nothing: it neither equals, ends with, nor starts with
 * "TonTons", so the club falls through and an entire team's results vanish from the
 * overlay without a word. That happened once here already.
 *
 * "Arsenal" names two unrelated clubs and this map must never be inverted - Baltimore Revo
 * became Baltimore Arsenal in 2025, while the French TonTons became TonTon Arsenal in 2026.
 */
const CRAWLER_TEAM_ALIAS = {
  "Baltimore Revo": "Arsenal",
  "TonTon FSU": "TonTons",
  "TonTon Arsenal": "TonTons",
};

/**
 * Resolve a crawled club name against our vocabulary.
 *
 * Returns null rather than the raw name when nothing matches, so the caller can COUNT the
 * failures instead of silently filing results under a club that does not exist. A silent
 * fallback is how TonTons went missing from a whole event.
 */
function resolveClub(name, clubs) {
  const aliased = CRAWLER_TEAM_ALIAS[name] || name;
  return (
    clubs.find((c) => aliased === c) ||
    clubs.find((c) => aliased.endsWith(` ${c}`)) ||
    clubs.find((c) => aliased.startsWith(`${c} `)) ||
    null
  );
}

module.exports = { isPro, parseSchedule, parseRankings, CRAWLER_TEAM_ALIAS, resolveClub };
