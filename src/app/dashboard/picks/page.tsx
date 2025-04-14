"use client";
import { AnimatedGroup } from "@/src/components/ui/animations/grp";
import { PickCard } from "@/src/components/ui/player-card";
import { useAuth } from "@/src/contexts/authProvider";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { motion } from "framer-motion";
import { sortBy } from "lodash";
import { useEffect, useMemo, useState } from "react";
import { GiCardPickup } from "react-icons/gi";
import { LuUserRoundCheck } from "react-icons/lu";
import { IoMdCloseCircle } from "react-icons/io";
import { RiCloseLine, RiTeamLine } from "react-icons/ri";
import { FaSearch } from "react-icons/fa";
import { FaAngleDown, FaFilter } from "react-icons/fa6";

export interface Player {
  player_id: number;
  player: string;
  team: string;
  rank: string;
  player_number: number;
  cost: any;
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

export function FilterUI({
  onFilter,
}: {
  onFilter: (filters: {
    searchTerm: string;
    costRange: [number, number];
  }) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [costRange, setCostRange] = useState<[number, number]>([0, 500000]);

  const handleApplyFilters = () => {
    onFilter({ searchTerm, costRange });
    setIsFilterOpen(false); // Close the dropdown
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setCostRange([0, 500000]);
    onFilter({ searchTerm: "", costRange: [0, 500000] });
  };

  return (
    <div className="flex flex-row justify-between gap-4 p-4 items-center w-full border-white/30 border-b z-30">
      {/* Search Bar */}
      <div className="flex items-center relative w-full h-8 rounded-2xl bg-gray-700 px-3">
        <FaSearch className="text-black w-4 h-4 mr-2" />
        <input
          type="text"
          placeholder="Search by Player or Team"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full h-full border-none outline-none text-base font-inter text-black bg-transparent"
        />
      </div>

      {/* Filter Dropdown */}
      <div className="relative">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={isFilterOpen}
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className="flex items-center justify-center h-12 px-4 rounded-lg bg-transparent text-gray-600 text-sm font-medium border-none"
        >
          <FaFilter className="w-4 h-4" />
        </button>
        {isFilterOpen && (
          <div className="absolute right-0 mt-2 w-64 bg-gray-800 text-white rounded-lg shadow-lg z-50 p-4">
            <h3 className="text-sm font-medium mb-2">Cost Range</h3>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={costRange[0]}
                onChange={(e) =>
                  setCostRange([Number(e.target.value), costRange[1]])
                }
                className="w-full h-8 text-black rounded-md px-2"
                placeholder="Min"
              />
              <span className="text-sm">to</span>
              <input
                type="number"
                value={costRange[1]}
                onChange={(e) =>
                  setCostRange([costRange[0], Number(e.target.value)])
                }
                className="w-full h-8 text-black rounded-md px-2"
                placeholder="Max"
              />
            </div>
            <div className="flex justify-end mt-4 gap-2">
              <button
                className="px-4 py-2 bg-blue-500 text-white text-sm rounded-md"
                onClick={handleApplyFilters}
              >
                Apply
              </button>
              <button
                className="px-4 py-2 bg-gray-500 text-white text-sm rounded-md"
                onClick={handleResetFilters}
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Pickems() {
  const [playerSlots, setPlayerSlots] = useState(
    Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      position: `p${i + 1}`,
      isSelected: false,
      player: null as Player | null,
    }))
  );
  const [yourPicks, setYourPicks] = useState<Player[]>([]);
  const [temporaryPicks, setTemporaryPicks] = useState<Player[]>([]);
  const [liveEvent, setLiveEvent] = useState<{
    id: string | null;
    lockDate: Date | null;
    timeLeft: string;
  }>({ id: null, lockDate: null, timeLeft: "" });
  const [data, setData] = useState<Player[]>([]);
  const [rowData, setRowData] = useState<any[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [visiblePlayers, setVisiblePlayers] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [filteredPlayers, setFilteredPlayers] = useState<any[]>([]);

  const ITEMS_PER_PAGE = 15;

  const db = getFirestore();
  const { user } = useAuth();

  // Helper to fetch documents from Firestore
  const fetchFromFirestore = async (path: string) => {
    const ref = collection(db, path);
    const snapshot = await getDocs(ref);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  };

  // Fetch live event details
  useEffect(() => {
    const fetchLiveEvent = async () => {
      const events = await fetchFromFirestore("events");
      const live = events.find((e: any) => e.status === "live");
      if (live) {
        setLiveEvent({
          id: live.id,
          lockDate: new Date(),
          timeLeft: "",
        });
      }
    };
    fetchLiveEvent();
  }, []);

  // Update countdown timer
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
    return () => clearInterval(interval);
  }, [liveEvent.lockDate]);

  // Fetch players based on live event
  useEffect(() => {
    if (!liveEvent.id) return;

    const fetchPlayers = async () => {
      const players = await fetchFromFirestore(
        `events/${liveEvent.id}/players`
      );
      setRowData(players);
      console.log(rowData);
    };
    fetchPlayers();
  }, [liveEvent.id]);

  // Fetch user picks from the firestore if exist already
  useEffect(() => {
    if (user && liveEvent.id) {
      const fetchPicks = async () => {
        try {
          console.log(
            "Fetching picks for user:",
            user.uid,
            "and event:",
            liveEvent.id
          );

          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const userData = userSnap.data();
            console.log("User data fetched:", userData);

            if (
              userData.pickems &&
              liveEvent.id &&
              Array.isArray(userData.pickems[liveEvent.id])
            ) {
              const savedPicksIds = userData.pickems[liveEvent.id];
              console.log(
                "Saved picks IDs for event:",
                liveEvent.id,
                savedPicksIds
              );

              const savedPicks = data.filter((player) =>
                savedPicksIds.includes(player.player_id)
              );
              console.log("Resolved saved picks:", savedPicks);

              setYourPicks(savedPicks);

              const total = savedPicks.reduce((sum, player) => {
                const cost = Number(player.cost);
                console.log("Adding player cost:", player, cost);
                return sum + (isNaN(cost) ? 0 : cost);
              }, 0);

              console.log("Total cost calculated:", total);
            } else {
              console.warn(
                `No picks found for event ${liveEvent.id} in user's pickems map.`
              );
            }
          } else {
            console.warn("User document does not exist in Firestore.");
          }
        } catch (error) {
          console.error("Error fetching picks:", error);
        }
      };

      fetchPicks();
    }
  }, [user, liveEvent.id, db, data]);

  useEffect(() => {
    // Initially load the first 15 players
    if (rowData.length > 0) {
      setFilteredPlayers(rowData);
    }
  }, [rowData]);

  const loadMorePlayers = () => {
    const nextIndex = visiblePlayers.length;
    const nextPlayers = rowData.slice(nextIndex, nextIndex + ITEMS_PER_PAGE);

    setVisiblePlayers((prev) => [...prev, ...nextPlayers]);

    if (nextIndex + ITEMS_PER_PAGE >= rowData.length) {
      setHasMore(false); // No more players to load
    }
  };

  // New check to see if we are before lockDate
  const isBeforeLockDate =
    liveEvent.lockDate && new Date() < liveEvent.lockDate;
  // Filter, sort, and paginate data

  const formatDate = (date: any) => {
    if (date) {
      const dt = new Date(date);
      const month =
        dt.getMonth() + 1 < 10 ? "0" + (dt.getMonth() + 1) : dt.getMonth() + 1;
      const day = dt.getDate() < 10 ? "0" + dt.getDate() : dt.getDate();
      return day + "/" + month + "/" + dt.getFullYear();
    }
    return "";
  };

  const handleRemovePlayer = (slotId: number) => {
    setPlayerSlots((prevSlots) =>
      prevSlots.map((slot) =>
        slot.id === slotId ? { ...slot, player: null } : slot
      )
    );

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

    if (temporaryPicks.length >= 10) {
      alert("You can only pick up to 10 players.");
      return;
    }

    setTemporaryPicks((prev) => [...prev, player]);
    setPlayerSlots((prevSlots) => {
      const emptySlotIndex = prevSlots.findIndex((slot) => !slot.player);
      if (emptySlotIndex === -1) return prevSlots;
      const newSlots = [...prevSlots];
      newSlots[emptySlotIndex].player = player;
      return newSlots;
    });
  };

  const confirmPicks = async () => {
    if (!user) return;

    try {
      const pickIds = temporaryPicks.map((p) => p.player_id);
      await updateDoc(doc(db, "users", user.uid), {
        ["pickems." + liveEvent.id]: pickIds,
      });
      alert("Picks confirmed!");
    } catch (error) {
      console.error("Error saving picks:", error);
    }
  };
  const handleFilter = ({
    searchTerm,
    costRange,
  }: {
    searchTerm: string;
    costRange: [number, number];
  }) => {
    const filtered = rowData.filter(
      (player) =>
        player.Player.toLowerCase().includes(searchTerm.toLowerCase()) &&
        player.Cost >= costRange[0] &&
        player.Cost <= costRange[1]
    );
    setFilteredPlayers(filtered.slice(0, ITEMS_PER_PAGE)); // Update visible players
  };

  return (
    <div className="relative flex flex-col-reverse md:flex-row w-auto h-full overflow-hidden">
      {/* Left Section */}
      <div className="relative w-full md:w-[60vw] md:h-full h-[25vh] z-10 overflow-x-clip border-white/30 border-r ">
        {/* Image Container */}
        <div
          className="relative bottom-0 top-0 mt-8 md:h-full  flex flex-col justify-center "
          style={{
            backgroundImage: "url(/stadium.jpg)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {/* <h1 className="text-xl font-azonix text-white text-center pt-4 font-bold"></h1> */}
          <AnimatedGroup
            preset="scale"
            className="relative md:top-10 left-0 grid grid-cols-5 gap-2 items-center justify-evenly px-2 w-full"
          >
            {playerSlots.map((slot) => (
              <div
                key={slot.id}
                className={`relative flex flex-col gap-0 justify-center items-center rounded-2xl border ${
                  slot.isSelected
                    ? "border-white ring-2 border-2 bg-gradient-to-b from-white/10 to-blue-500/80"
                    : "border-white bg-white bg-opacity-10"
                } border-opacity-20 md:h-[28vh] md:w-[9vw] w-[100px] h-[150px]`}
              >
                {slot.player ? (
                  <>
                    <PickCard
                      playerName={slot.player.player}
                      teamName={slot.player.team}
                      cost={slot.player.cost}
                    />
                    <button
                      onClick={() => handleRemovePlayer(slot.id)}
                      className="absolute top-1 right-1 text-black hover:text-red-100"
                    >
                      <IoMdCloseCircle size={24} />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      if (!slot.player) {
                        setPlayerSlots((prevSlots) =>
                          prevSlots.map((s) =>
                            s.id === slot.id
                              ? { ...s, isSelected: !s.isSelected }
                              : s
                          )
                        );
                      }
                    }}
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

          <div className="justify-center m-auto pb-2">
            <button
              className="flex items-center gap-2 px-8 py-3 backdrop-blur bg-white bg-opacity-10 text-white rounded-[36px]"
              onClick={confirmPicks}
            >
              <RiTeamLine />
              <span className="text-base font-bold">Confirm Your Picks</span>
            </button>
          </div>
        </div>
      </div>

      <div className=" flex flex-col w-full md:w-[40vw] mt-10">
        <h1 className="text-xl font-azonix text-white text-center  font-bold">
          Select your Picks
        </h1>
        {/* Filter UI */}
        <FilterUI onFilter={handleFilter} />
        <div
          className=" flex flex-col h-auto overflow-y-scroll"
          onScroll={(e) => {
            const { scrollTop, scrollHeight, clientHeight } =
              e.target as HTMLElement;
            if (scrollHeight - scrollTop <= clientHeight + 30 && hasMore) {
              loadMorePlayers();
            }
          }}
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
            {filteredPlayers.map((player) => (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <PickCard
                  playerName={player.Player}
                  teamName={player.Team}
                  cost={player.Cost}
                />
                <div className="flex justify-center pb-2">
                  <button
                    onClick={() => handleSelectPlayer(player)}
                    className="flex items-center gap-2 px-4 py-1 backdrop-blur bg-white bg-opacity-10 text-white rounded-[36px]"
                  >
                    <LuUserRoundCheck />
                    <span className="text-base font-bold">Select</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
