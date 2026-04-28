"use client";

import { cn } from "@/src/lib/utils";

export type MonochromePillTab<T extends string = string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  tabs: MonochromePillTab<T>[];
  className?: string;
};

/**
 * No strip background — sits on the page. Light: inactive + hover border; active = white on black.
 * Dark: active = inverted pill (white bg, black text).
 */
export function MonochromePillTabs<T extends string>({ value, onChange, tabs, className }: Props<T>) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2 px-3 py-2.5 md:hidden", className)}
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = value === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "font-azonix text-[11px] font-bold uppercase tracking-wide rounded-md px-4 py-2 transition-colors min-h-[40px] outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-white dark:focus-visible:ring-offset-stone-950",
              active
                ? "bg-[#00f976] text-black dark:bg-[#00f976] dark:text-black"
                : "border border-transparent bg-transparent text-neutral-950 hover:border-black dark:text-neutral-100 dark:hover:border-white/60",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
