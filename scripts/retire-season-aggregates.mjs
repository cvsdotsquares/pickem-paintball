/**
 * Retire the pre-aggregated 2025 season table.
 *
 *   node scripts/retire-season-aggregates.mjs            # preview
 *   node scripts/retire-season-aggregates.mjs --commit   # back up, then delete
 *
 * WHY: `players/season_{year}/players` was written by a one-off script that was run
 * for 2024 and 2025 and never for 2026, so `stats/page.tsx` grew a client-side
 * fallback to cover the gap. That fallback is the better implementation — it ranks
 * correctly and builds per-event columns dynamically for ANY season, where the
 * pre-aggregated branch hardcodes them for 2024/2025 only and can't do 2026 at all.
 *
 * Deleting the 2025 docs makes the page fall through to it, which removes the
 * second code path AND the "remember to re-run a script every season" trap that
 * created this. Verified beforehand: the fallback reproduces every corrected total
 * from the identity fix exactly.
 *
 * season_2024 is deliberately left alone — 2024 is filtered out of the UI entirely
 * (stats/page.tsx:157), so those docs are unreachable either way.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { initializeApp } = await import("firebase/app");
const { getFirestore, collection, getDocs, doc, writeBatch } = await import("firebase/firestore");

const YEAR = "2025";
const COMMIT = process.argv.includes("--commit");
const HERE = dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    projectId: "fantasy-paintball",
  });
  const db = getFirestore(app);

  const path = `players/season_${YEAR}/players`;
  const snap = await getDocs(collection(db, path));
  console.log(`\nRETIRE PRE-AGGREGATED SEASON TABLE — ${COMMIT ? "COMMIT" : "PREVIEW"}`);
  console.log("=".repeat(70));
  console.log(`  ${path}: ${snap.size} documents`);

  if (snap.size === 0) {
    console.log("  nothing to do — already retired\n");
    return;
  }
  if (snap.size > 500) {
    console.log(`  ❌ ${snap.size} docs exceeds a single batch — needs chunking`);
    process.exit(1);
  }

  if (!COMMIT) {
    console.log("\n  sample of what would be deleted:");
    snap.docs.slice(0, 5).forEach((d) =>
      console.log(`     ${d.id} "${d.get("playerName")}" ${d.get("totalConfirmedKills")}k r${d.get("seasonRank")}`));
    console.log(`     … and ${snap.size - 5} more`);
    console.log("\n  re-run with --commit to back up and delete\n");
    return;
  }

  const dir = join(HERE, "backups");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `season-${YEAR}-aggregates-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(
    { path, retiredAt: new Date().toISOString(), docs: snap.docs.map((d) => ({ id: d.id, data: d.data() })) },
    null, 2,
  ));
  console.log(`\n  ✅ backup written: ${file}`);

  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(doc(db, path, d.id)));
  await batch.commit();
  console.log(`  ✅ deleted ${snap.size} documents in one atomic batch`);

  const after = await getDocs(collection(db, path));
  console.log(after.size === 0
    ? "  ✅ verified empty — stats page will now use the live fallback"
    : `  ❌ ${after.size} documents remain`);
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
