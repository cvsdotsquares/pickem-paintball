/**
 * DRY RUN — player participation.
 *
 * READ-ONLY. Writes nothing. Prints the exact `participation` value that
 * `apply-participation.mjs` would write to each event roster document, so the list
 * can be reviewed name by name first. Both scripts import the same plan from
 * `participation-plan.mjs`, so what you review is what runs.
 *
 *   node scripts/dry-run-participation.mjs
 *   node scripts/dry-run-participation.mjs --csv ~/path/to/Player_Roster_Historic.csv
 *   node scripts/dry-run-participation.mjs --event mid_west_open_2026
 *
 * The CSV is the crawler's role-aware output (the one with a `role` column). The
 * older `nxl_pro_players_long.csv` has no role column and sweeps in staff and pit
 * crew, so it must not be used here.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { homedir } from "node:os";

import {
  EVENTS,
  SHORT,
  SHEET_COVERAGE_FLOOR,
  loadRegistry,
  loadTeamSheet,
  loadRosters,
  buildPlan,
} from "./participation-plan.mjs";

const { initializeApp } = await import("firebase/app");
const { getFirestore, collection, getDocs } = await import("firebase/firestore");

const DEFAULT_CSV = `${homedir()}/Documents/nxl-pro-players/Player_Roster_Historic.csv`;
const REGISTRY = "scripts/player-identity-registry.json";

const line = (c = "─") => console.log(c.repeat(78));

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : null;
}

async function main() {
  const csvPath = arg("--csv") ?? DEFAULT_CSV;
  const onlyEvent = arg("--event");

  const app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    projectId: "fantasy-paintball",
  });
  const db = getFirestore(app);

  const registry = loadRegistry(JSON.parse(readFileSync(REGISTRY, "utf8")));
  const { sheet, skipped } = loadTeamSheet(readFileSync(csvPath, "utf8"));
  const rosters = await loadRosters(db, { collection, getDocs });
  const { byEvent, warnings, totals } = buildPlan({ rosters, sheet, registry });

  console.log("\nDRY RUN — player participation.  NOTHING IS WRITTEN.");
  line("=");
  console.log(`team sheet : ${csvPath}`);
  console.log(`registry   : ${REGISTRY} (${registry.size} players with a league id)`);
  if (onlyEvent) console.log(`filtered to: ${onlyEvent}`);

  if (skipped.size) {
    console.log(`\nCrawler events with no PickEm equivalent (ignored):`);
    [...skipped]
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`   ${k}  (${v} rows)`));
  }

  if (warnings.length) {
    console.log("\nWARNINGS");
    line();
    warnings.forEach((w) => console.log(`  ! ${w}`));
  }

  const events = onlyEvent ? [onlyEvent] : EVENTS;

  console.log("\nPER EVENT");
  line();
  console.log(
    "EVENT".padEnd(24) +
      "ROSTER".padEnd(8) +
      "COVER".padEnd(8) +
      "PLAYED".padEnd(8) +
      "ABSENT".padEnd(8) +
      "UNKNOWN".padEnd(9) +
      "TO WRITE",
  );
  for (const eventId of events) {
    const plan = byEvent.get(eventId);
    if (!plan) continue;
    const c = (v) => plan.rows.filter((r) => r.verdict === v).length;
    const pct = `${(plan.coverage.ratio * 100).toFixed(0)}%`;
    console.log(
      eventId.padEnd(24) +
        String(plan.rows.length).padEnd(8) +
        (plan.usable ? pct : `${pct}!`).padEnd(8) +
        String(c("played")).padEnd(8) +
        String(c("absent")).padEnd(8) +
        String(c("unknown")).padEnd(9) +
        plan.rows.filter((r) => r.changed).length,
    );
  }

  console.log("\nPLAYERS RESOLVED AS ABSENT — these would be hidden from the stats page");
  line();
  let absentTotal = 0;
  for (const eventId of events) {
    const plan = byEvent.get(eventId);
    if (!plan) continue;
    const absent = plan.rows
      .filter((r) => r.verdict === "absent")
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (!absent.length) continue;
    absentTotal += absent.length;
    console.log(`\n  ${SHORT[eventId]} ${eventId}  (${absent.length})`);
    absent.forEach((r) =>
      console.log(
        `     ${String(r.name).padEnd(26)} ${String(r.team).padEnd(16)} ` +
          `kills=${String(r.kills).padEnd(5)} ${r.reason}`,
      ),
    );
  }
  if (!absentTotal) console.log("  (none)");

  console.log("\n\nPLAYERS RESOLVED AS UNKNOWN — left exactly as they are today");
  line();
  let unknownTotal = 0;
  for (const eventId of events) {
    const plan = byEvent.get(eventId);
    if (!plan) continue;
    const unknown = plan.rows.filter((r) => r.verdict === "unknown");
    if (!unknown.length) continue;
    unknownTotal += unknown.length;
    console.log(`\n  ${SHORT[eventId]} ${eventId}  (${unknown.length})`);
    unknown
      .slice(0, 25)
      .forEach((r) =>
        console.log(`     ${String(r.name).padEnd(26)} kills=${String(r.kills).padEnd(5)} ${r.reason}`),
      );
    if (unknown.length > 25) console.log(`     … and ${unknown.length - 25} more`);
  }
  if (!unknownTotal) console.log("  (none)");

  console.log("\n\nSCORED BUT OFF THE TEAM SHEET — kept as played by rule 1, worth a look");
  line();
  let oddTotal = 0;
  for (const eventId of events) {
    const plan = byEvent.get(eventId);
    if (!plan?.scoredOffSheet.length) continue;
    oddTotal += plan.scoredOffSheet.length;
    console.log(`\n  ${SHORT[eventId]} ${eventId}  (${plan.scoredOffSheet.length})`);
    plan.scoredOffSheet.forEach((r) =>
      console.log(
        `     ${String(r.name).padEnd(26)} ${String(r.team).padEnd(16)} ` +
          `kills=${String(r.kills).padEnd(5)} league_id=${r.leagueId}`,
      ),
    );
  }
  if (!oddTotal) console.log("  (none)");

  console.log("\n");
  line("=");
  const grand = totals.played + totals.absent + totals.unknown;
  console.log(
    `TOTAL  ${grand} roster rows -> ` +
      `played ${totals.played}, absent ${totals.absent}, unknown ${totals.unknown}`,
  );
  const toWrite = EVENTS.reduce(
    (n, e) => n + (byEvent.get(e)?.rows.filter((r) => r.changed).length ?? 0),
    0,
  );
  console.log(`Documents that would be written: ${toWrite}`);
  console.log(`Coverage floor: ${SHEET_COVERAGE_FLOOR * 100}% (events below it write nothing)`);
  console.log("\nNOTHING WAS WRITTEN. Review the absent list above before applying.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
