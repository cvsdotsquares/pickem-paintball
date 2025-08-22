"use client";
import { AnimatedGroup } from "@/src/components/ui/animations/grp";
import { useAuth } from "@/src/contexts/authProvider";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  updateDoc,
} from "firebase/firestore";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GiCardPickup } from "react-icons/gi";
import { IoMdClose, IoMdCloseCircle } from "react-icons/io";
import { RiLock2Line, RiTeamLine } from "react-icons/ri";
import { getDownloadURL, getStorage, listAll, ref } from "firebase/storage";
import { TiTick } from "react-icons/ti";
import { FilterUI } from "@/src/components/ui/Filter-ui";
import PlayerCard1 from "@/src/components/temp-card";
import { PiPlusBold } from "react-icons/pi";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export interface Player {
  player_id: string;
  Player: string;
  Team: string;
  Rank: string;
  team_id: string;
  Cost: number;
  league_id: string; // Added league_id
  picture?: string; // Optional picture URL
  pictureLoading?: boolean; // check loaded
}

export interface Event {
  id: string;
  name: string;
  status: string;
}
interface PlayerSlot {
  id: number;
  position: string;
  isSelected: boolean;
  player: Player | null;
}

export default function Pickems() {
  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>(
    Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      position: `p${i + 1}`,
      isSelected: i === 0,
      player: null as Player | null,
    }))
  );
  const [temporaryPicks, setTemporaryPicks] = useState<Player[]>([]);
  const [liveEvent, setLiveEvent] = useState<{
    id: string | null;
    lockDate: Date | null;
    timeLeft: string;
  }>({ id: null, lockDate: null, timeLeft: "" });
  const [remainingBudget, setRemainingBudget] = useState(1000000); // $1,000,000 initial budget
  const [visiblePlayersCount, setVisiblePlayersCount] = useState(9);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [costRange, setCostRange] = useState<[number, number]>([0, 1000000]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [teams, setTeams] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  const [sortOption, setSortOption] = useState<{
    field: string;
    direction: "asc" | "desc";
  }>({
    field: "name",
    direction: "asc",
  });
  function useThrottledState<T>(
    initialState: T,
    delay = 300
  ): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [state, setState] = useState(initialState);
    const lastUpdate = useRef(Date.now());

    const throttledSetState = useCallback(
      (newState: React.SetStateAction<T>) => {
        if (Date.now() - lastUpdate.current >= delay) {
          setState(newState);
          lastUpdate.current = Date.now();
        }
      },
      [delay]
    );

    return [state, throttledSetState];
  }

  // Then replace your rowData state:
  const [rowData, setRowData] = useThrottledState<any[]>([]);
  // Add this handler function
  const handleSort = ({
    field,
    direction,
  }: {
    field: string;
    direction: "asc" | "desc";
  }) => {
    setSortOption({ field, direction });
    setVisiblePlayersCount(9); // Reset visible count when sorting changes
  };

  // In your component
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);

  // Memoized filtered players with improved search
  const filteredPlayers = useMemo(() => {
    if (rowData.length === 0) return [];
    let result = [...rowData];

    // Apply search filter if term exists
    if (searchTerm.trim()) {
      const cleanSearch = searchTerm.toLowerCase().replace(/\s+/g, "");

      result = result.filter((player) => {
        // Create normalized versions once per player
        const normalizedPlayer = player.Player.toLowerCase().replace(
          /\s+/g,
          ""
        );
        const normalizedTeam = player.Team.toLowerCase().replace(/\s+/g, "");

        // Check full normalized strings first (fastest check)
        if (normalizedPlayer.includes(cleanSearch)) return true;
        if (normalizedTeam.includes(cleanSearch)) return true;

        // Only split into words if needed (for partial matching)
        const playerWords = player.Player.toLowerCase().split(/\s+/);
        const teamWords = player.Team.toLowerCase().split(/\s+/);

        // Check word matches
        return (
          playerWords.some((word: string) => word.includes(cleanSearch)) ||
          teamWords.some((word: string) => word.includes(cleanSearch)) ||
          (cleanSearch.length > 3 && // Only do partial matches for longer queries
            (playerWords.some((word: string) => word.startsWith(cleanSearch)) ||
              teamWords.some((word: string) => word.startsWith(cleanSearch))))
        );
      });
    }

    // Apply cost filter
    result = result.filter(
      (player) => player.Cost >= costRange[0] && player.Cost <= costRange[1]
    );

    // Apply team filter if any teams are selected
    if (selectedTeams.length > 0) {
      result = result.filter((player) => selectedTeams.includes(player.Team));
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortOption.field) {
        case "name":
          comparison = a.Player.localeCompare(b.Player);
          break;
        case "team":
          comparison = a.Team.localeCompare(b.Team);
          break;
        case "cost":
          comparison = a.Cost - b.Cost;
          break;
        default:
          comparison = a.Player.localeCompare(b.Player);
      }

      return sortOption.direction === "asc" ? comparison : -comparison;
    });

    return result;
  }, [rowData, searchTerm, costRange, selectedTeams, sortOption]);
  // Group players into selected and available
  const { selectedPlayers, availablePlayers } = useMemo(() => {
    const selected = filteredPlayers.filter((player) =>
      temporaryPicks.some((p) => p.player_id === player.player_id)
    );
    const available = filteredPlayers.filter(
      (player) => !temporaryPicks.some((p) => p.player_id === player.player_id)
    );
    return { selectedPlayers: selected, availablePlayers: available };
  }, [filteredPlayers, temporaryPicks]);

  // Get visible players (selected first, then available)

  const visiblePlayers = useMemo(() => {
    const allSelected = selectedPlayers;
    const available = availablePlayers.slice(
      0,
      Math.max(0, visiblePlayersCount - allSelected.length)
    );
    return [...allSelected, ...available];
  }, [selectedPlayers, availablePlayers, visiblePlayersCount]);

  const handleScroll = useCallback(() => {
    if (isLoadingMore || visiblePlayers.length >= filteredPlayers.length)
      return;

    const container = isMobile
      ? mobileScrollRef.current
      : desktopScrollRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;

    // Different thresholds for mobile/desktop
    const threshold = isMobile ? scrollHeight * 0.25 : 100; // 25% for mobile, 100px for desktop
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

    if (distanceFromBottom < threshold) {
      setIsLoadingMore(true);
      setTimeout(
        () => {
          setVisiblePlayersCount((prev) =>
            Math.min(prev + (isMobile ? 6 : 9), filteredPlayers.length)
          );
          setIsLoadingMore(false);
        },
        isMobile ? 200 : 300
      );
    }
  }, [isLoadingMore, visiblePlayers.length, filteredPlayers.length, isMobile]);

  useEffect(() => {
    const container = isMobile
      ? mobileScrollRef.current
      : desktopScrollRef.current;
    if (container) {
      console.log("scroll container dimensions:", {
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        scrollable: container.scrollHeight > container.clientHeight,
      });

      // Trigger initial check
      setTimeout(handleScroll, 600);
    }
  }, [visiblePlayers]);

  const db = getFirestore();
  const { user } = useAuth();

  // Helper to fetch documents from Firestore
  const fetchFromFirestore = async (path: string) => {
    const ref = collection(db, path);
    const snapshot = await getDocs(ref);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  };

  useEffect(() => {
    const container = mobileScrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      console.log("Scroll position:", {
        scrollTop,
        scrollHeight,
        clientHeight,
        distanceFromBottom: scrollHeight - (scrollTop + clientHeight),
      });
      const threshold = 50;
      const isNearBottom =
        scrollHeight - (scrollTop + clientHeight) < threshold;

      if (
        isNearBottom &&
        !isLoadingMore &&
        visiblePlayers.length < filteredPlayers.length
      ) {
        setIsLoadingMore(true);
        setTimeout(() => {
          setVisiblePlayersCount((prev) =>
            Math.min(prev + 9, filteredPlayers.length)
          );
          setIsLoadingMore(false);
        }, 200);
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [isLoadingMore, visiblePlayers.length, filteredPlayers.length]);

  const handleFilter = ({
    searchTerm: newSearchTerm,
    costRange: newCostRange,
    selectedTeams: newSelectedTeams,
  }: any) => {
    setSearchTerm(newSearchTerm);
    setCostRange(newCostRange);
    setSelectedTeams(newSelectedTeams);
  };

  // Your existing live event fetch
  useEffect(() => {
    const fetchLiveEvent = async () => {
      try {
        const events = await fetchFromFirestore("events");
        const liveEvent = events.find((e: any) => e.status === "live");

        if (liveEvent) {
          const eventRef = doc(db, "events", liveEvent.id);
          const eventSnap = await getDoc(eventRef);

          if (eventSnap.exists()) {
            const eventData = eventSnap.data();
            const lockDate = eventData.lockDate.toDate
              ? eventData.lockDate.toDate()
              : null;

            setLiveEvent({
              id: liveEvent.id,
              lockDate,
              timeLeft: "",
            });
          }
        }
      } catch (error) {
        console.error("Error fetching live event:", error);
      }
    };

    fetchLiveEvent();
  }, []);

  useEffect(() => {
    const { lockDate } = liveEvent;
    if (!lockDate) return;

    const updateTimeLeft = () => {
      const now = new Date();
      // Convert both to milliseconds for comparison
      const diff = new Date(lockDate).getTime() - now.getTime();

      if (diff <= 0) {
        setLiveEvent((prev) => ({ ...prev, timeLeft: "Picks locked!" }));
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setLiveEvent((prev) => ({
        ...prev,
        timeLeft: `${hours}h ${minutes}m ${Math.floor(seconds)}s`,
      }));
    };

    const interval = setInterval(updateTimeLeft, 1000);
    updateTimeLeft();
    return () => clearInterval(interval);
  }, [liveEvent.lockDate]);

  const fetchPlayerPicture = async (leagueId: string): Promise<string> => {
    const storage = getStorage();
    const folderPath = `players/`; // Path to the folder containing player pictures
    const storageRef = ref(storage, folderPath);

    try {
      const fileList = await listAll(storageRef);
      const matchingFile = fileList.items.find((item) =>
        item.name.startsWith(`${leagueId}_`)
      );

      return matchingFile
        ? await getDownloadURL(matchingFile)
        : "/placeholder.svg"; // Return placeholder if no match
    } catch (error) {
      console.error(`Error fetching picture for leagueId: ${leagueId}`, error);
      return "/placeholder.svg"; // Fallback to placeholder
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchPlayers = async () => {
      if (!liveEvent.id) return;

      try {
        // Fetch raw players from Firestore
        const rawPlayers = await fetchFromFirestore(
          `events/${liveEvent.id}/players`
        );

        // Map Firestore data to the Player type (if necessary)
        const players: Player[] = rawPlayers.map((raw: any) => ({
          player_id: raw.player_id,
          league_id: raw.league_id,
          Player: raw.Player,
          Team: raw.Team,
          Rank: raw.Rank,
          team_id: raw.team_id,
          Cost: raw.Cost,
          pictureLoading: true, // PICTURES ARE LOADING
        }));
        // Get unique teams from the same data
        // Extract unique teams safely
        const uniqueTeams = Array.from(
          new Set(
            rawPlayers
              .map((p: any) => p.Team)
              .filter((team): team is string => Boolean(team))
          )
        );
        if (isMounted) {
          setRowData(players);
          setTeams(uniqueTeams);
        }
      } catch (error) {
        if (isMounted) {
          console.error("Error fetching players:", error);
        }
      }
    };

    fetchPlayers();
    return () => {
      isMounted = false;
    };
  }, [liveEvent.id, setRowData]);

  useEffect(() => {
    const fetchPicturesForVisiblePlayers = async () => {
      if (!visiblePlayers.length) return;

      // Batch all updates together
      const updates = await Promise.all(
        visiblePlayers.map(async (player) => {
          if (player.picture) return null; // Skip if already loaded

          try {
            const picture = await fetchPlayerPicture(player.league_id);
            return { player_id: player.player_id, picture };
          } catch (error) {
            return {
              player_id: player.player_id,
              picture: "/placeholder.svg",
            };
          }
        })
      );

      // Single state update
      setRowData((prev) =>
        prev.map((p) => {
          const update = updates.find((u) => u?.player_id === p.player_id);
          return update
            ? { ...p, picture: update.picture, pictureLoading: false }
            : p;
        })
      );
    };

    const debounceFetch = setTimeout(fetchPicturesForVisiblePlayers, 200);
    return () => clearTimeout(debounceFetch);
  }, [visiblePlayers]);

  // Fetch user picks from the firestore if exist already
  useEffect(() => {
    if (user && liveEvent.id) {
      const fetchPicks = async () => {
        try {
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const userData = userSnap.data();

            if (
              userData.pickems &&
              liveEvent.id &&
              Array.isArray(userData.pickems[liveEvent.id])
            ) {
              const savedPicksIds = userData.pickems[liveEvent.id];

              const playerRefs = savedPicksIds.map((id: string) =>
                doc(db, `events/${liveEvent.id}/players`, id.toString())
              );

              const playerDocs = await Promise.all(
                playerRefs.map((playerRef: any) => getDoc(playerRef))
              );

              const savedPicks = playerDocs
                .filter((doc) => doc.exists())
                .map((doc) => ({ ...doc.data(), player_id: doc.id }));

              const picksWithPictures = await Promise.all(
                savedPicks.map(async (player) => {
                  const picture = await fetchPlayerPicture(player.league_id);
                  return { ...player, picture };
                })
              );

              setTemporaryPicks(picksWithPictures);
              setPlayerSlots((prevSlots) =>
                prevSlots.map((slot, index) => ({
                  ...slot,
                  player: picksWithPictures[index] || null,
                }))
              );
            } else {
              console.warn("No saved picks found for this event.");
            }
          } else {
            console.warn("User document does not exist in Firestore.");
          }
        } catch (error) {
          console.error("Error fetching saved picks:", error);
        }
      };

      fetchPicks();
    }
  }, [user, liveEvent.id, db]);

  useEffect(() => {
    const totalCost = temporaryPicks.reduce(
      (sum, player) => sum + Math.round(player.Cost),
      0
    );
    setRemainingBudget(1000000 - totalCost);
  }, [temporaryPicks]);

  const isBeforeLockDate = (lockDate: string | Date | null): boolean => {
    if (!lockDate) return false;
    const now = new Date();
    const lockDateObject = new Date(lockDate); // Safeguard for string input
    return now.getTime() < lockDateObject.getTime();
  };

  const handlePlayerAction = (player: Player) => {
    // Check if picks are locked
    if (!isBeforeLockDate(liveEvent.lockDate)) {
      toast.error(
        <div>
          <div className="font-bold">Picks Locked!</div>
          <div className="text-sm">
            The selection period ended on{" "}
            {formatLocalDateTime(liveEvent.lockDate)}
          </div>
        </div>,
        {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
        }
      );
      return;
    }

    const isSelected = temporaryPicks.some(
      (p) => p.player_id === player.player_id
    );

    if (isSelected) {
      // Remove player
      const newPicks = temporaryPicks.filter(
        (p) => p.player_id !== player.player_id
      );
      setTemporaryPicks(newPicks);
      setRemainingBudget((prev) => prev + player.Cost);

      // Update slots
      setPlayerSlots((prevSlots) =>
        prevSlots.map((slot) =>
          slot.player?.player_id === player.player_id
            ? { ...slot, player: null }
            : slot
        )
      );

      toast.success(
        <div>
          <div className="font-bold">Player Removed</div>
          <div className="text-sm">{player.Player} removed from your picks</div>
        </div>,
        {
          position: "top-right",
          autoClose: 3000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
        }
      );
    } else {
      // Add player
      if (remainingBudget - player.Cost < 0) {
        toast.error(
          <div>
            <div className="font-bold">Budget Exceeded!</div>
            <div className="text-sm">
              You need ${(player.Cost - remainingBudget).toLocaleString()} more
              to add {player.Player}
            </div>
          </div>,
          {
            position: "top-right",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
          }
        );
        return;
      }

      if (temporaryPicks.length >= 10) {
        toast.error(
          <div>
            <div className="font-bold">Maximum Players Reached</div>
            <div className="text-sm">
              You can only pick up to 10 players. Remove one to add another.
            </div>
          </div>,
          {
            position: "top-right",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
          }
        );
        return;
      }

      const newPicks = [...temporaryPicks, player];
      setTemporaryPicks(newPicks);
      setRemainingBudget((prev) => prev - player.Cost);

      // Find first empty slot
      const emptySlotIndex = playerSlots.findIndex((slot) => !slot.player);
      if (emptySlotIndex !== -1) {
        setPlayerSlots((prevSlots) =>
          prevSlots.map((slot, index) =>
            index === emptySlotIndex
              ? { ...slot, player, isSelected: false }
              : slot
          )
        );
      }

      toast.success(
        <div>
          <div className="font-bold">Player Added</div>
          <div className="text-sm">{player.Player} added to your picks</div>
        </div>,
        {
          position: "top-right",
          autoClose: 3000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
        }
      );
    }
  };
  const handleSlotSelection = (slotId: number) => {
    setPlayerSlots((prevSlots) =>
      prevSlots.map((slot) => ({
        ...slot,
        isSelected: slot.id === slotId, // Ensure only one slot is selected
      }))
    );
    setIsDrawerOpen(true);
  };

  // Add a function to close the drawer
  const closeDrawer = () => {
    setIsDrawerOpen(false);
  };
  const confirmPicks = async () => {
    if (!user) {
      toast.error("You must be logged in to confirm picks", {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
      });
      return;
    }

    if (!isBeforeLockDate(liveEvent.lockDate)) {
      toast.error("Time to select picks has passed!", {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
      });
      return;
    }

    if (temporaryPicks.length < 10) {
      toast.warning("You need to select all 10 players before confirming!", {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
      });
      return;
    }

    try {
      const pickIds = temporaryPicks.map((p) => p.player_id);
      await updateDoc(doc(db, "users", user.uid), {
        [`pickems.${liveEvent.id}`]: pickIds,
      });
      toast.success("Picks confirmed successfully!", {
        position: "top-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
      });
    } catch (error) {
      console.error("Error saving picks:", error);
      toast.error("Failed to confirm picks. Please try again.", {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
      });
    }
  };
  const formatCost = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };
  const fetchTeamLogo = async (teamId: string): Promise<string> => {
    const storage = getStorage();
    const folderPath = `t-logo/`; // Path to the folder containing team logos
    const storageRef = ref(storage, folderPath);

    console.log(`[fetchTeamLogo] Starting fetch for teamId: ${teamId}`); // Debug log

    try {
      const fileList = await listAll(storageRef);
      console.log(
        `[fetchTeamLogo] Found ${fileList.items.length} items in folder`
      ); // Debug log

      const matchingFile = fileList.items.find((item) => {
        const matches = item.name.startsWith(`${teamId}_`);
        console.log(
          `[fetchTeamLogo] Checking item ${item.name} - matches: ${matches}`
        ); // Debug log
        return matches;
      });

      if (matchingFile) {
        console.log(
          `[fetchTeamLogo] Found matching file: ${matchingFile.name}`
        ); // Debug log
        const url = await getDownloadURL(matchingFile);
        console.log(
          `[fetchTeamLogo] Successfully got URL for ${teamId}: ${url}`
        ); // Debug log
        return url;
      } else {
        console.warn(
          `[fetchTeamLogo] No matching file found for teamId: ${teamId}`
        ); // Debug log
        return "/team-placeholder.svg";
      }
    } catch (error) {
      console.error(
        `[fetchTeamLogo] Error fetching logo for teamId: ${teamId}`,
        error
      ); // Debug log
      return "/team-placeholder.svg";
    }
  };
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({});
  const [logosLoading, setLogosLoading] = useState(true);

  // Fetch all team logos when component mounts
  useEffect(() => {
    const fetchAllTeamLogos = async () => {
      const storage = getStorage();
      const folderPath = "t-logo/";
      const storageRef = ref(storage, folderPath);

      try {
        const fileList = await listAll(storageRef);
        const logoPromises = fileList.items.map(async (item) => {
          const teamId = item.name.split("_")[0];
          const url = await getDownloadURL(item);
          return { teamId, url };
        });

        const fetchedLogos = await Promise.all(logoPromises);
        const logoMap = fetchedLogos.reduce((acc, { teamId, url }) => {
          acc[teamId] = url;
          return acc;
        }, {} as Record<string, string>);

        setTeamLogos(logoMap);
      } catch (error) {
        console.error("Error fetching team logos:", error);
      } finally {
        setLogosLoading(false);
      }
    };

    fetchAllTeamLogos();
  }, []);
  const PlayerCard = memo(function PlayerCard({
    player,
    isSelected = false,
    isSlot = false,
    onClick,
    teamLogos, // Pass the logos as prop
  }: {
    player?: Player;
    isSelected?: boolean;
    isSlot?: boolean;
    onClick?: () => void;
    teamLogos: Record<string, string>;
  }) {
    const teamLogo = player?.team_id ? teamLogos[player.team_id] : null;

    return (
      <div
        key={
          player ? `${player.Player}-${player.Team || "unknown"}` : "empty-slot"
        }
        className={`relative flex flex-col ${
          isSlot ? "mx-0" : "mx-1"
        } mb-2 rounded-3xl border-2 border-blue-600/80 bg-gray-700 cursor-pointer hover:shadow-lg hover:shadow-blue-600/50 transition-shadow duration-200`}
        onClick={(e) => {
          e.stopPropagation();
          if (onClick) onClick();
        }}
      >
        {/* Top Section */}
        <div className="rounded-t-3xl p-2 ring-1 bg-gray-800 ring-blue-600/80">
          <div className="relative overflow-hidden pb-3 rounded-t-2xl">
            {/* Left and Right Logos */}
            {/* <div className="absolute start-0 top-0 aspect-square w-[76px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-600/80 bg-gray-800 z-10 pointer-events-none" />

            // {/* Team Logo - Right Corner */}
            {/* <div
              className="absolute end-0 top-0 aspect-square w-[40px] translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-600/80 bg-gray-800 z-10 pointer-events-none overflow-hidden"
              style={{
                backgroundImage: `url(${teamLogo || "/team-placeholder.svg"})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            /> */}

            <div className="overflow-hidden">
              <div
                className={`relative ${
                  isSlot ? "h-[90px] md:h-[110px]" : "h-[90px]"
                } border-2 bg-gradient-to-b from-orange-500 to-yellow-500 [clip-path:polygon(0_0,_100%_0,_100%_87%,_50%_100%,_0_87%)] border-blue-600/80`}
              >
                {player?.pictureLoading ? (
                  <div className="absolute top-0 bottom-0 left-0 right-0 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                  </div>
                ) : (
                  <>
                    <div className="pointer-events-none absolute -translate-x-1/4 left-0 top-5 -z-10 text-center text-2xl md:text-4xl font-extrabold tracking-tighter text-white uppercase italic opacity-40 mix-blend-overlay">
                      <div className="whitespace-break-spaces ">
                        {player?.Player || "PLAYER"}
                      </div>
                    </div>
                    <div
                      className="absolute top-0 bottom-0 left-0 right-0 flex flex-col pointer-events-none"
                      style={{
                        backgroundImage: `url(${
                          player?.picture || "/placeholder.svg"
                        })`,
                        backgroundSize: "cover",
                        backgroundPosition: "40 center",
                      }}
                    />
                  </>
                )}
              </div>
            </div>

            {/* Action Button */}
            <div className="absolute start-1/2 bottom-0 flex md:h-8 md:w-8 h-6 w-6 -translate-x-1/2 items-center justify-center rounded-2xl bg-gradient-to-b from-orange-500 to-yellow-500 text-2xl/none font-extrabold tracking-tighter text-white">
              {isSlot ? (
                <IoMdClose className="text-white" />
              ) : isSelected ? (
                <TiTick className="text-white" />
              ) : (
                <PiPlusBold />
              )}
            </div>
          </div>

          {/* Player Name */}
          <div className="pt-1 pb-1 text-center text-white md:px-2 pointer-events-none">
            <h2
              className={`${
                isSlot ? "text-[10px] md:text-[14px]" : "text-[10px]"
              } font-bold tracking-tight whitespace-nowrap overflow-hidden text-ellipsis`}
            >
              {player?.Player || "Empty Slot"}
            </h2>
            {player?.Team && (
              <div
                className={`${
                  isSlot ? "text-[10px] md:text-[12px]" : "text-[10px]"
                } mt-1`}
              >
                {player.Team}
              </div>
            )}
          </div>
        </div>

        {/* Cost Section */}
        {player?.Cost && (
          <div className="mx-auto flex w-full justify-center border-t-2 border-blue-500/80 items-center py-2 text-white bg-gray-800 rounded-b-3xl pointer-events-none">
            <div
              className={`${
                isSlot ? "text-[10px] md:text-[12px]" : "text-[10px]"
              } font-bold`}
            >
              {formatCost(player.Cost)}
            </div>
          </div>
        )}
      </div>
    );
  });

  const formatLocalDateTime = (utcDate: Date | null): string => {
    if (!utcDate) return "No lock date available";

    try {
      return new Date(utcDate).toLocaleString(navigator.language, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
    } catch (error) {
      console.error("Error formatting date:", error);
      return "Invalid date";
    }
  };

  return (
    <div className="relative flex flex-col md:flex-row w-auto md:h-full mt-7 md:overflow-hidden">
      {/* Left Section - Fixed Header with Conditional Scroll */}
      <div className="relative flex flex-col w-full md:w-[60vw] h-[90vh] z-10 border-white/30 border-r">
        {/* Fixed Alert Container */}
        <div className="w-full md:py-3 py-1 bg-gradient-to-b from-[#360e0edf] to-[#00000065] text-white flex items-center justify-between">
          {/* Left Content */}
          <div className="flex flex-col gap-1 md:mx-10 mx-4 md:text-base text-[10px] whitespace-nowrap my-2 font-azonix">
            <div>
              Pick’Em closing on {""} <br className="md:hidden" />
              {formatLocalDateTime(liveEvent.lockDate)}
            </div>
            <div>Budget: ${remainingBudget.toLocaleString()}</div>
          </div>

          {/* Right Button */}
          <button
            className="flex flex-row items-center gap-2 p-2 mx-4 backdrop-blur bg-white bg-opacity-10 text-white rounded-[36px] md:mr-10"
            onClick={confirmPicks}
          >
            <RiLock2Line size={20} />
            <span className="md:text-base text-[12px] whitespace-nowrap">
              Save Picks
            </span>
          </button>
        </div>

        {/* Content Area - Scroll only on mobile */}
        <div className="md:overflow-hidden overflow-y-auto flex-1 relative">
          {/* Background Image */}
          <div
            className="absolute inset-0 -z-10"
            style={{
              backgroundImage: "url(/pick-em.webp)",
              backgroundSize: "cover",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            }}
          />

          {/* Cards Container */}
          <div className="relative h-full py-6 md:overflow-visible overflow-y-auto">
            <AnimatedGroup
              preset="scale"
              className="relative grid md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 grid-cols-2 gap-3 md:gap-6  pb-8 items-center justify-center lg:justify-evenly m-auto md:px-4 w-5/6 lg:w-full"
            >
              {playerSlots.map((slot) => (
                <div key={slot.id} className="relative">
                  {slot.player ? (
                    <PlayerCard
                      player={slot.player}
                      isSlot={true}
                      onClick={() => handlePlayerAction(slot.player!)}
                      teamLogos={teamLogos}
                    />
                  ) : (
                    <button
                      onClick={() => handleSlotSelection(slot.id)}
                      className={`relative flex flex-col gap-0 justify-center m-auto items-center rounded-2xl border-2 ${
                        slot.isSelected
                          ? "border-black ring-2 ring-black bg-gradient-to-b from-white/10 to-red-800/80"
                          : "border-white bg-gradient-to-b from-white/10 to-red-800/80"
                      } md:h-[24vh] w-full h-[100px]`}
                    >
                      <GiCardPickup size={40} className="text-white/60" />
                      <span className="text-xl uppercase text-white/60 font-azonix mt-2">
                        {slot.position}
                      </span>
                    </button>
                  )}
                </div>
              ))}
            </AnimatedGroup>
          </div>
        </div>
      </div>

      {/* Right Section - Player Selection */}
      <div className="md:flex flex-col w-full md:w-[35vw] mt-6 md:h-full hidden h-[50vh] overflow-hidden">
        <h1 className="text-xl font-azonix text-white text-center font-bold mb-4">
          Select your Picks
        </h1>
        <div className="px-4 mb-2">
          <FilterUI
            onFilter={({
              searchTerm: newSearchTerm,
              costRange: newCostRange,
              selectedTeams: newSelectedTeams,
            }) => {
              setSearchTerm(newSearchTerm);
              setCostRange(newCostRange);
              setSelectedTeams(newSelectedTeams);
              setVisiblePlayersCount(9);
            }}
            onSort={handleSort}
            teams={teams}
          />
        </div>

        <div
          className="flex flex-col h-auto overflow-y-scroll px-2"
          ref={desktopScrollRef}
        >
          <motion.div
            className="py-4 grid grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 text-center"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { staggerChildren: 0.1 },
              },
            }}
          >
            <AnimatePresence>
              {visiblePlayers.map((player) => {
                const isSelected = temporaryPicks.some(
                  (p) => String(p.player_id) === String(player.player_id)
                );
                return (
                  <motion.div
                    key={`desktop-${player.player_id}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <PlayerCard
                      player={player}
                      isSelected={isSelected}
                      onClick={() => handlePlayerAction(player)}
                      teamLogos={teamLogos}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>

          {/* Loading and empty states */}
          {isLoadingMore ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-center mx-auto flex-col items-center py-8"
            >
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white mb-4"></div>
              <div className="text-white/70">Fetching players data</div>
            </motion.div>
          ) : (
            visiblePlayers.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-8 text-white/70"
              >
                No players match your filters
              </motion.div>
            )
          )}
        </div>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isDrawerOpen && (
          <motion.div
            className="fixed md:hidden top-28 -mt-3 border-t-2 border-white/20 left-0 right-0 z-30 bg-[#0a0a0a] shadow-xl"
            style={{ height: "80vh" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
          >
            <div className="flex flex-col h-full">
              <div className="flex justify-between items-center p-4 flex-shrink-0">
                <h1 className="text-base font-azonix text-white font-bold">
                  Select your Picks
                </h1>
                <button onClick={closeDrawer} className="text-white">
                  <IoMdClose size={24} />
                </button>
              </div>

              <div className="px-4 mb-3">
                <FilterUI
                  onFilter={({
                    searchTerm: newSearchTerm,
                    costRange: newCostRange,
                    selectedTeams: newSelectedTeams,
                  }) => {
                    setSearchTerm(newSearchTerm);
                    setCostRange(newCostRange);
                    setSelectedTeams(newSelectedTeams);
                    setVisiblePlayersCount(9);
                  }}
                  onSort={handleSort}
                  teams={teams}
                />
              </div>

              <div
                className="flex-1 overflow-y-auto px-3 touch-pan-y" // Added touch-pan-y
                ref={mobileScrollRef}
                style={{
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                  overscrollBehavior: "contain",
                }}
              >
                <motion.div
                  className="py-4 grid grid-cols-2 gap-3 text-center"
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { staggerChildren: 0.1 },
                    },
                  }}
                >
                  <AnimatePresence>
                    {visiblePlayers.map((player) => {
                      const isSelected = temporaryPicks.some(
                        (p) => String(p.player_id) === String(player.player_id)
                      );
                      return (
                        <motion.div
                          key={`mobile-${player.player_id}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <PlayerCard
                            player={player}
                            isSelected={isSelected}
                            onClick={() => handlePlayerAction(player)}
                            teamLogos={teamLogos}
                          />
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>

                {/* Loading and empty states */}
                {isLoadingMore ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-center mx-auto flex-col items-center py-8"
                  >
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white mb-4"></div>
                    <div className="text-white/70">Fetching players data</div>
                  </motion.div>
                ) : (
                  visiblePlayers.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-8 text-white/70"
                    >
                      No players match your filters
                    </motion.div>
                  )
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
