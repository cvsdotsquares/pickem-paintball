/**
 * READ-ONLY report on team-card sharing, from the `shareEvents` collection.
 *
 * Writes nothing. One row per event, plus an overall line:
 *
 *   Shares        — outcome "shared". Includes the desktop path (card downloaded
 *                   or link copied), which James counts as a share.
 *   Unique        — distinct users who shared at least once, so someone who
 *                   shares five times counts once.
 *   Before/After  — split on the event's lockDate, decided server-side at the
 *                   moment of the share (never the browser clock).
 *   Dismissed     — opened the share sheet, then backed out. The measure of
 *                   "pressed the button but didn't actually share".
 *
 * Note the unique columns do not add up: one person can share both before and
 * after the lock, and counts once in each and once overall.
 *
 * Needs Admin credentials (the same `gcloud auth application-default login`
 * the other admin scripts use).
 *
 *   node scripts/share-report.mjs [--event <eventId>] [--json]
 */

import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const onlyEvent = args.includes("--event") ? args[args.indexOf("--event") + 1] : null;

// Admin SDK on purpose: `shareEvents` is create-only to clients (see
// firestore.rules), so nobody can read back who shared what from the browser.
if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId: "fantasy-paintball" });
}
const db = getFirestore();

const eventNames = new Map();
for (const d of (await db.collection("events").get()).docs) {
  eventNames.set(d.id, d.data().name ?? d.id);
}

const rows = (await db.collection("shareEvents").get()).docs.map((d) => d.data());
if (!rows.length) {
  console.log("No share events recorded yet.");
  process.exit(0);
}

const blank = () => ({
  shares: 0,
  sharers: new Set(),
  before: 0,
  beforeSharers: new Set(),
  after: 0,
  afterSharers: new Set(),
  noLock: 0,
  dismissed: 0,
  failed: 0,
  surfaces: new Map(),
});

const byEvent = new Map();
const overall = blank();

for (const r of rows) {
  const eventId = r.eventId ?? "(no event)";
  if (onlyEvent && eventId !== onlyEvent) continue;
  if (!byEvent.has(eventId)) byEvent.set(eventId, blank());

  for (const b of [byEvent.get(eventId), overall]) {
    if (r.outcome === "dismissed") b.dismissed++;
    else if (r.outcome === "failed") b.failed++;
    else if (r.outcome === "shared") {
      b.shares++;
      b.sharers.add(r.uid);
      b.surfaces.set(r.surface, (b.surfaces.get(r.surface) ?? 0) + 1);
      if (r.phase === "before_lock") {
        b.before++;
        b.beforeSharers.add(r.uid);
      } else if (r.phase === "after_lock") {
        b.after++;
        b.afterSharers.add(r.uid);
      } else b.noLock++;
    }
  }
}

const shape = (b) => ({
  shares: b.shares,
  uniqueSharers: b.sharers.size,
  beforeLock: b.before,
  beforeLockUnique: b.beforeSharers.size,
  afterLock: b.after,
  afterLockUnique: b.afterSharers.size,
  noLockDate: b.noLock,
  dismissed: b.dismissed,
  failed: b.failed,
  bySurface: Object.fromEntries(b.surfaces),
});

if (asJson) {
  console.log(
    JSON.stringify(
      {
        overall: shape(overall),
        events: Object.fromEntries(
          [...byEvent].map(([id, b]) => [id, { name: eventNames.get(id) ?? id, ...shape(b) }]),
        ),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const pad = (v, w) => String(v).padStart(w);
const line = (label, b) =>
  `${label.slice(0, 30).padEnd(30)} ${pad(b.shares, 7)} ${pad(b.sharers.size, 7)} ` +
  `${pad(b.before, 7)} ${pad(b.beforeSharers.size, 7)} ${pad(b.after, 7)} ${pad(b.afterSharers.size, 7)} ` +
  `${pad(b.dismissed, 10)}`;

console.log(
  `${"EVENT".padEnd(30)} ${pad("SHARES", 7)} ${pad("UNIQUE", 7)} ` +
    `${pad("PRE", 7)} ${pad("PRE-UNQ", 7)} ${pad("POST", 7)} ${pad("POST-UNQ", 7)} ${pad("DISMISSED", 10)}`,
);
console.log("-".repeat(96));
for (const [id, b] of [...byEvent].sort((a, b) => b[1].shares - a[1].shares)) {
  console.log(line(eventNames.get(id) ?? id, b));
}
console.log("-".repeat(96));
console.log(line("ALL EVENTS", overall));

console.log("\nPRE / POST split on the event's lockDate. Unique columns count each");
console.log("person once within that column, so they do not sum across columns.");
if (overall.noLock) console.log(`${overall.noLock} share(s) on an event with no lockDate.`);
if (overall.failed) console.log(`${overall.failed} attempt(s) failed with an error.`);
const surfaces = [...overall.surfaces].sort((a, b) => b[1] - a[1]);
if (surfaces.length) {
  console.log(`\nShares by screen: ${surfaces.map(([s, n]) => `${s} ${n}`).join("  ·  ")}`);
}

process.exit(0);
