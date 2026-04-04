/**
 * Check a user's profile picture and related data in Firestore.
 * Run: GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json" node functions/check-user-profile.js <userId|username>
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'fantasy-paintball' });
}
const db = admin.firestore();
const storage = admin.storage();

/** Resolve CLI arg to a users/{uid} document id (UID or username lookup). */
async function resolveUserDocId(arg) {
  if (!arg) return 'wrM87GSjttNKpoVkJ1TFg0TqnUD3';
  const byId = await db.doc(`users/${arg}`).get();
  if (byId.exists) return arg;
  const byUsername = await db
    .collection('users')
    .where('username', '==', arg)
    .limit(1)
    .get();
  if (!byUsername.empty) return byUsername.docs[0].id;
  const byUsernameLower = await db
    .collection('users')
    .where('username', '==', arg.toLowerCase())
    .limit(1)
    .get();
  if (!byUsernameLower.empty) return byUsernameLower.docs[0].id;
  return null;
}

async function main() {
  const arg = process.argv[2] || 'wrM87GSjttNKpoVkJ1TFg0TqnUD3';
  let userId = await resolveUserDocId(arg);
  if (!userId) {
    console.error(`No user found for "${arg}" (not a UID and no matching username).`);
    process.exit(1);
  }
  if (userId !== arg) {
    console.log(`Resolved "${arg}" -> UID ${userId}`);
  }

  console.log(`\nChecking user: ${userId}\n`);

  // 1. Firestore user doc
  const userSnap = await db.doc(`users/${userId}`).get();
  if (!userSnap.exists) {
    console.error('User not found in Firestore');
    process.exit(1);
  }

  const data = userSnap.data();
  const profilePicture = data.profilePicture;
  const username = data.username || data.displayName || data.name || '—';

  console.log('Firestore user doc:');
  console.log('  displayName/username:', username);
  console.log('  profilePicture:', profilePicture || '(not set)');
  console.log('  profilePicture type:', typeof profilePicture);
  if (profilePicture) {
    console.log('  profilePicture length:', profilePicture.length);
    console.log('  starts with http:', profilePicture.startsWith('http'));
  }

  // 2. Firebase Auth user (if we can get it - Admin SDK)
  try {
    const authUser = await admin.auth().getUser(userId);
    console.log('\nFirebase Auth:');
    console.log('  photoURL:', authUser.photoURL || '(not set)');
    console.log('  provider:', authUser.providerData?.map((p) => p.providerId).join(', '));
  } catch (e) {
    console.log('\nFirebase Auth: (could not fetch)', e.message);
  }

  // 3. Check Storage — try default bucket and common bucket names, list files in user folder
  const bucketNames = [
    'fantasy-paintball.firebasestorage.app',
    'fantasy-paintball.appspot.com',
  ];
  const pathsToCheck = [
    `user/${userId}/profile_200x200`,
    `user/${userId}/profile`,
    profilePicture && !profilePicture.startsWith('http') ? profilePicture : null,
  ].filter(Boolean);

  console.log('\nStorage check:');
  const pathToCheck = profilePicture && !profilePicture.startsWith('http') ? profilePicture : `user/${userId}/profile_200x200`;
  for (const bucketName of bucketNames) {
    const bucket = storage.bucket(bucketName);
    const label = bucketName;
    try {
      const [files] = await bucket.getFiles({ prefix: `user/${userId}/` });
      if (files.length > 0) {
        console.log(`  Bucket ${label}: Found ${files.length} file(s):`, files.map((f) => f.name).join(', '));
      }
      const file = bucket.file(pathToCheck);
      const [exists] = await file.exists();
      console.log(`  Bucket ${label}: path ${pathToCheck} = ${exists ? 'EXISTS' : 'NOT FOUND'}`);
    } catch (e) {
      console.log(`  Bucket ${label}: error`, e.message);
    }
  }

  // 4. Construct URL as getFirebaseStorageUrl would
  if (profilePicture && !profilePicture.startsWith('http')) {
    const encodedPath = profilePicture.replace(/\//g, '%2F');
    const url = `https://firebasestorage.googleapis.com/v0/b/fantasy-paintball.firebasestorage.app/o/${encodedPath}?alt=media`;
    console.log('\nConstructed URL (getFirebaseStorageUrl):');
    console.log('  ', url);
  }

  console.log('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
