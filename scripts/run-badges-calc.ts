/* One-off: recompute badges for every user. Uses Application Default Credentials. */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { calculateBadgesForAllUsers } from "../src/lib/badgeCalculator";

async function main() {
  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "fantasy-paintball",
    });
  }
  const db = getFirestore();
  const result = await calculateBadgesForAllUsers(db);
  console.log(JSON.stringify(result, null, 2));
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
