/**
 * Put back what the misdirected sync of 2 Sep took off `mid_west_open_2026`.
 *
 *   node scripts/restore-midwest-participation.mjs           # dry run, writes nothing
 *   node scripts/restore-midwest-participation.mjs --write
 *
 * WHAT WAS LOST AND WHY
 * On 2 Sep a `syncRoster()` was pointed at the wrong event and wrote the Lone Star
 * roster into the finished Mid West event. `restore-midwest-roster.mjs` put back the
 * ROSTER-owned fields — league_id, img_url, team_id, Player, Status, Number, Team,
 * Cost — and deliberately stopped there, because participation is not roster-owned.
 * So it never came back, and all 218 players have read as "unknown" ever since.
 *
 * That is why the projection cannot be rebuilt: `kind` is derived from `participation`,
 * so a rebuild would flip 38 players from a correctly-marked DNP to "played" and hand
 * them a share of a tournament they were not at.
 *
 * WHAT COMES BACK
 *   participation        played / absent
 *   participationReason  "scored", "off team sheet", "roster flag: Out" ...
 *   eventId, playerId    written by longDataRecompute, lost in the same write
 *
 * NOT participationAt or recomputedAt: the snapshot serialised both as empty strings,
 * so the original instants are simply gone. Inventing a timestamp would date the verdict
 * to today, which is the one thing worse than not having one — nothing reads them.
 *
 * ONLY BLANKS ARE FILLED. If a field already has a value it is left alone and reported,
 * so this can be re-run safely and cannot overwrite anything decided since.
 */

import fs from "node:fs";
import admin from "firebase-admin";

const EVENT = "mid_west_open_2026";
/** Lost with the same write; the projection still remembers it. */
const BRAND_COLOR = "#929889";
const FIELDS = ["participation", "participationReason", "eventId", "playerId"];

const WRITE = process.argv.includes("--write");

admin.initializeApp({ projectId: "fantasy-paintball" });
const db = admin.firestore();

const snapshot = JSON.parse(
  fs.readFileSync(new URL("./backups/midwest-pre-sync-2026-09-02.json", import.meta.url), "utf8"),
);
const before = snapshot.players;
console.log(`\nSnapshot: ${snapshot.count} players, taken ${snapshot.createdAt ?? "(no timestamp)"}`);
if (snapshot.note) console.log(`  "${snapshot.note}"`);

const live = await db.collection(`events/${EVENT}/players`).get();

const writes = [];
const missingFromSnapshot = [];
const alreadySet = [];
const counts = { played: 0, absent: 0 };
const reasons = {};

for (const d of live.docs) {
  const was = before[d.id];
  if (!was) { missingFromSnapshot.push(`${d.id} ${d.get("Player")}`); continue; }

  const patch = {};
  for (const f of FIELDS) {
    const value = was[f];
    if (value == null || value === "") continue;
    const current = d.get(f);
    if (current != null && current !== "") {
      if (String(current) !== String(value)) {
        alreadySet.push(`${d.id} ${d.get("Player")} ${f}: live=${current} snapshot=${value}`);
      }
      continue; // never overwrite
    }
    patch[f] = value;
  }

  if (was.participation && !d.get("participation")) {
    counts[was.participation] = (counts[was.participation] ?? 0) + 1;
    if (was.participation === "absent") {
      const r = was.participationReason ?? "(none)";
      reasons[r] = (reasons[r] ?? 0) + 1;
    }
  }
  if (Object.keys(patch).length) writes.push({ ref: d.ref, patch, name: d.get("Player") });
}

const eventDoc = await db.doc(`events/${EVENT}`).get();
const brandLive = eventDoc.get("brand_color");
const brandNeeded = !brandLive;

console.log(`\nLive roster: ${live.size} players`);
console.log(`  documents to restore     ${writes.length}`);
console.log(`  not in the snapshot      ${missingFromSnapshot.length}`);
missingFromSnapshot.slice(0, 5).forEach((x) => console.log(`     ${x}`));
console.log(`\nParticipation being restored:`);
console.log(`  played ${counts.played ?? 0}   absent ${counts.absent ?? 0}`);
Object.entries(reasons).forEach(([r, n]) => console.log(`     ${r}: ${n}`));
console.log(`\nEvent brand_color: ${brandNeeded ? `missing, restoring ${BRAND_COLOR}` : `already ${brandLive}, leaving it`}`);

if (alreadySet.length) {
  console.error(`\n❌ ${alreadySet.length} field(s) already hold a DIFFERENT value:`);
  alreadySet.slice(0, 8).forEach((x) => console.error(`     ${x}`));
  console.error(`\nRefusing to write. This script fills blanks; it does not settle disagreements.\n`);
  process.exit(1);
}
console.log(`\n✅ Every write fills a blank. Nothing decided since 2 Sep is touched.`);

if (!WRITE) {
  console.log(`\nNo --write flag, so nothing was written.\n`);
  process.exit(0);
}

const BATCH = 400;
for (let i = 0; i < writes.length; i += BATCH) {
  const batch = db.batch();
  for (const w of writes.slice(i, i + BATCH)) batch.update(w.ref, w.patch);
  await batch.commit();
}
if (brandNeeded) await db.doc(`events/${EVENT}`).update({ brand_color: BRAND_COLOR });
console.log(`\nRestored ${writes.length} players${brandNeeded ? " and the event brand colour" : ""}.\n`);
process.exit(0);
