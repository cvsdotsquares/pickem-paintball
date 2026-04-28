import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const NON_DEFAULT_STATUSES = new Set([
  "Out",
  "Dropped",
  "Injured",
  "Questionable",
  "Addition",
  "Unconfirmed",
]);

async function main() {
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: "fantasy-paintball" });
  const db = getFirestore();

  const events = await db.collection("events").get();
  let updated = 0;
  let skipped = 0;

  for (const event of events.docs) {
    const players = await db.collection(`events/${event.id}/players`).get();
    for (const p of players.docs) {
      const d = p.data();
      if (!NON_DEFAULT_STATUSES.has(d.Status)) {
        skipped += 1;
        continue;
      }
      if (d.StatusUpdatedAt) {
        skipped += 1;
        continue;
      }
      await p.ref.update({ StatusUpdatedAt: FieldValue.serverTimestamp() });
      updated += 1;
      console.log(`✓ ${event.id}/${p.id} (${d.Player}) — ${d.Status}`);
    }
  }
  console.log(`\nDone. Updated ${updated}, skipped ${skipped}.`);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
