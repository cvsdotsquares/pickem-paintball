/* Reset the badges announcement modal flag for one or more user emails. */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

async function main() {
  const emails = process.argv.slice(2);
  if (emails.length === 0) {
    console.error("usage: tsx scripts/reset-badges-modal.ts <email> [email...]");
    process.exit(1);
  }
  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "fantasy-paintball",
    });
  }
  const auth = getAuth();
  const db = getFirestore();

  for (const email of emails) {
    try {
      const userRecord = await auth.getUserByEmail(email);
      const uid = userRecord.uid;
      const ref = db.collection("users").doc(uid);
      const snap = await ref.get();
      const before = snap.exists ? snap.get("badgesAnnouncementSeen") : "(no doc)";
      await ref.update({
        badgesAnnouncementSeen: FieldValue.delete(),
        postEventModalSeen: FieldValue.delete(),
        lastBadgeCalcEvent: FieldValue.delete(),
      });
      console.log(`✓ ${email} (uid=${uid}) — badgesAnnouncementSeen was: ${before}, now cleared`);
    } catch (err) {
      console.error(`✗ ${email} —`, err instanceof Error ? err.message : err);
    }
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
