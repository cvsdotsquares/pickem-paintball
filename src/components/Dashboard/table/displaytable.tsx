"use client";
import { getNestedValue } from "@/src/lib/nested-values";
import * as React from "react";

// Types for the table data and configuration
export type CellData = string | number | React.ReactNode;

export interface ColumnDefinition {
  id: string;
  header: string;
  width?: string;
  fallback?: any;
  cellRenderer?: (
    value: any,
    rowData: any,
    rowIndex: number
  ) => React.ReactNode;
}

export interface DisplayTableProps {
  columns: ColumnDefinition[];
  data: any[];
  className?: string;
  gridTemplateColumns?: string;
  showHeader?: boolean;
  headerClassName?: string;
  rowClassName?: (rowData: any, index: number) => string;
  cellClassName?: (columnId: string, rowData: any, rowIndex: number) => string;
  emptyMessage?: React.ReactNode;
}

const DisplayTable: React.FC<DisplayTableProps> = ({
  columns,
  data = [],
  className = "",
  gridTemplateColumns,
  showHeader = true,
  headerClassName = "",
  rowClassName = () => "",
  cellClassName = () => "",
  emptyMessage = "No data available",
}) => {
  // Generate grid template columns if not provided
  const gridColumns =
    gridTemplateColumns || columns.map((col) => col.width || "1fr").join(" ");

  // Default cell renderer
  const defaultCellRenderer = (value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400">—</span>;
    }
    if (React.isValidElement(value)) {
      return value;
    }
    return <span>{String(value)}</span>;
  };

  // Check if data is empty
  const isDataEmpty = !data || data.length === 0;

  return (
    <section
      className={`border-solid border-b-[0.889px] border-b-[#393939] bg-[#101010] w-full max-w-[1696px] overflow-x-auto ${className}`}
    >
      <div
        className="grid w-full"
        style={{ gridTemplateColumns }}
        role="table"
        aria-label="Player Statistics Table"
      >
        {/* Table Header */}
        {showHeader && (
          <div className={`contents`} role="rowgroup">
            <div className={`contents`} role="row">
              {columns.map((column) => (
                <div
                  key={column.id}
                  className={`flex items-center justify-center py-3 px-4 font-bold text-sm text-white bg-stone-950 ${headerClassName}`}
                  role="columnheader"
                >
                  {column.header}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Table Body */}
        {isDataEmpty ? (
          <div
            className="col-span-full flex justify-center items-center py-10 text-white"
            role="row"
          >
            <div role="cell" className="text-center">
              {emptyMessage}
            </div>
          </div>
        ) : (
          <div className="contents" role="rowgroup">
            {data.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className={`contents ${rowClassName(row, rowIndex)}`}
                role="row"
              >
                {columns.map((column) => {
                  // Get cell value with fallback
                  const rawValue = getNestedValue(row, column.id);
                  const cellValue =
                    rawValue !== undefined && rawValue !== null
                      ? rawValue
                      : column.fallback;

                  // Render cell content
                  const cellContent = column.cellRenderer
                    ? column.cellRenderer(cellValue, row, rowIndex)
                    : defaultCellRenderer(cellValue);

                  return (
                    <div
                      key={`${rowIndex}-${column.id}`}
                      className={`min-h-28 bg-stone-950 flex items-center justify-center ${cellClassName(
                        column.id,
                        row,
                        rowIndex
                      )}`}
                      role="cell"
                    >
                      {cellContent}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

// Example usage component that demonstrates how to use DisplayTable with the player stats data
export const PlayerStatsTable: React.FC = () => {
  // Import cell renderers from TableCellRenderers.tsx
  const {
    playerInfoRenderer,
    matchInfoRenderer,
    performanceRenderer,
    simpleStatRenderer,
    priceInfoRenderer,
  } = require("./cellrenderer");

  // Column definitions with fallbacks
  const columns: ColumnDefinition[] = [
    {
      id: "player",
      header: "Player",
      width: "268px",
      cellRenderer: playerInfoRenderer,
      fallback: {},
    },
    {
      id: "match",
      header: "Match",
      width: "150px",
      cellRenderer: matchInfoRenderer,
      fallback: {},
    },
    {
      id: "performance1",
      header: "Performance 1",
      width: "80px",
      cellRenderer: performanceRenderer,
      fallback: { iconSrc: "", percentage: "0%", progressBarSrc: "" },
    },
    {
      id: "performance2",
      header: "Performance 2",
      width: "80px",
      cellRenderer: performanceRenderer,
      fallback: { iconSrc: "", percentage: "0%", progressBarSrc: "" },
    },
    {
      id: "stat1",
      header: "Stat 1",
      width: "60px",
      cellRenderer: simpleStatRenderer,
      fallback: "0",
    },
    {
      id: "stat2",
      header: "Stat 2",
      width: "60px",
      cellRenderer: simpleStatRenderer,
      fallback: "0",
    },
    {
      id: "stat3",
      header: "Stat 3",
      width: "60px",
      cellRenderer: simpleStatRenderer,
      fallback: "0",
    },
    {
      id: "stat4",
      header: "Stat 4",
      width: "60px",
      cellRenderer: simpleStatRenderer,
      fallback: "0",
    },
    {
      id: "stat5",
      header: "Stat 5",
      width: "60px",
      cellRenderer: simpleStatRenderer,
      fallback: "0",
    },
    {
      id: "stat6",
      header: "Stat 6",
      width: "60px",
      cellRenderer: simpleStatRenderer,
      fallback: "0",
    },
    {
      id: "stat7",
      header: "Stat 7",
      width: "60px",
      cellRenderer: simpleStatRenderer,
      fallback: "0",
    },
    {
      id: "stat8",
      header: "Stat 8",
      width: "60px",
      cellRenderer: simpleStatRenderer,
      fallback: "0",
    },
    {
      id: "stat9",
      header: "Stat 9",
      width: "60px",
      cellRenderer: simpleStatRenderer,
      fallback: "0",
    },
    {
      id: "stat10",
      header: "Stat 10",
      width: "60px",
      cellRenderer: simpleStatRenderer,
      fallback: "0",
    },
    {
      id: "stat11",
      header: "Stat 11",
      width: "60px",
      cellRenderer: simpleStatRenderer,
      fallback: "0",
    },
    {
      id: "stat12",
      header: "Stat 12",
      width: "60px",
      cellRenderer: simpleStatRenderer,
      fallback: "0",
    },
    {
      id: "price",
      header: "Price",
      width: "176px",
      cellRenderer: priceInfoRenderer,
      fallback: { ethPrice: "0 ETH", usdPrice: "$0.00" },
    },
    {
      id: "stat13",
      header: "Stat 13",
      width: "60px",
      cellRenderer: simpleStatRenderer,
      fallback: "0",
    },
    {
      id: "stat14",
      header: "Stat 14",
      width: "60px",
      cellRenderer: simpleStatRenderer,
      fallback: "0",
    },
  ];

  // Sample data
  const sampleData = [
    {
      player: {}, // This will be passed to the playerInfoRenderer
      playerImage:
        "https://cdn.builder.io/api/v1/image/assets/TEMP/05e5b548ccef021553bd0d5e69a37a3e113cd05a?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      playerName: "Aaron Cresswell",
      playerDetails: "DF • 35 yo",
      statsButtonImage:
        "https://cdn.builder.io/api/v1/image/assets/TEMP/2d7b5dcc9852abb5f89e0f712126b29a59e08146?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      match: {}, // This will be passed to the matchInfoRenderer
      homeTeam: {
        code: "WOL",
        logo: "https://cdn.builder.io/api/v1/image/assets/TEMP/f1a81f6353b5087b67fba5601ee9b3824e082565?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      },
      awayTeam: {
        code: "WHU",
        logo: "https://cdn.builder.io/api/v1/image/assets/TEMP/7b1dcb2b2406d3af6c3e8aa2d7ad5220f7c63e5e?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      },
      gameWeek: "GW67",
      infoButtonImage:
        "https://cdn.builder.io/api/v1/image/assets/TEMP/adc3f516b33c2635693504346d07e6e1cf9c40c2?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      performance1: {
        iconSrc:
          "https://cdn.builder.io/api/v1/image/assets/TEMP/063d848b3bded970c57e1321ddf4c03ce2756b20?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
        percentage: "60%",
        progressBarSrc:
          "https://cdn.builder.io/api/v1/image/assets/TEMP/d63f019196493a710612f17bcde42b4ac2b73ac2?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      },
      performance2: {
        iconSrc:
          "https://cdn.builder.io/api/v1/image/assets/TEMP/b43abf8bf7219d1ddb911de5fe8ddf32b054b5df?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
        percentage: "60%",
        progressBarSrc:
          "https://cdn.builder.io/api/v1/image/assets/TEMP/d63f019196493a710612f17bcde42b4ac2b73ac2?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49",
      },
      stat1: "11",
      stat2: "35",
      stat3: "34.33",
      stat4: "2.8",
      stat5: "0",
      stat6: "0",
      stat7: "0",
      stat8: "0",
      stat9: "0.13",
      stat10: "0.07",
      stat11: "0",
      stat12: "0",
      price: {
        ethPrice: "0.0003 ETH",
        usdPrice: "$0.52",
      },
      stat13: "0",
      stat14: "0",
    },
    // Add more rows as needed
  ];

  return (
    <DisplayTable
      columns={columns}
      data={sampleData}
      gridTemplateColumns={columns.map((col) => col.width || "1fr").join(" ")}
      headerClassName="bg-stone-900 text-white text-xs uppercase"
      showHeader={true}
      emptyMessage={
        <div className="flex flex-col items-center gap-4">
          <p className="text-lg">No player statistics available</p>
          <button className="px-4 py-2 bg-white text-stone-950 rounded-md">
            Refresh Data
          </button>
        </div>
      }
    />
  );
};

export default DisplayTable;
