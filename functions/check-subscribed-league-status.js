/**
 * Check all subscribed users against Pick'Em Pros league:
 * - invited (t/f): has received a league_invite notification for this league
 * - in league (t/f): is in league.members
 *
 * Run: GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json" node functions/check-subscribed-league-status.js
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
  const members = league.data().members || [];
  const memberSet = new Set(members);

  // 2. Get all users with league_invite notifications for this league
  const invitesSnap = await db.collection('notifications')
    .where('leagueId', '==', leagueId)
    .where('type', '==', 'league_invite')
    .get();
  const invitedUserIds = new Set(invitesSnap.docs.map(d => d.data().userId));

  // 3. Get all subscribed users (exclude test accounts by id or username)
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

  // 4. Build output (if in league, invited = confirmed)
  const rows = subscribed.map(u => {
    const inLeague = memberSet.has(u.id);
    const invited = invitedUserIds.has(u.id) || inLeague;
    return {
      username: getUsername(u, u.id),
      invited,
      inLeague,
    };
  }).sort((a, b) => a.username.localeCompare(b.username));

  // 5. Print to terminal
  console.log(`\nSubscribed users vs "${LEAGUE_NAME}" (${rows.length} total, excl. testid1, testid1demo)\n`);
  console.log('username'.padEnd(30) + '  invited  in_league');
  console.log('-'.repeat(55));

  rows.forEach(r => {
    const inv = r.invited ? 'confirmed' : 'n';
    const inL = r.inLeague ? 'confirmed' : 'n';
    console.log(r.username.padEnd(30) + `  ${inv.padEnd(9)} ${inL}`);
  });

  console.log('\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
