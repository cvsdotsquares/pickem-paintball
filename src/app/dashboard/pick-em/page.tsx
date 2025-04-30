"use client";
import { AnimatedGroup } from "@/src/components/ui/animations/grp";
import { FilterUI, PickCard } from "@/src/components/ui/player-card";
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

export interface Player {
  player_id: number;
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

  // In your component
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);

  // Memoized filtered players
  const filteredPlayers = useMemo(() => {
    // Create a filtered array
    let result = [...rowData];

    // Apply search filter if term exists
    if (searchTerm) {
      result = result.filter((player) => {
        return (
          player.Player.toLowerCase().includes(searchTerm.toLowerCase()) ||
          player.Team.toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
    }

    // Apply cost filter
    result = result.filter((player) => {
      return player.Cost >= costRange[0] && player.Cost <= costRange[1];
    });

    // Default A-Z sorting when no search term
    if (!searchTerm) {
      result.sort((a, b) => a.Player.localeCompare(b.Player));
    }

    return result;
  }, [rowData, searchTerm, costRange]);

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

  // Updated useEffect for scroll listeners
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
  }, [searchTerm, costRange]);

  // Updated handleFilter function
  const handleFilter = ({
    searchTerm: newSearchTerm,
    costRange: newCostRange,
  }: {
    searchTerm: string;
    costRange: [number, number];
  }) => {
    setSearchTerm(newSearchTerm);
    setCostRange(newCostRange);
  };

  // Fetch live event details
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
          } else {
            console.warn("Live event document does not exist.");
          }
        } else {
          console.warn("No live event found.");
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
        setRowData(players); // Set data immediately with loading state
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

              // Fetch pictures for players
              const picksWithPictures = await Promise.all(
                savedPicks.map(async (player) => {
                  const picture = await fetchPlayerPicture(player.league_id);
                  return { ...player, picture }; // Add picture URL
                })
              );

              setTemporaryPicks(picksWithPictures); // Set picks with pictures
              setPlayerSlots((prevSlots) =>
                prevSlots.map((slot, index) => ({
                  ...slot,
                  player: picksWithPictures[index] || null,
                }))
              );

              const totalCost = picksWithPictures.reduce(
                (sum, player) => sum + (player?.Cost || 0),
                0
              );
              setRemainingBudget(1000000 - totalCost);
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

  // New check to see if we are before lockDate
  const isBeforeLockDate =
    liveEvent.lockDate && new Date() < liveEvent.lockDate;

  const handleRemovePlayer = (slotId: number) => {
    setPlayerSlots((prevSlots) =>
      prevSlots.map((slot) =>
        slot.id === slotId ? { ...slot, player: null } : slot
      )
    );
    const removedPlayer = playerSlots.find(
      (slot) => slot.id === slotId
    )?.player;
    if (removedPlayer) {
      setRemainingBudget((prevBudget) => prevBudget + removedPlayer.Cost); // Refund cost
    }
    setTemporaryPicks((prevPicks) =>
      prevPicks.filter(
        (player) =>
          !playerSlots.find(
            (slot) =>
              slot.id === slotId && slot.player?.player_id === player.player_id
          )
      )
    );
  };

  // Handle player selection and update cost
  const handleSelectPlayer = (player: Player) => {
    const isAlreadySelected = temporaryPicks.some(
      (p) => p.player_id === player.player_id
    );
    if (isAlreadySelected) return;

    const newCost = player.Cost;
    if (remainingBudget - newCost < 0) {
      alert("Budget exceeded! Remove a player to add this pick.");
      return;
    }

    if (temporaryPicks.length >= 10) {
      alert("You can only pick up to 10 players.");
      return;
    }

    setTemporaryPicks((prev) => [...prev, player]);
    setRemainingBudget((prevBudget) => prevBudget - newCost);

    setPlayerSlots((prevSlots) => {
      const selectedSlotIndex = prevSlots.findIndex((slot) => slot.isSelected);

      if (selectedSlotIndex !== -1 && !prevSlots[selectedSlotIndex].player) {
        const newSlots = [...prevSlots];
        newSlots[selectedSlotIndex].player = { ...player }; // Assign full player object
        return newSlots;
      }

      const nextEmptySlotIndex = prevSlots.findIndex((slot) => !slot.player);

      if (nextEmptySlotIndex !== -1) {
        const newSlots = [...prevSlots];
        newSlots[nextEmptySlotIndex].player = { ...player }; // Assign full player object

        newSlots.forEach((slot, index) => {
          slot.isSelected = index === nextEmptySlotIndex;
        });

        return newSlots;
      }

      alert("All slots are full. Please clear a slot to add this pick.");
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

  return (
    <div className="relative flex flex-col md:flex-row w-auto md:h-full mt-7  md:overflow-hidden">
      {/* Left Section */}
      <div className="relative w-full md:w-[60vw] h-[90vh] z-10 items-center md:overflow-y-scroll border-white/30 border-r ">
        <div className="grid  overflow-hidden  w-full ">
          <div
            role="alert"
            className="relative w-full md:py-3 py-2  z-40 bg-gradient-to-b from-[#360e0edf] to-[#00000065] text-white flex items-center justify-between"
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
          className="relative left-0 top-0 p-1 flex h-full flex-col  "
          style={{
            backgroundImage: "url(/pick-em.JPG)",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
          }}
        >
          {/* <h1 className="text-xl font-azonix text-white text-center pt-4 font-bold"></h1> */}
          <AnimatedGroup
            preset="scale"
            className="relative grid grid-cols-5 gap-1 md:gap-6 top-20 py-1 items-center justify-evenly md:px-2 w-full"
          >
            {playerSlots.map((slot, index) => (
              <div key={slot.id} className="relative">
                {/* Display Team and Cost */}
                {slot.player && (
                  <div
                    className={`absolute ${
                      index < 5 ? "-top-12" : "-bottom-12"
                    } left-0 right-0 flex flex-col items-center`}
                  >
                    <div className="text-white md:text-sm text-[12px] font-semibold">
                      {slot.player.Team}
                    </div>
                    <div className="text-white text-xs">
                      {formatCost(slot.player.Cost)}
                    </div>
                  </div>
                )}

                {/* Player Card */}
                {slot.player ? (
                  <div
                    className="relative gap-3"
                    onClick={() => handleRemovePlayer(slot.id)}
                  >
                    <div className="flex flex-col gap-2 cursor-pointer transition duration-300 ease-in-out hover:scale-95 hover:drop-shadow-2xl">
                      <div className="relative justify-center m-auto md:h-[24vh] md:w-[9vw] w-[70px] h-[100px] bg-gradient-to-b from-[#862121] to-[#000000] rounded-2xl overflow-hidden text-white">
                        {slot.player.pictureLoading ? (
                          <div className="absolute top-0 bottom-0 left-0 right-0 flex items-center justify-center">
                            <motion.div
                              className="absolute top-0 bottom-0 left-0 right-0 flex scale-[85%]"
                              style={{
                                backgroundImage: `url("/placeholder.svg")`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                              }}
                            />
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                          </div>
                        ) : (
                          <motion.div
                            className="absolute top-0 bottom-0 left-0 right-0 flex scale-[85%]"
                            style={{
                              backgroundImage: `url(${
                                slot.player.picture || "/placeholder.svg"
                              })`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }}
                          />
                        )}
                        <div className="absolute bottom-0 left-0 right-0 md:p-2 p-1 backdrop-filter backdrop-brightness-50 text-center z-10">
                          <h3 className="md:text-xs text-[10px] leading-5 font-azonix mix-blend-difference">
                            {slot.player.Player}
                          </h3>
                        </div>
                      </div>
                    </div>
                    <div
                      className="absolute top-1 right-1 md:right-2 z-30 text-black hover:text-white cursor-pointer"
                      onClick={() => handleRemovePlayer(slot.id)}
                    >
                      <IoMdCloseCircle size={20} />
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => handleSlotSelection(slot.id)}
                    className={`relative flex flex-col gap-0 justify-center items-center rounded-2xl border ${
                      slot.isSelected
                        ? "border-black ring-4 ring-inherit ring-black border-2 bg-gradient-to-b from-white/10 to-red-800/80"
                        : "border-white bg-gradient-to-b from-white/10 to-red-800/80"
                    } md:h-[24vh] md:w-[9vw] w-[70px] h-[100px]`}
                  >
                    <GiCardPickup size={60} className="text-white/60 ml-2 " />
                    <span className="text-xl text-white/60 font-azonix">
                      {slot.position}
                    </span>
                  </button>
                )}
              </div>
            ))}
          </AnimatedGroup>
        </div>
      </div>

      <div className="md:flex flex-col w-full md:w-[40vw] mt-10 md:h-full hidden  h-[50vh] overflow-hidden">
        <h1 className="text-xl font-azonix text-white text-center font-bold">
          Select your Picks
        </h1>
        <FilterUI
          onFilter={({
            searchTerm: newSearchTerm,
            costRange: newCostRange,
          }) => {
            setSearchTerm(newSearchTerm);
            setCostRange(newCostRange);
            // Reset to first page when filters change
            setVisiblePlayersCount(9);
          }}
        />

        <div
          className="flex flex-col h-auto overflow-y-scroll"
          ref={desktopScrollRef}
        >
          <motion.div
            className="py-4 grid grid-cols-3 px-1 text-center mt-4"
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
              {visiblePlayers.map((player) => (
                <motion.div
                  key={player.player_id}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.3 }}
                  onClick={() => handleSelectPlayer(player)}
                >
                  <div className="flex flex-col gap-2 cursor-pointer transition duration-300 ease-in-out hover:scale-95 hover:drop-shadow-2xl">
                    <div className="relative justify-center m-auto md:h-[24vh] md:w-[9vw] w-[90px] h-[120px] bg-gradient-to-b from-[#862121] to-[#000000] rounded-2xl overflow-visible text-white">
                      {/* Background Image */}
                      {player.pictureLoading ? (
                        <div className="absolute top-0 bottom-0 left-0 right-0 flex items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                        </div>
                      ) : (
                        <motion.div
                          className="absolute top-0 bottom-0 left-0 right-0 flex scale-[85%]"
                          style={{
                            backgroundImage: `url(${
                              player.picture || "/placeholder.svg"
                            })`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }}
                        />
                      )}

                      {/* Content (Text and Button at Bottom) */}
                      <div className="absolute bottom-0 left-0 right-0 p-4 backdrop-filter backdrop-brightness-75  text-center z-10">
                        <h3 className="text-sm leading-5 font-azonix mix-blend-difference">
                          {player.Player}
                        </h3>
                      </div>
                      {temporaryPicks.some(
                        (p) => String(p.player_id) === String(player.player_id)
                      ) && (
                        <div
                          className="absolute -top-2 -right-2 overflow-visible z-40 bg-green-500 text-white rounded-full p-1"
                          style={{ zIndex: 50 }}
                        >
                          <TiTick size={16} className="text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col justify-center m-2 md:w-[9vw] w-[100px] self-center inset-0 text-center text-xs text-white mt-2">
                      <div className="flex flex-col justify-center min-h-10  rounded-xl bg-gradient-to-br from from-black to-neutral-800 pb-2">
                        <span className="text-[10px] font-azonix whitespace-wrap">
                          {player.Team}
                        </span>
                        <span className="font-bold"></span>{" "}
                        {formatCost(player.Cost)}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>

          {isLoadingMore ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-center mx-auto flex-col items-center"
            >
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-8 text-white/70"
              >
                Fetching players data
              </motion.div>
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
      <AnimatePresence>
        {isDrawerOpen && (
          <motion.div
            className="fixed md:hidden top-36 -mt-3 border-t-2 border-white/20 left-0 right-0 z-30 bg-[#0a0a0a]  shadow-xl "
            style={{ height: "80vh" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
          >
            <div className="flex flex-col h-full ">
              {/* Header */}
              <div className="flex justify-between items-center p-4 flex-shrink-0 ">
                <h1 className="text-base font-azonix text-white font-bold">
                  Select your Picks
                </h1>
                <button onClick={closeDrawer} className="text-white">
                  <IoMdClose size={24} />
                </button>
              </div>

              {/* Filter */}
              <div className="px-4 -mt-6 -mb-1">
                <FilterUI
                  onFilter={({
                    searchTerm: newSearchTerm,
                    costRange: newCostRange,
                  }) => {
                    setSearchTerm(newSearchTerm);
                    setCostRange(newCostRange);
                    setVisiblePlayersCount(9);
                  }}
                />
              </div>

              <div
                className="flex-1 overflow-y-scroll px-2"
                ref={mobileScrollRef}
              >
                <motion.div
                  className="py-4 grid grid-cols-3 gap-2 text-center"
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
                    {visiblePlayers.map((player) => (
                      <motion.div
                        key={player.player_id}
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.6 }}
                        transition={{ duration: 0.3 }}
                        onClick={() => handleSelectPlayer(player)}
                      >
                        <div className="flex flex-col gap-2 cursor-pointer transition duration-300 ease-in-out hover:scale-95 hover:drop-shadow-2xl">
                          <div className="relative justify-center m-auto md:h-[24vh] md:w-[9vw] w-[90px] h-[120px] bg-gradient-to-b from-[#862121] to-[#000000] rounded-2xl overflow-visible text-white">
                            {/* Background Image */}
                            {player.pictureLoading ? (
                              <div className="absolute top-0 bottom-0 left-0 right-0 flex items-center justify-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                              </div>
                            ) : (
                              <motion.div
                                className="absolute top-0 bottom-0 left-0 right-0 flex scale-[85%]"
                                style={{
                                  backgroundImage: `url(${
                                    player.picture || "/placeholder.svg"
                                  })`,
                                  backgroundSize: "cover",
                                  backgroundPosition: "center",
                                }}
                              />
                            )}

                            {/* Content (Text and Button at Bottom) */}
                            <div className="absolute bottom-0 left-0 right-0 p-4 backdrop-filter backdrop-brightness-75  text-center z-10">
                              <h3 className="text-[10px] leading-5 font-azonix whitespace-normal text-left mix-blend-difference">
                                {player.Player}
                              </h3>
                            </div>
                            {temporaryPicks.some(
                              (p) =>
                                String(p.player_id) === String(player.player_id)
                            ) && (
                              <div
                                className="absolute -top-2 -right-2 overflow-visible z-40 bg-green-500 text-white rounded-full p-1"
                                style={{ zIndex: 50 }}
                              >
                                <TiTick size={16} className="text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col justify-center m-2 md:w-[9vw] w-[100px] self-center inset-0 text-center text-xs text-white mt-2">
                            <div className="flex flex-col justify-center min-h-10  rounded-xl bg-gradient-to-br from from-black to-neutral-800 pb-2">
                              <span className="text-[10px] font-azonix whitespace-wrap">
                                {player.Team}
                              </span>
                              <span className="font-bold"></span>{" "}
                              {formatCost(player.Cost)}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>

                {isLoadingMore ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-center mx-auto flex-col items-center"
                  >
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-8 text-white/70"
                    >
                      Fetching players data
                    </motion.div>
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
