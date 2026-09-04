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

  /**
   * An em-dash means "we cannot look this up", and it sorts LAST in both directions.
   *
   * 93 of the 325 players have no NXL id, so their league columns are dashes. Left to
   * the string comparison below they would land at one end of an ascending sort and the
   * other end of a descending one — which reads as a ranking, putting a hundred players
   * "top of the table" for tournament wins. Absent data is not a low score or a high
   * one; it belongs at the bottom whichever way the column is pointing.
   */
  const NO_DATA = "\u2014";

  const sorted = useMemo(() => {
    if (!rows) return [];
    if (!sortConfig) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortConfig.key];
      const bv = b[sortConfig.key];
      const aMissing = av === NO_DATA || av == null;
      const bMissing = bv === NO_DATA || bv == null;
      if (aMissing || bMissing) return aMissing && bMissing ? 0 : aMissing ? 1 : -1;
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
          {/*
            TWO SCOPES IN ONE TABLE, and the header row has nowhere to say so.
            Everything from NXL Events to Match Win % is the league since 2015; the kill
            columns are the eight events PickEm scores. Without this line a reader takes
            "16 wins" and "144 kills" to be measured over the same span, which gives an
            impossible player.
          */}
          <p className="mt-1.5 max-w-[70ch] pl-3 text-[11px] leading-relaxed text-gray-500 dark:text-white/40">
            League results are tracked from 2015 and are the record of the{" "}
            <b className="font-bold text-gray-600 dark:text-white/60">teams</b> a player
            turned out for. Pick&rsquo;Em started tracking confirmed kills in 2025 &mdash;
            those columns cover far fewer events. A dash means we hold no NXL id for that
            player.
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
