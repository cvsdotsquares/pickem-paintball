/**
 * Full leaderboard recalculation (same logic as Cloud Function recalculateLeaderboard).
 * Re-sorts by eventPTS / seasonTotalPoints and writes leaderboards + user flat fields.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS="..." node functions/refresh-event-leaderboard.js tampa_bay_2026
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

async function recalculateLeaderboard(eventId) {
  const eventSnap = await db.doc(`events/${eventId}`).get();
  if (!eventSnap.exists) {
    throw new Error(`Event not found: ${eventId}`);
  }
  const newData = eventSnap.data();
  const eventYear =
    newData?.year || (eventId.match(/(\d{4})/) || [])[1] || String(new Date().getFullYear());

  const playersSnap = await db.collection(`events/${eventId}/players`).get();
  const killMap = {};
  const playerNameMap = {};
  playersSnap.docs.forEach((doc) => {
    const d = doc.data();
    killMap[doc.id] = d['Confirmed Kills'] || 0;
    playerNameMap[doc.id] = d['Player'] || 'Unknown';
  });

  const usersSnap = await db.collection('users').where(`pickems.${eventId}`, '!=', null).get();

  const eventsSnap = await db.collection('events').get();
  const siblingEventIds = eventsSnap.docs
    .map((d) => d.id)
    .filter((id) => {
      const d = eventsSnap.docs.find((x) => x.id === id)?.data() || {};
      const year = d.year || (id.match(/(\d{4})/) || [])[1];
      return year === eventYear && id !== eventId;
    });

  const userScores = [];
  usersSnap.docs.forEach((userDoc) => {
    const data = userDoc.data();
    const pickems = data.pickems || {};
    const playerIds = Array.isArray(pickems[eventId]) ? pickems[eventId] : [];
    if (playerIds.length === 0) return;

    const captainId = pickems[`${eventId}_captain`] ? String(pickems[`${eventId}_captain`]) : null;

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

    let seasonPTS = eventPTS;
    let seasonMvpPTS = mvpPTS;
    let seasonMvpName = mvpName;
    siblingEventIds.forEach((eid) => {
      seasonPTS += parseFloat(data[`${eid}PTS`]) || 0;
      const sibMvpPTS = parseFloat(data[`${eid}MVPPTS`]) || 0;
      if (sibMvpPTS > seasonMvpPTS) {
        seasonMvpPTS = sibMvpPTS;
        seasonMvpName = data[`${eid}MVP`] || 'None';
      }
    });

    userScores.push({
      id: userDoc.id,
      displayName: resolveDisplayName(data),
      profilePicture: data.profilePicture || null,
      isSubscribed: data.isSubscribed || false,
      leagues: data.leagues || [],
      eventPTS,
      mvp: mvpName,
      mvpPTS,
      seasonPTS,
      seasonMvpName,
      seasonMvpPTS,
    });
  });

  userScores.sort(
    (a, b) => b.eventPTS - a.eventPTS || a.displayName.localeCompare(b.displayName),
  );
  userScores.forEach((u, i) => {
    u.eventRank = i + 1;
  });

  const seasonSorted = [...userScores].sort(
    (a, b) => b.seasonPTS - a.seasonPTS || a.displayName.localeCompare(b.displayName),
  );
  const seasonRankMap = {};
  seasonSorted.forEach((u, i) => {
    seasonRankMap[u.id] = i + 1;
  });
  userScores.forEach((u) => {
    u.seasonRank = seasonRankMap[u.id] || 0;
  });

  await db.doc(`leaderboards/${eventId}`).set({
    eventId,
    year: eventYear,
    totalParticipants: userScores.length,
    lastCalculated: admin.firestore.FieldValue.serverTimestamp(),
    users: userScores,
  });

  const allUsersSnap = await db.collection('users').get();
  const allSeasonEventIds = [eventId, ...siblingEventIds];
  const seasonUsers = [];

  allUsersSnap.docs.forEach((userDoc) => {
    const data = userDoc.data();
    const pickems = data.pickems || {};
    const participated = allSeasonEventIds.some(
      (eid) => Array.isArray(pickems[eid]) && pickems[eid].length > 0,
    );
    if (!participated) return;

    const existingScore = userScores.find((u) => u.id === userDoc.id);

    let seasonTotalPoints = 0;
    let seasonMvpPTS = 0;
    let seasonMvpName = 'None';

    allSeasonEventIds.forEach((eid) => {
      const pts =
        eid === eventId ? existingScore?.eventPTS || 0 : parseFloat(data[`${eid}PTS`]) || 0;
      seasonTotalPoints += pts;

      const mvpPTS =
        eid === eventId ? existingScore?.mvpPTS || 0 : parseFloat(data[`${eid}MVPPTS`]) || 0;
      if (mvpPTS > seasonMvpPTS) {
        seasonMvpPTS = mvpPTS;
        seasonMvpName =
          eid === eventId ? existingScore?.mvp || 'None' : data[`${eid}MVP`] || 'None';
      }
    });

    seasonUsers.push({
      id: userDoc.id,
      displayName: resolveDisplayName(data),
      profilePicture: data.profilePicture || null,
      isSubscribed: data.isSubscribed || false,
      leagues: data.leagues || [],
      seasonTotalPoints,
      seasonmvpname: seasonMvpName,
      seasonmvppts: seasonMvpPTS,
    });
  });

  seasonUsers.sort(
    (a, b) =>
      b.seasonTotalPoints - a.seasonTotalPoints ||
      a.displayName.localeCompare(b.displayName),
  );
  seasonUsers.forEach((u, i) => {
    u.seasonRank = i + 1;
  });

  await db.doc(`leaderboards/season_${eventYear}`).set({
    year: eventYear,
    totalParticipants: seasonUsers.length,
    lastCalculated: admin.firestore.FieldValue.serverTimestamp(),
    users: seasonUsers,
  });

  const BATCH_SIZE = 500;
  for (let i = 0; i < userScores.length; i += BATCH_SIZE) {
    const batch = db.batch();
    userScores.slice(i, i + BATCH_SIZE).forEach((user) => {
      batch.update(db.doc(`users/${user.id}`), {
        [`${eventId}Rank`]: user.eventRank,
        [`${eventId}PTS`]: user.eventPTS,
        [`${eventId}MVP`]: user.mvp,
        [`${eventId}MVPPTS`]: user.mvpPTS,
      });
    });
    await batch.commit();
  }

  return { userScores, eventYear };
}

async function main() {
  const eventId = process.argv[2] || 'tampa_bay_2026';
  console.log(`\nRefreshing leaderboard for ${eventId}...\n`);
  const { userScores } = await recalculateLeaderboard(eventId);
  console.log(`✅ Done: ${userScores.length} users ranked.\n`);

  const tester = userScores.find((u) => u.id === '8ChFqeHSKVhrt8FS9J6FOwf20tY2');
  if (tester) {
    console.log('Tester12345:', {
      eventRank: tester.eventRank,
      eventPTS: tester.eventPTS,
      seasonRank: tester.seasonRank,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
