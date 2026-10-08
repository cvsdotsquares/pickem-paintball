/**
 * NXL results in Firestore: one document per event, matches inside it.
 *
 *   nxlEvents/{slug}          an event — its teams' results, its matches, and which club
 *                             each player was rostered for. `live: true` while it is being
 *                             played; the crawler rewrites it until the event ends.
 *   projections/nxlHistoryMeta  the lookups that are not per event (club -> team_id).
 *
 * This replaces `data/nxlHistory.json` as the store the career pages are built from. The
 * workbook the file came from stays as a manual backup, but it is no longer the source:
 * results arrive from the live crawl and stay here.
 *
 * WHY MATCHES LIVE INSIDE THE EVENT
 * An event is ~50 matches and ~200 roster rows — a few KB, far under Firestore's 1 MB
 * document limit. Keeping them in one document means the `live` flag and the lock cover
 * both together, so an event's matches can never disagree with its team records.
 *
 * The document shape is the live crawler's, which already stores matches as objects
 * (Firestore rejects arrays of arrays). The history code downstream reads the file's
 * shape — matches as tuples, appearances keyed by player — so `historyFromDocs` converts
 * once, here, and nothing else needs to know where the data came from.
 */

const COLLECTION = "nxlEvents";
const META_DOC = "projections/nxlHistoryMeta";

/** "2023|World Cup" -> "2023_world_cup". Stable, and free of the "/" Firestore forbids. */
const docIdFor = (key) =>
  String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/**
 * The history file -> one document per event, plus the meta document.
 *
 * Appearances are stored the other way round from the file: per event, player -> club,
 * because that is the unit that is written and locked together.
 */
function docsFromHistory(history) {
  const byEvent = new Map(history.events.map((e) => [e.key, { ids: {}, epids: {} }]));
  const place = (src, field) => {
    for (const [player, list] of Object.entries(src || {})) {
      for (const [eventKey, club] of list) {
        const slot = byEvent.get(eventKey);
        if (!slot) throw new Error(`Appearance for unknown event ${eventKey} (${player})`);
        if (slot[field][player] !== undefined) {
          throw new Error(`${player} appears twice at ${eventKey}`);
        }
        slot[field][player] = club;
      }
    }
  };
  place(history.appearances, "ids");
  place(history.appearancesByEpid, "epids");

  const seen = new Set();
  const events = history.events.map((e) => {
    const id = docIdFor(e.key);
    if (seen.has(id)) throw new Error(`Two events share the document id ${id}`);
    seen.add(id);
    const slot = byEvent.get(e.key);
    return {
      id,
      data: {
        key: e.key,
        year: e.year,
        label: e.label,
        start: e.start,
        fieldSize: e.fieldSize,
        champion: e.champion,
        pickemEventId: e.pickemEventId,
        teams: e.teams,
        matches: e.matches.map(([r, d, a, b, sa, sb]) => ({ r, d, a, b, sa, sb })),
        appearances: slot.ids,
        appearancesByEpid: slot.epids,
        live: false,
      },
    };
  });

  return {
    events,
    meta: { clubTeamId: history.clubTeamId || {}, names: history.names || {} },
  };
}

/**
 * Event documents + meta -> the history file's shape.
 *
 * Events run in start order, and each player's appearances are rebuilt by walking the
 * events in that order, so a career lists its tournaments chronologically — the order
 * the file has always had.
 */
function historyFromDocs(eventDocs, meta = {}) {
  const events = eventDocs
    .map((d) => d)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)) || String(a.key).localeCompare(String(b.key)));

  const appearances = {};
  const appearancesByEpid = {};
  for (const e of events) {
    for (const [player, club] of Object.entries(e.appearances || {})) {
      (appearances[player] ||= []).push([e.key, club]);
    }
    for (const [epid, club] of Object.entries(e.appearancesByEpid || {})) {
      (appearancesByEpid[epid] ||= []).push([e.key, club]);
    }
  }

  return {
    clubTeamId: meta.clubTeamId || {},
    names: meta.names || {},
    events: events.map((e) => ({
      key: e.key,
      year: e.year,
      label: e.label,
      start: e.start,
      fieldSize: e.fieldSize ?? null,
      champion: e.champion ?? null,
      pickemEventId: e.pickemEventId ?? null,
      teams: e.teams || {},
      matches: (e.matches || []).map((m) => [m.r, m.d, m.a, m.b, m.sa, m.sb]),
      ...(e.live ? { live: true } : {}),
    })),
    appearances,
    appearancesByEpid,
  };
}

/** Every event document, plus meta, in the history file's shape. */
async function loadHistory(db) {
  const [snap, meta] = await Promise.all([db.collection(COLLECTION).get(), db.doc(META_DOC).get()]);
  return historyFromDocs(
    snap.docs.map((d) => d.data()),
    meta.exists ? meta.data() : {},
  );
}

module.exports = { COLLECTION, META_DOC, docIdFor, docsFromHistory, historyFromDocs, loadHistory };
