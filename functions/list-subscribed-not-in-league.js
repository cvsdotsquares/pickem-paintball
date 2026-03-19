/**
 * One-off script: List subscribed users NOT in "Pick'Em Pros" league.
 *
 * Run from project root:
 *   node functions/list-subscribed-not-in-league.js
 *
 * Requires Firebase credentials. Either:
 *   A) Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path, or
 *   B) Run: gcloud auth application-default login
 *      (then: gcloud config set project fantasy-paintball)
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

  // 1. Find the league by name (flexible match for Pick'Em Pros)
  const leaguesSnap = await db.collection('leagues').get();
  const league = leaguesSnap.docs.find(d => {
    const name = (d.data().name || '').toLowerCase();
    return name.includes("pick") && name.includes("em") && name.includes("pros");
  });

  if (!league) {
    console.error('League "Pick\'Em Pros" not found. Leagues:', leaguesSnap.docs.map(d => d.data().name));
    process.exit(1);
  }

  const members = league.data().members || [];
  const memberSet = new Set(members);
  console.log(`League "${league.data().name}" (${league.id}) has ${members.length} members.\n`);

  // 2. Get all subscribed users
  const usersSnap = await db.collection('users').get();
  const subscribed = [];
  usersSnap.docs.forEach(doc => {
    const d = doc.data();
    if (d.isSubscribed === true) {
      subscribed.push({ id: doc.id, ...d });
    }
  });

  // 3. Filter: subscribed AND not in league
  const notInLeague = subscribed.filter(u => !memberSet.has(u.id));

  // 4. Sort by username and output
  const usernames = notInLeague.map(u => getUsername(u, u.id)).sort((a, b) => a.localeCompare(b));

  console.log(`Subscribed users NOT in "${LEAGUE_NAME}" (${usernames.length} total):\n`);
  usernames.forEach((name, i) => console.log(`${i + 1}. ${name}`));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
