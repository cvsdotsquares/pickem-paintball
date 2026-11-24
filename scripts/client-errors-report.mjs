/**
 * READ-ONLY report on the crash log, from the `clientErrors` collection.
 *
 * Writes nothing. For each kind (page-crash, site-crash, script-error, viewport-shift):
 *
 *   By browser — e.g. "iOS 26.1 Safari", "Android Instagram", "Windows Chrome".
 *   Top errors — message, count, pages it happened on.
 *   Flags      — how many rows had page translation on, came from a home-screen icon,
 *                or were in a browser without dvh support.
 *
 * Rows come from src/lib/reportClientError.ts via /api/client-error. viewport-shift rows are
 * the iOS 26 Safari bug our scroll reset could not undo (see Layout.tsx).
 *
 * Needs Admin credentials (the same `gcloud auth application-default login`
 * the other admin scripts use).
 *
 *   node scripts/client-errors-report.mjs [--since YYYY-MM-DD] [--kind page-crash] [--json]
 */

import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const since = args.includes("--since") ? Date.parse(args[args.indexOf("--since") + 1]) : 0;
const onlyKind = args.includes("--kind") ? args[args.indexOf("--kind") + 1] : null;

// Admin SDK on purpose: `clientErrors` is create-only to clients (see firestore.rules).
if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId: "fantasy-paintball" });
}
const db = getFirestore();

const rows = (await db.collection("clientErrors").get()).docs
  .map((d) => d.data())
  .filter((r) => (r.createdAt ?? 0) >= since && (!onlyKind || r.kind === onlyKind));
if (!rows.length) {
  console.log("No crashes recorded yet.");
  process.exit(0);
}

/** "iOS 26.1 Safari", "Android Instagram", "Mac Chrome" — enough to spot a pattern. */
function browserLabel(ua) {
  ua = ua || ""; // rows can carry ua: null (the route stores null for a missing value)
  const ios = ua.match(/OS (\d+)[_.](\d+)/);
  const os = /iPhone|iPad|iPod/.test(ua)
    ? `iOS ${ios ? `${ios[1]}.${ios[2]}` : "?"}`
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows"
          : "Other";
  const app = /Instagram/.test(ua)
    ? "Instagram"
    : /FBAN|FBAV|FB_IAB|FBIOS/.test(ua)
      ? "Facebook"
      : /TikTok|musical_ly/.test(ua)
        ? "TikTok"
        : /GSA\//.test(ua)
          ? "Google app"
          : /SamsungBrowser/.test(ua)
            ? "Samsung Internet"
            : /EdgiOS|EdgA|Edg\//.test(ua)
              ? "Edge"
              : /FxiOS|Firefox/.test(ua)
                ? "Firefox"
                : /CriOS|Chrome/.test(ua)
                  ? "Chrome"
                  : /Safari/.test(ua)
                    ? "Safari"
                    : "Other";
  return `${os} ${app}`;
}

const count = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const top = (map, n = 8) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

const byKind = new Map();
for (const r of rows) {
  const k = r.kind ?? "unknown";
  if (!byKind.has(k)) {
    byKind.set(k, { total: 0, browsers: new Map(), messages: new Map(), pages: new Map(), translated: 0, standalone: 0, noDvh: 0 });
  }
  const g = byKind.get(k);
  g.total += 1;
  count(g.browsers, browserLabel(r.ua));
  count(g.messages, (r.message ?? "(no message)").slice(0, 120));
  count(g.pages, r.path ?? "?");
  if (r.translated) g.translated += 1;
  if (r.standalone) g.standalone += 1;
  if (r.dvh === false) g.noDvh += 1;
}

if (asJson) {
  const out = {};
  for (const [k, g] of byKind) {
    out[k] = {
      total: g.total,
      browsers: Object.fromEntries(top(g.browsers, 50)),
      messages: Object.fromEntries(top(g.messages, 50)),
      pages: Object.fromEntries(top(g.pages, 50)),
      translated: g.translated,
      standalone: g.standalone,
      noDvh: g.noDvh,
    };
  }
  console.log(JSON.stringify({ rows: rows.length, since: since || null, kinds: out }, null, 2));
  process.exit(0);
}

const first = Math.min(...rows.map((r) => r.createdAt ?? Infinity));
console.log(`Crash log: ${rows.length} rows since ${new Date(since || first).toISOString().slice(0, 10)}\n`);
for (const [k, g] of [...byKind.entries()].sort((a, b) => b[1].total - a[1].total)) {
  console.log(`== ${k} (${g.total})`);
  console.log(`   translated ${g.translated} · home-screen ${g.standalone} · no dvh ${g.noDvh}`);
  console.log("   By browser:");
  for (const [b, n] of top(g.browsers)) console.log(`     ${String(n).padStart(4)}  ${b}`);
  console.log("   Top errors:");
  for (const [m, n] of top(g.messages, 5)) console.log(`     ${String(n).padStart(4)}  ${m}`);
  console.log("   Pages:");
  for (const [p, n] of top(g.pages, 5)) console.log(`     ${String(n).padStart(4)}  ${p}`);
  console.log("");
}
