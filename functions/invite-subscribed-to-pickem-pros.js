/**
 * Invite all subscribed users who haven't been invited to Pick'Em Pros.
 * Excludes testid1, testid1demo. Skips users already invited or in the league.
 *
 * Dry run (show who would be invited):
 *   GOOGLE_APPLICATION_CREDENTIALS="..." node functions/invite-subscribed-to-pickem-pros.js
 *
 * Actually send invites:
 *   GOOGLE_APPLICATION_CREDENTIALS="..." node functions/invite-subscribed-to-pickem-pros.js --confirm
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'fantasy-paintball' });
}
const db = admin.firestore();

function getUsername(data, uid) {
  return (
    data?.username?.trim() ||
    (data?.firstName && data?.lastName ? `${data.firstName} ${data.lastName}`.trim() : null) ||
    data?.name?.trim() ||
    data?.displayName?.trim() ||
    data?.email?.split('@')[0] ||
    uid
  );
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  const LEAGUE_NAME = "Pick'Em Pros";

  // 1. Find the league
  const leaguesSnap = await db.collection('leagues').get();
  const league = leaguesSnap.docs.find(d => {
    const name = (d.data().name || '').toLowerCase();
    return name.includes("pick") && name.includes("em") && name.includes("pros");
  });

  if (!league) {
    console.error('League "Pick\'Em Pros" not found.');
    process.exit(1);
  }

  const leagueId = league.id;
  const leagueData = league.data();
  const leagueDisplayName = leagueData.name || LEAGUE_NAME;
  const memberSet = new Set(leagueData.members || []);

  // 2. Users who already have league_invite for this league
  const invitesSnap = await db.collection('notifications')
    .where('leagueId', '==', leagueId)
    .where('type', '==', 'league_invite')
    .get();
  const invitedUserIds = new Set(invitesSnap.docs.map(d => d.data().userId));

  // 3. Subscribed users (exclude test accounts)
  const EXCLUDE = new Set(['testid1', 'testid1demo']);
  const usersSnap = await db.collection('users').get();
  const subscribed = [];
  usersSnap.docs.forEach(doc => {
    const d = doc.data();
    const username = getUsername(d, doc.id);
    if (EXCLUDE.has(doc.id) || EXCLUDE.has(username)) return;
    if (d.isSubscribed === true) {
      subscribed.push({ id: doc.id, ...d });
    }
  });

  // 4. Not yet invited = subscribed, not in league, no invite notification
  const toInvite = subscribed.filter(u => !memberSet.has(u.id) && !invitedUserIds.has(u.id));

  if (toInvite.length === 0) {
    console.log('\nNo users to invite. All subscribed users have already been invited or are in the league.\n');
    return;
  }

  console.log(`\n${toInvite.length} subscribed user(s) not yet invited to "${leagueDisplayName}":`);
  toInvite.forEach(u => console.log(`  - ${getUsername(u, u.id)}`));

  if (!confirm) {
    console.log('\nDry run. To send invites, run with --confirm');
    console.log('  node functions/invite-subscribed-to-pickem-pros.js --confirm\n');
    return;
  }

  // 5. Create league_invite notification for each
  const batch = db.batch();
  const notificationsRef = db.collection('notifications');

  toInvite.forEach(u => {
    const docRef = notificationsRef.doc();
    batch.set(docRef, {
      userId: u.id,
      type: 'league_invite',
      leagueId,
      leagueName: leagueDisplayName,
      message: `You have been invited to join "${leagueDisplayName}" league`,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      fromUser: null,
      fromUserName: null,
    });
  });

  await batch.commit();
  console.log(`\n✓ Sent ${toInvite.length} invite(s).\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
