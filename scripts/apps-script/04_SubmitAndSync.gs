/**
 * PHASE 1c — Button entry points (replaces combine.gs)
 * See LONG_DATA_MIGRATION.md §4
 *
 * The Stats Tracker buttons point at SubmitAndSync1 / SubmitAndSync2, so those
 * names must not change.
 *
 * ── DURING THE PARALLEL RUN (now) ────────────────────────────────────────────
 * Each submit does three things:
 *   1. flatten the tracker form into Long Data   (+ row_id, under a lock)
 *   2. uploadEventWithPlayers()   — the OLD path, keeps the live site correct
 *   3. uploadLongDataDelta()      — the NEW path, feeds long_data / _v2
 *
 * Step 2 is the slow one (~52s: 218 player documents, one HTTP request each).
 * Step 3 adds only a second or two because it sends just the new rows in a
 * single batched request.
 *
 * Step 3 is wrapped in its own try/catch and runs LAST, deliberately. The new
 * pipeline is unproven in live conditions, and it must not be able to break
 * live scoring. If it fails, the live site is already updated and the rows stay
 * unsynced — the next submit retries them automatically.
 *
 * ── AT CUTOVER (Phase 4) ─────────────────────────────────────────────────────
 * Delete step 2. Submits then drop from ~52s to ~3s, and the try/catch around
 * step 3 should be removed so failures surface loudly instead of being
 * swallowed.
 */

function SubmitAndSync1() {
  return submitAndSync_('Stats Tracker 1', StatsTracker1);
}

function SubmitAndSync2() {
  return submitAndSync_('Stats Tracker 2', StatsTracker2);
}

/**
 * @param {string} label            for logging only
 * @param {Function} trackerSubmit  StatsTracker1 or StatsTracker2
 */
function submitAndSync_(label, trackerSubmit) {
  const started = Date.now();

  // ── 1. Flatten into Long Data ────────────────────────────────────────────
  // Now lock-guarded and stamps row_id / last_modified (see 03_StatsTrackerSubmit).
  // If this fails the point was not recorded, so stop — there is nothing to sync.
  try {
    trackerSubmit();
  } catch (error) {
    Logger.log('%s: submit FAILED — nothing recorded: %s', label, error.message);
    try {
      SpreadsheetApp.getUi().alert(
        'Submit failed — the point was NOT recorded.\n\n' + error.message
      );
    } catch (e) {}
    return;
  }

  const tSubmit = Date.now();

  // ── 2. OLD path — keeps the live site correct. REMOVE AT CUTOVER. ────────
  try {
    uploadEventWithPlayers();
  } catch (error) {
    Logger.log('%s: uploadEventWithPlayers FAILED: %s', label, error.message);
    try {
      SpreadsheetApp.getUi().alert(
        'The point was recorded in the sheet, but the site did not update.\n\n' +
        error.message
      );
    } catch (e) {}
    // Continue to step 3 regardless — the long-data path is independent.
  }

  const tOld = Date.now();

  // ── 3. NEW path — parallel run. Must never break live scoring. ───────────
  let newPathNote = '';
  try {
    uploadLongDataDelta();
    newPathNote = 'longData=ok';
  } catch (error) {
    // Deliberately swallowed. The rows keep an empty sync_state, so the next
    // submit picks them up. Nothing is lost, and scoring continues.
    Logger.log('%s: uploadLongDataDelta failed (non-fatal, will retry): %s', label, error.message);
    newPathNote = 'longData=FAILED (' + error.message + ')';
  }

  const tNew = Date.now();

  Logger.log(
    '%s complete in %sms | submit=%sms uploadPlayers=%sms longData=%sms | %s',
    label,
    tNew - started,
    tSubmit - started,
    tOld - tSubmit,
    tNew - tOld,
    newPathNote
  );
}
