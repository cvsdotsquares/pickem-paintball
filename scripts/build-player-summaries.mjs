/**
 * Rebuild `playerSummaries/*` and `aggregates/*` by hand.
 *
 * The logic lives in `functions/playerSummaries.js`, which the scheduled Cloud Function
 * also runs — so this script and the live path can never drift apart. This file is only
 * the CLI: credentials, flags, and the numbers worth printing.
 *
 * The projection normally rebuilds itself: `longDataRecompute` marks it stale and
 * `rebuildPlayerSummaries` picks that up within a few minutes. Reach for this when you
 * want it now, or to reconcile — a full rebuild is the definition of correct, so if this
 * reports changes when nothing has been uploaded, the scheduled path has a bug.
 *
 *   node scripts/build-player-summaries.mjs            # dry run, writes nothing
 *   node scripts/build-player-summaries.mjs --yes      # write
 */

import { createRequire } from "module";
import admin from "firebase-admin";

const require = createRequire(import.meta.url);
const { buildAll, buildAggregates, writeAll } = require("../functions/playerSummaries.js");

async function main() {
  const confirmed = process.argv.includes("--yes");

  admin.initializeApp({ projectId: "fantasy-paintball" });
  const db = admin.firestore();

  const t0 = Date.now();
  const summaries = await buildAll(db);
  const built = Date.now();

  const sizes = summaries.map((s) => Buffer.byteLength(JSON.stringify(s), "utf8"));
  const biggest = summaries[sizes.indexOf(Math.max(...sizes))];

  console.log(`\nBuilt ${summaries.length} player summaries in ${built - t0}ms`);
  console.log(`  events per player  ${Math.min(...summaries.map((s) => s.events.length))}–${Math.max(...summaries.map((s) => s.events.length))}`);
  console.log(`  matches per player ${Math.min(...summaries.map((s) => s.matches.length))}–${Math.max(...summaries.map((s) => s.matches.length))}`);
  console.log(`  doc size           avg ${Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)}B, max ${Math.max(...sizes)}B (${biggest.name})`);
  console.log(`  largest is ${((Math.max(...sizes) / 1048576) * 100).toFixed(2)}% of the 1 MiB limit`);

  const aggregates = await buildAggregates(db, summaries);

  if (!confirmed) {
    console.log("\nNo --yes flag, so nothing was written.\n");
    return;
  }

  // This admin's own sentinel: the shared module deliberately imports no firebase-admin,
  // because functions/ and the repo root run different versions and a sentinel from one
  // is rejected by a Firestore instance from the other.
  const { changed, unchanged } = await writeAll(db, summaries, aggregates, {
    now: admin.firestore.FieldValue.serverTimestamp(),
  });

  const kb = (n) => (Buffer.byteLength(JSON.stringify(n), "utf8") / 1024).toFixed(1);
  const { index, allTime, allTimeLeaders, eventLeaders, spotlight, LATEST } = aggregates;
  console.log(`\nWrote ${changed} changed summaries (${unchanged} already up to date).`);
  console.log(`Wrote aggregates/playerIndex — ${index.length} players, ${kb(index)} KB.`);
  console.log(`Wrote aggregates/allTime    — ${allTime.length} players, ${kb(allTime)} KB.`);
  console.log(`Wrote aggregates/spotlight  — ${allTimeLeaders.length} all-time, ${eventLeaders.length} at ${LATEST}, ${spotlight.length} most picked, ${kb({ allTimeLeaders, eventLeaders, spotlight })} KB.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
