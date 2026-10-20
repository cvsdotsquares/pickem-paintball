/**
 * One-off identity fix (20 Oct 2026): Dustin Cort, league_id 18088, split again at Lone Star 2026.
 *
 *   node scripts/fix-cort-lone-star-2026.mjs            # preview, writes nothing
 *   node scripts/fix-cort-lone-star-2026.mjs --commit   # writes (James's OK first)
 *
 * The August fix (identity-fix-plan.mjs MERGES: Cort 100193 -> 100358) merged him in every event up to
 * mid_west_open_2026. Lone Star 2026's roster then brought 100193 back: the old Cost Allocation sheet looked players
 * up by name in a Player Database tab that still held the stray row. (Cost allocation now matches by league_id
 * through the registry, so this can't recur from there.) The registry says 18088 -> 100358.
 *
 * Scope: lone_star_open_2026 only. windy_city_open_2024 and players/season_2024 are 2024 test data, left alone.
 *   1. events/lone_star_open_2026/players/100193 -> 100358 (same data; inner player_id/playerId set to 100358)
 *   2. every user's lone_star_open_2026 picks (incl. _captain / _draft variants) 100193 -> 100358, types preserved
 *   3. playerSummaries/100193 deleted (the summary rebuild only writes, never deletes)
 * Same gates as apply-identity-fix.mjs: refuses if 100358 already exists in the event, if any user's score would
 * change, or if a remap would duplicate a pick; backs up everything touched to scripts/backups/ first; ONE atomic
 * batch, so no pick ever points at a vacated slot; reads back afterwards.
 * Then rebuild the summaries: node scripts/build-player-summaries.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";
import { buildPickRewrites, num } from "./identity-fix-plan.mjs";

const EV = "lone_star_open_2026";
const FROM = "100193";
const TO = "100358";
const LEAGUE_ID = "18088";
const COMMIT = process.argv.includes("--commit");
const HERE = dirname(fileURLToPath(import.meta.url));

admin.initializeApp({ projectId: "fantasy-paintball" });
const db = admin.firestore();
const die = (m) => { console.error(`\n❌ ABORTED — ${m}\n`); process.exit(1); };

console.log(`\nCORT @ LONE STAR 2026 — ${COMMIT ? "COMMIT MODE" : "preview (no writes)"}`);

const fromRef = db.doc(`events/${EV}/players/${FROM}`);
const toRef = db.doc(`events/${EV}/players/${TO}`);
const [fromSnap, toSnap] = await Promise.all([fromRef.get(), toRef.get()]);
if (!fromSnap.exists) die(`${EV}/players/${FROM} doesn't exist — already fixed?`);
if (toSnap.exists) die(`${EV}/players/${TO} already exists — needs a decision, not a move`);
const from = fromSnap.data();
if (String(from.league_id) !== LEAGUE_ID) die(`${FROM} carries league_id ${from.league_id}, expected ${LEAGUE_ID}`);
console.log(`  roster: ${EV} ${FROM} "${from.Player}" (${from.Team}, ${num(from["Confirmed Kills"])} kills) -> ${TO}`);

const ld = (await db.collection("long_data").where("eventId", "==", EV).where("playerId", "==", FROM).count().get()).data().count;
if (ld) die(`${ld} long_data rows carry playerId ${FROM} — this script doesn't rewrite long data`);
console.log("  long_data: 0 rows on 100193 ✅");

const users = await db.collection("users").get();
const remap = new Map([[EV, new Map([[FROM, TO]])]]);
const rewrites = buildPickRewrites(users.docs, remap);

// Score gate: kills move with the doc, so every affected pick set must score the same before and after.
const roster = (await db.collection(`events/${EV}/players`).get()).docs.reduce((m, d) => m.set(d.id, d.data()), new Map());
const after = new Map(roster); after.set(TO, { ...from, player_id: TO, playerId: TO }); after.delete(FROM);
const score = (r, ids, cap) => ids.reduce((s, raw) => {
  const k = num(r.get(String(raw))?.["Confirmed Kills"]);
  return s + (String(raw) === String(cap) ? k * 1.5 : k);
}, 0);
for (const d of users.docs) {
  const pk = d.get("pickems") || {};
  const live = pk[EV];
  if (!Array.isArray(live) || !live.map(String).includes(FROM)) continue;
  const cap = pk[`${EV}_captain`] ?? null;
  const rw = (x) => (String(x) === FROM ? TO : String(x));
  const liveAfter = live.map(rw);
  if (new Set(liveAfter).size !== liveAfter.length) die(`remap would duplicate a pick for ${d.id}`);
  const b = score(roster, live, cap), a = score(after, liveAfter, cap == null ? null : rw(cap));
  if (Math.abs(a - b) > 1e-9) die(`score would change for ${d.id}: ${b} -> ${a}`);
}
console.log(`  picks: ${rewrites.length} users to rewrite; score unchanged for all ✅`);
rewrites.forEach((r) => console.log(`     user ${r.userId}: ${Object.keys(r.updates).join(", ")}`));

const sumRef = db.doc(`playerSummaries/${FROM}`);
const sumSnap = await sumRef.get();
console.log(`  playerSummaries/${FROM}: ${sumSnap.exists ? "exists → delete (backed up)" : "not there"}`);

const ops = 2 + rewrites.length + (sumSnap.exists ? 1 : 0);
console.log(`  ${ops} operations in one atomic batch`);
if (!COMMIT) { console.log("\nPreview only. Re-run with --commit to write.\n"); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(join(HERE, "backups"), { recursive: true });
const backup = join(HERE, "backups", `fix-cort-lone-star-2026-${stamp}.json`);
writeFileSync(backup, JSON.stringify({
  createdAt: new Date().toISOString(),
  note: "Before moving Cort 100193 -> 100358 at lone_star_open_2026.",
  roster: { [FROM]: from },
  users: Object.fromEntries(rewrites.map((r) => [r.userId, users.docs.find((d) => d.id === r.userId).get("pickems")])),
  playerSummary: sumSnap.exists ? sumSnap.data() : null,
}, null, 2));
console.log(`\n  ✅ backup: ${backup}`);

const batch = db.batch();
batch.set(toRef, { ...from, player_id: TO, playerId: TO });
batch.delete(fromRef);
for (const r of rewrites) batch.update(db.doc(`users/${r.userId}`), r.updates);
if (sumSnap.exists) batch.delete(sumRef);
await batch.commit();
console.log(`  ✅ committed ${ops} operations`);

const [f2, t2] = await Promise.all([fromRef.get(), toRef.get()]);
const left = (await db.collection("users").get()).docs.filter((d) => {
  const pk = d.get("pickems") || {};
  return Object.entries(pk).some(([k, v]) => k.startsWith(EV) && (Array.isArray(v) ? v.map(String).includes(FROM) : String(v) === FROM));
}).length;
const ok = !f2.exists && t2.exists && left === 0 && !(await sumRef.get()).exists;
console.log(ok ? "  ✅ read back: 100358 in the roster, 100193 gone, no picks or summary left on it"
  : `  ❌ read back failed (from exists ${f2.exists}, to exists ${t2.exists}, picks left ${left}) — restore from ${backup}`);
console.log("\nNEXT: node scripts/build-player-summaries.mjs, then node scripts/identity-audit.mjs\n");
process.exit(ok ? 0 : 1);
