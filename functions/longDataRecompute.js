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
 * PHASE 4 (CUTOVER): writes to the LIVE `events/{eventId}/players/{playerId}`
 * and bumps `events/{eventId}.last_updated`, which fires recalculateLeaderboard
 * exactly as the old macro's event-doc write used to.
 *
 * FIELD OWNERSHIP — this function and syncRoster() write to the same documents
 * and must not overwrite each other:
 *   here          Confirmed Kills, the 7 type splits, Rank
 *   syncRoster()  Player, Team, Cost, Status, Number, img_url, team_id, league_id
 * Writes here use merge, and syncRoster uses an updateMask, so each only ever
 * touches its own fields.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

const LONG_DATA_COLLECTION = 'long_data';

// Live as of Phase 4 cutover. Set to 'events_v2' to run in parallel-run mode
// again (writes nowhere user-visible, and skips the last_updated bump).
const TARGET_EVENTS_COLLECTION = 'events';
const IS_LIVE = TARGET_EVENTS_COLLECTION === 'events';

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
 * Assigns Rank across EVERY player on the roster, not just those with kills.
 *
 * Matches the sheet's RANK(K2,K:K,0): descending, ties share a rank, and the
 * next distinct value skips accordingly — [5,5,3] ranks as 1,1,3. Players on
 * the roster with no long rows rank at 0 kills rather than being left unranked,
 * which is what the sheet formula did.
 *
 * @param {Map<string,Object>} byPlayer  playerId → totals (scorers only)
 * @param {Map<string,Object>} existing  playerId → current doc (whole roster)
 */
function assignRanks(byPlayer, existing) {
  const all = new Map();
  existing.forEach((_, playerId) => all.set(playerId, emptyTotals()));
  byPlayer.forEach((totals, playerId) => all.set(playerId, totals));

  const sorted = [...all.entries()].sort(
    (a, b) => b[1]['Confirmed Kills'] - a[1]['Confirmed Kills']
  );

  let lastKills = null;
  let lastRank = 0;
  sorted.forEach(([, totals], i) => {
    const kills = totals['Confirmed Kills'];
    if (kills !== lastKills) {
      lastRank = i + 1;      // skip ranks after a tie, as RANK() does
      lastKills = kills;
    }
    totals.Rank = lastRank;
  });

  return all;
}

/**
 * Writes only players whose stats differ from what's already stored.
 * @return {{written: number, unchanged: number}}
 */
async function writeChangedPlayers(eventId, byPlayer) {
  const targetCol = db.collection(`${TARGET_EVENTS_COLLECTION}/${eventId}/players`);
  const existingSnap = await targetCol.get();

  const existing = new Map();
  existingSnap.docs.forEach((d) => existing.set(d.id, d.data()));

  // Ranks depend on the whole roster, so this also folds in players whose rows
  // were all voided — they drop to zero rather than lingering at their old total.
  const all = assignRanks(byPlayer, existing);

  const changed = [];
  all.forEach((totals, playerId) => {
    const prev = existing.get(playerId);
    if (!prev || !totalsEqual(prev, totals)) {
      changed.push({ playerId, totals });
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
        // merge so syncRoster's metadata (Player, Team, Cost, Status…) survives.
        { merge: true }
      );
    });
    await batch.commit();
  }

  return { written: changed.length, unchanged: all.size - changed.length };
}

function totalsEqual(a, b) {
  const fields = ['Confirmed Kills', 'Unclassified', 'Rank', ...TYPE_FIELDS];
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

  // Fire the downstream chain. The old macro did this implicitly by writing the
  // event doc on every upload; now that stats no longer go through the macro,
  // this is what triggers recalculateLeaderboard.
  //
  // Skipped when nothing changed — otherwise every submit would re-rank the
  // entire leaderboard for no reason. Also skipped in parallel-run mode.
  if (IS_LIVE && written > 0) {
    await db.doc(`events/${eventId}`).update({
      last_updated: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  /**
   * Flag the career-stats projection as stale.
   *
   * `playerSummaries` and `aggregates/*` are derived from these same player docs, so
   * the moment this writes, they are behind. They are NOT rebuilt here: a rebuild costs
   * ~22,000 reads and would run on every upload, several times a game. Instead this
   * leaves a marker and `rebuildPlayerSummaries` (index.js) picks it up on its next
   * pass, which collapses a weekend of uploads into one rebuild every few minutes.
   *
   * Only on a real change, for the same reason the leaderboard trigger is.
   */
  if (IS_LIVE && written > 0) {
    await db.doc('projections/playerSummaries').set({
      staleSince: admin.firestore.FieldValue.serverTimestamp(),
      reason: `recomputeEvent ${eventId} wrote ${written} player(s)`,
    }, { merge: true });
  }

  const tTrigger = Date.now();

  console.log(
    `⏱️  recomputeEvent ${eventId} total=${tTrigger - t0}ms | ` +
    `read=${tRead - t0}ms aggregate=${tAgg - tRead}ms write=${tWrite - tAgg}ms ` +
    `trigger=${tTrigger - tWrite}ms | rows=${docs.length} players=${byPlayer.size} ` +
    `written=${written} unchanged=${unchanged} target=${TARGET_EVENTS_COLLECTION}`
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
