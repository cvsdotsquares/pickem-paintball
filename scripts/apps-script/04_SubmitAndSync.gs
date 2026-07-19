/**
 * PHASE 1c — Button entry points (replaces combine.gs)
 * See LONG_DATA_MIGRATION.md §4
 *
 * The Stats Tracker buttons point at SubmitAndSync1 / SubmitAndSync2, so those
 * names must not change.
 *
 * ── POST-CUTOVER (Phase 4) ───────────────────────────────────────────────────
 * Each submit does three things:
 *   1. flatten the tracker form into Long Data   (+ row_id, under a lock)
 *   2. syncRoster()          — metadata only, batched + diffed  (~0-2s)
 *   3. uploadLongDataDelta() — the changed rows, one batch       (~1-2s)
 *
 * Stats are no longer uploaded at all: the recompute Cloud Function derives
 * Confirmed Kills, the type splits and Rank from the long rows, then bumps
 * events.last_updated to fire recalculateLeaderboard.
 *
 * This replaced uploadEventWithPlayers(), which rewrote all 218 player
 * documents one HTTP request at a time on EVERY submit (~52s). Total is now
 * roughly 3-5s.
 *
 * Step 3 is no longer wrapped in a try/catch — it is now the path that carries
 * the scores, so a failure must surface loudly rather than be swallowed.
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

  // ── 2. Roster metadata — name, team, cost, status, photo ─────────────────
  // Diffed, so this usually writes nothing. Non-fatal: stale metadata is bad
  // (an injured player still showing as Confirmed) but it must not stop the
  // scores getting through.
  let rosterNote = '';
  try {
    const r = syncRoster();
    rosterNote = 'roster=' + r.written + '/' + r.total;
  } catch (error) {
    Logger.log('%s: syncRoster failed (non-fatal): %s', label, error.message);
    rosterNote = 'roster=FAILED';
  }

  const tRoster = Date.now();

  // ── 3. Long data — this now carries the scores ───────────────────────────
  // Deliberately NOT caught: before cutover this was the unproven parallel
  // path and failures were swallowed. It is now the only route by which kills
  // reach the site, so a failure has to be visible.
  try {
    uploadLongDataDelta();
  } catch (error) {
    Logger.log('%s: uploadLongDataDelta FAILED: %s', label, error.message);
    try {
      SpreadsheetApp.getUi().alert(
        'The point was recorded in the sheet, but the scores did NOT reach the site.\n\n' +
        error.message + '\n\nFix the issue and submit again — the rows will retry.'
      );
    } catch (e) {}
    throw error;
  }

  const tLong = Date.now();

  Logger.log(
    '%s complete in %sms | submit=%sms roster=%sms longData=%sms | %s',
    label,
    tLong - started,
    tSubmit - started,
    tRoster - tSubmit,
    tLong - tRoster,
    rosterNote
  );
}
