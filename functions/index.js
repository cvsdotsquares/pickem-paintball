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

    // Always run when the event doc is updated — the macro is the only writer
    // so every update means new player data has been uploaded.
    console.log(`🔁 last_updated changed, running recalculation for: ${eventId}`);

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

      // Log all players with kills so we can verify correct data was read
      const scorers = Object.entries(killMap).filter(([, k]) => k > 0).map(([id, k]) => `${playerNameMap[id]}(${id}):${k}`);
      console.log(`📋 Players with kills (${scorers.length}): ${scorers.join(', ') || 'none'}`);
      console.log(`📋 Total players read: ${playersSnap.docs.length}`);

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

// ─── Auto-add user to leaderboard on picks save ───────────────────────────
// Fires on every user doc write. If the user just saved picks for a live event
// and isn't yet in the leaderboard summary doc, appends them with 0 pts so
// they appear immediately without waiting for the next macro run.
exports.onUserPicksSaved = functions.firestore
  .document('users/{userId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return null; // user deleted

    const userId = context.params.userId;
    const before = change.before.exists ? (change.before.data().pickems || {}) : {};
    const after = change.after.data().pickems || {};

    // Find event IDs where picks were newly added in this write
    const newlyPickedEventIds = Object.keys(after).filter(key => {
      if (key.includes('_captain')) return false;
      const picks = after[key];
      if (!Array.isArray(picks) || picks.length === 0) return false;
      const hadBefore = Array.isArray(before[key]) && before[key].length > 0;
      return !hadBefore; // only truly new picks
    });

    if (newlyPickedEventIds.length === 0) return null;

    const userData = change.after.data();
    const displayName = resolveDisplayName(userData);
    const profilePicture = userData.profilePicture || null;
    const isSubscribed = userData.isSubscribed || false;
    const leagues = userData.leagues || [];

    try {
      for (const eventId of newlyPickedEventIds) {
        const lbRef = db.doc(`leaderboards/${eventId}`);
        const lbSnap = await lbRef.get();

        if (!lbSnap.exists) continue; // leaderboard not built yet — CF will create it on first macro run

        const existingUsers = lbSnap.data().users || [];
        const alreadyIn = existingUsers.some(u => u.id === userId);
        if (alreadyIn) continue;

        const newEntry = {
          id: userId,
          displayName,
          profilePicture,
          isSubscribed,
          leagues,
          eventPTS: 0,
          eventRank: existingUsers.length + 1,
          mvp: 'None',
          mvpPTS: 0,
          seasonPTS: 0,
          seasonRank: existingUsers.length + 1,
        };

        await lbRef.update({
          users: admin.firestore.FieldValue.arrayUnion(newEntry),
          totalParticipants: admin.firestore.FieldValue.increment(1),
        });

        console.log(`✅ Added ${displayName} (${userId}) to leaderboard for ${eventId}`);
      }
    } catch (err) {
      console.error('❌ onUserPicksSaved failed:', err);
    }

    return null;
  });

// ─── Sync isSubscribed to leaderboard when user subscribes/unsubscribes ─────
// Leaderboard summaries cache isSubscribed; without this, PRO badges stay stale
// until the next recalculateLeaderboard (macro upload).
exports.onUserSubscriptionChanged = functions.firestore
  .document('users/{userId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return null;
    const before = change.before.exists ? change.before.data() : {};
    const after = change.after.data();
    if (!!before.isSubscribed === !!after.isSubscribed) return null;

    const userId = context.params.userId;
    const isSubscribed = !!after.isSubscribed;

    const pickems = after.pickems || {};
    const eventIds = Object.keys(pickems).filter(k => !k.includes('_captain'));
    const participatedEventIds = eventIds.filter(
      k => Array.isArray(pickems[k]) && pickems[k].length > 0
    );
    if (participatedEventIds.length === 0) return null;

    const years = new Set();
    for (const eventId of participatedEventIds) {
      const m = eventId.match(/(\d{4})/);
      if (m) years.add(m[1]);
    }

    const updateLeaderboardDoc = async (docId) => {
      const ref = db.doc(`leaderboards/${docId}`);
      const snap = await ref.get();
      if (!snap.exists) return;
      const data = snap.data();
      const users = data.users || [];
      const idx = users.findIndex(u => u.id === userId);
      if (idx === -1) return;
      users[idx] = { ...users[idx], isSubscribed };
      await ref.update({ users });
    };

    try {
      for (const eventId of participatedEventIds) {
        await updateLeaderboardDoc(eventId);
      }
      for (const year of years) {
        await updateLeaderboardDoc(`season_${year}`);
      }
      console.log(`✅ Synced isSubscribed=${isSubscribed} for ${userId} to leaderboards`);
    } catch (err) {
      console.error('❌ onUserSubscriptionChanged failed:', err);
    }
    return null;
  });

// ─── Sync profilePicture/displayName to leaderboard when user profile changes ─
// Leaderboard summaries cache profilePicture and displayName; without this,
// profile pics/names stay stale until the next recalculateLeaderboard.
exports.onUserProfileChanged = functions.firestore
  .document('users/{userId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return null;
    const before = change.before.exists ? change.before.data() : {};
    const after = change.after.data();

    const profileFields = ['profilePicture', 'username', 'firstName', 'lastName', 'name', 'displayName'];
    const changed = profileFields.some(f => {
      const b = before[f];
      const a = after[f];
      return (b !== a) || (typeof b !== typeof a);
    });
    if (!changed) return null;

    const userId = context.params.userId;
    const profilePicture = after.profilePicture || null;
    const displayName = resolveDisplayName(after);

    const pickems = after.pickems || {};
    const participatedEventIds = Object.keys(pickems)
      .filter(k => !k.includes('_captain'))
      .filter(k => Array.isArray(pickems[k]) && pickems[k].length > 0);
    if (participatedEventIds.length === 0) return null;

    const years = new Set();
    participatedEventIds.forEach(eventId => {
      const m = eventId.match(/(\d{4})/);
      if (m) years.add(m[1]);
    });

    const updateLeaderboardDoc = async (docId) => {
      const ref = db.doc(`leaderboards/${docId}`);
      const snap = await ref.get();
      if (!snap.exists) return;
      const data = snap.data();
      const users = data.users || [];
      const idx = users.findIndex(u => u.id === userId);
      if (idx === -1) return;
      users[idx] = { ...users[idx], profilePicture, displayName };
      await ref.update({ users });
    };

    try {
      for (const eventId of participatedEventIds) {
        await updateLeaderboardDoc(eventId);
      }
      for (const year of years) {
        await updateLeaderboardDoc(`season_${year}`);
      }
      console.log(`✅ Synced profile for ${userId} (profilePicture/displayName) to leaderboards`);
    } catch (err) {
      console.error('❌ onUserProfileChanged failed:', err);
    }
    return null;
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
      await handlePlayerStatusChange(eventId, playerId, change);
    } catch (error) {
      console.error(`❌ Failed to process player status change:`, error);
    }

    try {
      await migrateSingleEvent(eventId);
      return null;
    } catch (error) {
      console.error(`❌ Failed to migrate after player change:`, error);
      return null;
    }
  });

async function handlePlayerStatusChange(eventId, playerId, change) {
  if (!change.after.exists) return;
  const after = change.after.data() || {};
  const before = change.before.exists ? change.before.data() || {} : {};
  const newStatus = after.Status;
  const oldStatus = before.Status;

  if (!newStatus || newStatus === oldStatus) return;

  // Stamp StatusUpdatedAt if missing/unchanged on this write.
  const beforeTs = before.StatusUpdatedAt;
  const afterTs = after.StatusUpdatedAt;
  const tsUnchanged =
    (beforeTs && afterTs && beforeTs.isEqual && beforeTs.isEqual(afterTs)) ||
    (!beforeTs && !afterTs);
  if (tsUnchanged) {
    try {
      await change.after.ref.update({
        StatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('Failed to stamp StatusUpdatedAt:', e);
    }
  }

  // Find users who picked this player for this event.
  const usersSnap = await db
    .collection('users')
    .where(`pickems.${eventId}`, '!=', null)
    .get();

  const playerName = String(after.Player || 'Player');

  // Resolve a friendly event name.
  let eventName = eventId;
  try {
    const eventDoc = await db.doc(`events/${eventId}`).get();
    if (eventDoc.exists) {
      const ed = eventDoc.data() || {};
      eventName = ed.name || ed.displayName || eventId;
    }
  } catch (_) {}

  const batch = db.batch();
  let count = 0;
  usersSnap.docs.forEach((userDoc) => {
    const pickems = userDoc.data().pickems || {};
    const ids = Array.isArray(pickems[eventId]) ? pickems[eventId] : [];
    const matched = ids.some((id) => String(id) === String(playerId));
    if (!matched) return;
    const ref = db.collection('notifications').doc();
    batch.set(ref, {
      userId: userDoc.id,
      type: 'player_status_changed',
      playerId: String(playerId),
      playerName,
      eventId,
      eventName,
      oldStatus: oldStatus || null,
      newStatus,
      message: `${playerName} is now ${newStatus} for ${eventName}`,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    count += 1;
  });

  if (count > 0) {
    await batch.commit();
    console.log(
      `📨 Sent ${count} player_status_changed notification(s) for ${playerName} (${oldStatus || 'none'} → ${newStatus})`,
    );
  }
}
