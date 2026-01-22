// Season Totals Component for Statistics Page
"use client";

import { useState, useEffect } from "react";
import { db } from "@/src/lib/firebaseClient";
import { collection, getDocs, orderBy, query, limit } from "firebase/firestore";
import { motion } from "framer-motion";

interface SeasonPlayer {
  playerId: string;
  playerName: string;
  team: string;
  seasonRank: number;
  totalConfirmedKills: number;
  eventsParticipated: number;
  
  // Event-wise data (dynamic keys)
  atlantic_city_2025?: { confirmedKills: number; eventRank: number; eventStatus: string };
  world_cup_2025?: { confirmedKills: number; eventRank: number; eventStatus: string };
  lonestar_open_2025?: { confirmedKills: number; eventRank: number; eventStatus: string };
  midwest_open_2025?: { confirmedKills: number; eventRank: number; eventStatus: string };
  tampa_bay_2025?: { confirmedKills: number; eventRank: number; eventStatus: string };
  
  // Season totals
  gunfights?: number;
  breakshooting?: number;
  movement?: number;
  zoneCoverage?: number;
  pressure?: number;
  trades?: number;
  unclassified?: number;
}

interface SeasonTotalsProps {
  selectedYear: string;
}

export default function SeasonTotals({ selectedYear }: SeasonTotalsProps) {
  const [seasonPlayers, setSeasonPlayers] = useState<SeasonPlayer[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Event names mapping for display
  const eventDisplayNames = {
    world_cup_2025: "World Cup",
    lonestar_open_2025: "Lone Star Open", 
    midwest_open_2025: "Mid West Open",
    atlantic_city_2025: "Atlantic City Open",
    tampa_bay_2025: "Tampa Bay Open"
  };

  // Fetch season data
  useEffect(() => {
    const fetchSeasonData = async () => {
      if (selectedYear === "All") return;
      
      setLoading(true);
      setError(null);
      
      try {
        console.log(`Fetching season data for: ${selectedYear}`);
        
        const seasonPlayersQuery = query(
          collection(db, `players/season_${selectedYear}/players`),
          orderBy("seasonRank"),
          limit(50) // Top 50 players
        );
        
        const querySnapshot = await getDocs(seasonPlayersQuery);
        
        if (querySnapshot.empty) {
          setError(`No season data found for ${selectedYear}`);
          setSeasonPlayers([]);
          return;
        }
        
        const players: SeasonPlayer[] = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            playerId: data.playerId || doc.id,
            playerName: data.playerName || 'Unknown Player',
            team: data.team || 'Unknown Team',
            seasonRank: data.seasonRank || 999,
            totalConfirmedKills: data.totalConfirmedKills || 0,
            eventsParticipated: data.eventsParticipated || 0,
            
            // Event data
            atlantic_city_2025: data.atlantic_city_2025,
            world_cup_2025: data.world_cup_2025,
            lonestar_open_2025: data.lonestar_open_2025,
            midwest_open_2025: data.midwest_open_2025,
            tampa_bay_2025: data.tampa_bay_2025,
            
            // Season totals (if available)
            gunfights: data.gunfights || 0,
            breakshooting: data.breakshooting || 0,
            movement: data.movement || 0,
            zoneCoverage: data.zoneCoverage || 0,
            pressure: data.pressure || 0,
            trades: data.trades || 0,
            unclassified: data.unclassified || 0
          };
        });
        
        setSeasonPlayers(players);
        console.log(`Loaded ${players.length} season players`);
        
      } catch (error) {
        console.error("Error fetching season data:", error);
        setError("Failed to load season data");
      } finally {
        setLoading(false);
      }
    };

    fetchSeasonData();
  }, [selectedYear]);

  // Don't show for "All" year selection
  if (selectedYear === "All") {
    return null;
  }

  return (
    <motion.div 
      className="bg-gray-900/90 backdrop-blur-sm rounded-xl p-6 mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-white font-azonix">
          {selectedYear} Season Totals
        </h2>
        <div className="text-sm text-gray-400">
          {seasonPlayers.length} Players
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
          <span className="ml-3 text-white">Loading season data...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-4">
          <p className="text-red-200">{error}</p>
        </div>
      )}

      {/* Season Table */}
      {!loading && !error && seasonPlayers.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-white">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-3 px-2 font-semibold">Rank</th>
                <th className="text-left py-3 px-2 font-semibold">Player</th>
                <th className="text-left py-3 px-2 font-semibold">Team</th>
                <th className="text-center py-3 px-2 font-semibold">Total Kills</th>
                
                {/* Event Columns */}
                {selectedYear === "2025" && (
                  <>
                    <th className="text-center py-3 px-2 font-semibold">World Cup</th>
                    <th className="text-center py-3 px-2 font-semibold">Lone Star</th>
                    <th className="text-center py-3 px-2 font-semibold">Mid West</th>
                    <th className="text-center py-3 px-2 font-semibold">Atlantic City</th>
                    <th className="text-center py-3 px-2 font-semibold">Tampa Bay</th>
                  </>
                )}
                
                {/* Category Totals */}
                <th className="text-center py-3 px-2 font-semibold">Gunfights</th>
                <th className="text-center py-3 px-2 font-semibold">Breakshooting</th>
                <th className="text-center py-3 px-2 font-semibold">Movement</th>
                <th className="text-center py-3 px-2 font-semibold">Zone Coverage</th>
                <th className="text-center py-3 px-2 font-semibold">Pressure</th>
                <th className="text-center py-3 px-2 font-semibold">Trades</th>
                <th className="text-center py-3 px-2 font-semibold">Unclassified</th>
              </tr>
            </thead>
            <tbody>
              {seasonPlayers.slice(0, 3).map((player, index) => (
                <tr 
                  key={player.playerId} 
                  className={`border-b border-gray-800 hover:bg-gray-800/50 transition-colors ${
                    index < 3 ? 'bg-yellow-900/20' : ''
                  }`}
                >
                  {/* Rank */}
                  <td className="py-3 px-2">
                    <div className="flex items-center">
                      {player.seasonRank <= 3 && (
                        <span className="mr-2">
                          {player.seasonRank === 1 && "🥇"}
                          {player.seasonRank === 2 && "🥈"}
                          {player.seasonRank === 3 && "🥉"}
                        </span>
                      )}
                      <span className="font-semibold">{player.seasonRank}</span>
                    </div>
                  </td>
                  
                  {/* Player Name */}
                  <td className="py-3 px-2 font-medium">{player.playerName}</td>
                  
                  {/* Team */}
                  <td className="py-3 px-2 text-gray-300">{player.team}</td>
                  
                  {/* Total Kills */}
                  <td className="py-3 px-2 text-center font-bold text-green-400">
                    {player.totalConfirmedKills}
                  </td>
                  
                  {/* Event Kills */}
                  {selectedYear === "2025" && (
                    <>
                      <td className="py-3 px-2 text-center">
                        <span className={`${player.world_cup_2025?.eventStatus === 'live' ? 'text-red-400 animate-pulse' : ''}`}>
                          {player.world_cup_2025?.confirmedKills || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`${player.lonestar_open_2025?.eventStatus === 'live' ? 'text-red-400 animate-pulse' : ''}`}>
                          {player.lonestar_open_2025?.confirmedKills || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`${player.midwest_open_2025?.eventStatus === 'live' ? 'text-red-400 animate-pulse' : ''}`}>
                          {player.midwest_open_2025?.confirmedKills || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`${player.atlantic_city_2025?.eventStatus === 'live' ? 'text-red-400 animate-pulse' : ''}`}>
                          {player.atlantic_city_2025?.confirmedKills || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`${player.tampa_bay_2025?.eventStatus === 'live' ? 'text-red-400 animate-pulse' : ''}`}>
                          {player.tampa_bay_2025?.confirmedKills || '-'}
                        </span>
                      </td>
                    </>
                  )}
                  
                  {/* Category Totals */}
                  <td className="py-3 px-2 text-center">{player.gunfights || '-'}</td>
                  <td className="py-3 px-2 text-center">{player.breakshooting || '-'}</td>
                  <td className="py-3 px-2 text-center">{player.movement || '-'}</td>
                  <td className="py-3 px-2 text-center">{player.zoneCoverage || '-'}</td>
                  <td className="py-3 px-2 text-center">{player.pressure || '-'}</td>
                  <td className="py-3 px-2 text-center">{player.trades || '-'}</td>
                  <td className="py-3 px-2 text-center">{player.unclassified || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && seasonPlayers.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p>No season data available for {selectedYear}</p>
          <p className="text-sm mt-2">Season totals will appear here once events are completed</p>
        </div>
      )}
    </motion.div>
  );
}