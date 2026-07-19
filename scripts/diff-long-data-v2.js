/**
 * PHASE 3 — Parallel-run diff harness
 * See LONG_DATA_MIGRATION.md §4
 *
 * Compares the recomputed `events_v2/{eventId}/players` aggregates against the
 * live `events/{eventId}/players` values, field for field, for every player.
 *
 * THIS IS THE CUTOVER GATE. Nothing switches over until this reports either a
 * clean match or a set of differences that are each explained.
 *
 * Read-only. Writes nothing to either collection.
 *
 * Usage:
 *   node scripts/diff-long-data-v2.js mid_west_open_2026
 *   node scripts/diff-long-data-v2.js mid_west_open_2026 --tolerance 0.01
 *   node scripts/diff-long-data-v2.js mid_west_open_2026 --json out.json
 *
 * Auth: uses GOOGLE_APPLICATION_CREDENTIALS, same as the other admin scripts.
 */

const admin = require('firebase-admin');
const fs = require('fs');

const FIELDS = [
  'Confirmed Kills',
  'Gunfights',
  'Breakshooting',
  'Movement',
  'Zone Coverage',
  'Pressure',
  'Trades',
  'Unclassified',
];

function parseArgs() {
  const args = process.argv.slice(2);
  const eventId = args.find((a) => !a.startsWith('--'));
  if (!eventId) {
    console.error('Usage: node scripts/diff-long-data-v2.js <eventId> [--tolerance N] [--json FILE]');
    process.exit(1);
  }
  const tolIdx = args.indexOf('--tolerance');
  const jsonIdx = args.indexOf('--json');
  return {
    eventId,
    // Default 0: half-weights are exact at 2dp, so any drift is a real defect.
    tolerance: tolIdx !== -1 ? Number(args[tolIdx + 1]) : 0,
    jsonOut: jsonIdx !== -1 ? args[jsonIdx + 1] : null,
  };
}

async function readPlayers(path) {
  const snap = await admin.firestore().collection(path).get();
  const map = new Map();
  snap.docs.forEach((d) => map.set(d.id, d.data()));
  return map;
}

function num(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

async function main() {
  const { eventId, tolerance, jsonOut } = parseArgs();
  admin.initializeApp();

  console.log(`\nDiffing ${eventId}\n  live: events/${eventId}/players\n  v2:   events_v2/${eventId}/players\n`);

  const [live, v2] = await Promise.all([
    readPlayers(`events/${eventId}/players`),
    readPlayers(`events_v2/${eventId}/players`),
  ]);

  if (v2.size === 0) {
    console.error('❌ No _v2 documents found. Has the recompute run for this event?');
    process.exit(1);
  }

  const allIds = new Set([...live.keys(), ...v2.keys()]);
  const mismatches = [];
  const onlyLive = [];
  const onlyV2 = [];
  let matched = 0;

  for (const playerId of allIds) {
    const l = live.get(playerId);
    const r = v2.get(playerId);

    // Players with no kills legitimately have no _v2 doc — only flag those
    // where the live side actually has a non-zero total.
    if (!r) {
      if (num(l['Confirmed Kills']) !== 0) {
        onlyLive.push({ playerId, name: l.Player || '?', kills: num(l['Confirmed Kills']) });
      }
      continue;
    }
    if (!l) {
      onlyV2.push({ playerId, kills: num(r['Confirmed Kills']) });
      continue;
    }

    const fieldDiffs = [];
    for (const f of FIELDS) {
      const a = num(l[f]);
      const b = num(r[f]);
      if (Math.abs(a - b) > tolerance) {
        fieldDiffs.push({ field: f, live: a, v2: b, delta: Math.round((b - a) * 100) / 100 });
      }
    }

    if (fieldDiffs.length > 0) {
      mismatches.push({ playerId, name: l.Player || '?', diffs: fieldDiffs });
    } else {
      matched++;
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(`Players compared: ${allIds.size}`);
  console.log(`  ✅ exact match:      ${matched}`);
  console.log(`  ❌ field mismatches: ${mismatches.length}`);
  console.log(`  ⚠️  live only:        ${onlyLive.length}`);
  console.log(`  ⚠️  v2 only:          ${onlyV2.length}\n`);

  if (mismatches.length) {
    console.log('── Mismatches ──');
    mismatches.slice(0, 40).forEach((m) => {
      console.log(`  ${m.name} (${m.playerId})`);
      m.diffs.forEach((d) => {
        console.log(`      ${d.field.padEnd(16)} live=${d.live}  v2=${d.v2}  Δ${d.delta > 0 ? '+' : ''}${d.delta}`);
      });
    });
    if (mismatches.length > 40) console.log(`  … and ${mismatches.length - 40} more`);
    console.log('');
  }

  if (onlyLive.length) {
    console.log('── In live but missing from v2 (non-zero kills) ──');
    onlyLive.slice(0, 20).forEach((p) => console.log(`  ${p.name} (${p.playerId}) kills=${p.kills}`));
    console.log('');
  }

  if (onlyV2.length) {
    console.log('── In v2 but not live ──');
    onlyV2.slice(0, 20).forEach((p) => console.log(`  ${p.playerId} kills=${p.kills}`));
    console.log('');
  }

  // Totals are the fastest sanity check — they should agree exactly.
  const sum = (m) => {
    let t = 0;
    m.forEach((d) => { t += num(d['Confirmed Kills']); });
    return Math.round(t * 100) / 100;
  };
  console.log(`Total Confirmed Kills — live: ${sum(live)}   v2: ${sum(v2)}\n`);

  const clean = mismatches.length === 0 && onlyLive.length === 0 && onlyV2.length === 0;
  console.log(clean
    ? '✅ CUTOVER GATE PASSED — every player matches on every field.'
    : '❌ CUTOVER GATE NOT PASSED — resolve or explain every difference above first.');

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify({ eventId, matched, mismatches, onlyLive, onlyV2 }, null, 2));
    console.log(`\nWrote ${jsonOut}`);
  }

  process.exit(clean ? 0 : 1);
}

main().catch((err) => {
  console.error('Diff failed:', err);
  process.exit(1);
});
