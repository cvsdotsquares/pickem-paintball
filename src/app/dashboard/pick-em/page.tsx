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
import { getDownloadURL, getStorage, listAll, ref } from "firebase/storage";

export interface Player {
  player_id: number;
  Player: string;
  Team: string;
  Rank: string;
  team_id: number;
  Cost: number;
  league_id: string; // Added league_id
  picture?: string; // Optional picture URL
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
  const [filteredPlayers, setFilteredPlayers] = useState<any[]>([]);
  const [remainingBudget, setRemainingBudget] = useState(1000000); // $1,000,000 initial budget

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

  const fetchPlayerPicture = async (leagueId: string) => {
    const storage = getStorage();
    const folderPath = `players/`; // Path to the folder containing player pictures
    const storageRef = ref(storage, folderPath);

    try {
      // List all files in the folder
      const fileList = await listAll(storageRef);

      // Find the file that starts with the leagueId
      const matchingFile = fileList.items.find(
        (item) =>
          item.name.startsWith(`${leagueId}_`) ||
          item.name.startsWith(`${leagueId}-`)
      );

      if (matchingFile) {
        // Get the download URL for the matching file
        const pictureUrl = await getDownloadURL(matchingFile);
        return pictureUrl;
      } else {
        return "/placeholder.svg"; // Fallback to placeholder
      }
    } catch (error) {
      console.error(`Error fetching picture for leagueId: ${leagueId}`, error);
      return "/placeholder.svg"; // Fallback to placeholder
    }
  };

  const fetchPlayersWithPictures = async (players: Player[]) => {
    const updatedPlayers = await Promise.all(
      players.map(async (player) => {
        const picture = await fetchPlayerPicture(player.league_id);
        return { ...player, picture }; // Add the picture URL to the player object
      })
    );
    return updatedPlayers;
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
        }));

        // Fetch pictures for the players
        const playersWithPictures = await fetchPlayersWithPictures(players);
        setRowData(playersWithPictures);
      } catch (error) {
        console.error("Error fetching players:", error);
      }
    };

    fetchPlayers();
  }, [liveEvent.id]);

  // Fetch user picks from the firestore if exist already
  useEffect(() => {
    if (user && liveEvent.id) {
      const fetchPicks = async () => {
        try {
          console.log("Fetching picks for user:", user.uid);
          console.log("Live event ID:", liveEvent.id);

          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const userData = userSnap.data();
            console.log("Fetched user data:", userData);

            if (
              userData.pickems &&
              liveEvent.id &&
              Array.isArray(userData.pickems[liveEvent.id])
            ) {
              const savedPicksIds = userData.pickems[liveEvent.id];
              console.log("Saved player IDs:", savedPicksIds);

              // Fetch player data from Firestore for each ID
              const playerRefs = savedPicksIds.map((id: string) =>
                doc(db, `events/${liveEvent.id}/players`, id.toString())
              );

              const playerDocs = await Promise.all(
                playerRefs.map((playerRef: any) => getDoc(playerRef))
              );

              const savedPicks = playerDocs
                .filter((doc) => doc.exists())
                .map((doc) => ({ ...doc.data(), player_id: doc.id })); // Map Firestore data

              console.log("Resolved saved picks:", savedPicks);

              setTemporaryPicks(savedPicks);

              setPlayerSlots((prevSlots) =>
                prevSlots.map((slot, index) => ({
                  ...slot,
                  player: savedPicks[index] || null, // Fill slots with saved picks
                }))
              );

              // Calculate and set remaining budget
              const totalCost = savedPicks.reduce(
                (sum, player) => sum + (player?.Cost || 0),
                0
              );
              setRemainingBudget(1000000 - totalCost); // Adjust budget
              console.log("Remaining budget:", 1000000 - totalCost);
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
    // Initially load the first 15 players
    if (rowData.length > 0) {
      setFilteredPlayers(rowData);
    }
  }, [rowData]);

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

  const handleFilter = ({
    searchTerm,
    costRange,
  }: {
    searchTerm: string;
    costRange: [number, number];
  }) => {
    const filtered = rowData.filter((player) => {
      const matchesSearch =
        player.Player.toLowerCase().includes(searchTerm.toLowerCase()) ||
        player.Team.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCost =
        player.Cost >= costRange[0] && player.Cost <= costRange[1];

      // If there's a search term or a cost range, match either or both
      return (
        (searchTerm ? matchesSearch : true) && (costRange ? matchesCost : true)
      );
    });
    setFilteredPlayers(filtered); // Update visible players
  };

  return (
    <div className="relative flex flex-col-reverse md:flex-row w-auto h-full overflow-hidden">
      {/* Left Section */}
      <div className="relative w-full md:w-[60vw] md:h-full h-[25vh] z-10 overflow-x-clip border-white/30 border-r overflow-y-scroll">
        <div className="grid mt-8 w-full place-items-center overflow-x-scroll rounded-lg  lg:overflow-visible">
          <div
            role="alert"
            className="relative  w-full py-6 bg-gradient-to-b from-[#360e0e] to-[#00000065] shadow-xl shadow-black text-white flex"
          >
            <div className=" ml-12">
              <p className=" font-azonix text-white">
                <div className="justify-between text-xs">
                  <div>
                    Pickems closing on{" "}
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
              </p>
            </div>
          </div>
        </div>
        {/* Image Container */}
        <div
          className="relative left-0 bottom-0 top-0 md:h-full flex flex-col justify-center "
          style={{
            backgroundImage: "url(/stadium.jpg)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {/* <h1 className="text-xl font-azonix text-white text-center pt-4 font-bold"></h1> */}
          <AnimatedGroup
            preset="scale"
            className="relative md:top-10 left-0 grid grid-cols-5 gap-6 items-start justify-evenly px-2 w-full"
          >
            {playerSlots.map((slot) => (
              <div key={slot.id}>
                {slot.player ? (
                  <div
                    className="relative gap-3"
                    onClick={() => handleRemovePlayer(slot.id)}
                  >
                    <PickCard
                      playerName={slot.player.Player}
                      picUrl={slot.player.picture}
                      teamName={slot.player.Team}
                      cost={slot.player.Cost}
                    />
                    <div className="absolute top-2 right-4 z-30 text-black hover:text-red-500">
                      <IoMdCloseCircle size={24} />
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => handleSlotSelection(slot.id)}
                    className={`relative flex flex-col gap-0 justify-center items-center rounded-2xl border ${
                      slot.isSelected
                        ? "border-white ring-2 border-2 bg-gradient-to-b from-white/10 to-blue-500/80"
                        : "border-white bg-white bg-opacity-10"
                    } border-opacity-20 md:h-[24vh] md:w-[9vw] w-[100px] h-[150px]`}
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
        <div className=" flex flex-col h-auto overflow-y-scroll">
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
                onClick={() => handleSelectPlayer(player)}
              >
                <PickCard
                  playerName={player.Player}
                  picUrl={player.picture}
                  teamName={player.Team}
                  cost={player.Cost}
                />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
