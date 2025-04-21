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
    <section className="absolute flex h-screen font-azonix w-full overflow-hidden">
      <div className="relative rounded-2xl pr-4 flex z-0 left-0 md:flex-row flex-col justify-start ">
        <div className="relative   flex justify-center my-auto w-[55vw] h-full">
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

          <div className="absolute inset-0  shadow-black shadow-[inset_-9px_0px_30px_0px_]  pointer-events-none"></div>

          {/* Profile Content Wrapper */}
          <div className="relative bg-gray-900/50 p-16 flex  items-stretch justify-center w-full h-full">
            <UserProfile />
          </div>
        </div>

        <div className="border-white/30 border-l md:w-[40vw] w-full">
          <div className="flex-1 p-10">
            <div className="flex overflow-hidden mt-10 relative flex-col  rounded-2xl">
              <img
                src="/background.jpg"
                className="object-cover absolute inset-0 size-full"
                alt="Card background"
              />

              <div className="relative flex-1 w-full py-2 ">
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
