/**
 * PHASE 1b — Batched delta upload of Long Data
 * See LONG_DATA_MIGRATION.md §3.3, §3.4
 *
 * Uploads ONLY rows whose sync_state is not yet Synced, in batched requests.
 *
 * WHY NOT FirestoreApp: that library exposes only createDocument /
 * updateDocument / deleteDocument — one HTTP round-trip per document. That is
 * what makes the current player upload take ~60s for 218 rows, and it makes a
 * 2,940-row backfill impossible (≈12 min against Apps Script's 6 min ceiling).
 * The REST :batchWrite endpoint takes 500 writes per request, so this talks to
 * it directly and hand-rolls the service-account token.
 *
 * SETUP (once):
 *   File > Project properties > Script properties, add:
 *     FIREBASE_CLIENT_EMAIL   firebase-adminsdk-fbsvc@fantasy-paintball.iam.gserviceaccount.com
 *     FIREBASE_PRIVATE_KEY    -----BEGIN PRIVATE KEY-----\n…
 *     FIREBASE_PROJECT_ID     fantasy-paintball
 *   Keeping the key here rather than in source stops it travelling with copies
 *   of the file.
 */

const UPLOAD_CONFIG = {
  longDataCollection: 'long_data',
  manifestCollection: 'uploads',
  liveDataSheet: 'Live Data',
  batchSize: 500,          // Firestore's :batchWrite hard limit
  syncedValue: 'Synced',
  reviewedValue: 'Reviewed',
  reviewedSyncedValue: 'Reviewed - Synced',
};

// Live Data column positions (1-indexed), used to build the id lookups.
const LIVE = { playerId: 1, teamId: 4, player: 6, team: 9 };

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uploads all unsynced Long Data rows, then writes an upload manifest that the
 * recompute Cloud Function triggers on.
 */
function uploadLongDataDelta() {
  const started = Date.now();

  // Any row without an id can't be addressed, so make sure they all have one.
  ensureRowIds();

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LD.sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < LD.firstDataRow) {
    Logger.log('Nothing to upload — sheet is empty.');
    return;
  }

  const numRows = lastRow - LD.firstDataRow + 1;
  const range = sheet.getRange(LD.firstDataRow, 1, numRows, LD.col.lastModified);
  const data = range.getValues();

  const lookups = buildLookups_();
  const eventId = getEventId_();

  // ── Select the delta ──────────────────────────────────────────────────────
  const pending = [];
  data.forEach(function (row, i) {
    const rowId = String(row[LD.col.rowId - 1] || '');
    if (!rowId) return; // blank/malformed — ensureRowIds deliberately skipped it

    const state = String(row[LD.col.syncState - 1] || '').trim();
    if (state === UPLOAD_CONFIG.syncedValue || state === UPLOAD_CONFIG.reviewedSyncedValue) {
      return; // already up to date in Firestore
    }
    pending.push({ sheetIndex: i, rowId: rowId, row: row, priorState: state });
  });

  if (pending.length === 0) {
    Logger.log('Nothing to upload — all rows already synced.');
    return;
  }

  // ── Validate before writing anything ──────────────────────────────────────
  const errors = validateRows_(pending, lookups);
  if (errors.length > 0) {
    const msg =
      'Upload aborted — ' + errors.length + ' invalid row(s). Nothing was written.\n\n' +
      errors.slice(0, 25).join('\n');
    Logger.log(msg);
    // Deliberately still alerts. Successful runs are silent, but a rejected
    // upload during live scoring must be impossible to miss — otherwise a
    // scorer carries on believing their data landed when it didn't.
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
    throw new Error('Validation failed: ' + errors.length + ' invalid rows');
  }

  // ── Build the writes ──────────────────────────────────────────────────────
  const affectedGameIds = {};
  const writes = pending.map(function (p) {
    const doc = buildRowDoc_(p.rowId, p.row, eventId, lookups);
    affectedGameIds[doc.fields.gameId.stringValue] = true;
    return { update: doc };
  });

  // ── Send, 500 at a time ───────────────────────────────────────────────────
  const token = getAccessToken_();
  for (let i = 0; i < writes.length; i += UPLOAD_CONFIG.batchSize) {
    const chunk = writes.slice(i, i + UPLOAD_CONFIG.batchSize);
    batchWrite_(chunk, token); // throws on failure → sync_state is NOT stamped
  }

  // ── Stamp sync_state back — ONLY after every batch succeeded ──────────────
  // If an upload fails partway, the flags stay unset and the next run retries
  // those rows. Marking them first would strand rows that never landed.
  const stateCol = data.map(function (row) {
    return [row[LD.col.syncState - 1]];
  });
  pending.forEach(function (p) {
    stateCol[p.sheetIndex] = [
      p.priorState === UPLOAD_CONFIG.reviewedValue
        ? UPLOAD_CONFIG.reviewedSyncedValue
        : UPLOAD_CONFIG.syncedValue,
    ];
  });
  sheet.getRange(LD.firstDataRow, LD.col.syncState, numRows, 1).setValues(stateCol);
  SpreadsheetApp.flush();

  // ── Manifest: one doc, one function invocation ────────────────────────────
  const gameIds = Object.keys(affectedGameIds);
  writeManifest_(eventId, gameIds, pending.length, token);

  const elapsed = Date.now() - started;
  Logger.log(
    'Uploaded %s row(s) across %s game(s) in %sms (%s batch request(s)).',
    pending.length, gameIds.length, elapsed,
    Math.ceil(writes.length / UPLOAD_CONFIG.batchSize)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row → Firestore document
// ─────────────────────────────────────────────────────────────────────────────

function buildRowDoc_(rowId, row, eventId, lookups) {
  const round = String(row[LD.col.round - 1] || '').trim();
  const team = String(row[LD.col.team - 1] || '').trim();
  const opponent = String(row[LD.col.opponent - 1] || '').trim();
  const player = String(row[LD.col.player - 1] || '').trim();
  const type = String(row[LD.col.type - 1] || '').trim();
  const point = row[LD.col.point - 1];
  const weight = row[LD.col.weight - 1];
  const date = row[LD.col.date - 1];

  const projectId = getProjectId_();
  const name =
    'projects/' + projectId + '/databases/(default)/documents/' +
    UPLOAD_CONFIG.longDataCollection + '/' + rowId;

  const fields = {
    eventId: str_(eventId),
    gameId: str_(buildGameId_(eventId, round, team, opponent, lookups)),
    round: str_(round),
    team: str_(team),
    teamId: str_(lookups.teamIdByName[team] || ''),
    opponent: str_(opponent),
    opponentId: str_(lookups.teamIdByName[opponent] || ''),
    point: num_(point),
    player: str_(player),
    // Missed / Penalty are sentinels and must never resolve to a playerId.
    playerId: isSentinel_(player)
      ? { nullValue: null }
      : str_(String(lookups.playerIdByName[player] || '')),
    credit: str_(isSentinel_(player) ? player.toLowerCase() : 'player'),
    type: str_(type),
    weight: num_(weight),
    // Date is an attribute only — it drifts mid-game and is never part of a key.
    date: date instanceof Date ? { timestampValue: date.toISOString() } : { nullValue: null },
    rowId: str_(rowId),
  };

  return { name: name, fields: fields };
}

/**
 * gameId = {eventId}_{round}_{sorted team ids}
 *
 * Long Data stores each game twice, directionally (Team=Impact/Opponent=Uprising
 * and the reverse). Sorting unconditionally collapses both to one id. Sorting on
 * team_id rather than display name because ids don't change when a team picks up
 * a sponsor prefix mid-season.
 */
function buildGameId_(eventId, round, team, opponent, lookups) {
  const a = lookups.teamIdByName[team] || team;
  const b = lookups.teamIdByName[opponent] || opponent;
  const pair = [a, b].sort();
  return eventId + '_' + round + '_' + pair[0] + '-' + pair[1];
}

function isSentinel_(player) {
  return player === 'Missed' || player === 'Penalty';
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateRows_(pending, lookups) {
  const errors = [];
  pending.forEach(function (p) {
    const sheetRow = p.sheetIndex + LD.firstDataRow;
    const row = p.row;
    const player = String(row[LD.col.player - 1] || '').trim();
    const team = String(row[LD.col.team - 1] || '').trim();
    const round = String(row[LD.col.round - 1] || '').trim();
    const weight = row[LD.col.weight - 1];

    if (!round) errors.push('Row ' + sheetRow + ': missing Round');
    if (!team) errors.push('Row ' + sheetRow + ': missing Team');

    // A null weight silently counts as zero in every SUMIFS — never upload one.
    if (weight === '' || weight === null || weight === undefined) {
      errors.push('Row ' + sheetRow + ': missing Weight');
    } else if (isNaN(Number(weight))) {
      errors.push('Row ' + sheetRow + ': non-numeric Weight (' + weight + ')');
    } else if (Number(weight) < 0) {
      errors.push('Row ' + sheetRow + ': negative Weight (' + weight + ')');
    }

    if (!player) {
      errors.push('Row ' + sheetRow + ': missing Player');
    } else if (!isSentinel_(player) && !lookups.playerIdByName[player]) {
      // Hard failure: an unmatched name would silently score for nobody.
      errors.push('Row ' + sheetRow + ': player "' + player + '" not found in Live Data roster');
    }

    if (team && !lookups.teamIdByName[team]) {
      errors.push('Row ' + sheetRow + ': team "' + team + '" not found in Live Data');
    }
  });
  return errors;
}

/** Builds name → id lookups from the Live Data roster. */
function buildLookups_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(UPLOAD_CONFIG.liveDataSheet);
  if (!sheet) throw new Error('Sheet not found: ' + UPLOAD_CONFIG.liveDataSheet);

  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, 1, lastRow - 1, LIVE.team).getValues();

  const playerIdByName = {};
  const teamIdByName = {};
  values.forEach(function (row) {
    const name = String(row[LIVE.player - 1] || '').trim();
    const pid = row[LIVE.playerId - 1];
    if (name && pid) playerIdByName[name] = String(pid).replace(/\.0$/, '');

    const teamName = String(row[LIVE.team - 1] || '').trim();
    const tid = String(row[LIVE.teamId - 1] || '').trim();
    if (teamName && tid) teamIdByName[teamName] = tid;
  });

  return { playerIdByName: playerIdByName, teamIdByName: teamIdByName };
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore REST
// ─────────────────────────────────────────────────────────────────────────────

function batchWrite_(writes, token) {
  const projectId = getProjectId_();
  const url =
    'https://firestore.googleapis.com/v1/projects/' + projectId +
    '/databases/(default)/documents:batchWrite';

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ writes: writes }),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('batchWrite failed (HTTP ' + code + '): ' + res.getContentText());
  }

  // A 200 can still contain per-write failures — check them.
  const body = JSON.parse(res.getContentText());
  const failures = (body.status || []).filter(function (s) {
    return s.code && s.code !== 0;
  });
  if (failures.length > 0) {
    throw new Error('batchWrite partial failure: ' + JSON.stringify(failures.slice(0, 5)));
  }
  return body;
}

/**
 * One manifest doc per upload. The recompute function triggers on this rather
 * than on individual rows — otherwise a 20-row upload would wake the function
 * 20 times on partially-written data.
 */
function writeManifest_(eventId, gameIds, rowCount, token) {
  const projectId = getProjectId_();
  const docId = eventId + '_' + new Date().toISOString().replace(/[:.]/g, '-');
  const name =
    'projects/' + projectId + '/databases/(default)/documents/' +
    UPLOAD_CONFIG.manifestCollection + '/' + docId;

  const write = {
    update: {
      name: name,
      fields: {
        eventId: str_(eventId),
        affectedGameIds: {
          arrayValue: { values: gameIds.map(function (g) { return str_(g); }) },
        },
        rowCount: { integerValue: String(rowCount) },
        uploadedAt: { timestampValue: new Date().toISOString() },
      },
    },
  };
  batchWrite_([write], token);
}

/** Service-account JWT → OAuth access token. Cached for its lifetime. */
function getAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('firestore_access_token');
  if (cached) return cached;

  const props = PropertiesService.getScriptProperties();
  const clientEmail = props.getProperty('FIREBASE_CLIENT_EMAIL');
  const privateKey = (props.getProperty('FIREBASE_PRIVATE_KEY') || '').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error('Missing FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in Script properties.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const toSign =
    base64url_(JSON.stringify(header)) + '.' + base64url_(JSON.stringify(claim));
  const signature = Utilities.computeRsaSha256Signature(toSign, privateKey);
  const jwt = toSign + '.' + Utilities.base64EncodeWebSafe(signature).replace(/=+$/, '');

  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    },
    muteHttpExceptions: true,
  });

  if (res.getResponseCode() !== 200) {
    throw new Error('Token request failed: ' + res.getContentText());
  }

  const token = JSON.parse(res.getContentText()).access_token;
  cache.put('firestore_access_token', token, 3300); // just under the 1h expiry
  return token;
}

function getProjectId_() {
  const id = PropertiesService.getScriptProperties().getProperty('FIREBASE_PROJECT_ID');
  if (!id) throw new Error('Missing FIREBASE_PROJECT_ID in Script properties.');
  return id;
}

function base64url_(s) {
  return Utilities.base64EncodeWebSafe(s).replace(/=+$/, '');
}

// ── Firestore typed-value helpers ───────────────────────────────────────────

function str_(v) {
  return { stringValue: String(v == null ? '' : v) };
}

function num_(v) {
  if (v === '' || v === null || v === undefined || isNaN(Number(v))) {
    return { nullValue: null };
  }
  return { doubleValue: Number(v) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dry run
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reports exactly what uploadLongDataDelta() would send, and writes nothing.
 * Run this first.
 */
function dryRunLongDataUpload() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LD.sheetName);
  const lastRow = sheet.getLastRow();
  const numRows = lastRow - LD.firstDataRow + 1;
  const data = sheet.getRange(LD.firstDataRow, 1, numRows, LD.col.lastModified).getValues();
  const lookups = buildLookups_();
  const eventId = getEventId_();

  const pending = [];
  data.forEach(function (row, i) {
    const rowId = String(row[LD.col.rowId - 1] || '');
    if (!rowId) return;
    const state = String(row[LD.col.syncState - 1] || '').trim();
    if (state === UPLOAD_CONFIG.syncedValue || state === UPLOAD_CONFIG.reviewedSyncedValue) return;
    pending.push({ sheetIndex: i, rowId: rowId, row: row, priorState: state });
  });

  const errors = validateRows_(pending, lookups);
  const games = {};
  pending.forEach(function (p) {
    const round = String(p.row[LD.col.round - 1] || '').trim();
    const team = String(p.row[LD.col.team - 1] || '').trim();
    const opp = String(p.row[LD.col.opponent - 1] || '').trim();
    games[buildGameId_(eventId, round, team, opp, lookups)] = true;
  });

  const msg =
    'DRY RUN — nothing written\n\n' +
    'Rows pending upload: ' + pending.length + '\n' +
    'Games affected: ' + Object.keys(games).length + '\n' +
    'Batch requests needed: ' + Math.ceil(pending.length / UPLOAD_CONFIG.batchSize) + '\n' +
    'Validation errors: ' + errors.length +
    (errors.length ? '\n\n' + errors.slice(0, 25).join('\n') : '');

  Logger.log(msg);
  return { pending: pending.length, games: Object.keys(games).length, errors: errors };
}
