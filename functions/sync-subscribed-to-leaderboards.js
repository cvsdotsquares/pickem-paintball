/**
 * One-off: Sync isSubscribed=true for all subscribed users into leaderboard docs.
 * Fixes PRO badges for users who subscribed before onUserSubscriptionChanged was deployed.
 *
 * Run (dry run):
 *   GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json" node functions/sync-subscribed-to-leaderboards.js
 *
 * Run (apply changes):
 *   GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json" node functions/sync-subscribed-to-leaderboards.js --confirm
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'fantasy-paintball' });
}
const db = admin.firestore();

const EXCLUDE = new Set(['testid1', 'testid1demo']);

async function main() {
  const confirm = process.argv.includes('--confirm');

  // 1. Get all subscribed users (exclude test accounts)
  const usersSnap = await db.collection('users').get();
  const subscribed = [];
  usersSnap.docs.forEach((doc) => {
    const d = doc.data();
    const username = d?.username?.trim() || doc.id;
    if (EXCLUDE.has(doc.id) || EXCLUDE.has(username)) return;
    if (d.isSubscribed === true) {
      subscribed.push({ id: doc.id, pickems: d.pickems || {} });
    }
  });

  console.log(`\nFound ${subscribed.length} subscribed user(s) (excl. test accounts)\n`);

  if (subscribed.length === 0) {
    console.log('Nothing to do.\n');
    process.exit(0);
  }

  // 2. For each user, find event IDs they participated in
  const userToEvents = new Map();
  const allEventIds = new Set();
  const allSeasonIds = new Set();

  subscribed.forEach((u) => {
    const pickems = u.pickems || {};
    const eventIds = Object.keys(pickems).filter((k) => !k.includes('_captain'));
    const participated = eventIds.filter(
      (k) => Array.isArray(pickems[k]) && pickems[k].length > 0
    );
    if (participated.length > 0) {
      userToEvents.set(u.id, participated);
      participated.forEach((eid) => allEventIds.add(eid));
      participated.forEach((eid) => {
        const m = eid.match(/(\d{4})/);
        if (m) allSeasonIds.add(`season_${m[1]}`);
      });
    }
  });

  // 3. Load all relevant leaderboard docs
  const docIds = [...allEventIds, ...allSeasonIds];
  const updates = [];

  for (const docId of docIds) {
    const ref = db.doc(`leaderboards/${docId}`);
    const snap = await ref.get();
    if (!snap.exists) continue;

    const data = snap.data();
    const users = data.users || [];
    let changed = false;
    const newUsers = users.map((u) => {
      if (!userToEvents.has(u.id)) return u;
      const events = userToEvents.get(u.id);
      const year = docId.startsWith('season_') ? docId.replace('season_', '') : null;
      const inThisDoc = year
        ? events.some((eid) => (eid.match(/(\d{4})/) || [])[1] === year)
        : events.includes(docId);
      if (!inThisDoc) return u;
      if (u.isSubscribed === true) return u;
      changed = true;
      return { ...u, isSubscribed: true };
    });

    if (changed) {
      updates.push({ docId, users: newUsers });
    }
  }

  console.log(`Would update ${updates.length} leaderboard doc(s).\n`);

  if (updates.length === 0) {
    console.log('All leaderboards already have correct isSubscribed. Nothing to do.\n');
    process.exit(0);
  }

  if (!confirm) {
    console.log('Dry run. Run with --confirm to apply changes:\n');
    console.log('  node functions/sync-subscribed-to-leaderboards.js --confirm\n');
    process.exit(0);
  }

  // 4. Apply updates
  for (const { docId, users } of updates) {
    await db.doc(`leaderboards/${docId}`).update({ users });
    console.log(`  ✔ ${docId}`);
  }

  console.log(`\n✅ Synced isSubscribed for ${subscribed.length} user(s) across ${updates.length} leaderboard(s).\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
