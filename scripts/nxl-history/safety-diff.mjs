/**
 * What would `build-player-summaries.mjs --yes` actually change?
 *
 *   node scripts/nxl-history/safety-diff.mjs
 *
 * Reads nothing but the current projection and rebuilds it in memory. WRITES NOTHING.
 *
 * The question this answers is not "does the rebuild work" — that is what the build
 * script's own dry run is for. It is the narrower and more important one: does anything
 * that is ALREADY on the live page move? A purely additive change is safe to run against
 * production because the deployed site cannot see the new fields; a change that also
 * edits an existing value is a different decision, and the two are indistinguishable
 * from a summary line saying "328 changed".
 *
 * So every difference is sorted into one of three piles:
 *   ADDED    a key that did not exist before          -> invisible to the live site
 *   CHANGED  a key whose value moved                  -> the live site would show it
 *   REMOVED  a key that has gone                      -> the live site would lose it
 */

import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
/**
 * Which builder to measure. Defaults to the working tree; pass a path to compare the
 * projection against a DIFFERENT version of the builder — that is how "what my change
 * does" gets separated from "what was already pending".
 */
const MODULE = process.argv.find((a) => a.startsWith("--module="))?.slice(9)
  ?? "../../functions/playerSummaries.js";
const { buildAll, buildAggregates } = require(MODULE);

admin.initializeApp({ projectId: "fantasy-paintball" });
const db = admin.firestore();

/** Compare two values structurally, ignoring key order. */
const same = (a, b) => stable(a) === stable(b);
function stable(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
}

/** Walk two objects and record every leaf path that was added, changed or removed. */
function diff(before, after, path = "", out = { added: [], changed: [], removed: [] }) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    const p = path ? `${path}.${k}` : k;
    const a = before?.[k];
    const b = after?.[k];
    const hasA = before != null && k in before;
    const hasB = after != null && k in after;
    if (!hasA && hasB) { out.added.push(p); continue; }
    if (hasA && !hasB) { out.removed.push(p); continue; }
    if (same(a, b)) continue;
    // Recurse into plain objects so a nested addition is not reported as a change to
    // the whole branch — that is exactly the distinction this script exists to draw.
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      diff(a, b, p, out);
    } else if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      a.forEach((_, i) => diff(a[i], b[i], `${p}[]`, out));
    } else {
      out.changed.push({ path: p, before: a, after: b });
    }
  }
  return out;
}

const roll = (list) => {
  const c = new Map();
  for (const x of list) {
    const key = typeof x === "string" ? x : x.path;
    c.set(key, (c.get(key) ?? 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
};

const stored = new Map();
const snap = await db.collection("playerSummaries").get();
snap.docs.forEach((d) => {
  const { rebuiltAt, ...rest } = d.data();
  stored.set(d.id, rest);
});

const built = await buildAll(db);
const totals = { added: [], changed: [], removed: [] };
let untouched = 0;
let brandNew = 0;

for (const s of built) {
  const before = stored.get(s.playerId);
  if (!before) { brandNew++; continue; }
  const after = JSON.parse(JSON.stringify(s)); // drop undefined, as Firestore would
  const d = diff(before, after);
  if (!d.added.length && !d.changed.length && !d.removed.length) { untouched++; continue; }
  totals.added.push(...d.added);
  totals.changed.push(...d.changed);
  totals.removed.push(...d.removed);
}

const gone = [...stored.keys()].filter((id) => !built.some((s) => s.playerId === id));

console.log(`\nplayerSummaries: ${built.length} built, ${stored.size} stored`);
console.log(`  identical            ${untouched}`);
console.log(`  new documents        ${brandNew}`);
console.log(`  documents no longer built ${gone.length}${gone.length ? ` (${gone.join(", ")})` : ""}`);

console.log(`\nADDED fields (invisible to the deployed site):`);
roll(totals.added).forEach(([p, n]) => console.log(`  ${String(n).padStart(5)}  ${p}`));

console.log(`\nCHANGED values (the deployed site WOULD show these):`);
if (!totals.changed.length) console.log(`  none`);
else {
  roll(totals.changed).forEach(([p, n]) => console.log(`  ${String(n).padStart(5)}  ${p}`));
  // Two examples per field, not five of whatever happened to be first: the question
  // is what KIND of change each field is seeing, and one field's samples crowd out the rest.
  console.log(`\n  examples, by field:`);
  const seen = new Map();
  for (const c of totals.changed) {
    const n = seen.get(c.path) ?? 0;
    if (n >= 2) continue;
    seen.set(c.path, n + 1);
    const brief = (v) => { const j = JSON.stringify(v); return j && j.length > 70 ? `${j.slice(0, 70)}...` : j; };
    console.log(`    ${c.path}: ${brief(c.before)} -> ${brief(c.after)}`);
  }
}

console.log(`\nREMOVED fields:`);
if (!totals.removed.length) console.log(`  none`);
else roll(totals.removed).forEach(([p, n]) => console.log(`  ${String(n).padStart(5)}  ${p}`));

// The aggregate documents feed the stats and all-time pages, which ARE deployed, so
// they get the same treatment rather than being taken on trust.
const aggs = await buildAggregates(db, built);
for (const [docPath, next] of [
  ["aggregates/playerIndex", { players: aggs.index, count: aggs.index.length }],
  ["aggregates/allTime", { players: aggs.allTime, count: aggs.allTime.length }],
  [
    "aggregates/spotlight",
    {
      eventId: aggs.LATEST,
      eventName: aggs.latestEvent ? aggs.latestEvent.name : null,
      eventYear: aggs.latestEvent ? aggs.latestEvent.year : null,
      allTimeLeaders: aggs.allTimeLeaders,
      eventLeaders: aggs.eventLeaders,
      players: aggs.spotlight,
    },
  ],
]) {
  const cur = await db.doc(docPath).get();
  const { rebuiltAt, ...before } = cur.data() ?? {};
  const d = diff(before, JSON.parse(JSON.stringify(next)));
  const n = d.added.length + d.changed.length + d.removed.length;
  console.log(
    `\n${docPath}: ${n === 0 ? "identical" : `${d.added.length} added, ${d.changed.length} changed, ${d.removed.length} removed`}`,
  );
  // Truncated hard: these documents hold arrays of every player, and printing one
  // buries the answer under a quarter of a megabyte.
  const brief = (v) => { const j = JSON.stringify(v); return j && j.length > 90 ? `${j.slice(0, 90)}...` : j; };
  d.changed.slice(0, 5).forEach((c) =>
    console.log(`    ${c.path}: ${brief(c.before)} -> ${brief(c.after)}`),
  );
}

process.exit(0);
