"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * A player as a card, not a table row.
 *
 * The career-stats page exists so someone can find a PERSON; the all-time table already
 * does ranking. Nothing here ranks or compares — the job is recognising a face and
 * landing on the right page.
 *
 * A card is only ever rendered for a player with a REAL, REACHABLE photo. That rule is
 * enforced upstream in `build-player-summaries.mjs`, which both rejects placeholder URLs
 * and fetches every candidate to drop the dead ones — 12 of 183 were 404s. `onError`
 * below is the last line of defence for a photo that dies between builds.
 */

/**
 * `rank` / `kills` / `avg` carry no scope on purpose — the row decides what they mean.
 * Career figures under "All-time leaders" and "Most picked"; that event's figures under
 * the event row, where kills-per-match stands in for the average. The card renders the
 * same three labels either way, so the heading above it is what sets the frame.
 */
/**
 * One of the three figures on a card. Value and suffix arrive pre-formatted from
 * `build-player-summaries.mjs`, because the builder is the only place that knows which
 * scope a number came from — so a per-match average can never be labelled as a per-event
 * one, whichever row the card lands in.
 */
export interface CardStat {
  value: string;
  suffix?: string | null;
  label: string;
  /**
   * Second line of the label, always rendered as its own line.
   *
   * "Kills/Event" is too wide for a stat column below six-up, and left to wrap it broke
   * as KILLS/ + EVENT with an orphaned slash — and only at some widths, so the label
   * changed shape as the grid did. Splitting it explicitly means it reads the same
   * everywhere. The slash leads the second line because it is doing the work of "per".
   */
  sublabel?: string | null;
}

export interface CardPlayer {
  id: string;
  name: string;
  number: string | number | null;
  team: string;
  imgUrl: string | null;
  /** What the three figures below are — "Career stats", "Event stats", "Pick'Em stats". */
  statsLabel: string;
  stats: CardStat[];
}

/**
 * The career hero's stat treatment at card scale.
 *
 * Type steps down at the narrowest widths because a three-up grid on a 375px phone
 * leaves ~36px per stat. The label block is a fixed two lines everywhere so that
 * "Kills/Event" wrapping does not make one section's cards taller than another's.
 *
 * The hero sets its secondary greys at white/40. Here they are white/50, because the
 * same 8px label that whispers under a 48px number in a full-width panel is one of only
 * three anchors on a small card — and white/40 on #101010 measures 3.8:1, under the
 * 4.5:1 AA floor. white/50 measures 5.3:1 and still reads as clearly subordinate.
 */
function Stat({ value, suffix, label, sublabel }: CardStat) {
  return (
    <div className="border-r border-black/[0.07] px-0 pb-2 pt-1.5 text-center last:border-r-0 sm:px-1.5 sm:pb-2.5 sm:pt-2 dark:border-white/[0.08]">
      <div className="pickem-numeric text-[12px] font-black leading-none text-gray-900 sm:text-[15px] lg:text-[17px] dark:text-white">
        {value}
        {suffix && (
          <span className="ml-0.5 text-[9px] font-bold text-gray-500 sm:text-[10px] dark:text-white/50">
            {suffix}
          </span>
        )}
      </div>
      {/* Two lines are always reserved, so a one-line label and a two-line one leave the
          card exactly the same height and the first lines sit on a common baseline. */}
      <div className="mt-1 h-[2.1em] text-center font-azonix text-[7px] font-black uppercase leading-[1.05] tracking-wider text-gray-500 sm:mt-1.5 sm:text-[8px] sm:tracking-widest dark:text-white/50">
        {label}
        {sublabel && (
          <>
            <br />
            {sublabel}
          </>
        )}
      </div>
    </div>
  );
}

export default function PlayerCard({ p }: { p: CardPlayer }) {
  const [broken, setBroken] = useState(false);

  return (
    <Link
      href={`/dashboard/players/${p.id}`}
      className="group block overflow-hidden rounded-xl bg-white ring-1 ring-black/[0.08] transition-shadow duration-200 hover:ring-2 hover:ring-[#1a3c6e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3c6e] dark:bg-[#101010] dark:ring-white/[0.12] dark:hover:ring-[#00f976] dark:focus-visible:ring-[#00f976]"
    >
      {/*
        SQUARE, because the source portraits are square (200x200, a handful 300x300).
        Any other ratio has to scale the image up to cover the box before it even reaches
        the card's width — a 4:5 box needed 1.25x more than the card is wide, and on a
        3x phone that upscale is what reads as "stretched". Square asks for the least.

        The well stays #101010 in BOTH themes. These are cutouts with transparent
        backgrounds, so the panel behind them is the stage they were shot for: on a white
        card a player in a pale jersey would dissolve into it. Keeping the stage constant
        also means a photo looks identical whichever theme you are in, which is the point
        of a recognition surface.
      */}
      <div className="relative aspect-square w-full overflow-hidden bg-[#101010]">
        {p.imgUrl && !broken && (
          <img
            src={p.imgUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover object-center transition-transform duration-300 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        )}

        {/* Lands on the well's own colour, so the photo dissolves into the card edge
            rather than stopping at a line, and the name always sits on near-opaque ink
            whatever happens to be behind it. */}
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-[#101010] via-[#101010]/90 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-1.5 sm:p-3">
          {/*
            The jersey number is dropped at three-up, where a card is 109px and a
            two-line name already puts the overlay across 70% of the portrait. Name
            identifies and team contextualises; the number is the one of the three that
            can go without costing recognition, and dropping it lifts the name clear of
            the chin.
          */}
          {p.number != null && p.number !== "" && (
            <div className="pickem-numeric hidden text-[9px] font-bold tracking-[0.18em] text-white/50 sm:block sm:text-[10px]">
              #{p.number}
            </div>
          )}
          {/* Clamped rather than truncated: the surname is the half that identifies. */}
          <h3 className="mt-0.5 line-clamp-2 font-azonix text-[11px] font-black uppercase leading-[1.12] tracking-[0.02em] text-white sm:text-[13px]">
            {p.name}
          </h3>
          <div className="mt-0.5 flex items-center gap-1.5 sm:mt-1">
            {/* Green in both themes, like the page heading's bar. It sits on the photo
                well, which never changes colour, so switching it with the theme was
                arbitrary — and in light mode it left a green bar at the top of the page
                above twenty-four white ones. */}
            <span className="inline-block h-[1em] w-[3px] shrink-0 rounded-[1px] bg-[#00f976]" />
            <span className="truncate text-[10px] leading-none text-white/50 sm:text-[11px]">
              {p.team}
            </span>
          </div>
        </div>
      </div>

      {/*
        The stat bar is the card's chrome, so it follows the theme even though the photo
        well does not. It is what stops a page of cards reading as twenty black blocks on
        a white background in light mode.
      */}
      <div className="border-t border-black/[0.07] bg-neutral-50 dark:border-white/[0.08] dark:bg-white/[0.03]">
        {/*
          Which set of numbers these are, on the card rather than only above the row.

          Same muted tier as the stat labels rather than a step fainter: white/35 on the
          tinted bar measures 3.2:1 and gray-400 on it 2.5:1, both under the 4.5:1 AA
          floor. The hairline and the full-width position are what make it read as a
          header for the group; it does not need to be faint as well.

          A card is the unit that travels — it gets screenshotted, shared, and read out
          of the order it was rendered in — so the frame has to travel with it. Repeated
          across a row it lands on one horizontal band and reads as a single label rather
          than six, which is what keeps it from becoming noise.
        */}
        <div className="border-b border-black/[0.07] px-1 pb-1 pt-1.5 text-center font-azonix text-[7px] font-black uppercase tracking-widest text-gray-500 sm:text-[8px] dark:border-white/[0.08] dark:text-white/50">
          {p.statsLabel}
        </div>
        <div className="grid grid-cols-3">
          {p.stats.map((st) => (
            <Stat key={st.label + (st.sublabel ?? "")} {...st} />
          ))}
        </div>
      </div>
    </Link>
  );
}
