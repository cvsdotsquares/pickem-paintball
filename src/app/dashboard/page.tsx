"use client";

import UserProfile from "@/src/components/Dashboard/overlay";
import ActionButtons from "@/src/components/ui/action-btns";
import DivisionInfo from "@/src/components/ui/div-info";
import { ProgressiveBlur } from "@/src/components/ui/progressive-blur";
import { PickWidget } from "@/src/components/ui/pick-widget";

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
  return (
    <section className="relative flex md:flex-row flex-col-reverse font-azonix w-screen md:w-[calc(100vw-60px)] md:h-screen h-full overflow-hidden top-0">
      {/* Left Column - Picks and Leaderboard */}
      <div className="flex flex-col w-full md:w-1/2 pb-[75px] md:pb-[35px] pt-5 lg:pt-10 border-r border-white/30 md:h-full overflow-hidden md:overflow-y-auto">
        {/* Picks Section with Scroll */}
        <div className="flex-1 pb-6 p-3 md:p-6 justify-center ">
          <div className="flex overflow-hidden relative flex-col rounded-2xl h-full">
            <img
              src="/background0.jpg"
              className="object-cover absolute inset-0 size-full"
              alt="Card background"
            />
            <div className="relative justify-center h-full  flex-1 md:mx-2 py-6">
              <PickWidget />
            </div>
          </div>
        </div>

        {/* Leaderboard Section with Scroll */}
        <div className="flex-1 md:px-6 px-3">
          <DivisionInfo />
        </div>
      </div>

      {/* Right Column - Profile (Full height, no scroll) */}
      <div className=" relative md:h-full md:h-screen mt-6 md:w-1/2 overflow-hidden">
        {/* Background */}
        <div
          className="absolute inset-0 bg-opacity-40"
          style={{
            backgroundImage: "url('/pick-em.webp')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        />

        {/* Profile Content */}
        <div className="relative bg-black/40 h-full w-full md:p-10 py-6 flex items-center m-auto justify-center">
          <UserProfile />
        </div>
      </div>
    </section>
  );
}
