"use client";

import { useTheme } from "@/src/contexts/ThemeContext";

/** Light / dark switch in the admin header (James, 19 Oct). Uses the site's theme, remembered in this browser. */
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:border-gray-400 hover:text-gray-900 dark:border-white/10 dark:text-white/50 dark:hover:border-white/30 dark:hover:text-white"
    >
      <span aria-hidden>{dark ? "☀︎" : "☾"}</span>
      {dark ? "Light" : "Dark"}
    </button>
  );
}
