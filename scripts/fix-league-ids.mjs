/**
 * Corrects `league_id` on player docs where the stored value belongs to nobody.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 * Each correction below is backed by two independent sources: the NXL roster crawl
 * (`~/Documents/nxl-pro-players/Player_Roster_Historic.csv`) and, where a headshot
 * exists, the league id embedded in the photo filename. The values currently stored
 * appear on no NXL Pro roster 2015-2026.
 *
 * `league_id` is owned by syncRoster(), so for any event whose pipeline is still
 * live the Live Data Google Sheet must be corrected too or the next submit reverts
 * this. See ROSTER_IDENTITY.md section 6.
 *
 * Uses firebase-admin: the Stage 1 rules make game data read-only to client SDKs,
 * and the Admin SDK bypasses rules. Needs application default credentials
 * (`gcloud auth application-default login`).
 *
 *   node scripts/fix-league-ids.mjs          # dry run
 *   node scripts/fix-league-ids.mjs --apply
 */

import fs from "node:fs";

const APPLY = process.argv.includes("--apply");

/** player_id -> { was, now, why } */
const FIXES = {
  "100116": { was: "56803",  now: "56830",  who: "Nicholas Leival", why: "photo 56830_Nick_Leival.webp; 56830 = Leival, Edmonton Impact 2015-2026. lonestar_open_2025 already correct." },
  "100146": { was: "148177", now: "148117", who: "Jackson Blue",    why: "photo 148117-4587_Blue, Jackson.webp; 148117 = Blue, MLKings/NYX/Distortion. Digits transposed." },
  "100323": { was: "872",    now: "156474", who: "Jim McGowan",     why: "156474 = 'R. McGowan', ASG Aftermath 2025 — same team and year as his only Pick'Em event." },
};
/**
 * Players who had NO league_id at all. Sourced from the pbleagues roster row, whose
 * avatar filename is the numeric league id. Both were on Texas FIT (Pro 3v3) at
 * NXL Tampa Bay Open 2026 — the same org as their Pick'Em team, PaintballFIT.
 */
const ADDS = {
  "100360": { now: "206876", who: "Henry Portillo",   why: "Texas FIT, Pro 3v3, NXL Tampa Bay Open 2026 (event 9198)." },
  "100362": { now: "206976", who: "Joey Petrucelli",  why: "listed as 'Joseph Petrucelli', Texas FIT, Pro 3v3, NXL Tampa Bay Open 2026." },
};

/** Registry-only: Firestore holds no league_id for this player. */
const REGISTRY_ONLY = {
  "100183": { was: "34803", now: "34804", who: "Diego Gallego", why: "photo 34804_Diego_Gallego.webp; 34804 = Gallego, Red Legion 2020-2024. 34803 is on no roster." },
};

const { initializeApp, applicationDefault, getApps } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");

if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: "fantasy-paintball" });
const db = getFirestore();

const eventIds = (await db.collection("events").get()).docs.map((d) => d.id);

const targets = [];
const backup = {};
for (const ev of eventIds) {
  const snap = await db.collection("events").doc(ev).collection("players").get();
  for (const d of snap.docs) {
    const add = ADDS[d.id];
    const cur = d.data().league_id;
    if (add) {
      if (cur !== undefined && cur !== "" && String(cur) !== add.now) {
        console.warn(`  ⚠ ${ev}/${d.id} already holds ${cur}, expected none — skipping`);
        continue;
      }
      if (String(cur ?? "") === add.now) continue;
      targets.push({ ev, id: d.id, ...add, was: "(none)", cur: "(none)" });
      (backup[ev] ??= {})[d.id] = { league_id: cur ?? null };
      continue;
    }
    const fix = FIXES[d.id];
    if (!fix) continue;
    if (cur === undefined || cur === "") continue;
    if (String(cur) === fix.now) continue;
    if (String(cur) !== fix.was) {
      console.warn(`  ⚠ ${ev}/${d.id} holds ${cur}, expected ${fix.was} — skipping, review by hand`);
      continue;
    }
    targets.push({ ev, id: d.id, ...fix, cur: String(cur) });
    (backup[ev] ??= {})[d.id] = { league_id: cur };
  }
}

console.log(`\n${APPLY ? "APPLYING" : "DRY RUN — nothing is written"}\n${"=".repeat(72)}`);
for (const [id, f] of Object.entries({ ...FIXES, ...ADDS, ...REGISTRY_ONLY })) {
  const hits = targets.filter((t) => t.id === id);
  console.log(`\n${id}  ${f.who}   ${f.was ?? "(none)"} -> ${f.now}`);
  console.log(`   ${f.why}`);
  console.log(`   firestore docs to update: ${hits.length ? hits.map((t) => t.ev).join(", ") : "none (registry only)"}`);
}

const regPath = new URL("./player-identity-registry.json", import.meta.url);
const reg = JSON.parse(fs.readFileSync(regPath));
const regChanges = [];
for (const p of reg.players) {
  const f = FIXES[String(p.player_id)] ?? ADDS[String(p.player_id)] ?? REGISTRY_ONLY[String(p.player_id)];
  if (f && String(p.league_id ?? "") !== f.now) regChanges.push({ id: p.player_id, from: p.league_id ?? "(none)", to: f.now });
}
console.log(`\nregistry entries to update: ${regChanges.length ? regChanges.map((r) => `${r.id} ${r.from}->${r.to}`).join(", ") : "none"}`);
console.log(`\ntotal firestore writes: ${targets.length}`);

if (!APPLY) {
  console.log("\nRe-run with --apply to write.");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `scripts/backups/league-ids-${stamp}.json`;
fs.writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), note: "Pre-fix league_id values.", players: backup }, null, 2));
console.log(`backup written: ${backupPath}`);

const batch = db.batch();
for (const t of targets) batch.update(db.collection("events").doc(t.ev).collection("players").doc(t.id), { league_id: t.now });
await batch.commit();
console.log(`✅ ${targets.length} firestore docs updated`);

for (const p of reg.players) {
  const f = FIXES[String(p.player_id)] ?? ADDS[String(p.player_id)] ?? REGISTRY_ONLY[String(p.player_id)];
  if (f) p.league_id = f.now;
}
reg.generated = new Date().toISOString();
fs.writeFileSync(regPath, JSON.stringify(reg, null, 2) + "\n");
console.log(`✅ registry updated (${regChanges.length} entries)`);
