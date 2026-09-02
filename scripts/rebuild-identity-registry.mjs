/**
 * Rebuilds scripts/player-identity-registry.json from live Firestore.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 * ROSTER_IDENTITY.md step 6 says to commit the updated registry after a roster
 * lands, otherwise the next event's build won't know the new players exist and
 * will mint fresh ids for them — the re-minting defect.
 *
 * The 2024 events are tests (confirmed by James) and are excluded, which is why
 * this rebuild reproduces the hand-built 325 rather than every id in Firestore.
 *
 * league_id is NEVER re-derived. Firestore only carries it on the newer event
 * docs, so the existing registry value always wins unless Firestore has one and
 * the registry does not. ROSTER_IDENTITY.md: "Do not re-derive it — a second
 * derivation that disagrees is exactly how this went wrong before." A first pass
 * of this script did re-derive and would have blanked 89 players.
 *
 *   node scripts/rebuild-identity-registry.mjs
 *   node scripts/rebuild-identity-registry.mjs --apply
 */

import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const TEST_EVENTS = new Set(["windy_city_open_2024", "worldcup_2024"]);

const { initializeApp, applicationDefault, getApps } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: "fantasy-paintball" });
const db = getFirestore();

const events = (await db.collection("events").get()).docs
  .map((d) => ({ id: d.id, lock: d.data().lockDate?.seconds ?? 0 }))
  .filter((e) => !TEST_EVENTS.has(e.id))
  .sort((a, b) => a.lock - b.lock);

const seen = new Map();
for (const ev of events) {
  const snap = await db.collection("events").doc(ev.id).collection("players").get();
  for (const d of snap.docs) {
    if (!seen.has(d.id)) seen.set(d.id, { events: [], latest: null, data: null });
    const p = seen.get(d.id);
    p.events.push(ev.id);
    p.latest = ev.id;
    p.data = d.data();
  }
}

const regPath = new URL("./player-identity-registry.json", import.meta.url);
const old = JSON.parse(fs.readFileSync(regPath));
const oldById = new Map(old.players.map((p) => [String(p.player_id), p]));

const players = [...seen.entries()]
  .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  .map(([id, p]) => ({
    player_id: id,
    Player: String(p.data.Player ?? ""),
    team_id: String(p.data.team_id ?? ""),
    Team: String(p.data.Team ?? ""),
    events: p.events,
    // Registry wins; Firestore only fills a gap. Never blanked.
    league_id: String(oldById.get(String(id))?.league_id || p.data.league_id || ""),
    latest_event: p.latest,
  }));

const added = players.filter((p) => !oldById.has(p.player_id));
const removed = old.players.filter((p) => !seen.has(String(p.player_id)));
const lidChanged = players.filter((p) => {
  const o = oldById.get(p.player_id);
  return o && String(o.league_id ?? "") !== p.league_id;
});
const noLid = players.filter((p) => !p.league_id);
const byLid = new Map();
const clashes = [];
for (const p of players) {
  if (!p.league_id) continue;
  if (byLid.has(p.league_id)) clashes.push(`${p.league_id}: ${byLid.get(p.league_id)} and ${p.player_id}`);
  else byLid.set(p.league_id, p.player_id);
}

console.log(`\n${APPLY ? "APPLYING" : "DRY RUN — nothing is written"}`);
console.log("=".repeat(70));
console.log(`events in scope: ${events.length}  (${events.map((e) => e.id).join(", ")})`);
console.log(`players: ${old.players.length} -> ${players.length}`);
console.log(`\nADDED [${added.length}]`);
added.forEach((p) => console.log(`   ${p.player_id}  ${p.Player.padEnd(18)} league_id ${p.league_id}  ${p.team_id}`));
console.log(`\nREMOVED [${removed.length}]`);
removed.forEach((p) => console.log(`   ${p.player_id} ${p.Player}`));
console.log(`\nleague_id changed [${lidChanged.length}]`);
lidChanged.forEach((p) => console.log(`   ${p.player_id} ${p.Player}: ${oldById.get(p.player_id).league_id} -> ${p.league_id}`));
console.log(`\nwithout league_id [${noLid.length}]: ${noLid.map((p) => p.player_id + " " + p.Player).join(", ") || "none"}`);
console.log(`league_id clashes [${clashes.length}]: ${clashes.join("; ") || "none ✅"}`);

const lost = players.filter((p) => !p.league_id && oldById.get(p.player_id)?.league_id);
if (lost.length) { console.error(`\nABORT — ${lost.length} players would lose a league_id.`); process.exit(1); }
if (clashes.length) { console.error("\nABORT — a league_id maps to two player_ids. Fix before writing."); process.exit(1); }
if (!APPLY) { console.log("\nRe-run with --apply to write."); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.writeFileSync(`scripts/backups/identity-registry-${stamp}.json`, JSON.stringify(old, null, 2));
fs.writeFileSync(regPath, JSON.stringify({
  generated: new Date().toISOString(),
  note: old.note,
  scope: events.map((e) => e.id),
  count: players.length,
  players,
}, null, 2) + "\n");
console.log(`\n✅ registry rebuilt: ${players.length} players (backup in scripts/backups/)`);
