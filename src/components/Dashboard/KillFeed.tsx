"use client";

import {
  collection,
  documentId,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";

/** Rows kept in the feed; the table shows ~10 at a time and scrolls through the rest. */
const FEED_SIZE = 30;

type FeedRow = {
  id: string;
  player: string;
  team: string;
  point: number | null;
  type: string;
  weight: number;
  /** Missed / Penalty rows: an elimination with no player credited. */
  isSentinel: boolean;
};

/**
 * The most recent long-data rows for the event, newest first, live.
 *
 * Newest is by document id: row ids are `{eventId}_{6-digit seq}`, minted under a lock
 * in submission order (01_LongDataRowIds.gs), so they sort chronologically. The rows
 * carry no reliable timestamp — `date` drifts mid-game.
 */
export default function KillFeed({
  eventId,
  headingClassName,
}: {
  eventId: string;
  headingClassName: string;
}) {
  const [rows, setRows] = useState<FeedRow[]>([]);

  useEffect(() => {
    const q = query(
      collection(getFirestore(), "long_data"),
      where("eventId", "==", eventId),
      orderBy(documentId(), "desc"),
      limit(FEED_SIZE),
    );
    return onSnapshot(
      q,
      (snap) => {
        const next: FeedRow[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          const weight = Number(data.weight) || 0;
          // Weight 0 is a voided row — it never happened.
          if (weight === 0) return;
          const player = String(data.player ?? "").trim();
          next.push({
            id: d.id,
            player: player || "—",
            team: String(data.team ?? "—"),
            point: Number.isFinite(Number(data.point)) ? Number(data.point) : null,
            type: String(data.type ?? "").trim(),
            weight,
            isSentinel: data.credit === "missed" || data.credit === "penalty",
          });
        });
        setRows(next);
      },
      (e) => {
        console.error(e);
        setRows([]);
      },
    );
  }, [eventId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className={headingClassName}>Kill feed</h3>
        <span className="inline-flex shrink-0 items-center gap-1.5 font-azonix text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          Live
        </span>
      </div>
      {/* 10 rows visible (h-8 header + 10 × h-9 rows); scrolls through the rest. */}
      <div
        className="max-h-[392px] overflow-auto rounded-lg border border-gray-200 dark:border-white/10"
        style={{ scrollbarGutter: "stable" }}
      >
        <table className="w-full text-left text-xs sm:text-sm font-azonix">
          <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-[#1a1a1a] text-[10px] uppercase tracking-widest text-gray-600 dark:text-gray-400">
            <tr className="h-8">
              <th className="px-2 sm:px-3">Player</th>
              <th className="px-2 sm:px-3">Team</th>
              <th className="px-2 sm:px-3 text-right">Pt</th>
              <th className="px-2 sm:px-3">Type</th>
              <th className="px-2 sm:px-3 text-right">Kills</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10 text-gray-900 dark:text-white">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400 text-xs">
                  Waiting for the first kills to come in.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="h-9 whitespace-nowrap">
                  <td
                    className={`max-w-[110px] truncate px-2 sm:max-w-[160px] sm:px-3 font-bold ${row.isSentinel ? "italic text-gray-500 dark:text-gray-400" : ""}`}
                  >
                    {row.player}
                  </td>
                  <td className="max-w-[80px] truncate px-2 sm:max-w-[120px] sm:px-3 text-gray-600 dark:text-gray-300">{row.team}</td>
                  <td className="pickem-numeric px-2 sm:px-3 text-right text-gray-600 dark:text-gray-300">
                    {row.point ?? "—"}
                  </td>
                  <td className="max-w-[90px] truncate px-2 sm:max-w-none sm:px-3 text-gray-600 dark:text-gray-300">{row.type || "—"}</td>
                  <td className="pickem-numeric px-2 sm:px-3 text-right font-black">
                    {row.weight}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
