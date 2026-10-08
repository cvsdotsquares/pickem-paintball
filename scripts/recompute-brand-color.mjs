/**
 * Recompute an event's `brand_color` from its own logo.
 *
 *   node scripts/recompute-brand-color.mjs <eventId> [--write]
 *
 * `brand_color` is a CACHE, not authored data: `onEventLogoChanged` derives it by
 * averaging the logo down to a single pixel. But that function only fires when the
 * logo URL CHANGES, so an event whose colour was wiped by something else never heals
 * itself — the logo is still the same, so there is nothing to react to.
 *
 * This runs the identical derivation by hand. It is a recompute, not a restore: the
 * value it produces is the one the trigger would have produced, so there is no risk of
 * inventing a colour that was never there.
 *
 * Only fills a blank. An event that already has a colour is left alone, because a
 * manual edit is deliberate — the trigger's own comment says as much.
 */

import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const sharp = require("../functions/node_modules/sharp");

const eventId = process.argv[2];
const WRITE = process.argv.includes("--write");
if (!eventId || eventId.startsWith("--")) {
  console.error("Usage: node scripts/recompute-brand-color.mjs <eventId> [--write]");
  process.exit(1);
}

admin.initializeApp({ projectId: "fantasy-paintball" });
const db = admin.firestore();

// Byte-for-byte the derivation in functions/index.js `onEventLogoChanged`.
const extractColor = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const { data } = await sharp(buffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(1, 1, { kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return `#${data[0].toString(16).padStart(2, "0")}${data[1].toString(16).padStart(2, "0")}${data[2].toString(16).padStart(2, "0")}`;
};

const ref = db.doc(`events/${eventId}`);
const doc = await ref.get();
if (!doc.exists) { console.error(`No such event: ${eventId}`); process.exit(1); }

const logo = doc.get("logoUrl") || doc.get("event_logo");
const current = doc.get("brand_color");
console.log(`\n${eventId}`);
console.log(`  logo          ${logo ?? "(none)"}`);
console.log(`  brand_color   ${current ?? "(missing)"}`);

if (!logo) { console.error(`\nNo logo to derive from — nothing to do.\n`); process.exit(1); }
if (current) { console.log(`\nAlready set, leaving it alone.\n`); process.exit(0); }

const color = await extractColor(logo);
console.log(`  recomputed    ${color}`);

if (!WRITE) { console.log(`\nNo --write flag, so nothing was written.\n`); process.exit(0); }
await ref.update({ brand_color: color });
console.log(`\nWrote brand_color = ${color}.\n`);
process.exit(0);
