/**
 * Fix a user's profilePicture path when the file exists under a different name.
 * Usage: GOOGLE_APPLICATION_CREDENTIALS="..." node functions/fix-profile-path.js <userId> <correctPath>
 * Example: ... fix-profile-path.js wrM87GSjttNKpoVkJ1TFg0TqnUD3 user/wrM87GSjttNKpoVkJ1TFg0TqnUD3/profile_200x200_200x200
 */
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId: 'fantasy-paintball' });
const db = admin.firestore();

const uid = process.argv[2] || 'wrM87GSjttNKpoVkJ1TFg0TqnUD3';
const correctPath = process.argv[3] || `user/${uid}/profile_200x200_200x200`;

db.doc(`users/${uid}`)
  .update({ profilePicture: correctPath })
  .then(() => console.log('Updated profilePicture to', correctPath))
  .catch((e) => { console.error(e); process.exit(1); });
