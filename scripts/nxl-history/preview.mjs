/**
 * Put the new career page in front of a human WITHOUT rebuilding the projection.
 *
 *   node scripts/nxl-history/preview.mjs            # list what it would write
 *   node scripts/nxl-history/preview.mjs --write
 *   node scripts/nxl-history/preview.mjs --delete   # undo, completely
 *
 * WHY THIS EXISTS
 * The page reads `playerSummaries/{id}`, so the feature is invisible until those
 * documents carry the new fields. The obvious way to get them there — a full rebuild —
 * is currently unsafe for reasons that have nothing to do with this feature: the roster
 * documents for the 2026 events have lost their `participation` verdicts and brand
 * colours, and the stale projection is the only place the good values still exist. See
 * the Data section of TODO.md. Rebuilding would publish that loss.
 *
 * So this writes COPIES under ids that do not belong to anybody:
 *   - no existing document is read back, modified or replaced
 *   - nothing links to these ids, so no user can reach them by browsing
 *   - `--delete` removes them and leaves no trace
 *
 * They are ordinary player summaries otherwise, so the page renders them exactly as it
 * will render the real thing.
 */

import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { buildAll } = require("../../functions/playerSummaries.js");

admin.initializeApp({ projectId: "fantasy-paintball" });
const db = admin.firestore();

/** The prefix is the safety property: nothing real can collide with it. */
const PREFIX = "zzpreview_";

/**
 * The states worth looking at, chosen so a reviewer sees the range rather than one
 * flattering example. Each is picked by shape, not by name, so this keeps working as
 * the data changes.
 */
const CASES = [
  {
    id: "veteran",
    why: "long record, several titles — the case the NXL panel exists for",
    pick: (all) => best(all, (s) => (s.nxl ? s.nxl.seasons * 10 + s.nxl.titles : -1)),
  },
  {
    id: "titleless",
    why: "no win but plenty of brackets — the Sundays tier",
    pick: (all) =>
      best(all, (s) =>
        s.nxl && s.nxl.titles === 0 && s.nxl.tournaments >= 15 ? s.nxl.tournaments : -1,
      ),
  },
  {
    id: "nosunday",
    why: "never reached a bracket — the bottom tier, three match tiles and no fourth",
    pick: (all) =>
      best(all, (s) =>
        s.nxl && s.nxl.titles === 0 && s.nxl.sundays === 0 ? s.nxl.tournaments : -1,
      ),
  },
  {
    id: "rookie",
    why: "one season, so the trend line has almost nothing to draw",
    pick: (all) => best(all, (s) => (s.nxl && s.nxl.seasons === 1 ? s.nxl.tournaments : -1)),
  },
  {
    id: "norecord",
    why: "no NXL id at all — the hero and panel must degrade, not show zeroes",
    pick: (all) => best(all, (s) => (!s.nxl && s.playedCount >= 4 ? s.playedCount : -1)),
  },
];

function best(all, score) {
  let top = null;
  let topScore = -1;
  for (const s of all) {
    const v = score(s);
    if (v > topScore) { topScore = v; top = s; }
  }
  return topScore < 0 ? null : top;
}

const write = process.argv.includes("--write");
const remove = process.argv.includes("--delete");

if (remove) {
  const snap = await db.collection("playerSummaries").get();
  const doomed = snap.docs.filter((d) => d.id.startsWith(PREFIX));
  if (!doomed.length) {
    console.log("\nNothing to delete — no preview documents exist.\n");
    process.exit(0);
  }
  const batch = db.batch();
  doomed.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  console.log(`\nDeleted ${doomed.length}: ${doomed.map((d) => d.id).join(", ")}\n`);
  process.exit(0);
}

const all = await buildAll(db);
const chosen = [];
for (const c of CASES) {
  const s = c.pick(all);
  if (!s) { console.log(`  (no player matches "${c.id}" — skipped)`); continue; }
  chosen.push({ ...c, summary: s });
}

console.log(`\nPreview documents:\n`);
for (const c of chosen) {
  const n = c.summary.nxl;
  console.log(`  ${PREFIX}${c.id}`);
  console.log(`    ${c.summary.name} — ${c.why}`);
  console.log(
    `    ${n ? `${n.tournaments} tournaments, ${n.titles} won, ${n.matchW}-${n.matchL} (${n.matchWinPct.toFixed(0)}%), ${n.seasons} season${n.seasons === 1 ? "" : "s"}` : "no NXL record"}`,
  );
  console.log(`    /dashboard/players/${PREFIX}${c.id}\n`);
}

if (!write) {
  console.log(`No --write flag, so nothing was written.\n`);
  process.exit(0);
}

const batch = db.batch();
for (const c of chosen) {
  // The id is rewritten so the document is internally consistent — a summary whose
  // `playerId` disagreed with its own key would be a trap for whoever reads it next.
  batch.set(db.doc(`playerSummaries/${PREFIX}${c.id}`), {
    ...c.summary,
    playerId: `${PREFIX}${c.id}`,
    rebuiltAt: admin.firestore.FieldValue.serverTimestamp(),
    /** Marks these as disposable, for anyone who finds one and wonders. */
    previewOf: c.summary.playerId,
    previewNote: "Throwaway preview doc — delete with scripts/nxl-history/preview.mjs --delete",
  });
}
await batch.commit();
console.log(`Wrote ${chosen.length} preview documents. Undo with:\n  node scripts/nxl-history/preview.mjs --delete\n`);
process.exit(0);
