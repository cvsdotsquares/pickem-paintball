const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

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
