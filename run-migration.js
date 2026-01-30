// Simple migration runner script
// Run: node run-migration.js

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, setDoc, writeBatch } = require('firebase/firestore');

// Firebase config (use your existing config)
const firebaseConfig = {
  apiKey: "AIzaSyA1SBDORqH7rb573hhb9S4--g3rWMxDMOg",
  authDomain: "fantasy-paintball.firebaseapp.com",
  projectId: "fantasy-paintball",
  storageBucket: "fantasy-paintball.firebasestorage.app",
  messagingSenderId: "608553503135",
  appId: "1:608553503135:web:14f937951c06703dab95aa"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Event mapping by season
const seasonEvents = {
  '2025': ['atlantic_city_2025', 'lonestar_open_2025', 'midwest_open_2025', 'tampa_bay_2025', 'world_cup_2025'],
  '2024': ['windy_city_open_2024', 'worldcup_2024']
};

console.log('📋 Events to migrate:', seasonEvents);

// Migration function - Creates single player docs with all events data
async function migratePlayersToNewCollection() {
  console.log('🚀 Starting player data migration...');
  
  try {
    // Group events by season
    const seasonEvents = {
      '2025': ['atlantic_city_2025', 'lonestar_open_2025', 'midwest_open_2025', 'tampa_bay_2025', 'world_cup_2025'],
      '2024': ['windy_city_open_2024', 'worldcup_2024']
    };
    
    // Process each season
    for (const [season, events] of Object.entries(seasonEvents)) {
      console.log(`🏆 Processing Season ${season}...`);
      
      // Collect all players across all events in this season
      const seasonPlayers = new Map();
      
      // Fetch data from all events in this season
      for (const eventId of events) {
        console.log(`📋 Fetching data from: ${eventId}`);
        
        const playersSnapshot = await getDocs(
          collection(db, `events/${eventId}/players`)
        );
        
        if (playersSnapshot.empty) {
          console.log(`⚠️  No players found for event: ${eventId}`);
          continue;
        }
        
        // Process each player in this event
        playersSnapshot.docs.forEach((playerDoc) => {
          const playerId = playerDoc.id;
          const playerData = playerDoc.data();
          
          // Get or create player entry
          if (!seasonPlayers.has(playerId)) {
            seasonPlayers.set(playerId, {
              playerId: playerId,
              playerName: playerData.Player || 'Unknown Player',
              playerNumber: playerData.Number || '',
              team: playerData.Team || 'Unknown Team',
              profilePicture: playerData.picture || playerData.profilePicture || '',
              img_url: playerData.img_url || '',
              season: season,
              eventsParticipated: 0,
              totalConfirmedKills: 0,
              gunfights: 0,
              breakshooting: 0,
              movement: 0,
              zoneCoverage: 0,
              pressure: 0,
              trades: 0,
              unclassified: 0,
              seasonRank: 999,
              lastUpdated: new Date()
            });
          }
          
          const player = seasonPlayers.get(playerId);
          
          // Update team if missing (for 2024 season fix)
          if (player.team === 'Unknown Team' && playerData.Team) {
            player.team = playerData.Team;
          }
          
          // Update profile picture if missing
          if (!player.profilePicture && (playerData.picture || playerData.profilePicture)) {
            player.profilePicture = playerData.picture || playerData.profilePicture;
          }
          
          // Update img_url if missing
          if (!player.img_url && playerData.img_url) {
            player.img_url = playerData.img_url;
          }
          
          // Add event data as key in player document
          player[eventId] = {
            confirmedKills: playerData['Confirmed Kills'] || 0,
            gunfights: playerData.Gunfights || 0,
            breakshooting: playerData.Breakshooting || 0,
            movement: playerData.Movement || 0,
            zoneCoverage: playerData['Zone Coverage'] || 0,
            pressure: playerData.Pressure || 0,
            trades: playerData.Trades || 0,
            unclassified: playerData.Unclassified || 0,
            eventRank: parseInt(playerData.Rank) || 999,
            eventStatus: 'completed'
          };
          
          // Update totals from all events
          player.eventsParticipated++;
          player.totalConfirmedKills += (playerData['Confirmed Kills'] || 0);
          player.gunfights += (playerData.Gunfights || 0);
          player.breakshooting += (playerData.Breakshooting || 0);
          player.movement += (playerData.Movement || 0);
          player.zoneCoverage += (playerData['Zone Coverage'] || 0);
          player.pressure += (playerData.Pressure || 0);
          player.trades += (playerData.Trades || 0);
          player.unclassified += (playerData.Unclassified || 0);
        });
      }
      
      console.log(`📊 Found ${seasonPlayers.size} unique players in season ${season}`);
      
      // Calculate season rankings based on total kills
      const sortedPlayers = Array.from(seasonPlayers.values())
        .sort((a, b) => b.totalConfirmedKills - a.totalConfirmedKills);
      
      // Assign season ranks
      sortedPlayers.forEach((player, index) => {
        player.seasonRank = index + 1;
      });
      
      // Save to new collection in batches
      const batchSize = 500;
      for (let i = 0; i < sortedPlayers.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchPlayers = sortedPlayers.slice(i, i + batchSize);
        
        batchPlayers.forEach((player) => {
          const playerRef = doc(db, 'players', `season_${season}`, 'players', player.playerId);
          batch.set(playerRef, player);
        });
        
        await batch.commit();
        console.log(`✅ Saved batch ${Math.floor(i/batchSize) + 1} for season ${season} (${batchPlayers.length} players)`);
      }
      
      console.log(`🎉 Completed season ${season}: ${sortedPlayers.length} players`);
    }
    
    console.log('🏆 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Verification function
async function verifyMigration() {
  console.log('🔍 Verifying migration...');
  
  try {
    const seasons = ['2025', '2024'];
    
    for (const season of seasons) {
      const playersSnapshot = await getDocs(
        collection(db, 'players', `season_${season}`, 'players')
      );
      
      console.log(`📊 Season ${season}: ${playersSnapshot.size} players`);
      
      // Show sample player data
      if (!playersSnapshot.empty) {
        const samplePlayer = playersSnapshot.docs[0].data();
        console.log(`📋 Sample player structure:`, {
          playerId: samplePlayer.playerId,
          playerName: samplePlayer.playerName,
          team: samplePlayer.team,
          profilePicture: samplePlayer.profilePicture ? 'Yes' : 'No',
          totalConfirmedKills: samplePlayer.totalConfirmedKills,
          gunfights: samplePlayer.gunfights,
          breakshooting: samplePlayer.breakshooting,
          movement: samplePlayer.movement,
          zoneCoverage: samplePlayer.zoneCoverage,
          pressure: samplePlayer.pressure,
          trades: samplePlayer.trades,
          unclassified: samplePlayer.unclassified,
          seasonRank: samplePlayer.seasonRank,
          eventsParticipated: samplePlayer.eventsParticipated,
          eventKeys: Object.keys(samplePlayer).filter(key => 
            key.includes('_2024') || key.includes('_2025')
          )
        });
      }
    }
    
    console.log('🎉 Verification completed!');
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Run migration
migratePlayersToNewCollection()
  .then(() => verifyMigration())
  .then(() => {
    console.log('✅ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });