/**
 * Recalculate a user's event score after fixing duplicate picks.
 * Updates user doc + leaderboard summary so displayed total matches the 8-player breakdown.
 *
 * Run: GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json" node functions/recalc-user-score.js
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'fantasy-paintball' });
}
const db = admin.firestore();

const UID = 'oFIF4Eqd3kPb53IhvvSWqGwTP0z1';
const EVENT_ID = 'tampa_bay_2026';

async function main() {
  // 1. Build kill map
  const playersSnap = await db.collection(`events/${EVENT_ID}/players`).get();
  const killMap = {};
  const playerNameMap = {};
  playersSnap.docs.forEach((d) => {
    killMap[d.id] = d.data()['Confirmed Kills'] || 0;
    playerNameMap[d.id] = d.data()['Player'] || 'Unknown';
  });

  // 2. Get user picks
  const userSnap = await db.doc(`users/${UID}`).get();
  if (!userSnap.exists) {
    console.error('User not found');
    process.exit(1);
  }
  const pickems = userSnap.data().pickems || {};
  const playerIds = Array.isArray(pickems[EVENT_ID]) ? pickems[EVENT_ID] : [];
  const captainId = pickems[`${EVENT_ID}_captain`] ? String(pickems[`${EVENT_ID}_captain`]) : null;

  if (playerIds.length === 0) {
    console.error('No picks for this event');
    process.exit(1);
  }

  // 3. Calculate eventPTS (same logic as recalculateLeaderboard)
  let eventPTS = 0;
  let mvpName = 'None';
  let mvpPTS = 0;
  playerIds.forEach((rawId) => {
    const pid = String(rawId);
    const kills = killMap[pid] || 0;
    const pts = pid === captainId ? kills * 1.5 : kills;
    eventPTS += pts;
    if (kills > mvpPTS) {
      mvpPTS = kills;
      mvpName = playerNameMap[pid] || 'Unknown';
    }
  });

  console.log(`\nRecalculated for ${EVENT_ID}:`);
  console.log(`  eventPTS: ${eventPTS}`);
  console.log(`  MVP: ${mvpName} (${mvpPTS} kills)\n`);

  // 4. Update user doc
  await db.doc(`users/${UID}`).update({
    [`${EVENT_ID}PTS`]: eventPTS,
    [`${EVENT_ID}MVPPTS`]: mvpPTS,
    [`${EVENT_ID}MVP`]: mvpName,
  });
  console.log('  ✔ User doc updated');

  // 5. Update leaderboard summary
  const lbRef = db.doc(`leaderboards/${EVENT_ID}`);
  const lbSnap = await lbRef.get();
  if (!lbSnap.exists) {
    console.log('  (No leaderboard doc yet — skip)');
    return;
  }

  const data = lbSnap.data();
  const users = data.users || [];
  const idx = users.findIndex((u) => u.id === UID);
  if (idx === -1) {
    console.log('  User not in leaderboard summary — nothing to update there.');
    return;
  }

  users[idx] = { ...users[idx], eventPTS, mvp: mvpName, mvpPTS };

  // Re-sort and re-assign ranks for this event
  users.sort((a, b) => b.eventPTS - a.eventPTS || (a.displayName || '').localeCompare(b.displayName || ''));
  users.forEach((u, i) => {
    u.eventRank = i + 1;
  });

  await lbRef.update({ users });
  console.log('  ✔ Leaderboard summary updated (ranks re-sorted)\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
