/* Extract average brand color from each event's logoUrl and write back as brand_color.
   Only processes events that have a logoUrl. Skips events that already have brand_color
   unless --force is passed.
   Usage: npx tsx scripts/extract-event-brand-colors.ts [--force] [eventId]
*/
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import sharp from "sharp";

const FORCE = process.argv.includes("--force");
// Args after the script name that aren't flags
const TARGET_EVENT = process.argv.slice(2).find((a) => !a.startsWith("-")) ?? null;

async function extractAverageColor(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const { data } = await sharp(buffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(1, 1, { kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const r = data[0], g = data[1], b = data[2];
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

async function main() {
  if (!getApps().length)
    initializeApp({ credential: applicationDefault(), projectId: "fantasy-paintball" });
  const db = getFirestore();

  const snap = TARGET_EVENT
    ? await db.collection("events").doc(TARGET_EVENT).get().then((d) => ({ docs: d.exists ? [d] : [] }))
    : await db.collection("events").get();

  let processed = 0, skipped = 0, failed = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const updates: Record<string, string> = {};

    const logoUrl: string | undefined = data.logoUrl || data.event_logo;
    if (logoUrl && (!data.brand_color || FORCE)) {
      try {
        updates.brand_color = await extractAverageColor(logoUrl);
      } catch (err) {
        console.error(`❌  ${doc.id} brand_color — ${err}`);
        failed++;
      }
    }

    const nextImage: string | undefined = data.nextEventImage;
    if (nextImage && (!data.next_brand_color || FORCE)) {
      try {
        updates.next_brand_color = await extractAverageColor(nextImage);
      } catch (err) {
        console.error(`❌  ${doc.id} next_brand_color — ${err}`);
        failed++;
      }
    }

    if (Object.keys(updates).length === 0) {
      console.log(`⏭  ${doc.id} — nothing to update`);
      skipped++;
      continue;
    }

    try {
      await db.doc(`events/${doc.id}`).update(updates);
      const parts = Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(", ");
      console.log(`✅  ${doc.id} — ${parts}`);
      processed++;
    } catch (err) {
      console.error(`❌  ${doc.id} — ${err}`);
      failed++;
    }
  }

  console.log(`\nDone: ${processed} updated, ${skipped} skipped, ${failed} failed`);
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
