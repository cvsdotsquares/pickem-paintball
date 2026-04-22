"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { FaArrowRight, FaArrowLeft } from "react-icons/fa";
import {
  BADGE_DEFINITIONS,
  BADGE_DISPLAY_ORDER,
  sortUserBadges,
  type BadgeId,
  type UserBadges,
} from "@/src/lib/badges";
import { useBadgeRarity } from "@/src/lib/useBadgeRarity";
import { useTheme } from "@/src/contexts/ThemeContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  badges: UserBadges | null | undefined;
  isSubscribed: boolean;
  onSubscribeClick?: () => void;
}

export default function BadgesAnnouncementModal({
  isOpen,
  onClose,
  badges,
  isSubscribed,
  onSubscribeClick,
}: Props) {
  const [page, setPage] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [hoveredBadge, setHoveredBadge] = useState<BadgeId | null>(null);
  const [supportsHover, setSupportsHover] = useState(true);
  const rarityOf = useBadgeRarity();
  const { theme } = useTheme();

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setSupportsHover(window.matchMedia("(hover: hover)").matches);
    }
  }, []);
  useEffect(() => {
    if (isOpen) {
      setPage(0);
      setHoveredBadge(null);
    }
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  const earned = sortUserBadges(badges ?? {});
  const totalCount = earned.reduce((sum, b) => sum + b.count, 0);
  const earnedMap = new Map(earned.map((b) => [b.id, b.count]));

  const pages = [
    {
      key: "intro",
      content: (
        <div className="flex flex-col items-center text-center px-2">
          <div className="grid grid-cols-5 gap-2 mb-6">
            {BADGE_DISPLAY_ORDER.slice(0, 10).map((id) => (
              <div
                key={id}
                className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center"
              >
                <Image
                  src={BADGE_DEFINITIONS[id].imageSrc}
                  alt={BADGE_DEFINITIONS[id].name}
                  width={56}
                  height={56}
                  className="object-contain"
                  unoptimized
                />
              </div>
            ))}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mb-3 uppercase tracking-tight">
            Introducing Badges
          </h2>
          <p className="text-sm text-gray-600 dark:text-white/70 max-w-md leading-relaxed">
            Show off your achievements on the leaderboard. Earn badges for
            event ranking, season performance, and playing Pick'Em at every
            event.
          </p>
        </div>
      ),
    },
    {
      key: "yours",
      content: (
        <div className="flex flex-col items-center text-center px-2">
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-2 uppercase tracking-tight">
            Badges To Win
          </h2>
          <p className="text-sm text-gray-600 dark:text-white/60 mb-6 max-w-md">
            {earned.length > 0
              ? `We looked back through every event you've played, and so far you've won ${totalCount} badge${totalCount === 1 ? "" : "s"}.`
              : "Keep playing to earn more badges and show you know ball!"}
          </p>
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
                      ? () =>
                          setHoveredBadge((h) => (h === id ? null : h))
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
          <div className="mt-4 min-h-[64px] w-full max-w-md flex flex-col items-center justify-center px-2">
            {hoveredBadge ? (
              <>
                <div className="text-[10px] uppercase tracking-widest font-black text-gray-900 dark:text-white">
                  {BADGE_DEFINITIONS[hoveredBadge].name}
                </div>
                <div className="text-xs text-gray-600 dark:text-white/60 mt-1 text-center">
                  {BADGE_DEFINITIONS[hoveredBadge].description}
                </div>
                {rarityOf(hoveredBadge) && (
                  <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500 dark:text-white/50 mt-1">
                    Won by {rarityOf(hoveredBadge)} of players
                  </div>
                )}
              </>
            ) : (
              <div className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-white/30">
                Hover or tap a badge to see how to earn it
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "cta",
      content: (
        <div className="flex flex-col items-center text-center px-2">
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mb-3 uppercase tracking-tight">
            {isSubscribed ? "Show Them Off" : "Subscribe To Display"}
          </h2>
          <p className="text-sm text-gray-600 dark:text-white/70 max-w-md leading-relaxed mb-6">
            {isSubscribed
              ? "Your badges will appear next to your name on every leaderboard. Thank you for supporting Pick'Em Paintball."
              : "Subscribe to show off your badges and support Pick'Em Paintball."}
          </p>
          {!isSubscribed && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onSubscribeClick?.();
              }}
              className="bg-[#00f976] hover:opacity-90 text-black font-black text-xs uppercase tracking-widest rounded-lg px-6 py-3 mb-3"
            >
              Subscribe
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className={
              isSubscribed
                ? "bg-[#1a3c6e] hover:bg-[#1a3c6e]/90 text-white font-black text-xs uppercase tracking-widest rounded-lg px-6 py-3"
                : "text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white text-xs uppercase tracking-widest font-bold"
            }
          >
            {isSubscribed ? "Got It" : "Next Time"}
          </button>
        </div>
      ),
    },
  ];

  const isLast = page === pages.length - 1;
  const isFirst = page === 0;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
      <motion.div
        key="badges-modal"
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-lg bg-white dark:bg-[#0d0d0d] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex justify-center pt-6 pb-2">
          <Image
            src={theme === "light" ? "/logo.svg" : "/logo-dark.svg"}
            alt="Pick'Em Paintball"
            width={130}
            height={32}
            priority
          />
        </div>
        <div className="px-6 pt-2 pb-6 min-h-[420px] flex flex-col justify-between">
          <AnimatePresence mode="wait">
            <motion.div
              key={pages[page].key}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex items-center justify-center"
            >
              {pages[page].content}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100 dark:border-white/5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={isFirst}
              className="text-gray-400 dark:text-white/40 hover:text-gray-900 dark:hover:text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2 disabled:opacity-0"
            >
              <FaArrowLeft size={10} />
              Back
            </button>

            <div className="flex items-center gap-1.5">
              {pages.map((_, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setPage(i)}
                  aria-label={`Page ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === page
                      ? "w-6 bg-gray-900 dark:bg-white"
                      : "w-1.5 bg-gray-300 dark:bg-white/20"
                  }`}
                />
              ))}
            </div>

            {!isLast ? (
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="text-gray-900 dark:text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2"
              >
                Next
                <FaArrowRight size={10} />
              </button>
            ) : (
              <div className="w-12" />
            )}
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
