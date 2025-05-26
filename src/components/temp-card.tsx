import { PiPlusBold, PiPlusSquare, PiPlusSquareFill } from "react-icons/pi";

export default function PlayerCard1() {
  return (
    <div className="mx-auto w-[380px] px-5">
      <div className="rounded-3xl border border-blue-600/80 bg-gray-700">
        <div className="rounded-3xl  p-4 ring-1  bg-gray-800 ring-blue-600/80">
          <div className="relative overflow-hidden pb-3">
            <div className="overflow-hidden ]">
              <div className="relative h-[400px] border  bg-gradient-to-b from-orange-500 to-yellow-500 [clip-path:polygon(0_0,_100%_0,_100%_95%,_50%_100%,_0_95%)] border-blue-600/80">
                <div className="pointer-events-none absolute start-1/2 top-10 -z-10 ms-8 -translate-x-1/2 text-center text-9xl/[0.8em] font-extrabold tracking-tighter text-white uppercase italic opacity-40 mix-blend-overlay">
                  <div className="whitespace-break-spaces">Player Name</div>
                </div>
                {/* Player Image */}
              </div>
            </div>

            <div className="absolute start-1/2 bottom-0 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-2xl bg-gradient-to-b from-orange-500 to-yellow-500 text-2xl/none font-extrabold tracking-tighter text-white">
              {/* use this for the plus icon animation on card click turn this to a tickmark and use framer motion to do the click animation on this */}
              <PiPlusBold />
            </div>

            <div className="absolute start-0 top-0 aspect-square w-[76px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-600/80 bg-gray-800">
              {/* Pickem Paintball logo leave for now I dont have the logo yet */}
            </div>

            <div className="absolute end-0 top-0 aspect-square w-[76px] translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-600/80 bg-gray-800">
              {/* team Logo Here */}
            </div>
          </div>

          <div className="pt-3 pb-1 text-center text-white">
            <h2 className="mt-0! text-[22px]/tight font-bold tracking-tight">
              Player Name
            </h2>
            <div className="text-sm">Team Name</div>
          </div>
        </div>

        <div className="mx-auto flex w-fit flex-wrap items-center py-2  text-white">
          <div className="mr-2 text-sm/tight font-bold">Cost:</div>
          <div className="text-xs/tight  uppercase">
            {/* cost Value here */} $500
          </div>
        </div>
      </div>
    </div>
  );
}
