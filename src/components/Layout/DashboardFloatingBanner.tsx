"use client";

import { useCallback, useEffect, useState } from "react";
import { LuX } from "react-icons/lu";

const STORAGE_KEY = "pickem-dashboard-bottom-banner-dismissed";

/**
 * Typical corner promo / help strip (structure only — swap copy anytime).
 */
export default function DashboardFloatingBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-4 right-4 z-40 flex justify-start sm:right-auto sm:left-4 sm:max-w-sm"
      role="complementary"
      aria-label="Promotional message"
    >
      <div className="pointer-events-auto relative rounded-lg border border-gray-200 bg-white p-3 pr-10 text-sm text-gray-900 shadow-lg dark:border-white/20 dark:bg-stone-900 dark:text-stone-100">
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-2 top-2 rounded-full p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"
          aria-label="Dismiss"
        >
          <LuX className="h-4 w-4" />
        </button>
        <p className="font-medium font-azonix uppercase tracking-wide text-xs">
          PickEm tips
        </p>
        <p className="mt-1 text-xs leading-snug text-gray-600 dark:text-stone-400">
          Check the FAQ for scoring rules and league setup — tap{" "}
          <span className="font-semibold text-gray-900 dark:text-white">×</span>{" "}
          to hide this note.
        </p>
      </div>
    </div>
  );
}
