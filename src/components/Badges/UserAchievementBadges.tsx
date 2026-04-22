"use client";

import { useState } from "react";
import Image from "next/image";
import {
  BADGE_DEFINITIONS,
  sortUserBadges,
  type BadgeId,
  type UserBadges,
} from "@/src/lib/badges";
import BadgeListSheet from "./BadgeListSheet";

interface Props {
  badges: UserBadges | null | undefined;
  size?: number;
  maxVisible?: number;
  className?: string;
  playerName?: string;
}

function badgeTooltip(id: BadgeId, count: number, playerName: string): string {
  const who = playerName || "This player";
  switch (id) {
    case "streak":
      return `${who} has played ${count} event${count === 1 ? "" : "s"} in a row.`;
    default:
      return BADGE_DEFINITIONS[id]?.description ?? "";
  }
}

export default function UserAchievementBadges({
  badges,
  size = 18,
  maxVisible = 5,
  className = "",
  playerName = "",
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<BadgeId | null>(null);

  if (!badges) return null;
  const ordered = sortUserBadges(badges);
  if (ordered.length === 0) return null;

  const visible = ordered.slice(0, maxVisible);
  const overflow = ordered.length - visible.length;

  const openSheet = (id: BadgeId | null) => {
    setHighlightId(id);
    setSheetOpen(true);
  };

  return (
    <>
      <div
        className={`inline-flex items-center gap-0.5 align-middle flex-shrink-0 ${className}`}
      >
        {visible.map(({ id, count }) => {
          const def = BADGE_DEFINITIONS[id];
          if (!def) return null;
          return (
            <button
              type="button"
              key={id}
              onClick={(e) => {
                e.stopPropagation();
                openSheet(id);
              }}
              aria-label={def.name}
              className="relative group inline-flex items-center outline-none"
              style={{ width: size, height: size }}
            >
              <Image
                src={def.imageSrc}
                alt={def.name}
                width={size}
                height={size}
                className="object-contain select-none pointer-events-none"
                draggable={false}
                unoptimized
              />
              {def.showCount && count > 1 && (
                <span
                  className="absolute -bottom-0.5 -right-1 bg-red-500 text-white rounded-full font-bold leading-none flex items-center justify-center min-w-[12px] h-[12px] px-[3px]"
                  style={{ fontSize: 8 }}
                >
                  {count}
                </span>
              )}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden md:group-hover:block z-50 pointer-events-none">
                <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg border border-gray-700">
                  {badgeTooltip(id, count, playerName)}
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
              </div>
            </button>
          );
        })}
        {overflow > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openSheet(null);
            }}
            className="text-[9px] font-bold text-gray-500 dark:text-white/40 ml-0.5 px-1 py-0.5 rounded hover:text-gray-900 dark:hover:text-white"
          >
            +{overflow}
          </button>
        )}
      </div>
      <BadgeListSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        playerName={playerName}
        badges={ordered}
        highlightId={highlightId}
      />
    </>
  );
}
