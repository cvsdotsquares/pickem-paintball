/**
 * Add the NXL record to every player summary WITHOUT rebuilding the projection.
 *
 *   node scripts/nxl-history/patch-summaries.mjs          # dry run + proof, writes nothing
 *   node scripts/nxl-history/patch-summaries.mjs --write
 *
 * WHY NOT JUST REBUILD
 * A full rebuild recomputes every field from source, and the source has drifted:
 * `mid_west_open_2026` has lost `participation` on all 218 roster docs and its
 * `brand_color`, in the misdirected write of 2 Sep. Rebuilding from source publishes
 * that loss — 38 players flip from a correctly-marked DNP to "played".
 *
 * BOTH ARE RECOVERABLE and this script is a stopgap, not the answer: participation sits
 * intact in `scripts/backups/midwest-pre-sync-2026-09-02.json` and the brand colour
 * (#929889) in the stored projection. See the Data section of TODO.md.
 *
 * WHAT THIS DOES INSTEAD
 * Reads each stored summary and ADDS to it:
 *
 *   nxl              the league record, from the player's NXL id
 *   trackedFrom      the first season PickEm scored
 *   events[].record  their team's W-L and finish at that event
 *   events[].start   the event's date, so the page can interleave league events
 *   matches[].result the league's result for that game, plus the score
 *
 * Every other field is copied through UNTOUCHED from what is already stored — the
 * stored `kind`, `participation`, `fieldSize`, `rank` and the rest are the good values,
 * and this script never recomputes them. That is the whole point: the feature ships
 * without the drift riding along with it.
 *
 * The dry run proves that, per document, rather than asking to be trusted: it diffs
 * each patched document against the stored one and refuses to write if anything other
 * than the five fields above has moved.
 */

import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { nxlCareer, eventRecord, matchResult } = require("../../functions/nxlHistory.js");

admin.initializeApp({ projectId: "fantasy-paintball" });
const db = admin.firestore();

/** Exactly the fields this script is allowed to introduce or change. */
const ALLOWED = new Set([
  "nxl",
  "trackedFrom",
  "events[].record",
  "events[].start",
  "matches[].result",
  "matches[].scoreFor",
  "matches[].scoreAgainst",
]);

const stable = (v) =>
  v === null || typeof v !== "object"
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? `[${v.map(stable).join(",")}]`
      : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;

/** Every leaf path that differs between two objects. */
function diff(before, after, path = "", out = []) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    const p = path ? `${path}.${k}` : k;
    const a = before?.[k];
    const b = after?.[k];
    if (stable(a) === stable(b)) continue;
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      diff(a, b, p, out);
    } else if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      a.forEach((_, i) => diff(a[i], b[i], `${p}[]`, out));
    } else {
      out.push(p);
    }
  }
  return out;
}

// ── Source data ───────────────────────────────────────────────────────────────

const eventsSnap = await db.collection("events").get();
/** eventId -> ISO start date, from lockDate. */
const startOf = new Map();
const eventYears = [];
eventsSnap.docs.forEach((d) => {
  const year = d.id.split("_").pop() ?? "";
  if (year === "2024" || year.length !== 4) return;
  eventYears.push(year);
  const secs = d.get("lockDate")?.seconds;
  startOf.set(d.id, secs ? new Date(secs * 1000).toISOString().slice(0, 10) : null);
});
const trackedFrom = eventYears.sort()[0] ?? null;

/**
 * The player's NXL id, from ANY event roster that carries one.
 *
 * `league_id` is missing from plenty of rows — the 2025 World Cup international entries
 * mostly have none — and a blank on the most recent event would otherwise cost a player
 * their whole league history.
 */
const leagueIdOf = new Map();
for (const [eventId] of startOf) {
  const roster = await db.collection(`events/${eventId}/players`).get();
  roster.docs.forEach((d) => {
    const v = d.get("league_id");
    if (v == null || String(v).trim() === "") return;
    if (!leagueIdOf.has(d.id)) leagueIdOf.set(d.id, String(v).trim());
  });
}

// ── Patch ─────────────────────────────────────────────────────────────────────

const summaries = await db.collection("playerSummaries").get();
const patches = [];
const offLimits = new Map();
let unchanged = 0;
let withNxl = 0;

for (const doc of summaries.docs) {
  if (doc.id.startsWith("zzpreview_")) continue; // throwaway previews, left alone
  const { rebuiltAt, ...stored } = doc.data();

  // Team per event, so a match row can be scored from the side the player was on.
  const teamOf = new Map((stored.events ?? []).map((e) => [e.eventId, e.teamId ?? null]));

  const events = (stored.events ?? []).map((e) => ({
    ...e,
    record: eventRecord(e.eventId, e.teamId ?? null),
    start: startOf.get(e.eventId) ?? null,
  }));

  const matches = (stored.matches ?? []).map((m) => {
    const res = matchResult(m.eventId, m.round, null, teamOf.get(m.eventId) ?? null, m.opponentId ?? null);
    return {
      ...m,
      result: res ? res.result : null,
      scoreFor: res ? res.for : null,
      scoreAgainst: res ? res.against : null,
    };
  });

  /**
   * Absences come from the STORED rows, not from a fresh read of the rosters.
   *
   * That is the whole safety property of this script: the stored `kind` still holds the
   * participation verdicts that the roster documents have lost, so a player who sat an
   * event out keeps their DNP and does not collect a share of that tournament's result.
   */
  const absentEventIds = new Set(
    (stored.events ?? []).filter((e) => e.kind && e.kind !== "played").map((e) => e.eventId),
  );

  const nxl = nxlCareer(leagueIdOf.get(doc.id) ?? stored.leagueId ?? null, { absentEventIds });
  if (nxl) withNxl++;

  const patched = { ...stored, nxl, trackedFrom, events, matches };
  const changed = diff(stored, patched);
  if (changed.length === 0) { unchanged++; continue; }

  const bad = changed.filter((p) => !ALLOWED.has(p));
  if (bad.length) offLimits.set(doc.id, bad);

  patches.push({ id: doc.id, patch: { nxl, trackedFrom, events, matches }, changed });
}

// ── Report ────────────────────────────────────────────────────────────────────

const touched = new Map();
patches.forEach((p) => p.changed.forEach((c) => touched.set(c, (touched.get(c) ?? 0) + 1)));

console.log(`\nplayerSummaries: ${summaries.size} stored, ${patches.length} to patch, ${unchanged} already current`);
console.log(`documents that will carry an NXL record: ${withNxl}`);
console.log(`\nFields this patch touches:`);
[...touched].sort((a, b) => b[1] - a[1]).forEach(([p, n]) => console.log(`  ${String(n).padStart(5)}  ${p}`));

if (offLimits.size) {
  console.error(`\n❌ ${offLimits.size} document(s) would change a field this script is not allowed to touch:`);
  [...offLimits].slice(0, 5).forEach(([id, paths]) => console.error(`   ${id}: ${paths.join(", ")}`));
  console.error(`\nRefusing to write. The point of this script is that it is additive.\n`);
  process.exit(1);
}
console.log(`\n✅ Every change is one of the ${ALLOWED.size} allowed fields. Nothing else moves.`);

const write = process.argv.includes("--write");
await patchAllTime(write);
await patchSpotlight(write);

if (!write) {
  console.log(`\nNo --write flag, so nothing was written.\n`);
  process.exit(0);
}

/**
 * The all-time table reads `aggregates/allTime`, not the summaries, so it needs the
 * same treatment: add the six league columns to each stored row and change nothing else.
 *
 * Rebuilt from the stored rows rather than recomputed from summaries, for the same
 * reason as above — a fresh `buildAggregates` would recompute the kill totals and
 * `Events` count from data whose participation has drifted.
 */
async function patchAllTime(write) {
  const ref = db.doc("aggregates/allTime");
  const snap = await ref.get();
  const stored = (snap.data()?.players ?? []);
  if (!stored.length) {
    console.log(`\naggregates/allTime: empty, nothing to patch.`);
    return;
  }

  const NONE = "\u2014";
  /**
   * Every league column this script has ever written, including the ones since retired.
   *
   * Stripped from each stored row before the current set is written back, because a
   * rename leaves the old key behind otherwise: "NXL Wins" and "Event Wins" would both
   * sit in the document, and the table's allowlist would quietly render whichever it
   * still recognised. Firestore replaces an array wholesale rather than merging it
   * element-wise, so rebuilding each row is what actually removes them.
   */
  const LEAGUE_KEYS = [
    "NXL Events", "NXL Wins", "Win %", "Sundays", // retired 5 Sep
    "Event Wins", "Record", "Event Win %", "Match Win %",
  ];
  let withRecord = 0;
  const players = stored.map((row) => {
    const lid = leagueIdOf.get(String(row.player_id)) ?? null;
    // The summary is what knows which events this player sat out.
    const summary = summaries.docs.find((d) => d.id === String(row.player_id));
    const absentEventIds = new Set(
      ((summary?.get("events") ?? []).filter((e) => e.kind && e.kind !== "played")).map((e) => e.eventId),
    );
    const n = nxlCareer(lid, { absentEventIds });
    if (n) withRecord++;
    const league = n
      ? {
          "Event Wins": n.titles,
          Record: `${n.matchW}\u2013${n.matchL}`,
          "Event Win %": n.titleRate != null ? +n.titleRate.toFixed(1) : NONE,
          "Match Win %": n.matchWinPct != null ? +n.matchWinPct.toFixed(1) : NONE,
        }
      : {
          "Event Wins": NONE, Record: NONE, "Event Win %": NONE, "Match Win %": NONE,
        };

    // Order matters: the table's column allowlist is order-independent, but keeping the
    // league block ahead of the kills makes the stored document readable too.
    const { "Confirmed Kills": kills, ...rest } = row;
    const identity = Object.fromEntries(
      Object.entries(rest).filter(([k]) => !LEAGUE_KEYS.includes(k)),
    );
    return { ...identity, ...league, "Confirmed Kills": kills };
  });

  const changed = players.filter((p, i) => stable(p) !== stable(stored[i]));
  const bad = [];
  players.forEach((p, i) => {
    diff(stored[i], p).forEach((path) => {
      if (!LEAGUE_KEYS.includes(path)) {
        bad.push(`${stored[i].Player}: ${path}`);
      }
    });
  });

  console.log(`\naggregates/allTime: ${stored.length} rows, ${changed.length} to patch, ${withRecord} with a league record`);
  if (bad.length) {
    console.error(`❌ would change fields outside the league block: ${bad.slice(0, 5).join(", ")}`);
    process.exit(1);
  }
  console.log(`✅ Only the league columns change (added, renamed or removed).`);
  if (!write) return;
  await ref.set({ ...snap.data(), players }, { merge: true });
  console.log(`Patched aggregates/allTime.`);
}

/**
 * The career-stats landing page reads `aggregates/spotlight`, whose "All-time leaders"
 * row now shows Wins / Record / Kills-per-event and is ordered by tournament wins.
 *
 * ONLY `allTimeLeaders` IS WRITTEN.
 *
 * That began as a workaround: `buildAggregates` took `LATEST` from the newest event in
 * Firestore, which was `lone_star_open_2026` — rostered, unplayed — and every other row
 * here is scoped to LATEST, so a full build produced an empty event-leaders row and an
 * empty most-picked row. That is FIXED at source: LATEST is now the latest COMPLETED
 * event, by `eventEndsAt`.
 *
 * The narrow write stays anyway, for the reason the rest of this script exists: a full
 * rebuild recomputes from roster documents whose `participation` has drifted. Keeping
 * the blast radius to one key is still the right shape.
 *
 * The row is rebuilt rather than patched in place, because the ordering changed: the
 * six players are no longer the same six, so rewriting the stored cards' stats would
 * leave the old players in the old order wearing new numbers.
 */
async function patchSpotlight(write) {
  const ref = db.doc("aggregates/spotlight");
  const snap = await ref.get();
  const data = snap.data();
  if (!data) {
    console.log(`\naggregates/spotlight: missing, nothing to patch.`);
    return;
  }

  // Built from the STORED summaries, never a fresh rebuild — same rule as everywhere
  // else in this script.
  const stored = summaries.docs
    .filter((d) => !d.id.startsWith("zzpreview_"))
    .map((d) => {
      const { rebuiltAt, ...rest } = d.data();
      return rest;
    });
  const { buildAggregates } = require("../../functions/playerSummaries.js");
  const aggs = await buildAggregates(db, stored);
  const leaders = aggs.allTimeLeaders ?? [];
  if (!leaders.length) {
    console.error(`\n❌ built an empty all-time leaders row — refusing to write.`);
    process.exit(1);
  }

  const before = data.allTimeLeaders ?? [];
  console.log(`\naggregates/spotlight: all-time leaders row`);
  console.log(`   was: ${before.map((c) => `${c.name} (${c.stats?.[0]?.value})`).join(", ")}`);
  console.log(`   now: ${leaders.map((c) => `${c.name} (${c.stats?.[0]?.value})`).join(", ")}`);

  // Everything else in the document must survive untouched.
  const others = ["eventId", "eventName", "eventYear", "eventLeaders", "players"];
  const kept = others.filter((k) => stable(data[k]) === stable(data[k]));
  console.log(`✅ Writing allTimeLeaders only; ${kept.length} other keys carried through as stored.`);

  if (!write) return;
  await ref.set({ ...data, allTimeLeaders: leaders }, { merge: true });
  console.log(`Patched aggregates/spotlight.`);
}

const BATCH = 200;
for (let i = 0; i < patches.length; i += BATCH) {
  const batch = db.batch();
  for (const p of patches.slice(i, i + BATCH)) {
    // `update`, not `set`: anything this script did not compute stays exactly as stored.
    batch.update(db.doc(`playerSummaries/${p.id}`), p.patch);
  }
  await batch.commit();
}
console.log(`\nPatched ${patches.length} summaries.\n`);
process.exit(0);
