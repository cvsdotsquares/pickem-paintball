"use client";

import type { ReactNode } from "react";
import type { League } from "@/src/lib/league-types";
import { getFirebaseStorageUrl } from "@/src/lib/storage";
import { cn } from "@/src/lib/utils";

const TILE_IDLE =
  "border-emerald-200/80 bg-white shadow-sm ring-1 ring-black/5 hover:border-emerald-400 hover:shadow-md dark:border-emerald-800 dark:bg-stone-800 dark:ring-white/10 dark:hover:border-emerald-500";

const TILE_ACTIVE =
  "border-emerald-600 ring-2 ring-emerald-500/50 dark:border-emerald-400 dark:ring-emerald-400/40";

/** Outer wrapper: one horizontal scroll for all league tiles (shared strip). */
export const LEAGUE_TILE_STRIP_SCROLL =
  "-mx-1 overflow-x-auto pb-1 pt-0.5 touch-pan-x snap-x snap-mandatory [-webkit-overflow-scrolling:touch]";

type LeagueTileButtonProps = {
  isActive?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
};

/** Square league tile — shared by scope (Your leagues) and joinable discover */
export function LeagueTileButton({
  isActive = false,
  onClick,
  title,
  children,
}: LeagueTileButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "group relative h-16 w-16 shrink-0 snap-start overflow-hidden rounded-2xl border-2 transition focus:outline-none focus:ring-2 focus:ring-emerald-500",
        TILE_IDLE,
        isActive && TILE_ACTIVE,
      )}
    >
      {children}
      <span className="sr-only">{title}</span>
    </button>
  );
}

export function LeagueTileThumb({ league }: { league: League }) {
  return league.icon ? (
    <img
      src={getFirebaseStorageUrl(league.icon)}
      alt=""
      className="h-full w-full object-cover"
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-100 to-emerald-200 text-lg font-bold text-emerald-900 dark:from-stone-700 dark:to-stone-800 dark:text-emerald-100">
      {league.name.charAt(0)}
    </div>
  );
}
