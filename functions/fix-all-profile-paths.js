/**
 * Check all users with profilePicture (storage path) and fix path if file exists
 * under a different name (e.g. profile_200x200_200x200 instead of profile_200x200).
 *
 * Run (dry run):
 *   GOOGLE_APPLICATION_CREDENTIALS="..." node functions/fix-all-profile-paths.js
 *
 * Run (apply changes):
 *   GOOGLE_APPLICATION_CREDENTIALS="..." node functions/fix-all-profile-paths.js --confirm
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'fantasy-paintball' });
}
const db = admin.firestore();
const bucket = admin.storage().bucket('fantasy-paintball.firebasestorage.app');

async function main() {
  const confirm = process.argv.includes('--confirm');

  // 1. Get all users with a storage-path profilePicture (not http URL)
  const usersSnap = await db.collection('users').get();
  const usersToCheck = [];
  usersSnap.docs.forEach((doc) => {
    const pp = doc.data().profilePicture;
    if (pp && typeof pp === 'string' && !pp.startsWith('http')) {
      usersToCheck.push({ id: doc.id, profilePicture: pp });
    }
  });

  console.log(`\nFound ${usersToCheck.length} user(s) with storage-path profilePicture\n`);

  const fixes = [];
  const BATCH = 50;

  for (let i = 0; i < usersToCheck.length; i += BATCH) {
    const batch = usersToCheck.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async ({ id, profilePicture }) => {
        const file = bucket.file(profilePicture);
        const [exists] = await file.exists();
        if (exists) return; // Path correct, nothing to do

        // List files under user/{id}/
        const [files] = await bucket.getFiles({ prefix: `user/${id}/` });
        if (files.length === 0) return; // No files at all

        const names = files.map((f) => f.name);
        // Prefer exact match, else first file in folder
        const correctPath = names.includes(profilePicture)
          ? profilePicture
          : names[0];

        if (correctPath !== profilePicture) {
          fixes.push({ id, from: profilePicture, to: correctPath });
        }
      })
    );
  }

  console.log(`Would fix ${fixes.length} user(s):\n`);
  fixes.forEach((f) => console.log(`  ${f.id}: ${f.from} -> ${f.to}`));
  console.log('');

  if (fixes.length === 0) {
    console.log('All profile paths correct. Nothing to do.\n');
    process.exit(0);
  }

  if (!confirm) {
    console.log('Dry run. Run with --confirm to apply:\n');
    console.log('  node functions/fix-all-profile-paths.js --confirm\n');
    process.exit(0);
  }

  for (const { id, to } of fixes) {
    await db.doc(`users/${id}`).update({ profilePicture: to });
    console.log(`  ✔ ${id}`);
  }

  console.log(`\n✅ Fixed ${fixes.length} user(s). Run sync-profile-pictures-to-leaderboards.js --confirm to update leaderboards.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
