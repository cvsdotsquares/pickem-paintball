"use client";

import { useEffect, useState } from "react";
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
  /**
   * Opens on tournament wins, highest first.
   *
   * The stored rows arrive ordered by career kills, which is the wrong headline for a
   * table whose first column is now Event Wins — the top row would have been whoever
   * has scored most since 2025 rather than whoever has won most since 2015.
   *
   * Ties keep the kills order underneath, for free: the table's sort is stable and the
   * stored document is already in that order, so two players level on wins fall out by
   * kills rather than arbitrarily.
   */
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({
    key: "Event Wins",
    direction: "descending",
  });

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

  /**
   * No sorting here on purpose.
   *
   * `MatchupTable` re-sorts whatever array it is handed, using its own `compareCells`,
   * so a second sort on this side is at best duplicated work and at worst a lie: the
   * dash-handling and won-lost-record rules written here were simply discarded, and it
   * took a bug report about the Record column to notice. One sort, in the component
   * that renders.
   */

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
          {/*
            TWO SCOPES IN ONE TABLE, and the header row has nowhere to say so.
            Event Wins through Match Win % is the league since 2015; the kill columns are
            the eight events PickEm scores. Without these two lines a reader takes "16
            wins" and "144 kills" to be measured over the same span, which describes a
            player who does not exist.

            One line each, because they are two separate facts about two separate sets of
            columns — run together as a paragraph, neither attached to anything.
          */}
          <div className="mt-1.5 pl-3 text-[11px] leading-relaxed text-gray-500 dark:text-white/40">
            <p>League results tracked from NXL inception in 2015</p>
            <p>Pick&rsquo;Em started tracking confirmed kills in 2025</p>
          </div>
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
            data={rows as never}
            sortConfig={sortConfig}
            onSortChange={(c: SortConfig | null) => setSortConfig(c)}
            showMyPicks={false}
            /* No rank column: the rows are ordered by tournament wins, and a "#" beside
               them would be read as a position on THAT order. It is not — it is the
               player's rank by career kills, which is a different measure and now sits
               several columns to the right. */
            showRank={false}
          />
        )}
      </section>
    </div>
  );
}
