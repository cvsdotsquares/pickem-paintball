/**
 * Does every game we hold long data for find its result in the league's fixture list?
 *
 *   node scripts/nxl-history/validate.mjs
 *
 * This is the gate on the match table's W/L column. A game that cannot be resolved shows
 * a blank cell rather than a guess, so the number that matters is how many blanks there
 * are and whether they cluster — a whole event failing means the join broke, a stray one
 * means the league and our sheet disagree about a single game.
 */
import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { matchResult, eventRecord, hasResults, nxlCareer } = require("../../functions/nxlHistory.js");

admin.initializeApp({ projectId: "fantasy-paintball" });
const db = admin.firestore();

const longSnap = await db.collection("long_data").get();
const games = new Map(); // eventId -> Map(gameId -> {round,date,teamId,opponentId})
for (const d of longSnap.docs) {
  const r = d.data();
  if (!r.eventId || !r.gameId) continue;
  if (!games.has(r.eventId)) games.set(r.eventId, new Map());
  const g = games.get(r.eventId);
  if (!g.has(r.gameId)) {
    g.set(r.gameId, {
      round: r.round,
      date: r.date?.toDate ? r.date.toDate().toISOString().slice(0, 10) : null,
      teamId: r.teamId,
      opponentId: r.opponentId,
    });
  }
}

let total = 0, ok = 0;
for (const [eventId, g] of games) {
  let n = 0, hit = 0;
  const misses = [];
  for (const [gameId, x] of g) {
    n++;
    const res = matchResult(eventId, x.round, x.date, x.teamId, x.opponentId);
    if (res) hit++;
    else misses.push(`${gameId} (${x.round} ${x.date ?? "no date"})`);
  }
  total += n; ok += hit;
  console.log(`${eventId.padEnd(24)} ${String(hit).padStart(3)}/${String(n).padEnd(3)} resolved${hasResults(eventId) ? "" : "   (no league results yet)"}`);
  misses.slice(0, 6).forEach((m) => console.log(`    miss  ${m}`));
  if (misses.length > 6) console.log(`    ... ${misses.length - 6} more`);
}
console.log(`\n${ok}/${total} games resolved (${((ok / total) * 100).toFixed(1)}%)`);

// Per-event team records, for the event table column.
console.log(`\nEvent records, spot check:`);
for (const eventId of ["world_cup_2025", "mid_west_open_2026"]) {
  const roster = await db.collection(`events/${eventId}/players`).get();
  const teams = new Set(roster.docs.map((d) => d.get("team_id")).filter(Boolean));
  const rows = [...teams].map((t) => [t, eventRecord(eventId, t)]);
  const blank = rows.filter(([, r]) => !r).map(([t]) => t);
  console.log(`  ${eventId}: ${rows.length - blank.length}/${rows.length} teams matched${blank.length ? `  MISSING: ${blank.join(", ")}` : ""}`);
}

// Careers, against the live league_id on the roster.
console.log(`\nCareer records, top of the all-time list:`);
const wc = await db.collection("events/world_cup_2025/players").get();
const sample = wc.docs.slice(0, 5);
for (const d of sample) {
  const c = nxlCareer(d.get("league_id"));
  console.log(
    `  ${String(d.get("Player")).padEnd(22)} ${c ? `${c.tournaments} evts  ${c.matchW}-${c.matchL}  ${c.matchWinPct.toFixed(0)}%  ${c.titles} titles` : "no NXL record"}`,
  );
}
process.exit(0);
