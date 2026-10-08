/**
 * READ-ONLY export of every player doc live in Firestore -> Excel.
 *
 * Writes nothing to Firestore. Three sheets:
 *   "players"     — one row per distinct player_id. Display fields come from that
 *                   player's LATEST live event doc. One column per event marks
 *                   which events they appear in.
 *   "appearances" — raw long form: one row per player_id x event.
 *   "events"      — the event list, in the chronological order used above.
 *
 * `league_id` is only stored on the newer event docs, so it is resolved as:
 *   latest non-empty value in Firestore -> player-identity-registry.json -> blank.
 * `league_id_source` records which of those was used.
 *
 * The 2024 events are tests (confirmed by James) — they still appear as columns,
 * but they never set `latest_event`, and `live_events` counts only real events.
 *
 *   node scripts/export-live-players.mjs [outfile.xlsx]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import XLSX from "xlsx";

const { initializeApp } = await import("firebase/app");
const { getFirestore, collection, getDocs } = await import("firebase/firestore");

const out = process.argv[2] ?? "live-players-export.xlsx";
const TEST_EVENTS = new Set(["windy_city_open_2024", "worldcup_2024"]);

const registry = JSON.parse(
  fs.readFileSync(new URL("./player-identity-registry.json", import.meta.url)),
);
const regLid = new Map(
  registry.players.filter((p) => p.league_id).map((p) => [String(p.player_id), String(p.league_id)]),
);

const db = getFirestore(
  initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, projectId: "fantasy-paintball" }),
);

const eventsSnap = await getDocs(collection(db, "events"));
const events = eventsSnap.docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .sort((a, b) => (a.lockDate?.seconds ?? 0) - (b.lockDate?.seconds ?? 0));
const eventIds = events.map((e) => e.id);
const liveEventIds = eventIds.filter((e) => !TEST_EVENTS.has(e));

const appearances = [];
for (const ev of events) {
  const snap = await getDocs(collection(db, "events", ev.id, "players"));
  for (const d of snap.docs) {
    const data = d.data();
    // The doc ID is the identity pickems resolve against. The doc's own `player_id`
    // field is stale on any doc the identity fix moved, so keep it as a separate column.
    appearances.push({ event_id: ev.id, ...data, player_id: d.id, player_id_field: data.player_id ?? "" });
  }
  console.log(`  ${ev.id.padEnd(24)} ${String(snap.size).padStart(3)}${TEST_EVENTS.has(ev.id) ? "  (test)" : ""}`);
}

const PREFERRED = ["player_id", "player_id_field", "league_id", "Player", "Number", "team_id", "Team", "Cost", "Status"];
const allKeys = [...new Set(appearances.flatMap(Object.keys))];
const cols = [...PREFERRED.filter((k) => allKeys.includes(k)),
              ...allKeys.filter((k) => !PREFERRED.includes(k) && k !== "event_id")];

const byPlayer = new Map();
for (const a of appearances) {
  if (!byPlayer.has(a.player_id)) byPlayer.set(a.player_id, []);
  byPlayer.get(a.player_id).push(a);
}

const players = [...byPlayer.entries()].map(([pid, apps]) => {
  const ordered = [...apps].sort((x, y) => eventIds.indexOf(x.event_id) - eventIds.indexOf(y.event_id));
  const live = ordered.filter((a) => !TEST_EVENTS.has(a.event_id));
  const latest = (live.length ? live : ordered).at(-1);

  // league_id: newest non-empty Firestore value wins, then the registry.
  const fromFs = [...ordered].reverse().find((a) => a.league_id !== undefined && a.league_id !== "");
  const league_id = fromFs ? String(fromFs.league_id) : (regLid.get(String(pid)) ?? "");
  const league_id_source = fromFs ? "firestore" : (regLid.has(String(pid)) ? "registry" : "MISSING");

  // img_url is missing on most 2026 docs, so fall back to the newest event that has one.
  const imgSrc = [...ordered].reverse().find((a) => String(a.img_url ?? "").trim());
  const img_url = imgSrc ? String(imgSrc.img_url).trim() : "";

  const row = { player_id: pid, league_id, league_id_source, img_url_latest: img_url,
                img_url_from: imgSrc ? imgSrc.event_id : "" };
  for (const c of cols) if (c !== "player_id" && c !== "league_id") row[c] = latest[c] ?? "";
  row.live_events = live.length;
  row.latest_event = live.length ? latest.event_id : "(2024 test only)";
  for (const e of eventIds) row[e] = apps.some((a) => a.event_id === e) ? 1 : "";
  return row;
}).sort((a, b) => String(a.player_id).localeCompare(String(b.player_id)));

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(players), "players");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
  appearances.map((a) => ({ event_id: a.event_id, ...Object.fromEntries(cols.map((c) => [c, a[c] ?? ""])) }))
    .sort((a, b) => eventIds.indexOf(a.event_id) - eventIds.indexOf(b.event_id)
                 || String(a.player_id).localeCompare(String(b.player_id))),
), "appearances");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(events.map((e, i) => ({
  order: i + 1, event_id: e.id, name: e.name ?? "", status: e.status ?? "",
  lockDate: e.lockDate ? new Date(e.lockDate.seconds * 1000).toISOString().slice(0, 10) : "",
  is_test: TEST_EVENTS.has(e.id) ? "YES" : "",
  players: appearances.filter((a) => a.event_id === e.id).length,
}))), "events");
XLSX.writeFile(wb, out);

const src = players.reduce((m, p) => ((m[p.league_id_source] = (m[p.league_id_source] ?? 0) + 1), m), {});
console.log(`\ndistinct player_ids: ${players.length}  (live-event players: ${players.filter((p) => p.live_events).length})`);
console.log("league_id source:", src);
console.log(`wrote ${out}`);
