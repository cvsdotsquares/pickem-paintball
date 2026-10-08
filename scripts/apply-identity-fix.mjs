/**
 * APPLY — player identity fix (defects 1 and 2).
 *
 *   node scripts/apply-identity-fix.mjs              # preview, writes nothing
 *   node scripts/apply-identity-fix.mjs --commit     # writes
 *
 * Imports its plan from `identity-fix-plan.mjs`, the same module
 * `dry-run-identity-fix.mjs` reports from — the reviewed plan is the written plan.
 *
 * Safety:
 *  - refuses to write if the plan produces any warning
 *  - refuses to write if any user's event score would change
 *  - snapshots every affected player doc and every affected user's `pickems`
 *    to scripts/backups/ BEFORE writing
 *  - commits everything in ONE atomic batch, so a pick is never resolvable
 *    against a moved or vacated slot, not even momentarily
 *
 * After this runs: fix the `tampa_bay_2025` -> `tampa_bay_open_2025` typo in
 * the pre-aggregated season table (see retire-season-aggregates.mjs).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EVENTS, SHORT, CANONICAL_NAMES, num,
  loadRosters, buildPlan, vacatedSlots, projectAfter, buildPickRewrites,
} from "./identity-fix-plan.mjs";

const { initializeApp } = await import("firebase/app");
const {
  getFirestore, collection, getDocs, doc, writeBatch,
} = await import("firebase/firestore");

const COMMIT = process.argv.includes("--commit");
const HERE = dirname(fileURLToPath(import.meta.url));
const line = (c = "─") => console.log(c.repeat(78));

function die(msg) {
  console.error(`\n❌ ABORTED — ${msg}\n`);
  process.exit(1);
}

async function main() {
  const app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    projectId: "fantasy-paintball",
  });
  const db = getFirestore(app);

  console.log(`\nIDENTITY FIX — ${COMMIT ? "COMMIT MODE" : "preview (no writes)"}`);
  line("=");

  const rosters = await loadRosters(db, { collection, getDocs });
  const { ops, remap, warnings } = buildPlan(rosters);
  const after = projectAfter(rosters, ops);
  const usersSnap = await getDocs(collection(db, "users"));
  const rewrites = buildPickRewrites(usersSnap.docs, remap);

  // ── Gate 1: the plan must be internally consistent ────────────────────────
  if (warnings.length) {
    warnings.forEach((w) => console.error(`  ⚠ ${w}`));
    die(`${warnings.length} plan warning(s). Re-run the dry run and resolve them.`);
  }
  console.log("  ✅ plan consistent (0 warnings)");

  // ── Gate 2: no user's score may change ────────────────────────────────────
  const score = (roster, ids, captainId) =>
    ids.reduce((sum, raw) => {
      const id = String(raw);
      const k = num(roster.get(id)?.["Confirmed Kills"]);
      return sum + (id === String(captainId) ? k * 1.5 : k);
    }, 0);

  let checked = 0;
  for (const d of usersSnap.docs) {
    const pk = d.get("pickems") || {};
    for (const ev of EVENTS) {
      const map = remap.get(ev);
      if (!map.size) continue;
      const live = pk[ev];
      if (!Array.isArray(live) || !live.some((r) => map.has(String(r)))) continue;
      const cap = pk[`${ev}_captain`] ?? null;
      const rw = (id) => map.get(String(id)) ?? String(id);
      const liveAfter = live.map(rw);
      checked++;
      const b = score(rosters.get(ev), live.map(String), cap);
      const a = score(after.get(ev), liveAfter, cap == null ? null : rw(cap));
      if (Math.abs(b - a) > 1e-9) die(`score would change for ${d.id} @ ${SHORT[ev]}: ${b} -> ${a}`);
      if (new Set(liveAfter).size !== liveAfter.length) {
        die(`remap would create a duplicate pick for ${d.id} @ ${SHORT[ev]}`);
      }
    }
  }
  console.log(`  ✅ score invariance holds across ${checked} affected pick sets`);

  // ── Build the write set ───────────────────────────────────────────────────
  /** @type {Array<{kind:'set'|'delete'|'update', path:string[], data?:object, note:string}>} */
  const writes = [];

  for (const ev of EVENTS) {
    const evOps = ops.get(ev);

    for (const o of evOps) {
      if (o.kind === "MOVE") {
        const data = { ...rosters.get(ev).get(o.from) };
        if (CANONICAL_NAMES[o.to]) data.Player = CANONICAL_NAMES[o.to];
        writes.push({
          kind: "set", path: ["events", ev, "players", o.to], data,
          note: `${SHORT[ev]} ${o.from}->${o.to} "${data.Player}"`,
        });
      } else {
        writes.push({
          kind: "delete", path: ["events", ev, "players", o.from],
          note: `${SHORT[ev]} drop duplicate ${o.from} "${o.who}"`,
        });
      }
    }

    for (const v of vacatedSlots(evOps)) {
      writes.push({
        kind: "delete", path: ["events", ev, "players", v],
        note: `${SHORT[ev]} vacate ${v}`,
      });
    }

    // Name corrections on docs that are NOT moving (movers get theirs above).
    const movingTo = new Set(evOps.filter((o) => o.kind === "MOVE").map((o) => o.to));
    for (const [id, canonical] of Object.entries(CANONICAL_NAMES)) {
      if (movingTo.has(id)) continue;
      const cur = rosters.get(ev).get(id);
      if (!cur || cur.Player === canonical) continue;
      writes.push({
        kind: "update", path: ["events", ev, "players", id], data: { Player: canonical },
        note: `${SHORT[ev]} rename ${id} "${cur.Player}" -> "${canonical}"`,
      });
    }
  }

  for (const r of rewrites) {
    writes.push({
      kind: "update", path: ["users", r.userId], data: r.updates,
      note: `user ${r.userId} picks in ${[...r.events].map((e) => SHORT[e]).join(",")}`,
    });
  }

  console.log(`\n  writes queued: ${writes.length}`);
  const byKind = writes.reduce((m, w) => ({ ...m, [w.kind]: (m[w.kind] || 0) + 1 }), {});
  console.log(`     ${Object.entries(byKind).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  if (writes.length > 500) die(`${writes.length} operations exceeds Firestore's 500-op atomic batch limit.`);
  console.log("  ✅ fits one atomic batch");

  if (!COMMIT) {
    console.log("\n  operations:");
    line();
    writes.forEach((w) => console.log(`    ${w.kind.padEnd(6)} ${w.note}`));
    console.log("\nPreview only. Re-run with --commit to write.\n");
    return;
  }

  // ── Backup ────────────────────────────────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(HERE, "backups");
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `identity-fix-${stamp}.json`);

  const touchedPlayers = {};
  for (const ev of EVENTS) {
    const ids = new Set();
    for (const o of ops.get(ev)) { ids.add(o.from); ids.add(o.to); }
    for (const id of Object.keys(CANONICAL_NAMES)) if (rosters.get(ev).has(id)) ids.add(id);
    if (!ids.size) continue;
    touchedPlayers[ev] = {};
    for (const id of ids) {
      if (rosters.get(ev).has(id)) touchedPlayers[ev][id] = rosters.get(ev).get(id);
    }
  }
  const touchedUsers = {};
  for (const r of rewrites) {
    touchedUsers[r.userId] = usersSnap.docs.find((d) => d.id === r.userId).get("pickems");
  }
  writeFileSync(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    note: "Pre-migration state. players = full docs by event; users = complete pickems objects.",
    players: touchedPlayers,
    users: touchedUsers,
  }, null, 2));
  console.log(`\n  ✅ backup written: ${backupPath}`);
  console.log(`     ${Object.values(touchedPlayers).reduce((n, m) => n + Object.keys(m).length, 0)} player docs, ${Object.keys(touchedUsers).length} users`);

  // ── Commit ────────────────────────────────────────────────────────────────
  const batch = writeBatch(db);
  for (const w of writes) {
    const ref = doc(db, ...w.path);
    if (w.kind === "set") batch.set(ref, w.data);
    else if (w.kind === "delete") batch.delete(ref);
    else batch.update(ref, w.data);
  }
  await batch.commit();
  console.log(`\n  ✅ committed ${writes.length} operations in one atomic batch`);

  // ── Verify ────────────────────────────────────────────────────────────────
  const fresh = await loadRosters(db, { collection, getDocs });
  let bad = 0;
  for (const ev of EVENTS) {
    for (const [id, expected] of after.get(ev)) {
      const got = fresh.get(ev).get(id);
      if (!got) { console.error(`  ❌ ${SHORT[ev]} ${id} missing`); bad++; continue; }
      if (String(got.Player) !== String(expected.Player)) {
        console.error(`  ❌ ${SHORT[ev]} ${id} name "${got.Player}" != "${expected.Player}"`); bad++;
      }
      if (num(got["Confirmed Kills"]) !== num(expected["Confirmed Kills"])) {
        console.error(`  ❌ ${SHORT[ev]} ${id} kills mismatch`); bad++;
      }
    }
    for (const id of fresh.get(ev).keys()) {
      if (!after.get(ev).has(id)) { console.error(`  ❌ ${SHORT[ev]} ${id} should have been removed`); bad++; }
    }
  }
  console.log(bad ? `\n  ❌ ${bad} verification failures — restore from ${backupPath}` : "\n  ✅ post-write verification passed");

  console.log("\nNEXT:");
  console.log("  1. Retire players/season_2025 so the live fallback takes over");
  console.log("  2. Re-run the season aggregation for 2025");
  console.log("  3. Spot-check the stats page: Smotrov 45.5k, Ray Buco present, Askren 60k\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
