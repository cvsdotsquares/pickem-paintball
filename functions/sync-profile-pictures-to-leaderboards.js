/**
 * One-off: Sync profilePicture and displayName from users collection into
 * leaderboard docs. Fixes missing profile pictures for users whose profile
 * was set/updated before onUserProfileChanged was deployed.
 *
 * Run (dry run):
 *   GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json" node functions/sync-profile-pictures-to-leaderboards.js
 *
 * Run (apply changes):
 *   GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json" node functions/sync-profile-pictures-to-leaderboards.js --confirm
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'fantasy-paintball' });
}
const db = admin.firestore();

function resolveDisplayName(data) {
  return (
    data?.username ||
    (data?.firstName && data?.lastName ? `${data.firstName} ${data.lastName}` : null) ||
    data?.name ||
    data?.displayName ||
    'Unknown'
  );
}

async function main() {
  const confirm = process.argv.includes('--confirm');

  // 1. Load all leaderboard docs
  const lbSnap = await db.collection('leaderboards').get();
  console.log(`\nFound ${lbSnap.size} leaderboard doc(s)\n`);

  // 2. Collect all user IDs that appear in leaderboards
  const userIds = new Set();
  lbSnap.docs.forEach((doc) => {
    const users = doc.data().users || [];
    users.forEach((u) => userIds.add(u.id));
  });

  // 3. Fetch current user data (batched — getAll up to 100 per batch)
  const userDataMap = new Map();
  const uidArray = [...userIds];
  const BATCH = 100;
  for (let i = 0; i < uidArray.length; i += BATCH) {
    const batch = uidArray.slice(i, i + BATCH);
    const refs = batch.map((uid) => db.doc(`users/${uid}`));
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap, idx) => {
      if (snap.exists) {
        const d = snap.data();
        userDataMap.set(batch[idx], {
          profilePicture: d.profilePicture || null,
          displayName: resolveDisplayName(d),
        });
      }
    });
  }

  console.log(`Loaded ${userDataMap.size} user doc(s)\n`);

  // 4. Update each leaderboard doc where profile differs
  const updates = [];
  for (const lbDoc of lbSnap.docs) {
    const docId = lbDoc.id;
    const data = lbDoc.data();
    const users = data.users || [];

    const newUsers = users.map((u) => {
      const fresh = userDataMap.get(u.id);
      if (!fresh) return u;
      if (u.profilePicture === fresh.profilePicture && u.displayName === fresh.displayName) {
        return u;
      }
      return { ...u, profilePicture: fresh.profilePicture, displayName: fresh.displayName };
    });

    const changed = users.some((u, i) => u !== newUsers[i]);
    if (changed) {
      updates.push({ docId, users: newUsers });
    }
  }

  console.log(`Would update ${updates.length} leaderboard doc(s).\n`);

  if (updates.length === 0) {
    console.log('All leaderboards already have correct profilePicture/displayName. Nothing to do.\n');
    process.exit(0);
  }

  if (!confirm) {
    console.log('Dry run. Run with --confirm to apply changes:\n');
    console.log('  node functions/sync-profile-pictures-to-leaderboards.js --confirm\n');
    process.exit(0);
  }

  for (const { docId, users } of updates) {
    await db.doc(`leaderboards/${docId}`).update({ users });
    console.log(`  ✔ ${docId}`);
  }

  console.log(`\n✅ Synced profile pictures for ${userDataMap.size} user(s) across ${updates.length} leaderboard(s).\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
