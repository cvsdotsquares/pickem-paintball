"use client";
import { getNestedValue } from "@/src/lib/nested-values";
import * as React from "react";

// Default fallback values
const DEFAULT_FALLBACKS = {
  playerImage:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80' fill='none'%3E%3Crect width='80' height='80' fill='%23333333'/%3E%3Cpath d='M40 40C46.0751 40 51 35.0751 51 29C51 22.9249 46.0751 18 40 18C33.9249 18 29 22.9249 29 29C29 35.0751 33.9249 40 40 40ZM40 45.5C31.9875 45.5 16 49.5125 16 57.5V62H64V57.5C64 49.5125 48.0125 45.5 40 45.5Z' fill='%23666666'/%3E%3C/svg%3E",
  playerName: "Unknown Player",
  playerDetails: "N/A",
  statsButtonImage:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M8 0C3.6 0 0 3.6 0 8C0 12.4 3.6 16 8 16C12.4 16 16 12.4 16 8C16 3.6 12.4 0 8 0ZM9 12H7V7H9V12ZM8 6C7.4 6 7 5.6 7 5C7 4.4 7.4 4 8 4C8.6 4 9 4.4 9 5C9 5.6 8.6 6 8 6Z' fill='white' fill-opacity='0.5'/%3E%3C/svg%3E",
  teamLogo:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Crect width='12' height='12' fill='%23333333'/%3E%3C/svg%3E",
  teamCode: "TBD",
  gameWeek: "GW--",
  infoButtonImage:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10' fill='none'%3E%3Cpath d='M5 0C2.2 0 0 2.2 0 5C0 7.8 2.2 10 5 10C7.8 10 10 7.8 10 5C10 2.2 7.8 0 5 0ZM5.5 7.5H4.5V4.5H5.5V7.5ZM5.5 3.5H4.5V2.5H5.5V3.5Z' fill='white' fill-opacity='0.5'/%3E%3C/svg%3E",
  iconSrc:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32' fill='none'%3E%3Crect width='32' height='32' fill='%23333333'/%3E%3C/svg%3E",
  percentage: "0%",
  progressBarSrc:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='2' viewBox='0 0 32 2' fill='none'%3E%3Crect width='32' height='2' fill='white' fill-opacity='0.2'/%3E%3C/svg%3E",
  ethPrice: "0 ETH",
  usdPrice: "$0.00",
};

// Player Info Cell Renderer with fallbacks
export const playerInfoRenderer = (value: any, rowData: any) => {
  const playerImage =
    getNestedValue(rowData, "playerImage") || DEFAULT_FALLBACKS.playerImage;
  const playerName =
    getNestedValue(rowData, "playerName") || DEFAULT_FALLBACKS.playerName;
  const playerDetails =
    getNestedValue(rowData, "playerDetails") || DEFAULT_FALLBACKS.playerDetails;
  const statsButtonImage =
    getNestedValue(rowData, "statsButtonImage") ||
    DEFAULT_FALLBACKS.statsButtonImage;

  return (
    <div className="flex relative gap-4 items-center pr-3 pl-6 w-full h-full bg-stone-950 max-md:pl-5">
      <div className="flex absolute inset-y-0 -right-4 z-0 shrink-0 self-start w-4 h-28" />
      <div className="flex z-0 gap-4 items-center self-stretch py-4 my-auto text-white bg-stone-950 min-w-60 w-[268px]">
        <img
          src={playerImage}
          alt="Player avatar"
          className="object-contain shrink-0 self-stretch my-auto w-20 aspect-square"
          onError={(e) => {
            e.currentTarget.src = DEFAULT_FALLBACKS.playerImage;
          }}
        />
        <div className="flex-1 shrink self-stretch my-auto basis-0">
          <h2 className="w-full text-base font-bold leading-none uppercase">
            <span className="w-full">{playerName}</span>
          </h2>
          <div className="flex flex-wrap items-center w-full text-sm leading-none">
            <p className="self-stretch pb-px my-auto">{playerDetails}</p>
          </div>
        </div>
      </div>
      <div className="z-0 self-stretch pt-1 my-auto w-8">
        <button
          className="flex overflow-hidden justify-center items-center w-8 rounded bg-white bg-opacity-10 min-h-6"
          aria-label="View last 5 stats"
        >
          <img
            src={statsButtonImage}
            alt="Stats icon"
            className="object-contain flex-1 shrink self-stretch my-auto w-full aspect-[1.33] basis-0"
            onError={(e) => {
              e.currentTarget.src = DEFAULT_FALLBACKS.statsButtonImage;
            }}
          />
        </button>
      </div>
    </div>
  );
};

// Match Info Cell Renderer with fallbacks
export const matchInfoRenderer = (value: any, rowData: any) => {
  const homeTeam = getNestedValue(rowData, "homeTeam") || {};
  const awayTeam = getNestedValue(rowData, "awayTeam") || {};
  const homeTeamCode =
    getNestedValue(homeTeam, "code") || DEFAULT_FALLBACKS.teamCode;
  const homeTeamLogo =
    getNestedValue(homeTeam, "logo") || DEFAULT_FALLBACKS.teamLogo;
  const awayTeamCode =
    getNestedValue(awayTeam, "code") || DEFAULT_FALLBACKS.teamCode;
  const awayTeamLogo =
    getNestedValue(awayTeam, "logo") || DEFAULT_FALLBACKS.teamLogo;
  const gameWeek =
    getNestedValue(rowData, "gameWeek") || DEFAULT_FALLBACKS.gameWeek;
  const infoButtonImage =
    getNestedValue(rowData, "infoButtonImage") ||
    DEFAULT_FALLBACKS.infoButtonImage;

  return (
    <div className="flex gap-1 justify-center items-center px-3.5 py-11 bg-stone-950 w-full h-full">
      <div className="relative self-stretch my-auto text-xs leading-none text-white whitespace-nowrap w-[120px]">
        <div className="flex overflow-hidden z-0 items-center w-full rounded bg-white bg-opacity-10 min-h-6 min-w-[120px]">
          <div className="justify-center items-center border-solid border-r-[0.889px] border-r-[#101010] self-stretch flex my-auto min-h-6 px-[11px] py-[6px] gap-4 w-[60px]">
            <img
              src={homeTeamLogo}
              alt={`${homeTeamCode} logo`}
              className="object-contain shrink-0 self-stretch my-auto w-3 aspect-square"
              onError={(e) => {
                e.currentTarget.src = DEFAULT_FALLBACKS.teamLogo;
              }}
            />
            <span className="self-stretch my-auto">{homeTeamCode}</span>
          </div>
          <div className="flex gap-1 justify-center items-center self-stretch px-2.5 py-1.5 my-auto bg-white bg-opacity-10 min-h-6 w-[60px]">
            <span className="self-stretch my-auto">{awayTeamCode}</span>
            <img
              src={awayTeamLogo}
              alt={`${awayTeamCode} logo`}
              className="object-contain shrink-0 self-stretch my-auto w-3 aspect-square"
              onError={(e) => {
                e.currentTarget.src = DEFAULT_FALLBACKS.teamLogo;
              }}
            />
          </div>
        </div>
        <div className="flex absolute inset-x-0 -bottom-3.5 z-0 justify-center items-center pr-12 pl-12 max-w-full w-[120px] max-md:px-5">
          <span className="self-stretch my-auto">{gameWeek}</span>
        </div>
      </div>
      <div className="flex self-stretch my-auto w-6">
        <button
          className="flex justify-center items-center px-2 w-6 h-6 rounded-3xl backdrop-blur-lg bg-white bg-opacity-10 min-h-6"
          aria-label="Match information"
        >
          <img
            src={infoButtonImage}
            alt="Info icon"
            className="object-contain self-stretch my-auto w-2.5 aspect-[0.77]"
            onError={(e) => {
              e.currentTarget.src = DEFAULT_FALLBACKS.infoButtonImage;
            }}
          />
        </button>
      </div>
    </div>
  );
};

// Performance Cell Renderer with fallbacks
export const performanceRenderer = (value: any = {}) => {
  const iconSrc = value?.iconSrc || DEFAULT_FALLBACKS.iconSrc;
  const percentage = value?.percentage || DEFAULT_FALLBACKS.percentage;
  const progressBarSrc =
    value?.progressBarSrc || DEFAULT_FALLBACKS.progressBarSrc;

  return (
    <div className="flex justify-center items-center px-4 py-8 text-xs leading-none text-white whitespace-nowrap w-full h-full">
      <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto w-full basis-0">
        <img
          src={iconSrc}
          alt="Stat icon"
          className="object-contain w-full aspect-square min-h-8"
          onError={(e) => {
            e.currentTarget.src = DEFAULT_FALLBACKS.iconSrc;
          }}
        />
        <div className="flex mt-1 w-full">
          <div className="flex flex-col flex-1 shrink justify-center items-center w-full basis-0">
            <p>{percentage}</p>
            <img
              src={progressBarSrc}
              alt="Progress bar"
              className="object-contain mt-1 w-8 aspect-[15.87] fill-white fill-opacity-20"
              onError={(e) => {
                e.currentTarget.src = DEFAULT_FALLBACKS.progressBarSrc;
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// Simple Stat Cell Renderer with fallbacks
export const simpleStatRenderer = (value: any) => {
  const displayValue = value !== null && value !== undefined ? value : "0";

  return (
    <div className="flex justify-center items-center px-6 py-12 text-sm font-bold leading-none text-white whitespace-nowrap w-full h-full max-md:px-5">
      <p className="flex-1 shrink self-stretch pb-px my-auto w-full basis-0 text-center">
        {displayValue}
      </p>
    </div>
  );
};

// Price Info Cell Renderer with fallbacks
export const priceInfoRenderer = (value: any = {}) => {
  const ethPrice = value?.ethPrice || DEFAULT_FALLBACKS.ethPrice;
  const usdPrice = value?.usdPrice || DEFAULT_FALLBACKS.usdPrice;

  return (
    <div className="flex relative z-10 flex-col justify-center items-end py-7 pr-6 pl-3 w-full h-full bg-stone-950 max-md:pr-5">
      <div className="flex z-0 items-end max-w-full text-right text-white w-[106px]">
        <div className="w-[106px]">
          <div className="flex gap-1 items-start w-full">
            <span className="text-xs leading-none">{ethPrice}</span>
            <span className="text-base font-bold">{usdPrice}</span>
          </div>
        </div>
      </div>
      <div className="flex z-0 items-center mt-1 text-base font-bold leading-none text-center whitespace-nowrap text-stone-950">
        <button className="flex gap-2 justify-center items-center self-stretch px-4 py-1.5 my-auto bg-white min-h-8 rounded-[32px]">
          <span className="flex shrink-0 self-stretch my-auto h-4 w-[9px]" />
          <span className="self-stretch my-auto">Listings</span>
        </button>
      </div>
      <div className="flex absolute inset-y-0 right-44 z-0 self-start w-4 min-h-28" />
    </div>
  );
};
