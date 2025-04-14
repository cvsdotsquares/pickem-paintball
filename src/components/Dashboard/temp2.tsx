import React, { useState } from "react";
import {
  FaUser,
  FaSearch,
  FaFilter,
  FaList,
  FaDollarSign,
} from "react-icons/fa";

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

export const MatchupTable: React.FC<MatchupTableProps> = ({ data }) => {
  const [darkMode, setDarkMode] = useState<boolean>(true);

  const headerButtons = [
    { icon: <FaSearch /> },
    { icon: <FaFilter /> },
    { icon: <FaList /> },
  ];

  const columns: ColumnConfig[] = [
    { key: "player", header: "Player", width: "w-1/3", sticky: true },

    { key: "player", header: "Cost", width: "w-1/3" },
  ];

  const themeClasses: ThemeClasses = darkMode
    ? {
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
      }
    : {
        bg: "bg-white",
        text: "text-gray-900",
        border: "border-gray-200",
        hover: "hover:bg-gray-50",
        headerBg: "bg-gray-50",
        headerText: "text-gray-500",
        button: "bg-white text-gray-700 hover:bg-gray-100",
        activeButton: "bg-blue-500 text-white",
        card: "bg-white border-gray-200",
        progressBg: "bg-gray-200",
      };

  return (
    <section>
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
                        className={`text-xs font-azonix text-left ${
                          darkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        {row.team}
                      </div>
                    </div>
                  </div>
                </td>
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
    </section>
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
];

const Temp2: React.FC = () => {
  return (
    <div className="container mx-auto">
      <MatchupTable data={sampleData} />
    </div>
  );
};

export default Temp2;
