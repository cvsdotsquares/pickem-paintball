/**
 * Does every share card still end in its footer?
 *
 *   node scripts/verify-share-cards.mjs            # against localhost:3000
 *   node scripts/verify-share-cards.mjs --base=https://…
 *
 * WHY THIS EXISTS. Satori draws past the bottom edge without erroring, so a card whose
 * content grew by one row silently loses the green CTA band — on an image whose entire
 * job is to travel without the site. It was caught once by eye and, on the next layout
 * change, missed by eye twice. Sampling the bottom row of pixels is the only check that
 * does not depend on someone looking at the right card.
 *
 * It also catches the opposite fault: bands that under-fill leave the footer floating
 * above a black gap, which the same sample detects because the bottom row is not green.
 *
 * The cases below are the shapes that have actually broken — a long career, a one-season
 * career, a scored event with a full match list, a pre-PickEm event, a player with no
 * photo. Add a shape here whenever a new one appears rather than after it ships wrong.
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sharp = require("../functions/node_modules/sharp");

const BASE =
  process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:3000";
const q = (s) => encodeURIComponent(s);

const CASES = [
  { name: "career, 12 seasons", q: "player=100016" },
  { name: "career, no photo, 3 seasons", q: "player=100034" },
  { name: "career, other player", q: "player=100001" },
  { name: "season, 3 tournaments", q: "player=100016&scope=season&year=2026" },
  { name: "season, 5 tournaments", q: "player=100016&scope=season&year=2025" },
  { name: "season, 1 tournament", q: "player=100016&scope=season&year=2015" },
  { name: "event, scored, 7 matches", q: `player=100016&scope=event&key=${q("2026|Midwest Open")}` },
  { name: "event, scored, World Cup", q: `player=100016&scope=event&key=${q("2025|NXL World Cup")}` },
  { name: "event, pre-PickEm", q: `player=100016&scope=event&key=${q("2015|Great Lakes Open")}` },
];

let bad = 0;
for (const c of CASES) {
  let res;
  try {
    res = await fetch(`${BASE}/api/share/career?${c.q}`);
  } catch {
    console.log(`  ⚠️  unreachable — is the dev server up?  ${c.name}`);
    bad++;
    continue;
  }
  if (!res.ok) { console.log(`  ❌ HTTP ${res.status}  ${c.name}`); bad++; continue; }

  const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
    .raw().toBuffer({ resolveWithObject: true });
  let green = 0;
  let sampled = 0;
  for (let x = 0; x < info.width; x += 4) {
    const i = ((info.height - 2) * info.width + x) * info.channels;
    sampled++;
    if (data[i + 1] > 150 && data[i] < 130 && data[i + 2] < 170) green++;
  }
  const pct = Math.round((green / sampled) * 100);
  const ok = pct > 85;
  if (!ok) bad++;
  console.log(`  ${ok ? "✅" : "❌"} bottom row ${String(pct).padStart(3)}% green   ${c.name}`);
}

console.log(
  bad
    ? `\n❌ ${bad} of ${CASES.length} card(s) do not end in the footer.\n`
    : `\n✅ All ${CASES.length} cards fill the canvas and end in the footer.\n`,
);
process.exit(bad ? 1 : 0);
