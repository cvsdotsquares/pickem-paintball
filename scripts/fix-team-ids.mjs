/**
 * Backfill missing `team_id` and correct three typos.
 *
 *   node scripts/fix-team-ids.mjs            # preview
 *   node scripts/fix-team-ids.mjs --commit   # back up, then write
 *
 * `tampa_bay_open_2025` has no `team_id` on any of its 199 players — it predates the
 * field. Every other in-scope event is 100% covered, and each team display name maps
 * to exactly one id across 37–83 player-event rows, so the value is imputed from that
 * evidence rather than hand-entered.
 *
 * Three single-row typos are corrected against the same evidence:
 *   IMF -> IRN  (an Ironmen player at midwest_open_2025; IMF is Infamous)
 *   AFT -> SDA  (an Aftermath player at lonestar_open_2025; AFT is Aftershock)
 *   COl -> COL  (case slip at mid_west_open_2026)
 *
 * ⚠ FIELD OWNERSHIP: `syncRoster()` owns `team_id` (DATA_PIPELINE.md §6). Writing it
 * here is safe only for events whose sheet will not be re-synced. The dormant 2025
 * events qualify; `mid_west_open_2026` does NOT — its Google Sheet must be corrected
 * too, or the next submit will write `COl` straight back.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { initializeApp } = await import("firebase/app");
const { getFirestore, collection, getDocs, doc, writeBatch } = await import("firebase/firestore");

const EVENTS = [
  "tampa_bay_open_2025", "atlantic_city_2025", "midwest_open_2025", "lonestar_open_2025",
  "world_cup_2025", "tampa_bay_2026", "mid_atlantic_open_2026", "mid_west_open_2026",
];
/** Events still on a live pipeline — a Firestore-only fix here will be undone. */
const LIVE_PIPELINE = new Set(["tampa_bay_2026", "mid_atlantic_open_2026", "mid_west_open_2026"]);

const COMMIT = process.argv.includes("--commit");
const HERE = dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    projectId: "fantasy-paintball",
  });
  const db = getFirestore(app);

  const rows = [];
  for (const ev of EVENTS) {
    const snap = await getDocs(collection(db, "events", ev, "players"));
    for (const d of snap.docs) {
      rows.push({
        ev, id: d.id,
        name: (d.get("Player") || "").trim(),
        team: (d.get("Team") || "").trim(),
        tid: (d.get("team_id") || "").trim(),
      });
    }
  }

  // Evidence: team name -> most-used id.
  const evidence = new Map();
  for (const r of rows) {
    if (!r.team || !r.tid) continue;
    if (!evidence.has(r.team)) evidence.set(r.team, new Map());
    const m = evidence.get(r.team);
    m.set(r.tid, (m.get(r.tid) || 0) + 1);
  }
  const canonical = new Map();
  for (const [team, m] of evidence) {
    canonical.set(team, [...m].sort((a, b) => b[1] - a[1])[0][0]);
  }

  const fixes = [];
  for (const r of rows) {
    if (!r.team) continue;
    const want = canonical.get(r.team);
    if (!want) continue;
    if (!r.tid) fixes.push({ ...r, want, kind: "BACKFILL" });
    else if (r.tid !== want) fixes.push({ ...r, want, kind: "TYPO" });
  }

  console.log(`\nTEAM ID FIX — ${COMMIT ? "COMMIT" : "PREVIEW"}`);
  console.log("=".repeat(72));
  const byEvent = new Map();
  for (const f of fixes) {
    if (!byEvent.has(f.ev)) byEvent.set(f.ev, []);
    byEvent.get(f.ev).push(f);
  }
  for (const [ev, list] of byEvent) {
    const warn = LIVE_PIPELINE.has(ev) ? "   ⚠ LIVE PIPELINE — fix the Google Sheet too" : "";
    console.log(`\n  ${ev}  (${list.length})${warn}`);
    const backfills = list.filter((f) => f.kind === "BACKFILL");
    if (backfills.length) {
      const perTeam = new Map();
      for (const f of backfills) perTeam.set(f.team, (perTeam.get(f.team) || 0) + 1);
      console.log(`     BACKFILL ${backfills.length} players:`);
      for (const [t, c] of [...perTeam].sort()) {
        console.log(`        ${t.padEnd(20)} -> ${canonical.get(t).padEnd(5)} ×${c}`);
      }
    }
    for (const f of list.filter((f) => f.kind === "TYPO")) {
      console.log(`     TYPO     ${f.id} "${f.name}" (${f.team}): ${f.tid} -> ${f.want}`);
    }
  }

  console.log(`\n  total writes: ${fixes.length}`);
  if (fixes.length > 500) { console.log("  ❌ exceeds one batch"); process.exit(1); }

  if (!COMMIT) { console.log("\n  re-run with --commit to back up and write\n"); return; }

  const dir = join(HERE, "backups");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `team-ids-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ fixedAt: new Date().toISOString(), fixes }, null, 2));
  console.log(`\n  ✅ backup written: ${file}`);

  const batch = writeBatch(db);
  for (const f of fixes) {
    batch.set(doc(db, "events", f.ev, "players", f.id), { team_id: f.want }, { merge: true });
  }
  await batch.commit();
  console.log(`  ✅ committed ${fixes.length} writes in one atomic batch`);

  // Verify.
  let remaining = 0;
  for (const ev of EVENTS) {
    const snap = await getDocs(collection(db, "events", ev, "players"));
    for (const d of snap.docs) {
      const team = (d.get("Team") || "").trim();
      const tid = (d.get("team_id") || "").trim();
      if (team && canonical.get(team) && tid !== canonical.get(team)) remaining++;
    }
  }
  console.log(remaining === 0
    ? "  ✅ verified — every player's team_id matches its team"
    : `  ❌ ${remaining} rows still inconsistent`);
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
