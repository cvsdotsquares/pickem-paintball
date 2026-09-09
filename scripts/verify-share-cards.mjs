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
const FOOTER_H = 122;
/** How much background must sit between the last content and the footer. */
const CLEARANCE = 14;
const HEADER_H = 118;
const PAD = 56;

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
  const at = (x, y) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i+1], data[i+2]]; };

  // 1. The footer reaches the last row — nothing was pushed off, nothing floats above a gap.
  let green = 0, sampled = 0;
  for (let x = 0; x < info.width; x += 4) {
    const [r, g, b] = at(x, info.height - 2);
    sampled++;
    if (g > 150 && r < 130 && b < 170) green++;
  }
  const footerPct = Math.round((green / sampled) * 100);

  /*
   * 2. Content CLEARS the footer.
   *
   * The footer is pinned, so an overflowing card no longer loses it — it slides the last
   * band underneath instead, and check 1 still passes while the card shows half a row of
   * text with a green bar through it. The band of pixels just above the footer has to be
   * background for the layout to be honest.
   */
  const top = info.height - FOOTER_H - CLEARANCE;
  let lit = 0, cells = 0;
  for (let y = top; y < info.height - FOOTER_H; y++) {
    for (let x = 0; x < info.width; x += 4) {
      const [r, g, b] = at(x, y);
      cells++;
      if (r > 26 || g > 26 || b > 26) lit++;
    }
  }
  const clearPct = Math.round((1 - lit / cells) * 100);

  /*
   * 3. Nothing runs off the RIGHT edge.
   *
   * Tiles are a fixed width, so a row given one too many does not wrap or shrink — it
   * simply continues past the canvas, and the part that leaves is gone. An event card
   * carried five tiles for a while and lost the fifth without either of the checks above
   * noticing, because both only look at the bottom.
   */
  let margin = 0, marginCells = 0;
  for (let y = HEADER_H; y < info.height - FOOTER_H; y += 2) {
    for (let x = info.width - PAD + 4; x < info.width; x += 2) {
      const [r, g, b] = at(x, y);
      marginCells++;
      if (r > 26 || g > 26 || b > 26) margin++;
    }
  }
  const marginPct = Math.round((1 - margin / marginCells) * 100);

  const ok = footerPct > 85 && clearPct > 96 && marginPct >= 100;
  if (!ok) bad++;
  console.log(
    `  ${ok ? "✅" : "❌"} footer ${String(footerPct).padStart(3)}%  clear ${String(clearPct).padStart(3)}%  margin ${String(marginPct).padStart(3)}%   ${c.name}`,
  );
}

console.log(
  bad
    ? `\n❌ ${bad} of ${CASES.length} card(s) do not end in the footer.\n`
    : `\n✅ All ${CASES.length} cards fill the canvas and end in the footer.\n`,
);
process.exit(bad ? 1 : 0);
