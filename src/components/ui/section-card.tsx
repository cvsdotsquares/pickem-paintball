"use client";
import { Player } from "@/src/app/dashboard/pick-em/page";
import { useAuth } from "@/src/contexts/authProvider";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
} from "firebase/firestore";
import { getDownloadURL, getStorage, listAll, ref } from "firebase/storage";
import { useEffect, useState } from "react";
import { AnimatedGroup } from "./animations/grp";
import { PickCard, PickCard1 } from "./player-card";
import { IoMdCloseCircle } from "react-icons/io";
import { GiCardPickup } from "react-icons/gi";

export const PickWidget = () => {
  const [liveEvent, setLiveEvent] = useState<{
    id: string | null;
    lockDate: Date | null;
    timeLeft: string;
  }>({ id: null, lockDate: null, timeLeft: "" });
  const [rowData, setRowData] = useState<any[]>([]);
  const [temporaryPicks, setTemporaryPicks] = useState<Player[]>([]);
  const [playerSlots, setPlayerSlots] = useState(
    Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      position: `p${i + 1}`,
      isSelected: i === 0,
      player: null as Player | null,
    }))
  );

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
  return (
    <>
      <section className="flex flex-col justify-center mt-6 w-full overflow-hidden">
        <div className="flex justify-between items-center self-center px-3">
          <h3 className="self-stretch my-auto text-2xl font-bold leading-tight text-center text-white">
            Your Picks
          </h3>
        </div>
        <div className="flex flex-col flex-1 justify-evenly overflow-y-scroll w-full mt-4">
          <AnimatedGroup
            preset="scale"
            className="relative md:top-5 left-0 grid grid-cols-5 gap-1 items-start justify-evenly h-full px-1 w-full"
          >
            {playerSlots.map((slot) => (
              <div key={slot.id}>
                {slot.player ? (
                  <div className="relative gap-3">
                    <PickCard1
                      playerName={slot.player.Player}
                      picUrl={slot.player.picture}
                      teamName={slot.player.Team}
                      cost={slot.player.Cost}
                    />
                  </div>
                ) : (
                  <button
                    className={`relative flex flex-col gap-0 justify-center items-center rounded-2xl border border-white bg-white bg-opacity-10 border-opacity-20 md:h-[14vh] md:w-[6vw] w-[60px] h-[60px] `}
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
      </section>
    </>
  );
};
