import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FaUser, FaSearch } from "react-icons/fa";
import {
  FaAngleLeft,
  FaAngleRight,
  FaSort,
  FaSortDown,
  FaSortUp,
  FaUserCheck,
} from "react-icons/fa6";
import { getDownloadURL, getStorage, listAll, ref } from "firebase/storage";
import { useTheme } from "../../contexts/ThemeContext";
import {
  resolveProfilePictureToUrl,
  subscribeProfileImagesRefresh,
} from "@/src/lib/resolveProfilePictureUrl";
import { cn } from "@/src/lib/utils";

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

/** Columns rendered as fixed # / Player cells; remainder follow `headers` order */
const FIXED_IDENTITY_DISPLAY_KEYS = new Set([
  "Rank",
  "Player",
  "Team",
  "Number",
]);

/** Canonical labels shown in table headers (data keys unchanged). */
const STAT_HEADER_DISPLAY_OVERRIDES: Record<string, string> = {
  Breakshooting: "Break Shots",
};

function formatStatHeaderDisplay(displayKey: string): string {
  const spaced = displayKey.replace(/_/g, " ");
  if (STAT_HEADER_DISPLAY_OVERRIDES[displayKey]) return STAT_HEADER_DISPLAY_OVERRIDES[displayKey];
  if (STAT_HEADER_DISPLAY_OVERRIDES[spaced]) return STAT_HEADER_DISPLAY_OVERRIDES[spaced];
  return spaced;
}

type StatHeaderLayout =
  | { kind: "two"; line1: string; line2: string; title: string }
  | { kind: "one"; label: string; title: string };

/**
 * Per-column header layout (all breakpoints). `title` is used for tooltip / accessibility.
 * Stat column widths: all equal except Unclassified (see `getStatColumnWidthClass`).
 */
function getStatHeaderLayout(displayKey: string): StatHeaderLayout {
  switch (displayKey) {
    case "Confirmed Kills":
      return {
        kind: "two",
        line1: "Confirmed",
        line2: "Kills",
        title: "Confirmed Kills",
      };
    case "Gunfights":
      return {
        kind: "two",
        line1: "Gun",
        line2: "Fights",
        title: "Gun Fights",
      };
    case "Breakshooting":
      return {
        kind: "two",
        line1: "Break",
        line2: "Shots",
        title: "Break Shots",
      };
    case "Movement":
      return { kind: "one", label: "Moves", title: "Moves" };
    case "Zone Coverage":
      return {
        kind: "two",
        line1: "Zone",
        line2: "Coverage",
        title: "Zone Coverage",
      };
    case "Pressure":
      return { kind: "one", label: "Pressure", title: "Pressure" };
    case "Trades":
      return { kind: "one", label: "Trades", title: "Trades" };
    case "Unclassified":
      return { kind: "one", label: "Unclassified", title: "Unclassified" };
    default: {
      const label = formatStatHeaderDisplay(displayKey);
      const words = label.split(" ");
      if (words.length > 1) {
        // Put a 4-digit year on its own line; otherwise split at midpoint
        const yearIdx = words.reduce(
          (found, w, i) => (found === -1 && /^\d{4}$/.test(w) ? i : found),
          -1,
        );
        if (yearIdx > 0) {
          return {
            kind: "two",
            line1: words.slice(0, yearIdx).join(" "),
            line2: words.slice(yearIdx).join(" "),
            title: label,
          };
        }
        const mid = Math.ceil(words.length / 2);
        return {
          kind: "two",
          line1: words.slice(0, mid).join(" "),
          line2: words.slice(mid).join(" "),
          title: label,
        };
      }
      return { kind: "one", label, title: label };
    }
  }
}

/** First token vs remainder — two-line mobile layout (reads as first / last for typical names). */
function splitPlayerFirstLast(name: string): { first: string; last?: string } {
  const trimmed = name.trim();
  const m = /^(\S+)\s+(.+)$/.exec(trimmed);
  if (!m) return { first: trimmed };
  return { first: m[1], last: m[2].trim() };
}

/** Fixed width per stat column so all match; Unclassified is wider. On mobile, columns are slightly tighter so the Player column can use more width. */
function getStatColumnWidthClass(displayKey: string): string {
  if (displayKey === "Unclassified") {
    return "w-[10rem] min-w-[10rem] max-w-[10rem] max-md:w-[6.5rem] max-md:min-w-[6.5rem] max-md:max-w-[6.5rem]";
  }
  return "w-[7rem] min-w-[7rem] max-w-[7rem] max-md:w-[5.5rem] max-md:min-w-[5.5rem] max-md:max-w-[5.5rem]";
}

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
  /**
   * Labels/spans in the filter row — size comes from `.pickem-matchup-filter-bar` (Preflight uses
   * `font-size: 100%` on select/button, so they inherit the wrapper’s 10px / 12px md like `<th>`).
   */
  const filterBarChromeClass =
    "font-medium font-azonix uppercase tracking-wider leading-none";
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<string>("All");
  const [showOnlyMyPicks, setShowOnlyMyPicks] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);
  /** `0` = show all rows (no paging slice) */
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [paginatedData, setPaginatedData] = useState<Player[]>([]);
  const [VisibleData, setVisibleData] = useState<Player[]>([]);
  const tableRef = useRef<HTMLDivElement | null>(null);
  /** Horizontal scroll for header table — kept in sync with `tableBodyScrollRef` (see STATS_TABLE_SCROLL_ARCHITECTURE). */
  const tableHeaderScrollRef = useRef<HTMLDivElement | null>(null);
  /** Horizontal scroll for body table — kept in sync with `tableHeaderScrollRef`. */
  const tableBodyScrollRef = useRef<HTMLDivElement | null>(null);
  const tableBlockRef = useRef<HTMLDivElement | null>(null);
  /** True when the table body has been scrolled down — header row shows a subtle Excel-like separator. */
  const [tableBodyScrolled, setTableBodyScrolled] = useState(false);

  const skipPageScrollIntoViewRef = useRef(true);

  /** After changing page (top or bottom arrows), reset table scroll and bring table into view */
  useLayoutEffect(() => {
    const viewport = tableRef.current;
    if (viewport) {
      viewport.scrollTop = 0;
    }
    const h = tableHeaderScrollRef.current;
    const b = tableBodyScrollRef.current;
    if (h) h.scrollLeft = 0;
    if (b) b.scrollLeft = 0;
    if (skipPageScrollIntoViewRef.current) {
      skipPageScrollIntoViewRef.current = false;
      return;
    }
    tableBlockRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [currentPage]);

  /** Excel-style frozen header: pin thead to top of table scrollport; shadow when body scrolled.
   *  Use a ref to track last value and only update state when it actually changes to avoid re-renders.
   */
  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    let lastScrolled: boolean | null = null;
    const sync = () => {
      const scrolled = el.scrollTop > 1;
      if (scrolled !== lastScrolled) {
        lastScrolled = scrolled;
        setTableBodyScrolled(scrolled);
      }
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    return () => el.removeEventListener("scroll", sync);
  }, [currentPage]);

  /**
   * Stats table scroll — user-focused outcomes (how it should feel):
   * - One continuous gesture: table scroll → reach top/bottom → same gesture continues into the page.
   * - Same motion family as the rest of the dashboard (native compositor scroll, not a “second” scroll).
   * - Freeze panes: vertical scroll on `tableRef`; horizontal scroll on **synced** `tableHeaderScrollRef` +
   *   `tableBodyScrollRef` (two `<table>` elements — see STATS_TABLE_SCROLL_ARCHITECTURE in JSX). Do not
   *   collapse to one table inside a single horizontal scroller: that breaks the frozen header row in browsers.
   * - Forgiving edges: CSS scroll chaining to the dashboard column; wheel forwarding at vertical edges.
   *
   * Touch: outer `overscroll-y-auto`; inner `overscroll-x-contain` for horizontal stats strip.
   * Trackpad / mouse: `wheel` forwarding at vertical edges where the browser does not chain.
   */
  /**
   * Wheel chaining removed for performance - relying on native CSS overscroll-behavior.
   * The container uses overscroll-y-auto which should chain to parent when at edges.
   */

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

    /**
     * Players who did not take the field leave the table entirely.
     *
     * Their zeros are not results — see `scripts/participation-plan.mjs`. The one
     * exception is the user's own picks: someone who picked a player who never
     * played needs to see them, or their score becomes inexplicable. There they
     * stay, showing DNP instead of a row of zeros.
     */
    if (!showOnlyMyPicks) {
      filtered = filtered.filter((player) => player.participation !== "absent");
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
      const startIndex =
        rowsPerPage === 0 ? 0 : (currentPage - 1) * rowsPerPage;
      const endIndex =
        rowsPerPage === 0
          ? filteredData.length
          : startIndex + rowsPerPage;
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
    const raw = e.target.value;
    setRowsPerPage(raw === "all" ? 0 : Number(raw));
    setCurrentPage(1);
  };

  useEffect(() => {
    if (rowsPerPage === 0) {
      setTotalPages(1);
    } else {
      setTotalPages(
        Math.max(1, Math.ceil(filteredData.length / rowsPerPage)),
      );
    }
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
    const playersWithPlaceholders = await Promise.all(
      players.map(async (player) => {
        let picture = "/placeholder.svg";
        if (player.img_url && player.img_url.trim() !== "") {
          picture = player.img_url;
        } else if (player.profilePicture) {
          const uid = typeof player.id === "string" ? player.id : undefined;
          picture =
            (await resolveProfilePictureToUrl(player.profilePicture, {
              userId: uid,
            })) ?? "/placeholder.svg";
        }
        return {
          ...player,
          picture,
          pictureLoading: false,
        };
      }),
    );
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

  const refreshTablePicturesRef = useRef({
    fetch: fetchPlayersWithPictures,
    page: [] as Player[],
  });
  refreshTablePicturesRef.current = {
    fetch: fetchPlayersWithPictures,
    page: paginatedData,
  };

  useEffect(() => {
    return subscribeProfileImagesRefresh(() => {
      const { fetch, page } = refreshTablePicturesRef.current;
      void fetch(page);
    });
  }, []);

  /** Fixed box so icons match across # / Player / stats; react-icons scale with explicit h/w. */
  const SORT_ICON_CLASS =
    "box-border h-2.5 w-2.5 shrink-0 flex-none md:h-2.5 md:w-2.5";

  const isSortActiveForKey = (columnKey: string) => {
    if (!sortConfig) return false;
    const a = sortConfig.key;
    return (
      a === columnKey ||
      normalizeHeaderKey(a) === normalizeHeaderKey(columnKey)
    );
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || !isSortActiveForKey(key)) {
      return <FaSort className={SORT_ICON_CLASS} aria-hidden />;
    }
    return sortConfig.direction === "ascending" ? (
      <FaSortUp className={SORT_ICON_CLASS} aria-hidden />
    ) : (
      <FaSortDown className={SORT_ICON_CLASS} aria-hidden />
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
        // Participation drives row filtering and the DNP cells below — it is a
        // control field, not a stat, so it must not become a column.
        "participation",
        "participationreason",
        "participationat",
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

  /**
   * Keep header/body horizontal scrollLeft aligned. ignoreHead/ignoreBody stop programmatic mirrors from
   * echoing back. Mirror synchronously (no rAF batching): deferring one frame let header/body drift and the
   * frozen Rank/Player columns looked like they slid during horizontal scroll.
   * Math.round avoids subpixel scrollLeft mismatch between the two scrollports.
   * See STATS_TABLE_SCROLL_ARCHITECTURE in JSX.
   */
  useEffect(() => {
    const body = tableBodyScrollRef.current;
    const head = tableHeaderScrollRef.current;
    if (!body || !head) return;

    let ignoreHead = false;
    let ignoreBody = false;

    const onBodyScroll = () => {
      if (ignoreBody) {
        ignoreBody = false;
        return;
      }
      const x = Math.round(body.scrollLeft);
      if (Math.abs(head.scrollLeft - x) < 0.5) return;
      ignoreHead = true;
      head.scrollLeft = x;
    };

    const onHeadScroll = () => {
      if (ignoreHead) {
        ignoreHead = false;
        return;
      }
      const x = Math.round(head.scrollLeft);
      if (Math.abs(body.scrollLeft - x) < 0.5) return;
      ignoreBody = true;
      body.scrollLeft = x;
    };

    body.addEventListener("scroll", onBodyScroll, { passive: true });
    head.addEventListener("scroll", onHeadScroll, { passive: true });
    return () => {
      body.removeEventListener("scroll", onBodyScroll);
      head.removeEventListener("scroll", onHeadScroll);
    };
  }, [currentPage, dynamicHeaders.length]);

  const renderPageArrows = (align: "end" | "center" = "end") => (
    <div
      className={`flex min-w-0 shrink items-center gap-1 max-md:gap-0.5 ${align === "center" ? "justify-center" : "justify-end"} ${darkMode ? "text-[rgba(255,255,255,0.66)]" : "text-gray-700"}`}
      role="navigation"
      aria-label="Table pages"
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
          className={`${darkMode ? "text-current" : "text-gray-700"} h-3.5 w-3.5`}
        />
      </button>
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
          className={`${darkMode ? "text-current" : "text-gray-700"} h-3.5 w-3.5`}
        />
      </button>
    </div>
  );

  const renderTeamSelect = () => (
    <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
      <span className={`shrink-0 ${filterBarChromeClass} ${themeClasses.text}`}>
        Team:
      </span>
      <div className="relative w-max max-w-[5rem] shrink-0">
        <select
          title={selectedTeam}
          className={`pickem-stats-filter box-border h-9 min-h-9 w-full max-w-[5rem] cursor-pointer truncate rounded-md border px-1.5 py-0 shadow-sm font-azonix font-medium uppercase tracking-wider leading-none ${themeClasses.bg} ${themeClasses.text} ${themeClasses.border} focus:outline-none focus:ring-1 focus:ring-blue-500`}
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
  );

  const renderRowsSelect = () => (
    <div className="flex shrink-0 items-center gap-2">
      <span className={`shrink-0 ${filterBarChromeClass} ${themeClasses.text}`}>
        Rows:
      </span>
      <select
        value={rowsPerPage === 0 ? "all" : String(rowsPerPage)}
        onChange={handleRowsPerPageChange}
        title={
          rowsPerPage === 0
            ? "All players"
            : `${rowsPerPage} rows per page`
        }
        className={`pickem-stats-filter box-border h-9 min-h-9 w-max max-w-[5rem] min-w-[2.25rem] cursor-pointer rounded-md border px-1.5 py-0 font-azonix font-medium uppercase tracking-wider leading-none ${themeClasses.bg} ${themeClasses.text} ${themeClasses.border} focus:outline-none focus:ring-1 focus:ring-blue-500`}
      >
        {[50, 100, 200].map((size) => (
          <option
            key={size}
            value={size}
            className={`${themeClasses.bg} ${themeClasses.text}`}
          >
            {size}
          </option>
        ))}
        <option
          value="all"
          className={`${themeClasses.bg} ${themeClasses.text}`}
        >
          All players
        </option>
      </select>
    </div>
  );

  const renderMyPicksButton = () =>
    !isSeasonView ? (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowOnlyMyPicks(!showOnlyMyPicks);
        }}
        disabled={!myPicks || myPicks.size === 0}
        className={`
    pickem-stats-filter box-border flex h-9 min-h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 font-azonix font-medium uppercase tracking-wider leading-none transition-all duration-200 md:px-3
    ${showOnlyMyPicks
          ? "bg-blue-600 text-white border-blue-600 shadow-md"
          : darkMode
            ? "bg-gray-700 text-gray-100 hover:bg-gray-600 border-gray-600"
            : "bg-gray-200 text-gray-900 hover:bg-gray-300 border-gray-400"
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
        <FaUserCheck className="h-3 w-3 shrink-0 md:h-3.5 md:w-3.5" />
        <span className="max-md:text-[9px] md:text-inherit">My Picks</span>
      </button>
    ) : null;

  const searchFieldClass = `pickem-stats-search normal-case box-border h-9 min-h-9 w-full rounded-md border py-0 pl-9 pr-2.5 text-base leading-none ${themeClasses.bg} ${themeClasses.text} ${themeClasses.border} focus:outline-none focus:ring-1 focus:ring-blue-500`;

  return (
    <div className="relative overflow-visible w-full mx-auto pb-0 max-md:pb-[max(0.25rem,env(safe-area-inset-bottom,0px))]"
    >
      {/* Wrapper font-size matches <th>; Preflight makes select/button use 100% of this. Search uses 16px via pickem-stats-search + text-base. */}
      <div
        className={`pickem-matchup-filter-bar flex w-full flex-col gap-2 p-2 text-[10px] md:flex-row md:items-center md:justify-between md:gap-2 md:text-[12px] font-medium font-azonix tracking-wider ${themeClasses.bg} rounded-lg mb-1 shadow-sm ${themeClasses.border} border`}
      >
        {/* Mobile: row1 = search + page arrows; row2 = My Picks, Team, Rows */}
        <div className="flex w-full flex-col gap-2 md:hidden">
          <div className="flex w-full min-w-0 flex-row items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
                <FaSearch
                  className={darkMode ? "text-gray-400" : "text-gray-500"}
                  size={14}
                />
              </div>
              <input
                type="search"
                autoComplete="off"
                placeholder="Search..."
                className={searchFieldClass}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {totalPages > 1 ? renderPageArrows() : null}
          </div>
          <div className="flex w-full min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-2">
            <div className="flex shrink-0 items-center">{renderMyPicksButton()}</div>
            {renderTeamSelect()}
            {renderRowsSelect()}
          </div>
        </div>

        {/* Desktop: search + team + my picks | rows + arrows */}
        <div className="hidden w-full flex-row flex-nowrap items-center justify-between gap-3 lg:gap-4 md:flex">
          <div className="flex min-w-0 flex-1 flex-row flex-wrap items-center gap-3">
            <div className="relative min-w-0 md:min-w-[160px] md:max-w-[220px] md:flex-initial">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
                <FaSearch
                  className={darkMode ? "text-gray-400" : "text-gray-500"}
                  size={14}
                />
              </div>
              <input
                type="search"
                autoComplete="off"
                placeholder="Search..."
                className={searchFieldClass}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {renderTeamSelect()}
            <div className="flex shrink-0 items-center">{renderMyPicksButton()}</div>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center justify-end gap-3">
            {renderRowsSelect()}
            {totalPages > 1 ? renderPageArrows() : null}
          </div>
        </div>
      </div>

      {/* Table card: border ends with last row; bottom page arrows sit below (outside this box) */}
      <div className="flex w-full flex-col">
        <div
          ref={tableBlockRef}
          className={`rounded-lg border ${themeClasses.border} ${themeClasses.bg}`}
        >
          {/*
            STATS_TABLE_SCROLL_ARCHITECTURE (do not collapse without revisiting all three):
            1) Vertical scroll: tableRef — overflow-y-auto, overflow-x-hidden, max-h. Use block stacking for
               header + body (not flex-col + flex-1 on the body) or vertical scrolling breaks.
            2) Horizontal scroll: two synced divs (tableHeaderScrollRef + tableBodyScrollRef) so diagonal touch
               panning stays sane vs one overflow-auto on both axes.
            3) Frozen header row: thead lives in its own <table> inside position:sticky;top:0 — NOT inside the
               body’s horizontal scroller. A single <table> inside overflow-x makes position:sticky on thead
               fail in browsers (sticky is tied to the wrong scrollport). Sync scrollLeft between the two
               tables; keep colgroup + column classes aligned on both.
          */}
          <div
            ref={tableRef}
            className={cn(
              /* Block layout (not flex-col): header + body must stack at natural height so scrollHeight > clientHeight when rows exceed max-h. flex-1 on the body had collapsed / prevented vertical overflow. */
              "max-h-[70vh] min-h-0 md:max-h-[80vh]",
              "min-w-0 overflow-y-auto overflow-x-hidden overscroll-y-auto rounded-lg",
              themeClasses.bg,
            )}
          >
          <div
            className={cn(
              "sticky top-0 z-[49] w-full shrink-0",
              themeClasses.bg,
              tableBodyScrolled &&
                "shadow-[0_4px_8px_-2px_rgba(0,0,0,0.12)] dark:shadow-[0_4px_8px_-2px_rgba(0,0,0,0.45)]",
            )}
          >
          <div
            ref={tableHeaderScrollRef}
            className="min-w-0 w-full overflow-x-auto overflow-y-hidden overscroll-x-contain [scroll-behavior:auto] [-webkit-overflow-scrolling:touch] [will-change:scroll-position] [transform:translateZ(0)] [touch-action:pan-x]"
          >
          <table className="w-full min-w-[960px] table-fixed border-separate border-spacing-0 md:min-w-0">
            {/*
              Lock column 1 width so sticky `left` on column 2 matches the real Rank width.
              Otherwise `table-layout: auto` can shrink column 1 below `w-5` (mobile), leaving a gap where
              horizontally scrolled stats show between Rank and Player.
            */}
            <colgroup>
              <col className="w-5 md:w-10" />
              <col className="max-md:w-[min(25vw,6rem)] md:w-[200px]" />
            </colgroup>
          <thead>
            <tr className={`min-h-[3.25rem] md:min-h-[3.25rem] ${themeClasses.headerBg}`}>
              {/* Rank Column - Smaller on mobile */}
              <th
                scope="col"
                className={`sticky left-0 z-[50] box-border px-0 py-2 text-center text-[10px] font-medium font-azonix uppercase tracking-wider md:px-2 md:text-[12px] md:border-r w-5 min-w-5 max-w-5 border-b border-gray-300/80 shadow-[0_1px_0_0_rgba(0,0,0,0.06)] md:w-10 md:min-w-10 md:max-w-10 dark:border-white/10 ${sortConfig?.key === "Rank"
                  ? darkMode
                    ? "cursor-pointer bg-blue-800 text-blue-100"
                    : "cursor-pointer bg-blue-600 text-white"
                  : `${themeClasses.headerBg} ${themeClasses.headerText} cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600`
                  }`}
              >
                <div
                  className="flex items-center justify-center gap-0.5"
                  onClick={() => requestSort("Rank")}
                >
                  <span className="leading-none">#</span>
                  <span className="inline-flex shrink-0 leading-none">{getSortIcon("Rank")}</span>
                </div>
              </th>

              {/* Player Column - Optimized for mobile */}
              <th
                scope="col"
                className={`sticky left-5 z-[52] box-border min-w-0 max-w-[min(25vw,6rem)] w-[min(25vw,6rem)] border-b border-r border-gray-300/80 border-r-black/10 dark:border-r-white/10 pl-1.5 pr-0.5 text-left text-[10px] font-medium font-azonix uppercase tracking-wider [will-change:transform] [transform:translateZ(0)] dark:border-b-white/10 md:left-10 md:max-w-none md:min-w-[200px] md:w-[200px] md:pl-4 md:pr-1 md:text-[12px] ${sortConfig?.key === "Player"
                  ? darkMode
                    ? "cursor-pointer bg-blue-800 text-blue-100"
                    : "cursor-pointer bg-blue-600 text-white"
                  : `${themeClasses.headerBg} ${themeClasses.headerText} cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600`
                  }`}
              >
                <div
                  className="flex min-w-0 items-center gap-1"
                  onClick={() => requestSort("Player")}
                >
                  <span className="min-w-0 truncate">Player</span>
                  <span className="inline-flex shrink-0 leading-none">{getSortIcon("Player")}</span>
                </div>
              </th>

              {/* Dynamic stats columns — order from `headers` (season: kills → events → categories) */}
              {dynamicHeaders.map(({ originalKey, displayKey }) => {
                const layout = getStatHeaderLayout(displayKey);
                const statWidthClass = getStatColumnWidthClass(displayKey);
                return (
                <th
                  key={originalKey}
                  scope="col"
                  title={layout.title}
                  className={`relative z-[10] box-border p-0.5 px-0.5 text-center text-[10px] font-medium font-azonix uppercase tracking-wider md:p-1 md:px-1.5 md:text-[12px] border-b border-gray-300/80 shadow-[0_1px_0_0_rgba(0,0,0,0.06)] dark:border-white/10 ${statWidthClass} ${isSortActiveForKey(originalKey)
                    ? darkMode
                      ? "cursor-pointer bg-blue-800 text-blue-100"
                      : "cursor-pointer bg-blue-600 text-white"
                    : `${themeClasses.headerBg} ${themeClasses.headerText} cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600`
                    }`}
                >
                  <div
                    className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1 gap-y-0 px-0.5"
                    onClick={() => requestSort(displayKey)}
                  >
                    <div className="min-w-0 w-full text-center leading-tight">
                      {layout.kind === "two" ? (
                        <span className="flex flex-col items-center gap-0 leading-[1.05]">
                          <span>{layout.line1}</span>
                          <span>{layout.line2}</span>
                        </span>
                      ) : (
                        <span className="whitespace-nowrap leading-tight">{layout.label}</span>
                      )}
                    </div>
                    <span className="inline-flex w-2.5 shrink-0 justify-self-end self-center leading-none md:w-2.5">
                      {getSortIcon(originalKey)}
                    </span>
                  </div>
                </th>
                );
              })}
            </tr>
          </thead>
          </table>
          </div>
          </div>

          <div
            ref={tableBodyScrollRef}
            className="min-w-0 w-full overflow-x-auto overflow-y-clip overscroll-x-contain [scroll-behavior:auto] [-webkit-overflow-scrolling:touch] [will-change:scroll-position] [transform:translateZ(0)] [touch-action:pan-x_pan-y]"
          >
          <table className="w-full min-w-[960px] table-fixed border-separate border-spacing-0 md:min-w-0">
            <colgroup>
              <col className="w-5 md:w-10" />
              <col className="max-md:w-[min(25vw,6rem)] md:w-[200px]" />
            </colgroup>
          <tbody className={` divide-y ${themeClasses.border}`}>
            {(VisibleData.length > 0 ? VisibleData : paginatedData).map((row, rowIndex) => {
              const { first: firstName, last: lastName } = splitPlayerFirstLast(
                String(row.Player ?? ""),
              );
              return (
              <tr
                key={rowIndex}
                className={`${themeClasses.hover} ${themeClasses.bg} ${themeClasses.text} `}
              >
                {/* Rank Column - Smaller on mobile */}
                <td
                  className={`sticky left-0 z-[20] box-border px-0 py-2 whitespace-nowrap md:border-r ${themeClasses.border} ${themeClasses.bg} w-5 min-w-5 max-w-5 md:w-10 md:min-w-10 md:max-w-10`}
                >
                  <div className="pickem-numeric text-center text-[10px] md:text-[12px] font-medium">
                    {/* A finishing position is as much a claim as a kill count, so an
                        absent player gets a dash rather than a rank they never earned. */}
                    {row.participation === "absent" ? (
                      <span className={darkMode ? "text-white/25" : "text-gray-300"}>—</span>
                    ) : (
                      row.Rank
                    )}
                  </div>
                </td>

                {/* Player Column - Compact mobile layout */}
                <td
                  className={`sticky left-5 z-[21] box-border min-w-0 max-w-[min(25vw,6rem)] w-[min(25vw,6rem)] p-1 md:max-w-none md:whitespace-nowrap md:left-10 md:min-w-[200px] md:w-[200px] md:p-2 [will-change:transform] [transform:translateZ(0)] border-r border-black/10 dark:border-white/10 ${themeClasses.bg}`}
                >
                  <div className="flex min-w-0 items-center gap-1.5 md:gap-0">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-600 md:mr-4">
                      {/* Loading state */}
                      {row.pictureLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-200 animate-pulse">
                          <svg
                            className="h-5 w-5 text-gray-400 animate-spin md:h-5 md:w-5"
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

                    <div className="min-w-0 flex-1 md:max-w-[140px]">
                      {/* Name links to the player's career page; the row's own click
                          handler still adds/removes the pick, so stop propagation. */}
                      <PlayerNameLink
                        playerId={row.player_id}
                        playerName={row.Player}
                        firstName={firstName}
                        lastName={lastName}
                        darkMode={darkMode}
                      />
                      <div
                        className={`truncate text-[8px] font-azonix md:whitespace-normal md:break-words md:text-[12px] ${darkMode ? "text-gray-400" : "text-gray-700"
                          } leading-tight`}
                        title={row.Team}
                      >
                        {row.Team}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Stats columns — same order as header row */}
                {dynamicHeaders.map(({ originalKey, displayKey }) => {
                  // A zero here would read as a score. This player was not there, so
                  // the first stat column says so and the rest stay blank.
                  const absent = row.participation === "absent";
                  return (
                  <td
                    key={originalKey}
                    className={`relative z-[10] px-0.5 py-2 md:px-2 md:py-3 whitespace-nowrap text-[9px] md:text-[12px] font-bold ${themeClasses.border
                      } text-center ${darkMode ? "text-gray-300" : "text-gray-900"
                      } ${getStatColumnWidthClass(displayKey)}`}
                  >
                    {absent ? (
                      <span
                        className={`font-azonix text-[9px] tracking-wide md:text-[10px] ${
                          darkMode ? "text-white/35" : "text-gray-400"
                        }`}
                      >
                        {originalKey === "Confirmed Kills" ? "DNP" : "\u2014"}
                      </span>
                    ) : (
                      <span className="pickem-numeric">
                        {(row[originalKey] ?? "") as React.ReactNode}
                      </span>
                    )}
                  </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
          </div>
        </div>
        </div>
        {totalPages > 1 ? (
          <div className="flex justify-center pt-2 pb-0">
            {renderPageArrows("center")}
          </div>
        ) : null}
      </div>
    </div>
  );
};

/**
 * Player name in the stats table, linking through to their career page.
 *
 * Rendered inside a clickable row, so clicks are stopped from bubbling — otherwise
 * following the link would also toggle the pick underneath it. Falls back to plain
 * text when the row has no `player_id` (season aggregates built before ids were
 * carried through).
 */
function PlayerNameLink({
  playerId,
  playerName,
  firstName,
  lastName,
  darkMode,
}: {
  playerId?: string | number | null;
  playerName?: string;
  firstName?: string;
  lastName?: string;
  darkMode: boolean;
}) {
  const nameColour = darkMode ? "text-white" : "text-gray-900";

  const inner = (
    <>
      <div className="md:hidden">
        <div
          className={`truncate text-[10px] font-azonix font-medium leading-tight ${nameColour}`}
          title={playerName}
        >
          {firstName}
        </div>
        {lastName ? (
          <div
            className={`truncate text-[10px] font-azonix font-medium leading-tight ${nameColour}`}
            title={playerName}
          >
            {lastName}
          </div>
        ) : null}
      </div>
      <div
        className={`hidden md:block truncate text-[12px] font-azonix font-medium md:whitespace-normal md:break-words ${nameColour} leading-tight`}
        title={playerName}
      >
        {playerName}
      </div>
    </>
  );

  if (playerId == null || playerId === "") return <>{inner}</>;

  return (
    <Link
      href={`/dashboard/players/${playerId}`}
      onClick={(e) => e.stopPropagation()}
      className="block rounded-sm outline-none transition-colors hover:underline hover:decoration-[#00f976] hover:decoration-2 hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-[#00f976]"
    >
      {inner}
    </Link>
  );
}
