/**
 * A player's pro career in three views — All (PSP + NXL), NXL only, PSP only.
 *
 * Each view is the NXL career code (`nxlHistory.createEngine`) run over its own history,
 * so every figure, rank and rule is the one the NXL page already uses; the PSP-specific
 * rules live in that code and in `scripts/psp-history/EDGE_CASES.md`. Ranks are within
 * each view's own pool (EDGE_CASES.md E2): All ranks against every NXL Pro and PSP Pro
 * player since 2003.
 *
 * NOT YET PUBLIC. Only `/api/career/pro` calls this, and that route answers one account
 * until the release switch is turned on (see the route).
 *
 * A player in both leagues is one person: both files key appearances by the numeric id
 * read off the avatar filename, falling back to the profile EPID, and those ids are the
 * same in both (4,469 of 4,469 checked).
 */
const { createEngine } = require("./nxlHistory");
const PSP_HISTORY = require("./data/pspHistory.json");

/** Two id -> [[eventKey, club]] maps into one, keeping each list in event order. */
function mergeAppearances(a = {}, b = {}) {
  const out = {};
  for (const src of [a, b]) {
    for (const [id, list] of Object.entries(src)) out[id] = [...(out[id] ?? []), ...list];
  }
  return out;
}

/**
 * NXL + PSP as one history, oldest event first.
 *
 * `trackedFrom` reads the first event's year, so the All view says 2003. PSP keys carry
 * a "PSP" prefix ("2004|PSP World Cup"), so no event key can collide with an NXL one.
 * `clubTeamId` stays NXL's alone: it maps clubs to PickEm team ids for the eight scored
 * events, none of which is PSP.
 */
function combine(nxl, psp) {
  const events = [...psp.events, ...nxl.events].sort((x, y) => String(x.start ?? "").localeCompare(String(y.start ?? "")));
  return {
    ...nxl,
    events,
    appearances: mergeAppearances(psp.appearances, nxl.appearances),
    appearancesByEpid: mergeAppearances(psp.appearancesByEpid, nxl.appearancesByEpid),
    names: { ...psp.names, ...nxl.names },
  };
}

/**
 * Engines are cached against the NXL history object they were built from, so a warm
 * instance rebuilds only when the NXL history it is handed actually changes.
 */
let cache = null;
function engines(nxlHistory) {
  if (cache && cache.nxlHistory === nxlHistory) return cache;
  cache = {
    nxlHistory,
    all: createEngine(combine(nxlHistory, PSP_HISTORY)),
    nxl: createEngine(nxlHistory),
    psp: createEngine(PSP_HISTORY),
  };
  return cache;
}

/**
 * @param {object} nxlHistory  the live NXL history (Firestore `nxlEvents`, via loadHistory)
 * @param {string|number|null} leagueId
 * @param {{epid?: string|null, absentEventIds?: Set<string>}} opts  as for nxlCareer
 * @return {{all: object|null, nxl: object|null, psp: object|null}}
 */
function proCareer(nxlHistory, leagueId, opts = {}) {
  const e = engines(nxlHistory);
  /* `scope` names the pool, so the page can say what a rank is out of. */
  const tag = (c, scope) => (c ? { ...c, scope } : null);
  return {
    all: tag(e.all.nxlCareer(leagueId, opts), "all"),
    nxl: tag(e.nxl.nxlCareer(leagueId, opts), "nxl"),
    psp: tag(e.psp.nxlCareer(leagueId, opts), "psp"),
  };
}

module.exports = { proCareer, combine };

/* ── All-time table + landing leaders (preview) ─────────────────────────────── */

/** The all-time table's tie-breakers (dashboard/stats/all-time RANK_ORDER), as a career. */
const LEAGUE_ORDER = (c, kills = 0) => [c.titles, c.titleRate ?? -1, c.matchWinPct ?? -1, kills];
const byOrder = (a, b) => {
  for (let i = 0; i < a.length; i++) if (b[i] !== a[i]) return b[i] - a[i];
  return 0;
};

/** League columns, formatted exactly as playerSummaries.js writes them for aggregates/allTime. */
const leagueColumns = (c) => ({
  "Event Wins": c.titles,
  Record: `${c.matchW}–${c.matchL}`,
  "Event Win %": c.titleRate != null ? +c.titleRate.toFixed(1) : "—",
  "Match Win %": c.matchWinPct != null ? +c.matchWinPct.toFixed(1) : "—",
});
const LEAGUE_KEYS = new Set(["Event Wins", "Record", "Event Win %", "Match Win %"]);
const IDENTITY_KEYS = new Set(["player_id", "Player", "Team", "Number", "img_url", "Rank"]);

/**
 * Every pro player since 2003, one row each, for one view — James, 10 Oct 2026: "include
 * all pros". A player with a PickEm page keeps their kill columns (copied from the stored
 * all-time row) and links through; everyone else carries "—" there and no link.
 *
 * `active`: rostered on a Pro team at any of the league's last five events (James's
 * definition). It is a fact about the person, so it is the same in every view.
 *
 * @param {object} nxlHistory
 * @param {Array<{playerId: string, leagueId: string|null, epid: string|null, absentEventIds: Set<string>,
 *   name: string, currentTeam: string, number: unknown, imgUrl: string|null}>} pickem
 * @param {Array<Record<string, unknown>>} allTimeRows  aggregates/allTime `players`
 * @param {"all"|"nxl"|"psp"} view
 */
function proTable(nxlHistory, pickem, allTimeRows, view) {
  const e = engines(nxlHistory);
  const engine = e[view];
  const history = e.all.history();
  const lastFive = new Set(
    [...history.events].sort((x, y) => String(y.start ?? "").localeCompare(String(x.start ?? ""))).slice(0, 5).map((x) => x.key),
  );
  const killColsOf = new Map(
    allTimeRows.map((r) => [String(r.player_id), Object.fromEntries(Object.entries(r).filter(([k]) => !LEAGUE_KEYS.has(k) && !IDENTITY_KEYS.has(k)))]),
  );
  const killKeys = [...new Set(allTimeRows.flatMap((r) => Object.keys(r)))].filter((k) => !LEAGUE_KEYS.has(k) && !IDENTITY_KEYS.has(k));
  const blankKills = Object.fromEntries(killKeys.map((k) => [k, "—"]));

  const byLeague = new Map(), byEpid = new Map();
  for (const p of pickem) {
    if (p.leagueId != null) byLeague.set(String(p.leagueId), p);
    if (p.epid) byEpid.set(String(p.epid), p);
  }

  const rows = [];
  const seen = new Set();
  const people = [
    ...Object.keys(history.appearances).map((id) => ({ id, epid: null })),
    ...Object.keys(history.appearancesByEpid ?? {}).map((epid) => ({ id: null, epid })),
  ];
  for (const { id, epid } of people) {
    const p = (id && byLeague.get(id)) || (epid && byEpid.get(epid)) || null;
    /* A PickEm player is one row even when filed under both ids. */
    const who = p ? `p:${p.playerId}` : id ? `n:${id}` : `e:${epid}`;
    if (seen.has(who)) continue;
    seen.add(who);
    const c = engine.nxlCareer(p ? p.leagueId : id, { epid: p ? p.epid : epid, absentEventIds: p?.absentEventIds });
    if (!c) continue;
    const raw = [
      ...((p ? p.leagueId : id) != null ? history.appearances[String(p ? p.leagueId : id)] ?? [] : []),
      ...((p ? p.epid : epid) ? history.appearancesByEpid?.[String(p ? p.epid : epid)] ?? [] : []),
    ];
    const kills = p ? killColsOf.get(String(p.playerId)) : null;
    rows.push({
      row_key: who,
      player_id: p ? p.playerId : "",
      Player: p ? p.name : history.names?.[id ?? epid] ?? "Unknown",
      Team: p ? p.currentTeam : c.events.at(-1)?.club ?? "",
      Number: p ? p.number ?? "" : "",
      img_url: p ? p.imgUrl ?? "" : "",
      ...leagueColumns(c),
      ...(kills ?? blankKills),
      active: raw.some(([k]) => lastFive.has(k)),
      _order: LEAGUE_ORDER(c, Number(kills?.["Confirmed Kills"]) || 0),
    });
  }
  rows.sort((a, b) => byOrder(a._order, b._order));
  for (const r of rows) delete r._order;
  return rows;
}

/**
 * The landing page's "Career stats" row, in the All view: PickEm players only (a card is a
 * link to a career page), ordered like the table. `hasPhoto` is the caller's live-photo
 * check — cards require a real photo (players/page.tsx).
 */
async function proLeaders(nxlHistory, pickem, hasPhoto, limit = 20) {
  const e = engines(nxlHistory);
  const ranked = pickem
    .filter((p) => p.playedCount > 0)
    .map((p) => ({ p, c: e.all.nxlCareer(p.leagueId, { epid: p.epid, absentEventIds: p.absentEventIds }) }))
    .filter((x) => x.c)
    .sort((a, b) => byOrder(LEAGUE_ORDER(a.c, a.p.totalKills), LEAGUE_ORDER(b.c, b.p.totalKills)));
  const out = [];
  for (const { p, c } of ranked) {
    if (out.length >= limit) break;
    if (!(await hasPhoto(p.imgUrl))) continue;
    out.push({
      id: p.playerId,
      name: p.name,
      team: p.currentTeam,
      imgUrl: p.imgUrl,
      statsLabel: "Career stats",
      stats: [
        { value: String(c.titles), label: "Wins" },
        { value: `${c.matchW}–${c.matchL}`, label: "Record" },
        { value: (p.avgKills ?? 0).toFixed(1), label: "Kills", sublabel: "/Event" },
      ],
    });
  }
  return out;
}

module.exports.proTable = proTable;
module.exports.proLeaders = proLeaders;
