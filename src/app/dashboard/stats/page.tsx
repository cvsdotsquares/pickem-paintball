"use client";

import { db } from "@/src/lib/firebaseClient";
import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import Temp from "@/src/components/Dashboard/temp";
import { ProgressiveBlur } from "@/src/components/ui/progressive-blur";

export interface Player {
  player_id: number;
  player: string;
  team: string;
  cost: number | string;
}

export interface Event {
  id: string;
  name: string;
  status: string;
}

export default function Dashboard() {
  const [rowData, setRowData] = useState<Player[]>([]);
  const [eventsList, setEventsList] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  // Fetch all events from Firebase
  useEffect(() => {
    async function fetchEvents() {
      try {
        console.log("Fetching events list...");
        const eventsCollection = collection(db, "events");
        const querySnapshot = await getDocs(eventsCollection);
        const events: Event[] = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.get("name") || "Unnamed Event",
          status: doc.get("status") || "archived",
        }));
        setEventsList(events);

        // Select the first live event by default, or fallback to the first event
        const defaultEvent =
          events.find((e) => e.status === "live") || events[0];
        if (defaultEvent) {
          setSelectedEvent(defaultEvent);
        }
      } catch (error: any) {
        console.error("Error fetching events:", error.message);
      }
    }
    fetchEvents();
  }, []);

  interface LogoCardProps {
    backgroundSrc: string;
    logoSrc: string;
    aspectRatio: string;
  }

  const LogoCard: React.FC<LogoCardProps> = ({
    backgroundSrc,
    logoSrc,
    aspectRatio,
  }) => {
    return (
      <article className="flex flex-col flex-1 shrink justify-center self-stretch my-auto basis-0 min-h-24">
        <div className="flex relative flex-col flex-1 justify-center items-center px-12 py-6 rounded-lg aspect-[2.177] size-full max-md:px-5">
          <img
            src={backgroundSrc}
            alt="Logo card background"
            className="object-cover absolute inset-0 size-full rounded-xl"
          />
          <div className="overflow-hidden relative flex-1 shrink self-stretch my-auto w-full basis-0 max-w-[116px]">
            <div className="flex overflow-hidden flex-col justify-center items-center w-full min-h-[50px]">
              {logoSrc && (
                <img
                  src={logoSrc}
                  alt="Partner logo"
                  className={`object-contain w-full ${
                    aspectRatio ? `aspect-[${aspectRatio}]` : ""
                  }`}
                />
              )}
              {!logoSrc && <div className="flex w-full min-h-14" />}
            </div>
          </div>
        </div>
      </article>
    );
  };
  // Fetch player data based on the selected event
  useEffect(() => {
    async function fetchPlayers() {
      if (!selectedEvent) return;
      try {
        console.log("Fetching player data for event:", selectedEvent.id);
        const playersCollection = collection(
          db,
          `events/${selectedEvent.id}/players`
        );
        const querySnapshot = await getDocs(playersCollection);

        const players: any = querySnapshot.docs.map((doc) => {
          const { Cost, player_id, ...rest } = doc.data() as Record<
            string,
            any
          >; // Destructure to exclude "Cost"

          // Define sort order
          const sortOrder = [
            "Rank",
            "Player",
            "Number",
            "Team",
            "Total Kills",
            "Gunfight Kills",
            "Kills on the Break",
            "Movement Kills",
            "Zone Coverage Kills",
            "Pressure Kills",
            "Trades",
            "Unclassified Kills",
          ];

          // Sort the rest dynamically
          const sortedRest = Object.keys(rest)
            .sort((a, b) => {
              const indexA = sortOrder.indexOf(a);
              const indexB = sortOrder.indexOf(b);
              if (indexA === -1 && indexB === -1) return 0;
              if (indexA === -1) return 1;
              if (indexB === -1) return -1;
              return indexA - indexB;
            })
            .reduce((acc: Record<string, any>, key: string) => {
              acc[key] = rest[key];
              return acc;
            }, {});

          // Return sorted object
          return {
            player_id: doc.get("player_id"), // Ensure player_id comes first
            ...sortedRest,
          };
        });

        setRowData(players);
        console.log("Player data fetched successfully:", players);
      } catch (error: any) {
        console.error("Error fetching player data:", error.message);
      }
    }
    fetchPlayers();
  }, [selectedEvent]);

  // Handle event selection from the dropdown
  const handleEventSelect = (event: Event) => {
    setSelectedEvent(event);
  };
  const logoCards = [
    {
      backgroundSrc:
        "https://cdn.builder.io/api/v1/image/assets/TEMP/28288ce1e682dedb7ecb8edc45f21220c30cc7b7?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      logoSrc:
        "https://cdn.builder.io/api/v1/image/assets/TEMP/c16c07b51ee79be0fe54ba8189bbadf44d5e1bc6?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      aspectRatio: "2.32",
    },
    {
      backgroundSrc:
        "https://cdn.builder.io/api/v1/image/assets/TEMP/089f7db2ee572f9015c2192892930f9e19d355fc?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      logoSrc:
        "https://cdn.builder.io/api/v1/image/assets/TEMP/13f62c3b54fa2d1a468beb3349ac59788e5567a1?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      aspectRatio: "1.02",
    },
    {
      backgroundSrc:
        "https://cdn.builder.io/api/v1/image/assets/TEMP/f3957a7876ad52dbdf1924dd78834d6b48cbb467?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      logoSrc:
        "https://cdn.builder.io/api/v1/image/assets/TEMP/9d4110b5284ee2fb6505c071741765dcc553c71e?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      aspectRatio: "4.83",
    },
    {
      backgroundSrc:
        "https://cdn.builder.io/api/v1/image/assets/TEMP/1a3fc65fc58c5bc8634a46ddf592ccf3b3af0700?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      logoSrc: "",
      aspectRatio: "0",
    },
    {
      backgroundSrc:
        "https://cdn.builder.io/api/v1/image/assets/TEMP/6f37f0ba9ecc759bb8cc22b84f981035e58db371?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      logoSrc:
        "https://cdn.builder.io/api/v1/image/assets/TEMP/1a9e6992c064ac7f4e7daff0b70f15f3ca768d8d?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      aspectRatio: "1.96",
    },
    {
      backgroundSrc:
        "https://cdn.builder.io/api/v1/image/assets/TEMP/83a5ed12fbaa0ddf70dc60bd30463de82e6c725b?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      logoSrc:
        "https://cdn.builder.io/api/v1/image/assets/TEMP/3050facfab14c2f3e30d93dd81b81d600496623c?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      aspectRatio: "1.95",
    },
    {
      backgroundSrc:
        "https://cdn.builder.io/api/v1/image/assets/TEMP/bc806b6b447ca6462a9871cc851bb4bca44cb425?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      logoSrc:
        "https://cdn.builder.io/api/v1/image/assets/TEMP/08e147a5ee9072db591bb650441d50f5ec20c8f2?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      aspectRatio: "1.95",
    },
  ];

  return (
    <div className="relative top-4 left-0 flex flex-col w-auto  min-h-screen font-inter">
      <section>
        <header className="flex relative flex-col items-start px-6 pt-32 w-full text-8xl leading-none text-white min-h-[238px] max-md:px-5 max-md:pt-24 max-md:max-w-full max-md:text-4xl">
          {/* <img
            src="/R.jpg"
            alt="Statistics Center Background"
            className="object-cover absolute inset-0 size-full"
          /> */}
          <div
            className="absolute inset-0  top-0"
            style={{
              backgroundImage: "url('/R.jpg')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }}
          />
          <div className="absolute inset-0  shadow-black shadow-[inset_0px_4px_50px_0px_]  pointer-events-none"></div>
          <ProgressiveBlur
            className="pointer-events-none absolute bottom-0 left-0 h-[50%] w-full"
            blurIntensity={1}
          />
          <div className="absolute inset-0  bg-black/45 pointer-events-none"></div>

          <h1 className="relative font-azonix max-w-full md:text-7xl text-xl">
            Statistics Center
          </h1>
        </header>

        <div className="flex flex-wrap gap-4 items-center px-6 mt-4 w-full max-md:px-5 max-md:max-w-full">
          {logoCards.map((card, index) => (
            <LogoCard
              key={index}
              backgroundSrc={card.backgroundSrc}
              logoSrc={card.logoSrc}
              aspectRatio={card.aspectRatio}
            />
          ))}
        </div>
      </section>

      <Temp />
    </div>
  );
}
