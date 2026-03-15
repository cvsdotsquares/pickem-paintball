const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// ─── Helper ────────────────────────────────────────────────────────────────
function resolveDisplayName(data) {
  return (
    data.username ||
    (data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : null) ||
    data.name ||
    data.displayName ||
    'Unknown'
  );
}

// ─── Leaderboard Recalculation ────────────────────────────────────────────
// Triggers once per macro upload (watches last_updated on event doc).
// Reads all players once + all users once → batch writes summary docs + flat fields.
exports.recalculateLeaderboard = functions.firestore
  .document('events/{eventId}')
  .onUpdate(async (change, context) => {
    const eventId = context.params.eventId;
    const newData = change.after.data();
    const oldData = change.before.data();

    // Only run when last_updated changes (i.e. the macro just uploaded data).
    // Handle both Firestore Timestamp objects and raw Date/number values written
    // by the Apps Script macro so the comparison never silently returns 0 === 0.
    const toMs = (v) =>
      v?.toMillis?.() ?? (v instanceof Date ? v.getTime() : (typeof v === 'number' ? v : null));
    const newTs = toMs(newData?.last_updated);
    const oldTs = toMs(oldData?.last_updated);
    if (newTs !== null && oldTs !== null && newTs === oldTs) return null;
    if (newTs === null && oldTs === null) return null;

    console.log(`📊 Recalculating leaderboard for: ${eventId}`);

    try {
      // Derive the season year from the event document or its ID
      const eventYear =
        newData?.year ||
        (eventId.match(/(\d{4})/) || [])[1] ||
        String(new Date().getFullYear());

      // ── 1. Build kill map from all player docs (one batch read) ──────────
      const playersSnap = await db.collection(`events/${eventId}/players`).get();
      const killMap = {};
      const playerNameMap = {};
      playersSnap.docs.forEach(doc => {
        const d = doc.data();
        killMap[doc.id] = d['Confirmed Kills'] || 0;
        playerNameMap[doc.id] = d['Player'] || 'Unknown';
      });

      // ── 2. Fetch all users with picks for this event (one batch read) ────
      const usersSnap = await db.collection('users')
        .where(`pickems.${eventId}`, '!=', null)
        .get();

      // ── 3. Discover other events in the same season (for season totals) ──
      const eventsSnap = await db.collection('events').get();
      const siblingEventIds = eventsSnap.docs
        .map(d => d.id)
        .filter(id => {
          const d = eventsSnap.docs.find(x => x.id === id)?.data() || {};
          const year = d.year || (id.match(/(\d{4})/) || [])[1];
          return year === eventYear && id !== eventId;
        });

      // ── 4. Calculate each user's event score ─────────────────────────────
      const userScores = [];
      usersSnap.docs.forEach(userDoc => {
        const data = userDoc.data();
        const pickems = data.pickems || {};
        const playerIds = Array.isArray(pickems[eventId]) ? pickems[eventId] : [];
        if (playerIds.length === 0) return;

        const captainId = pickems[`${eventId}_captain`]
          ? String(pickems[`${eventId}_captain`])
          : null;

        let eventPTS = 0;
        let mvpName = 'None';
        let mvpPTS = 0;

        playerIds.forEach(rawId => {
          const pid = String(rawId);
          const kills = killMap[pid] || 0;
          const pts = pid === captainId ? kills * 1.5 : kills;
          eventPTS += pts;
          if (kills > mvpPTS) {
            mvpPTS = kills;
            mvpName = playerNameMap[pid] || 'Unknown';
          }
        });

        // Season score: current event + stored flat fields for sibling events
        let seasonPTS = eventPTS;
        let seasonMvpPTS = mvpPTS;
        let seasonMvpName = mvpName;
        siblingEventIds.forEach(eid => {
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

      // ── 5. Assign event ranks ─────────────────────────────────────────────
      userScores.sort(
        (a, b) => b.eventPTS - a.eventPTS || a.displayName.localeCompare(b.displayName)
      );
      userScores.forEach((u, i) => { u.eventRank = i + 1; });

      // ── 6. Assign season ranks ────────────────────────────────────────────
      const seasonSorted = [...userScores].sort(
        (a, b) => b.seasonPTS - a.seasonPTS || a.displayName.localeCompare(b.displayName)
      );
      const seasonRankMap = {};
      seasonSorted.forEach((u, i) => { seasonRankMap[u.id] = i + 1; });
      userScores.forEach(u => { u.seasonRank = seasonRankMap[u.id] || 0; });

      // ── 7. Write event summary doc → leaderboards/{eventId} ──────────────
      await db.doc(`leaderboards/${eventId}`).set({
        eventId,
        year: eventYear,
        totalParticipants: userScores.length,
        lastCalculated: admin.firestore.FieldValue.serverTimestamp(),
        users: userScores,
      });

      // ── 8. Build & write season summary doc → leaderboards/season_{year} ─
      // Needs ALL users (not just this event) to cover multi-event participants
      const allUsersSnap = await db.collection('users').get();
      const allSeasonEventIds = [eventId, ...siblingEventIds];
      const seasonUsers = [];

      allUsersSnap.docs.forEach(userDoc => {
        const data = userDoc.data();
        const pickems = data.pickems || {};
        const participated = allSeasonEventIds.some(
          eid => Array.isArray(pickems[eid]) && pickems[eid].length > 0
        );
        if (!participated) return;

        const existingScore = userScores.find(u => u.id === userDoc.id);

        let seasonTotalPoints = 0;
        let seasonMvpPTS = 0;
        let seasonMvpName = 'None';

        allSeasonEventIds.forEach(eid => {
          const pts =
            eid === eventId
              ? (existingScore?.eventPTS || 0)
              : (parseFloat(data[`${eid}PTS`]) || 0);
          seasonTotalPoints += pts;

          const mvpPTS =
            eid === eventId
              ? (existingScore?.mvpPTS || 0)
              : (parseFloat(data[`${eid}MVPPTS`]) || 0);
          if (mvpPTS > seasonMvpPTS) {
            seasonMvpPTS = mvpPTS;
            seasonMvpName =
              eid === eventId
                ? (existingScore?.mvp || 'None')
                : (data[`${eid}MVP`] || 'None');
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
        (a, b) => b.seasonTotalPoints - a.seasonTotalPoints || a.displayName.localeCompare(b.displayName)
      );
      seasonUsers.forEach((u, i) => { u.seasonRank = i + 1; });

      await db.doc(`leaderboards/season_${eventYear}`).set({
        year: eventYear,
        totalParticipants: seasonUsers.length,
        lastCalculated: admin.firestore.FieldValue.serverTimestamp(),
        users: seasonUsers,
      });

      // ── 9. Batch-write flat fields to each user doc ───────────────────────
      const BATCH_SIZE = 500;
      for (let i = 0; i < userScores.length; i += BATCH_SIZE) {
        const batch = db.batch();
        userScores.slice(i, i + BATCH_SIZE).forEach(user => {
          batch.update(db.doc(`users/${user.id}`), {
            [`${eventId}Rank`]: user.eventRank,
            [`${eventId}PTS`]: user.eventPTS,
            [`${eventId}MVP`]: user.mvp,
            [`${eventId}MVPPTS`]: user.mvpPTS,
          });
        });
        await batch.commit();
      }

      console.log(`✅ Done: ${userScores.length} users ranked for ${eventId}`);
      return null;
    } catch (err) {
      console.error(`❌ recalculateLeaderboard failed:`, err);
      return null;
    }
  });

// Helper function to migrate single event
const migrateSingleEvent = async (eventId) => {
  console.log(`🔄 Migrating event: ${eventId}`);
  
  try {
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      console.log(`⚠️  Event not found: ${eventId}`);
      return;
    }
    
    const eventData = eventDoc.data();
    const year = eventData.year || eventId.match(/(\d{4})/)?.[1] || '2025';
    const season = eventData.season || year;
    
    const playersSnapshot = await db.collection(`events/${eventId}/players`).get();
    
    if (playersSnapshot.empty) {
      console.log(`⚠️  No players found for event: ${eventId}`);
      return;
    }
    
    const players = playersSnapshot.docs;
    const batchSize = 500;
    
    for (let i = 0; i < players.length; i += batchSize) {
      const batch = db.batch();
      const batchPlayers = players.slice(i, i + batchSize);
      
      batchPlayers.forEach((playerDoc) => {
        const playerId = playerDoc.id;
        const playerData = playerDoc.data();
        const confirmedKills = playerData['Confirmed Kills'] || playerData.confirmedKills || 0;
        
        const newPlayerData = {
          playerId,
          playerName: playerData.Player || playerData.playerName || 'Unknown Player',
          team: playerData.Team || playerData.team || 'Unknown Team',
          confirmedKills,
          gunfights: playerData.Gunfights || 0,
          breakshooting: playerData.Breakshooting || 0,
          movement: playerData.Movement || 0,
          zoneCoverage: playerData['Zone Coverage'] || playerData.zoneCoverage || 0,
          pressure: playerData.Pressure || 0,
          trades: playerData.Trades || 0,
          unclassified: playerData.Unclassified || 0,
          eventRank: parseInt(playerData.Rank) || 999,
          eventId,
          season,
          year,
          eventStatus: 'completed',
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          originalData: playerData
        };
        
        const newPlayerRef = db.doc(`players/season_${season}/${eventId}/${playerId}`);
        batch.set(newPlayerRef, newPlayerData);
      });
      
      await batch.commit();
    }
    
    // Calculate rankings for this event
    const migratedPlayers = await db.collection(`players/season_${season}/${eventId}`).get();
    const sortedPlayers = migratedPlayers.docs
      .map(doc => ({ id: doc.id, data: doc.data() }))
      .sort((a, b) => (b.data.confirmedKills || 0) - (a.data.confirmedKills || 0));
    
    for (let i = 0; i < sortedPlayers.length; i += batchSize) {
      const batch = db.batch();
      const batchPlayers = sortedPlayers.slice(i, i + batchSize);
      
      batchPlayers.forEach((player, index) => {
        const globalRank = i + index + 1;
        const playerRef = db.doc(`players/season_${season}/${eventId}/${player.id}`);
        batch.update(playerRef, {
          eventRank: globalRank,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      
      await batch.commit();
    }
    
    console.log(`✅ Successfully migrated ${players.length} players for event: ${eventId}`);
  } catch (error) {
    console.error(`❌ Error migrating event ${eventId}:`, error);
    throw error;
  }
};

// Firestore Trigger: Runs when events collection changes
exports.onEventChange = functions.firestore
  .document('events/{eventId}')
  .onWrite(async (change, context) => {
    const eventId = context.params.eventId;
    
    // If event is deleted, skip migration
    if (!change.after.exists) {
      console.log(`🗑️  Event deleted: ${eventId}`);
      return null;
    }
    
    console.log(`🔔 Event changed: ${eventId}`);
    
    try {
      await migrateSingleEvent(eventId);
      return null;
    } catch (error) {
      console.error(`❌ Failed to migrate event ${eventId}:`, error);
      return null;
    }
  });

// Firestore Trigger: Runs when players subcollection changes
exports.onPlayerChange = functions.firestore
  .document('events/{eventId}/players/{playerId}')
  .onWrite(async (change, context) => {
    const { eventId, playerId } = context.params;
    
    console.log(`🔔 Player changed: ${playerId} in event ${eventId}`);
    
    try {
      await migrateSingleEvent(eventId);
      return null;
    } catch (error) {
      console.error(`❌ Failed to migrate after player change:`, error);
      return null;
    }
  });
