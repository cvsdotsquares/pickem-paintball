"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { IoMdClose } from "react-icons/io";
import {
  BADGE_DEFINITIONS,
  type BadgeId,
} from "@/src/lib/badges";
import { useBadgeRarity } from "@/src/lib/useBadgeRarity";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  playerName: string;
  badges: Array<{ id: BadgeId; count: number }>;
  highlightId?: BadgeId | null;
}

function describe(id: BadgeId, count: number, playerName: string): string {
  const who = playerName || "This player";
  switch (id) {
    case "streak":
      return `${who} has played ${count} event${count === 1 ? "" : "s"} in a row.`;
    default:
      return BADGE_DEFINITIONS[id]?.description ?? "";
  }
}

export default function BadgeListSheet({
  isOpen,
  onClose,
  playerName,
  badges,
  highlightId,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const rarityOf = useBadgeRarity();
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="badge-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-[75] bg-black/60"
          />
          <motion.div
            key="badge-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[80] bg-white dark:bg-[#0d0d0d] rounded-t-2xl border-t border-gray-100 dark:border-white/5 max-h-[80vh] flex flex-col"
          >
            <div className="flex justify-center pt-3">
              <div className="w-10 h-1 bg-gray-300 dark:bg-white/20 rounded-full" />
            </div>
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="text-[10px] uppercase tracking-widest font-black text-gray-900 dark:text-white truncate">
                {playerName ? `${playerName}'s Badges` : "Badges"}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white"
              >
                <IoMdClose size={20} />
              </button>
            </div>
            <div
              className="overflow-y-auto px-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}
            >
              {badges.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-500 dark:text-white/40">
                  No badges yet.
                </div>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-white/5">
                  {badges.map(({ id, count }) => {
                    const def = BADGE_DEFINITIONS[id];
                    if (!def) return null;
                    const highlighted = highlightId === id;
                    return (
                      <li
                        key={id}
                        className={`flex items-center gap-3 py-3 ${
                          highlighted
                            ? "bg-gray-50 dark:bg-white/5 -mx-4 px-4 rounded-md"
                            : ""
                        }`}
                      >
                        <div
                          className="relative flex-shrink-0"
                          style={{ width: 40, height: 40 }}
                        >
                          <Image
                            src={def.imageSrc}
                            alt={def.name}
                            width={40}
                            height={40}
                            className="object-contain"
                            unoptimized
                          />
                          {def.showCount && count > 1 && (
                            <span
                              className="absolute -bottom-1 -right-2 bg-red-500 text-white rounded-full font-bold leading-none flex items-center justify-center min-w-[16px] h-[16px] px-[4px]"
                              style={{ fontSize: 10 }}
                            >
                              {count}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-bold uppercase tracking-widest text-gray-900 dark:text-white">
                            {def.name}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-white/60 mt-0.5">
                            {describe(id, count, playerName)}
                          </div>
                          {rarityOf(id) && (
                            <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500 dark:text-white/50 mt-1">
                              Won by {rarityOf(id)} of players
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
