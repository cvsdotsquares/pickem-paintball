/**
 * Undoes the misdirected syncRoster() of 2 Sep 2026, which wrote the Lone Star
 * roster into the finished `mid_west_open_2026` event.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 * Firestore has no undo, so "restore" here means writing the previous values back.
 * Source: scripts/backups/midwest-pre-sync-2026-09-02.json — a read of the live
 * collection taken ~08:30, before the 09:08 sync. Cross-checked against the archived
 * spreadsheet (~/Downloads/PickEm Paintball - Mid West Open 2026.xlsx): both hold the
 * same 218 players and agree on every field except four corrections made that morning
 * (Leival + Blue league_ids, the COl→COL team typo, and the Dustin Cort name), where
 * the snapshot is the correct one. That is why we restore from the snapshot and not
 * from the spreadsheet.
 *
 * Only roster-owned fields are touched (ROSTER_CONFIG.fields in 06_RosterSync.gs).
 * Stats are recompute-owned and are left exactly as they are.
 *
 *   node scripts/restore-midwest-roster.mjs          # dry run
 *   node scripts/restore-midwest-roster.mjs --apply
 */

import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const EVENT = "mid_west_open_2026";
const FIELDS = ["league_id", "img_url", "team_id", "Player", "Status", "Number", "Team", "Cost"];

const snap = JSON.parse(fs.readFileSync(new URL("./backups/midwest-pre-sync-2026-09-02.json", import.meta.url)));
const BEFORE = snap.players;

const { initializeApp, applicationDefault, getApps } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: "fantasy-paintball" });
const db = getFirestore();

const col = db.collection("events").doc(EVENT).collection("players");
const live = await col.get();

const updates = [];
const deletes = [];
const backup = {};

for (const d of live.docs) {
  const cur = d.data();
  const was = BEFORE[d.id];
  if (!was) { deletes.push({ id: d.id, name: cur.Player, team: cur.team_id }); backup[d.id] = cur; continue; }
  const diff = {};
  for (const f of FIELDS) {
    const a = was[f] === "" ? undefined : was[f];
    const b = cur[f];
    const same = String(a ?? "") === String(b ?? "") ||
      (f === "Cost" && Math.round(Number(a) || 0) === Math.round(Number(b) || 0));
    if (!same && a !== undefined) diff[f] = { from: b, to: a };
  }
  if (Object.keys(diff).length) { updates.push({ id: d.id, name: cur.Player, diff }); backup[d.id] = cur; }
}

const missing = Object.keys(BEFORE).filter((id) => !live.docs.some((d) => d.id === id));

console.log(`\n${APPLY ? "APPLYING" : "DRY RUN — nothing is written"}`);
console.log("=".repeat(74));
console.log(`live now: ${live.size}   snapshot: ${Object.keys(BEFORE).length}`);

console.log(`\nDELETE — on the roster now, absent from the snapshot [${deletes.length}]`);
deletes.forEach((x) => console.log(`   ${x.id}  ${x.name} (${x.team})`));

const byField = {};
updates.forEach((u) => Object.keys(u.diff).forEach((f) => (byField[f] = (byField[f] ?? 0) + 1)));
console.log(`\nRESTORE — fields to put back [${updates.length} players]`);
Object.entries(byField).forEach(([f, n]) => console.log(`   ${f}: ${n}`));
console.log("\n   sample:");
updates.slice(0, 5).forEach((u) =>
  console.log(`   ${u.id} ${u.name}: ` + Object.entries(u.diff).map(([f, v]) => `${f} "${v.from}" -> "${v.to}"`).join("; ")));

if (missing.length) console.log(`\n⚠ in snapshot but missing from Firestore [${missing.length}]: ${missing.join(", ")}`);

if (!APPLY) { console.log("\nRe-run with --apply to write."); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const path = `scripts/backups/midwest-restore-undo-${stamp}.json`;
fs.writeFileSync(path, JSON.stringify({ createdAt: new Date().toISOString(), note: "State immediately before restore-midwest-roster.mjs ran. Deleted docs are here in full.", players: backup }, null, 2));
console.log(`\nbackup written: ${path}`);

const batch = db.batch();
for (const u of updates) {
  batch.update(col.doc(u.id), Object.fromEntries(Object.entries(u.diff).map(([f, v]) => [f, v.to])));
}
for (const x of deletes) batch.delete(col.doc(x.id));
await batch.commit();
console.log(`✅ restored ${updates.length} players, deleted ${deletes.length}`);
