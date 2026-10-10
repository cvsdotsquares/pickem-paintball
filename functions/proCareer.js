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
