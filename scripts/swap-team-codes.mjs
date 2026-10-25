/**
 * Rename two team codes everywhere in Firestore (James, 25 Oct 2026):
 *
 *   Aftermath   SDA -> AFM   (the Social Media Kit's code; the league still says SDA)
 *   Aftershock  AFT -> SHK
 *
 *   node scripts/swap-team-codes.mjs                 # dry run: counts, samples, checks
 *   node scripts/swap-team-codes.mjs --canary        # write ONE player doc, to prove no notice fires
 *   node scripts/swap-team-codes.mjs --commit        # back up, write everything, verify
 *
 * WHAT IT TOUCHES
 *   events/{id}/players/{pid}.team_id                         every event, past ones too
 *   long_data/{row}.teamId, .opponentId, .gameId              gameId re-sorts its team pair
 *   projections/nxlHistoryMeta.clubTeamId.{Aftermath,Aftershock}
 * Derived data (playerSummaries, aggregates) is rebuilt afterwards with
 * scripts/build-player-summaries.mjs --yes. Old upload manifests keep their old gameIds.
 *
 * NO TEMP CODE. Both new codes are unused, and every document's new value is computed
 * from its own old value in a single write, so nothing ever holds a half-swapped state.
 *
 * ORDER. The Live Data sheets must say AFM/SHK first (syncRoster owns team_id and would
 * write the old code straight back), and onPlayerChange must already treat a new code
 * under the same team name as a rename (functions/playerNotices.js), or every picker of
 * an Aftermath or Aftershock player gets a "moved to" notice.
 */

import admin from "firebase-admin";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAP = { SDA: "AFM", AFT: "SHK" };
const NAME = { SDA: "Aftermath", AFT: "Aftershock" };
const META_DOC = "projections/nxlHistoryMeta";

const COMMIT = process.argv.includes("--commit");
const CANARY = process.argv.includes("--canary");
const HERE = dirname(fileURLToPath(import.meta.url));

admin.initializeApp({ projectId: "fantasy-paintball" });
const db = admin.firestore();

const remap = (v) => (typeof v === "string" && MAP[v.trim()] ? MAP[v.trim()] : v);

/** `{eventId}_{round}_{A}-{B}` with the pair remapped and re-sorted. Null when it isn't that shape. */
function remapGameId(gameId, eventId, round) {
  const prefix = `${eventId}_${round}_`;
  if (typeof gameId !== "string" || !gameId.startsWith(prefix)) return null;
  const pair = gameId.slice(prefix.length).split("-");
  if (pair.length !== 2) return null;
  return prefix + pair.map(remap).sort().join("-");
}

const problems = [];
const writes = []; // { ref, before, update }

// ── 1. Rosters ──────────────────────────────────────────────────────────────
const events = (await db.collection("events").get()).docs;
const playerCounts = {};
for (const e of events) {
  const snap = await db.collection("events").doc(e.id).collection("players").get();
  for (const d of snap.docs) {
    const tid = String(d.get("team_id") || "").trim();
    if (MAP[tid]) {
      const team = String(d.get("Team") || "").trim();
      // The notice guard only holds while the team name is unchanged, and a wrong name
      // means a miscoded player (the old IMF/IRN, AFT/SDA mix-ups) - stop for a human.
      if (team.toLowerCase() !== NAME[tid].toLowerCase()) {
        problems.push(`events/${e.id}/players/${d.id} ${d.get("Player")}: team_id ${tid} but Team "${team}"`);
      }
      writes.push({ ref: d.ref, before: { team_id: d.get("team_id") }, update: { team_id: MAP[tid] } });
      playerCounts[`${e.id} ${tid}`] = (playerCounts[`${e.id} ${tid}`] || 0) + 1;
    } else if (tid === "AFM" || tid === "SHK") {
      // Already migrated (the --canary doc) is fine; the new code on the wrong team is not.
      const want = Object.keys(MAP).find((k) => NAME[k].toLowerCase() === String(d.get("Team") || "").trim().toLowerCase());
      if (MAP[want] !== tid) problems.push(`events/${e.id}/players/${d.id} has ${tid} but Team "${d.get("Team")}"`);
    } else if (/^(aftermath|aftershock)$/i.test(String(d.get("Team") || "").trim())) {
      problems.push(`events/${e.id}/players/${d.id} ${d.get("Player")}: Team "${d.get("Team")}" but team_id "${tid}"`);
    }
  }
}

// ── 2. Long data ────────────────────────────────────────────────────────────
const longSnap = await db.collection("long_data").get();
const gameIdMap = new Map();
let longRows = 0;
for (const d of longSnap.docs) {
  const r = d.data();
  const update = {};
  for (const f of ["teamId", "opponentId"]) if (MAP[String(r[f] || "").trim()]) update[f] = MAP[r[f].trim()];
  const g = remapGameId(r.gameId, r.eventId, r.round);
  if (g === null) {
    if (/(?<![A-Za-z0-9])(SDA|AFT)(?![A-Za-z0-9])/.test(String(r.gameId || ""))) problems.push(`long_data/${d.id}: odd gameId "${r.gameId}"`);
  } else if (g !== r.gameId) {
    update.gameId = g;
    gameIdMap.set(r.gameId, g);
  }
  if (/^(AFM|SHK)$/.test(String(r.teamId || "")) || /^(AFM|SHK)$/.test(String(r.opponentId || ""))) {
    problems.push(`long_data/${d.id} already has AFM/SHK`);
  }
  if (Object.keys(update).length) {
    writes.push({ ref: d.ref, before: Object.fromEntries(Object.keys(update).map((k) => [k, r[k]])), update });
    longRows += 1;
  }
}

// ── 3. NXL history club map ─────────────────────────────────────────────────
const metaRef = db.doc(META_DOC);
const clubTeamId = (await metaRef.get()).get("clubTeamId") || {};
const metaUpdate = {};
for (const [club, id] of Object.entries(clubTeamId)) {
  if (MAP[id]) metaUpdate[club] = MAP[id];
  if (id === "AFM" || id === "SHK") problems.push(`${META_DOC}.clubTeamId.${club} already ${id}`);
}
if (metaUpdate.Aftermath !== "AFM" || metaUpdate.Aftershock !== "SHK" || Object.keys(metaUpdate).length !== 2) {
  problems.push(`${META_DOC}.clubTeamId: expected Aftermath=SDA, Aftershock=AFT, found ${JSON.stringify(clubTeamId)}`);
}

// ── Report ──────────────────────────────────────────────────────────────────
const nPlayers = writes.filter((w) => "team_id" in w.update).length;
console.log(`\nRosters: ${nPlayers} player docs`);
for (const [k, n] of Object.entries(playerCounts).sort()) console.log(`  ${k.padEnd(32)} ${n}`);
console.log(`Long data: ${longRows} of ${longSnap.size} rows, ${gameIdMap.size} gameIds`);
const pairOf = (g) => g.split("_").pop();
const resorted = [...gameIdMap].filter(([a, b]) => pairOf(a).split("-").map(remap).join("-") !== pairOf(b));
for (const [a, b] of [...gameIdMap].slice(0, 6)) console.log(`  ${a}  ->  ${b}`);
console.log(`  (${gameIdMap.size} gameIds change; the pair order flips in ${resorted.length})`);
console.log(`Club map: ${JSON.stringify(metaUpdate)}`);
const collisions = new Set([...gameIdMap.values()].filter((g) => !gameIdMap.has(g) && longSnap.docs.some((d) => d.get("gameId") === g)));
if (collisions.size) problems.push(`new gameIds already in use: ${[...collisions].join(", ")}`);

if (problems.length) {
  console.error(`\n❌ ${problems.length} problem(s) - nothing written:`);
  for (const p of problems.slice(0, 40)) console.error(`  ${p}`);
  process.exit(1);
}
if (!COMMIT && !CANARY) {
  console.log("\nDry run - nothing written. --canary writes one player doc, --commit writes all.");
  process.exit(0);
}

// ── Back up ─────────────────────────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = join(HERE, "backups");
mkdirSync(backupDir, { recursive: true });
const backupFile = join(backupDir, `swap-team-codes-${CANARY ? "canary-" : ""}${stamp}.json`);
writeFileSync(backupFile, JSON.stringify({
  map: MAP,
  docs: writes.map((w) => ({ path: w.ref.path, before: w.before, after: w.update })),
  [META_DOC]: { clubTeamId },
}, null, 1));
console.log(`\nBacked up ${writes.length} docs to ${backupFile}`);

// ── Write ───────────────────────────────────────────────────────────────────
if (CANARY) {
  const w = writes.find((x) => "team_id" in x.update);
  await w.ref.update(w.update);
  console.log(`Canary: ${w.ref.path} team_id ${w.before.team_id} -> ${w.update.team_id}`);
  console.log("Check the onPlayerChange logs and notifications before --commit (re-running skips it).");
  process.exit(0);
}

const todo = writes;
for (let i = 0; i < todo.length; i += 400) {
  const batch = db.batch();
  for (const w of todo.slice(i, i + 400)) batch.update(w.ref, w.update);
  await batch.commit();
  process.stdout.write(`\r  wrote ${Math.min(i + 400, todo.length)}/${todo.length}`);
}
await metaRef.update(Object.fromEntries(Object.entries(metaUpdate).map(([club, id]) => [`clubTeamId.${club}`, id])));
console.log(`\n✅ ${todo.length} docs + ${META_DOC}.clubTeamId written`);

// ── Verify ──────────────────────────────────────────────────────────────────
let left = 0;
for (const e of events) {
  const snap = await db.collection("events").doc(e.id).collection("players").where("team_id", "in", ["SDA", "AFT"]).get();
  left += snap.size;
}
for (const f of ["teamId", "opponentId"]) left += (await db.collection("long_data").where(f, "in", ["SDA", "AFT"]).get()).size;
const meta = (await metaRef.get()).get("clubTeamId");
console.log(`Verify: ${left} docs still on SDA/AFT; club map Aftermath=${meta.Aftermath}, Aftershock=${meta.Aftershock}`);
console.log("Next: node scripts/build-player-summaries.mjs --yes");
