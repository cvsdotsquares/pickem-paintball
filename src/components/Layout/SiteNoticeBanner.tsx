"use client";

import { useCallback, useEffect, useState } from "react";
import { LuInfo, LuX } from "react-icons/lu";

/**
 * One-off notice strip under the menu bar on every signed-in page.
 * It switches itself off at EXPIRES_AT, so no second deploy is needed to clear it.
 * To reuse: change the id (so people who closed the last notice see the new one),
 * the message and the expiry time.
 */
const NOTICE_ID = "2026-11-14-match-data-fix";
const EXPIRES_AT = Date.parse("2026-11-15T01:29:00Z");
const MESSAGE =
  "A bug impacting LTF vs PBFit & TonTon Arsenal vs TPP Crew has been resolved. " +
  "This will impact their kill count and Pick'Em scores; we apologise for any inconvenience.";

const STORAGE_KEY = `pickem-site-notice-dismissed-${NOTICE_ID}`;

export default function SiteNoticeBanner() {
  // Hidden until checked in the browser, so it never flashes for people who closed it.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Date.now() >= EXPIRES_AT) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      /* storage blocked: show it */
    }
    if (dismissed) return;
    setVisible(true);
    // Also clears for anyone who leaves the page open past the expiry time.
    const timer = setTimeout(() => setVisible(false), Math.min(EXPIRES_AT - Date.now(), 2 ** 31 - 1));
    return () => clearTimeout(timer);
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
      role="status"
      className="w-full shrink-0 border-b border-white/10 bg-black text-white dark:bg-stone-900"
    >
      <div className="mx-auto flex w-full max-w-7xl items-start gap-2.5 px-4 py-2.5 sm:items-center sm:px-6">
        <LuInfo className="mt-0.5 h-4 w-4 shrink-0 text-[#00f976] sm:mt-0" aria-hidden />
        <p className="min-w-0 flex-1 text-xs leading-snug sm:text-sm">{MESSAGE}</p>
        <button
          type="button"
          onClick={dismiss}
          className="-mr-1 shrink-0 rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Dismiss notice"
        >
          <LuX className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
