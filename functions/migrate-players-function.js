const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Auto-detect all events from Firebase
const getAllEventsFromFirebase = async () => {
  console.log('🔍 Auto-detecting events from Firebase...');
  
  try {
    const eventsSnapshot = await db.collection('events').get();
    const eventMapping = {};
    
    eventsSnapshot.docs.forEach((eventDoc) => {
      const eventId = eventDoc.id;
      const eventData = eventDoc.data();
      
      const year = eventData.year || eventId.match(/(\d{4})/)?.[1] || '2025';
      const season = eventData.season || year;
      
      eventMapping[eventId] = { season, year };
      console.log(`✅ Found event: ${eventId} (Season ${season})`);
    });
    
    console.log(`🎉 Total events found: ${Object.keys(eventMapping).length}`);
    return eventMapping;
    
  } catch (error) {
    console.error('❌ Error fetching events:', error);
    throw error;
  }
};

// Main migration function
const migratePlayersToNewCollection = async () => {
  console.log('🚀 Starting player data migration...');
  
  try {
    const eventSeasonMapping = await getAllEventsFromFirebase();
    
    for (const [eventId, eventInfo] of Object.entries(eventSeasonMapping)) {
      console.log(`📋 Processing event: ${eventId} (Season ${eventInfo.season})`);
      
      const playersSnapshot = await db.collection(`events/${eventId}/players`).get();
      
      if (playersSnapshot.empty) {
        console.log(`⚠️  No players found for event: ${eventId}`);
        continue;
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
            playerId: playerId,
            playerName: playerData.Player || playerData.playerName || 'Unknown Player',
            team: playerData.Team || playerData.team || 'Unknown Team',
            confirmedKills: confirmedKills,
            gunfights: playerData.Gunfights || 0,
            breakshooting: playerData.Breakshooting || 0,
            movement: playerData.Movement || 0,
            zoneCoverage: playerData['Zone Coverage'] || playerData.zoneCoverage || 0,
            pressure: playerData.Pressure || 0,
            trades: playerData.Trades || 0,
            unclassified: playerData.Unclassified || 0,
            eventRank: parseInt(playerData.Rank) || 999,
            eventId: eventId,
            season: eventInfo.season,
            year: eventInfo.year,
            eventStatus: 'completed',
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            originalData: playerData
          };
          
          const newPlayerRef = db.doc(`players/season_${eventInfo.season}/${eventId}/${playerId}`);
          batch.set(newPlayerRef, newPlayerData);
        });
        
        await batch.commit();
        console.log(`✅ Migrated batch ${Math.floor(i/batchSize) + 1} for ${eventId} (${batchPlayers.length} players)`);
      }
      
      console.log(`🎉 Completed migration for ${eventId}: ${players.length} players`);
    }
    
    console.log('🏆 Migration completed successfully!');
    await calculateEventRankings(eventSeasonMapping);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Calculate event rankings
const calculateEventRankings = async (eventSeasonMapping) => {
  console.log('🏆 Calculating event rankings...');
  
  try {
    for (const [eventId, eventInfo] of Object.entries(eventSeasonMapping)) {
      console.log(`📊 Calculating rankings for: ${eventId}`);
      
      const playersSnapshot = await db.collection(`players/season_${eventInfo.season}/${eventId}`).get();
      
      if (playersSnapshot.empty) {
        console.log(`⚠️  No players found for ranking: ${eventId}`);
        continue;
      }
      
      const sortedPlayers = playersSnapshot.docs
        .map(doc => ({ id: doc.id, data: doc.data() }))
        .sort((a, b) => (b.data.confirmedKills || 0) - (a.data.confirmedKills || 0));
      
      const batchSize = 500;
      
      for (let i = 0; i < sortedPlayers.length; i += batchSize) {
        const batch = db.batch();
        const batchPlayers = sortedPlayers.slice(i, i + batchSize);
        
        batchPlayers.forEach((player, index) => {
          const globalRank = i + index + 1;
          const playerRef = db.doc(`players/season_${eventInfo.season}/${eventId}/${player.id}`);
          
          batch.update(playerRef, {
            eventRank: globalRank,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          });
        });
        
        await batch.commit();
        console.log(`✅ Updated rankings batch ${Math.floor(i/batchSize) + 1} for ${eventId}`);
      }
      
      console.log(`🎯 Rankings calculated for ${eventId}: ${sortedPlayers.length} players`);
    }
    
    console.log('🏆 All event rankings calculated successfully!');
    
  } catch (error) {
    console.error('❌ Ranking calculation failed:', error);
    throw error;
  }
};

// Scheduled function - Runs daily at 12:00 AM
exports.migratePlayerStats = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    console.log('🚀 Starting scheduled migration...');
    
    try {
      await migratePlayersToNewCollection();
      console.log('🏆 Scheduled migration completed!');
      return null;
    } catch (error) {
      console.error('❌ Scheduled migration failed:', error);
      throw error;
    }
  });
