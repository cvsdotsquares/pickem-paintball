/**
 * Add clubs to `projections/nxlHistoryMeta.clubTeamId` that the history file has and
 * Firestore does not, so a club's first event can link its players.
 *
 *   node scripts/nxl-history/add-club-team-ids.mjs            # dry run: what it would add
 *   node scripts/nxl-history/add-club-team-ids.mjs --write    # add them, then verify
 *
 * WHY A SEPARATE SCRIPT. seed-events.mjs writes the meta document with `create`, once,
 * and refuses when it exists - so a club added to CLUB_TEAM_ID later never reaches
 * Firestore, where the live crawl's deriveAppearances reads it. This copies across ONLY
 * the missing entries, field by field: it never changes or removes an existing mapping,
 * and refuses if Firestore already gives a club a different team_id, or the same team_id
 * to a different club (that would put one team's players under two clubs).
 */

import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const HISTORY = require("../../functions/data/nxlHistory.json");
const { META_DOC } = require("../../functions/nxlEventsStore.js");

const WRITE = process.argv.includes("--write");

admin.initializeApp({ projectId: "fantasy-paintball" });
const db = admin.firestore();
const ref = db.doc(META_DOC);

const snap = await ref.get();
if (!snap.exists) {
  console.error(`❌ ${META_DOC} does not exist. Seed it with seed-events.mjs instead.`);
  process.exit(1);
}
const current = snap.get("clubTeamId") || {};
const owner = new Map(Object.entries(current).map(([club, id]) => [id, club]));

const add = {};
const conflicts = [];
for (const [club, id] of Object.entries(HISTORY.clubTeamId)) {
  if (current[club] === id) continue;
  if (current[club] !== undefined) conflicts.push(`${club}: Firestore ${current[club]}, file ${id}`);
  else if (owner.has(id)) conflicts.push(`${id}: Firestore gives it to ${owner.get(id)}, file to ${club}`);
  else add[club] = id;
}
const extra = Object.keys(current).filter((c) => !(c in HISTORY.clubTeamId));

console.log(`${META_DOC}.clubTeamId: ${Object.keys(current).length} in Firestore, ${Object.keys(HISTORY.clubTeamId).length} in the file`);
if (extra.length) console.log(`  in Firestore only (left alone): ${extra.join(", ")}`);
console.log(`  to add: ${Object.keys(add).length ? Object.entries(add).map(([c, id]) => `${c} → ${id}`).join(", ") : "nothing"}`);
if (conflicts.length) {
  console.error(`\n❌ Refusing: ${conflicts.join("; ")}`);
  process.exit(1);
}
if (!Object.keys(add).length) process.exit(0);
if (!WRITE) {
  console.log("\nDry run. Nothing written. Re-run with --write to add them.");
  process.exit(0);
}

/* FieldPath, not a dotted string: a club name may contain a space or a "." */
const args = Object.entries(add).flatMap(([club, id]) => [new admin.firestore.FieldPath("clubTeamId", club), id]);
await ref.update(...args);

const back = (await ref.get()).get("clubTeamId") || {};
for (const [club, id] of Object.entries({ ...current, ...add })) {
  if (back[club] !== id) {
    console.error(`❌ Read back: ${club} is ${back[club]}, expected ${id}`);
    process.exit(1);
  }
}
console.log(`\n✅ Added ${Object.keys(add).length}; read back, every existing mapping unchanged.`);
process.exit(0);
