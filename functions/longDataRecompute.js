/**
 * PHASE 2 — Recompute player aggregates from long data
 * See LONG_DATA_MIGRATION.md §3.4
 *
 * Triggered by the upload manifest doc (NOT by individual rows: a 20-row upload
 * would otherwise wake this 20 times on partially-written data).
 *
 * Read wide, write narrow:
 *   - reads EVERY long row for the event and rebuilds every player total from
 *     scratch. Recomputing rather than adjusting stored values is what makes a
 *     delete-and-re-upload impossible to double-count — the bug this migration
 *     exists to kill.
 *   - writes only the players whose numbers actually changed. Reads are cheap
 *     (~3k docs, one query); writes are what cost time.
 *
 * PARALLEL RUN: writes to `events_v2/{eventId}/players/{playerId}`, mirroring
 * the live document shape so Phase 3 can diff field-for-field. It deliberately
 * does NOT touch `events/{eventId}.last_updated`, so none of the live
 * leaderboard/badge chain fires. Nothing here is user-visible.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

const LONG_DATA_COLLECTION = 'long_data';
const V2_EVENTS_COLLECTION = 'events_v2';

/**
 * Long-data `Type` → the aggregate field it feeds.
 * `Other` and blank are deliberately absent: they fall through to Unclassified,
 * matching the sheet's `Unclassified = Confirmed Kills - SUM(type columns)`.
 */
const TYPE_FIELD = {
  'Gunfight': 'Gunfights',
  'Breakshooting': 'Breakshooting',
  'Movement': 'Movement',
  'Zone Coverage': 'Zone Coverage',
  'Pressure': 'Pressure',
  'Trade': 'Trades',
};

const TYPE_FIELDS = Object.values(TYPE_FIELD);

function emptyTotals() {
  const t = { 'Confirmed Kills': 0, 'Unclassified': 0 };
  TYPE_FIELDS.forEach((f) => { t[f] = 0; });
  return t;
}

/**
 * Aggregates long rows into per-player totals.
 *
 * Always SUMS weight, never counts rows: shared kills carry weight 0.5, and
 * voided rows are tombstoned with weight 0 (so they fall out arithmetically
 * without needing to be filtered). Counting rows would readmit both.
 *
 * @param {Array<FirebaseFirestore.QueryDocumentSnapshot>} docs
 * @return {Map<string, Object>} playerId → totals
 */
function aggregateRows(docs) {
  const byPlayer = new Map();

  docs.forEach((doc) => {
    const r = doc.data();

    // Missed / Penalty carry no playerId and must never score for anyone.
    if (r.credit !== 'player') return;
    const playerId = r.playerId ? String(r.playerId) : null;
    if (!playerId) return;

    const weight = Number(r.weight);
    if (!isFinite(weight) || weight === 0) return;

    if (!byPlayer.has(playerId)) byPlayer.set(playerId, emptyTotals());
    const totals = byPlayer.get(playerId);

    totals['Confirmed Kills'] += weight;

    const field = TYPE_FIELD[String(r.type || '').trim()];
    if (field) totals[field] += weight;
  });

  // Unclassified is the residual — same definition the sheet uses.
  byPlayer.forEach((totals) => {
    const typed = TYPE_FIELDS.reduce((sum, f) => sum + totals[f], 0);
    totals['Unclassified'] = round2(totals['Confirmed Kills'] - typed);
    totals['Confirmed Kills'] = round2(totals['Confirmed Kills']);
    TYPE_FIELDS.forEach((f) => { totals[f] = round2(totals[f]); });
  });

  return byPlayer;
}

/** Half-weights make floating point relevant; keep 2dp. */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Reads every long row for an event. One query, ~3k docs. */
async function readEventRows(eventId) {
  const snap = await db
    .collection(LONG_DATA_COLLECTION)
    .where('eventId', '==', eventId)
    .get();
  return snap.docs;
}

/**
 * Writes only players whose totals differ from what's already stored.
 * @return {{written: number, unchanged: number}}
 */
async function writeChangedPlayers(eventId, byPlayer) {
  const targetCol = db.collection(`${V2_EVENTS_COLLECTION}/${eventId}/players`);
  const existingSnap = await targetCol.get();

  const existing = new Map();
  existingSnap.docs.forEach((d) => existing.set(d.id, d.data()));

  const changed = [];
  byPlayer.forEach((totals, playerId) => {
    const prev = existing.get(playerId);
    if (!prev || !totalsEqual(prev, totals)) {
      changed.push({ playerId, totals });
    }
  });

  // A player whose rows were all voided should drop to zero, not linger.
  existing.forEach((prev, playerId) => {
    if (!byPlayer.has(playerId) && Number(prev['Confirmed Kills'] || 0) !== 0) {
      changed.push({ playerId, totals: emptyTotals() });
    }
  });

  const BATCH = 500;
  for (let i = 0; i < changed.length; i += BATCH) {
    const batch = db.batch();
    changed.slice(i, i + BATCH).forEach(({ playerId, totals }) => {
      batch.set(
        targetCol.doc(playerId),
        {
          ...totals,
          playerId,
          eventId,
          recomputedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();
  }

  return { written: changed.length, unchanged: byPlayer.size - changed.length };
}

function totalsEqual(a, b) {
  const fields = ['Confirmed Kills', 'Unclassified', ...TYPE_FIELDS];
  return fields.every((f) => Number(a[f] || 0) === Number(b[f] || 0));
}

/** Core routine — exported so the Phase 3 diff harness can call it directly. */
async function recomputeEvent(eventId) {
  const t0 = Date.now();

  const docs = await readEventRows(eventId);
  const tRead = Date.now();

  if (docs.length === 0) {
    console.warn(`⚠️  No long rows found for ${eventId} — nothing to recompute.`);
    return { players: 0, rows: 0, written: 0, unchanged: 0 };
  }

  const byPlayer = aggregateRows(docs);
  const tAgg = Date.now();

  const { written, unchanged } = await writeChangedPlayers(eventId, byPlayer);
  const tWrite = Date.now();

  console.log(
    `⏱️  recomputeEvent ${eventId} total=${tWrite - t0}ms | ` +
    `read=${tRead - t0}ms aggregate=${tAgg - tRead}ms write=${tWrite - tAgg}ms | ` +
    `rows=${docs.length} players=${byPlayer.size} written=${written} unchanged=${unchanged}`
  );

  return { players: byPlayer.size, rows: docs.length, written, unchanged };
}

/**
 * Trigger: one upload manifest → one invocation.
 */
exports.onLongDataUpload = functions.firestore
  .document('uploads/{uploadId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    const eventId = data.eventId;

    if (!eventId) {
      console.error(`❌ Manifest ${context.params.uploadId} has no eventId — skipping.`);
      return null;
    }

    console.log(
      `📥 Upload manifest ${context.params.uploadId}: ${data.rowCount || '?'} rows, ` +
      `${(data.affectedGameIds || []).length} game(s) → recomputing ${eventId}`
    );

    try {
      await recomputeEvent(eventId);
    } catch (err) {
      console.error(`❌ recomputeEvent failed for ${eventId}:`, err);
    }
    return null;
  });

// Exported for the Phase 3 diff harness and for unit testing the pure parts.
exports.recomputeEvent = recomputeEvent;
exports.aggregateRows = aggregateRows;
exports.TYPE_FIELD = TYPE_FIELD;
exports.TYPE_FIELDS = TYPE_FIELDS;
