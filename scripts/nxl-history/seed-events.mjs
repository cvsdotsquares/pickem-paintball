/**
 * Copy the history file into Firestore: one `nxlEvents` document per event, plus
 * `projections/nxlHistoryMeta`. See functions/nxlEventsStore.js for the shape.
 *
 *   node scripts/nxl-history/seed-events.mjs            # dry run: what it would write
 *   node scripts/nxl-history/seed-events.mjs --write    # create the documents, then verify
 *
 * ADDITIVE ONLY. Every document is written with `create`, which fails if it already
 * exists, so this can never overwrite an event — including one the live crawler owns.
 * Nothing reads `nxlEvents` until the functions that load from it are deployed, so
 * seeding changes nothing on the site.
 *
 * After writing, the whole collection is read back and converted to the file's shape,
 * and must equal the file exactly.
 */

import admin from "firebase-admin";
import assert from "node:assert";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const HISTORY = require("../../functions/data/nxlHistory.json");
const { COLLECTION, META_DOC, docsFromHistory, historyFromDocs, loadHistory } = require(
  "../../functions/nxlEventsStore.js",
);

const WRITE = process.argv.includes("--write");

admin.initializeApp({ projectId: "fantasy-paintball" });
const db = admin.firestore();

const { events, meta } = docsFromHistory(HISTORY);

// The conversion must be lossless before anything is written.
const offline = historyFromDocs(
  JSON.parse(JSON.stringify(events.map((e) => e.data))),
  JSON.parse(JSON.stringify(meta)),
);
for (const f of ["clubTeamId", "names", "events", "appearances", "appearancesByEpid"]) {
  assert.deepStrictEqual(offline[f], HISTORY[f], `round trip changed ${f}`);
}

const refs = [...events.map((e) => db.collection(COLLECTION).doc(e.id)), db.doc(META_DOC)];
const existing = (await db.getAll(...refs)).filter((s) => s.exists).map((s) => s.ref.path);

console.log(`${events.length} events -> ${COLLECTION}/{id}, plus ${META_DOC}`);
console.log(`  first ${events[0].id}, last ${events.at(-1).id}`);
console.log(`  already present: ${existing.length ? existing.join(", ") : "none"}`);

if (!WRITE) {
  console.log("\nDry run. Nothing written. Re-run with --write to create them.");
  process.exit(0);
}
if (existing.length) {
  console.error("\n❌ Refusing to write: some documents already exist (see above).");
  process.exit(1);
}

const batch = db.batch();
for (const e of events) batch.create(db.collection(COLLECTION).doc(e.id), e.data);
batch.create(db.doc(META_DOC), meta);
await batch.commit();
console.log(`\n✅ Created ${events.length + 1} documents.`);

const back = await loadHistory(db);
for (const f of ["clubTeamId", "names", "events", "appearances", "appearancesByEpid"]) {
  assert.deepStrictEqual(back[f], HISTORY[f], `Firestore copy differs from the file in ${f}`);
}
console.log("✅ Read back from Firestore: identical to the file.");
process.exit(0);
