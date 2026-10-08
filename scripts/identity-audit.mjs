/**
 * Is any player data mismatched? One read-only pass over every identity we hold.
 *
 *   node scripts/identity-audit.mjs
 *   node scripts/identity-audit.mjs --verbose    # list every offending row
 *
 * WRITES NOTHING. Exits non-zero if any CRITICAL check fails.
 *
 * WHY THIS EXISTS
 * The identity problem has been fixed four times in four different disguises — id
 * collisions (22 Aug), missing `team_id` (22 Aug), missing `league_id` (4 Sep), a stale
 * inner `player_id` (5 Sep). Each was found by accident, while looking at something
 * else, and each was a one-off script. This is the same set of questions asked
 * deliberately and repeatably, so the next one surfaces in a day rather than when a
 * wrong number turns up on a career page.
 *
 * THE THREE IDS, kept straight (see ROSTER_IDENTITY.md):
 *   player_id   our own key. THE DOCUMENT ID is the identity; the field of the same
 *               name inside the document is a legacy copy and can disagree.
 *   league_id   the NXL's permanent numeric id. The join key to everything external.
 *   team_id     three letters, per event.
 *
 * Checks are graded. CRITICAL means a number on the site is or will be wrong; WARN
 * means we cannot verify something; INFO is context.
 */

import fs from "node:fs";
import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const HISTORY = require("../functions/data/nxlHistory.json");

const VERBOSE = process.argv.includes("--verbose");

admin.initializeApp({ projectId: "fantasy-paintball" });
const db = admin.firestore();

const results = [];
const record = (level, name, ok, detail, rows = []) =>
  results.push({ level, name, ok, detail, rows });

// ── Load ──────────────────────────────────────────────────────────────────────

const eventsSnap = await db.collection("events").get();
const eventIds = eventsSnap.docs
  .map((d) => d.id)
  .filter((id) => !id.includes("2024"))
  .sort();

/** docId -> [{eventId, leagueId, name, teamId, innerPlayerId}] */
const byDoc = new Map();
for (const eventId of eventIds) {
  const snap = await db.collection(`events/${eventId}/players`).get();
  snap.docs.forEach((d) => {
    if (!byDoc.has(d.id)) byDoc.set(d.id, []);
    byDoc.get(d.id).push({
      eventId,
      leagueId: String(d.get("league_id") ?? "").trim() || null,
      name: String(d.get("Player") ?? "").trim(),
      teamId: d.get("team_id") ?? null,
      innerPlayerId: d.get("player_id") == null ? null : String(d.get("player_id")),
    });
  });
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");

// ── 1. The document id is the identity ────────────────────────────────────────

{
  const bad = [];
  for (const [docId, rows] of byDoc) {
    for (const r of rows) {
      if (r.innerPlayerId != null && r.innerPlayerId !== docId) {
        bad.push(`${r.eventId}/${docId}  inner player_id=${r.innerPlayerId}  (${r.name})`);
      }
    }
  }
  record(
    "CRITICAL",
    "Inner `player_id` matches the document id",
    bad.length === 0,
    bad.length === 0
      ? "every roster row agrees with its own key"
      : `${bad.length} rows carry a stale copy. Anything reading the field instead of the key gets the wrong player.`,
    bad,
  );
}

// ── 2. One league_id per player, one player per league_id ─────────────────────

{
  const bad = [];
  for (const [docId, rows] of byDoc) {
    const ids = new Set(rows.map((r) => r.leagueId).filter(Boolean));
    if (ids.size > 1) bad.push(`${docId} (${rows[0].name}) has league_ids ${[...ids].join(", ")}`);
  }
  record(
    "CRITICAL",
    "A player has ONE league_id across every event",
    bad.length === 0,
    bad.length === 0
      ? "no player changes NXL identity between events"
      : `${bad.length} players carry more than one league_id — their league record is a blend of two people.`,
    bad,
  );
}

{
  const byLeague = new Map();
  for (const [docId, rows] of byDoc) {
    for (const r of rows) {
      if (!r.leagueId) continue;
      if (!byLeague.has(r.leagueId)) byLeague.set(r.leagueId, new Set());
      byLeague.get(r.leagueId).add(docId);
    }
  }
  const bad = [...byLeague]
    .filter(([, docs]) => docs.size > 1)
    .map(([lid, docs]) => `league_id ${lid} -> docs ${[...docs].join(", ")}`);
  record(
    "CRITICAL",
    "A league_id belongs to ONE player",
    bad.length === 0,
    bad.length === 0
      ? "no NXL identity is shared between two of our players"
      : `${bad.length} league_ids are shared — one person split across two ids, or two people merged.`,
    bad,
  );
}

// ── 3. The same person under two of our ids ───────────────────────────────────

{
  const byName = new Map();
  for (const [docId, rows] of byDoc) {
    const key = norm(rows[rows.length - 1].name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, new Set());
    byName.get(key).add(docId);
  }
  const bad = [...byName]
    .filter(([, docs]) => docs.size > 1)
    .map(([name, docs]) => {
      const detail = [...docs]
        .map((d) => `${d} (${byDoc.get(d).map((r) => r.eventId.slice(-4)).join("/")})`)
        .join("  vs  ");
      return `${name}: ${detail}`;
    });
  record(
    "CRITICAL",
    "One person, one document id",
    bad.length === 0,
    bad.length === 0
      ? "no name resolves to two player ids"
      : `${bad.length} names appear under more than one id — the classic mint-on-rollover split.`,
    bad,
  );
}

// ── 4. Picks resolve to a player that exists ──────────────────────────────────

{
  const usersSnap = await db.collection("users").get();
  const known = new Set(byDoc.keys());
  const dangling = new Map();
  let picksChecked = 0;
  usersSnap.docs.forEach((u) => {
    const pickems = u.get("pickems") || {};
    for (const [key, value] of Object.entries(pickems)) {
      if (key.includes("_captain") || key.endsWith("_draft")) continue;
      if (!Array.isArray(value)) continue;
      for (const id of value) {
        picksChecked++;
        const s = String(id);
        if (!known.has(s)) dangling.set(`${key}:${s}`, (dangling.get(`${key}:${s}`) ?? 0) + 1);
      }
    }
  });
  const bad = [...dangling].map(([k, n]) => `${k}  (${n} user${n === 1 ? "" : "s"})`);
  record(
    "CRITICAL",
    "Every pick resolves to a real player",
    bad.length === 0,
    bad.length === 0
      ? `${picksChecked} picks across ${usersSnap.size} users, all resolvable`
      : `${bad.length} distinct picks point at a player id that does not exist on that event's roster. Those picks score nothing.`,
    bad,
  );
}

// ── 5. Our league_id resolves in the NXL's own data ───────────────────────────

{
  const missing = [];
  const unknown = [];
  for (const [docId, rows] of byDoc) {
    const lid = rows.map((r) => r.leagueId).find(Boolean);
    const name = rows[rows.length - 1].name;
    if (!lid) { missing.push(`${docId} ${name}`); continue; }
    if (!HISTORY.appearances[lid]) unknown.push(`${docId} ${name} league_id=${lid}`);
  }
  record(
    "WARN",
    "league_id is present",
    missing.length === 0,
    `${byDoc.size - missing.length}/${byDoc.size} players carry one. Without it there is no league record and no way to verify them.`,
    missing,
  );
  record(
    "WARN",
    "league_id is known to the NXL crawl",
    unknown.length === 0,
    unknown.length === 0
      ? "every id we hold appears in the league's own data"
      : `${unknown.length} ids appear nowhere in the 2015-2026 crawl. Either wrong, or a player the crawl missed.`,
    unknown,
  );
}

// ── 6. The league agrees about which team they were on ────────────────────────

{
  const CLUB = HISTORY.clubTeamId ?? {};
  const keyOf = new Map(
    HISTORY.events.filter((e) => e.pickemEventId).map((e) => [e.pickemEventId, e.key]),
  );
  let checked = 0;
  const bad = [];
  for (const [docId, rows] of byDoc) {
    for (const r of rows) {
      const key = keyOf.get(r.eventId);
      if (!key || !r.leagueId || !r.teamId) continue;
      const ap = (HISTORY.appearances[r.leagueId] ?? []).find(([k]) => k === key);
      if (!ap) continue;
      checked++;
      const expected = CLUB[ap[1]];
      if (expected && expected !== r.teamId) {
        bad.push(`${r.eventId}/${docId} ${r.name}: ours=${r.teamId} league=${expected}`);
      }
    }
  }
  record(
    "CRITICAL",
    "The league agrees which team they played for",
    bad.length === 0,
    `${checked - bad.length}/${checked} roster appearances agree. This is what proves a league_id belongs to the player we attached it to.`,
    bad,
  );
}

// ── 7. The registry still describes reality ───────────────────────────────────

{
  const path = new URL("./player-identity-registry.json", import.meta.url);
  let drift = [];
  let note = "registry not found";
  if (fs.existsSync(path)) {
    const reg = JSON.parse(fs.readFileSync(path, "utf8"));
    drift = (reg.players ?? [])
      .filter((p) => {
        const rows = byDoc.get(String(p.player_id));
        if (!rows) return true;
        const live = rows.map((r) => r.leagueId).find(Boolean) ?? null;
        return String(live ?? "") !== String(p.league_id ?? "");
      })
      .map((p) => {
        const rows = byDoc.get(String(p.player_id));
        const live = rows ? (rows.map((r) => r.leagueId).find(Boolean) ?? "none") : "PLAYER GONE";
        return `${p.player_id} ${p.Player}: registry=${p.league_id ?? "none"} live=${live}`;
      });
    note = `${(reg.players ?? []).length} players in the registry, generated ${reg.generated?.slice(0, 10)}`;
  }
  record(
    "WARN",
    "The identity registry matches live data",
    drift.length === 0,
    drift.length === 0 ? note : `${note} — ${drift.length} entries have drifted.`,
    drift,
  );
}

// ── Report ────────────────────────────────────────────────────────────────────

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nIdentity audit — ${byDoc.size} players across ${eventIds.length} events\n`);

let criticalFailures = 0;
for (const r of results) {
  const mark = r.ok ? "PASS" : r.level === "CRITICAL" ? "FAIL" : "WARN";
  if (!r.ok && r.level === "CRITICAL") criticalFailures++;
  console.log(`  ${pad(mark, 5)} ${pad(r.name, 46)} ${r.detail}`);
  const show = VERBOSE ? r.rows : r.rows.slice(0, 4);
  show.forEach((x) => console.log(`         · ${x}`));
  if (!VERBOSE && r.rows.length > 4) {
    console.log(`         · ... ${r.rows.length - 4} more (--verbose for all)`);
  }
}

console.log(
  criticalFailures === 0
    ? `\nNo critical failures. Nothing on the site is joining the wrong player to the wrong data.\n`
    : `\n${criticalFailures} CRITICAL check(s) failed — see above.\n`,
);
process.exit(criticalFailures === 0 ? 0 : 1);
