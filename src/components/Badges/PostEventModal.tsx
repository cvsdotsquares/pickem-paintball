"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { FaArrowRight, FaArrowLeft, FaTrophy } from "react-icons/fa";
import { BADGE_DEFINITIONS, type BadgeId } from "@/src/lib/badges";

export interface TeamHighlight {
  playerName: string;
  playerTeam?: string;
  kills: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  eventName: string;
  eventRank: number | null;
  eventPoints: number | null;
  seasonRank: number | null;
  newBadges: Array<{ id: BadgeId; count: number; delta?: number }>;
  teamHighlights: TeamHighlight[];
  isSubscribed: boolean;
  onSubscribeClick?: () => void;
}

function formatRank(rank: number | null): string {
  if (rank == null || !Number.isFinite(rank)) return "—";
  const lastTwo = rank % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${rank}th`;
  switch (rank % 10) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
}

export default function PostEventModal({
  isOpen,
  onClose,
  eventName,
  eventRank,
  eventPoints,
  seasonRank,
  newBadges,
  teamHighlights,
  isSubscribed,
  onSubscribeClick,
}: Props) {
  const [page, setPage] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (isOpen) setPage(0);
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  const hasBadges = newBadges.length > 0;
  const hasHighlights = teamHighlights.length > 0;

  const summaryPage = (
    <div className="flex flex-col items-center text-center px-2 w-full">
      <div className="text-[10px] uppercase tracking-widest font-black text-gray-400 dark:text-white/40 mb-1">
        Event Wrap
      </div>
      <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-6 uppercase tracking-tight">
        {eventName}
      </h2>
      <div className="grid grid-cols-3 gap-3 w-full max-w-md">
        <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-4">
          <div className="text-[8px] uppercase tracking-widest font-black text-gray-400 dark:text-white/40 mb-1">
            Event Rank
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white tabular-nums">
            {formatRank(eventRank)}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-4">
          <div className="text-[8px] uppercase tracking-widest font-black text-gray-400 dark:text-white/40 mb-1">
            Points
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white tabular-nums">
            {eventPoints ?? 0}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-4">
          <div className="text-[8px] uppercase tracking-widest font-black text-gray-400 dark:text-white/40 mb-1">
            Season Rank
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white tabular-nums">
            {formatRank(seasonRank)}
          </div>
        </div>
      </div>
    </div>
  );

  const badgesPage = (
    <div className="flex flex-col items-center text-center px-2 w-full">
      <div className="text-[10px] uppercase tracking-widest font-black text-gray-400 dark:text-white/40 mb-1">
        Achievements
      </div>
      <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-6 uppercase tracking-tight">
        {hasBadges ? "Badges Earned" : "No New Badges"}
      </h2>
      {hasBadges ? (
        <div className="flex flex-wrap items-center justify-center gap-4 max-w-md">
          {newBadges.map(({ id, count, delta }, i) => {
            const def = BADGE_DEFINITIONS[id];
            const showDelta = typeof delta === "number" && delta > 0;
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1, type: "spring", damping: 14 }}
                className="flex flex-col items-center"
              >
                <div className="relative">
                  <Image
                    src={def.imageSrc}
                    alt={def.name}
                    width={72}
                    height={72}
                    className="object-contain"
                    unoptimized
                  />
                  {showDelta ? (
                    <span
                      className="absolute -bottom-1 -right-2 bg-green-500 text-white rounded-full font-bold leading-none flex items-center justify-center min-w-[22px] h-[18px] px-[5px]"
                      style={{ fontSize: 11 }}
                    >
                      +{delta}
                    </span>
                  ) : (
                    def.showCount && count > 1 && (
                      <span
                        className="absolute -bottom-1 -right-2 bg-red-500 text-white rounded-full font-bold leading-none flex items-center justify-center min-w-[18px] h-[18px] px-[5px]"
                        style={{ fontSize: 11 }}
                      >
                        {count}
                      </span>
                    )
                  )}
                </div>
                <span className="text-[10px] uppercase tracking-widest font-bold text-gray-700 dark:text-white/70 mt-2">
                  {def.name}
                </span>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-white/50 max-w-md">
          You didn't pick up any new badges this event — keep playing to climb
          the rankings.
        </p>
      )}
    </div>
  );

  const highlightsPage = (
    <div className="flex flex-col items-center text-center px-2 w-full">
      <div className="text-[10px] uppercase tracking-widest font-black text-gray-400 dark:text-white/40 mb-1">
        Your Team
      </div>
      <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-6 uppercase tracking-tight">
        Top Performers
      </h2>
      {hasHighlights ? (
        <div className="flex flex-col gap-2 w-full max-w-md">
          {teamHighlights.slice(0, 3).map((player, i) => (
            <div
              key={`${player.playerName}-${i}`}
              className="flex items-center justify-between bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`flex items-center justify-center w-7 h-7 rounded-full font-black text-[10px] tabular-nums ${
                    i === 0
                      ? "bg-yellow-400 text-black"
                      : i === 1
                        ? "bg-gray-300 text-black"
                        : "bg-amber-700 text-white"
                  }`}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 text-left">
                  <div className="text-xs font-bold text-gray-900 dark:text-white truncate">
                    {player.playerName}
                  </div>
                  {player.playerTeam && (
                    <div className="text-[10px] text-gray-400 dark:text-white/40 truncate">
                      {player.playerTeam}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-lg font-black text-gray-900 dark:text-white tabular-nums flex-shrink-0">
                {player.kills}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-white/50 max-w-md">
          You didn't enter a team for this event.
        </p>
      )}
    </div>
  );

  const ctaPage = (
    <div className="flex flex-col items-center text-center px-2">
      {isSubscribed ? (
        <>
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center mb-4">
            <FaTrophy className="text-white text-2xl" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-3 uppercase tracking-tight">
            Thanks For Your Support
          </h2>
          <p className="text-sm text-gray-600 dark:text-white/70 max-w-md leading-relaxed mb-6">
            We hope you enjoyed the event. Pick'Em Paintball is built for fans,
            and your subscription keeps us going.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-3 uppercase tracking-tight">
            Thanks For Playing
          </h2>
          <p className="text-sm text-gray-600 dark:text-white/70 max-w-md leading-relaxed mb-6">
            Pick'Em Paintball is built by the fans, for the fans.
            <br />
            <br />
            Subscribe to support Pick'Em, display your badges and more! Either
            way — thanks for playing and being part of the community.
          </p>
        </>
      )}
      {!isSubscribed && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onSubscribeClick?.();
          }}
          className="bg-[#00f976] hover:opacity-90 text-black font-black text-xs uppercase tracking-widest rounded-lg px-6 py-3 mb-3"
        >
          Subscribe to Support
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
        {isSubscribed ? "Close" : "No Thanks"}
      </button>
    </div>
  );

  const pages = [
    { key: "summary", content: summaryPage },
    { key: "badges", content: badgesPage },
    { key: "highlights", content: highlightsPage },
    { key: "cta", content: ctaPage },
  ];

  const isLast = page === pages.length - 1;
  const isFirst = page === 0;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
      <motion.div
        key="post-event-modal"
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-lg bg-white dark:bg-[#0d0d0d] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-6 pt-8 pb-6 min-h-[420px] flex flex-col justify-between">
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
