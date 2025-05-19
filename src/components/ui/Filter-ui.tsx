import React, { useState } from "react";
import {
  FaSearch,
  FaSortAlphaDown,
  FaSortAlphaDownAlt,
  FaSortAmountDown,
  FaSortAmountDownAlt,
  FaTimes,
} from "react-icons/fa";
import { FaFilter } from "react-icons/fa6";

// ... (keep your existing PickCard and PickCard1 components)

export function FilterUI({
  onFilter,
  teams, // Add teams
  onSort,
}: {
  onFilter: (filters: {
    searchTerm: string;
    costRange: [number, number];
    selectedTeams: string[];
    positionFilter?: string;
  }) => void;
  teams: string[]; // Array of available teams
  onSort: (sortOption: { field: string; direction: "asc" | "desc" }) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [costRange, setCostRange] = useState<[number, number]>([0, 1000000]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [teamSearchTerm, setTeamSearchTerm] = useState("");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [sortOption, setSortOption] = useState<{
    field: string;
    direction: "asc" | "desc";
  }>({
    field: "name",
    direction: "asc",
  });

  // Predefined cost ranges for better UX
  const costRanges = [
    { label: "Any", value: [0, 1000000] },
    { label: "0 - 50k", value: [0, 50000] },
    { label: "50k - 100k", value: [50000, 100000] },
    { label: "100k - 200k", value: [100000, 200000] },
    { label: "200k+", value: [200000, 1000000] },
  ];
  const sortOptions = [
    {
      label: "Name (A-Z)",
      field: "name",
      direction: "asc",
      icon: <FaSortAlphaDown className="mr-2" />,
    },
    {
      label: "Name (Z-A)",
      field: "name",
      direction: "desc",
      icon: <FaSortAlphaDownAlt className="mr-2" />,
    },
    {
      label: "Team (A-Z)",
      field: "team",
      direction: "asc",
      icon: <FaSortAlphaDown className="mr-2" />,
    },
    {
      label: "Team (Z-A)",
      field: "team",
      direction: "desc",
      icon: <FaSortAlphaDownAlt className="mr-2" />,
    },
    {
      label: "Cost (Low-High)",
      field: "cost",
      direction: "asc",
      icon: <FaSortAmountDown className="mr-2" />,
    },
    {
      label: "Cost (High-Low)",
      field: "cost",
      direction: "desc",
      icon: <FaSortAmountDownAlt className="mr-2" />,
    },
  ];
  const handleFilterChange = () => {
    onFilter({ searchTerm, costRange, selectedTeams });
    setIsFilterOpen(false);
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setCostRange([0, 100000]);
    setSelectedTeams([]);
    onFilter({
      searchTerm: "",
      costRange: [0, 100000],
      selectedTeams: [],
      positionFilter: "",
    });
  };

  const toggleTeamSelection = (team: string) => {
    setSelectedTeams((prev) =>
      prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team]
    );
  };

  const handleSortChange = (option: {
    field: string;
    direction: "asc" | "desc";
  }) => {
    setSortOption(option);
    onSort(option);
    setIsSortOpen(false);
  };

  // Improved team search with multi-word support
  const filteredTeams = teams.filter((team) => {
    if (!teamSearchTerm) return true;
    const searchTerms = teamSearchTerm.toLowerCase().split(/\s+/);
    return searchTerms.some((term) => team.toLowerCase().includes(term));
  });

  return (
    <div className="flex flex-row justify-between gap-4 p-2 items-center w-full border-white/30 border-b z-30">
      {/* Search Bar */}
      <div className="flex items-center relative max-w-[500px] h-7 rounded-2xl bg-gray-700 px-3">
        <FaSearch className="text-white w-4 h-4 mr-2" />
        <input
          type="text"
          placeholder="Search by Player or Team"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            onFilter({
              searchTerm: e.target.value,
              costRange,
              selectedTeams,
            });
          }}
          className="w-full h-full border-none outline-none text-base font-inter text-white bg-transparent"
        />
        {searchTerm && (
          <button
            onClick={() => {
              setSearchTerm("");
              onFilter({
                searchTerm: "",
                costRange,
                selectedTeams,
              });
            }}
            className="text-white/70 hover:text-white ml-2"
          >
            <FaTimes className="w-3 h-3" />
          </button>
        )}
      </div>
      {/* Filter and Sort Buttons */}
      <div className="flex gap-2">
        {/* Sort Dropdown */}
        <div className="relative">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isSortOpen}
            onClick={() => setIsSortOpen(!isSortOpen)}
            className="flex items-center justify-center h-7 px-4 rounded-lg gap-2 text-white bg-gray-600 text-sm font-medium border-none"
          >
            <FaSortAlphaDown className="w-4 h-4" />
            {"  "} Sort
          </button>

          {isSortOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-neutral-900 text-white rounded-lg shadow-sm shadow-neutral-400 z-50 p-2">
              <div className="max-h-60 overflow-y-auto">
                {sortOptions.map((option) => (
                  <div
                    key={`${option.field}-${option.direction}`}
                    className={`flex items-center p-2 rounded-md cursor-pointer transition-colors ${
                      sortOption.field === option.field &&
                      sortOption.direction === option.direction
                        ? "bg-blue-600/30 hover:bg-blue-600/40"
                        : "hover:bg-gray-700"
                    }`}
                    onClick={() =>
                      handleSortChange({
                        field: option.field,
                        direction: option.direction as "asc" | "desc",
                      })
                    }
                  >
                    <div
                      className={`flex items-center justify-center w-3 h-3 border rounded-full mr-3 ${
                        sortOption.field === option.field &&
                        sortOption.direction === option.direction
                          ? "bg-blue-500 border-blue-500"
                          : "border-gray-400"
                      }`}
                    />
                    {option.icon}
                    <span className="text-xs">{option.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Filter Dropdown */}
        <div className="relative">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isFilterOpen}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="flex items-center justify-center h-7 px-4 rounded-lg gap-2 text-white bg-gray-600  text-sm font-medium border-none"
          >
            <FaFilter className="w-4 h-4 " />
            {"  "} Filter
            {selectedTeams.length > 0 && (
              <span className="ml-1 text-xs bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                {selectedTeams.length}
              </span>
            )}
          </button>

          {isFilterOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-neutral-900 text-white rounded-lg shadow-sm shadow-neutral-400 z-50 p-4">
              <div className="space-y-4">
                {/* Cost Range Section */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Cost Range</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {costRanges.map((range) => (
                      <button
                        key={range.label}
                        onClick={() =>
                          setCostRange(range.value as [number, number])
                        }
                        className={`px-2 py-1 text-xs rounded-md ${
                          costRange[0] === range.value[0] &&
                          costRange[1] === range.value[1]
                            ? "bg-red-600"
                            : "bg-gray-700 hover:bg-gray-600"
                        }`}
                      >
                        {range.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Improved Team Filter */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-medium">Teams</h3>
                    {selectedTeams.length > 0 && (
                      <button
                        onClick={() => setSelectedTeams([])}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Team Search */}
                  <div className="relative mb-2">
                    <FaSearch className="absolute left-2 top-2 text-white/70 w-3 h-3" />
                    <input
                      type="text"
                      placeholder="Search teams..."
                      value={teamSearchTerm}
                      onChange={(e) => setTeamSearchTerm(e.target.value)}
                      className="w-full pl-7 pr-2 py-1.5 text-sm bg-gray-800 rounded-md"
                    />
                  </div>

                  {/* Enhanced Team Checkboxes */}
                  <div className="max-h-40 overflow-y-auto">
                    {filteredTeams.length > 0 ? (
                      <div className="space-y-1">
                        {filteredTeams.map((team) => (
                          <div
                            key={team}
                            className={`flex items-center p-2 rounded-md cursor-pointer transition-colors ${
                              selectedTeams.includes(team)
                                ? "bg-blue-600/30 hover:bg-blue-600/40"
                                : "hover:bg-gray-700"
                            }`}
                            onClick={() => toggleTeamSelection(team)}
                          >
                            <div
                              className={`flex items-center justify-center w-3 h-3 border rounded-sm mr-3 ${
                                selectedTeams.includes(team)
                                  ? "bg-blue-500 border-blue-500"
                                  : "border-gray-400"
                              }`}
                            >
                              {selectedTeams.includes(team) && (
                                <svg
                                  className="w-3 h-3 text-white"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              )}
                            </div>
                            <span className="text-xs">{team}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-400 py-2 text-center">
                        No teams found
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between mt-4 gap-2">
                <button
                  className="px-4 py-2 bg-gray-700 text-white text-sm rounded-md hover:bg-gray-600"
                  onClick={handleResetFilters}
                >
                  Reset All
                </button>
                <button
                  className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-500"
                  onClick={handleFilterChange}
                >
                  Apply Filters
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
