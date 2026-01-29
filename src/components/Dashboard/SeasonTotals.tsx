// Season Totals Component for Statistics Page
"use client";

import { useState, useEffect } from "react";
import { db } from "@/src/lib/firebaseClient";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { motion } from "framer-motion";
import { MatchupTable } from "./datatable";

interface SeasonPlayer {
  playerId: string;
  playerName: string;
  team: string;
  seasonRank: number;
  totalConfirmedKills: number;
  eventsParticipated: number;
  
  // Event-wise data
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
  showTopThreeOnly?: boolean;
  sortConfig?: any;
  onSortChange?: (config: any) => void;
  currentPage?: number;
  itemsPerPage?: number;
}

export default function SeasonTotals({ 
  selectedYear, 
  showTopThreeOnly = false,
  sortConfig,
  onSortChange,
  currentPage = 1,
  itemsPerPage = 25
}: SeasonTotalsProps) {
  const [seasonPlayers, setSeasonPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch season data
  useEffect(() => {
    const fetchSeasonData = async () => {
      if (selectedYear === "All") return;
      
      setLoading(true);
      setError(null);
      
      try {
        const seasonPlayersQuery = query(
          collection(db, `players/season_${selectedYear}/players`),
          orderBy('seasonRank')
        );
        
        const querySnapshot = await getDocs(seasonPlayersQuery);
        
        if (querySnapshot.empty) {
          setError(`No season data found for ${selectedYear}`);
          setSeasonPlayers([]);
          return;
        }
        
        const players: any[] = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          console.log('Raw season data:', data);
          
          // Create base player object
          const player: any = {
            player_id: data.playerId || doc.id,
            Rank: data.seasonRank || 999,
            Player: data.playerName || 'Unknown Player',
            Team: data.team || 'Unknown Team',
            "Confirmed Kills": data.totalConfirmedKills || 0,
            Number: data.playerNumber || '',
            Gunfights: data.gunfights || 0,
            Breakshooting: data.breakshooting || 0,
            Movement: data.movement || 0,
            "Zone Coverage": data.zoneCoverage || 0,
            Pressure: data.pressure || 0,
            Trades: data.trades || 0,
            Unclassified: data.unclassified || 0,
            picture: '/placeholder.svg'
          };
          
          console.log('Transformed player:', player);
          return player;
        });
        
        console.log('All season players:', players);
        
        // Apply sorting if sortConfig exists
        if (sortConfig) {
          players.sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];

            if (typeof aValue === "number" && typeof bValue === "number") {
              return sortConfig.direction === "ascending"
                ? aValue - bValue
                : bValue - aValue;
            }

            return sortConfig.direction === "ascending"
              ? String(aValue).localeCompare(String(bValue))
              : String(bValue).localeCompare(String(aValue));
          });
        }
        
        // If showTopThreeOnly is true, limit to top 3
        const displayPlayers = showTopThreeOnly ? players.slice(0, 3) : players;
        
        setSeasonPlayers(displayPlayers);
        
      } catch (error) {
        console.error("Error fetching season data:", error);
        setError("Failed to load season data");
      } finally {
        setLoading(false);
      }
    };

    fetchSeasonData();
  }, [selectedYear, showTopThreeOnly, sortConfig]);

  // Don't show for "All" year selection
  if (selectedYear === "All") {
    return null;
  }

  return (
    <div>
      {/* Simple top 3 display for Statistics page */}
      {showTopThreeOnly ? (
        <div className="space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
              <span className="ml-3 text-white">Loading...</span>
            </div>
          )}
          
          {error && (
            <div className="bg-red-900/50 border border-red-500 rounded-lg p-4">
              <p className="text-red-200">{error}</p>
            </div>
          )}
          
          {!loading && !error && seasonPlayers.length > 0 && (
            seasonPlayers.map((player, index) => (
              <div key={player.playerId} className="bg-gray-800/50 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex items-center mr-4">
                    {player.seasonRank <= 3 && (
                      <span className="mr-2 text-xl">
                        {player.seasonRank === 1 && "🥇"}
                        {player.seasonRank === 2 && "🥈"}
                        {player.seasonRank === 3 && "🥉"}
                      </span>
                    )}
                    <span className="font-bold text-lg text-white">#{player.seasonRank}</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-white">{player.playerName}</h4>
                    <p className="text-sm text-gray-400">{player.team}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg text-green-400">{player.totalConfirmedKills}</div>
                  <div className="text-xs text-gray-400">Total Kills</div>
                </div>
              </div>
            ))
          )}
          
          {!loading && !error && seasonPlayers.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <p>No season data available for {selectedYear}</p>
            </div>
          )}
        </div>
      ) : (
        /* Full season table using MatchupTable */
        <div>
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
              <span className="ml-3 text-white">Loading...</span>
            </div>
          )}
          
          {error && (
            <div className="bg-red-900/50 border border-red-500 rounded-lg p-4">
              <p className="text-red-200">{error}</p>
            </div>
          )}
          
          {!loading && !error && seasonPlayers.length > 0 && (
            <MatchupTable
              data={seasonPlayers}
              sortConfig={sortConfig}
              onSortChange={onSortChange}
              myPicks={new Set()}
            />
          )}
          
          {!loading && !error && seasonPlayers.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <p>No season data available for {selectedYear}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}