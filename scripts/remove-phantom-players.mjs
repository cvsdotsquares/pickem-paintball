/**
 * Remove two roster entries that describe nobody, after backing them up.
 *
 *   node scripts/remove-phantom-players.mjs           # dry run + backup
 *   node scripts/remove-phantom-players.mjs --write
 *
 * WHY ONLY TWO. Six players carry no league record and no kills. Four of them are on real
 * user teams — Henry Portillo was picked by eight people and captained by one — and
 * deleting those would leave picks pointing at players that no longer exist and break a
 * captain slot. They are hidden from the career pages and stats instead; see the rule in
 * `functions/playerSummaries.js`. These two are the only ones nobody picked.
 *
 * ⚠️ THIS DOES NOT STICK ON ITS OWN. `syncRoster()` writes rosters from the Google Sheet,
 * so any of these rows still present on the sheet comes back on the next roster upload.
 * The sheet is the source; this only clears what Firestore already holds.
 */

import fs from "node:fs";
import admin from "firebase-admin";

const TARGETS = [
  { id: "100350", name: "Norman Reitemyer", events: ["world_cup_2025"] },
  { id: "100405", name: "Matthew Helgeson", events: ["mid_atlantic_open_2026", "mid_west_open_2026"] },
];

const WRITE = process.argv.includes("--write");
admin.initializeApp({ projectId: "fantasy-paintball" });
const db = admin.firestore();

/** Refuse to delete anyone a user picked — re-checked here, not taken on trust. */
const users = await db.collection("users").get();
const picked = new Map();
for (const u of users.docs) {
  for (const [key, val] of Object.entries(u.get("pickems") ?? {})) {
    if (key.endsWith("_draft")) continue;
    const ids = Array.isArray(val) ? val : [val];
    for (const id of ids) {
      if (TARGETS.some((t) => t.id === String(id))) {
        picked.set(`${key}:${id}`, (picked.get(`${key}:${id}`) ?? 0) + 1);
      }
    }
  }
}
if (picked.size) {
  console.error(`\n❌ These are on real teams — refusing to delete:`);
  for (const [k, n] of picked) console.error(`   ${k} (${n} user(s))`);
  process.exit(1);
}
console.log(`\n✅ Checked ${users.size} users: neither player is picked by anyone.`);

const backup = { createdAt: new Date().toISOString(), note: "Pre-delete snapshot", docs: {} };
const deletes = [];
for (const t of TARGETS) {
  for (const ev of t.events) {
    const ref = db.doc(`events/${ev}/players/${t.id}`);
    const d = await ref.get();
    if (d.exists) { backup.docs[`events/${ev}/players/${t.id}`] = d.data(); deletes.push(ref); }
  }
  const sRef = db.doc(`playerSummaries/${t.id}`);
  const s = await sRef.get();
  if (s.exists) { backup.docs[`playerSummaries/${t.id}`] = s.data(); deletes.push(sRef); }
}

const file = new URL("./backups/phantom-players-pre-delete.json", import.meta.url);
fs.writeFileSync(file, JSON.stringify(backup, null, 2));
console.log(`\nBacked up ${Object.keys(backup.docs).length} document(s) to scripts/backups/phantom-players-pre-delete.json`);
Object.keys(backup.docs).forEach((p) => console.log(`   ${p}`));

if (!WRITE) { console.log(`\nNo --write flag, so nothing was deleted.\n`); process.exit(0); }
for (const ref of deletes) await ref.delete();
console.log(`\nDeleted ${deletes.length} document(s).\n`);
process.exit(0);
