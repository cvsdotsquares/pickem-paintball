/**
 * Archive player id → the id that exists today.
 *
 * The workbooks were exported on 2 Aug, three weeks before the 22 Aug identity fix.
 * Their `player_id` column is therefore correct-as-of-then but stale now: the fix
 * retired eight duplicate ids and renumbered a block of eleven Atlantic City slots.
 *
 * Resolving by id and remapping is strictly better than matching on names. An id is
 * exact — it does not care that the scorer typed "Matthew Askren" where the roster says
 * "Matt", or "Sebastian Ivan Lopez" where it says "Ivan". Name matching was a workaround
 * for dropping this path entirely, which was the wrong call.
 *
 * Both tables are imported from `identity-fix-plan.mjs` rather than copied, so this can
 * never drift from what was actually applied to Firestore.
 */

import { AC, AC_MOVES, MERGES } from "../identity-fix-plan.mjs";

/** retired id → surviving id, applied at every event. */
const MERGE_MAP = new Map(MERGES.map((m) => [m.retire, m.keep]));

/** Atlantic City only: the renumbered block. */
const AC_MAP = new Map(Object.entries(AC_MOVES));

export function remapArchiveId(eventId, archiveId) {
  if (!archiveId) return null;
  let id = String(archiveId).trim().replace(/\.0$/, "");
  if (!id) return null;
  // Order matters: the AC renumber ran first, then merges were applied on the result.
  if (eventId === AC && AC_MAP.has(id)) id = AC_MAP.get(id);
  if (MERGE_MAP.has(id)) id = MERGE_MAP.get(id);
  return id;
}

export const REMAP_SUMMARY = {
  merges: MERGES.length,
  acMoves: AC_MAP.size,
};
