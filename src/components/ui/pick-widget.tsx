"use client";
import { Player } from "@/src/app/dashboard/pick-em/page";
import { useAuth } from "@/src/contexts/authProvider";
import {
  collection,
  DocumentReference,
  doc,
  getDoc,
  getDocs,
  getFirestore,
} from "firebase/firestore";
import { getDownloadURL, getStorage, listAll, ref } from "firebase/storage";
import { useEffect, useState } from "react";
import { AnimatedGroup } from "./animations/grp";
import { GiCardPickup } from "react-icons/gi";
import ActionButtons from "./action-btns";

// Use the Player interface from pick-em page which already includes img_url

export const PickWidget = () => {
  const [liveEvent, setLiveEvent] = useState<{
    id: string | null;
    lockDate: Date | null;
    timeLeft: string;
  }>({ id: null, lockDate: null, timeLeft: "" });
  const [rowData, setRowData] = useState<Player[]>([]);
  const [playerSlots, setPlayerSlots] = useState(
    Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      position: `p${i + 1}`,
      isSelected: i === 0,
      player: null as Player | null,
    }))
  );
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({});

  const db = getFirestore();
  const { user } = useAuth();

  // Helper to fetch documents from Firestore
  const fetchFromFirestore = async <T extends Record<string, unknown> = Record<string, unknown>>(
    path: string
  ): Promise<Array<T & { id: string }>> => {
    const ref = collection(db, path);
    const snapshot = await getDocs(ref);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Array<T & { id: string }>;
  };

  // Fetch live event details
  useEffect(() => {
    const fetchLiveEvent = async () => {
      const events = await fetchFromFirestore<{ status?: string }>("events");
      const live = events.find(
        (event): event is { id: string; status: string } =>
          typeof event.status === "string" && event.status === "live"
      );
      if (live) {
        setLiveEvent({
          id: live.id,
          lockDate: new Date(),
          timeLeft: "",
        });
      }
    };
    fetchLiveEvent();
  }, [fetchFromFirestore]);

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

  const fetchPlayerPicture = async (player: Player): Promise<string> => {
    try {
      // Check if img_url is available first
      if (player.img_url && player.img_url.trim() !== "") {
        return player.img_url;
      }

      // Fallback to Firebase Storage lookup
      const storage = getStorage();
      const folderPath = `players/`;
      const storageRef = ref(storage, folderPath);
      const fileList = await listAll(storageRef);
      const matchingFile = fileList.items.find((item) =>
        item.name.startsWith(`${player.league_id}_`)
      );
      return matchingFile
        ? await getDownloadURL(matchingFile)
        : "/placeholder.svg";
    } catch (error) {
      console.error(`Error fetching picture for player: ${player.Player}`, error);
      return "/placeholder.svg";
    }
  };

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
      }
    };

    fetchAllTeamLogos();
  }, []);

  // Load player images in the background after initial render
  useEffect(() => {
    if (rowData.length === 0) return;

    const loadImages = async () => {
      try {
        const updatedPlayers = await Promise.all(
          rowData.map(async (player) => {
            // Check if we need to load an image (no picture or still using placeholder)
            if (!player.picture || player.picture === "/placeholder.svg") {
              const picture = await fetchPlayerPicture(player);
              return { ...player, picture, pictureLoading: false };
            }
            return { ...player, pictureLoading: false };
          })
        );
        setRowData(updatedPlayers);
      } catch (error) {
        console.error("Error loading player images:", error);
      }
    };

    loadImages();
  }, [rowData.length, fetchPlayerPicture]);

  useEffect(() => {
    const fetchPlayers = async () => {
      if (!liveEvent.id) return;

      try {
        const rawPlayers = await fetchFromFirestore<{
          player_id: string;
          league_id: string;
          Player: string;
          Team: string;
          Rank: string | number | undefined;
          team_id: string;
          Cost: number;
          img_url?: string;
        }>(`events/${liveEvent.id}/players`);

        const players: Player[] = rawPlayers.map((playerData) => {
          const rank = typeof playerData.Rank === "number"
            ? String(playerData.Rank)
            : playerData.Rank ?? "";

          const imgUrl = playerData.img_url;
          const hasImgUrl = typeof imgUrl === "string" && imgUrl.trim() !== "";

          return {
            player_id: playerData.player_id,
            league_id: playerData.league_id,
            Player: playerData.Player,
            Team: playerData.Team,
            Rank: rank,
            team_id: playerData.team_id,
            Cost: playerData.Cost,
            img_url: imgUrl,
            picture: hasImgUrl ? imgUrl : "/placeholder.svg", // Set picture immediately if img_url available
            pictureLoading: !hasImgUrl, // Only loading if no img_url
          };
        });

        setRowData(players);
      } catch (error) {
        console.error("Error fetching players:", error);
      }
    };

    fetchPlayers();
  }, [liveEvent.id, fetchFromFirestore]);

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

              const playerRefs: DocumentReference[] = savedPicksIds.map((id: string) =>
                doc(db, `events/${liveEvent.id}/players`, id.toString())
              );

              const playerDocs = await Promise.all(
                playerRefs.map((playerRef) => getDoc(playerRef))
              );

              const savedPicks: Player[] = playerDocs
                .filter((doc) => doc.exists())
                .map((doc) => {
                  const data = doc.data() as Partial<Player> & { img_url?: string };
                  const imgUrl = data?.img_url;
                  const hasImgUrl = typeof imgUrl === "string" && imgUrl.trim() !== "";

                  return {
                    player_id: doc.id,
                    Player: data?.Player ?? "",
                    Team: data?.Team ?? "",
                    Rank:
                      typeof data?.Rank === "number"
                        ? String(data.Rank)
                        : data?.Rank ?? "",
                    team_id: data?.team_id ?? "",
                    Cost: data?.Cost ?? 0,
                    league_id: data?.league_id ?? "",
                    img_url: imgUrl,
                    picture: hasImgUrl ? imgUrl : "/placeholder.svg", // Set picture immediately if img_url available
                    pictureLoading: !hasImgUrl, // Only loading if no img_url
                  };
                });

              setPlayerSlots((prevSlots) =>
                prevSlots.map((slot, index) => ({
                  ...slot,
                  player: savedPicks[index] || null,
                }))
              );

              // Load images in the background only for players without img_url
              const picksWithPictures = await Promise.all(
                savedPicks.map(async (player) => {
                  if (player.img_url && player.img_url.trim() !== "") {
                    return { ...player, pictureLoading: false };
                  } else {
                    const picture = await fetchPlayerPicture(player);
                    return { ...player, picture, pictureLoading: false };
                  }
                })
              );

              setPlayerSlots((prevSlots) =>
                prevSlots.map((slot, index) => ({
                  ...slot,
                  player: picksWithPictures[index] || null,
                }))
              );
            }
          }
        } catch (error) {
          console.error("Error fetching saved picks:", error);
        }
      };

      fetchPicks();
    }
  }, [user, liveEvent.id, db, fetchPlayerPicture]);

  const formatCost = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const PlayerCard = ({
    player,
    isSlot = false,
  }: {
    player?: Player;
    isSlot?: boolean;
  }) => {
    return (
      <div
        key={
          player ? `${player.Player}-${player.Team || "unknown"}` : "empty-slot"
        }
        className={`relative flex flex-col ${
          isSlot ? "mx-0" : "mx-1"
        } mb-2 rounded-3xl border-2 border-blue-600/80 bg-gray-700`}
      >
        {/* Top Section */}
        <div className="rounded-t-3xl p-2 ring-1 bg-gray-800 ring-blue-600/80">
          <div className="relative overflow-hidden pb-3 rounded-t-2xl">
            <div className="overflow-hidden">
              <div
                className={`relative ${
                  isSlot ? "h-[70px] md:h-[70px]" : "h-[70px]"
                } border-2 bg-gradient-to-b rounded-t-2xl from-orange-500 to-yellow-500 [clip-path:polygon(0_0,_100%_0,_100%_87%,_50%_100%,_0_87%)] border-blue-600/80`}
              >
                {player?.pictureLoading ? (
                  <div className="absolute top-0 bottom-0 left-0 right-0 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                  </div>
                ) : (
                  <>
                    <div className="pointer-events-none absolute -translate-x-1/4 left-0 top-5 -z-10 text-center text-lg md:text-4xl font-extrabold tracking-tighter text-white uppercase italic opacity-40 mix-blend-overlay">
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

            {/* Action Button
            <div className="absolute start-1/2 bottom-0 flex md:h-8 md:w-8 h-6 w-6 -translate-x-1/2 items-center justify-center rounded-2xl bg-gradient-to-b from-orange-500 to-yellow-500 text-2xl/none font-extrabold tracking-tighter text-white">
              {isSlot ? (
                <IoMdCloseCircle className="text-white" />
              ) : (
                <PiPlusBold />
              )}
            </div>*/}
          </div>

          {/* Player Name */}
          <div className="pt-1 pb-1 text-center text-white md:px-2 pointer-events-none">
            <h2
              className={`${
                isSlot ? "text-[8px] md:text-[8px]" : "text-[8px]"
              } font-bold tracking-tight whitespace-nowrap overflow-hidden text-ellipsis`}
            >
              {player?.Player || "Empty Slot"}
            </h2>
            {player?.Team && (
              <div
                className={`${
                  isSlot ? "text-[8px] md:text-[8px]" : "text-[8px]"
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
                isSlot ? "text-[8px] md:text-[8px]" : "text-[8px]"
              } font-bold`}
            >
              {formatCost(player.Cost)}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <section className="flex flex-col justify-center m-auto w-full h-full ">
        <div className="flex justify-between items-center self-center ">
          <h3 className="self-stretch capitalize my-auto text-2xl font-bold leading-tight text-center text-white mt-2">
            {liveEvent.id?.replace(/_/g, " ")} <br />
            Event is live
          </h3>
        </div>
        <div className="flex flex-col justify-center h-full w-full">
          <AnimatedGroup
            preset="scale"
            className="relative md:mt-3 left-0 grid sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 grid-cols-3  gap-2 sm:gap-4 m-auto justify-center h-full py-2 px-4 lg:px-4 xl:px-8 w-full"
          >
            {playerSlots.map((slot) => (
              <div key={slot.id}>
                {slot.player ? (
                  <PlayerCard player={slot.player} isSlot={true} />
                ) : (
                  <button
                    className={`relative flex flex-col gap-0 justify-center items-center rounded-2xl border border-white bg-white bg-opacity-10 border-opacity-20 md:h-[14vh] w-full h-[100px] `}
                  >
                    <GiCardPickup size={60} className="text-white/60 ml-2 " />
                    <span className="text-xl uppercase text-white/60 font-azonix">
                      {slot.position}
                    </span>
                  </button>
                )}
              </div>
            ))}
          </AnimatedGroup>
        </div>
        <ActionButtons />
      </section>
    </>
  );
};
