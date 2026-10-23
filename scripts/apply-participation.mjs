/**
 * APPLY — player participation.
 *
 * Writes the `participation` verdict onto every event roster document. Imports the
 * same plan as `dry-run-participation.mjs`, so what was reviewed is what runs.
 *
 *   node scripts/dry-run-participation.mjs      # review first, writes nothing
 *   node scripts/apply-participation.mjs --yes  # then this
 *
 * ONE EVENT, SOME TEAMS (the hub's Data agent during a live event, Oct 2026):
 *
 *   node scripts/apply-participation.mjs --event world_cup_2026 --sheet sheet.json \
 *        --teams HEAT,JC --overrides james.json --json plan.json      # read-only
 *   node scripts/apply-participation.mjs ...same flags... --plan plan.json --yes
 *
 *   --event      one event id (listed in EVENTS or not); default every listed event
 *   --sheet      a fresh crawl of that event's league rosters (JSON, see loadSheetJson)
 *                instead of the historic CSV; needs --event
 *   --teams      comma-separated team_ids: only their players are planned and written
 *   --overrides  James's corrections (JSON, see loadOverrides)
 *   --json       write the plan to this file (read-only, with or without --yes)
 *   --plan       with --yes: the plan James approved. The apply recomputes the plan and
 *                refuses to write anything unless its writes are exactly that file's.
 *
 * Uses firebase-admin with Application Default Credentials, which bypasses the
 * Firestore rules. The client SDK cannot be used here: `events/{id}/players` is
 * `allow write: if false` since the Stage 1 lockdown, by design.
 *
 * WHAT THIS TOUCHES
 * Three new fields, and nothing else:
 *
 *   participation        "played" | "absent" | "unknown"
 *   participationReason  which rule decided it
 *   participationAt      when it was resolved
 *
 * `Confirmed Kills`, `Cost`, `Rank` and the type splits are never written. Both
 * scoring paths (`recalc-user-score.js`, `refresh-event-leaderboard.js`) read only
 * `Confirmed Kills` keyed by document id, and picks live on `users/{uid}.pickems`,
 * so no score or leaderboard position can move as a result of this script.
 * `syncRoster()` writes under an updateMask of nine named metadata fields, none of
 * them these, so a later roster upload will not wipe them.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import admin from "firebase-admin";

import {
  EVENTS,
  shortOf,
  loadRegistry,
  loadTeamSheet,
  loadSheetJson,
  loadOverrides,
  loadRosters,
  buildPlan,
  planJson,
  pendingOf,
} from "./participation-plan.mjs";

const DEFAULT_CSV = `${homedir()}/Documents/nxl-pro-players/Player_Roster_Historic.csv`;
const REGISTRY = "scripts/player-identity-registry.json";
const BATCH = 400;

const line = (c = "─") => console.log(c.repeat(78));

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : null;
}

/** Adapters so the plan module's loader works against the admin SDK unchanged. */
const collection = (db, ...path) => db.collection(path.join("/"));
const getDocs = async (ref) => {
  const snap = await ref.get();
  return { docs: snap.docs.map((d) => ({ id: d.id, data: () => d.data() })) };
};

async function main() {
  const confirmed = process.argv.includes("--yes");
  const csvPath = arg("--csv") ?? DEFAULT_CSV;
  const onlyEvent = arg("--event");
  const sheetPath = arg("--sheet");
  const teamsArg = arg("--teams");
  const overridesPath = arg("--overrides");
  const jsonPath = arg("--json");
  const approvedPath = arg("--plan");
  if (sheetPath && !onlyEvent) throw new Error("--sheet needs --event");
  const events = onlyEvent ? [onlyEvent] : EVENTS;
  const teams = teamsArg ? teamsArg.split(",").map((t) => t.trim()).filter(Boolean) : null;

  admin.initializeApp({ projectId: "fantasy-paintball" });
  const db = admin.firestore();

  const registry = loadRegistry(JSON.parse(readFileSync(REGISTRY, "utf8")));
  const { sheet } = sheetPath
    ? loadSheetJson(JSON.parse(readFileSync(sheetPath, "utf8")), onlyEvent)
    : loadTeamSheet(readFileSync(csvPath, "utf8"));
  const overrides = overridesPath ? loadOverrides(JSON.parse(readFileSync(overridesPath, "utf8"))) : null;
  const rosters = await loadRosters(db, { collection, getDocs }, events);
  const plan = buildPlan({ rosters, sheet, registry, events, teams, overrides });
  const { byEvent, warnings, totals } = plan;

  if (jsonPath) {
    writeFileSync(
      jsonPath,
      JSON.stringify(planJson(plan, { builtAt: new Date().toISOString(), events: events, teams, sheet: sheetPath ?? csvPath }), null, 1),
    );
  }

  console.log("\nAPPLY — player participation.");
  line("=");
  console.log(`team sheet : ${sheetPath ?? csvPath}`);
  if (onlyEvent) console.log(`event      : ${onlyEvent}`);
  if (teams) console.log(`teams      : ${teams.join(", ")}`);
  console.log(`registry   : ${registry.size} players with a league id`);

  if (warnings.length) {
    console.log("\nWARNINGS");
    warnings.forEach((w) => console.log(`  ! ${w}`));
  }

  const pending = [];
  for (const eventId of events) {
    const plan = byEvent.get(eventId);
    if (!plan) continue;
    plan.rows.filter((r) => r.changed).forEach((r) => pending.push(r));
  }

  console.log("\nTO WRITE");
  line();
  for (const eventId of events) {
    const plan = byEvent.get(eventId);
    if (!plan) continue;
    const c = (v) => plan.rows.filter((r) => r.verdict === v).length;
    console.log(
      `  ${shortOf(eventId).padEnd(6)}${eventId.padEnd(24)}` +
        `played ${String(c("played")).padStart(4)}   ` +
        `absent ${String(c("absent")).padStart(3)}   ` +
        `unknown ${String(c("unknown")).padStart(3)}   ` +
        `writing ${plan.rows.filter((r) => r.changed).length}`,
    );
  }
  console.log(
    `\n  TOTAL played ${totals.played}, absent ${totals.absent}, unknown ${totals.unknown}` +
      `  —  ${pending.length} documents to write`,
  );

  if (!pending.length) {
    console.log("\nNothing to write — every document already matches the plan.\n");
    return;
  }
  if (approvedPath) {
    // What James approved must be exactly what is written: same players, same verdicts,
    // same reasons. Anything moved since (a new kill upload, a roster change) stops here.
    const key = (w) => `${w.eventId}/${w.playerId}=${w.verdict}|${w.reason}`;
    const approved = new Set((JSON.parse(readFileSync(approvedPath, "utf8")).pending ?? []).map(key));
    const now = pendingOf(byEvent).map(key);
    const extra = now.filter((k) => !approved.has(k));
    const gone = [...approved].filter((k) => !now.includes(k));
    if (extra.length || gone.length) {
      console.error(`\n❌ The plan has changed since it was approved — nothing written.`);
      extra.slice(0, 10).forEach((k) => console.error(`   new:  ${k}`));
      gone.slice(0, 10).forEach((k) => console.error(`   gone: ${k}`));
      process.exit(2);
    }
    console.log(`\nPlan matches the approved file (${now.length} writes).`);
  }
  if (!confirmed) {
    console.log("\nNo --yes flag, so nothing was written.");
    console.log("Review with `node scripts/dry-run-participation.mjs`, then re-run with --yes.\n");
    return;
  }

  console.log(`\nWriting ${pending.length} documents…`);
  let written = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = db.batch();
    for (const r of pending.slice(i, i + BATCH)) {
      batch.set(
        db.doc(`events/${r.eventId}/players/${r.playerId}`),
        {
          participation: r.verdict,
          participationReason: r.reason,
          participationAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        // merge so every stat, cost and roster field on the document survives.
        { merge: true },
      );
    }
    await batch.commit();
    written += Math.min(BATCH, pending.length - i);
    console.log(`  ${written}/${pending.length}`);
  }

  console.log("\nDone.");
  line("=");
  console.log(`Wrote ${written} documents. No stat, pick or leaderboard field was touched.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
