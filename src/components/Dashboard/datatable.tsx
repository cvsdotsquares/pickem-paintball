import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaUser,
  FaSearch,
  FaFilter,
  FaList,
  FaMoon,
  FaSun,
  FaTimes,
} from "react-icons/fa";
import {
  FaAngleLeft,
  FaAngleRight,
  FaSort,
  FaSortDown,
  FaSortUp,
  FaUserCheck,
} from "react-icons/fa6";
import { getDownloadURL, getStorage, listAll, ref } from "firebase/storage";
import { useScroll, useTransform, motion } from "framer-motion";
import { useTheme } from "../../contexts/ThemeContext";
import { getFirebaseStorageUrl } from "../../lib/storage";

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

const headerButtons = [
  { icon: <FaSearch /> },
  { icon: <FaFilter /> },
  { icon: <FaList /> },
];

/** Columns rendered as fixed # / Player cells; remainder follow `headers` order */
const FIXED_IDENTITY_DISPLAY_KEYS = new Set([
  "Rank",
  "Player",
  "Team",
  "Number",
]);

const lightThemeClasses: ThemeClasses = {
  bg: "bg-white", // Changed from bg-gray-100 to bg-white
  text: "text-gray-900", // Darker text for better readability
  border: "border-gray-300",
  hover: "hover:bg-gray-100", // Light hover effect
  headerBg: "bg-gray-200",
  headerText: "text-gray-900", // Darker header text
  button: "bg-gray-300 text-gray-900 hover:bg-gray-400", // Darker button text
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
  if (score >= 90)
    color = "#3aa76d"; // Green for top scores
  else if (score <= 30)
    color = "#64748b"; // Gray for low scores
  else if (score > 60)
    color = "#4f8af8"; // Blue for above average
  else color = "#e6a443"; // Yellow/orange for mid-range

  return (
    <div className="relative h-6 w-6 flex items-center justify-center">
      <svg viewBox="0 0 30 32" className="absolute h-6 w-6">
        <path
          d="M17.6417 1.1892L26.8682 6.37754C28.501 7.29572 29.5 8.98777 29.5 10.8117V21.1883C29.5 23.0122 28.501 24.7043 26.8682 25.6225L17.6417 30.8108C16.0075 31.7297 13.9925 31.7297 12.3583 30.8108L3.13183 25.6225C1.49903 24.7043 0.5 23.0122 0.5 21.1883V10.8117C0.5 8.98777 1.49903 7.29572 3.13183 6.37754L12.3583 1.1892C13.9925 0.270267 16.0075 0.270267 17.6417 1.1892Z"
          fill={inverted ? "#000" : "#fff"}
          stroke={color}
        />
      </svg>
      <span
        className={`relative z-10 font-bold ${inverted ? "text-white" : "text-black"
          }`}
      >
        {score}
      </span>
    </div>
  );
};
interface SortConfig {
  key: string;
  direction: "ascending" | "descending";
}
// Update your MatchupTable props
type MatchupTableProps = {
  data: any[];
  sortConfig?: SortConfig | null;
  onSortChange?: (config: SortConfig | null) => void;
  myPicks?: Set<string>;
  currentEventId?: string; // Add this
  isSeasonView?: boolean; // Add this to identify season totals view
  /** Season view: event column keys, most recent first (matches stats page event order) */
  seasonEventColumnOrder?: string[];
};
export interface Player {
  id?: string;
  player_id: string;
  league_id?: string;
  team_id?: string;
  Rank: number;
  Player: string;
  Team: string;
  Number: number;
  "Confirmed Kills"?: number;
  Gunfights?: number;
  Breakshooting?: number;
  Movement?: number;
  "Zone Coverage"?: number;
  Pressure?: number;
  Trades?: number;
  Unclassified?: number;
  picture?: string;
  pictureLoading?: boolean;
  img_url?: string; // New field for direct image URL
  [key: string]: any; // Add index signature to allow dynamic access
}
type TablePlayer = Player & {
  [key: string]: any;
};

export const MatchupTable: React.FC<MatchupTableProps> = ({
  data,
  sortConfig: propSortConfig,
  onSortChange,
  myPicks,
  currentEventId,
  isSeasonView = false,
  seasonEventColumnOrder = [],
}) => {
  const typedData = data as TablePlayer[];
  const [internalSortConfig, setInternalSortConfig] =
    useState<SortConfig | null>(null);
  const sortConfig =
    propSortConfig !== undefined ? propSortConfig : internalSortConfig;
  const setSortConfig = onSortChange || setInternalSortConfig;
  const { theme, toggleTheme } = useTheme();
  const darkMode = theme === 'dark';
  const themeClasses = darkMode ? darkThemeClasses : lightThemeClasses;
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<string>("All");
  const [showOnlyMyPicks, setShowOnlyMyPicks] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageInput, setCurrentPageInput] = useState(
    currentPage.toString(),
  );
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [paginatedData, setPaginatedData] = useState<Player[]>([]);
  const [VisibleData, setVisibleData] = useState<Player[]>([]);
  const tableRef = useRef(null);
  const { scrollYProgress } = useScroll({ container: tableRef });

  // Map scroll progress to opacity values
  const opacity = useTransform(scrollYProgress, [0.5, 1], [1, 0]);
  useEffect(() => {
    setCurrentPageInput(currentPage.toString());
  }, [currentPage]);

  // Reset "My Picks" toggle when switching events
  useEffect(() => {
    setShowOnlyMyPicks(false);
  }, [currentEventId]);

  // Season totals view has no event picks; avoid leaving "My Picks" on from a prior event
  useEffect(() => {
    if (isSeasonView) setShowOnlyMyPicks(false);
  }, [isSeasonView]);

  // Get unique teams for filter
  const teams = useMemo(() => {
    const uniqueTeams = new Set(data.map((item) => item.Team));
    return ["All", ...Array.from(uniqueTeams).sort()];
  }, [data]);

  // Add this state at the top with your other state declarations
  const [isDataLoading, setIsDataLoading] = useState(false);

  // Add this useEffect to handle data loading state
  useEffect(() => {
    setIsDataLoading(true);
    const timer = setTimeout(() => {
      setIsDataLoading(false);
    }, 100); // Small delay to ensure data is fully processed

    return () => clearTimeout(timer);
  }, [data]); // Trigger when data prop changes

  // Replace your existing filteredData useMemo with this:
  const filteredData = useMemo(() => {
    // Only blank the table when we truly have no rows yet (avoid hiding season/event data during brief load flag)
    if (isDataLoading && typedData.length === 0) return [];

    let filtered = [...typedData];

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (player) =>
          player.Player?.toLowerCase().includes(searchLower) ||
          player.Team?.toLowerCase().includes(searchLower) ||
          player.Number?.toString().includes(searchTerm),
      );
    }

    // Apply team filter
    if (selectedTeam !== "All") {
      filtered = filtered.filter((player) => player.Team === selectedTeam);
    }

    // Apply myPicks filter if enabled
    if (showOnlyMyPicks && myPicks && myPicks.size > 0) {
      const myPicksNormalized = new Set<string>();
      myPicks.forEach((v) => myPicksNormalized.add(String(v)));

      filtered = filtered.filter((player) =>
        myPicksNormalized.has(String(player.player_id)),
      );
    }

    // Apply sorting if sortConfig exists
    if (sortConfig) {
      filtered.sort((a, b) => {
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

    return filtered;
  }, [
    typedData,
    showOnlyMyPicks,
    myPicks,
    sortConfig,
    searchTerm,
    selectedTeam,
    isDataLoading, // Add this dependency
  ]);

  // Reset pagination when search or team filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTeam, showOnlyMyPicks]);

  // Add this useEffect to ensure pagination updates after filtering
  useEffect(() => {
    if (!isDataLoading) {
      const startIndex = (currentPage - 1) * rowsPerPage;
      const endIndex = startIndex + rowsPerPage;
      const newPaginatedData = filteredData.slice(startIndex, endIndex);
      setPaginatedData(newPaginatedData);
      fetchPlayersWithPictures(newPaginatedData);
    }
  }, [currentPage, rowsPerPage, filteredData, isDataLoading]);

  // Sync VisibleData with paginatedData when no pictures are being loaded
  useEffect(() => {
    if (paginatedData.length > 0 && VisibleData.length === 0) {
      setVisibleData(paginatedData);
    }
  }, [paginatedData]);
  // Add these utility functions at the top of your file
  const normalizeHeaderKey = (key: string): string => {
    const headerMap: Record<string, string> = {
      rank: "Rank",
      player: "Player",
      team: "Team",
      number: "Number",
      confirmedkills: "Confirmed Kills",
      gunfights: "Gunfights",
      breakshooting: "Breakshooting",
      movement: "Movement",
      zonecoverage: "Zone Coverage",
      pressure: "Pressure",
      trades: "Trades",
      unclassified: "Unclassified",
    };

    const lowerKey = key.toLowerCase().replace(/[\s_]/g, "");
    return headerMap[lowerKey] || key;
  };

  const getActualDataKey = (keys: string[], displayText: string): string => {
    const normalizedDisplay = normalizeHeaderKey(displayText);
    return (
      keys.find((key) => normalizeHeaderKey(key) === normalizedDisplay) ||
      displayText
    );
  };
  // Columns that sort ascending on first click (name/rank); all others sort descending first
  const ascendingFirstColumns = new Set(["Rank", "Player"]);

  // Update requestSort to use normalized keys with a 3-state cycle:
  // Ascending-first columns: ascending → descending → null (reset to default)
  // Descending-first columns: descending → ascending → null (reset to default)
  const requestSort = (displayText: string) => {
    const normalizedDisplay = normalizeHeaderKey(displayText);
    const actualKey = getActualDataKey(
      Object.keys(data[0] || {}),
      normalizedDisplay,
    );

    const isAscendingFirst = ascendingFirstColumns.has(normalizedDisplay);

    if (sortConfig?.key === actualKey) {
      if (isAscendingFirst) {
        // ascending → descending → null
        if (sortConfig.direction === "ascending") {
          setSortConfig({ key: actualKey, direction: "descending" });
        } else {
          setSortConfig(null);
        }
      } else {
        // descending → ascending → null
        if (sortConfig.direction === "descending") {
          setSortConfig({ key: actualKey, direction: "ascending" });
        } else {
          setSortConfig(null);
        }
      }
    } else {
      // New column — start with default direction for that column type
      setSortConfig({ key: actualKey, direction: isAscendingFirst ? "ascending" : "descending" });
    }
  };

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
    setTotalPages(Math.ceil(filteredData.length / rowsPerPage));
  }, [filteredData, rowsPerPage]);
  const fetchPlayerPicture = async (leagueId: string): Promise<string> => {
    const storage = getStorage();
    const folderPath = `players/`;
    const storageRef = ref(storage, folderPath);

    try {
      const fileList = await listAll(storageRef);
      const matchingFile = fileList.items.find(
        (item) =>
          item.name.startsWith(`${leagueId}_`) ||
          item.name.startsWith(`${leagueId}-`),
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
    // Fetch all images first
    const imageResults = await Promise.allSettled(
      players.map(async (player) => {
        try {
          if (player.img_url && player.img_url.trim() !== "") {
            return { player_id: player.player_id, picture: player.img_url };
          } else {
            const picture = await fetchPlayerPicture(
              player.league_id ? player.league_id : "",
            );
            return { player_id: player.player_id, picture };
          }
        } catch (error) {
          return { player_id: player.player_id, picture: "/placeholder.svg" };
        }
      }),
    );

    // Use functional update to always work on current state (not a stale snapshot)
    setVisibleData((prev) => prev.map((p) => {
      const result = imageResults.find(
        (r) => r.status === "fulfilled" && r.value.player_id === p.player_id
      );
      if (result && result.status === "fulfilled") {
        return { ...p, picture: result.value.picture, pictureLoading: false };
      }
      return p;
    }));
  };
  const getCellValue = (player: TablePlayer, key: string): React.ReactNode => {
    switch (key) {
      case "Rank":
        return player.Rank;
      case "Player":
        return player.Player;
      case "Team":
        return player.Team;
      case "Number":
        return player.Number;
      case "Confirmed Kills":
        return player["Confirmed Kills"];
      case "Gunfights":
        return player.Gunfights;
      case "Breakshooting":
        return player.Breakshooting;
      case "Movement":
        return player.Movement;
      case "Zone Coverage":
        return player["Zone Coverage"];
      case "Pressure":
        return player.Pressure;
      case "Trades":
        return player.Trades;
      case "Unclassified":
        return player.Unclassified;
      default:
        return player[key as keyof TablePlayer];
    }
  };
  const fetchPlayersWithPictures = async (players: Player[]) => {
    // Set initial state with placeholders or img_url if available
    const playersWithPlaceholders = players.map((player) => ({
      ...player,
      picture:
        player.img_url && player.img_url.trim() !== ""
          ? player.img_url
          : player.profilePicture
            ? getFirebaseStorageUrl(player.profilePicture)
            : "/placeholder.svg",
      pictureLoading: false, // Don't show loading for direct URLs
    }));
    setVisibleData(playersWithPlaceholders);

    // Only load images from Firebase Storage for players without img_url or profilePicture
    const playersNeedingFirebaseImages = players.filter(
      (player) => (!player.img_url || player.img_url.trim() === "") && !player.profilePicture
    );

    if (playersNeedingFirebaseImages.length > 0) {
      loadPlayerImages(playersNeedingFirebaseImages);
    }

    return playersWithPlaceholders;
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
  // Update the headers mapping to ensure proper column display
  const headers = useMemo(() => {
    const keys = Object.keys(data[0] || {});

    const excludedKeys = new Set(
      [
        "id",
        "cost",
        "player_id",
        "league_id",
        "team_id",
        "picture",
        "pictureLoading",
        "img_url", // Exclude img_url from table display
        "IMG_URL", // Handle uppercase variation
        "Img_Url", // Handle mixed case variation
      ].map((k) => k.toLowerCase()),
    );

    // Also exclude any key that contains 'img' and 'url'
    const additionalExclusions = keys.filter((key) => {
      const lowerKey = key.toLowerCase();
      return (
        (lowerKey.includes("img") && lowerKey.includes("url")) ||
        lowerKey === "imgurl" ||
        lowerKey === "image_url" ||
        lowerKey === "imageurl"
      );
    });

    additionalExclusions.forEach((key) => excludedKeys.add(key.toLowerCase()));

    // Define our preferred column order (single-event / default)
    const columnOrder = [
      "Rank",
      "Player",
      "Team",
      "Number",
      "Confirmed Kills",
      "Gunfights",
      "Breakshooting",
      "Movement",
      "Zone Coverage",
      "Pressure",
      "Trades",
      "Unclassified",
    ];

    const statCategoryKeys = [
      "Gunfights",
      "Breakshooting",
      "Movement",
      "Zone Coverage",
      "Pressure",
      "Trades",
      "Unclassified",
    ];

    const identityKeys = ["Rank", "Player", "Team", "Number"];

    // Create a map of normalized keys to original keys
    const keyMap: Record<string, string> = {};
    keys.forEach((key) => {
      const normalized = normalizeHeaderKey(key);
      const isExcluded = excludedKeys.has(key.toLowerCase());

      if (!isExcluded && !keyMap[normalized]) {
        keyMap[normalized] = key;
      }
    });

    // Season totals: Rank → Player → Team → Number → Confirmed Kills → event columns → category stats
    if (isSeasonView && data[0]) {
      const mapCol = (displayKey: string) =>
        keyMap[displayKey]
          ? { originalKey: keyMap[displayKey], displayKey }
          : null;

      const identityHeaders = identityKeys
        .map(mapCol)
        .filter((x): x is { originalKey: string; displayKey: string } => x !== null);

      const ck = mapCol("Confirmed Kills");

      const used = new Set(identityHeaders.map((h) => h.originalKey));
      if (ck) used.add(ck.originalKey);

      const isStatCategory = (k: string) => {
        const nk = normalizeHeaderKey(k);
        return statCategoryKeys.some(
          (s) =>
            s === nk ||
            s === k ||
            s.toLowerCase().replace(/\s/g, "") ===
              k.toLowerCase().replace(/\s/g, "")
        );
      };

      const eventColumns = keys.filter(
        (k) =>
          !excludedKeys.has(k.toLowerCase()) &&
          !used.has(k) &&
          !isStatCategory(k)
      );

      const orderRank = (k: string) => {
        const i = seasonEventColumnOrder.indexOf(k);
        return i >= 0 ? i : 10000;
      };
      eventColumns.sort((a, b) => {
        const ra = orderRank(a);
        const rb = orderRank(b);
        if (ra !== rb) return ra - rb;
        return a.localeCompare(b);
      });

      eventColumns.forEach((k) => used.add(k));

      const categoryHeaders = statCategoryKeys
        .filter((h) => keyMap[h])
        .map((h) => ({
          originalKey: keyMap[h],
          displayKey: h,
        }));

      return [
        ...identityHeaders,
        ...(ck ? [ck] : []),
        ...eventColumns.map((k) => ({ originalKey: k, displayKey: k })),
        ...categoryHeaders,
      ];
    }

    const baseHeaders = columnOrder
      .filter((header) => keyMap[header])
      .map((header) => ({
        originalKey: keyMap[header],
        displayKey: header,
      }));

    return baseHeaders;
  }, [data, isSeasonView, seasonEventColumnOrder]);

  const dynamicHeaders = useMemo(
    () => headers.filter((h) => !FIXED_IDENTITY_DISPLAY_KEYS.has(h.displayKey)),
    [headers],
  );

  function MobileFilterUI({
    teams,
    selectedTeam,
    onTeamChange,
    darkMode,
    toggleDarkMode,
    showOnlyMyPicks,
    toggleMyPicks,
    myPicksAvailable,
    isSeasonView,
  }: {
    teams: string[];
    selectedTeam: string;
    onTeamChange: (team: string) => void;
    darkMode: boolean;
    toggleDarkMode: () => void;
    showOnlyMyPicks: boolean;
    toggleMyPicks: () => void;
    myPicksAvailable: boolean;
    isSeasonView: boolean;
  }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <div className="md:hidden relative">
        {/* Mobile Filter Button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-9 min-h-9 items-center justify-center gap-1.5 rounded-md bg-gray-700 px-3 text-base text-white"
        >
          <FaFilter className="h-3.5 w-3.5 shrink-0" />
          Filters
        </button>

        {/* Mobile Filter Dropdown */}
        {isOpen && (
          <div className="absolute right-0 mt-2 w-64 bg-gray-800 rounded-lg shadow-lg z-50 p-2">
            {/* Close Button */}
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <FaTimes />
              </button>
            </div>

            {/* Team Filter */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-white mb-1">
                Team
              </label>
              <div className="relative">
                <select
                  value={selectedTeam}
                  onChange={(e) => {
                    onTeamChange(e.target.value);
                    setIsOpen(false);
                  }}
                  className="box-border h-11 min-h-11 w-full rounded-md border border-gray-600 bg-gray-700 px-2 py-0 text-base text-white truncate focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="All">All Teams</option>
                  {teams.map((team) => (
                    <option
                      key={team}
                      value={team}
                      className="truncate"
                      title={team}
                    >
                      {team.length > 20 ? `${team.substring(0, 17)}...` : team}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* My Picks Toggle */}
            {!isSeasonView && (
              <div className="flex items-center justify-between mb-4">
                <label className="flex items-center text-sm font-medium text-white">
                  <FaUserCheck className="mr-2" />
                  My Picks Only
                </label>
                <button
                  onClick={toggleMyPicks}
                  disabled={!myPicksAvailable}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${showOnlyMyPicks ? "bg-blue-600" : "bg-gray-600"
                    } ${!myPicksAvailable ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showOnlyMyPicks ? "translate-x-6" : "translate-x-1"
                      }`}
                  />
                </button>
              </div>
            )}

            {/* Dark Mode Toggle */}
            <div className="flex items-center justify-between">
              <label className="flex items-center text-sm font-medium text-white">
                {darkMode ? (
                  <FaSun className="mr-2" />
                ) : (
                  <FaMoon className="mr-2" />
                )}
                {darkMode ? "Light Mode" : "Dark Mode"}
              </label>
              <button
                onClick={toggleDarkMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${darkMode ? "bg-gray-600" : "bg-gray-400"
                  }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${darkMode ? "translate-x-1" : "translate-x-6"
                    }`}
                />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`sticky top-0 md:pt-5 h-[80vh] md:h-[100vh] overflow-visible w-full items-center justify-center mx-auto pb-20 md:pb-0`}
    >
      {/* Compact Filters — h-9 + text-base on inputs/selects avoids iOS zoom & keeps row aligned */}
      <div
        className={`flex flex-row items-center justify-between gap-2 p-2 ${themeClasses.bg} rounded-lg mb-2 shadow-sm ${themeClasses.border} border`}
      >
        <div className="flex w-full flex-col gap-2 md:flex-row md:flex-nowrap md:items-center md:justify-between md:gap-3 lg:gap-4">
          {/* Row 1: search + Filters (mobile); md+: same row as team, picks, then rows+paging on the right */}
          <div className="flex w-full min-w-0 flex-row flex-wrap items-center gap-2 md:flex-1 md:flex-nowrap md:justify-start md:gap-3">
            {/* Theme Toggle - Hidden as requested */}
            {/* Search + mobile Filters */}
            <div className="flex min-w-0 w-full flex-row items-center gap-2 md:min-w-0 md:max-w-none md:flex-1">
              <div className="relative min-w-0 flex-1 md:min-w-[160px] md:max-w-[220px] md:flex-initial">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
                  <FaSearch
                    className={darkMode ? "text-gray-400" : "text-gray-500"}
                    size={14}
                  />
                </div>
                <input
                  type="text"
                  placeholder="Search..."
                  className={`box-border h-9 min-h-9 w-full rounded-md border py-0 pl-9 pr-2.5 text-base leading-none ${themeClasses.bg} ${themeClasses.text} ${themeClasses.border} focus:outline-none focus:ring-1 focus:ring-blue-500`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="shrink-0">
                <MobileFilterUI
                  teams={teams}
                  selectedTeam={selectedTeam}
                  onTeamChange={setSelectedTeam}
                  darkMode={darkMode}
                  toggleDarkMode={toggleTheme}
                  showOnlyMyPicks={showOnlyMyPicks}
                  toggleMyPicks={() => setShowOnlyMyPicks(!showOnlyMyPicks)}
                  myPicksAvailable={!!myPicks && myPicks.size > 0}
                  isSeasonView={isSeasonView}
                />
              </div>
            </div>
            {/* Team Filter */}
            <div className="hidden shrink-0 md:flex items-center gap-2">
              <span
                className={`shrink-0 text-base leading-none ${themeClasses.text}`}
              >
                Team:
              </span>
              <div className="relative min-w-[4.5rem] max-w-[9rem]">
                <select
                  className={`box-border h-9 min-h-9 w-full cursor-pointer truncate rounded-md border px-2 py-0 text-base leading-none shadow-sm ${themeClasses.bg} ${themeClasses.text} ${themeClasses.border} focus:outline-none focus:ring-1 focus:ring-blue-500`}
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                >
                  {teams.map((team) => (
                    <option
                      key={team}
                      value={team}
                      className={`${themeClasses.bg} ${themeClasses.text} truncate`}
                      title={team}
                    >
                      {team.length > 12 ? `${team.substring(0, 10)}...` : team}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="hidden shrink-0 md:flex items-center">
              {!isSeasonView && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('My Picks clicked, current state:', showOnlyMyPicks);
                    setShowOnlyMyPicks(!showOnlyMyPicks);
                  }}
                  disabled={!myPicks || myPicks.size === 0}
                  className={`
    box-border flex h-9 min-h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-base leading-none transition-all duration-200
    ${showOnlyMyPicks
                      ? "bg-blue-600 text-white border-blue-600 shadow-md" // Active state with shadow
                      : darkMode
                        ? "bg-gray-700 text-gray-100 hover:bg-gray-600 border-gray-600"
                        : "bg-gray-200 text-gray-900 hover:bg-gray-300 border-gray-400" // Better contrast for light mode
                    }
    ${!myPicks || myPicks.size === 0 ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-90"}
  `}
                  title={
                    !myPicks || myPicks.size === 0
                      ? "You haven't made any picks for this event"
                      : showOnlyMyPicks
                        ? "Show all players"
                        : "Show only my picks"
                  }
                >
                  <FaUserCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>My Picks</span>
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Rows + pagination (mobile); md+: same bar, right-aligned, no wrap */}
          <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-2 md:w-auto md:shrink-0 md:justify-end md:gap-3">
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`shrink-0 text-base leading-none ${themeClasses.text}`}
              >
                Rows:
              </span>
              <select
                value={rowsPerPage}
                onChange={handleRowsPerPageChange}
                className={`box-border h-9 min-h-9 min-w-[3rem] cursor-pointer rounded-md border px-2 py-0 text-base leading-none md:min-w-[3.25rem] ${themeClasses.bg} ${themeClasses.text} ${themeClasses.border} focus:outline-none focus:ring-1 focus:ring-blue-500`}
              >
                {[20, 40, 80, 100].map((size) => (
                  <option
                    key={size}
                    value={size}
                    className={`${themeClasses.bg} ${themeClasses.text}`}
                  >
                    {size}
                  </option>
                ))}
              </select>
            </div>

            <div
              className={`flex min-w-0 shrink items-center justify-end gap-1 max-md:gap-0.5 ${darkMode ? "text-[rgba(255,255,255,0.66)]" : "text-gray-700"
                }`}
            >
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => goToPage(currentPage - 1)}
                className={`
        box-border flex h-8 w-8 shrink-0 items-center justify-center rounded md:h-9 md:w-9
        ${darkMode
                    ? "bg-[rgba(255,255,255,0.07)] hover:bg-[rgba(255,255,255,0.11)] focus:ring-[rgba(255,255,255,0.17)]"
                    : "bg-gray-200 hover:bg-gray-300 focus:ring-gray-400"
                  }
        disabled:opacity-50 disabled:cursor-not-allowed
        focus:outline-none focus:ring-1
        transition-colors duration-200
      `}
              >
                <FaAngleLeft
                  className={`${darkMode ? "text-current" : "text-gray-700"
                    } h-3.5 w-3.5`}
                />
              </button>

              <div className="flex items-center gap-1.5 max-md:gap-1">
                <input
                  min="1"
                  max={totalPages || 1}
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={currentPageInput}
                  onChange={(e) => setCurrentPageInput(e.target.value)}
                  onBlur={(e) => {
                    let page = parseInt(e.target.value);
                    if (isNaN(page) || page < 1) page = 1;
                    if (page > totalPages) page = totalPages;
                    goToPage(page);
                    setCurrentPageInput(page.toString());
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      let page = parseInt(currentPageInput);
                      if (isNaN(page) || page < 1) page = 1;
                      if (page > totalPages) page = totalPages;
                      goToPage(page);
                      setCurrentPageInput(page.toString());
                      e.currentTarget.blur();
                    }
                  }}
                  className={`
          box-border h-9 min-h-9 w-10 rounded border px-1 py-0 text-center text-base leading-none md:w-11
          ${darkMode
                      ? "bg-[rgba(255,255,255,0.07)] text-white border-[rgba(255,255,255,0.17)] focus:ring-[rgba(255,255,255,0.17)]"
                      : "bg-gray-100 text-gray-800 border-gray-300 focus:ring-gray-400"
                    }
          focus:outline-none focus:ring-1
          [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
          [&::-webkit-inner-spin-button]:appearance-none
        `}
                />
                <span
                  className={`shrink-0 whitespace-nowrap text-base leading-none tabular-nums ${darkMode
                    ? "text-[rgba(255,255,255,0.66)]"
                    : "text-gray-600"
                    }`}
                >
                  of {totalPages}
                </span>
              </div>

              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => goToPage(currentPage + 1)}
                className={`
        box-border flex h-8 w-8 shrink-0 items-center justify-center rounded md:h-9 md:w-9
        ${darkMode
                    ? "bg-[rgba(255,255,255,0.07)] hover:bg-[rgba(255,255,255,0.11)] focus:ring-[rgba(255,255,255,0.17)]"
                    : "bg-gray-200 hover:bg-gray-300 focus:ring-gray-400"
                  }
        disabled:opacity-50 disabled:cursor-not-allowed
        focus:outline-none focus:ring-1
        transition-colors duration-200
      `}
              >
                <FaAngleRight
                  className={`${darkMode ? "text-current" : "text-gray-700"
                    } h-3.5 w-3.5`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div
        className={`flex items-start overflow-scroll h-[70vh] md:h-[80vh] rounded-lg ${themeClasses.bg}`}
      >
        <table className="w-full relative min-w-[800px] md:min-w-0">
          <thead>
            <tr
              className={`sticky top-0 z-40 shadow-[0_0_0_0.4px] shadow-white ${themeClasses.headerBg} h-10`}
            >
              {/* Rank Column - Smaller on mobile */}
              <th
                className={`px-1 md:px-2 py-2 text-center text-[10px] md:text-[12px] font-medium font-azonix uppercase tracking-wider md:border-r z-20 w-12 md:w-20 transition-colors ${sortConfig?.key === 'Rank'
                  ? 'bg-blue-900/50 text-blue-200 cursor-pointer'
                  : `${themeClasses.headerBg} ${themeClasses.headerText} cursor-pointer hover:bg-gray-700/50`
                  }`}
              >
                <div
                  className="flex items-center justify-center"
                  onClick={() => requestSort("Rank")}
                >
                  #
                  {getSortIcon("Rank")}
                </div>
              </th>

              {/* Player Column - Optimized for mobile */}
              <th
                className={`pl-2 md:pl-4 pr-1 justify-center md:border-b/60 border-0 text-[10px] md:text-[12px] font-medium font-azonix uppercase sticky left-0 tracking-wider z-40 w-[120px] md:w-[160px] transition-colors ${sortConfig?.key === 'Player'
                  ? 'bg-blue-900/50 text-blue-200 cursor-pointer'
                  : `${themeClasses.headerBg} ${themeClasses.headerText} cursor-pointer hover:bg-gray-700/50`
                  }`}
              >
                <div
                  className="flex items-center"
                  onClick={() => requestSort("Player")}
                >
                  Player
                  {getSortIcon("Player")}
                </div>
              </th>

              {/* Dynamic stats columns — order from `headers` (season: kills → events → categories) */}
              {dynamicHeaders.map(({ originalKey, displayKey }) => (
                <th
                  key={originalKey}
                  className={`px-1 md:px-2 p-1 text-center text-[9px] md:text-[12px] font-medium font-azonix uppercase w-16 md:w-24 min-w-[60px] md:min-w-[80px] transition-colors ${sortConfig?.key === originalKey
                    ? "bg-blue-900/50 text-blue-200 cursor-pointer"
                    : `${themeClasses.headerText} cursor-pointer hover:bg-gray-700/50`
                    }`}
                >
                  <div
                    className="flex items-center justify-center"
                    onClick={() => requestSort(displayKey)}
                  >
                    <span className="whitespace-normal text-center leading-tight">
                      {displayKey.replace(/_/g, " ")}
                    </span>
                    {getSortIcon(originalKey)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={` divide-y ${themeClasses.border}`}>
            {(VisibleData.length > 0 ? VisibleData : paginatedData).map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={`${themeClasses.hover} ${themeClasses.bg} ${themeClasses.text} `}
              >
                {/* Rank Column - Smaller on mobile */}
                <td
                  className={`px-1 md:px-2 py-2 whitespace-nowrap md:border-r ${themeClasses.border} z-0 ${themeClasses.bg} w-12 md:w-20`}
                >
                  <div className="text-center text-[10px] md:text-[12px] font-azonix font-medium">
                    {row.Rank}
                  </div>
                </td>

                {/* Player Column - Compact mobile layout */}
                <td
                  className={`p-1 md:p-2 whitespace-nowrap sticky left-0 z-10 ${themeClasses.bg} shadow-[2px_0_5px_rgba(0,0,0,0.3)] min-w-[100px] md:min-w-0 md:shadow-none`}
                >
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-8 w-8 md:h-10 md:w-10 flex items-center justify-center rounded-full overflow-hidden bg-gray-600 mr-1 md:mr-4 relative">
                      {/* Loading state */}
                      {row.pictureLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-200 animate-pulse">
                          <svg
                            className="h-4 w-4 md:h-5 md:w-5 text-gray-400 animate-spin"
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
                        className={`w-full h-full object-cover transition-opacity duration-200 ${row.pictureLoading ? "opacity-0" : "opacity-100"
                          }`}
                        onLoad={() => {
                          // This will be handled by the parent component's state management
                        }}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = "/placeholder.svg";
                          target.classList.remove("opacity-0");
                          target.classList.add("opacity-100");
                        }}
                      />

                      {/* Fallback icon if no picture */}
                      {!row.picture && !row.pictureLoading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <FaUser className="text-gray-900 text-lg md:text-3xl" />
                        </div>
                      )}
                    </div>

                    <div className="max-w-[80px] md:max-w-[110px] whitespace-normal">
                      <div
                        className={`text-[9px] md:text-[12px] font-azonix font-medium ${darkMode ? "text-white" : "text-gray-900"
                          } whitespace-normal break-words leading-tight`}
                      >
                        {row.Player}
                      </div>
                      <div
                        className={`text-[8px] md:text-[12px] font-azonix ${darkMode ? "text-gray-400" : "text-gray-700"
                          } whitespace-normal break-words leading-tight`}
                      >
                        {row.Team}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Stats columns — same order as header row */}
                {dynamicHeaders.map(({ originalKey }) => (
                  <td
                    key={originalKey}
                    className={`px-1 md:px-2 py-2 md:py-3 whitespace-nowrap text-[9px] md:text-[12px] font-bold ${themeClasses.border
                      } text-center ${darkMode ? "text-gray-300" : "text-gray-900"
                      } w-16 md:w-24 min-w-[60px] md:min-w-[80px]`}
                  >
                    {(row[originalKey] ?? "") as React.ReactNode}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:h-2" />
    </div>
  );
};
