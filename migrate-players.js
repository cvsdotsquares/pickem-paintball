// Migration Script: Copy player data from events to new players collection
// Run this script to create new /players collection structure

import { db } from './src/lib/firebaseClient.ts';
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';

// Auto-detect all events from Firebase
const getAllEventsFromFirebase = async () => {
  console.log('🔍 Auto-detecting events from Firebase...');
  
  try {
    const eventsSnapshot = await getDocs(collection(db, 'events'));
    const eventMapping = {};
    
    eventsSnapshot.docs.forEach((eventDoc) => {
      const eventId = eventDoc.id;
      const eventData = eventDoc.data();
      
      // Extract year from event ID or data
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
    // Auto-detect all events
    const eventSeasonMapping = await getAllEventsFromFirebase();
    
    for (const [eventId, eventInfo] of Object.entries(eventSeasonMapping)) {
      console.log(`📋 Processing event: ${eventId} (Season ${eventInfo.season})`);
      
      // Fetch players from existing event structure
      const playersSnapshot = await getDocs(
        collection(db, `events/${eventId}/players`)
      );
      
      if (playersSnapshot.empty) {
        console.log(`⚠️  No players found for event: ${eventId}`);
        continue;
      }
      
      // Process players in batches (Firestore batch limit: 500)
      const players = playersSnapshot.docs;
      const batchSize = 500;
      
      for (let i = 0; i < players.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchPlayers = players.slice(i, i + batchSize);
        
        batchPlayers.forEach((playerDoc) => {
          const playerId = playerDoc.id;
          const playerData = playerDoc.data();
          
          // Calculate event rank based on confirmed kills
          const confirmedKills = playerData['Confirmed Kills'] || playerData.confirmedKills || 0;
          
          // Create new player document structure
          const newPlayerData = {
            playerId: playerId,
            playerName: playerData.Player || playerData.playerName || 'Unknown Player',
            team: playerData.Team || playerData.team || 'Unknown Team',
            
            // Event stats
            confirmedKills: confirmedKills,
            gunfights: playerData.Gunfights || 0,
            breakshooting: playerData.Breakshooting || 0,
            movement: playerData.Movement || 0,
            zoneCoverage: playerData['Zone Coverage'] || playerData.zoneCoverage || 0,
            pressure: playerData.Pressure || 0,
            trades: playerData.Trades || 0,
            unclassified: playerData.Unclassified || 0,
            
            // Ranking (will be calculated separately)
            eventRank: parseInt(playerData.Rank) || 999,
            
            // Metadata
            eventId: eventId,
            season: eventInfo.season,
            year: eventInfo.year,
            eventStatus: 'completed',
            lastUpdated: new Date(),
            
            // Original data backup
            originalData: playerData
          };
          
          // Set document in new collection structure
          const newPlayerRef = doc(
            db, 
            `players/season_${eventInfo.season}/${eventId}`, 
            playerId
          );
          
          batch.set(newPlayerRef, newPlayerData);
        });
        
        // Commit batch
        await batch.commit();
        console.log(`✅ Migrated batch ${Math.floor(i/batchSize) + 1} for ${eventId} (${batchPlayers.length} players)`);
      }
      
      console.log(`🎉 Completed migration for ${eventId}: ${players.length} players`);
    }
    
    console.log('🏆 Migration completed successfully!');
    
    // Calculate rankings after migration
    await calculateEventRankings(eventSeasonMapping);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Calculate event rankings for all events
const calculateEventRankings = async (eventSeasonMapping) => {
  console.log('🏆 Calculating event rankings...');
  
  try {
    for (const [eventId, eventInfo] of Object.entries(eventSeasonMapping)) {
      console.log(`📊 Calculating rankings for: ${eventId}`);
      
      // Get all players for this event, sorted by confirmed kills (descending)
      const playersSnapshot = await getDocs(
        collection(db, `players/season_${eventInfo.season}/${eventId}`)
      );
      
      if (playersSnapshot.empty) {
        console.log(`⚠️  No players found for ranking: ${eventId}`);
        continue;
      }
      
      // Sort players by confirmed kills (descending)
      const sortedPlayers = playersSnapshot.docs
        .map(doc => ({ id: doc.id, data: doc.data() }))
        .sort((a, b) => (b.data.confirmedKills || 0) - (a.data.confirmedKills || 0));
      
      // Update rankings in batches
      const batchSize = 500;
      
      for (let i = 0; i < sortedPlayers.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchPlayers = sortedPlayers.slice(i, i + batchSize);
        
        batchPlayers.forEach((player, index) => {
          const globalRank = i + index + 1;
          
          const playerRef = doc(
            db, 
            `players/season_${eventInfo.season}/${eventId}`, 
            player.id
          );
          
          batch.update(playerRef, {
            eventRank: globalRank,
            lastUpdated: new Date()
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

// Verify migration function
const verifyMigration = async () => {
  console.log('🔍 Verifying migration...');
  
  try {
    const eventSeasonMapping = await getAllEventsFromFirebase();
    
    for (const [eventId, eventInfo] of Object.entries(eventSeasonMapping)) {
      // Count original players
      const originalSnapshot = await getDocs(
        collection(db, `events/${eventId}/players`)
      );
      
      // Count migrated players
      const migratedSnapshot = await getDocs(
        collection(db, `players/season_${eventInfo.season}/${eventId}`)
      );
      
      const originalCount = originalSnapshot.size;
      const migratedCount = migratedSnapshot.size;
      
      console.log(`📊 ${eventId}: Original=${originalCount}, Migrated=${migratedCount}`);
      
      if (originalCount !== migratedCount) {
        console.warn(`⚠️  Mismatch in ${eventId}: ${originalCount} vs ${migratedCount}`);
      } else {
        console.log(`✅ ${eventId}: Migration verified`);
      }
    }
    
    console.log('🎉 Migration verification completed!');
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
};

// Export functions
export {
  migratePlayersToNewCollection,
  calculateEventRankings,
  verifyMigration,
  getAllEventsFromFirebase
};

// Run migration if called directly
if (typeof window === 'undefined') {
  // Node.js environment
  migratePlayersToNewCollection()
    .then(() => verifyMigration())
    .catch(console.error);
}