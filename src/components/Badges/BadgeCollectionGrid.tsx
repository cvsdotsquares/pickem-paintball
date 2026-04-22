"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  BADGE_DEFINITIONS,
  BADGE_DISPLAY_ORDER,
  sortUserBadges,
  type BadgeId,
  type UserBadges,
} from "@/src/lib/badges";
import { useBadgeRarity } from "@/src/lib/useBadgeRarity";

interface Props {
  badges: UserBadges | null | undefined;
  emptyHint?: string;
  align?: "center" | "start";
}

export default function BadgeCollectionGrid({
  badges,
  emptyHint = "Hover or tap a badge to see how to earn it",
  align = "center",
}: Props) {
  const alignClass = align === "start" ? "items-start" : "items-center";
  const textAlignClass = align === "start" ? "text-left" : "text-center";
  const [hoveredBadge, setHoveredBadge] = useState<BadgeId | null>(null);
  const [supportsHover, setSupportsHover] = useState(true);
  const rarityOf = useBadgeRarity();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSupportsHover(window.matchMedia("(hover: hover)").matches);
    }
  }, []);

  const earned = sortUserBadges(badges ?? {});
  const earnedMap = new Map(earned.map((b) => [b.id, b.count]));

  return (
    <div className={`flex flex-col ${alignClass} w-full`}>
      <div className="grid grid-cols-5 gap-2 w-full max-w-md">
        {BADGE_DISPLAY_ORDER.slice(0, 10).map((id) => {
          const def = BADGE_DEFINITIONS[id];
          const count = earnedMap.get(id) ?? 0;
          const isEarned = count > 0;
          const isHovered = hoveredBadge === id;
          return (
            <button
              type="button"
              key={id}
              onMouseEnter={
                supportsHover ? () => setHoveredBadge(id) : undefined
              }
              onMouseLeave={
                supportsHover
                  ? () => setHoveredBadge((h) => (h === id ? null : h))
                  : undefined
              }
              onClick={() =>
                setHoveredBadge((h) => (h === id ? null : id))
              }
              className={`relative rounded-lg p-2 flex flex-col items-center border outline-none transition-colors ${
                isEarned
                  ? "bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 hover:border-gray-400 dark:hover:border-white/30"
                  : "bg-gray-50/50 dark:bg-white/[0.02] border-gray-100 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/20"
              } ${isHovered ? "border-gray-500 dark:border-white/40" : ""}`}
            >
              <div className="relative">
                <Image
                  src={def.imageSrc}
                  alt={def.name}
                  width={48}
                  height={48}
                  className={`object-contain ${
                    isEarned ? "" : "grayscale opacity-25"
                  }`}
                  unoptimized
                />
                {isEarned && def.showCount && count > 1 && (
                  <span
                    className="absolute -bottom-1 -right-2 bg-red-500 text-white rounded-full font-bold leading-none flex items-center justify-center min-w-[16px] h-[16px] px-[4px]"
                    style={{ fontSize: 10 }}
                  >
                    {count}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div className={`mt-4 min-h-[64px] w-full max-w-md flex flex-col ${alignClass} justify-center px-2`}>
        {hoveredBadge ? (
          <>
            <div className="text-[10px] uppercase tracking-widest font-black text-gray-900 dark:text-white">
              {BADGE_DEFINITIONS[hoveredBadge].name}
            </div>
            <div className={`text-xs text-gray-600 dark:text-white/60 mt-1 ${textAlignClass}`}>
              {BADGE_DEFINITIONS[hoveredBadge].description}
            </div>
            {rarityOf(hoveredBadge) && (
              <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500 dark:text-white/50 mt-1">
                Won by {rarityOf(hoveredBadge)} of players
              </div>
            )}
          </>
        ) : (
          <div className={`text-[10px] uppercase tracking-widest text-gray-400 dark:text-white/30 ${textAlignClass}`}>
            {emptyHint}
          </div>
        )}
      </div>
    </div>
  );
}
