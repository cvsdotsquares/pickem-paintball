import React from "react";
import { GiGooeyMolecule } from "react-icons/gi";
import { LuUserRoundCheck } from "react-icons/lu";

interface PickCardProps {
  playerName?: string;
  teamName?: string;
  cost?: number;
}

export const PickCard: React.FC<PickCardProps> = ({
  playerName = "Player Name",
  teamName = "Team Name",
  cost = 25,
}) => {
  const formatCost = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };
  return (
    <div className="flex flex-col gap-2 cursor-pointer transition duration-300 ease-in-out hover:scale-95 hover:drop-shadow-2xl">
      <div className="relative justify-center m-auto md:h-[28vh] md:w-[9vw] w-[100px] h-[150px] bg-gradient-to-b from-[#862121] to-[#000000] rounded-2xl overflow-hidden text-white">
        {/* Background Image */}
        <div
          className="absolute top-0 bottom-0 left-0 right-0 flex hover:scale-105"
          style={{
            backgroundImage: "url(/placeholder.svg)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />

        {/* Content (Text and Button at Bottom) */}
        <div className="absolute bottom-0 left-0 right-0 p-4 text-center z-10">
          <h3 className="text-sm leading-5 font-azonix">{playerName}</h3>
          <span className="text-[10px] font-azonix whitespace-wrap">
            {teamName}
          </span>
          <div className="flex justify-center text-center text-xs mt-2">
            <span className="font-bold"></span> {formatCost(cost)}
          </div>
        </div>
      </div>
    </div>
  );
};
