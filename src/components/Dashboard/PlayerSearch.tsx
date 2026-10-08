"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";
import { cn } from "@/src/lib/utils";

/**
 * Jump to any player by name.
 *
 * Backed by `aggregates/playerIndex` — one ~35 KB document listing all 325 players.
 * Reading the summaries themselves just to get their names would undo the point of
 * the projection, and Firestore cannot do substring search server-side anyway, so the
 * list is fetched once and filtered in memory.
 *
 * Loaded lazily on first focus: most visitors never search, and this should not cost
 * a read on every page view.
 */

interface IndexRow {
  id: string;
  name: string;
  team: string;
  kills: number;
  played: number;
  lastEvent: string | null;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

export default function PlayerSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [players, setPlayers] = useState<IndexRow[] | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = () => {
    if (players !== null) return;
    getDoc(doc(collection(db, "aggregates"), "playerIndex"))
      .then((s) => setPlayers(((s.data()?.players ?? []) as IndexRow[]) ?? []))
      .catch((e) => {
        console.error("Failed to load player index:", e);
        setPlayers([]);
      });
  };

  // Close on an outside click, so the panel does not linger over the page.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const results = useMemo(() => {
    const needle = norm(q);
    if (!needle || !players) return [];
    const scored = players
      .map((p) => {
        const name = norm(p.name);
        // Rank by how early the match lands: a surname start beats a mid-word hit.
        const idx = name.indexOf(needle);
        if (idx === -1) return null;
        const startsWord = idx === 0 || name[idx - 1] === " ";
        return { p, score: (startsWord ? 0 : 100) + idx - Math.min(p.played, 8) };
      })
      .filter(Boolean) as { p: IndexRow; score: number }[];
    return scored.sort((a, b) => a.score - b.score).slice(0, 8).map((x) => x.p);
  }, [q, players]);

  useEffect(() => setActive(0), [q]);

  const go = (id: string) => {
    setOpen(false);
    setQ("");
    router.push(`/dashboard/players/${id}`);
  };

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <input
        type="search"
        value={q}
        placeholder="Search players…"
        onFocus={() => {
          load();
          setOpen(true);
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            go(results[active].id);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-xs outline-none placeholder-gray-400 focus:border-gray-400 dark:border-white/10 dark:bg-white/5 dark:placeholder-white/30 dark:focus:border-white/30"
      />

      {open && q.trim().length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#0d0d0d]">
          {players === null ? (
            <div className="px-3 py-3 text-[11px] text-gray-400 dark:text-white/40">Loading…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-gray-400 dark:text-white/40">
              No player matches “{q.trim()}”
            </div>
          ) : (
            results.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(p.id)}
                className={cn(
                  "flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left",
                  i === active ? "bg-black/[0.04] dark:bg-white/[0.06]" : "",
                )}
              >
                <span className="min-w-0 truncate text-[12px] font-bold text-gray-900 dark:text-white">
                  {p.name}
                </span>
                <span className="shrink-0 text-[10px] text-gray-400 dark:text-white/40">
                  {p.team}
                  {p.played > 0 && (
                    <span className="pickem-numeric ml-2">{p.kills} kills</span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
