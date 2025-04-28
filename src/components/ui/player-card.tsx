import { motion } from "framer-motion";
import React, { useState } from "react";
import { FaSearch } from "react-icons/fa";
import { FaFilter } from "react-icons/fa6";

interface PickCardProps {
  playerName?: string;
  teamName?: string;
  cost?: number;
  picUrl?: string;
}

export const PickCard: React.FC<PickCardProps> = ({
  playerName = "Player Name",
  picUrl = "/placeholder.svg",
  teamName = "Player Team",
  cost = 0,
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
    <>
      <div className="flex flex-col gap-2 cursor-pointer transition duration-300 ease-in-out hover:scale-95 hover:drop-shadow-2xl">
        <div className="relative justify-center m-auto md:h-[24vh] md:w-[9vw] w-[100px] h-[150px] bg-gradient-to-b from-[#862121] to-[#000000] rounded-2xl overflow-hidden text-white">
          {/* Background Image */}
          <motion.div
            className="absolute top-0 bottom-0 left-0 right-0 flex scale-[85%]"
            style={{
              backgroundImage: `url(${picUrl || "/placeholder.svg"})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />

          {/* Content (Text and Button at Bottom) */}
          <div className="absolute bottom-0 left-0 right-0 p-4 backdrop-filter backdrop-brightness-75  text-center z-10">
            <h3 className="text-sm leading-5 font-azonix mix-blend-difference">
              {playerName}
            </h3>
          </div>
        </div>
        <div className="flex flex-col justify-center m-2 md:w-[9vw] w-[100px] self-center inset-0 text-center text-xs text-white mt-2">
          <div className="flex flex-col justify-center min-h-10  rounded-xl bg-gradient-to-br from from-black to-neutral-800 pb-2">
            <span className="text-[10px] font-azonix whitespace-wrap">
              {teamName}
            </span>
            <span className="font-bold"></span> {formatCost(cost)}
          </div>
        </div>
      </div>
    </>
  );
};
export const PickCard1: React.FC<PickCardProps> = ({
  playerName = "Player Name",
  picUrl = "/placeholder.svg",
  teamName = "Player Team",
  cost = 0,
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
    <>
      <div className="flex flex-col gap-2 cursor-pointer transition duration-300 ease-in-out hover:scale-95 hover:drop-shadow-2xl">
        <div className="relative justify-center m-auto md:h-[25vh] md:w-[9vw] w-[60px] h-[60px] bg-gradient-to-b from-[#862121] to-[#000000] rounded-2xl overflow-hidden text-white">
          {/* Background Image */}
          <motion.div
            className="absolute top-0 bottom-0 left-0 right-0 flex scale-[85%]"
            style={{
              backgroundImage: `url(${picUrl || "/placeholder.svg"})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />

          {/* Content (Text and Button at Bottom) */}
          <div className="absolute bottom-0 left-0 right-0 p-1 backdrop-filter backdrop-brightness-75 rounded-xl text-center z-10">
            <h3 className="text-[10px] leading-5 font-azonix mix-blend-difference">
              {playerName}
            </h3>
          </div>
        </div>
        {/* <div className="flex flex-col justify-center m-2 md:w-[9vw] w-[100px] self-center inset-0 text-center text-xs text-white mt-2">
          <div className="flex flex-col justify-center min-h-10  rounded-xl bg-gradient-to-br from from-black to-neutral-800 pb-2">
            <span className="text-[10px] font-azonix whitespace-wrap">
              {teamName}
            </span>
            <span className="font-bold"></span> {formatCost(cost)}
          </div>
        </div> */}
      </div>
    </>
  );
};
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

  const handleFilterChange = () => {
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
        <FaSearch className="text-white w-4 h-4 mr-2" />
        <input
          type="text"
          placeholder="Search by Player or Team"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            handleFilterChange();
          }}
          className="w-full h-full border-none outline-none text-base font-inter text-white bg-transparent"
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
          <div className="absolute right-0 mt-2 w-64 bg-neutral-900 text-white rounded-lg shadow-sm shadow-neutral-400 z-50 p-4">
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
                className="px-4 py-2 bg-slate-600 text-white text-sm rounded-md"
                onClick={handleFilterChange}
              >
                Apply
              </button>
              <button
                className="px-4 py-2 bg-gray-700 text-white text-sm rounded-md"
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
