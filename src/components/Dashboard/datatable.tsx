import React, { useEffect, useMemo, useState } from "react";
import {
  FaUser,
  FaChevronDown,
  FaSearch,
  FaFilter,
  FaList,
  FaEthereum,
  FaDollarSign,
  FaMoon,
  FaSun,
  FaCalendar,
} from "react-icons/fa";
import { Pointer } from "../ui/cursor";
import { FaSort, FaSortDown, FaSortUp } from "react-icons/fa6";
import { getDownloadURL, getStorage, listAll, ref } from "firebase/storage";
import { Player } from "@/src/app/dashboard/pick-em/page";

type ThemeClasses = {
  bg: string;
  text: string;
  border: string;
  hover: string;
  headerBg: string;
  headerText: string;
  button: string;
  activeButton: string;
  card: string;
  progressBg: string;
};

type ColumnConfig = {
  key: string;
  header: string;
  width: string;
  sticky?: boolean;
};

type TableRow = {
  playerName: string;
  team: string;
  age: string;
  score1: number;
  [key: string]: any;
  stats: number[];
};

type MatchupTableProps = {
  data: any[];
};

const headerButtons = [
  { icon: <FaSearch /> },
  { icon: <FaFilter /> },
  { icon: <FaList /> },
];

const lightThemeClasses: ThemeClasses = {
  bg: "bg-white",
  text: "text-black",
  border: "border-gray-300",
  hover: "hover:bg-gray-100",
  headerBg: "bg-gray-100",
  headerText: "text-gray-800",
  button: "bg-gray-200 text-gray-800 hover:bg-gray-300",
  activeButton: "bg-blue-500 text-white",
  card: "bg-gray-50 border-gray-200",
  progressBg: "bg-gray-300",
};

const darkThemeClasses: ThemeClasses = {
  bg: "bg-black",
  text: "text-white",
  border: "border-white",
  hover: "hover:bg-gray-900",
  headerBg: "bg-[#212121]",
  headerText: "text-gray-300",
  button: "bg-gray-700 text-gray-100 hover:bg-gray-600",
  activeButton: "bg-blue-600 text-white",
  card: "bg-gray-800 border-gray-700",
  progressBg: "bg-gray-700",
};

const getScoreColor = (score: number): string => {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-yellow-500";
  if (score >= 20) return "bg-orange-500";
  return "bg-red-500";
};

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => {
  const barColor = getScoreColor(progress);

  return (
    <div className="w-full bg-blue-950 rounded-full h-2">
      <div
        className={`h-2 rounded-full ${barColor}`}
        style={{ width: `${progress}%` }}
      ></div>
    </div>
  );
};

const StatsChart: React.FC<{ stats: number[] }> = ({ stats }) => {
  const maxStat = Math.max(...stats);

  return (
    <svg viewBox="0 0 250 200" className="h-12 w-12">
      {stats.map((stat, i) => {
        const height = (stat / maxStat) * 140;
        const y = 200 - height - 30;

        // Inline color logic
        let fill;
        if (i === 1) fill = "#3aa76d";
        else if (i === 3) fill = "#64748b";
        else if (stat > maxStat * 0.6) fill = "#4f8af8";
        else fill = "#e6a443";

        return (
          <rect
            key={i}
            x={35 + i * 50}
            y={y}
            width="20"
            height={height}
            rx="10"
            fill={fill}
          />
        );
      })}
    </svg>
  );
};

const DiamondScore: React.FC<{
  score: number;
  inverted?: boolean;
}> = ({ score, inverted = false }) => {
  // Built-in color logic based on score value
  let color;
  if (score >= 90) color = "#3aa76d"; // Green for top scores
  else if (score <= 30) color = "#64748b"; // Gray for low scores
  else if (score > 60) color = "#4f8af8"; // Blue for above average
  else color = "#e6a443"; // Yellow/orange for mid-range

  return (
    <div className="relative h-8 w-8 flex items-center justify-center">
      <svg viewBox="0 0 30 32" className="absolute h-8 w-8">
        <path
          d="M17.6417 1.1892L26.8682 6.37754C28.501 7.29572 29.5 8.98777 29.5 10.8117V21.1883C29.5 23.0122 28.501 24.7043 26.8682 25.6225L17.6417 30.8108C16.0075 31.7297 13.9925 31.7297 12.3583 30.8108L3.13183 25.6225C1.49903 24.7043 0.5 23.0122 0.5 21.1883V10.8117C0.5 8.98777 1.49903 7.29572 3.13183 6.37754L12.3583 1.1892C13.9925 0.270267 16.0075 0.270267 17.6417 1.1892Z"
          fill={inverted ? "#000" : "#fff"}
          stroke={color}
        />
      </svg>
      <span
        className={`relative z-10 font-bold ${
          inverted ? "text-white" : "text-black"
        }`}
      >
        {score}
      </span>
    </div>
  );
};
type SortConfig = {
  key: string;
  direction: "ascending" | "descending";
};

export const MatchupTable: React.FC<MatchupTableProps> = ({ data }) => {
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const themeClasses = darkMode ? darkThemeClasses : lightThemeClasses;
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<string>("All");
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [paginatedData, setPaginatedData] = useState<Player[]>([]);
  const [VisibleData, setVisibleData] = useState<Player[]>([]);

  // Get unique teams for filter
  // Get unique teams for filter
  const teams = useMemo(() => {
    const uniqueTeams = new Set(data.map((item) => item.Team));
    return ["All", ...Array.from(uniqueTeams).sort()];
  }, [data]);

  // Filter and sort data
  const filteredData = useMemo(() => {
    let filtered = [...data];

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.Player.toLowerCase().includes(term) ||
          item.Team.toLowerCase().includes(term) ||
          item.Number.toString().includes(term)
      );
    }

    // Apply team filter
    if (selectedTeam !== "All") {
      filtered = filtered.filter((item) => item.Team === selectedTeam);
    }

    // Apply sorting
    if (sortConfig !== null) {
      filtered.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortConfig.direction === "ascending"
            ? aValue - bValue
            : bValue - aValue;
        } else {
          return sortConfig.direction === "ascending"
            ? String(aValue).localeCompare(String(bValue))
            : String(bValue).localeCompare(String(aValue));
        }
      });
    }

    return filtered;
  }, [data, searchTerm, selectedTeam, sortConfig]);

  // Update pagination when filteredData changes
  useEffect(() => {
    const newTotalPages = Math.ceil(filteredData.length / rowsPerPage);
    setTotalPages(newTotalPages);
    setCurrentPage((prevPage) => Math.min(prevPage, newTotalPages || 1));
  }, [filteredData, rowsPerPage]);

  // Update paginated data when currentPage or filteredData changes
  useEffect(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const newPaginatedData = filteredData.slice(startIndex, endIndex);
    setPaginatedData(newPaginatedData);
    fetchPlayersWithPictures(newPaginatedData);
  }, [currentPage, rowsPerPage, filteredData]);

  const requestSort = (key: string) => {
    let direction: "ascending" | "descending" = "ascending";
    if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === "ascending"
    ) {
      direction = "descending";
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <FaSort className="ml-1" />;
    }
    return sortConfig.direction === "ascending" ? (
      <FaSortUp className="ml-1" />
    ) : (
      <FaSortDown className="ml-1" />
    );
  };
  // Extract headers dynamically from the first data object
  const headers = Object.keys(data[0] || {}).filter(
    (header) => header !== "Number"
  );

  // Calculate paginated data
  useEffect(() => {
    // Update paginated data when currentPage changes
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const newPaginatedData = data.slice(startIndex, endIndex);

    setPaginatedData(newPaginatedData);

    // Fetch pictures for new paginated data
    fetchPlayersWithPictures(newPaginatedData);
  }, [currentPage, data]);

  // Pagination handlers
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRowsPerPage(Number(e.target.value));
    setCurrentPage(1); // Reset to first page when changing rows per page
  };

  useEffect(() => {
    setTotalPages(Math.ceil(data.length / rowsPerPage));
    // Reset to first page when data changes
    setCurrentPage(1);
  }, [data, rowsPerPage]);
  const fetchPlayerPicture = async (leagueId: string): Promise<string> => {
    const storage = getStorage();
    const folderPath = `players/`;
    const storageRef = ref(storage, folderPath);

    try {
      const fileList = await listAll(storageRef);
      const matchingFile = fileList.items.find(
        (item) =>
          item.name.startsWith(`${leagueId}_`) ||
          item.name.startsWith(`${leagueId}-`)
      );
      return matchingFile
        ? await getDownloadURL(matchingFile)
        : "/placeholder.svg";
    } catch (error) {
      console.error(`Error fetching picture for ${leagueId}:`, error);
      return "/placeholder.svg";
    }
  };

  const loadPlayerImages = async (players: Player[]) => {
    const updatedPlayers = [...players];

    await Promise.allSettled(
      updatedPlayers.map(async (player) => {
        try {
          const picture = await fetchPlayerPicture(player.league_id);
          player.picture = picture;
          player.pictureLoading = false;
        } catch (error) {
          player.picture = "/placeholder.svg";
          player.pictureLoading = false;
        }
      })
    );

    setVisibleData(updatedPlayers);
  };

  const fetchPlayersWithPictures = async (players: Player[]) => {
    // Set initial state with placeholders
    const playersWithPlaceholders = players.map((player) => ({
      ...player,
      picture: "/placeholder.svg",
      pictureLoading: true,
    }));
    setVisibleData(playersWithPlaceholders);

    // Load actual images in background
    loadPlayerImages(players);
    return playersWithPlaceholders;
  };

  return (
    <div className={`md:m-6 m-1`}>
      {/* Filters */}
      <div
        className={`flex md:flex-row flex-col gap-4 items-center justify-between p-2 `}
      >
        <div className="flex flex-row gap-2">
          <div className="flex flex-wrap gap-2 items-center ">
            {/* Search Input */}
            <div className={`relative ${themeClasses.bg} rounded-lg`}>
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaSearch
                  className={darkMode ? "text-gray-400" : "text-gray-500"}
                />
              </div>
              <input
                type="text"
                placeholder="Search player, team, number..."
                className={`pl-10 pr-4 py-2 rounded-lg ${themeClasses.bg} ${themeClasses.text} ${themeClasses.border} border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Team Filter */}
            <select
              className={`px-1 py-2 mx-1 justify-center rounded-lg shadow-sm ${themeClasses.bg} ${themeClasses.text} ${themeClasses.border} border focus:outline-none focus:ring-2 focus:ring-blue-500`}
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
            >
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center ">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-full ${themeClasses.button}`}
            >
              {darkMode ? <FaSun /> : <FaMoon />}
            </button>
          </div>
        </div>
        <div className="flex flex-row items-center justify-end m-auto gap-2">
          <span className="text-xs text-gray-300">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded-md bg-gray-800 text-white disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded-md bg-gray-800 text-white disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Table Body */}
      <div
        className={`overflow-x-auto ${themeClasses.card} rounded-lg overflow-hidden shadow-[0_0_0_0.3px_#fff] `}
      >
        <table className="w-full">
          <thead>
            <tr
              className={`shadow-[0_0_0_0.2px] shadow-white ${themeClasses.headerBg}`}
            >
              {/* Player Column */}
              <th
                className={`md:md:px-4 px-2 md:border-0 border-r md:py-3 text-left text-xs ${themeClasses.headerBg}  font-medium font-azonix ${themeClasses.headerText} uppercase tracking-wider sticky left-0 z-20`}
              >
                <div
                  className="flex items-center cursor-pointer"
                  onClick={() => requestSort("Player")}
                >
                  Player
                  {getSortIcon("Player")}
                </div>
              </th>
              {/* Rank Column */}
              <th
                className={`md:px-4 p-1 md:py-3 text-left text-xs ${themeClasses.headerBg} font-medium font-azonix ${themeClasses.headerText} uppercase tracking-wider  md:border-r border-b border-white/20 z-20`}
              >
                <div
                  className="flex items-center cursor-pointer"
                  onClick={() => requestSort("Rank")}
                >
                  Rank
                  {getSortIcon("Rank")}
                </div>
              </th>

              {/* Dynamic Stats Columns */}
              {Object.keys(data[0] || {})
                .filter(
                  (key) =>
                    ![
                      "id",
                      "cost",
                      "Player",
                      "Rank",
                      "Team",
                      "player_id",
                      "league_id",
                      "Number",
                      "team_id",
                      "picture",
                      "pictureLoading",
                    ].includes(key) // Exclude specific keys
                )
                .map((key, index) => (
                  <th
                    key={index}
                    className={`md:px-4 p-1 md:py-3 text-left text-xs  font-medium font-azonix ${themeClasses.headerText} uppercase tracking-wider`}
                  >
                    <div
                      className="flex items-center cursor-pointer"
                      onClick={() => requestSort(key)}
                    >
                      {key.replace(/_/g, " ")}
                      {getSortIcon(key)}
                    </div>
                  </th>
                ))}
            </tr>
          </thead>
          <tbody className={`divide-y ${themeClasses.border}`}>
            {paginatedData.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={`${themeClasses.hover} ${themeClasses.bg} ${themeClasses.text} `}
              >
                {/* Player Column */}
                <td
                  className={`md:px-4 p-1 md:py-3 whitespace-nowrap  md:border-0 border-r border-white/80 inset-0  sticky left-0 z-20 ${themeClasses.bg}`}
                >
                  <div className="flex items-center">
                    <div className="flex-shrink-0 md:h-14 md:w-14 h-10 w-10 flex items-center justify-center rounded-full overflow-hidden bg-gray-600 md:mr-4 mr-1 relative">
                      {/* Loading state */}
                      {row.pictureLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-200 animate-pulse">
                          <svg
                            className="h-5 w-5 text-gray-400 animate-spin"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                        </div>
                      )}

                      {/* Actual image */}
                      <img
                        src={row.picture || "/placeholder.svg"}
                        alt={row.Player}
                        loading="lazy"
                        className={`w-full h-full object-cover transition-opacity duration-200 ${
                          row.pictureLoading ? "opacity-0" : "opacity-100"
                        }`}
                        onLoad={() => {
                          // This will be handled by the parent component's state management
                        }}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = "/placeholder.svg";
                          target.classList.remove("opacity-0");
                          target.classList.add("opacity-100");
                          // You might want to update the state here if needed
                        }}
                      />

                      {/* Fallback icon if no picture */}
                      {!row.picture && !row.pictureLoading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <FaUser className="text-gray-900 text-3xl" />
                        </div>
                      )}
                    </div>

                    <div className="max-w-[35vw] whitespace-normal">
                      <div
                        className={`md:text-xs text-[12px] font-azonix font-medium ${
                          darkMode ? "text-white" : "text-black"
                        } flex whitespace-normal`}
                      >
                        {row.Player}
                      </div>
                      <div
                        className={`md:text-xs text-[10px]  font-azonix ${
                          darkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        {row.Team}
                      </div>
                    </div>
                  </div>
                </td>
                {/* Rank Column */}
                <td
                  className={`md:px-4 p-1 md:py-3 whitespace-nowrap md:border-r border-white/80 px-1 z-10 ${themeClasses.bg}`}
                >
                  <div className="text-center text-xs font-azonix font-medium">
                    {row.Rank}
                  </div>
                </td>

                {/* Score Columns */}
                {/* <td className="px-3 md:py-3  whitespace-nowrap">
                  <div className="flex flex-col gap-2 items-center">
                    <DiamondScore score={row.} inverted />
                    <div className="ml-1 w-16">
                      <div
                        className={`text-xs ${
                          darkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      ></div>
                      <ProgressBar progress={row.score1} />
                    </div>
                  </div>
                </td> */}
                {/* Stats Columns */}
                {Object.entries(row)
                  .filter(([key]) => {
                    const excludedKeys = [
                      "id",
                      "cost",
                      "Player",
                      "Rank",
                      "Team",
                      "player_id",
                      "league_id",
                      "Number",
                      "team_id",
                      "picture",
                      "pictureLoading",
                    ]; // Keys to exclude
                    return !excludedKeys.includes(key);
                  })
                  .map(([key, value]) => (
                    <td
                      key={key} // Use key instead of index for better stability
                      className={`px-2 py-3 whitespace-nowrap text-xs text-center ${
                        darkMode ? "text-gray-300" : "text-gray-500"
                      }`}
                    >
                      {value as React.ReactNode}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-300">Rows per page:</span>
          <select
            value={rowsPerPage}
            onChange={handleRowsPerPageChange}
            className="bg-gray-800 text-white text-xs rounded-md px-2 py-1"
          >
            {[10, 20, 30, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-300">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded-md bg-gray-800 text-white disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded-md bg-gray-800 text-white disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
