"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";
import { MatchupTable } from "@/src/components/Dashboard/datatable";
import PlayerSearch from "@/src/components/Dashboard/PlayerSearch";

/**
 * All-time stats — the same table the stats page renders per event, over every event.
 *
 * The stats page aggregates by SEASON and never across seasons, so this is the one cut
 * it cannot already produce. Reading it from `aggregates/allTime` rather than summing
 * on the client keeps it to a single document read; the alternative is every roster of
 * every event on every visit, which is what the player pages were doing before.
 *
 * Rows are shaped exactly like an event roster, so `MatchupTable` needs no changes and
 * the columns stay identical to the per-event view.
 */

interface SortConfig {
  key: string;
  direction: "ascending" | "descending";
}

export default function AllTimeStatsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, "aggregates", "allTime"))
      .then((s) => {
        if (cancelled) return;
        setRows((s.data()?.players as Record<string, unknown>[]) ?? []);
      })
      .catch((e) => {
        console.error("Failed to load all-time stats:", e);
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => {
    if (!rows) return [];
    if (!sortConfig) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortConfig.key];
      const bv = b[sortConfig.key];
      if (typeof av === "number" && typeof bv === "number") {
        return sortConfig.direction === "ascending" ? av - bv : bv - av;
      }
      return sortConfig.direction === "ascending"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [rows, sortConfig]);

  return (
    <div className="mx-auto mt-2 max-w-7xl px-4 md:px-6" style={{ paddingBottom: 80 }}>
      <div className="flex flex-wrap items-center justify-between gap-3 py-3">
        {/*
          Typography matched to the nav directly above it — same size, weight and
          tracking. SECTION_HEADING (font-black, 0.16em) is for panel headings further
          down the page; used here it ran 6.4x the nav's letter-spacing at nine hundred
          weight, which is why it read as a different system rather than a page title.
          The accent bar carries the emphasis instead.
        */}
        <div>
          <h1 className="relative pl-3 font-azonix text-xs uppercase tracking-wide text-gray-900 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[#1a3c6e] before:content-[''] dark:text-white dark:before:bg-[#00f976] sm:text-sm">
            All-time stats
          </h1>
          {/* "All-time" means all of OUR time, not the league's. The NXL has results
              back to 2015; confirmed kills only exist from 2025, so the scope needs
              stating or the totals read as career records. */}
          <p className="mt-1.5 pl-3 text-[11px] text-gray-500 dark:text-white/40">
            *Pick&rsquo;Em Paintball started tracking confirmed kills in 2025
          </p>
        </div>
        <PlayerSearch className="w-full sm:w-64" />
      </div>

      <section className="rounded-xl bg-neutral-100/90 p-3 dark:bg-stone-900/90 sm:p-5">
        {rows === null ? (
          <div className="flex justify-center py-16">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-gray-300/90 border-t-[#00f976] dark:border-gray-600 dark:border-t-[#00f976]" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-[12px] text-gray-500 dark:text-white/40">
            No all-time data yet.
          </p>
        ) : (
          <MatchupTable
            data={sorted as never}
            sortConfig={sortConfig}
            onSortChange={(c: SortConfig | null) => setSortConfig(c)}
            showMyPicks={false}
          />
        )}
      </section>
    </div>
  );
}
