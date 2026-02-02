"use client";

import { useState, useEffect, useCallback } from "react";
import { db } from "@/src/lib/firebaseClient";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { motion } from "framer-motion";
import { ProgressiveBlur } from "@/src/components/ui/progressive-blur";
import { FaSearch, FaTimes, FaChevronUp, FaChevronDown } from "react-icons/fa";

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

export default function SeasonTotalsPage() {
  const [selectedYear, setSelectedYear] = useState<string>("2025");
  const [seasonPlayers, setSeasonPlayers] = useState<SeasonPlayer[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<SeasonPlayer[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<string>('seasonRank');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const availableYears = ["2025", "2024"];
  const PAGE_SIZES = [10, 20, 50, 100];

  // Fetch season data
  useEffect(() => {
    const fetchSeasonData = async () => {
      setLoading(true);
      setError(null);
      
      try {
  
        
        const seasonPlayersQuery = query(
          collection(db, `players/season_${selectedYear}/players`),
          orderBy("seasonRank")
        );
        
        const querySnapshot = await getDocs(seasonPlayersQuery);
        
        if (querySnapshot.empty) {
          setError(`No season data found for ${selectedYear}`);
          setSeasonPlayers([]);
          setFilteredPlayers([]);
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
            
            // Season totals
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
        setFilteredPlayers(players);
     
        
      } catch (error) {
        console.error("Error fetching season data:", error);
        setError("Failed to load season data");
      } finally {
        setLoading(false);
      }
    };

    fetchSeasonData();
  }, [selectedYear]);

  // Handle search
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setPage(1);
    
    if (!value.trim()) {
      setFilteredPlayers(seasonPlayers);
      return;
    }
    
    const filtered = seasonPlayers.filter(player => 
      player.playerName.toLowerCase().includes(value.toLowerCase()) ||
      player.team.toLowerCase().includes(value.toLowerCase())
    );
    setFilteredPlayers(filtered);
  }, [seasonPlayers]);

  // Handle sorting
  const handleSort = useCallback((field: string) => {
    const newDirection = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDirection(newDirection);
    setPage(1);
    
    const dataToSort = [...filteredPlayers];
    const sorted = dataToSort.sort((a: any, b: any) => {
      const aValue = a[field];
      const bValue = b[field];
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return newDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      const aStr = String(aValue || '').toLowerCase();
      const bStr = String(bValue || '').toLowerCase();
      return newDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
    
    setFilteredPlayers(sorted);
  }, [sortField, sortDirection, filteredPlayers]);

  // Handle pagination
  const handlePageSizeChange = useCallback((newSize: number) => {
    setItemsPerPage(newSize);
    setPage(1);
  }, []);

  const totalPages = Math.ceil(filteredPlayers.length / itemsPerPage);
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPageData = filteredPlayers.slice(startIndex, endIndex);

  const handleNextPage = useCallback(() => {
    if (page < totalPages) {
      setPage(p => p + 1);
    }
  }, [page, totalPages]);

  const handlePreviousPage = useCallback(() => {
    if (page > 1) {
      setPage(p => p - 1);
    }
  }, [page]);

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setPage(1);
    setFilteredPlayers(seasonPlayers);
  }, [seasonPlayers]);

  return (
    <div className="relative left-0 flex flex-col w-auto scroll-smooth overflow-y-scroll font-inter pb-20">
      {/* Header */}
      <section>
        <header className="flex relative flex-col items-start px-6 pt-32 w-full text-8xl leading-none text-white min-h-[250px] max-md:px-5 max-md:pt-24 max-md:max-w-full max-md:text-4xl">
          <div
            className="absolute inset-0 top-0 brightness-110"
            style={{
              backgroundImage: "url('/stats-center.webp')",
              backgroundSize: "cover",
              backgroundPosition: "0 40%",
              backgroundRepeat: "no-repeat",
            }}
          />
          <div className="absolute inset-0 shadow-black shadow-[inset_0px_4px_50px_0px_] pointer-events-none"></div>
          <ProgressiveBlur
            className="pointer-events-none absolute bottom-0 left-0 h-[50%] w-full"
            blurIntensity={1}
          />
          <div className="absolute inset-0 bg-black/45 pointer-events-none"></div>

          <h1 className="relative font-azonix max-w-full m-auto md:text-7xl text-4xl">
            Season Totals
          </h1>
        </header>

        {/* Year Selector */}
        <div className="flex justify-center px-4 mt-6">
          <div className="flex gap-4 justify-center">
            {availableYears.map((year) => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-8 py-3 rounded-xl text-lg font-bold font-azonix transition-all duration-300 ${
                  selectedYear === year
                    ? "bg-white text-black shadow-lg transform scale-105"
                    : "bg-gray-800 text-white hover:bg-gray-700"
                }`}
              >
                {year} Season
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Season Stats Card */}
      <motion.div 
        className="mx-4 mt-8 bg-gray-900/95 backdrop-blur-sm rounded-2xl p-6 shadow-2xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Card Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold text-white font-azonix">
              {selectedYear} Season Leaders
            </h2>
            <p className="text-gray-400 mt-1">
              Top performers across all events
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-green-400">
              {filteredPlayers.length}
            </div>
            <div className="text-sm text-gray-400">Players</div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <FaSearch className="text-gray-400 text-sm" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search players or teams..."
            className="w-full pl-10 pr-10 py-3 text-sm bg-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              <FaTimes className="text-gray-400 hover:text-white text-sm" />
            </button>
          )}
        </div>
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            <span className="ml-4 text-white text-lg">Loading season data...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-xl p-6 mb-6">
            <p className="text-red-200 text-lg">{error}</p>
          </div>
        )}

        {/* Season Table */}
        {!loading && !error && currentPageData.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-white">
              <thead>
                <tr className="border-b-2 border-gray-700">
                  <th 
                    className="text-left py-4 px-3 font-bold text-lg cursor-pointer hover:bg-gray-700/50 transition-colors"
                    onClick={() => handleSort('seasonRank')}
                  >
                    <div className="flex items-center">
                      Rank
                      {sortField === 'seasonRank' && (
                        sortDirection === 'asc' ? <FaChevronUp className="ml-2" /> : <FaChevronDown className="ml-2" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-left py-4 px-3 font-bold text-lg cursor-pointer hover:bg-gray-700/50 transition-colors"
                    onClick={() => handleSort('playerName')}
                  >
                    <div className="flex items-center">
                      Player
                      {sortField === 'playerName' && (
                        sortDirection === 'asc' ? <FaChevronUp className="ml-2" /> : <FaChevronDown className="ml-2" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-left py-4 px-3 font-bold text-lg cursor-pointer hover:bg-gray-700/50 transition-colors"
                    onClick={() => handleSort('team')}
                  >
                    <div className="flex items-center">
                      Team
                      {sortField === 'team' && (
                        sortDirection === 'asc' ? <FaChevronUp className="ml-2" /> : <FaChevronDown className="ml-2" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-center py-4 px-3 font-bold text-lg cursor-pointer hover:bg-gray-700/50 transition-colors"
                    onClick={() => handleSort('totalConfirmedKills')}
                  >
                    <div className="flex items-center justify-center">
                      Total Kills
                      {sortField === 'totalConfirmedKills' && (
                        sortDirection === 'asc' ? <FaChevronUp className="ml-2" /> : <FaChevronDown className="ml-2" />
                      )}
                    </div>
                  </th>
                  
                  {/* Event Columns */}
                  {selectedYear === "2025" && (
                    <>
                      <th className="text-center py-4 px-3 font-bold">World Cup</th>
                      <th className="text-center py-4 px-3 font-bold">Lone Star</th>
                      <th className="text-center py-4 px-3 font-bold">Mid West</th>
                      <th className="text-center py-4 px-3 font-bold">Atlantic City</th>
                      <th className="text-center py-4 px-3 font-bold">Tampa Bay</th>
                    </>
                  )}
                  
                  {/* Category Totals */}
                  <th className="text-center py-4 px-3 font-bold">Gunfights</th>
                  <th className="text-center py-4 px-3 font-bold">Breakshooting</th>
                  <th className="text-center py-4 px-3 font-bold">Movement</th>
                  <th className="text-center py-4 px-3 font-bold">Zone Coverage</th>
                  <th className="text-center py-4 px-3 font-bold">Pressure</th>
                  <th className="text-center py-4 px-3 font-bold">Trades</th>
                  <th className="text-center py-4 px-3 font-bold">Unclassified</th>
                </tr>
              </thead>
              <tbody>
                {currentPageData.map((player, index) => (
                  <motion.tr 
                    key={player.playerId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`border-b border-gray-800 hover:bg-gray-800/50 transition-all duration-200 ${
                      player.seasonRank <= 3 ? 'bg-gradient-to-r from-yellow-900/30 to-transparent' : ''
                    }`}
                  >
                    {/* Rank */}
                    <td className="py-4 px-3">
                      <div className="flex items-center">
                        {player.seasonRank <= 3 && (
                          <span className="mr-3 text-2xl">
                            {player.seasonRank === 1 && "🥇"}
                            {player.seasonRank === 2 && "🥈"}
                            {player.seasonRank === 3 && "🥉"}
                          </span>
                        )}
                        <span className="font-bold text-lg">{player.seasonRank}</span>
                      </div>
                    </td>
                    
                    {/* Player Name */}
                    <td className="py-4 px-3 font-bold text-lg">{player.playerName}</td>
                    
                    {/* Team */}
                    <td className="py-4 px-3 text-gray-300 font-medium">{player.team}</td>
                    
                    {/* Total Kills */}
                    <td className="py-4 px-3 text-center">
                      <span className="font-bold text-xl text-green-400 bg-green-900/30 px-3 py-1 rounded-lg">
                        {player.totalConfirmedKills}
                      </span>
                    </td>
                    
                    {/* Event Kills */}
                    {selectedYear === "2025" && (
                      <>
                        <td className="py-4 px-3 text-center">
                          <span className={`font-semibold ${player.world_cup_2025?.eventStatus === 'live' ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                            {player.world_cup_2025?.confirmedKills || '-'}
                          </span>
                        </td>
                        <td className="py-4 px-3 text-center">
                          <span className={`font-semibold ${player.lonestar_open_2025?.eventStatus === 'live' ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                            {player.lonestar_open_2025?.confirmedKills || '-'}
                          </span>
                        </td>
                        <td className="py-4 px-3 text-center">
                          <span className={`font-semibold ${player.midwest_open_2025?.eventStatus === 'live' ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                            {player.midwest_open_2025?.confirmedKills || '-'}
                          </span>
                        </td>
                        <td className="py-4 px-3 text-center">
                          <span className={`font-semibold ${player.atlantic_city_2025?.eventStatus === 'live' ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                            {player.atlantic_city_2025?.confirmedKills || '-'}
                          </span>
                        </td>
                        <td className="py-4 px-3 text-center">
                          <span className={`font-semibold ${player.tampa_bay_2025?.eventStatus === 'live' ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                            {player.tampa_bay_2025?.confirmedKills || '-'}
                          </span>
                        </td>
                      </>
                    )}
                    
                    {/* Category Totals */}
                    <td className="py-4 px-3 text-center font-semibold">{player.gunfights || '-'}</td>
                    <td className="py-4 px-3 text-center font-semibold">{player.breakshooting || '-'}</td>
                    <td className="py-4 px-3 text-center font-semibold">{player.movement || '-'}</td>
                    <td className="py-4 px-3 text-center font-semibold">{player.zoneCoverage || '-'}</td>
                    <td className="py-4 px-3 text-center font-semibold">{player.pressure || '-'}</td>
                    <td className="py-4 px-3 text-center font-semibold">{player.trades || '-'}</td>
                    <td className="py-4 px-3 text-center font-semibold">{player.unclassified || '-'}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}


        {/* Empty State */}
        {!loading && !error && filteredPlayers.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <div className="text-6xl mb-4">📊</div>
            {searchQuery ? (
              <p className="text-xl mb-2">No players found matching &quot;{searchQuery}&quot;</p>
            ) : (
              <>
                <p className="text-xl mb-2">No season data available for {selectedYear}</p>
                <p className="text-sm">Season totals will appear here once events are completed</p>
              </>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}