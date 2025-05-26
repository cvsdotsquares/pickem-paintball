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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  team_id: number;
  Cost: number;
  league_id: string; // Added league_id
  picture?: string; // Optional picture URL
  pictureLoading?: boolean; // check loaded
}

interface PlayerSlotProps {
  position: string;
  isSelected: boolean;
  onSelect: () => void; // Add this line
  player?: Player;
}

export interface Event {
  id: string;
  name: string;
  status: string;
}

export default function Pickems() {
  const [playerSlots, setPlayerSlots] = useState(
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
  const [rowData, setRowData] = useState<any[]>([]);
  const [remainingBudget, setRemainingBudget] = useState(1000000); // $1,000,000 initial budget
  const [visiblePlayersCount, setVisiblePlayersCount] = useState(9);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [costRange, setCostRange] = useState<[number, number]>([0, 1000000]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [teams, setTeams] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [sortOption, setSortOption] = useState<{
    field: string;
    direction: "asc" | "desc";
  }>({
    field: "name",
    direction: "asc",
  });

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

  const visiblePlayers = useMemo(() => {
    return filteredPlayers.slice(0, visiblePlayersCount);
  }, [filteredPlayers, visiblePlayersCount]);

  // Updated scroll handler
  const handleScroll = useCallback(() => {
    if (isLoadingMore || visiblePlayers.length >= filteredPlayers.length)
      return;

    // Check both containers
    const container = mobileScrollRef.current || desktopScrollRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - (scrollTop + clientHeight) < 100;

    if (isNearBottom) {
      setIsLoadingMore(true);
      setTimeout(() => {
        setVisiblePlayersCount((prev) =>
          Math.min(prev + 9, filteredPlayers.length)
        );
        setIsLoadingMore(false);
      }, 300);
    }
  }, [isLoadingMore, visiblePlayers.length, filteredPlayers.length]);

  const db = getFirestore();
  const { user } = useAuth();

  // Helper to fetch documents from Firestore
  const fetchFromFirestore = async (path: string) => {
    const ref = collection(db, path);
    const snapshot = await getDocs(ref);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  };

  // Your existing scroll effect
  useEffect(() => {
    const containers: any[] = [];
    if (desktopScrollRef.current) containers.push(desktopScrollRef.current);
    if (mobileScrollRef.current) containers.push(mobileScrollRef.current);

    containers.forEach((container) => {
      container.addEventListener("scroll", handleScroll);
    });

    return () => {
      containers.forEach((container) => {
        container.removeEventListener("scroll", handleScroll);
      });
    };
  }, [handleScroll]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisiblePlayersCount(9);
  }, [searchTerm, costRange, selectedTeams]);

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
      const diff = lockDate.getTime() - now.getTime();

      if (diff <= 0) {
        setLiveEvent((prev) => ({ ...prev, timeLeft: "Picks locked!" }));
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setLiveEvent((prev) => ({
        ...prev,
        timeLeft: `${hours}h ${minutes}m ${seconds}s`,
      }));
    };

    const interval = setInterval(updateTimeLeft, 1000);
    updateTimeLeft(); // Call immediately to update state without delay
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
        setRowData(players); // Set data immediately with loading state
        setTeams(uniqueTeams);
      } catch (error) {
        console.error("Error fetching players:", error);
      }
    };

    fetchPlayers();
  }, [liveEvent.id]);

  useEffect(() => {
    const fetchPicturesForVisiblePlayers = async () => {
      if (!visiblePlayers.length) return;

      const updatedPlayers = await Promise.all(
        visiblePlayers.map(async (player) => {
          if (player.picture) return player; // Skip if picture already exists

          try {
            const picture = await fetchPlayerPicture(player.league_id);
            return { ...player, picture, pictureLoading: false };
          } catch (error) {
            console.error(
              `Error fetching picture for ${player.Player}:`,
              error
            );
            return {
              ...player,
              picture: "/placeholder.svg",
              pictureLoading: false,
            };
          }
        })
      );

      setRowData((prevRowData) =>
        prevRowData.map(
          (player) =>
            updatedPlayers.find((p) => p.player_id === player.player_id) ||
            player
        )
      );
    };

    const debounceFetch = setTimeout(fetchPicturesForVisiblePlayers, 200);

    return () => clearTimeout(debounceFetch); // Cleanup for debouncing
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

  // New check to see if we are before lockDate
  const isBeforeLockDate =
    liveEvent.lockDate && new Date() < liveEvent.lockDate;

  const handleRemovePlayer = (slotId: number) => {
    const removedPlayer = playerSlots.find(
      (slot) => slot.id === slotId
    )?.player;

    if (removedPlayer) {
      setTemporaryPicks((prevPicks) =>
        prevPicks.filter(
          (player) => player.player_id !== removedPlayer.player_id
        )
      );
    }

    setPlayerSlots((prevSlots) =>
      prevSlots.map((slot) =>
        slot.id === slotId ? { ...slot, player: null } : slot
      )
    );
  };

  // Handle player selection and update cost
  const handleSelectPlayer = (player: Player) => {
    // Check if player is already selected
    const isAlreadySelected = temporaryPicks.some(
      (p) => p.player_id === player.player_id
    );

    if (isAlreadySelected) {
      toast.warning(`${player.Player} is already in your picks!`, {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
      });
      return;
    }

    // Check budget
    const newCost = player.Cost;
    if (remainingBudget - newCost < 0) {
      toast.error(`Budget exceeded! Remove a player to add ${player.Player}.`, {
        position: "top-center",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
      });
      return;
    }

    // Check max players
    if (temporaryPicks.length >= 10) {
      toast.error("You can only pick up to 10 players.", {
        position: "top-center",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
      });
      return;
    }

    // Add player to temporary picks
    setTemporaryPicks((prev) => [...prev, player]);

    // Update budget
    setRemainingBudget((prevBudget) => prevBudget - newCost);

    // Update slots
    setPlayerSlots((prevSlots) => {
      const selectedSlotIndex = prevSlots.findIndex((slot) => slot.isSelected);
      const newSlots = [...prevSlots];

      // If selected slot is empty, place player there
      if (selectedSlotIndex !== -1 && !newSlots[selectedSlotIndex].player) {
        newSlots[selectedSlotIndex].player = { ...player };
        return newSlots;
      }

      // Find next empty slot
      const nextEmptySlotIndex = newSlots.findIndex((slot) => !slot.player);

      if (nextEmptySlotIndex !== -1) {
        newSlots[nextEmptySlotIndex].player = { ...player };

        // Update selection to the newly filled slot
        newSlots.forEach((slot, index) => {
          slot.isSelected = index === nextEmptySlotIndex;
        });

        // Show success notification
        toast.success(`${player.Player} added to your picks!`, {
          position: "top-center",
          autoClose: 3000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
        });

        return newSlots;
      }

      // If all slots are full (shouldn't reach here due to previous check)
      toast.error("All slots are full. Please clear a slot to add this pick.", {
        position: "top-center",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
      });

      return prevSlots;
    });
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
    if (!user) return;

    if (temporaryPicks.length < 10) {
      alert(`You need to select all 10 players before confirming!`);
      return;
    }
    const { lockDate } = liveEvent;
    if (lockDate && new Date() > lockDate) {
      alert("Time to select picks have passed away! Try again next event.");
      return;
    }

    try {
      const pickIds = temporaryPicks.map((p) => p.player_id);
      await updateDoc(doc(db, "users", user.uid), {
        [`pickems.${liveEvent.id}`]: pickIds,
      });
      alert("Picks confirmed!");
    } catch (error) {
      console.error("Error saving picks:", error);
      alert("An error occurred while confirming your picks. Please try again.");
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
  // Reusable PlayerCard component
  const PlayerCard = ({
    player,
    isSelected = false,
    onClick,
    isMobile = false,
    isSlot = false,
    onRemove,
  }: {
    player?: Player;
    isSelected?: boolean;
    onClick?: () => void;
    isMobile?: boolean;
    isSlot?: boolean;
    onRemove?: () => void;
  }) => {
    return (
      <div
        className={`flex flex-col ${isSlot ? "mx-0" : "mx-1"} ${
          isMobile ? "mb-3" : "mb-2"
        }`}
      >
        <div className="relative rounded-3xl border-2 border-blue-600/80 bg-gray-700 ">
          <div className="rounded-t-3xl p-2 ring-1 bg-gray-800 ring-blue-600/80">
            <div className="relative overflow-hidden pb-3">
              {/* Logo spaces */}
              <div className="absolute start-0 top-0 aspect-square w-[76px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-600/80 bg-gray-800 z-10" />
              <div className="absolute end-0 top-0 aspect-square w-[76px] translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-600/80 bg-gray-800 z-10" />

              <div className="overflow-hidden">
                <div
                  className={`relative ${
                    isMobile
                      ? "h-[130px]"
                      : isSlot
                      ? "h-[90px] md:h-[110px]"
                      : "h-[130px]"
                  } border-2 bg-gradient-to-b from-orange-500 to-yellow-500 [clip-path:polygon(0_0,_100%_0,_100%_87%,_50%_100%,_0_87%)] border-blue-600/80`}
                >
                  {player?.pictureLoading ? (
                    <div className="absolute top-0 bottom-0 left-0 right-0 flex items-center justify-center">
                      <motion.div
                        className="absolute top-0 bottom-0 left-0 right-0 flex"
                        style={{
                          backgroundImage: `url("/placeholder.svg")`,
                          backgroundSize: "cover",
                          backgroundPosition: "40 center",
                        }}
                      />
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                    </div>
                  ) : (
                    <>
                      <div className="pointer-events-none absolute -translate-x-1/4 left-0 top-5 -z-10   text-center text-4xl font-extrabold tracking-tighter text-white uppercase italic opacity-40 mix-blend-overlay">
                        <div className="whitespace-break-spaces">
                          {player?.Player || "PLAYER"}
                        </div>
                      </div>
                      <div
                        className="absolute top-0 bottom-0 left-0 right-0 flex flex-col"
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
              {isSlot ? (
                // For slots (left section) - always show red cross
                <div
                  className="absolute start-1/2 bottom-0 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-2xl bg-gradient-to-b from-orange-500 to-yellow-500 text-2xl/none font-extrabold tracking-tighter text-white cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onRemove) onRemove();
                  }}
                >
                  <IoMdClose className="text-white" />
                </div>
              ) : isSelected ? (
                // For selected cards in right section
                <>
                  <div
                    className="absolute start-1/2 bottom-0 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-2xl bg-gradient-to-b from-orange-500 to-yellow-500 text-2xl/none font-extrabold tracking-tighter text-white cursor-pointer "
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onRemove) onRemove();
                    }}
                  >
                    <TiTick className="text-white" />
                  </div>
                </>
              ) : (
                // For unselected cards in right section
                <div
                  className="absolute start-1/2 bottom-0 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-2xl bg-gradient-to-b from-orange-500 to-yellow-500 text-2xl/none font-extrabold tracking-tighter text-white cursor-pointer"
                  onClick={onClick}
                >
                  <PiPlusBold />
                </div>
              )}
            </div>

            <div className="pt-1 pb-1 text-center text-white px-2">
              <h2
                className={`${
                  isSlot ? "text-[12px] md:text-[14px]" : "text-[12px]"
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

          {player?.Cost && (
            <div className="mx-auto flex w-full justify-center border-t-2 border-blue-500/80 items-center py-2 text-white bg-gray-800 rounded-b-3xl">
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
      </div>
    );
  };

  const handleRemoveSelectedPlayer = (player: Player) => {
    // Find which slot the player is in
    const slotIndex = playerSlots.findIndex(
      (slot) => slot.player?.player_id === player.player_id
    );

    // Remove player from temporary picks
    setTemporaryPicks((prevPicks) => {
      const newPicks = prevPicks.filter(
        (p) => p.player_id !== player.player_id
      );

      // Show notification if player was actually removed
      if (newPicks.length < prevPicks.length) {
        toast.success(`${player.Player} removed from your picks!`, {
          position: "top-center",
          autoClose: 3000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
        });
      } else {
        toast.error(`Failed to remove ${player.Player}`, {
          position: "top-center",
          autoClose: 3000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
        });
      }

      return newPicks;
    });

    // Update budget
    setRemainingBudget((prevBudget) => prevBudget + player.Cost);

    // Update slots - clear the slot where this player was
    setPlayerSlots((prevSlots) => {
      const newSlots = [...prevSlots];
      if (slotIndex !== -1) {
        newSlots[slotIndex] = {
          ...newSlots[slotIndex],
          player: null,
          isSelected: true, // Select the slot after removal
        };
      }
      return newSlots;
    });

    // If removing from right section (not slot), also update selection
    if (slotIndex === -1) {
      setPlayerSlots((prevSlots) => {
        const firstEmptySlotIndex = prevSlots.findIndex((slot) => !slot.player);
        if (firstEmptySlotIndex !== -1) {
          return prevSlots.map((slot, index) => ({
            ...slot,
            isSelected: index === firstEmptySlotIndex,
          }));
        }
        return prevSlots;
      });
    }
  };
  return (
    <div className="relative flex flex-col md:flex-row w-auto md:h-full mt-7 md:overflow-hidden">
      {/* Left Section */}
      <div className=" w-full md:w-[60vw] h-[90vh] z-10 items-center md:overflow-y-auto border-white/30 border-r ">
        <div className="grid  overflow-hidden  w-full">
          <div
            role="alert"
            className="relative w-full md:py-3 py-2  bg-gradient-to-b from-[#360e0edf] to-[#00000065] text-white flex items-center justify-between"
          >
            {/* Left Content */}
            <div className="flex flex-col gap-1 mx-10 md:text-xs text-[10px] whitespace-nowrap my-2 font-azonix">
              <div>
                Pickems closing on {""} <br className="md:hidden" />
                {liveEvent.lockDate
                  ? new Date(liveEvent.lockDate).toLocaleString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "No lock date available"}
              </div>
              <div>Budget: ${remainingBudget.toLocaleString()}</div>
            </div>

            {/* Right Button */}
            <button
              className="flex flex-row items-center gap-2 md:px-4 md:py-1 p-3 backdrop-blur bg-white bg-opacity-10 text-white rounded-[36px] mr-10"
              onClick={confirmPicks}
            >
              <RiLock2Line size={20} />
              <span className="md:text-base text-[12px] whitespace-nowrap">
                Save Picks
              </span>
            </button>
          </div>
        </div>

        {/* Image Container */}
        <div
          className="relative left-0 top-0 p-1  flex h-full flex-col "
          style={{
            backgroundImage: "url(/pick-em.JPG)",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
          }}
        >
          <AnimatedGroup
            preset="scale"
            className="relative grid grid-cols-5 gap-3 md:gap-6 top-5 py-1 items-center justify-evenly  md:px-2 w-full"
          >
            {playerSlots.map((slot) => (
              <div key={slot.id} className="relative">
                {slot.player ? (
                  <PlayerCard
                    player={slot.player}
                    isSlot={true}
                    onRemove={() => handleRemovePlayer(slot.id)}
                  />
                ) : (
                  <button
                    onClick={() => handleSlotSelection(slot.id)}
                    className={`relative flex flex-col gap-0 justify-center items-center rounded-2xl border-2 ${
                      slot.isSelected
                        ? "border-black ring-2 ring-black bg-gradient-to-b from-white/10 to-red-800/80"
                        : "border-white bg-gradient-to-b from-white/10 to-red-800/80"
                    } md:h-[24vh] md:w-[9vw] w-[70px] h-[100px]`}
                  >
                    <GiCardPickup size={40} className="text-white/60" />
                    <span className="text-xl text-white/60 font-azonix mt-2">
                      {slot.position}
                    </span>
                  </button>
                )}
              </div>
            ))}
          </AnimatedGroup>
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
            className="py-4 grid grid-cols-3 gap-3 text-center"
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
                      onClick={() => handleSelectPlayer(player)}
                      onRemove={() => handleRemoveSelectedPlayer(player)}
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
            className="fixed md:hidden top-36 -mt-3 border-t-2 border-white/20 left-0 right-0 z-30 bg-[#0a0a0a] shadow-xl"
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
                className="flex-1 overflow-y-scroll px-3"
                ref={mobileScrollRef}
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
                            isMobile={true}
                            onClick={() => handleSelectPlayer(player)}
                            onRemove={() => handleRemoveSelectedPlayer(player)}
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
