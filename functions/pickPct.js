/**
 * Pick % and captain %: counted one way, stored in two documents per event.
 *
 *   events/{id}/summaries/pickPct      FROZEN at the pick lock by the Data agent
 *                                      (pickem-hub agents/pick_pct/freeze.py), written once,
 *                                      never overwritten. The number for that event forever.
 *   events/{id}/summaries/pickPctLive  while picks are open: refreshed every hour by
 *                                      refreshLivePickPct below, so the career page can show
 *                                      "picked by 12% so far". Stops at the lock.
 *
 * WHY FROZEN, NOT RECOUNTED
 *
 * Every rebuild used to recount every event from the users collection as it is now. That
 * number drifts: a deleted account shrinks an old event's field, and a pick edited after
 * the lock (the lock was only enforced in the browser) rewrites history. Ownership is a fact
 * about the moment the picks closed, so it is taken at that moment and kept.
 *
 * ONE COUNTING RULE, in three places that must agree: this file, freeze.py and
 * extract-pick-percentages.js. An entry is a non-empty array at pickems.<id>. A player counts
 * once per entry even if listed twice. The captain is pickems.<id>_captain, counted only for
 * entries. Drafts (<id>_draft, <id>_draft_captain) never count. Percentages are of entries.
 */

const SUMMARY = (eventId, which) => `events/${eventId}/summaries/${which}`;
const pct = (n, total) => (total ? Math.round((10000 * n) / total) / 100 : 0);

/** One event's counts from a set of user documents' `pickems` maps. */
function countEvent(pickemsList, eventId) {
  const picks = new Map();
  const captains = new Map();
  let entries = 0;
  let noCaptain = 0;
  for (const pickems of pickemsList) {
    const roster = pickems?.[eventId];
    if (!Array.isArray(roster) || roster.length === 0) continue;
    entries++;
    for (const id of new Set(roster.filter((x) => x !== null && x !== "").map(String))) {
      picks.set(id, (picks.get(id) ?? 0) + 1);
    }
    const c = pickems[`${eventId}_captain`];
    if (c === null || c === undefined || c === "") noCaptain++;
    else captains.set(String(c), (captains.get(String(c)) ?? 0) + 1);
  }
  return { entries, picks, captains, noCaptain };
}

/** The stored shape, for every player on the roster (zeros included) — the same as freeze.py writes. */
function snapshotFor(eventId, rosterIds, counted) {
  const players = {};
  for (const id of rosterIds) {
    const p = counted.picks.get(id) ?? 0;
    const c = counted.captains.get(id) ?? 0;
    players[id] = { picks: p, pickPct: pct(p, counted.entries), captains: c, captainPct: pct(c, counted.entries) };
  }
  const known = new Set(rosterIds);
  const unknown = [...new Set([...counted.picks.keys(), ...counted.captains.keys()])].filter((id) => !known.has(id)).sort();
  return { eventId, entries: counted.entries, players, unknown, noCaptain: counted.noCaptain };
}

/**
 * The frozen snapshot for every event that has one: eventId -> { total, byPlayer: Map(id -> pickPct) }.
 * Events without one are simply absent; the caller decides what to do about them.
 */
async function loadFrozen(db, eventIds) {
  const snaps = await Promise.all(eventIds.map((id) => db.doc(SUMMARY(id, "pickPct")).get()));
  const out = new Map();
  snaps.forEach((s, i) => {
    if (!s.exists) return;
    const players = s.get("players") || {};
    out.set(eventIds[i], {
      total: s.get("entries") ?? 0,
      byPlayer: new Map(Object.entries(players).map(([id, v]) => [id, v?.pickPct ?? 0])),
      frozen: true,
    });
  });
  return out;
}

/**
 * The hourly live count for events whose picks are open: status live, lockDate ahead.
 * Writes nothing for any other event; after the lock the frozen snapshot takes over and
 * pickPctLive stays as it was at its last refresh (marked `closed` once the lock passes).
 */
async function refreshLive(db, admin, now = new Date()) {
  const events = await db.collection("events").where("status", "==", "live").get();
  const open = events.docs.filter((d) => {
    const lock = d.get("lockDate");
    return lock && lock.toDate() > now;
  });
  const closing = events.docs.filter((d) => {
    const lock = d.get("lockDate");
    return lock && lock.toDate() <= now;
  });
  const results = [];
  if (open.length) {
    const users = await db.collection("users").select("pickems").get();
    const pickemsList = users.docs.map((u) => u.get("pickems") || {});
    for (const ev of open) {
      const roster = await db.collection(`events/${ev.id}/players`).select().get();
      const snap = snapshotFor(ev.id, roster.docs.map((d) => d.id), countEvent(pickemsList, ev.id));
      await db.doc(SUMMARY(ev.id, "pickPctLive")).set({
        ...snap,
        open: true,
        lockDate: ev.get("lockDate"),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      results.push(`${ev.id}: ${snap.entries} entries`);
    }
  }
  // One last touch after the lock so readers know the live count has stopped.
  for (const ev of closing) {
    const ref = db.doc(SUMMARY(ev.id, "pickPctLive"));
    const s = await ref.get();
    if (s.exists && s.get("open") === true) {
      await ref.update({ open: false });
      results.push(`${ev.id}: live count closed at the lock`);
    }
  }
  return results;
}

module.exports = { countEvent, snapshotFor, loadFrozen, refreshLive, SUMMARY };
