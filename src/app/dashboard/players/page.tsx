"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";
import { cn } from "@/src/lib/utils";
import PlayerCard, { type CardPlayer } from "@/src/components/Dashboard/PlayerCard";
import { individualEventDisplayName } from "@/src/lib/eventDisplayName";

/**
 * Career stats — finding a player, not ranking them.
 *
 * Deliberately NOT a table: the all-time page already ranks everyone, and a second
 * table would be the same page twice. Search leads because most arrivals want one
 * specific person; below it is a rotating set of the most-picked players as cards, so
 * the page opens with faces rather than a wall of names.
 *
 * CARDS REQUIRE A PHOTO. That is a brand rule, not a fallback — a card is a face, and a
 * grid of grey silhouettes is worse than a shorter grid. Players without a picture are
 * still reachable through search here and through every table on the site, so nothing
 * is hidden; `build-player-summaries.mjs` enforces it, rejecting placeholder URLs and
 * fetching the rest so dead links never reach a card.
 *
 * Two reads: `aggregates/spotlight` for the cards, `aggregates/playerIndex` for search
 * across all 325 — the second only when someone actually types.
 */

interface Spotlight {
  eventId: string | null;
  eventName: string | null;
  eventYear: string | null;
  allTimeLeaders: CardPlayer[];
  eventLeaders: CardPlayer[];
  players: CardPlayer[];
}

const EMPTY_SPOTLIGHT: Spotlight = {
  eventId: null,
  eventName: null,
  eventYear: null,
  allTimeLeaders: [],
  eventLeaders: [],
  players: [],
};

interface IndexRow {
  id: string;
  name: string;
  team: string;
  kills: number;
  played: number;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

const SECTION =
  "font-azonix text-xs uppercase tracking-wide text-gray-900 dark:text-white sm:text-sm";

/**
 * Six across at the widest, three on a phone. The source portraits are 200px square, so
 * every column removed from the grid is resolution the browser has to invent. At six-up
 * a card is ~195px — under the source, so the image is downscaled rather than blown up.
 */
const GRID = "grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5 xl:grid-cols-6";

/**
 * How many columns the grid is actually showing.
 *
 * Every section is capped to whole rows — two on a phone, one everywhere else — so the
 * page reads as three tidy strips rather than a wall. Mirrors the Tailwind breakpoints
 * in `GRID`.
 */
function useColumns() {
  const [cols, setCols] = useState(6);
  useEffect(() => {
    const read = () => {
      const w = window.innerWidth;
      setCols(w >= 1280 ? 6 : w >= 1024 ? 5 : w >= 640 ? 4 : 3);
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return cols;
}

export default function CareerStatsPage() {
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const [index, setIndex] = useState<IndexRow[] | null>(null);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const cols = useColumns();
  /** Two rows on a phone, one on tablet and desktop. */
  const perSection = cols * (cols === 3 ? 2 : 1);

  /**
   * Cursor in the search box on arrival — but only where there is a real pointer.
   * Autofocusing on a phone throws up the keyboard and buries the grid under it, so the
   * one gesture that makes search feel primary on desktop makes the page feel broken on
   * mobile. `(hover: hover) and (pointer: fine)` is the honest test for that, rather
   * than a width breakpoint, which a tablet would fail in the wrong direction.
   */
  useEffect(() => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      searchRef.current?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && el === searchRef.current) searchRef.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, "aggregates", "spotlight"))
      .then((snap) => {
        if (cancelled) return;
        const d = snap.data() ?? {};
        setSpotlight({
          eventId: d.eventId ?? null,
          eventName: d.eventName ?? null,
          eventYear: d.eventYear ?? null,
          allTimeLeaders: (d.allTimeLeaders ?? []) as CardPlayer[],
          eventLeaders: (d.eventLeaders ?? []) as CardPlayer[],
          players: (d.players ?? []) as CardPlayer[],
        });
      })
      .catch((e) => {
        console.error("Failed to load spotlight:", e);
        if (!cancelled) setSpotlight(EMPTY_SPOTLIGHT);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The full roster is only needed to search, so it is not paid for until someone does.
  const loadIndex = () => {
    if (index !== null) return;
    getDoc(doc(db, "aggregates", "playerIndex"))
      .then((s) => setIndex(((s.data()?.players ?? []) as IndexRow[]) ?? []))
      .catch((e) => {
        console.error("Failed to load player index:", e);
        setIndex([]);
      });
  };

  const results = useMemo(() => {
    const needle = norm(q);
    if (!needle || !index) return [];
    return index
      .filter((p) => norm(p.name).includes(needle))
      .sort(
        (a, b) =>
          norm(a.name).indexOf(needle) - norm(b.name).indexOf(needle) || b.kills - a.kills,
      )
      .slice(0, 24);
  }, [q, index]);



  const searching = q.trim().length > 0;

  /* Built from the stored id/name/year rather than a stored label, so
     `individualEventDisplayName` stays the single source of event naming. */
  const eventLabel =
    spotlight?.eventId
      ? individualEventDisplayName({
          id: spotlight.eventId,
          name: spotlight.eventName ?? undefined,
          year: spotlight.eventYear ?? undefined,
        })
      : "";

  return (
    <div className="mx-auto mt-2 max-w-7xl px-4 md:px-6" style={{ paddingBottom: 80 }}>
      <div className="py-3">
        <h1 className="relative pl-3 font-azonix text-xs uppercase tracking-wide text-gray-900 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[#00f976] before:content-[''] dark:text-white sm:text-sm">
          Career stats
        </h1>
      </div>

      {/*
        Search is the page's primary action, so it is built like one rather than like a
        filter above a grid. Four things do that work, and none of them is explanatory
        copy: the magnifier, which is what actually says "search" (a bare pill reads as
        an input of unknown purpose); the height and type size; the air around it, which
        is what separates a hero control from a toolbar; and the cursor already being in
        it on desktop.
      */}
      <div className="mx-auto max-w-2xl py-6 sm:py-10">
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            className="pointer-events-none absolute left-5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-400 dark:text-white/40"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={q}
            onFocus={loadIndex}
            onChange={(e) => {
              loadIndex();
              setQ(e.target.value);
            }}
            placeholder="Search all 325 players…"
            aria-label="Search players"
            className="w-full rounded-full border border-gray-200 bg-gray-50 py-4 pl-14 pr-5 text-base sm:pr-14 outline-none placeholder-gray-400 focus-visible:border-[#1a3c6e] dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/30 dark:focus-visible:border-[#00f976]"
          />
          {/* Advertises the shortcut and, in doing so, advertises that search is here.
              Hidden on touch, where there is no key to press. */}
          <kbd className="pointer-events-none absolute right-5 top-1/2 hidden -translate-y-1/2 rounded border border-gray-200 px-1.5 py-0.5 font-azonix text-[10px] text-gray-400 sm:block dark:border-white/15 dark:text-white/30">
            /
          </kbd>
        </div>
      </div>

      {searching ? (
        <section className="mt-5">
          <h2 className={SECTION}>
            {index === null
              ? "Searching…"
              : `${results.length} result${results.length === 1 ? "" : "s"}`}
          </h2>
          {/* A list, not cards: search is for landing on a name, and plenty of players
              have no photo to put on one. */}
          <div className="mt-3 divide-y divide-gray-200/60 overflow-hidden rounded-xl bg-neutral-100/90 dark:divide-white/5 dark:bg-stone-900/90">
            {results.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/players/${p.id}`}
                className="flex items-baseline justify-between gap-3 px-4 py-2.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
              >
                <span className="truncate text-[13px] font-bold text-gray-900 dark:text-white">
                  {p.name}
                </span>
                <span className="shrink-0 text-[11px] text-gray-500 dark:text-white/40">
                  {p.team}
                  {p.played > 0 && <span className="pickem-numeric ml-3">{p.kills} kills</span>}
                </span>
              </Link>
            ))}
            {index !== null && results.length === 0 && (
              <p className="px-4 py-8 text-center text-[12px] text-gray-500 dark:text-white/40">
                No player matches &ldquo;{q.trim()}&rdquo;
              </p>
            )}
          </div>
        </section>
      ) : spotlight === null ? (
        <div className="flex justify-center py-16">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-gray-300/90 border-t-[#00f976] dark:border-gray-600 dark:border-t-[#00f976]" />
        </div>
      ) : (
        <>
          {/* Career kills, highest first. The card's own Rank stat reads 1st, 2nd, 3rd,
              so the row explains its own order — and a player skipped for want of a
              photo leaves a visible gap rather than a silent one. */}
          {spotlight.allTimeLeaders.length > 0 && (
            <section>
              <h2 className={SECTION}>All-time leaders</h2>
              <div className={cn(GRID, "mt-3")}>
                {spotlight.allTimeLeaders.slice(0, perSection).map((p) => (
                  <PlayerCard key={p.id} p={p} />
                ))}
              </div>
            </section>
          )}

          {/* Scoped to the event throughout — its rank, its kills, kills per match. */}
          {spotlight.eventLeaders.length > 0 && (
            <section className="mt-8">
              <h2 className={SECTION}>{eventLabel} leaders</h2>
              <div className={cn(GRID, "mt-3")}>
                {spotlight.eventLeaders.slice(0, perSection).map((p) => (
                  <PlayerCard key={p.id} p={p} />
                ))}
              </div>
            </section>
          )}

          {/* Who people backed at the same event the row above scores. Same shape as
              its neighbours: the top six, and no further. Search reaches the rest. */}
          {spotlight.players.length > 0 && (
            <section className="mt-8">
              <h2 className={SECTION}>{eventLabel} Pick&rsquo;Em leaders</h2>
              <div className={cn(GRID, "mt-3")}>
                {spotlight.players.slice(0, perSection).map((p) => (
                  <PlayerCard key={p.id} p={p} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
