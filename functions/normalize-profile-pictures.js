/**
 * One-time: Rename profile_200x200_200x200 → profile_200x200 in Storage
 * and update Firestore. Normalizes data so the flow matches our upload path
 * (upload to "profile", extension creates profile_200x200).
 *
 * Run (dry run):
 *   GOOGLE_APPLICATION_CREDENTIALS="..." node functions/normalize-profile-pictures.js
 *
 * Run (apply):
 *   GOOGLE_APPLICATION_CREDENTIALS="..." node functions/normalize-profile-pictures.js --confirm
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'fantasy-paintball' });
}
const db = admin.firestore();
const bucket = admin.storage().bucket('fantasy-paintball.firebasestorage.app');

async function main() {
  const confirm = process.argv.includes('--confirm');

  // Find users whose profilePicture points to profile_200x200_200x200
  const usersSnap = await db.collection('users').get();
  const toFix = [];
  usersSnap.docs.forEach((doc) => {
    const pp = doc.data().profilePicture;
    if (pp && pp.endsWith('profile_200x200_200x200')) {
      toFix.push({ id: doc.id, profilePicture: pp });
    }
  });

  console.log(`\nFound ${toFix.length} user(s) with profile_200x200_200x200\n`);

  if (toFix.length === 0) {
    console.log('Nothing to do.\n');
    process.exit(0);
  }

  if (!confirm) {
    console.log('Dry run. Would copy each file to profile_200x200 and update Firestore.');
    console.log('Run with --confirm to apply.\n');
    process.exit(0);
  }

  for (const { id, profilePicture } of toFix) {
    const oldPath = profilePicture;
    const newPath = profilePicture.replace(/profile_200x200_200x200$/, 'profile_200x200');
    try {
      await bucket.file(oldPath).copy(bucket.file(newPath));
      await bucket.file(oldPath).delete();
      await db.doc(`users/${id}`).update({ profilePicture: newPath });
      console.log(`  ✔ ${id}`);
    } catch (e) {
      console.error(`  ✗ ${id}:`, e.message);
    }
  }

  console.log(`\n✅ Normalized ${toFix.length} user(s). Run sync-profile-pictures-to-leaderboards.js --confirm to update leaderboards.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
