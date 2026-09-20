/**
 * The live event overlay: crawled results for a tournament that is still being played.
 *
 * Career pages take their NXL record from `data/nxlHistory.json`, which is BAKED INTO THIS
 * DEPLOYMENT and built from a workbook by hand. That is fine for finished seasons and
 * useless during an event: we cannot redeploy every ten minutes, and for Lone Star 2026 the
 * workbook is never being updated at all.
 *
 * So this writes one Firestore document per live event, and `nxlCareer` merges it over the
 * baked-in history at read time. History stays frozen and fingerprinted; only this document
 * moves. Once the event is over it is blessed into the history file and deleted.
 *
 * CONVERGENT, NOT CAUTIOUS. Each pass writes the whole current view rather than appending,
 * so a result published a little early is corrected by the next pass ten minutes later.
 * That is the agreed trade: being roughly right within ten minutes beats being certain an
 * hour late, and it means matches APPEARING mid-event — the bracket does not exist on the
 * schedule until the prelims finish — needs no special handling.
 */

const { parseSchedule, parseRankings, resolveClub } = require("./pbleagues");
const HISTORY = require("./data/nxlHistory.json");

/** PickEm event id -> the pbleagues event to crawl for it. */
const PBLEAGUES_EVENT = {
  lone_star_open_2026: "9321",
};

const BASE = "https://pbleagues.com";
const UA = { "User-Agent": "Mozilla/5.0 (pickem-live-crawler)" };

/** Deepest round reached -> what we call that finish. Mirrors scripts/nxl-history/build.mjs. */
const KNOCKOUT_DEPTH = { Final: 1, Finals: 1, Semifinals: 2, Quarters: 3, Ochos: 4, Wildcard: 5 };
/* Depth 1 is the FINAL, whose two teams are not the same thing - the winner is resolved
   separately in scoreTeams. Labelling depth 1 "Runner-up" alone put the champion's own
   career page under Runner-up. */
const FINISH_LABEL = {
  1: "Runner-up",
  2: "Semi-finals",
  3: "Quarter-finals",
  4: "Ochos",
  5: "Wildcard",
};

const clubByTeamId = new Map(
  Object.entries(HISTORY.clubTeamId || {}).map(([club, id]) => [id, club]),
);

async function fetchText(path) {
  const res = await fetch(BASE + path, { headers: UA });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.text();
}

/**
 * Order the published time slots.
 *
 * The schedule lists matches chronologically and the date carries no year ("Friday, 18
 * Sep"), so parsing it into a real timestamp is more trouble than it is worth. First
 * appearance IS the running order, which is all the "a later slot has started" rule needs.
 */
function slotIndex(matches) {
  const order = new Map();
  for (const m of matches) {
    const key = `${m.date || ""} ${m.time || ""}`;
    if (!order.has(key)) order.set(key, order.size);
  }
  return order;
}

/**
 * Which matches count as finished.
 *
 * `approved` plus a real score is the floor — an unplayed match carries neither, verified
 * across a finished event (49 of 49 approved) and an unplayed one (0 of 40). On top of that
 * EITHER of two signals is enough, as agreed:
 *
 *   - the score has not moved since the previous pass, ten minutes ago
 *   - some match in a later time slot has a score, so this one's slot is done
 *
 * `previous` is last pass's scores, keyed the same way, so stability can be judged at all.
 */
function decideFinal(matches, previous) {
  const order = slotIndex(matches);

  /*
   * The latest slot that has actually started, judged by the slot ORDER rather than by
   * taking a maximum over whatever happens to have a score. A single early result in a
   * late slot must not retroactively declare every earlier slot finished - which is what
   * a naive max would do, and it would mark forty prelim games final off one stray score.
   */
  let latestStarted = -1;
  for (const m of matches) {
    if (!m.played) continue;
    const i = order.get(`${m.date || ""} ${m.time || ""}`);
    if (i == null) continue;
    /* Only advance one slot at a time: a slot counts as running when a match in it has a
       score, and we take the furthest such slot that is contiguous with the ones before. */
    if (i > latestStarted) latestStarted = i;
  }

  const firstPass = !previous || Object.keys(previous).length === 0;

  return matches.map((m) => {
    const key = matchKey(m);
    const slot = order.get(`${m.date || ""} ${m.time || ""}`);
    const eligible = m.played && m.approved;
    /*
     * Stability needs a previous pass to compare against. On the very first pass there is
     * none, so nothing can qualify that way - only the slot rule can, which is the safer
     * of the two and cannot be satisfied by a match that is still being played.
     */
    const wasSame =
      !firstPass && previous[key] != null && previous[key] === `${m.scoreA}-${m.scoreB}`;
    const laterSlotRunning = slot != null && latestStarted > slot;
    return { ...m, slot, final: Boolean(eligible && (wasSame || laterSlotRunning)) };
  });
}

const matchKey = (m) => `${m.round || "?"}|${m.teamA}|${m.teamB}`;

/** Crawler's long club name -> the short name our history uses. */
function shortClub(name, allowFrom) {
  const clubs = allowFrom;
  return (
    clubs.find((c) => name === c) ||
    clubs.find((c) => name.endsWith(` ${c}`)) ||
    clubs.find((c) => name.startsWith(`${c} `)) ||
    name
  );
}

/**
 * Who was at this event, from OUR roster rather than the league's.
 *
 * `nxlCareer` needs a player -> club appearance or the event never reaches a career page,
 * and that normally comes from the roster crawler, which is a manual step. The PickEm
 * roster already carries both a `league_id` and a `team_id` for every player, so the join
 * runs on IDS rather than on club names — which is what makes it safe. Joining on the name
 * would have silently dropped a whole team: our roster says "TonTon", the league says
 * "TonTons", and `nxlCareer` skips an unmatched club without a word.
 */
async function deriveAppearances(db, pickemEventId) {
  const snap = await db.collection(`events/${pickemEventId}/players`).get();
  const appearances = {};
  const unresolved = [];
  for (const d of snap.docs) {
    const leagueId = String(d.get("league_id") || "").trim();
    const teamId = d.get("team_id");
    if (!leagueId) continue;
    const club = clubByTeamId.get(teamId);
    if (!club) {
      unresolved.push(`${d.get("Player")} team_id=${teamId}`);
      continue;
    }
    appearances[leagueId] = club;
  }
  return { appearances, unresolved, rosterSize: snap.size };
}

/** Per-team record and finish, from the matches we consider final. */
function scoreTeams(finalMatches, clubOf) {
  const rec = new Map();
  const take = (club) => {
    if (!rec.has(club)) rec.set(club, { w: 0, l: 0, t: 0, deepest: null });
    return rec.get(club);
  };
  let champion = null;
  for (const m of finalMatches) {
    const a = clubOf(m.teamA);
    const b = clubOf(m.teamB);
    if (!a || !b) continue;
    const A = take(a);
    const B = take(b);
    if (m.scoreA > m.scoreB) { A.w++; B.l++; }
    else if (m.scoreB > m.scoreA) { B.w++; A.l++; }
    else { A.t++; B.t++; }
    const round = String(m.round || "").replace(/^[A-E] /, "");
    const depth = KNOCKOUT_DEPTH[round];
    if (depth != null) {
      for (const t of [A, B]) t.deepest = t.deepest == null ? depth : Math.min(t.deepest, depth);
      /* Whoever wins the final is the champion, and is not a runner-up. */
      if (depth === 1) champion = m.scoreA > m.scoreB ? a : b;
    }
  }
  const teams = {};
  for (const [club, r] of rec) {
    teams[club] = {
      w: r.w,
      l: r.l,
      t: r.t,
      finish:
        club === champion
          ? "Winner"
          : r.deepest != null
            ? FINISH_LABEL[r.deepest] || "Prelims"
            : "Prelims",
      /*
       * finishRank stays NULL while the event runs. The league publishes a ranking table
       * before a ball is thrown, so trusting it mid-event would show a finishing position
       * for a tournament nobody has finished. The proper build sets it afterwards.
       */
      /*
       * NULL FOR EVERYONE EXCEPT THE CHAMPION.
       *
       * The league publishes a ranking table before a ball is thrown, so trusting it
       * mid-event would show a finishing position for a tournament nobody has finished.
       * The champion is the one placing that IS known the moment the final ends, and it
       * has to be set because `titles` counts finishRank === 1 - without it a live
       * champion carries the "Winner" label and a career title count of zero.
       */
      finishRank: club === champion ? 1 : null,
    };
  }
  return { teams, champion };
}

/**
 * One pass: crawl the live event and write the overlay if anything moved.
 *
 * Returns what happened so the caller can log it and decide whether to mark the projection
 * stale. Writes nothing when the content is unchanged - a rebuild costs ~22,000 reads, and
 * triggering one every ten minutes for four days when nothing has happened would be pure
 * waste.
 */
async function crawlLiveEvent(db, { eventId, pbleaguesId, observeOnly = false }) {
  const overlayRef = db.doc(`liveEvents/${eventId}`);
  const before = await overlayRef.get();
  const previous = before.exists ? before.get("scores") || {} : {};

  const rankings = parseRankings(await fetchText(`/event/${pbleaguesId}/rankings`));
  const allow = rankings.rows.length ? new Set(rankings.rows.map((r) => r.team)) : null;
  const parsed = parseSchedule(await fetchText(`/event/${pbleaguesId}/schedule`), { teams: allow });

  const decided = decideFinal(parsed, previous);
  const finalMatches = decided.filter((m) => m.final);

  /* The club vocabulary our history uses, so crawled long names collapse onto it. */
  const clubs = [...new Set(HISTORY.events.flatMap((e) => Object.keys(e.teams || {})))].sort(
    (a, b) => b.length - a.length,
  );
  const clubOf = (name) => resolveClub(name, clubs);
  /*
   * Names the crawl used that our vocabulary cannot place. Reported, never swallowed: an
   * unresolved club silently drops that team's entire record, which is exactly how TonTons
   * vanished from a whole event here once already.
   */
  const unresolvedClubs = [
    ...new Set(parsed.flatMap((m) => [m.teamA, m.teamB]).filter((n) => !clubOf(n))),
  ];

  const { appearances, unresolved, rosterSize } = await deriveAppearances(db, eventId);
  const { teams, champion } = scoreTeams(finalMatches, clubOf);

  /* Every score we saw this pass, so the next one can judge stability. */
  const scores = {};
  for (const m of decided) if (m.played) scores[matchKey(m)] = `${m.scoreA}-${m.scoreB}`;

  const payload = {
    key: "2026|Lone Star",
    year: "2026",
    label: "Lone Star",
    pickemEventId: eventId,
    pbleaguesId,
    live: true,
    fieldSize: rankings.rows.length || Object.keys(teams).length,
    champion,
    teams,
    /**
     * ⚠️ OBJECTS, NOT TUPLES. Firestore rejects an array whose elements are themselves
     * arrays — "Nested arrays are not allowed" — so the `[round, date, a, b, sa, sb]`
     * form the history file uses cannot be stored. Same restriction that shaped
     * `matchLog` in `nxlHistory.js`, and short keys here for the same reason:
     * r = round, d = date, a/b = the two clubs, sa/sb = their scores.
     *
     * `loadLiveEvent` turns these back into tuples, so everything downstream still reads
     * an event shaped exactly like one from the history file.
     *
     * An empty overlay hid this: with no match final yet the array had no elements to
     * nest, so the first writes of an event succeed and every later one fails.
     */
    matches: finalMatches.map((m) => ({
      r: m.round,
      d: m.date ?? null,
      a: clubOf(m.teamA),
      b: clubOf(m.teamB),
      sa: m.scoreA,
      sb: m.scoreB,
    })),
    appearances,
  };

  const hash = JSON.stringify([payload.teams, payload.matches, payload.appearances]);
  const unchanged = before.exists && before.get("contentHash") === hash;

  const summary = {
    parsed: parsed.length,
    played: decided.filter((m) => m.played).length,
    approved: decided.filter((m) => m.approved).length,
    final: finalMatches.length,
    clubs: Object.keys(teams).length,
    appearances: Object.keys(appearances).length,
    rosterSize,
    unresolved,
    unresolvedClubs,
    unchanged,
    observeOnly,
  };

  if (observeOnly) return { ...summary, wrote: false, reason: "observe-only" };
  if (unchanged) return { ...summary, wrote: false, reason: "no change" };

  await overlayRef.set(
    { ...payload, scores, contentHash: hash, crawledAt: new Date().toISOString() },
    { merge: true },
  );
  return { ...summary, wrote: true };
}

module.exports = {
  crawlLiveEvent,
  PBLEAGUES_EVENT,
  fetchText,
  decideFinal,
  matchKey,
  shortClub,
  deriveAppearances,
  scoreTeams,
  slotIndex,
};
