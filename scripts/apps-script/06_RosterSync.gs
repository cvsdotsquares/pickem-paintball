/**
 * PHASE 4 — Roster metadata sync (replaces the player half of firestore.gs)
 * See LONG_DATA_MIGRATION.md §4
 *
 * Writes ONLY the player metadata that cannot be derived from long data:
 * name, team, cost, status, number, photo. Stats (Confirmed Kills, the seven
 * type splits, Rank) are written by the recompute Cloud Function and must not
 * be touched here — both write to the same documents with merge semantics, so
 * each owns a disjoint set of fields.
 *
 * WHY IT STILL RUNS ON EVERY SUBMIT: player Status changes mid-event (Injured,
 * Out), and onPlayerChange turns those into user notifications. Under the old
 * macro that propagated automatically because every submit rewrote every
 * player. Making this manual would mean a forgotten sync leaves an injured
 * player showing as Confirmed to everyone who picked them.
 *
 * WHY IT IS NO LONGER SLOW: the old path made one HTTP request per player
 * (~218 requests, ~52s). This sends one batched request, and diffs first — a
 * submit where no roster field changed writes nothing and triggers no
 * downstream functions at all.
 */

const ROSTER_CONFIG = {
  liveDataSheet: 'Live Data',
  // Metadata fields owned by this sync. Anything not listed here is left alone.
  // Deliberately excludes: Confirmed Kills, Gunfights, Breakshooting, Movement,
  // Zone Coverage, Pressure, Trades, Unclassified, Rank — all recompute-owned.
  fields: [
    'player_id', 'league_id', 'img_url', 'team_id',
    'Player', 'Status', 'Number', 'Team', 'Cost',
  ],
};

/**
 * Syncs roster metadata for the current event.
 * @return {{written: number, unchanged: number, total: number}}
 */
function syncRoster() {
  const started = Date.now();
  const eventId = getEventId_();          // 01_LongDataRowIds.gs
  const projectId = getProjectId_();      // 02_LongDataUpload.gs
  const token = getAccessToken_();

  const roster = readRosterFromSheet_();
  if (roster.length === 0) throw new Error('No players found in ' + ROSTER_CONFIG.liveDataSheet);

  const existing = fetchExistingPlayers_(projectId, eventId, token);

  const writes = [];
  let unchanged = 0;

  roster.forEach(function (player) {
    const id = String(player.player_id);
    const prev = existing[id];
    if (prev && rosterFieldsEqual_(prev, player)) {
      unchanged++;
      return;
    }

    const name =
      'projects/' + projectId + '/databases/(default)/documents/events/' +
      eventId + '/players/' + id;

    // updateMask restricts this to metadata fields only, so the stats written
    // by the recompute function survive untouched.
    writes.push({
      update: { name: name, fields: toFirestoreFields_(player) },
      updateMask: { fieldPaths: Object.keys(player) },
    });
  });

  for (let i = 0; i < writes.length; i += UPLOAD_CONFIG.batchSize) {
    batchWrite_(writes.slice(i, i + UPLOAD_CONFIG.batchSize), token);
  }

  Logger.log(
    'syncRoster: written=%s unchanged=%s total=%s in %sms',
    writes.length, unchanged, roster.length, Date.now() - started
  );
  return { written: writes.length, unchanged: unchanged, total: roster.length };
}

/** Reads the roster from Live Data, keeping only the metadata columns. */
function readRosterFromSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(ROSTER_CONFIG.liveDataSheet);
  if (!sheet) throw new Error('Sheet not found: ' + ROSTER_CONFIG.liveDataSheet);

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(function (h) { return String(h).trim(); });
  const out = [];

  values.slice(1).forEach(function (row) {
    const player = {};
    headers.forEach(function (header, i) {
      // Only named metadata columns. This also skips the blank headers in
      // columns S-AB, which the old macro mapped into "" field names.
      if (ROSTER_CONFIG.fields.indexOf(header) === -1) return;
      let v = row[i];
      if (v === '' || v === null || v === undefined) return;
      // player_id is a Firestore document id — keep it a clean string.
      if (header === 'player_id' || header === 'Number') {
        v = String(v).replace(/\.0$/, '');
      }
      player[header] = v;
    });
    if (player.player_id) out.push(player);
  });

  return out;
}

/** Fetches current player docs so we only write what actually changed. */
function fetchExistingPlayers_(projectId, eventId, token) {
  const out = {};
  let pageToken = '';

  do {
    const url =
      'https://firestore.googleapis.com/v1/projects/' + projectId +
      '/databases/(default)/documents/events/' + eventId + '/players' +
      '?pageSize=300' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');

    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });

    if (res.getResponseCode() === 404) return out; // no players yet — first run
    if (res.getResponseCode() !== 200) {
      throw new Error('Failed to list players (HTTP ' + res.getResponseCode() + '): ' + res.getContentText());
    }

    const body = JSON.parse(res.getContentText());
    (body.documents || []).forEach(function (doc) {
      const id = doc.name.split('/').pop();
      out[id] = fromFirestoreFields_(doc.fields || {});
    });
    pageToken = body.nextPageToken || '';
  } while (pageToken);

  return out;
}

/** Compares only the metadata fields — stats differences are irrelevant here. */
function rosterFieldsEqual_(prev, next) {
  return Object.keys(next).every(function (k) {
    const a = prev[k];
    const b = next[k];
    if (a instanceof Date || b instanceof Date) {
      return String(a) === String(b);
    }
    // Sheet values arrive as numbers, Firestore may hold strings — compare loosely.
    return String(a == null ? '' : a) === String(b == null ? '' : b);
  });
}

function fromFirestoreFields_(fields) {
  const out = {};
  Object.keys(fields).forEach(function (k) {
    out[k] = fromFirestoreValue_(fields[k]);
  });
  return out;
}

function fromFirestoreValue_(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestoreValue_);
  if ('mapValue' in v) return fromFirestoreFields_(v.mapValue.fields || {});
  return null;
}
