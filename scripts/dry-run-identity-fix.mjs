/**
 * DRY RUN — player identity fix (defects 1 and 2).
 *
 * READ-ONLY. Writes nothing. Prints the exact operations `apply-identity-fix.mjs`
 * would perform, so they can be reviewed line by line first. Both scripts import
 * the same plan from `identity-fix-plan.mjs`, so what you review is what runs.
 *
 *   node scripts/dry-run-identity-fix.mjs
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import {
  EVENTS, SHORT, CANONICAL_NAMES, num,
  loadRosters, buildPlan, vacatedSlots, projectAfter, buildPickRewrites,
} from "./identity-fix-plan.mjs";

const { initializeApp } = await import("firebase/app");
const { getFirestore, collection, getDocs } = await import("firebase/firestore");

const line = (c = "─") => console.log(c.repeat(78));

async function main() {
  const app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    projectId: "fantasy-paintball",
  });
  const db = getFirestore(app);

  const rosters = await loadRosters(db, { collection, getDocs });
  const { ops, remap, warnings } = buildPlan(rosters);
  const after = projectAfter(rosters, ops);
  const usersSnap = await getDocs(collection(db, "users"));
  const rewrites = buildPickRewrites(usersSnap.docs, remap);

  const nameOf = (ev, id) => rosters.get(ev)?.get(id)?.Player ?? null;

  console.log("\nDRY RUN — player identity fix (defects 1 + 2).  NOTHING IS WRITTEN.");
  line("=");

  let docOps = 0, deletes = 0;
  for (const ev of EVENTS) {
    const evOps = ops.get(ev);
    if (!evOps.length) continue;
    console.log(`\n${SHORT[ev]}  (${ev})`);
    line();
    for (const o of [...evOps].sort((a, b) => a.defect - b.defect || a.from.localeCompare(b.from))) {
      if (o.kind.startsWith("DELETE")) {
        deletes++;
        const flag = o.kind === "DELETE-CONFLICT" ? "  ⚠ STATS DIFFER" : "";
        console.log(`  d${o.defect} DELETE  ${o.from}  "${o.who}" (${o.kills}k)  — duplicate of ${o.to}${flag}`);
        if (o.diffs?.length) console.log(`         differing fields: ${o.diffs.join(", ")}`);
      } else {
        docOps++;
        const occ = rosters.get(ev).has(o.to) ? ` (displacing "${nameOf(ev, o.to)}", who also moves)` : "";
        console.log(`  d${o.defect} MOVE    ${o.from} -> ${o.to}  "${o.who}" (${o.kills}k)${occ}`);
      }
    }
    const vacated = vacatedSlots(evOps);
    if (vacated.length) {
      console.log(`  -- VACATED (deleted, nobody lands here): ${vacated.join(", ")}`);
      for (const v of vacated) {
        const elsewhere = EVENTS.filter((e) => e !== ev && rosters.get(e).has(v))
          .map((e) => `${SHORT[e]}:"${nameOf(e, v)}"`);
        console.log(`       ${v} elsewhere -> ${elsewhere.join("  ") || "(nowhere)"}`);
      }
    }
  }

  // ── Pick rewrites ─────────────────────────────────────────────────────────
  console.log("\n\nPICK REWRITES");
  line("=");
  const perEvent = new Map(EVENTS.map((e) => [e, { n: 0, users: new Set(), detail: new Map() }]));
  for (const r of rewrites) {
    for (const [path, val] of Object.entries(r.updates)) {
      const key = path.replace("pickems.", "");
      const base = key.replace(/_draft_captain$|_captain$|_draft$/, "");
      const rec = perEvent.get(base);
      rec.users.add(r.userId);
      const tag = key.endsWith("_captain") ? "captain" : key.endsWith("_draft") ? "draft" : "live";
      const map = remap.get(base);
      const before = usersSnapValue(r.userId, key);
      const changed = Array.isArray(val)
        ? val.filter((v, i) => String(v) !== String(before[i])).length
        : 1;
      rec.n += changed;
      for (const [oldId, newId] of map) {
        const hit = Array.isArray(before)
          ? before.filter((b) => String(b) === oldId).length
          : (String(before) === oldId ? 1 : 0);
        if (hit) {
          const k = `${oldId}->${newId} [${tag}]`;
          rec.detail.set(k, (rec.detail.get(k) || 0) + hit);
        }
      }
    }
  }
  function usersSnapValue(userId, key) {
    const d = usersSnap.docs.find((x) => x.id === userId);
    return (d.get("pickems") || {})[key];
  }
  let pickOps = 0; const allUsers = new Set();
  for (const ev of EVENTS) {
    const rec = perEvent.get(ev);
    if (!rec.n) continue;
    console.log(`\n${SHORT[ev]}  ${rec.n} pick entries, ${rec.users.size} users`);
    for (const [k, n] of [...rec.detail].sort()) console.log(`     ${k}  ×${n}`);
    pickOps += rec.n;
    rec.users.forEach((u) => allUsers.add(u));
  }
  if (!pickOps) console.log("  none");

  // ── Score invariance ──────────────────────────────────────────────────────
  // The whole safety argument rests on this: a pick and its player document move
  // together, so every pick must resolve to the SAME person with the SAME kills.
  console.log("\n\nSCORE INVARIANCE CHECK");
  line("=");
  const score = (roster, ids, captainId) =>
    ids.reduce((sum, raw) => {
      const id = String(raw);
      const k = num(roster.get(id)?.["Confirmed Kills"]);
      return sum + (id === String(captainId) ? k * 1.5 : k);
    }, 0);

  let checked = 0; const changed = [], dupes = [], orphaned = [];
  for (const doc of usersSnap.docs) {
    const pk = doc.get("pickems") || {};
    for (const ev of EVENTS) {
      const map = remap.get(ev);
      if (!map.size) continue;
      const live = pk[ev];
      if (!Array.isArray(live) || !live.length) continue;
      if (!live.some((r) => map.has(String(r)))) continue;

      const capBefore = pk[`${ev}_captain`] ?? null;
      const rw = (id) => map.get(String(id)) ?? String(id);
      const liveAfter = live.map(rw);
      const capAfter = capBefore == null ? null : rw(capBefore);

      checked++;
      const b = score(rosters.get(ev), live.map(String), capBefore);
      const a = score(after.get(ev), liveAfter, capAfter);
      if (Math.abs(b - a) > 1e-9) changed.push(`${doc.id} @ ${SHORT[ev]}: ${b} -> ${a}`);
      if (new Set(liveAfter).size !== liveAfter.length) {
        dupes.push(`${doc.id} @ ${SHORT[ev]}: duplicate pick after remap`);
      }
      // Only NEW breakage matters. Picks that already point at a player who never
      // made that event's roster score 0 today and will score 0 after — that's the
      // game working as intended, not damage.
      for (let i = 0; i < liveAfter.length; i++) {
        if (rosters.get(ev).has(String(live[i])) && !after.get(ev).has(liveAfter[i])) {
          orphaned.push(`${doc.id} @ ${SHORT[ev]}: ${live[i]} -> ${liveAfter[i]} resolves to nothing`);
        }
      }
    }
  }
  console.log(`  affected user/event pick sets recomputed: ${checked}`);
  console.log(`  scores changed:             ${changed.length} ${changed.length ? "❌" : "✅ none"}`);
  changed.slice(0, 20).forEach((c) => console.log(`     ❌ ${c}`));
  console.log(`  duplicate picks created:    ${dupes.length} ${dupes.length ? "❌" : "✅ none"}`);
  dupes.slice(0, 20).forEach((c) => console.log(`     ❌ ${c}`));
  console.log(`  picks newly resolving to nothing: ${orphaned.length} ${orphaned.length ? "❌" : "✅ none"}`);
  orphaned.slice(0, 20).forEach((c) => console.log(`     ❌ ${c}`));

  // ── Display names ─────────────────────────────────────────────────────────
  console.log("\n\nDISPLAY NAME REWRITES");
  line("=");
  let nameOps = 0;
  for (const [id, canonical] of Object.entries(CANONICAL_NAMES)) {
    const hits = [];
    for (const ev of EVENTS) {
      const landing = ops.get(ev).find((o) => o.kind === "MOVE" && o.to === id);
      const current = landing ? landing.who : nameOf(ev, id);
      if (current == null) continue;
      if (current !== canonical) { hits.push(`${SHORT[ev]}:"${current}"`); nameOps++; }
    }
    console.log(`  ${id} -> "${canonical}"` + (hits.length ? `   rewriting ${hits.join(" ")}` : "   (already consistent)"));
  }
  console.log(`\n  ${nameOps} player-event docs get a name correction`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n\nSUMMARY");
  line("=");
  console.log(`  document moves          ${docOps}`);
  console.log(`  duplicate deletions     ${deletes}`);
  console.log(`  name corrections        ${nameOps}`);
  console.log(`  pick entries rewritten  ${pickOps}  across ${allUsers.size} users`);
  const batch = docOps * 2 + deletes + allUsers.size;
  console.log(`  approx batch operations ${batch}  ${batch <= 500 ? "✅ fits one atomic batch" : "❌ EXCEEDS 500 — must split"}`);

  console.log(`\n  WARNINGS (${warnings.length})`);
  line();
  if (!warnings.length) console.log("  none — plan is internally consistent");
  else warnings.forEach((w) => console.log(`  ⚠ ${w}`));

  console.log("\nNothing was written.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
