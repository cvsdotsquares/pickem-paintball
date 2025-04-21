import React, { useState } from "react";
import {
  FaUser,
  FaChevronDown,
  FaSearch,
  FaFilter,
  FaList,
  FaEthereum,
  FaDollarSign,
  FaMoon,
  FaSun,
  FaCalendar,
} from "react-icons/fa";
import { Pointer } from "../ui/cursor";

type ThemeClasses = {
  bg: string;
  text: string;
  border: string;
  hover: string;
  headerBg: string;
  headerText: string;
  button: string;
  activeButton: string;
  card: string;
  progressBg: string;
};

type ColumnConfig = {
  key: string;
  header: string;
  width: string;
  sticky?: boolean;
};

type TableRow = {
  playerName: string;
  team: string;
  age: string;
  score1: number;
  [key: string]: any;
  stats: number[];
};

type MatchupTableProps = {
  data: TableRow[];
};

const headerButtons = [
  { icon: <FaSearch /> },
  { icon: <FaFilter /> },
  { icon: <FaList /> },
];

const columns: ColumnConfig[] = [
  { key: "player", header: "Player", width: "w-1/12", sticky: true },
  {
    key: "score1",
    header: "chart",
    width: "w-1/2",
  },
  {
    key: "score1",
    header: "Performance",
    width: "w-1/12",
  },
  ...Array.from({ length: 7 }, (_, i) => ({
    key: `stat${i + 1}`,
    header: `stat${i + 1}`,
    width: "w-1/12",
  })),
  { key: "player", header: "Cost", width: "w-1/12" },
];

const themeClasses: ThemeClasses = {
  bg: "bg-black",
  text: "text-white",
  border: "border-white",
  hover: "hover:bg-gray-900",
  headerBg: "bg-[#212121]",
  headerText: "text-gray-300",
  button: "bg-gray-700 text-gray-100 hover:bg-gray-600",
  activeButton: "bg-blue-600 text-white",
  card: "bg-gray-800 border-gray-700",
  progressBg: "bg-gray-700",
};

const getScoreColor = (score: number): string => {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-yellow-500";
  if (score >= 20) return "bg-orange-500";
  return "bg-red-500";
};

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => {
  const barColor = getScoreColor(progress);

  return (
    <div className="w-full bg-blue-950 rounded-full h-2">
      <div
        className={`h-2 rounded-full ${barColor}`}
        style={{ width: `${progress}%` }}
      ></div>
    </div>
  );
};

const StatsChart: React.FC<{ stats: number[] }> = ({ stats }) => {
  const maxStat = Math.max(...stats);

  return (
    <svg viewBox="0 0 250 200" className="h-12 w-12">
      {stats.map((stat, i) => {
        const height = (stat / maxStat) * 140;
        const y = 200 - height - 30;

        // Inline color logic
        let fill;
        if (i === 1) fill = "#3aa76d";
        else if (i === 3) fill = "#64748b";
        else if (stat > maxStat * 0.6) fill = "#4f8af8";
        else fill = "#e6a443";

        return (
          <rect
            key={i}
            x={35 + i * 50}
            y={y}
            width="20"
            height={height}
            rx="10"
            fill={fill}
          />
        );
      })}
    </svg>
  );
};

const DiamondScore: React.FC<{
  score: number;
  inverted?: boolean;
}> = ({ score, inverted = false }) => {
  // Built-in color logic based on score value
  let color;
  if (score >= 90) color = "#3aa76d"; // Green for top scores
  else if (score <= 30) color = "#64748b"; // Gray for low scores
  else if (score > 60) color = "#4f8af8"; // Blue for above average
  else color = "#e6a443"; // Yellow/orange for mid-range

  return (
    <div className="relative h-8 w-8 flex items-center justify-center">
      <svg viewBox="0 0 30 32" className="absolute h-8 w-8">
        <path
          d="M17.6417 1.1892L26.8682 6.37754C28.501 7.29572 29.5 8.98777 29.5 10.8117V21.1883C29.5 23.0122 28.501 24.7043 26.8682 25.6225L17.6417 30.8108C16.0075 31.7297 13.9925 31.7297 12.3583 30.8108L3.13183 25.6225C1.49903 24.7043 0.5 23.0122 0.5 21.1883V10.8117C0.5 8.98777 1.49903 7.29572 3.13183 6.37754L12.3583 1.1892C13.9925 0.270267 16.0075 0.270267 17.6417 1.1892Z"
          fill={inverted ? "#000" : "#fff"}
          stroke={color}
        />
      </svg>
      <span
        className={`relative z-10 font-bold ${
          inverted ? "text-white" : "text-black"
        }`}
      >
        {score}
      </span>
    </div>
  );
};

export const MatchupTable: React.FC<MatchupTableProps> = ({ data }) => {
  const [darkMode, setDarkMode] = useState<boolean>(true);

  return (
    <div className={``}>
      {/* Filters */}
      <div className={`flex flex-row items-center justify-between p-4 `}>
        <div className="flex flex-row items-center space-x-4">
          <button
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg shadow-sm ${themeClasses.button}`}
          >
            <span className="font-medium">Player</span>
            <FaChevronDown
              className={darkMode ? "text-gray-400" : "text-gray-500"}
            />
          </button>

          <div className={`font-medium ${themeClasses.headerText}`}>
            Matchups
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`p-2 rounded-full ${themeClasses.button}`}
          >
            {darkMode ? <FaSun /> : <FaMoon />}
          </button>

          <button
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg shadow-sm ${themeClasses.button}`}
          >
            <FaUser />
            <span className="font-medium">Lowest price</span>
            <FaChevronDown
              className={darkMode ? "text-gray-400" : "text-gray-500"}
            />
          </button>
        </div>
      </div>

      {/* Table Body */}
      <div
        className={`overflow-x-auto ${themeClasses.card} rounded-lg overflow-hidden shadow-[0_0_0_0.3px_#fff] `}
      >
        <table className="w-full">
          <thead>
            <tr
              className={`shadow-[0_0_0_0.2px] shadow-white  ${themeClasses.headerBg}`}
            >
              {columns.map((column, index) => (
                <th
                  key={index}
                  className={`px-4 py-3 text-left text-xs  font-medium font-azonix ${
                    themeClasses.headerText
                  } uppercase tracking-wider ${column.width} ${
                    column.sticky ? "sticky left-0 z-10" : ""
                  } ${index === 0 ? themeClasses.headerBg : ""}`}
                  style={{
                    ...(column.sticky && index > 0
                      ? { left: `${index * 150}px` }
                      : {}),
                  }}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={`divide-y ${themeClasses.border}`}>
            {data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={`${themeClasses.hover} ${themeClasses.bg} ${themeClasses.text}`}
              >
                {/* Player Column */}
                <td
                  className={`px-4 py-3 whitespace-nowrap sticky left-0 z-20 ${themeClasses.bg}`}
                >
                  <div className="flex items-center">
                    <div
                      className={`flex-shrink-0 h-12 w-12 flex items-center justify-center mr-4`}
                    >
                      <FaUser className={"text-gray-400 text-4xl"} />
                    </div>
                    <div>
                      <div
                        className={`text-sm font-azonix font-medium ${
                          darkMode ? "text-white" : "text-black "
                        } truncate block`}
                      >
                        {row.playerName}
                      </div>
                      <div
                        className={`text-xs font-azonix ${
                          darkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        {row.team} • {row.age} yo
                      </div>
                    </div>
                  </div>
                </td>

                {/* Stats Column */}
                <td className="px-1 py-3 whitespace-nowrap">
                  <div className="flex items-center ">
                    <StatsChart stats={row.stats} />
                  </div>
                </td>
                {/* Score Columns */}
                <td className="px-3 py-3  whitespace-nowrap">
                  <div className="flex flex-col gap-2 items-center">
                    <DiamondScore score={row.score1} inverted />
                    <div className="ml-1 w-16">
                      <div
                        className={`text-xs ${
                          darkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      ></div>
                      <ProgressBar progress={row.score1} />
                    </div>
                  </div>
                </td>
                {/* Stats Columns */}
                {row.stats.slice(0, 7).map((stat, index) => (
                  <td
                    key={index}
                    className={`px-2 py-3 whitespace-nowrap text-sm text-center ${
                      darkMode ? "text-gray-300" : "text-gray-500"
                    }`}
                  >
                    {stat}
                  </td>
                ))}

                {/* Price Column */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center justify-between">
                    <div>
                      <div
                        className={`text-xs flex items-center ${
                          darkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        <FaDollarSign className="mr-1" />
                        {row.usdPrice}
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const sampleData: TableRow[] = [
  {
    playerName: "Aaron Cresswell",
    team: "WHU",
    age: "35",
    score1: 42,
    stats: [11, 35, 34.33, 2.8, 0, 0, 0, 0, 0.13, 0.07, 0, 0, 0, 0],
    usdPrice: "$0.52",
  },
  {
    playerName: "Ricard Puig Marti",
    team: "FCB",
    age: "24",
    score1: 78,
    stats: [
      28.2, 66.7, 35.87, 2.51, 0.27, 0.33, 0.17, 0, 0.13, 0.13, 0, 0, 0, 0,
    ],
    usdPrice: "$13.04",
  },
  {
    playerName: "Jordan Henderson",
    team: "LIV",
    age: "33",
    score1: 55,
    stats: [
      23.1, 48.4, 40.99, 3.12, 0.2, 0.29, 0.1, 1, 0.15, 0.08, 0, 0, 0, 0.04,
    ],
    usdPrice: "$7.65",
  },
  {
    playerName: "Phil Foden",
    team: "MCI",
    age: "23",
    score1: 85,
    stats: [
      29.8, 75.6, 41.22, 3.05, 0.15, 0.42, 0.09, 0, 0.2, 0.09, 0.01, 0, 0, 0.06,
    ],
    usdPrice: "$21.32",
  },
  {
    playerName: "Marcus Rashford",
    team: "MUN",
    age: "25",
    score1: 66,
    stats: [
      24.4, 59.2, 37.15, 2.9, 0.32, 0.37, 0.25, 0, 0.11, 0.1, 0, 0, 0, 0.08,
    ],
    usdPrice: "$15.10",
  },
  {
    playerName: "Virgil van Dijk",
    team: "LIV",
    age: "32",
    score1: 72,
    stats: [
      21.5, 68.9, 43.98, 2.75, 0.12, 0.21, 0.13, 0, 0.18, 0.09, 0, 0, 0, 0.02,
    ],
    usdPrice: "$20.45",
  },
  {
    playerName: "Kylian Mbappé",
    team: "PSG",
    age: "25",
    score1: 95,
    stats: [
      32.1, 85.3, 50.45, 3.5, 0.42, 0.58, 0.34, 1, 0.25, 0.15, 0, 0, 0, 0.12,
    ],
    usdPrice: "$120.77",
  },
  {
    playerName: "Luka Modric",
    team: "RMA",
    age: "38",
    score1: 61,
    stats: [
      18.5, 52.1, 38.14, 2.4, 0.14, 0.22, 0.05, 0, 0.11, 0.1, 0, 0, 0, 0.03,
    ],
    usdPrice: "$9.58",
  },
];
