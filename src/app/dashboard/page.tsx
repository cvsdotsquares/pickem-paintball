"use client";

import UserProfile from "@/src/components/Dashboard/overlay";
import ActionButtons from "@/src/components/ui/action-btns";
import DivisionInfo from "@/src/components/ui/div-info";
import { ProgressiveBlur } from "@/src/components/ui/progressive-blur";
import { PickWidget } from "@/src/components/ui/section-card";

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
    <section className=" flex font-azonix w-screen overflow-hidden">
      <div className="relative rounded-2xl pr-4 flex z-10 left-0 md:flex-row flex-col justify-start ">
        <div className="relative  inset-0 flex justify-center my-auto md:w-[55vw] w-screen min-h-[40vh]">
          {/* Background Wrapper */}

          <div
            className="absolute inset-0 bg-opacity-80 "
            style={{
              backgroundImage: "url('/bg.jpg')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }}
          />
          {/* Profile Content Wrapper */}
          <div className="relative bg-gray-900/50 md:p-16 flex  items-stretch justify-center w-full h-full">
            <UserProfile />
          </div>
        </div>

        <div className="border-white/30 border-l md:w-[42vw] w-full">
          <div className="flex-1 p-6">
            <div className="flex overflow-hidden mt-4 relative flex-col top-3 rounded-2xl">
              <img
                src="/background0.jpg"
                className="object-cover absolute inset-0 size-full"
                alt="Card background"
              />

              <div className="relative justify-center  w-full md:mx-2 my-6  ">
                <PickWidget />
                <ActionButtons />
              </div>
            </div>
            <DivisionInfo />
          </div>
        </div>
      </div>
    </section>
  );
}
