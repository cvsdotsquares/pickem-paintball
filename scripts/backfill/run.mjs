/**
 * Backfill historic long data, one event at a time, validating before every write.
 *
 *   node scripts/backfill/run.mjs                 # dry run — validates, writes nothing
 *   node scripts/backfill/run.mjs --yes           # upload events that pass
 *   node scripts/backfill/run.mjs --yes --event world_cup_2025
 *
 * PER-EVENT HALT. Uploading fires `recomputeEvent`, which overwrites the published
 * Confirmed Kills, Rank and type splits for that event. So before writing a row we
 * recompute what the totals WOULD become and compare against what is live. If they
 * disagree the event is skipped and reported — history is not rewritten unattended.
 * A skip never blocks the others.
 *
 * Uploads in chunks with one manifest each, which rehearses the live cadence: the same
 * trigger chain a scorer's submit fires, several times per event.
 */

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EVENT_FILES, EXCLUDED, buildGameId, isSentinel, parseEvent } from "./parse.mjs";
import { dayLabelsByDate, indexFixtures, isLeaguePrelim, isPrelim, loadFixtures, meetingsByPair, normTeam, PLAYOFF_ROUND } from "./fixtures.mjs";
import { buildResolver } from "./resolve.mjs";
import { remapArchiveId } from "./identity.mjs";

const DIR = "/Users/jamesgreen/Documents/PickEm Paintball/historic data";
const FIXTURES = path.join(DIR, "NXL_Power_Rankings_2026_v17.xlsx");
const CHUNK = 400;

/**
 * Deltas signed off as corrections rather than errors.
 *
 * The gate exists to stop published stats being rewritten unattended, so anything that
 * moves a live number must be named here explicitly, with the reason and the exact
 * before/after. A blanket "proceed anyway" flag would defeat the point.
 *
 * Approved by James, 31 Aug 2026.
 */
const APPROVED_DELTAS = [
  {
    eventId: "tampa_bay_open_2025",
    playerId: "100121",
    who: "Jackson Frey",
    from: 0,
    to: 5,
    why:
      "Logged in the long data as 'Jackson Noodle Knees Frey'. The original upload " +
      "could not resolve the nickname, so the kills were dropped and he was published " +
      "at 0. The long data is the more correct source; this restores them.",
  },
  {
    eventId: "mid_atlantic_open_2026",
    playerId: "100371",
    who: "Alex D'Acquisto",
    from: 0,
    to: 1,
    why:
      "Logged without the apostrophe, so the original upload could not match him to " +
      "the roster and the kill was lost. Same cause as Jackson Frey.",
  },
  {
    eventId: "midwest_open_2025",
    playerId: "100166",
    who: "Clayton Hughes",
    from: 11,
    to: 13,
    why: "Two kills logged as 'Clay Hughes' and lost by the original upload.",
  },
  {
    eventId: "midwest_open_2025",
    playerId: "100321",
    who: "Steve Wojnicz",
    from: 1,
    to: 3,
    why: "Two kills logged as 'Steve Pablo Wojnicz' and lost by the original upload.",
  },
];

const TYPE_FIELD = {
  Gunfight: "Gunfights", Breakshooting: "Breakshooting", Movement: "Movement",
  "Zone Coverage": "Zone Coverage", Pressure: "Pressure", Trade: "Trades",
};
const TYPE_FIELDS = Object.values(TYPE_FIELD);
const arg = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
const line = (c = "─") => console.log(c.repeat(78));

/** A date and the days either side, as YYYY-MM-DD. */
function nearby(d) {
  if (!d) return [];
  const t = Date.parse(`${d}T00:00:00Z`);
  if (Number.isNaN(t)) return [d];
  return [-1, 0, 1].map((o) => new Date(t + o * 86400000).toISOString().slice(0, 10));
}

/** Mirrors aggregateRows in longDataRecompute — always sums weight, never counts rows. */
function projectTotals(rows) {
  const byPlayer = new Map();
  for (const r of rows) {
    if (!r.playerId) continue;
    const w = Number(r.weight);
    if (!isFinite(w) || w === 0) continue;
    if (!byPlayer.has(r.playerId)) {
      const t = { "Confirmed Kills": 0, Unclassified: 0 };
      TYPE_FIELDS.forEach((f) => { t[f] = 0; });
      byPlayer.set(r.playerId, t);
    }
    const t = byPlayer.get(r.playerId);
    t["Confirmed Kills"] += w;
    const field = TYPE_FIELD[String(r.type || "").trim()];
    if (field) t[field] += w;
  }
  for (const t of byPlayer.values()) {
    t.Unclassified = +(t["Confirmed Kills"] - TYPE_FIELDS.reduce((a, f) => a + t[f], 0)).toFixed(4);
  }
  return byPlayer;
}

async function handleEvent(db, file, eventId, fixtures, { write }) {
  console.log(`\n\n${"═".repeat(78)}\n${eventId}\n${"═".repeat(78)}`);
  const parsed = parseEvent(path.join(DIR, file));
  const { rows, dropped, dupNames } = parsed;

  /**
   * IDENTITY COMES FROM FIRESTORE, NOT THE ARCHIVE.
   *
   * The workbooks were exported on 2 Aug, three weeks before the identity fix
   * renumbered ids and merged duplicate people. Trusting their player_id column would
   * write kills against retired ids — Matt Askren's would have landed on 100052, which
   * no longer exists, scoring him zero. Two archives have no team_id column at all.
   *
   * The live roster for the event is post-fix and is what every other collection keys
   * on, so names are resolved against it and the archive is used only as a fallback.
   */
  const rosterSnap = await db.collection(`events/${eventId}/players`).get();
  const playerIdByName = new Map();
  const teamIdByName = new Map();
  const rosterDupes = new Set();
  rosterSnap.docs.forEach((d) => {
    const name = String(d.get("Player") ?? "").trim();
    const team = String(d.get("Team") ?? "").trim();
    const tid = String(d.get("team_id") ?? "").trim();
    if (name) {
      if (playerIdByName.has(name)) rosterDupes.add(name);
      playerIdByName.set(name, d.id);
    }
    if (team && tid) teamIdByName.set(team, tid);
  });
  // Team ids only. The archive's PLAYER ids are pre-fix and must never be a fallback:
  // "Matthew Askren" matched one exactly and resolved to 100052, an id the August merge
  // retired, so his 15.5 kills scored for a player who no longer exists. Falling through
  // to the name rules instead finds "Matt Askren" on the live roster.
  for (const [n, id] of parsed.teamIdByName) if (!teamIdByName.has(n)) teamIdByName.set(n, id);
  if (rosterDupes.size) console.log(`⚠ duplicate names on the live roster: ${[...rosterDupes].join(", ")}`);

  console.log(`parsed ${rows.length} usable rows from ${parsed.liveCount} roster entries`);
  if (dropped.length) {
    console.log(`\nDROPPED ${dropped.length} rows (never uploaded):`);
    const why = new Map();
    dropped.forEach((d) => why.set(d.why, (why.get(d.why) ?? 0) + 1));
    [...why].forEach(([w, n]) => console.log(`   ${n.toString().padStart(3)}  ${w}`));
    dropped.slice(0, 6).forEach((d) => console.log(`     row ${d.sheetRow}: ${d.why} — ${d.team ?? ""} v ${d.opponent ?? ""} ${d.player ?? ""}`));
  }
  if (dupNames.length) console.log(`\n⚠ duplicate player names in the archive roster: ${dupNames.join(", ")}`);

  // ── resolve players and teams ────────────────────────────────────────────
  /**
   * IDS FIRST. The archive's own Live Data carries the exact spelling the Long Data
   * uses, with an id attached, so "Matthew Askren" needs no fuzzy matching — it needs
   * remapping through the August identity fix. Name matching is the fallback for the
   * handful of rows whose player is not on the roster at all (a nickname, an
   * apostrophe), and every use of it is reported.
   */
  const liveIds = new Set(rosterSnap.docs.map((d) => d.id));
  const resolve = buildResolver(playerIdByName);
  const unresolved = new Map();
  const viaName = new Map();
  const viaRemap = new Map();
  const deadIds = new Map();
  for (const r of rows) {
    r.gameId = buildGameId(eventId, r.round, r.team, r.opponent, teamIdByName);
    r.teamId = teamIdByName.get(r.team) ?? null;
    r.opponentId = teamIdByName.get(r.opponent) ?? null;
    if (isSentinel(r.player)) { r.playerId = null; r.credit = r.player.toLowerCase(); continue; }
    r.credit = "player";

    const archiveId = parsed.playerIdByName.get(r.player) ?? null;
    const mapped = remapArchiveId(eventId, archiveId);
    if (mapped && liveIds.has(mapped)) {
      r.playerId = mapped;
      if (mapped !== archiveId) viaRemap.set(r.player, { n: (viaRemap.get(r.player)?.n ?? 0) + 1, from: archiveId, to: mapped });
      continue;
    }
    // An archive id that survives the remap but is not on the live roster is the
    // "larger problem" — a person the fix did not account for. Never guess past it.
    if (mapped && !liveIds.has(mapped)) {
      deadIds.set(r.player, { n: (deadIds.get(r.player)?.n ?? 0) + 1, archiveId, mapped });
      r.playerId = null;
      continue;
    }
    const got = resolve(r.player);
    r.playerId = got.id;
    if (got.id) viaName.set(r.player, { n: (viaName.get(r.player)?.n ?? 0) + 1, how: got.how });
    else unresolved.set(r.player, { n: (unresolved.get(r.player)?.n ?? 0) + 1, how: got.how });
  }
  if (viaRemap.size) {
    console.log(`\nids remapped through the identity fix (${viaRemap.size}):`);
    [...viaRemap].forEach(([n, v]) => console.log(`   ${String(v.n).padStart(4)}  "${n}"  ${v.from} → ${v.to}`));
  }
  if (viaName.size) {
    console.log(`\nresolved by name — not in the archive roster (${viaName.size}):`);
    [...viaName].forEach(([n, v]) => console.log(`   ${String(v.n).padStart(4)}  "${n}"  →  ${v.how}`));
  }
  if (deadIds.size) {
    console.log(`\n⛔ ARCHIVE IDS THAT DO NOT EXIST TODAY (${deadIds.size}) — the identity fix missed these:`);
    [...deadIds].forEach(([n, v]) => console.log(`   ${String(v.n).padStart(4)}  "${n}"  archive ${v.archiveId} → ${v.mapped}, not on the live roster`));
  }
  if (unresolved.size) {
    console.log(`\n⚠ UNRESOLVED PLAYER NAMES (${unresolved.size}) — these kills would score for nobody:`);
    [...unresolved].sort((a, b) => b[1].n - a[1].n).forEach(([n, v]) => console.log(`   ${String(v.n).padStart(4)}  "${n}"  — ${v.how}`));
  }
  const noTeam = [...new Set(rows.filter((r) => !r.teamId || !r.opponentId).flatMap((r) => [r.teamId ? null : r.team, r.opponentId ? null : r.opponent]).filter(Boolean))];
  if (noTeam.length) console.log(`\n⚠ teams with no team_id: ${noTeam.join(", ")}`);

  // ── point-sequence check: a real game never skips a point ────────────────
  const games = new Map();
  rows.forEach((r) => { if (!games.has(r.gameId)) games.set(r.gameId, []); games.get(r.gameId).push(r); });
  const holes = [];
  for (const [gid, rs] of games) {
    const pts = [...new Set(rs.map((r) => r.point))].filter((p) => p > 0).sort((a, b) => a - b);
    if (!pts.length) { holes.push({ gid, why: "no point numbers" }); continue; }
    const max = Math.max(...pts);
    const missing = [];
    for (let i = 1; i <= max; i++) if (!pts.includes(i)) missing.push(i);
    if (missing.length) holes.push({ gid, why: `missing points ${missing.join(",")} of ${max}`, rows: rs.length });
  }
  /**
   * A team pair under two different rounds is a SPLIT GAME — one match whose rows were
   * scattered across two gameIds by a mistyped round. That corrupts the fixture list
   * and must block.
   *
   * A hole in the point sequence is different and much smaller: the game is intact,
   * one point simply has no recorded kills. Worth reporting, not worth blocking — it
   * costs nothing downstream because nothing counts points.
   */
  const fxList = fixtures.byEvent.get(eventId) ?? null;
  const byPair = new Map();
  rows.forEach((r) => {
    const k = [r.teamId ?? r.team, r.opponentId ?? r.opponent].sort().join(" v ");
    if (!byPair.has(k)) byPair.set(k, new Set());
    byPair.get(k).add(r.round);
  });
  const splits = [...byPair].filter(([, rs]) => rs.size > 1);
  console.log(`\ngames derived: ${games.size}`);

  /**
   * Ask the league how many times each split pair actually met.
   *
   * Two rounds for one pair is only a problem if they met once — then one label is a
   * typo and the fixture list names the right round. If they met twice (a prelim and a
   * playoff, which happens constantly) then two gameIds are correct and it was never a
   * split. Only the fixture list can tell those apart.
   */
  const corrections = [];
  const unresolvedSplits = [];
  if (fxList) {
    const meetings = meetingsByPair(fxList);
    const dayOf = dayLabelsByDate(rows);
    for (const [pairKey, roundSet] of splits) {
      const sample = rows.find((r) => [r.teamId ?? r.team, r.opponentId ?? r.opponent].sort().join(" v ") === pairKey);
      const namePair = [normTeam(sample.team), normTeam(sample.opponent)].sort().join(" v ");
      const met = meetings.get(namePair) ?? [];
      if (met.length >= roundSet.size) {
        console.log(`   ok  ${pairKey} under ${[...roundSet].join(" + ")} — league records ${met.length} meetings, not a split`);
        continue;
      }
      if (met.length === 1) {
        const f = met[0];
        // Playoff rounds map directly; a prelim's correct label is whatever day that
        // date carries elsewhere in this event's own data.
        // f.round is a LEAGUE label here, so it needs the league predicate.
        const target = isLeaguePrelim(f.round)
          ? dayOf.get(f.date) ?? null
          : Object.keys(PLAYOFF_ROUND).find((k) => PLAYOFF_ROUND[k] === f.round) ?? null;
        if (target && roundSet.has(target)) {
          const wrong = [...roundSet].filter((r) => r !== target);
          corrections.push({ pairKey, namePair, target, wrong, fixture: `${f.round} ${f.date}` });
          continue;
        }
        unresolvedSplits.push({ pairKey, rounds: [...roundSet], fixture: `${f.round} ${f.date}`, target });
        continue;
      }
      unresolvedSplits.push({ pairKey, rounds: [...roundSet], fixture: `${met.length} meetings on record` });
    }
  }
  console.log(`split games: ${splits.length} candidates → ${corrections.length} correctable, ${unresolvedSplits.length} need a human`);
  corrections.forEach((c) => console.log(`   fix ${c.pairKey}: ${c.wrong.join("/")} → ${c.target}   (league: ${c.fixture})`));
  unresolvedSplits.forEach((u) => console.log(`   ✗  ${u.pairKey} under ${u.rounds.join(" + ")} — league says ${u.fixture}`));

  /**
   * A playoff game under a round the league disagrees with.
   *
   * Distinct from a split: the pair appears once, in one round, but the wrong one.
   * Tampa Bay 2026 had two quarter-finals labelled Wildcard, and World Cup had a
   * round-of-16 game labelled Top8. Nothing tripped the split detector because
   * nothing was torn in half — the label was simply wrong.
   *
   * Only ever applied when the league records exactly one meeting for the pair, so
   * there is no ambiguity about which game is being renamed.
   */
  if (fxList) {
    const meetings = meetingsByPair(fxList);
    const seen = new Map();
    rows.forEach((r) => {
      if (!PLAYOFF_ROUND[r.round]) return;
      const pair = [normTeam(r.team), normTeam(r.opponent)].sort().join(" v ");
      const k = `${pair}|${r.round}`;
      if (!seen.has(k)) seen.set(k, pair);
    });
    for (const [k, pair] of seen) {
      const round = k.split("|")[1];
      const met = (meetings.get(pair) ?? []).filter((f) => !isLeaguePrelim(f.round));
      if (met.length !== 1) continue;
      const want = Object.keys(PLAYOFF_ROUND).find((x) => PLAYOFF_ROUND[x] === met[0].round);
      if (!want || want === round) continue;
      corrections.push({ pairKey: pair, namePair: pair, target: want, wrong: [round], fixture: `${met[0].round} ${met[0].date}` });
    }
    corrections
      .filter((c) => c.namePair === c.pairKey)
      .forEach((c) => console.log(`   fix ${c.pairKey}: ${c.wrong.join("/")} → ${c.target}   (league: ${c.fixture})`));
  }

  // Apply the corrections in memory so the rest of the run sees the repaired data.
  if (corrections.length) {
    const fixMap = new Map();
    corrections.forEach((c) => c.wrong.forEach((w) => fixMap.set(`${c.pairKey}|${w}`, c.target)));
    let n = 0;
    for (const r of rows) {
      // Corrections are keyed either by team-id pair (splits) or by display-name pair
      // (wrong-round), so try both rather than duplicating the table.
      const byId = `${[r.teamId ?? r.team, r.opponentId ?? r.opponent].sort().join(" v ")}|${r.round}`;
      const byName = `${[normTeam(r.team), normTeam(r.opponent)].sort().join(" v ")}|${r.round}`;
      const target = fixMap.get(byId) ?? fixMap.get(byName);
      if (target) { r.correctedFrom = r.round; r.round = target; r.gameId = buildGameId(eventId, r.round, r.team, r.opponent, teamIdByName); n++; }
    }
    console.log(`   ${n} rows re-labelled; games now ${new Set(rows.map((r) => r.gameId)).size}`);
    games.clear();
    rows.forEach((r) => { if (!games.has(r.gameId)) games.set(r.gameId, []); games.get(r.gameId).push(r); });
  }
  console.log(`points with no recorded kills: ${holes.length}  (informational — the game is intact)`);
  holes.slice(0, 5).forEach((h) => console.log(`     ${h.gid}  ${h.why}`));

  // ── fixture validation ───────────────────────────────────────────────────
  let unknown = [];
  if (!fxList) {
    console.log(`\n⚠ no fixtures found for ${eventId} — skipping fixture validation`);
  } else {
    const idx = indexFixtures(fxList);
    const seen = new Set();
    for (const [gid, rs] of games) {
      const r = rs[0];
      const pair = [normTeam(r.team), normTeam(r.opponent)].sort().join(" v ");
      /**
       * Prelims match on date, with a day either side.
       *
       * The two sources disagree by one day on some events and not others — Tampa Bay
       * 2025 lines up exactly, while Atlantic City runs a day later in our sheet than
       * in the league's and Midwest a day earlier. Neither is systematically right, so
       * an exact match would reject 84 real games over a calendar quibble. A tolerance
       * of ±1 day still pins the game down: two teams do not meet twice in prelims
       * inside a 48-hour window, and if they somehow did, the pair count would catch it.
       */
      const ok = isPrelim(r.round)
        ? [...new Set(rs.map((x) => x.date))].some((d) => nearby(d).some((n) => idx.byDate.has(`${n}|${pair}`)))
        : idx.byRound.has(`${PLAYOFF_ROUND[r.round]}|${pair}`);
      if (!ok) unknown.push({ gid, pair, round: r.round, dates: [...new Set(rs.map((x) => x.date))].join(","), rows: rs.length });
      seen.add(pair);
    }
    const fxPairs = new Set(fxList.map((f) => f.pair));
    const missingFx = [...fxPairs].filter((p) => !seen.has(p));
    console.log(`fixtures on record: ${idx.total}   games not matching any fixture: ${unknown.length}   fixture pairs with no long data: ${missingFx.length}`);
    unknown.slice(0, 8).forEach((u) => console.log(`   ✗ ${u.gid}  ${u.pair}  round=${u.round} dates=${u.dates} rows=${u.rows}`));
    if (missingFx.length) console.log(`   pairs never seen in long data: ${missingFx.slice(0, 6).join(" · ")}${missingFx.length > 6 ? " …" : ""}`);
  }

  // ── the gate: would this change published stats? ─────────────────────────
  const projected = projectTotals(rows);
  const liveSnap = rosterSnap;
  const approved = APPROVED_DELTAS.filter((a) => a.eventId === eventId);
  const deltas = [];
  const accepted = [];
  liveSnap.docs.forEach((d) => {
    const stored = Number(d.get("Confirmed Kills") ?? 0);
    const proj = projected.get(d.id)?.["Confirmed Kills"] ?? 0;
    if (Math.abs(stored - proj) <= 0.001) return;
    // An approval only counts if the numbers are exactly what was signed off. If the
    // data has moved since, it is a new delta and must be looked at again.
    const ok = approved.find(
      (a) => a.playerId === d.id && Math.abs(a.from - stored) < 0.001 && Math.abs(a.to - proj) < 0.001,
    );
    if (ok) accepted.push({ ...ok, stored, proj });
    else deltas.push({ id: d.id, name: d.get("Player"), stored, proj, diff: +(proj - stored).toFixed(2) });
  });
  if (accepted.length) {
    console.log(`\napproved corrections (published value will change):`);
    accepted.forEach((a) => console.log(`   ${a.who}: ${a.from} → ${a.to}   ${a.why.slice(0, 60)}…`));
  }
  const staleApprovals = approved.filter((a) => !accepted.some((x) => x.playerId === a.playerId));
  if (staleApprovals.length) {
    console.log(`\n⚠ approvals that no longer match the data (ignored, and they still block):`);
    staleApprovals.forEach((a) => console.log(`   ${a.who}: expected ${a.from} → ${a.to}`));
  }
  const extra = [...projected.keys()].filter((id) => !liveSnap.docs.some((d) => d.id === id));
  console.log(`\nGATE — recomputed vs published Confirmed Kills`);
  console.log(`   roster ${liveSnap.size} · players differing: ${deltas.length} · long-data players not on roster: ${extra.length}`);
  if (deltas.length) {
    deltas.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    deltas.slice(0, 10).forEach((x) => console.log(`   ${String(x.name).padEnd(24)} published ${String(x.stored).padStart(6)} → recomputed ${String(x.proj).padStart(6)}  (${x.diff > 0 ? "+" : ""}${x.diff})`));
    if (deltas.length > 10) console.log(`   … and ${deltas.length - 10} more`);
  }

  const blocked = deltas.length > 0 || unresolved.size > 0 || unresolvedSplits.length > 0 || unknown.length > 0 || deadIds.size > 0;
  if (blocked) {
    console.log(`\n⛔ SKIPPING ${eventId} — nothing written. Reasons: ` +
      [deltas.length && `${deltas.length} stat deltas`, unresolved.size && `${unresolved.size} unresolved names`,
       unresolvedSplits.length && `${unresolvedSplits.length} split games`, unknown.length && `${unknown.length} unknown fixtures`,
       deadIds.size && `${deadIds.size} dead ids`].filter(Boolean).join(", "));
    return { eventId, status: "skipped", rows: rows.length, deltas: deltas.length, unresolved: unresolved.size, holes: unresolvedSplits.length, unknown: unknown.length, corrections };
  }
  console.log(`\n✅ ${eventId} passes every check.`);

  if (!write) return { eventId, status: "would-upload", rows: rows.length };

  // ── upload in chunks, one manifest each ──────────────────────────────────
  let n = 0, chunks = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const batch = db.batch();
    slice.forEach((r, j) => {
      const rowId = `${eventId}_${String(i + j + 1).padStart(6, "0")}`;
      batch.set(db.doc(`long_data/${rowId}`), {
        rowId, eventId, gameId: r.gameId, round: r.round,
        team: r.team, teamId: r.teamId, opponent: r.opponent, opponentId: r.opponentId,
        point: r.point, player: r.player, playerId: r.playerId, credit: r.credit,
        type: r.type, weight: r.weight,
        date: r.date ? admin.firestore.Timestamp.fromDate(new Date(`${r.date}T00:00:00Z`)) : null,
        last_modified: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    n += slice.length; chunks++;
    const gids = [...new Set(slice.map((r) => r.gameId))];
    await db.doc(`uploads/${eventId}_${new Date().toISOString().replace(/[:.]/g, "-")}`).set({
      eventId, affectedGameIds: gids, rowCount: slice.length,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`   chunk ${chunks}: ${n}/${rows.length} rows, ${gids.length} games — manifest written, recompute triggered`);
    await new Promise((r) => setTimeout(r, 4000)); // let the function settle between chunks
  }
  return { eventId, status: "uploaded", rows: n, chunks };
}

async function main() {
  const write = process.argv.includes("--yes");
  const only = arg("--event");
  admin.initializeApp({ projectId: "fantasy-paintball" });
  const db = admin.firestore();

  console.log(write ? "BACKFILL — WRITING" : "BACKFILL — DRY RUN, nothing will be written");
  line("=");
  Object.entries(EXCLUDED).forEach(([e, why]) => console.log(`excluded  ${e}: ${why}`));

  const fixtures = loadFixtures(FIXTURES);
  if (fixtures.unmappedEvents.size) {
    console.log(`\n⚠ fixture events not mapped to an id:`);
    [...fixtures.unmappedEvents].forEach(([k, n]) => console.log(`   ${k} (${n})`));
  }

  const results = [];
  for (const [file, eventId] of Object.entries(EVENT_FILES)) {
    if (only && eventId !== only) continue;
    try {
      results.push(await handleEvent(db, file, eventId, fixtures, { write }));
    } catch (e) {
      console.log(`\n⛔ ${eventId} threw: ${e.message}`);
      results.push({ eventId, status: "error", error: e.message });
    }
  }

  console.log(`\n\n${"═".repeat(78)}\nSUMMARY\n${"═".repeat(78)}`);
  results.forEach((r) => console.log(`  ${r.status.padEnd(13)} ${r.eventId.padEnd(24)} ${r.rows ?? "-"} rows` +
    (r.status === "skipped" ? `   [deltas ${r.deltas}, unresolved ${r.unresolved}, splits ${r.holes}, unknown fixtures ${r.unknown}]` : "")));
  console.log("");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
