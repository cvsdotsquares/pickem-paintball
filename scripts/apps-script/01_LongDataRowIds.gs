/**
 * PHASE 1a — Row identity for Long Data
 * See LONG_DATA_MIGRATION.md §3.2
 *
 * Adds three columns to the Long Data sheet and stamps a permanent, opaque
 * identifier onto every populated row.
 *
 *   I  row_id         {eventId}_000001  — static value, NEVER a formula
 *   J  sync_state     blank | Reviewed | Synced | Reviewed - Synced
 *   K  last_modified  timestamp
 *
 * WHY OPAQUE: a semantic id (…_p4_100013_2) becomes a lie the moment a scorer
 * corrects a misattributed kill. Human revision is the whole use case, so the
 * id must carry no revisable meaning.
 *
 * WHY NOT A FORMULA: anything built on ROW(), RAND() or NOW() recalculates. An
 * id that changes causes re-uploads to duplicate instead of update.
 *
 * WHY THIS RUNS SEPARATELY FROM THE SUBMIT FLOW: assigning ids in one
 * lock-guarded pass (rather than inside each tracker's append) means the two
 * Stats Trackers can never race to mint the same id, and the existing submit
 * macro needs no changes.
 *
 * SAFE TO RE-RUN. Rows that already have an id are never touched.
 */

const LD = {
  sheetName: 'Long Data',
  // Existing columns A-H are Round|Date|Team|Opponent|Point|Player|Type|Weight
  firstDataRow: 2,
  col: {
    round: 1, date: 2, team: 3, opponent: 4,
    point: 5, player: 6, type: 7, weight: 8,
    rowId: 9, syncState: 10, lastModified: 11,
  },
  headers: { 9: 'row_id', 10: 'sync_state', 11: 'last_modified' },
};

/** Event id — must match the Firestore `events/{id}` document id exactly. */
function getEventId_() {
  // Mirrors EVENT_DETAILS.id in the existing upload macro.
  return 'mid_west_open_2026';
}

/**
 * Assigns row_id + last_modified to every populated row that lacks one.
 * Idempotent. Called automatically by the upload; also runnable by hand to
 * backfill.
 *
 * @return {{assigned: number, skipped: number, total: number}}
 */
function ensureRowIds() {
  const lock = LockService.getScriptLock();
  // Generous wait: this may run alongside a scorer submitting a point.
  if (!lock.tryLock(30000)) {
    throw new Error('ensureRowIds: could not acquire lock — another run is in progress.');
  }

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LD.sheetName);
    if (!sheet) throw new Error('Sheet not found: ' + LD.sheetName);

    ensureHeaders_(sheet);

    const lastRow = sheet.getLastRow();
    if (lastRow < LD.firstDataRow) return { assigned: 0, skipped: 0, total: 0 };

    const numRows = lastRow - LD.firstDataRow + 1;
    const eventId = getEventId_();

    // Read the whole block once — per-cell reads are the classic Apps Script
    // performance trap.
    const data = sheet
      .getRange(LD.firstDataRow, 1, numRows, LD.col.lastModified)
      .getValues();

    let maxSeq = 0;
    const prefix = eventId + '_';
    data.forEach(function (row) {
      const id = String(row[LD.col.rowId - 1] || '');
      if (id.indexOf(prefix) === 0) {
        const seq = parseInt(id.slice(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });

    const now = new Date();
    const idCol = [];
    const tsCol = [];
    let assigned = 0;
    let skipped = 0;

    data.forEach(function (row) {
      const existingId = row[LD.col.rowId - 1];
      const existingTs = row[LD.col.lastModified - 1];

      if (existingId) {
        idCol.push([existingId]);
        tsCol.push([existingTs || now]);
        return;
      }

      // Only populated rows get an id. This also skips the #N/A / blank rows
      // that appear in the sheet, so the upload never sees them.
      if (!isPopulatedRow_(row)) {
        idCol.push(['']);
        tsCol.push(['']);
        skipped++;
        return;
      }

      maxSeq++;
      idCol.push([eventId + '_' + padSeq_(maxSeq)]);
      tsCol.push([now]);
      assigned++;
    });

    // Two bulk writes rather than 2n cell writes.
    sheet.getRange(LD.firstDataRow, LD.col.rowId, numRows, 1).setValues(idCol);
    sheet.getRange(LD.firstDataRow, LD.col.lastModified, numRows, 1).setValues(tsCol);
    SpreadsheetApp.flush();

    Logger.log('ensureRowIds: assigned=%s skipped=%s total=%s', assigned, skipped, numRows);
    return { assigned: assigned, skipped: skipped, total: numRows };
  } finally {
    lock.releaseLock();
  }
}

/**
 * A row counts as real data if it has a team and a player. The malformed rows
 * observed in the workbook (#N/A rows, fully blank rows) fail this.
 */
function isPopulatedRow_(row) {
  const team = String(row[LD.col.team - 1] || '').trim();
  const player = String(row[LD.col.player - 1] || '').trim();
  if (!team || !player) return false;
  if (team === '#N/A' || player === '#N/A') return false;
  return true;
}

function padSeq_(n) {
  let s = String(n);
  while (s.length < 6) s = '0' + s;
  return s;
}

/** Writes the three column headers if they aren't already present. */
function ensureHeaders_(sheet) {
  Object.keys(LD.headers).forEach(function (colStr) {
    const col = parseInt(colStr, 10);
    const cell = sheet.getRange(1, col);
    if (String(cell.getValue() || '').trim() !== LD.headers[col]) {
      cell.setValue(LD.headers[col]);
    }
  });
}

/**
 * ONE-OFF BACKFILL for the existing rows. Identical to ensureRowIds() — it is
 * idempotent, so this is just a clearly-named entry point to run from the
 * editor. Run once, check the Long Data sheet, then never think about it again.
 */
function backfillRowIds() {
  const result = ensureRowIds();
  Logger.log(
    'Backfill complete. assigned=%s skipped=%s scanned=%s',
    result.assigned, result.skipped, result.total
  );
  return result;
}

/**
 * SAFETY CHECK — run before the first upload.
 * Reports anything that would produce bad data downstream, without changing
 * the sheet.
 */
function auditLongData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LD.sheetName);
  const lastRow = sheet.getLastRow();
  const numRows = lastRow - LD.firstDataRow + 1;
  const data = sheet.getRange(LD.firstDataRow, 1, numRows, LD.col.lastModified).getValues();

  const problems = { nullWeight: [], noId: [], malformed: [], zeroWeight: [] };

  data.forEach(function (row, i) {
    const sheetRow = i + LD.firstDataRow;
    if (!isPopulatedRow_(row)) {
      if (String(row[LD.col.round - 1] || '').trim() !== '') problems.malformed.push(sheetRow);
      return;
    }
    const w = row[LD.col.weight - 1];
    if (w === '' || w === null || w === undefined) problems.nullWeight.push(sheetRow);
    else if (Number(w) === 0) problems.zeroWeight.push(sheetRow);
    if (!row[LD.col.rowId - 1]) problems.noId.push(sheetRow);
  });

  const summary =
    'Long Data audit (' + numRows + ' rows scanned)\n\n' +
    'Null weight (these silently count as zero): ' + problems.nullWeight.length +
    (problems.nullWeight.length ? ' → rows ' + problems.nullWeight.slice(0, 20).join(', ') : '') + '\n' +
    'Voided (weight 0, expected if tombstoned): ' + problems.zeroWeight.length + '\n' +
    'Missing row_id: ' + problems.noId.length + '\n' +
    'Malformed: ' + problems.malformed.length +
    (problems.malformed.length ? ' → rows ' + problems.malformed.slice(0, 20).join(', ') : '');

  Logger.log(summary);
  return problems;
}
