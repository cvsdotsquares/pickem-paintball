/**
 * PHASE 1c — Stats Tracker submit, with row identity stamped at entry time
 * See LONG_DATA_MIGRATION.md §3.2
 *
 * REPLACES the existing StatsTracker1() / StatsTracker2() functions. The entry
 * point names are unchanged, so existing buttons and menu items keep working.
 *
 * Two changes from the original:
 *
 * 1. LOCKING — FIXES AN EXISTING DATA-LOSS BUG.
 *    The original read `longDataSheet.getLastRow()` and then wrote, with no
 *    lock. Two scorers submitting simultaneously both computed the SAME
 *    destination row, and the second write silently overwrote the first — a
 *    whole point of kills lost, with no error. Both trackers now serialise
 *    through one script lock, so the read-then-write is atomic.
 *
 * 2. ROW IDENTITY AT ENTRY.
 *    row_id and last_modified are stamped onto exactly the rows just appended.
 *    Stamping here (rather than at upload) means last_modified records when the
 *    data was ENTERED, which is what makes it useful as an audit trail.
 *
 * `ensureRowIds()` in 01_LongDataRowIds.gs is retained as a safety net: it
 * still catches any row that arrives another way (manual paste, backfill, or a
 * submit that failed after writing but before stamping).
 */

/** Entry points — names preserved so existing buttons keep working. */
function StatsTracker1() {
  return submitStatsTracker_('Stats Tracker 1');
}

function StatsTracker2() {
  return submitStatsTracker_('Stats Tracker 2');
}

/**
 * Shared implementation. The two trackers were byte-identical apart from the
 * sheet name; one copy means a fix applies to both.
 *
 * @param {string} trackerSheetName
 */
function submitStatsTracker_(trackerSheetName) {
  const spreadsheet = SpreadsheetApp.getActive();
  const statsTrackerSheet = spreadsheet.getSheetByName(trackerSheetName);
  const longDataSheet = spreadsheet.getSheetByName('Long Data');
  const listsSheet = spreadsheet.getSheetByName('Lists');

  if (!statsTrackerSheet || !longDataSheet || !listsSheet) {
    const msg = 'One or more sheets are missing. Please check the sheet names.';
    Logger.log('Error: ' + msg);
    showError_(msg);
    return;
  }

  const DATA_START_ROW = 26; // flattened "Organised DF" block

  // ── Read the flattened rows from the tracker ──────────────────────────────
  const lastRowStats = statsTrackerSheet.getLastRow();
  if (lastRowStats < DATA_START_ROW) {
    showError_('No data found in ' + trackerSheetName + '.');
    return;
  }

  const scanned = statsTrackerSheet
    .getRange('J' + DATA_START_ROW + ':Q' + lastRowStats)
    .getValues();

  // Keep only populated rows — and keep the ROWS THEMSELVES, not just a count.
  // The original counted non-empty rows and then re-read a contiguous block of
  // that length, which silently grabbed the wrong rows if the flattened block
  // ever contained a gap.
  //
  // "Populated" must mean the SAME thing here as in ensureRowIds(): a row needs
  // a Team and a Player. A looser `row.some(cell => cell !== '')` test lets
  // through rows where only the Round/Date formulas still evaluate after the
  // form is cleared — those get appended, get stamped with a row_id, and then
  // fail upload validation with "missing Team / Player / Weight".
  //
  // Flattened columns J:Q map to Long Data A:H —
  //   0 Round | 1 Date | 2 Team | 3 Opponent | 4 Point | 5 Player | 6 Type | 7 Weight
  const COL_TEAM = 2;
  const COL_PLAYER = 5;
  const actualData = scanned.filter(function (row) {
    const team = String(row[COL_TEAM] == null ? '' : row[COL_TEAM]).trim();
    const player = String(row[COL_PLAYER] == null ? '' : row[COL_PLAYER]).trim();
    if (!team || !player) return false;
    if (team === '#N/A' || player === '#N/A') return false;
    return true;
  });

  if (actualData.length === 0) {
    showError_('No data found in ' + trackerSheetName + '.');
    return;
  }

  const rowCount = actualData.length;

  // ── Append + stamp, under one lock ────────────────────────────────────────
  // Everything between reading getLastRow() and stamping the new rows must be
  // atomic with respect to the other tracker.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    showError_('Another submit is in progress. Please try again in a moment.');
    return;
  }

  let firstRow;
  try {
    firstRow = longDataSheet.getLastRow() + 1;

    // Columns A-H only — I/J/K (row_id, sync_state, last_modified) are ours.
    longDataSheet.getRange(firstRow, 1, rowCount, 8).setValues(actualData);

    stampNewRows_(longDataSheet, firstRow, rowCount);
    SpreadsheetApp.flush();
  } catch (error) {
    Logger.log('Error during append: ' + error.message);
    showError_('Submit failed: ' + error.message);
    return;
  } finally {
    lock.releaseLock();
  }

  // ── Reset the tracker form (unchanged behaviour) ──────────────────────────
  try {
    const sourceValues = listsSheet.getRange('M5:M14').getValues();
    while (sourceValues.length < 10) sourceValues.push(['']);

    statsTrackerSheet.getRange('F10:F19').setValues(sourceValues);
    statsTrackerSheet.getRange('K10:K19').setValues(sourceValues);

    statsTrackerSheet.getRange('D5').clearContent();
    statsTrackerSheet.getRange('D10:E19').clearContent();
    statsTrackerSheet.getRange('I10:J19').clearContent();

    spreadsheet.setActiveSheet(statsTrackerSheet);
  } catch (error) {
    // The data is already safely in Long Data — a form-reset failure must not
    // look like a failed submit.
    Logger.log('Warning: form reset failed after successful append: ' + error.message);
  }

  SpreadsheetApp.flush();
  Logger.log('%s: appended %s row(s) at row %s', trackerSheetName, rowCount, firstRow);
}

/**
 * Stamps row_id and last_modified onto the rows just appended.
 *
 * Called inside the caller's lock, so the max-sequence scan can't race another
 * tracker. IDs are static values — never formulas, which would recalculate and
 * cause re-uploads to duplicate instead of update.
 */
function stampNewRows_(longDataSheet, firstRow, rowCount) {
  const eventId = getEventId_(); // from 01_LongDataRowIds.gs
  const prefix = eventId + '_';

  // Highest existing sequence for this event.
  let maxSeq = 0;
  if (firstRow > LD.firstDataRow) {
    const existing = longDataSheet
      .getRange(LD.firstDataRow, LD.col.rowId, firstRow - LD.firstDataRow, 1)
      .getValues();
    existing.forEach(function (r) {
      const id = String(r[0] || '');
      if (id.indexOf(prefix) === 0) {
        const seq = parseInt(id.slice(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
  }

  const now = new Date();
  const ids = [];
  const stamps = [];
  for (let i = 0; i < rowCount; i++) {
    maxSeq++;
    ids.push([eventId + '_' + padSeq_(maxSeq)]);
    stamps.push([now]);
  }

  longDataSheet.getRange(firstRow, LD.col.rowId, rowCount, 1).setValues(ids);
  longDataSheet.getRange(firstRow, LD.col.lastModified, rowCount, 1).setValues(stamps);
  // sync_state is deliberately left blank — that's what marks these rows as
  // pending upload.
}

function showError_(msg) {
  Logger.log('Error: ' + msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    // No UI available (trigger context) — the log entry is enough.
  }
}
