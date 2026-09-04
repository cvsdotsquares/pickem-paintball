"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchPlayerSummary } from "@/src/lib/playerSummary";
import {
  isAbsent,
  KILL_TYPES,
  type PlayerCareer,
  type CareerAppearance,
  type KillType,
  type NxlCareer,
  type NxlEvent,
  type TeamEventRecord,
} from "@/src/lib/playerCareer";
import { displayRound, type PlayerMatch } from "@/src/lib/playerMatches";
import { individualEventDisplayName } from "@/src/lib/eventDisplayName";
import { useTheme } from "@/src/contexts/ThemeContext";
import PlayerSearch from "@/src/components/Dashboard/PlayerSearch";
import { cn } from "@/src/lib/utils";

/** Shared column template — header and rows must use the same constant (style guide). */
/**
 * Event · Team · Rank · Kills · % of team · one column per kill type · Cost · Per kill · Pick %
 *
 * Two templates, not one: on a phone the labels shorten to their axis form ("MW 26",
 * "DYN") so the columns can too. Grid templates live in classes rather than an inline
 * style precisely so the breakpoint can swap them — header and rows share the constant,
 * as the style guide requires.
 */
const HISTORY_COLS =
  "grid-cols-[74px_46px_52px_minmax(0,1fr)_32px_40px_50px_repeat(7,42px)_64px_48px_42px] " +
  "sm:grid-cols-[110px_88px_62px_minmax(0,1fr)_42px_50px_72px_repeat(7,56px)_76px_56px_52px]";

/**
 * Event · Opponent · Round · Kills · % of team · one column per kill type.
 * Event leads so a row is self-describing, matching the events table beside it;
 * opponent comes next because who they played reads before which day it was.
 * Narrow template on mobile — see HISTORY_COLS.
 */
const MATCH_COLS =
  "grid-cols-[74px_46px_66px_62px_minmax(0,1fr)_40px_50px_repeat(7,42px)] " +
  "sm:grid-cols-[110px_110px_88px_72px_minmax(0,1fr)_50px_72px_repeat(7,56px)]";

/**
 * Did the player miss this event?
 *
 * Reads the resolved `participation` verdict rather than the roster `Status` field.
 * Status only exists from 2026 and is a pre-event availability note nobody restamps;
 * `participation` is decided against the official NXL team sheet and the player's own
 * kills, so it covers every event and cannot mark a scorer absent. See
 * `scripts/participation-plan.mjs` for the rules.
 *
 * Nothing measured at an event a player sat out belongs in their performance history —
 * not kills, not cost per kill, and not pick %. Entrants did pick them (picks close
 * before the roster is final), but that number describes an event they never played, so
 * averaging it in would move a career trend on the strength of a game that never happened.
 */
const missedEvent = (a: CareerAppearance) => a.kind !== "played";

/**
 * Why the player was not there, in one word.
 *
 * "DNP" and "not rostered" are different facts and PickEm is exactly where the
 * difference bites: one was a player you could have picked who returned nothing, the
 * other was never available to pick. They render the same on the chart — two grey
 * markers a shade apart would be noise — and separate on hover, where it earns space.
 */
const absenceWord = (a: CareerAppearance) =>
  a.kind === "not-rostered" ? "Not rostered" : (a.status ?? "DNP");

/**
 * Column heads for the kill types, using the site's own wording from the stats table
 * (`getStatHeaderLayout` in datatable.tsx) rather than invented abbreviations — two
 * lines where the label needs them. "Unclassified" is the one word too long for a
 * column this narrow, so it is the only shortened head; the full name is on `title`.
 */
/**
 * "% of Team" carries the "of": without it the head reads as the name of a stat
 * ("percent team kills") rather than as this player's share of what the team scored.
 */
const SHARE_HEAD = ["% of Team\u2019s", "Kills"];

/**
 * Display-only short codes, for the two ids a reader cannot resolve.
 *
 * Aftershock and Aftermath both begin "After-", so the stored `AFT` names either one,
 * and Aftermath's `SDA` is the city rather than the club. The two therefore SWAP:
 * Aftermath takes `AFT`, the letters a reader gives it unprompted, and Aftershock
 * becomes `SHK`.
 *
 * ⚠️ The displayed `AFT` is NOT the stored `AFT`. They belong to different teams, so
 * this map must never be inverted, reused as a lookup, or written back.
 *
 * DISPLAY ONLY. `team_id` is baked into long-data game ids
 * (`mid_west_open_2026_Friday_HUR-RCS`), which sort on it precisely because it is more
 * stable than the display name, and `syncRoster()` owns the stored value. Renaming the
 * id would orphan every game already recorded against it.
 */
const TEAM_CODE_OVERRIDES: Record<string, string> = {
  AFT: "SHK", // stored AFT = Aftershock
  SDA: "AFT", // stored SDA = Aftermath
};

/** Three-letter code for a team, falling back to the full name when there is no id. */
const teamCode = (id: string | null | undefined, fallback: string) =>
  id ? (TEAM_CODE_OVERRIDES[id] ?? id) : fallback;

const TYPE_HEAD: Record<string, string[]> = {
  Gunfights: ["Gun", "Fights"],
  Breakshooting: ["Break", "Shots"],
  Movement: ["Moves"],
  "Zone Coverage": ["Zone", "Coverage"],
  Pressure: ["Pressure"],
  Trades: ["Trades"],
  Unclassified: ["Unclass."],
};

/** Site section heading: azonix, uppercase, 3px brand-green bar. Mirrors dashboard/page.tsx. */
const SECTION_HEADING =
  "relative pl-3 font-azonix text-xs font-black uppercase leading-snug tracking-[0.14em] " +
  "text-gray-900 dark:text-white before:absolute before:left-0 before:top-0 before:bottom-0 " +
  "before:w-[3px] before:bg-[#1a3c6e] before:content-[''] dark:before:bg-[#00f976] sm:text-sm sm:tracking-[0.16em]";

/** Borderless panel, matching the stats page. */
const PANEL = "rounded-xl bg-neutral-100/90 dark:bg-stone-900/90";

const LABEL = "text-[8px] uppercase tracking-widest font-black text-gray-400 dark:text-white/40";
/** Chart ink: brand navy on light, a lighter ramp step on dark so a 2px line still reads. */
const LINE_INK = "text-[#1a3c6e] dark:text-[#00f976]";
/** Second series on the PickEm chart. Distinct hue from the navy, legible on both surfaces. */
const LINE_INK_ALT = "text-[#0f9d58] dark:text-white";

/**
 * High-contrast alternative to the navy ramps, for readers who cannot separate adjacent
 * steps of a single hue.
 *
 * A warm/cool set rather than a grab-bag: ocean, coral, teal, sand, violet, cyan.
 * Validated with the dataviz palette checker (`--pairs all`, both themes): ΔE 16.0
 * normal vision, 8.8 colourblind, all six above the chroma floor.
 *
 * Muted palettes were tried first and all failed — low chroma is precisely what makes
 * colours hard to separate, so "accessible" and "understated" pull against each other.
 * Lightness varies as well as hue, which is what makes six categories work at all.
 * Fixed per type, so a colour means the same thing in every chart.
 */
/**
 * Dark-mode high-contrast set. Own steps again, not a flip: the light set sits at
 * L 0.68–0.83 on a dark panel, well outside the categorical band, so it read as six
 * pastels. Re-stepped into L 0.48–0.67, where all six checks pass — CVD ΔE 9.3
 * worst-adjacent, normal-vision 16.2, every step clear of 3:1 on the surface.
 */
const ACCESSIBLE_TYPE_COLOURS_DARK: Record<string, string> = {
  Gunfights: "#3888c0",
  Breakshooting: "#d55c43",
  Movement: "#1a9a7c",
  "Zone Coverage": "#b08c2c",
  Pressure: "#8459cc",
  Trades: "#2c9ab0",
  Unclassified: "#6b7280",
};

const ACCESSIBLE_TYPE_COLOURS: Record<string, string> = {
  Gunfights: "#1d6a96",
  Breakshooting: "#e76f51",
  Movement: "#2a9d8f",
  "Zone Coverage": "#e9c46a",
  Pressure: "#8338ec",
  Trades: "#48cae4",
  Unclassified: "#9ca3af",
};

/** Shared control so both charts offer the same switch in the same words. */
function AccessibleColourToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mt-2.5 flex cursor-pointer items-center gap-2 select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer accent-[#1a3c6e] dark:accent-[#00f976]"
      />
      <span className={cn(LABEL, "hover:text-gray-600 dark:hover:text-white/60")}>
        High-contrast colours
      </span>
    </label>
  );
}

type StyleScope = "career" | "season" | "last";

/**
 * The right palette for the theme and the toggle.
 *
 * Every chart on the page goes through this, so a kill type is the same colour in
 * the donut, the stacked chart and the legend — which is what lets two players'
 * charts be compared at all.
 */
function typePalette(dark: boolean, accessible: boolean): Record<string, string> {
  if (accessible) return dark ? ACCESSIBLE_TYPE_COLOURS_DARK : ACCESSIBLE_TYPE_COLOURS;
  return dark ? STACK_COLOURS_DARK : STACK_COLOURS;
}

/** Kill-type totals and shares over an arbitrary subset of appearances. */
function typeTotalsFor(appearances: CareerAppearance[]) {
  const totals = KILL_TYPES.map((type: KillType) => ({
    type: type as string,
    total: appearances.reduce((a, x) => a + (x.types[type] ?? 0), 0),
  }));
  const grand = totals.reduce((a, t) => a + t.total, 0);
  return totals
    .map((t) => ({ ...t, share: grand > 0 ? (t.total / grand) * 100 : 0 }))
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total);
}

const fmtCost = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const fmtK = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function PlayerPage() {
  const params = useParams();
  const playerId = String(params?.playerId ?? "");
  const [career, setCareer] = useState<PlayerCareer | null>(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [styleScope, setStyleScope] = useState<StyleScope>("career");
  const [ownership, setOwnership] = useState<Map<string, number> | null>(null);
  const [killsMode, setKillsMode] = useState<"total" | "breakdown">("total");
  // Deliberately separate per panel — ticking one should not silently change the other.
  const [styleAccessible, setStyleAccessible] = useState(false);
  const [killsAccessible, setKillsAccessible] = useState(false);
  const { theme } = useTheme();
  const dark = theme === "dark";
  const [historyTab, setHistoryTab] = useState<"events" | "matches">("events");
  const [matchEventId, setMatchEventId] = useState<string | null>(null);
  const [allMatches, setAllMatches] = useState<(PlayerMatch & { eventId: string })[]>([]);

  /**
   * One read for the whole page.
   *
   * Career, pick % and match detail all come from `playerSummaries/{playerId}`, a
   * projection rebuilt from source. This replaced three queries costing ~6,200 document
   * reads between them, which grew with every event added.
   */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPlayerSummary(playerId)
      .then((s) => {
        if (cancelled) return;
        setCareer(s?.career ?? null);
        setOwnership(s?.ownership ?? null);
        setAllMatches(s?.matches ?? []);
      })
      .catch((e) => console.error("Failed to load player summary:", e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const labelled = useMemo(
    () =>
      (career?.appearances ?? []).map((a) => ({
        ...a,
        label: individualEventDisplayName({ id: a.eventId, name: a.eventName, year: a.year }),
      })),
    [career],
  );

  if (loading) {
    return (
      <div className="mx-auto mt-2 flex max-w-7xl justify-center px-4 py-24 md:px-6">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-gray-300/90 border-t-[#00f976] dark:border-gray-600 dark:border-t-[#00f976]" />
      </div>
    );
  }

  if (!career) {
    return (
      <div className="mx-auto mt-2 max-w-7xl px-4 py-24 text-center md:px-6">
        <p className="text-sm font-bold text-gray-900 dark:text-white">Player not found</p>
        <p className="mt-1 text-xs text-gray-400 dark:text-white/40">
          No record for id {playerId} in any event.
        </p>
        <Link
          href="/dashboard/stats"
          className="mt-5 inline-flex items-center rounded-full border border-[#00f976] bg-[#00f976]/10 px-4 py-2 font-azonix text-[10px] font-bold uppercase tracking-wide text-neutral-800 dark:text-[#00f976]"
        >
          Back to stats →
        </Link>
      </div>
    );
  }

  /**
   * Events the player actually took the field for.
   *
   * `labelled` still drives every x-axis, so a career is never silently shortened —
   * but nothing that averages, counts or plots a value may use it, or an event they
   * missed would be scored as a zero. This is the same rule the event history table
   * and the PickEm chart follow.
   */
  const played = labelled.filter((a) => !missedEvent(a));

  // Scope options are derived from what the player actually has — a player with one
  // event gets no season/last-event choice, because all three would be identical.
  const latestYear = labelled.at(-1)?.year ?? "";
  const seasonAppearances = labelled.filter((a) => a.year === latestYear);
  const seasonPlayed = played.filter((a) => a.year === latestYear);
  const lastPlayed = played.at(-1);
  const scopeOptions: { value: StyleScope; label: string }[] = [
    { value: "career", label: `Career · ${played.length} events` },
    ...(seasonPlayed.length > 1 && seasonPlayed.length < played.length
      ? [{ value: "season" as StyleScope, label: `${latestYear} season · ${seasonPlayed.length} events` }]
      : []),
    ...(played.length > 1 && lastPlayed
      ? [{ value: "last" as StyleScope, label: `Last event · ${lastPlayed.label}` }]
      : []),
  ];
  const scope = scopeOptions.some((o) => o.value === styleScope) ? styleScope : "career";
  const scoped =
    scope === "last"
      ? played.slice(-1)
      : scope === "season"
        ? seasonPlayed
        : played;
  const scopedTypeTotals = typeTotalsFor(scoped);

  const maxKills = Math.max(...labelled.map((a) => a.kills), 1);
  const killSeasons = Array.from(new Set(labelled.map((a) => a.year))).sort();
  const latestSeason = killSeasons[killSeasons.length - 1] ?? null;
  const prevSeason = killSeasons.length > 1 ? killSeasons[killSeasons.length - 2] : null;
  const seasonMean = (yr: string | null) => {
    const xs = played.filter((a) => a.year === yr).map((a) => a.kills);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const killsNow = seasonMean(latestSeason);
  const killsPrev = seasonMean(prevSeason);
  const avgKills = played.length
    ? played.reduce((s, a) => s + a.kills, 0) / played.length
    : 0;

  /**
   * Event history rows: the WHOLE league career, newest first.
   *
   * Every event the player's team played, whether or not PickEm scored it — so a
   * twelve-year career is fifty rows, of which eight carry kills. The rest show a
   * result and dashes.
   *
   * Two lists are merged rather than one being derived from the other, because neither
   * contains the other. The league record drops events the player sat out (a DNP must
   * never earn a share of a tournament win), and PickEm knows about events the league
   * file does not — so the union is the only complete answer. `start` is what orders
   * them; both sides carry one, which is why it was threaded onto the summary rows.
   *
   * Absences ARE rows here, unlike the old table: with league results beside them a
   * missed tournament is legible as part of the sequence rather than a blank line.
   */
  /**
   * Not `useMemo`: this sits below the component's early returns for the loading and
   * not-found states, and a hook called after a conditional return breaks React's hook
   * ordering. Fifty rows of array work per render is not worth the risk of moving it.
   */
  const timeline: TimelineRow[] = (() => {
    const byPickemId = new Map(labelled.map((a) => [a.eventId, a]));
    const used = new Set<string>();
    const rows: TimelineRow[] = [];

    for (const ev of career?.nxl?.events ?? []) {
      const pickem = ev.pickemEventId ? (byPickemId.get(ev.pickemEventId) ?? null) : null;
      if (pickem) used.add(pickem.eventId);
      rows.push({
        key: ev.key,
        label: pickem ? pickem.label : nxlEventLabel(ev.label, ev.year),
        shortLabel: pickem ? pickem.shortLabel : nxlShortLabel(ev.label, ev.year),
        year: ev.year,
        team: pickem ? pickem.team : ev.club,
        teamId: ev.teamId ?? pickem?.teamId ?? null,
        record: {
          w: ev.w,
          l: ev.l,
          t: ev.t,
          finish: ev.finish,
          finishRank: ev.finishRank,
          champion: ev.finishRank === 1,
        },
        start: ev.start ?? `${ev.year}-01-01`,
        pickem,
      });
    }

    // PickEm events with no league row: the ones the player sat out, and every event
    // for a player we hold no NXL id for at all.
    for (const a of labelled) {
      if (used.has(a.eventId)) continue;
      rows.push({
        key: a.eventId,
        label: a.label,
        shortLabel: a.shortLabel,
        year: a.year,
        team: a.team,
        teamId: a.teamId,
        record: a.record,
        start: a.start ?? `${a.year}-01-01`,
        pickem: a,
      });
    }

    return rows.sort((x, y) => y.start.localeCompare(x.start));
  })();

  const historyRows = timeline;

  // Default the match view to their most recent played event.
  const matchEvent = matchEventId
    ? (historyRows.find((a) => a.key === matchEventId) ?? null)
    : null;

  /**
   * Every match of the career: PickEm's, which carry kills, plus the league's, which
   * do not.
   *
   * Concatenated rather than joined. An event is either one PickEm scores or it is not,
   * so no match can appear on both sides — and joining them would mean re-solving the
   * round-and-opponent matching that `functions/nxlHistory.js` already does against the
   * league's own fixture list.
   */
  // Plain computation rather than `useMemo`, for the same reason as `timeline` above.
  const allCareerMatches: CareerMatch[] = (() => {
    const rows: CareerMatch[] = allMatches.map((m) => ({
      key: `${m.eventId}:${m.gameId}`,
      eventKey: m.eventId,
      round: m.round,
      opponent: m.opponent,
      opponentId: m.opponentId,
      result: m.result,
      scoreFor: m.scoreFor,
      scoreAgainst: m.scoreAgainst,
      pickem: m,
    }));

    for (const m of career?.nxl?.matchLog ?? []) {
      rows.push({
        key: `${m.k}:${m.r}:${m.o}`,
        eventKey: m.k,
        round: m.r,
        opponent: m.o,
        opponentId: null,
        result: m.f > m.a ? "W" : m.f < m.a ? "L" : "T",
        scoreFor: m.f,
        scoreAgainst: m.a,
        pickem: null,
      });
    }
    return rows;
  })();

  /**
   * Matches for the selected event, or every match when none is chosen — a filter, not
   * a query. The whole career is already on the summary document, so switching costs
   * nothing and showing everything costs nothing either, which is why "All events" is
   * the default: the interesting view is a career of matches, not one tournament.
   */
  const eventOrder = new Map(historyRows.map((a, i) => [a.key, i]));
  const pickemKeyOf = new Map(
    historyRows.filter((r) => r.pickem).map((r) => [r.pickem!.eventId, r.key]),
  );
  const matches = (matchEvent
    ? allCareerMatches.filter(
        (m) => m.eventKey === matchEvent.key || pickemKeyOf.get(m.eventKey) === matchEvent.key,
      )
    : allCareerMatches.slice()
  ).sort((a, b) => {
    // Newest event first, matching the events table; within an event, latest round first.
    const ka = pickemKeyOf.get(a.eventKey) ?? a.eventKey;
    const kb = pickemKeyOf.get(b.eventKey) ?? b.eventKey;
    const ea = eventOrder.get(ka) ?? 99;
    const eb = eventOrder.get(kb) ?? 99;
    if (ea !== eb) return ea - eb;
    return roundRankOf(b.round) - roundRankOf(a.round);
  });
  const active = hovered ? labelled.find((x) => x.eventId === hovered) : null;

  // Long names would wrap to three lines and make the hero taller for some players than
  // others. Step the size down instead so the band keeps a consistent height.
  const nameSize =
    career.name.length <= 20
      ? "text-[22px] lg:text-[38px]"
      : career.name.length <= 26
        ? "text-[19px] lg:text-[26px]"
        : "text-[17px] lg:text-[22px]";

  return (
    <div
      className="mx-auto mt-2 max-w-7xl px-4 md:px-6"
      style={{ paddingBottom: 80 }}
      // opt this page into the variable-font numerals; see globals.css
      data-numeric="variable"
    >
      {/* Breadcrumb and search share the row: the page is otherwise a dead end, only
          reachable from the stats table or by URL. */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-3">
        {/*
          Sized to the search input beside it, which globals.css pins at 16px so iOS
          Safari does not zoom on focus — so the breadcrumb comes up rather than the
          field coming down. Dropping LABEL's uppercase and tracking at that size:
          16px black uppercase reads as a heading, not a trail.
        */}
        <nav className="flex items-center gap-2 text-base text-gray-400 dark:text-white/40">
          <Link href="/dashboard/stats" className="hover:text-gray-600 dark:hover:text-white/70">
            Stats
          </Link>
          <span className="text-gray-300 dark:text-white/25">›</span>
          <span className="text-gray-600 dark:text-white/60">{career.name}</span>
        </nav>
        <PlayerSearch className="w-full sm:w-64" />
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-xl bg-[#101010]">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr]">
          {/*
            Portrait on top, identity underneath — a stacked block rather than a row.

            Side by side, the photo and the name each got half a column and neither had
            room: the name stepped down a size to avoid a third line, and the photo was
            small enough next to 38px numerals to read as an afterthought. Stacked, both
            get the full width of the column.

            No jersey number. It changes between seasons, it is the least durable thing
            on a page about a decade-long career, and it was the only line above the
            name — so it was the first thing read and the least worth reading.
          */}
          <div className="flex flex-col items-start gap-3.5 border-b border-white/[0.08] p-5 lg:border-b-0 lg:border-r">
            <div
              className="h-[104px] w-[104px] flex-none rounded-xl bg-[#1a1a1a] lg:h-[132px] lg:w-[132px]"
              style={{
                backgroundImage: `url('${career.imgUrl || "/placeholder.svg"}')`,
                // portraits are square head-to-waist; favour the upper body so the face
                // reads at this size
                backgroundSize: "125%",
                backgroundPosition: "50% 8%",
              }}
            />
            <div className="min-w-0">
              <h1
                className={cn(
                  "font-azonix font-black uppercase tracking-[0.02em] text-white",
                  nameSize,
                  // after nameSize: twMerge drops a leading-* that precedes a text-[size]
                  "leading-[1.02]",
                )}
              >
                {career.name}
              </h1>
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-block h-[1em] w-[3px] shrink-0 rounded-[1px] bg-white dark:bg-[#00f976]" />
                <span className="text-[12px] text-white/50">{career.currentTeam}</span>
              </div>
            </div>
          </div>

          {/* Two scoped rows: what the player's TEAMS have done across the league's
              whole history, then what the player themself has done in the events
              PickEm scores. Each row is captioned, because the two spans differ by a
              decade and the numbers sit inches apart. */}
          <div className="flex flex-col">
            {/* Absent for the players we hold no NXL id for, rather than shown as a row
                of dashes — a blank scoreboard reads as "never won anything", which is a
                claim about the player instead of about our data. The hero simply falls
                back to the PickEm row it had before. */}
            {career.nxl && (
              <>
                {/*
                  FIXED FOR EVERY PLAYER — this is a statement about our DATA, not about
                  this career. Paintball goes back far further than 2015; the results
                  before it are hard to come by, and saying where we start is the honest
                  version of that. It read "Tracked 2020" on a player who debuted in
                  2020, which turned a claim about coverage into a claim about them.

                  ⚠️ The scope names are gone from both strips (your call, 4 Sep): these
                  two rows span 51 league events and PickEm's eight, and only the differing
                  years now hint at that. See CAREER_PAGE_REVIEW.md.
                */}
                <ScopeStrip>Tracked {career.nxl.trackedFrom ?? "2015"} to date</ScopeStrip>
                <NxlHeroRow nxl={career.nxl} />
              </>
            )}

            <ScopeStrip>Tracked {career.trackedFrom ?? "2025"} to date</ScopeStrip>
            {/* A player who never took the field has no career to average. Rendering
                "0.0 average kills" would state a result for events they were not at —
                the same false claim the participation work exists to remove. */}
            {career.playedCount === 0 ? (
              <div className="grid flex-1 grid-cols-2 lg:grid-cols-4">
                <HeroTile label="Career kills" value="—" />
                <HeroTile label="All-time rank" value="—" />
                <HeroTile label="Average kills per event" value="—" />
                <HeroTile label="Average event rank" value="—" />
              </div>
            ) : (
              <div className="grid flex-1 grid-cols-2 lg:grid-cols-4">
                <HeroTile label="Career kills" value={fmtK(career.totalKills)} />
                <HeroTile
                  label="All-time rank"
                  value={career.careerRank ? String(career.careerRank) : "—"}
                  suffix={career.careerRank ? ordinal(career.careerRank) : undefined}
                />
                <HeroTile label="Average kills per event" value={career.avgKills.toFixed(1)} />
                <HeroTile
                  label="Average event rank"
                  value={career.avgRank != null ? String(Math.round(career.avgRank)) : "—"}
                  suffix={career.avgRank != null ? ordinal(Math.round(career.avgRank)) : undefined}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── NXL record ───────────────────────────────────────────────── */}
      {/* Straight after the hero, because it is what the hero's top row means over
          time. Bars rather than the line used below it, so the two panels cannot be
          read as one series — see NxlRecordPanel. Hidden entirely for a player with
          only one season, who has a record but no shape to show. */}
      {career.nxl && career.nxl.seasons >= NXL_PANEL_MIN_SEASONS && (
        <NxlRecordPanel nxl={career.nxl} />
      )}

      {/* ── Kills by event ───────────────────────────────────────────── */}
      <section className={cn(PANEL, "mt-3.5 p-5")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* toggle sits directly under the title rather than below the whole header
              row, so the tall stat block beside it does not open a gap */}
          <div>
            <h2 className={SECTION_HEADING}>Kills by event</h2>
            <div className="mt-2.5 flex gap-1.5">
              {(["total", "breakdown"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setKillsMode(m)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 font-azonix text-[10px] font-bold uppercase tracking-wide transition-colors",
                    killsMode === m
                      ? "border-[#1a3c6e] bg-[#1a3c6e] text-white dark:border-[#00f976] dark:bg-[#00f976] dark:text-neutral-950"
                      : "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-white/15 dark:text-white/50",
                  )}
                >
                  {m === "total" ? "Total" : "By type"}
                </button>
              ))}
            </div>
            {killsMode === "breakdown" && (
              <AccessibleColourToggle checked={killsAccessible} onChange={setKillsAccessible} />
            )}
          </div>
          <SeasonStat
            label={`Kills per event${latestSeason ? ` \u00b7 ${latestSeason}` : ""}`}
            value={killsNow != null ? killsNow.toFixed(1) : "\u2014"}
            delta={killsNow != null && killsPrev != null ? killsNow - killsPrev : null}
            prevSeason={prevSeason}
            format={(v) => Math.abs(v).toFixed(1)}
            higherIsBetter
            align="right"
          />
        </div>

        {killsMode === "total" ? (
          <KillsLine
            appearances={labelled}
            maxKills={maxKills}
            avgKills={avgKills}
            hovered={hovered}
            onHover={setHovered}
          />
        ) : (
          <KillsStacked
            appearances={labelled}
            hovered={hovered}
            onHover={setHovered}
            accessible={killsAccessible}
            dark={dark}
          />
        )}

        <div className="mt-4 min-h-[34px] border-t border-gray-200/70 pt-2.5 dark:border-white/5">
          {active ? (
            <HoverLine a={active} label={active.label} order={killsMode === "breakdown" ? "legend" : "alpha"} />
          ) : (
            <div className="flex justify-between">
              <span className={LABEL}>{labelled[0]?.label}</span>
              <span className={LABEL}>{labelled.at(-1)?.label}</span>
            </div>
          )}
        </div>
      </section>

      {/* ── Two-up ───────────────────────────────────────────────────── */}
      <div className="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <section className={cn(PANEL, "p-5")}>
          <div className="flex min-h-[30px] flex-wrap items-center justify-between gap-3">
            <h2 className={SECTION_HEADING}>Playing style</h2>
            {scopeOptions.length > 1 && (
              <label className="relative">
                <span className="sr-only">Period</span>
                <select
                  value={scope}
                  onChange={(e) => setStyleScope(e.target.value as StyleScope)}
                  className="cursor-pointer appearance-none rounded-full border border-gray-300 bg-transparent py-1.5 pl-3 pr-7 font-azonix text-[10px] font-bold uppercase tracking-wide text-gray-700 outline-none focus-visible:ring-2 focus-visible:ring-[#00f976] dark:border-white/15 dark:text-white/70"
                >
                  {scopeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[8px] text-gray-400 dark:text-white/40">
                  ▼
                </span>
              </label>
            )}
          </div>
          <AccessibleColourToggle checked={styleAccessible} onChange={setStyleAccessible} />
          <p className="mb-4 mt-2 text-[12px] text-gray-500 dark:text-white/40">
            Confirmed Kills by type
          </p>
          <StyleDonut totals={scopedTypeTotals} accessible={styleAccessible} dark={dark} />
        </section>

        <section className={cn(PANEL, "flex flex-col p-5")}>
          <div className="flex min-h-[30px] items-center">
            <h2 className={SECTION_HEADING}>PickEm stats</h2>
          </div>
          <p className="mt-2 text-[12px] text-gray-500 dark:text-white/40">
            Cost per kill and player Pick %
          </p>
          <PickemStats appearances={labelled} ownership={ownership} />
        </section>
      </div>

      {/* ── History: events, or match detail within one event ─────────── */}
      <section className={cn(PANEL, "mt-3.5 p-5")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className={SECTION_HEADING}>
              {historyTab === "events" ? "Event history" : "Match detail"}
            </h2>
            <div className="mt-2.5 flex gap-1.5">
              {(["events", "matches"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setHistoryTab(t)}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-azonix text-[9px] font-black uppercase tracking-wider transition-colors",
                    historyTab === t
                      ? "bg-[#1a3c6e] text-white dark:bg-[#00f976] dark:text-stone-900"
                      : "bg-black/[0.04] text-gray-500 hover:bg-black/[0.07] dark:bg-white/[0.06] dark:text-white/50 dark:hover:bg-white/[0.1]",
                  )}
                >
                  {t === "events" ? "Events" : "Matches"}
                </button>
              ))}
            </div>
          </div>

          {/* Match detail is per event, so the view needs to say which one. */}
          {historyTab === "matches" && historyRows.length > 0 && (
            <select
              value={matchEvent?.key ?? ""}
              onChange={(e) => setMatchEventId(e.target.value || null)}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-bold text-gray-700 outline-none dark:border-white/10 dark:bg-stone-800 dark:text-white/70"
            >
              <option value="">All events</option>
              {historyRows.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {historyTab === "matches" ? (
          <MatchTable
            matches={matches}
            eventLabel={matchEvent?.label ?? ""}
            eventShort={matchEvent?.shortLabel ?? ""}
            // A match row's event key is either a PickEm event id or a league event
            // key, and the timeline is indexed by whichever of those it was built from.
            labelFor={(key) =>
              historyRows.find((a) => a.key === key || a.pickem?.eventId === key)?.label ?? key
            }
            shortFor={(key) =>
              historyRows.find((a) => a.key === key || a.pickem?.eventId === key)?.shortLabel ?? key
            }
          />
        ) : (
        <div className="mt-4 overflow-x-auto" style={{ scrollbarGutter: "stable" }}>
          <div className="min-w-[700px] sm:min-w-[1000px]">
            <div
              className={cn(
                "grid items-end gap-1.5 border-b border-gray-200/70 px-2.5 pb-2 sm:gap-3 dark:border-white/5",
                HISTORY_COLS,
              )}
            >
              <span className={LABEL}>Event</span>
              <span className={LABEL}>Team</span>
              {/* Sits beside Team, not among the kill columns, because it is the TEAM's
                  result — everything to the right of the spacer is the player's own. */}
              <span className={cn(LABEL, "text-right")} title="Their team's win-loss record at this event">
                W–L
              </span>
              <span />
              <span className={cn(LABEL, "text-right")}>Rank</span>
              <span className={cn(LABEL, "text-right")}>Kills</span>
              <span className={cn(LABEL, "text-right leading-[1.3]")} title="% of team\u2019s kills — this player\u2019s share of what the team scored">
                {SHARE_HEAD.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </span>
              {KILL_TYPES.map((t) => (
                <span key={t} className={cn(LABEL, "text-right leading-[1.3]")} title={t}>
                  {(TYPE_HEAD[t] ?? [t]).map((line, i) => (
                    <span key={line} className={i === 0 ? "block" : "block"}>
                      {line}
                    </span>
                  ))}
                </span>
              ))}
              <span className={cn(LABEL, "text-right")}>Cost</span>
              <span className={cn(LABEL, "text-right")}>Per kill</span>
              <span className={cn(LABEL, "text-right")}>Pick %</span>
            </div>
            {historyRows.map((row) => {
              /**
               * THREE STATES PER ROW, and they are not the same dash.
               *
               *   `p` null      league event PickEm never scored — nothing to report
               *   absent        rostered and did not play — nothing HAPPENED to report
               *   otherwise     a real performance, and a zero in it is a real zero
               *
               * The first two both render as dashes and they mean different things, but
               * neither may render as a number: printing 0 kills for an event nobody
               * counted, or for one the player watched from the pit, states a result
               * that does not exist. Only the third can carry a zero.
               */
              const p = row.pickem;
              const absent = p ? missedEvent(p) : false;
              const noStats = !p || absent;
              const pick = noStats ? null : (ownership?.get(p.eventId) ?? null);
              // Kept so the existing cells below read unchanged where they can.
              const a = p;
              return (
              <div
                key={row.key}
                className={cn(
                  "grid items-center gap-1.5 border-b border-gray-200/50 px-2.5 py-2.5 last:border-b-0 hover:bg-black/[0.02] sm:gap-3 dark:border-white/[0.03] dark:hover:bg-white/[0.02]",
                  HISTORY_COLS,
                )}
              >
                {/* Phones get the axis form of each name so the columns can narrow;
                    both are rendered and the breakpoint picks one, which keeps the
                    full name in the DOM for search and copy. */}
                {/* One line, always. A wrapped name doubled the height of its row and
                    broke the table's rhythm; the column is fixed-width, so anything
                    still too long is clipped rather than allowed to reflow. */}
                <div
                  className="truncate whitespace-nowrap text-[12px] font-bold text-gray-900 dark:text-white"
                  title={row.label}
                >
                  <span className="sm:hidden">{row.shortLabel}</span>
                  <span className="hidden sm:inline">{row.label}</span>
                </div>
                <div className="truncate text-[12px] text-gray-600 dark:text-white/50">
                  {p && p.kind === "not-rostered" ? (
                    "—"
                  ) : (
                    <>
                      <span className="sm:hidden">{teamCode(row.teamId, row.team)}</span>
                      <span className="hidden sm:inline">{row.team}</span>
                    </>
                  )}
                </div>
                {/* The team's record, and — in brand green with a trophy — whether they
                    won it. A title is the single most important thing an event row can
                    say, and it costs no extra column: "7–0" already sits here, so the
                    fact that it was the winning run is carried by the styling rather
                    than by yet another 50px of table. */}
                <div
                  className={cn(
                    "text-right text-[12px] pickem-numeric",
                    row.record?.champion
                      ? "font-black text-[#1a3c6e] dark:text-[#00f976]"
                      : row.record
                        ? "font-semibold text-gray-600 dark:text-white/60"
                        : "text-gray-300 dark:text-white/25",
                  )}
                  title={
                    row.record
                      ? `${row.team} finished ${row.record.champion ? "as winners" : `at the ${row.record.finish.toLowerCase()}`} — ${row.record.w} won, ${row.record.l} lost`
                      : "The league has no results for this event yet"
                  }
                >
                  {row.record ? (
                    <>
                      {row.record.champion && <span className="mr-0.5" aria-hidden="true">🏆</span>}
                      {row.record.w}–{row.record.l}
                    </>
                  ) : (
                    "—"
                  )}
                </div>
                <div />
                {/* A rank and a kill count are both claims about a performance. At an
                    event the player never attended there was no performance, so neither
                    is reported — the row says DNP once and leaves the rest blank. */}
                <div
                  className={cn(
                    "text-right text-[12px] font-semibold pickem-numeric",
                    noStats
                      ? "text-gray-300 dark:text-white/25"
                      : "text-gray-900 dark:text-white",
                  )}
                >
                  {noStats ? "—" : (a!.rank ?? "—")}
                </div>
                {/* "DNP" only where we KNOW they sat out. A league event PickEm never
                    scored gets a plain dash — we have no idea whether they played. */}
                <div
                  className={cn(
                    "text-right text-[12px] font-semibold",
                    absent
                      ? "font-azonix text-[10px] text-gray-400 dark:text-white/40"
                      : noStats
                        ? "pickem-numeric text-gray-300 dark:text-white/25"
                        : "pickem-numeric text-gray-900 dark:text-white",
                  )}
                >
                  {absent
                    ? a!.kind === "not-rostered"
                      ? "\u2014"
                      : "DNP"
                    : noStats
                      ? "\u2014"
                      : fmtK(a!.kills)}
                </div>
                <div
                  className={cn(
                    "text-right text-[12px] pickem-numeric",
                    !noStats && a!.shareOfTeam != null
                      ? "text-gray-600 dark:text-white/60"
                      : "text-gray-300 dark:text-white/25",
                  )}
                >
                  {!noStats && a!.shareOfTeam != null ? `${a!.shareOfTeam.toFixed(0)}%` : "\u2014"}
                </div>
                {KILL_TYPES.map((t) => (
                    <div
                      key={t}
                      className={cn(
                        "text-right text-[12px] pickem-numeric",
                        !noStats && a!.types[t] > 0
                          ? "text-gray-600 dark:text-white/60"
                          : "text-gray-300 dark:text-white/25",
                      )}
                    >
                      {noStats ? "\u2014" : fmtK(a!.types[t])}
                    </div>
                ))}
                <div
                  className={cn(
                    "text-right text-[12px] font-semibold pickem-numeric",
                    !a || a.kind === "not-rostered"
                      ? "text-gray-300 dark:text-white/25"
                      : "text-gray-900 dark:text-white",
                  )}
                >
                  {!a || a.kind === "not-rostered" ? "\u2014" : fmtCost(a.cost)}
                </div>
                <div
                  className={cn(
                    "text-right text-[12px] font-semibold pickem-numeric",
                    noStats
                      ? "text-gray-300 dark:text-white/25"
                      : "text-gray-900 dark:text-white",
                  )}
                >
                  {a?.costPerKill != null ? fmtCost(a.costPerKill) : "\u2014"}
                </div>
                <div
                  className={cn(
                    "text-right text-[12px] pickem-numeric",
                    pick != null
                      ? "font-semibold text-gray-900 dark:text-white"
                      : "text-gray-300 dark:text-white/25",
                  )}
                >
                  {pick != null ? `${pick.toFixed(1)}%` : "—"}
                </div>
              </div>
              );
            })}
          </div>
        </div>
        )}
      </section>

    </div>
  );
}

/**
 * Cost per kill and pick % on one chart, each on its own y-axis.
 *
 * Two y-scales on one plot can imply a relationship the data does not support — where
 * the lines cross is an artefact of the two scales, not a fact. The axes are labelled
 * and colour-matched to their series so which-line-is-which is unambiguous.
 */
function PickemStats({
  appearances,
  ownership,
}: {
  appearances: (CareerAppearance & { label: string })[];
  ownership: Map<string, number> | null;
}) {
  const [hover, setHover] = useState<number | null>(null);

  /**
   * Every event the player appeared at goes on the axis, exactly as the event history
   * table lists them. A missing value breaks its own line — it never removes the event.
   *
   * This used to plot only events with a cost per kill, which silently shortened a
   * player's career: cost per kill is undefined at zero kills, so the events that
   * disappeared were the bad ones, and the chart flattered precisely the players it hid.
   */
  const ownOf = (i: number) =>
    missedEvent(appearances[i]) ? null : (ownership?.get(appearances[i].eventId) ?? null);
  const costOf = (i: number) => appearances[i].costPerKill;

  const costVals = appearances
    .map((a) => a.costPerKill)
    .filter((v): v is number => v != null);
  const ownVals = appearances
    .map((_, i) => ownOf(i))
    .filter((v): v is number => v != null);

  if (appearances.length < 2 || (costVals.length === 0 && ownVals.length === 0)) {
    return (
      <p className="mt-6 text-[12px] text-gray-400 dark:text-white/30">
        Not enough events to show a trend.
      </p>
    );
  }

  const H = 186;
  const PAD = 16;
  const INSET = 5;
  const step = (100 - INSET * 2) / (appearances.length - 1);
  const xAt = (i: number) => INSET + i * step;
  const yAt = (v: number, min: number, span: number) =>
    H - PAD - ((v - min) / span) * (H - PAD * 2);

  const cMax = costVals.length ? Math.max(...costVals) : 0;
  const cMin = costVals.length ? Math.min(...costVals) : 0;
  const cSpan = cMax - cMin || 1;
  const costY = (i: number) => {
    const v = costOf(i);
    return v == null ? null : yAt(v, cMin, cSpan);
  };

  // Pick % is anchored at zero so the line's height always means the same thing and small
  // movements are not exaggerated. The top is variable with headroom, and never lower
  // than 10% — a player owned by 2% would otherwise get an axis zoomed so far in that
  // noise looks like a trend.
  const oMin = 0;
  const oMax = niceCeiling(ownVals.length ? Math.max(...ownVals) * 1.15 : 10);
  const oSpan = oMax - oMin;
  const ownY = (i: number) => {
    const v = ownOf(i);
    return v == null ? null : yAt(v, oMin, oSpan);
  };

  const costSegs = lineSegments(appearances.length, costY, xAt);
  const ownSegs = lineSegments(appearances.length, ownY, xAt);

  /**
   * A missed event in one word, using the roster's own status — "Out" and "Injured" say
   * more than a blanket "did not play", and the abbreviation is what a fan reads anyway.
   */
  // 2025 events carry no roster status, so DNP is the fallback — it is the term a
  // reader expects, and the specific reason simply was not recorded back then.
  const absenceLabel = absenceWord;

  /**
   * What the cost series has to say about one event, in the fewest words that are true.
   *
   * At zero kills there is no cost per kill to report, so reporting a dash against the
   * label is just noise — the fact worth showing is the zero itself.
   */
  const costNote = (a: CareerAppearance) =>
    a.kills <= 0 ? "0 kills" : "no cost recorded";

  const seasons = Array.from(new Set(appearances.map((a) => a.year))).sort();
  const latestSeason = seasons[seasons.length - 1] ?? null;
  const prevSeason = seasons.length > 1 ? seasons[seasons.length - 2] : null;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const inSeason = (yr: string | null) => (yr ? appearances.filter((a) => a.year === yr) : []);

  const costNow = mean(inSeason(latestSeason).map((a) => a.costPerKill).filter((v): v is number => v != null));
  const costPrev = mean(inSeason(prevSeason).map((a) => a.costPerKill).filter((v): v is number => v != null));
  const pickedIn = (yr: string | null) =>
    inSeason(yr)
      .filter((a) => !missedEvent(a))
      .map((a) => ownership?.get(a.eventId))
      .filter((v): v is number => v != null);
  const pickNow = mean(pickedIn(latestSeason));
  const pickPrev = mean(pickedIn(prevSeason));

  // A season average over only the priced events would repeat the bug the axis just fixed,
  // so say how many events actually stand behind the number.
  const costBasis = inSeason(latestSeason).filter((a) => a.costPerKill != null).length;
  // Denominator is events they were on the roster for. An event they were never named
  // for is not one they failed to score at.
  const costTotal = inSeason(latestSeason).filter((a) => a.kind !== "not-rostered").length;

  return (
    <div className="flex flex-1 flex-col">
      {/* season averages: latest season, against the one before it */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <SeasonStat
          label={`Cost per kill${latestSeason ? ` · ${latestSeason}` : ""}`}
          value={costNow != null ? fmtCost(costNow) : "—"}
          delta={costNow != null && costPrev != null ? costNow - costPrev : null}
          prevSeason={prevSeason}
          format={(v) => fmtCost(Math.abs(v))}
          // a rising cost per kill is worse value, so the judgement colour inverts
          higherIsBetter={false}
          note={
            costBasis > 0 && costBasis < costTotal
              ? `${costBasis} of ${costTotal} events scored`
              : undefined
          }
        />
        <SeasonStat
          label={`Pick %${latestSeason ? ` · ${latestSeason}` : ""}`}
          value={pickNow != null ? `${pickNow.toFixed(1)}%` : "—"}
          delta={pickNow != null && pickPrev != null ? pickNow - pickPrev : null}
          prevSeason={prevSeason}
          format={(v) => `${Math.abs(v).toFixed(1)}pp`}
          // rising ownership reads as rising standing, so up is the positive direction
          higherIsBetter
          align="right"
        />
      </div>


      {/* legend — with two scales in play, identifying the lines is not optional */}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="flex items-center gap-2">
          <span className="h-[3px] w-4 rounded-full bg-[#1a3c6e] dark:bg-[#00f976]" />
          <span className={LABEL}>Cost per kill</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="h-[3px] w-4 rounded-full bg-[#0f9d58] dark:bg-white" />
          <span className={LABEL}>Pick %</span>
        </span>
      </div>

      <div className="mt-3 flex flex-1 items-start gap-2">
        {/* left axis — cost */}
        <div className="flex h-[186px] w-14 flex-none flex-col justify-between py-[12px] text-right">
          <span className="pickem-numeric text-[10px] text-[#1a3c6e] dark:text-[#00f976]">
            {costVals.length ? fmtCost(cMax) : "—"}
          </span>
          <span className="pickem-numeric text-[10px] text-[#1a3c6e] dark:text-[#00f976]">
            {costVals.length ? fmtCost(cMin) : "—"}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          {/* this box must match the svg exactly — markers are positioned as a % of it */}
          <div className="relative h-[186px]">
          <svg
            viewBox={`0 0 100 ${H}`}
            preserveAspectRatio="none"
            className="h-full w-full"
            aria-hidden="true"
          >
            {costSegs.map((seg) => (
              <polyline
                key={`c${seg[0]}`}
                points={seg.join(" ")}
                fill="none"
                className={LINE_INK}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {ownSegs.map((seg) => (
              <polyline
                key={`o${seg[0]}`}
                points={seg.join(" ")}
                fill="none"
                className={LINE_INK_ALT}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {/* markers + per-event hit targets, positioned over the stretched svg */}
          {appearances.map((a, i) => {
            const on = hover === i;
            const cy = costY(i);
            const oy = ownY(i);
            const own = ownOf(i);
            return (
              <button
                key={a.eventId}
                type="button"
                className="absolute top-0 h-full -translate-x-1/2 outline-none"
                style={{ left: `${xAt(i)}%`, width: `${Math.max(step, 6)}%` }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={
                  missedEvent(a)
                    ? `${a.label}: ${absenceLabel(a)}`
                    : `${a.label}: ${
                        a.costPerKill != null
                          ? `${fmtCost(a.costPerKill)} per kill`
                          : costNote(a)
                      }${own != null ? `, pick ${own.toFixed(1)}%` : ""}`
                }
              >
                {on && <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-300 dark:bg-white/15" />}
                {cy != null && (
                  <span
                    className={cn(
                      "absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1a3c6e] transition-all dark:bg-[#00f976]",
                      on ? "h-[11px] w-[11px]" : "h-[7px] w-[7px]",
                    )}
                    style={{ top: `${(cy / H) * 100}%` }}
                  />
                )}
                {oy != null && (
                  <span
                    className={cn(
                      "absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0f9d58] transition-all dark:bg-white",
                      on ? "h-[11px] w-[11px]" : "h-[7px] w-[7px]",
                    )}
                    style={{ top: `${(oy / H) * 100}%` }}
                  />
                )}
              </button>
            );
          })}

          </div>

          {/* x-axis labels, matching the kills chart */}
          <div className="relative mt-2 h-4">
            {appearances.map((a, i) => (
              <span
                key={a.eventId}
                className={cn(
                  LABEL,
                  "absolute -translate-x-1/2 whitespace-nowrap transition-colors",
                  hover === i && "text-gray-900 dark:text-white",
                )}
                style={{ left: `${xAt(i)}%` }}
              >
                {a.shortLabel}
              </span>
            ))}
          </div>
        </div>

        {/* right axis — pick % */}
        <div className="flex h-[186px] w-10 flex-none flex-col justify-between py-[12px]">
          <span className="pickem-numeric text-[10px] text-[#0f9d58] dark:text-white">
            {`${oMax}%`}
          </span>
          <span className="pickem-numeric text-[10px] text-[#0f9d58] dark:text-white">
            0%
          </span>
        </div>
      </div>

      <div className="mt-3 min-h-[34px] border-t border-gray-200/70 pt-2.5 dark:border-white/5">
        {hover != null ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-white/50">
            <span className="font-black text-gray-900 dark:text-white">{appearances[hover].label}</span>
            {missedEvent(appearances[hover]) ? (
              // Nothing was measured, so there are no series to lay out — two swatches
              // against two dashes reads as broken rather than as absent.
              <span className="font-black text-gray-900 dark:text-white">
                {absenceLabel(appearances[hover])}
              </span>
            ) : (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="h-[3px] w-3 rounded-full bg-[#1a3c6e] dark:bg-[#00f976]" />
                  {appearances[hover].costPerKill != null ? (
                    <>
                      <b className="pickem-numeric font-black text-gray-900 dark:text-white">
                        {fmtCost(appearances[hover].costPerKill as number)}
                      </b>{" "}
                      per kill
                    </>
                  ) : (
                    <b className="pickem-numeric font-black text-gray-900 dark:text-white">
                      {costNote(appearances[hover])}
                    </b>
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-[3px] w-3 rounded-full bg-[#0f9d58] dark:bg-white" />
                  <b className="pickem-numeric font-black text-gray-900 dark:text-white">
                    {ownOf(hover) != null ? `${ownOf(hover)!.toFixed(1)}%` : "—"}
                  </b>{" "}
                  pick %
                </span>
              </>
            )}
          </div>
        ) : (
          <span className={cn(LABEL, "text-gray-300 dark:text-white/20")}>
            Hover an event for detail
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Split a series into runs of consecutive events that have a value.
 *
 * Each run becomes its own polyline, so a missing event breaks the line rather than
 * being bridged by a segment that implies a reading we never had.
 */
function lineSegments(
  n: number,
  y: (i: number) => number | null,
  xAt: (i: number) => number,
): string[][] {
  const segs: string[][] = [];
  let run: string[] = [];
  for (let i = 0; i < n; i++) {
    const v = y(i);
    if (v == null) {
      if (run.length) segs.push(run);
      run = [];
    } else {
      run.push(`${xAt(i)},${v}`);
    }
  }
  if (run.length) segs.push(run);
  return segs;
}


/**
 * Match-by-match detail within one event.
 *
 * Mirrors the event table's column template so the two views line up when the toggle
 * flips — same widths, same kill-type heads, same alignment. A quiet match still gets a
 * row: the list comes from the team's games, not the player's kills, so a zero here
 * means "played and did not score", which is a result rather than an absence.
 */
function MatchTable({
  matches,
  eventLabel,
  eventShort,
  labelFor,
  shortFor,
}: {
  matches: CareerMatch[] | null;
  /** Empty when showing every event. */
  eventLabel: string;
  /** Axis form of the same event, e.g. "MW 26" — used on phones. */
  eventShort: string;
  /** Per-row labels, needed once rows can span events. */
  labelFor: (eventId: string) => string;
  shortFor: (eventId: string) => string;
}) {
  if (matches === null) {
    return (
      <div className="mt-6 flex justify-center py-10">
        <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-gray-300/90 border-t-[#00f976] dark:border-gray-600 dark:border-t-[#00f976]" />
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <p className="mt-6 max-w-[62ch] text-[12px] text-gray-500 dark:text-white/40">
        {eventLabel
          ? `No matches recorded for ${eventLabel}.`
          : "No matches recorded — this player has not taken the field at an event we hold kill-by-kill data for."}
      </p>
    );
  }

  const total = matches.reduce((a, m) => a + (m.pickem?.kills ?? 0), 0);
  const events = new Set(matches.map((m) => m.eventKey)).size;
  // How many of these rows PickEm actually scored. The kill total is only about those,
  // and saying "205.5 kills across 296 matches" would divide by the wrong denominator.
  const scored = matches.filter((m) => m.pickem).length;
  // Only the matches whose result we could identify. Counting the rest as losses would
  // be the one thing worse than leaving them out.
  const won = matches.filter((m) => m.result === "W").length;
  const lost = matches.filter((m) => m.result === "L").length;

  return (
    <>
      <p className="mt-3 text-[12px] text-gray-500 dark:text-white/40">
        <b className="pickem-numeric font-black text-gray-900 dark:text-white">{fmtK(total)}</b>{" "}
        kills across{" "}
        <b className="pickem-numeric font-black text-gray-900 dark:text-white">{matches.length}</b>{" "}
        {matches.length === 1 ? "match" : "matches"}
        {scored > 0 && scored < matches.length && (
          <span className="text-gray-400 dark:text-white/30">
            {" "}
            ({scored} scored by PickEm)
          </span>
        )}
        {won + lost > 0 && (
          <>
            {" "}
            ·{" "}
            <b className="pickem-numeric font-black text-gray-900 dark:text-white">
              {won}&ndash;{lost}
            </b>{" "}
            record
          </>
        )}
        {!eventLabel && events > 1 ? (
          <>
            {" "}
            ·{" "}
            <b className="pickem-numeric font-black text-gray-900 dark:text-white">{events}</b>{" "}
            events
          </>
        ) : null}
      </p>

      {/*
        Twelve rows then scroll. A full career is now 30+ matches across six events,
        which pushed everything below it off the screen; capping it keeps the panel a
        readable block. Header and rows share one scroll box so the header can be
        sticky — it needs a solid background, or rows show through it as they pass.
        513px = the 44px header plus twelve 39px rows, measured rather than guessed.
      */}
      <div
        className="mt-4 max-h-[513px] overflow-auto"
        style={{ scrollbarGutter: "stable" }}
      >
        <div className="min-w-[640px] sm:min-w-[1000px]">
          <div
            className={cn(
              "sticky top-0 z-10 grid items-end gap-1.5 border-b border-gray-200/70 bg-neutral-100 px-2.5 pb-2 pt-1 sm:gap-3 dark:border-white/5 dark:bg-stone-900",
              MATCH_COLS,
            )}
          >
            <span className={LABEL}>Event</span>
            <span className={LABEL}>Opponent</span>
            <span className={LABEL}>Round</span>
            <span className={LABEL} title="Won or lost, and the points score">Result</span>
            <span />
            <span className={cn(LABEL, "text-right")}>Kills</span>
            <span className={cn(LABEL, "text-right leading-[1.3]")} title="% of team\u2019s kills — this player\u2019s share of what the team scored">
              {SHARE_HEAD.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </span>
            {KILL_TYPES.map((t) => (
              <span key={t} className={cn(LABEL, "text-right leading-[1.3]")} title={t}>
                {(TYPE_HEAD[t] ?? [t]).map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </span>
            ))}
          </div>

          {matches.map((m) => {
            // What portion of the team's kills came from this player. Null for a league
            // match PickEm never scored — see the dash treatment on the kill columns.
            const p = m.pickem;
            const share = p && p.teamKills > 0 ? (p.kills / p.teamKills) * 100 : null;
            return (
              <div
                key={m.key}
                className={cn(
                  "grid items-center gap-1.5 border-b border-gray-200/50 px-2.5 py-2.5 last:border-b-0 hover:bg-black/[0.02] sm:gap-3 dark:border-white/[0.03] dark:hover:bg-white/[0.02]",
                  MATCH_COLS,
                )}
              >
                <div
                  className="truncate whitespace-nowrap text-[12px] font-bold text-gray-900 dark:text-white"
                  title={labelFor(m.eventKey)}
                >
                  <span className="sm:hidden">{shortFor(m.eventKey)}</span>
                  <span className="hidden sm:inline">{labelFor(m.eventKey)}</span>
                </div>
                <div className="truncate text-[12px] text-gray-600 dark:text-white/50">
                  <span className="sm:hidden">{teamCode(m.opponentId, m.opponent)}</span>
                  <span className="hidden sm:inline">{m.opponent}</span>
                </div>
                <div className="text-[12px] text-gray-600 dark:text-white/50">
                  {displayRound(m.round)}
                </div>
                {/*
                  W or L, then the points score.
                  A LETTER, NOT A COLOUR ALONE. Red-for-loss and green-for-win is the
                  obvious treatment and excludes the readers the accessible-palette
                  toggle on this page exists for; the letter carries the meaning and the
                  weight and tint only reinforce it. The win is the emphasised state
                  because a career reads as what someone won.

                  Kills sit two columns to the right and are a DIFFERENT FACT: a point
                  is won by hanging the flag, so a team can lose a game it out-killed.
                  The two are never reconciled and are not meant to be.
                */}
                <div className="text-[12px] pickem-numeric">
                  {m.result ? (
                    <>
                      <span
                        className={cn(
                          "font-black",
                          m.result === "W"
                            ? "text-[#1a3c6e] dark:text-[#00f976]"
                            : "text-gray-500 dark:text-white/45",
                        )}
                      >
                        {m.result}
                      </span>
                      {m.scoreFor != null && (
                        <span className="ml-1 text-gray-500 dark:text-white/40">
                          {m.scoreFor}–{m.scoreAgainst}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-300 dark:text-white/25">—</span>
                  )}
                </div>
                <div />
                {/*
                  A DASH, NOT A ZERO, for a league match PickEm never scored.
                  Zero is a measurement — took the field, scored nothing — and printing
                  one for a 2017 tournament nobody was counting would invent a result.
                */}
                <div
                  className={cn(
                    "text-right text-[12px] font-semibold",
                    p
                      ? "pickem-numeric text-gray-900 dark:text-white"
                      : "text-gray-300 dark:text-white/25",
                  )}
                >
                  {p ? fmtK(p.kills) : "\u2014"}
                </div>
                <div
                  className={cn(
                    "text-right text-[12px] pickem-numeric",
                    share != null
                      ? "text-gray-600 dark:text-white/60"
                      : "text-gray-300 dark:text-white/25",
                  )}
                >
                  {share != null ? `${share.toFixed(0)}%` : "—"}
                </div>
                {KILL_TYPES.map((t) => (
                  <div
                    key={t}
                    className={cn(
                      "text-right text-[12px] pickem-numeric",
                      p && p.types[t] > 0
                        ? "text-gray-600 dark:text-white/60"
                        : "text-gray-300 dark:text-white/25",
                    )}
                  >
                    {p ? fmtK(p.types[t]) : "\u2014"}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/**
 * One hero number.
 *
 * EVERY TILE IS THE SAME SHAPE: one line of number, one line of label. Nothing sits
 * between them.
 *
 * There used to be an optional third line for a supporting figure — the raw 224-72
 * behind a 76%, the "of 699" behind a rank. It made the tiles that carried one 94px
 * tall against 73px for the tiles that did not, so the NXL row and the PickEm row below
 * it kept a different rhythm and the hero stopped reading as one block. Reserving an
 * empty line in the tiles without a note fixed the baseline WITHIN a row and left the
 * two rows still 21px apart, which is the version this replaces.
 *
 * A supporting figure now goes INLINE, via `inlineNote`, on the same line as the value
 * and after the suffix. It cannot affect the tile's height there.
 *
 * The numerals shrank from 40/48px when the hero went from one row of stats to two, so
 * that the stats column and the portrait column beside it finish within a few pixels of
 * each other.
 */
function HeroTile({
  label, value, suffix, inlineNote, title,
}: {
  label: string;
  value: string;
  /** Glued to the value — ordinals ("18" + "th"). */
  suffix?: string;
  /** A separate fact on the same line, set apart by a space ("/699"). */
  inlineNote?: string;
  /** Hover gloss, for a label carrying a term a general reader may not know. */
  title?: string;
}) {
  return (
    <div
      /**
       * Padding is deliberately TOP-HEAVY: the label has to sit near the floor of the
       * box for the row to read as bottom-aligned. `justify-end` alone was not enough —
       * it pushes content against the padding, and the padding was the wrong way round
       * (12px above the number, 17px below the label at desktop), so every tile looked
       * like it was floating with a margin underneath it.
       */
      className="flex flex-col justify-end border-b border-r border-white/[0.08] px-3.5 pb-2 pt-5 last:border-r-0 lg:pb-2.5 lg:pt-6"
      title={title}
    >
      <div className="text-[26px] font-black leading-none pickem-numeric text-white lg:text-[32px] xl:text-[38px]">
        {value}
        {suffix && (
          <span className="ml-0.5 text-[11px] font-bold text-white/40 lg:text-[13px] xl:text-[15px]">
            {suffix}
          </span>
        )}
        {inlineNote && (
          <span className="ml-1 text-[11px] font-bold text-white/35 lg:text-[13px] xl:text-[15px]">
            {inlineNote}
          </span>
        )}
      </div>
      <div className="mt-1.5 font-azonix text-[8px] font-black uppercase tracking-widest text-white/40">
        {label}
      </div>
    </div>
  );
}

/**
 * The NXL row of the hero, at whichever tier the player's record reaches.
 *
 * THREE TIERS, BECAUSE A ZERO IS NOT A STAT.
 * Leading with tournament wins is right for the players who have some, and useless for
 * everyone else — most careers would put two zeros in the largest type on the page, and
 * a decade-long record would say nothing. So each tier leads with the highest rung the
 * player has actually reached, and the shape stays the same throughout: the COUNT, its
 * ALL-TIME RANK, then the RATE.
 *
 *   won a tournament      wins      · rank · win %       + match win %
 *   reached a bracket     Sundays   · rank · Sunday %    + match win %
 *   neither               matches   · rank · match win %
 *
 * The last tier drops the fourth tile rather than repeating itself: its rate tile is
 * already the match win rate, so a fourth would be the same number twice.
 *
 * Each rung genuinely separates players the rung above flattens. Among title-less
 * careers of ten events or more, Sunday rate runs from 84% (Tj Danner) down to 30%
 * (Joel Eaton) — records that "0 wins" calls identical.
 */
interface HeroFigure {
  label: string;
  value: string;
  /** Hover gloss, where the label uses a term the sport takes for granted. */
  title?: string;
}

interface NxlTier {
  count: HeroFigure;
  rank: { label: string; value: number | null };
  rate: HeroFigure;
  /** Null on the bottom tier, where the rate tile is already the match win rate. */
  fourth: HeroFigure | null;
}

function NxlHeroRow({ nxl }: { nxl: NxlCareer }) {
  const pct = (v: number | null) => (v != null ? `${v.toFixed(0)}%` : "\u2014");
  // The won-lost record used to sit under this as a second line. It is the one figure
  // on the row that has a natural home elsewhere — the match table's own caption reads
  // "205.5 kills across 48 matches · 36-12 record" — so it goes there rather than
  // costing every tile in the hero 21px of height.
  const matchRate: HeroFigure = {
    label: "Career match win %",
    value: pct(nxl.matchWinPct),
  };

  const tier: NxlTier =
    nxl.titles > 0
      ? {
          count: { label: "Career wins", value: String(nxl.titles) },
          rank: { label: "Wins rank", value: nxl.titlesRank },
          rate: { label: "Career win %", value: pct(nxl.titleRate) },
          fourth: matchRate,
        }
      : nxl.sundays > 0
        ? {
            count: {
              label: "Career Sundays made",
              value: String(nxl.sundays),
              // "Sunday" is the sport's word rather than a general reader's, and this is
              // the only place on the page it appears. The gloss is on hover rather than
              // under the number: an inline third line here is exactly what made the
              // tiles uneven, and it would appear on this tier alone.
              title: "Tournaments where the team reached the knockout bracket",
            },
            rank: { label: "Sundays made rank", value: nxl.sundaysRank },
            rate: { label: "Career Sundays made %", value: pct(nxl.sundayRate) },
            fourth: matchRate,
          }
        : {
            count: { label: "Career matches", value: String(nxl.matches) },
            rank: { label: "Matches rank", value: nxl.matchesRank },
            rate: matchRate,
            fourth: null,
          };

  return (
    <div
      className={cn(
        // `flex-1` so the stats column always fills its side of the hero. The portrait
        // column is the taller of the two now that the photo sits above the name, and
        // the leftover height was collecting under the last row of tiles as an empty
        // bar the width of the column. Sharing it between the rows removes that, and
        // the tiles bottom-align their content either way.
        "grid flex-1",
        tier.fourth ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3",
      )}
    >
      <HeroTile label={tier.count.label} value={tier.count.value} title={tier.count.title} />
      {/*
        Labelled by WHAT it ranks, not "All-time rank".
        The PickEm row directly below carries an "All-time rank" of its own, on career
        kills, and two tiles a few inches apart under the same words would be read as
        the same measurement.
      */}
      <HeroTile
        label={tier.rank.label}
        value={tier.rank.value != null ? String(tier.rank.value) : "\u2014"}
        suffix={tier.rank.value != null ? ordinal(tier.rank.value) : undefined}
        // "/699" on the same line as the rank rather than beneath it, so this tile is
        // the same height as every other one and the row shares a baseline.
        inlineNote={tier.rank.value != null ? `/${nxl.rankField}` : undefined}
        title={`Out of every player on an NXL Pro roster since 2015 (${nxl.rankField})`}
      />
      <HeroTile label={tier.rate.label} value={tier.rate.value} title={tier.rate.title} />
      {tier.fourth && (
        <HeroTile
          label={tier.fourth.label}
          value={tier.fourth.value}
          title={tier.fourth.title}
        />
      )}
    </div>
  );
}

/**
 * The strip that says which scope the four numbers under it are measured over.
 *
 * THE HERO CARRIES TWO SCOPES AND MUST SAY SO. Kills exist for the eight events PickEm
 * scores; results exist for every NXL event since 2015. Those numbers sit inches apart
 * and a reader will otherwise assume one span covers both — reading "12 tournament wins"
 * and "8 events" off the same block gives an impossible player. Labelling each row is
 * what makes two scopes honest rather than a trap.
 */
function ScopeStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-white/[0.08] bg-white/[0.02] px-3.5 py-1.5 font-azonix text-[8px] font-black uppercase tracking-widest text-white/30">
      {children}
    </div>
  );
}

function HoverLine({
  a,
  label,
  order = "alpha",
}: {
  a: CareerAppearance;
  label: string;
  /** "legend" matches the stacked chart's band order so the readout maps onto it. */
  order?: "alpha" | "legend";
}) {
  // Alphabetical by default so a type sits in the same place on every event. In the
  // stacked view it follows KILL_TYPES instead, which is the band and legend order —
  // otherwise the readout and the chart disagree about sequence. Unclassified is last
  // either way: it is a gap in the data, not a style.
  const breakdown = KILL_TYPES.map((t) => ({ type: t, n: a.types[t] }))
    .filter((t) => t.n > 0)
    .sort((x, y) => {
      if (x.type === "Unclassified") return 1;
      if (y.type === "Unclassified") return -1;
      if (order === "legend") {
        return KILL_TYPES.indexOf(x.type) - KILL_TYPES.indexOf(y.type);
      }
      return x.type.localeCompare(y.type);
    });

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-white/50">
      <span className="font-black text-gray-900 dark:text-white">{label}</span>
      <span>
        <b className="pickem-numeric font-black text-gray-900 dark:text-white">{fmtK(a.kills)}</b> kills
      </span>
      <span>
        Rank <b className="pickem-numeric font-black text-gray-900 dark:text-white">#{a.rank ?? "\u2014"}</b>
      </span>
      <span>{a.team}</span>
      {breakdown.length > 0 && (
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-gray-400 dark:text-white/30">
          {breakdown.map((t) => (
            <span key={t.type}>
              {t.type}{" "}
              <b className="pickem-numeric font-black text-gray-600 dark:text-white/60">{fmtK(t.n)}</b>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Kills across a career as a line.
 *
 * Events are discrete, not a continuum, so every point carries a visible marker —
 * the line shows trajectory, the markers keep it honest about there being eight
 * tournaments rather than a continuous series. The SVG stretches to the container
 * while markers and labels are laid out in HTML, so text stays crisp at any width.
 */
function KillsLine({
  appearances,
  maxKills,
  avgKills,
  hovered,
  onHover,
}: {
  appearances: (CareerAppearance & { label: string })[];
  maxKills: number;
  avgKills: number;
  hovered: string | null;
  onHover: (id: string | null) => void;
}) {
  const H = 170;
  const PAD = 26; // headroom for the value labels that sit above each point
  const y = (k: number) => H - PAD - (k / maxKills) * (H - PAD * 2);
  const n = appearances.length;
  // Inset the x-scale: at 0% and 100% the endpoint markers would hang outside the
  // panel's padding, breaking alignment with everything else on the page.
  const INSET = 4;
  const span = 100 - INSET * 2;
  const step = n > 1 ? span / (n - 1) : 0;
  const xAt = (i: number) => (n > 1 ? INSET + i * step : 50);
  /**
   * A missed event has no kill count to plot, so the line breaks there rather than
   * dropping to zero — a point on the axis would read as "turned up and scored
   * nothing", which is the claim this whole model exists to stop making.
   *
   * The event keeps its slot on the x-axis and its label; only the value is absent.
   */
  const pts = appearances.map((a, i) => ({
    x: xAt(i),
    y: missedEvent(a) ? null : y(a.kills),
    a,
  }));
  const segments = lineSegments(n, (i) => pts[i].y, xAt);
  // One filled area per unbroken run, so the shading breaks with the line.
  const areas = segments.map(
    (seg) =>
      `${seg[0].split(",")[0]},${H} ${seg.join(" ")} ${seg[seg.length - 1].split(",")[0]},${H}`,
  );

  return (
    <div className="mt-6">
      <div className="relative" style={{ height: H }}>
        <svg
          viewBox={`0 0 100 ${H}`}
          preserveAspectRatio="none"
          className={cn("absolute inset-0 h-full w-full", LINE_INK)}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="killsFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line
            x1="0" x2="100" y1={y(avgKills)} y2={y(avgKills)}
            stroke="currentColor"
            className="text-gray-300 dark:text-white/15"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          {areas.map((a) => (
            <polygon key={`a${a.slice(0, 12)}`} points={a} fill="url(#killsFade)" />
          ))}
          {segments.map((seg) => (
            <polyline
              key={`l${seg[0]}`}
              points={seg.join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* Full-height hit columns with a guide line — same interaction as the PickEm
            chart. Hovering only the 9px dot made the chart feel unresponsive. */}
        {pts.map(({ x, y: py, a }, i) => {
          const on = hovered === a.eventId;
          const colWidth = n > 1 ? (100 - INSET * 2) / (n - 1) : 100;
          return (
            <button
              key={a.eventId}
              type="button"
              className="absolute top-0 h-full -translate-x-1/2 outline-none"
              style={{ left: `${x}%`, width: `${Math.max(colWidth, 6)}%` }}
              onMouseEnter={() => onHover(a.eventId)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(a.eventId)}
              onBlur={() => onHover(null)}
              aria-label={
                py == null
                  ? `${a.label}: ${absenceWord(a)}`
                  : `${a.label}: ${fmtK(a.kills)} kills, rank ${a.rank ?? "unranked"}`
              }
            >
              {on && (
                <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-300 dark:bg-white/15" />
              )}
              {py != null ? (
                <>
                  <span
                    className={cn(
                      "absolute left-1/2 -translate-x-1/2 -translate-y-1/2 block rounded-full transition-all",
                      on ? "h-[13px] w-[13px]" : "h-[9px] w-[9px]",
                      "bg-[#1a3c6e] dark:bg-[#00f976]",
                    )}
                    style={{ top: `${(py / H) * 100}%` }}
                  />
                  <span
                    className={cn(
                      "pickem-numeric absolute whitespace-nowrap text-[13px] font-black transition-colors",
                      on ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-white/60",
                    )}
                    style={{ left: "50%", top: `${(py / H) * 100}%`, transform: "translate(-50%, -180%)" }}
                  >
                    {fmtK(a.kills)}
                  </span>
                </>
              ) : (
                // Sits on the baseline so the gap is legible as an absence rather than
                // reading as a rendering failure.
                <span
                  className={cn(
                    "absolute left-1/2 -translate-x-1/2 font-azonix text-[9px] tracking-wide transition-colors",
                    on ? "text-gray-500 dark:text-white/50" : "text-gray-300 dark:text-white/25",
                  )}
                  style={{ top: `${((H - PAD) / H) * 100}%` }}
                >
                  DNP
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="relative mt-2 h-4">
        {appearances.map((a, i) => (
          <div
            key={a.eventId}
            className="absolute -translate-x-1/2 text-center"
            style={{ left: `${xAt(i)}%` }}
          >
            <div className={cn(LABEL, "whitespace-nowrap")}>{a.shortLabel}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Playing style as a donut — every kill type gets its own segment.
 *
 * COLOUR IS FIXED PER TYPE, never by rank. Otherwise the brightest slice would mean
 * "this player's biggest" rather than a named type, and two players' charts could not
 * be compared — which is the point of the panel.
 *
 * Segments run in KILL_TYPES order and take their colour from the same map as the
 * stacked chart — NOT ordered or coloured by size. A category therefore sits in the same
 * position and the same colour in every chart on the page, so only the magnitude varies
 * between players. That is what makes two players comparable at a glance.
 *
 * `Unclassified` is excluded: it is not a playing style, it is kills nobody categorised.
 * It is reported underneath as a data-quality note instead.
 */

const FALLBACK_COLOUR = "#9ca3af";

const INK_DARK = "#1f2937";
const INK_LIGHT = "#ffffff";

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Whichever of dark/light ink actually contrasts better with the fill.
 * The palette spans light teal to dark green, so a single luminance threshold picks
 * wrong on the mid-tones — compare the real contrast ratios instead.
 */
function inkOn(hex: string): string {
  const L = luminance(hex);
  const ratio = (a: number, b: number) =>
    (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return ratio(L, luminance(INK_DARK)) >= ratio(L, luminance(INK_LIGHT))
    ? INK_DARK
    : INK_LIGHT;
}

function StyleDonut({
  totals,
  accessible = false,
  dark = false,
}: {
  totals: { type: string; total: number; share: number }[];
  /** Swaps the rank-ordered navy ramp for fixed, high-contrast colours per type. */
  accessible?: boolean;
  /** Palettes are chosen per theme, not flipped — see `typePalette`. */
  dark?: boolean;
}) {
  /** Below this share the arc is shorter than the text that would sit in it. */
  const INLINE_MIN = 7;

  const palette = typePalette(dark, accessible);
  const unclassified = totals.find((t) => t.type === "Unclassified");

  // Canonical category order, matching the stacked chart's bands and legend.
  const styles = totals
    .filter((t) => t.type !== "Unclassified")
    .sort(
      (a, b) =>
        KILL_TYPES.indexOf(a.type as KillType) - KILL_TYPES.indexOf(b.type as KillType),
    );

  // Re-base shares over real styles only, so the ring still sums to 100%.
  const styleTotal = styles.reduce((a, t) => a + t.total, 0) || 1;
  const segments = styles.map((t) => {
    const colour = palette[t.type] ?? FALLBACK_COLOUR;
    return { ...t, share: (t.total / styleTotal) * 100, colour, ink: inkOn(colour) };
  });

  // The centre still names the biggest type — that is a finding, not an ordering.
  const dominant = segments.reduce(
    (a, b) => (b.total > a.total ? b : a),
    segments[0] ?? { type: "", total: 0, share: 0, colour: FALLBACK_COLOUR, ink: "#fff" },
  );
  // Outer edge sits at R + BAND/2, which must stay inside the 100-unit viewBox or the
  // ring is clipped flat where it overflows.
  const R = 38;
  const BAND = 20;
  const C = 2 * Math.PI * R;

  let cumulative = 0;
  const placed = segments.map((seg) => {
    const midShare = cumulative + seg.share / 2;
    cumulative += seg.share;
    // svg is rotated -90deg so 0% sits at the top; mirror that for the html overlay
    const rad = ((midShare / 100) * 360 - 90) * (Math.PI / 180);
    return { ...seg, left: 50 + Math.cos(rad) * R, top: 50 + Math.sin(rad) * R };
  });

  let offset = 0;

  return (
    <div className="mt-3">
      <div className="relative mx-auto h-[236px] w-[236px]">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
          {segments.map((seg) => {
            const len = (seg.share / 100) * C;
            const arc = (
              <circle
                key={seg.type}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={seg.colour}
                strokeWidth={BAND}
                strokeDasharray={`${Math.max(len - 1.5, 0)} ${C - Math.max(len - 1.5, 0)}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return arc;
          })}
        </svg>

        {placed
          .filter((seg) => seg.share >= INLINE_MIN)
          .map((seg) => (
            <div
              key={seg.type}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 pickem-numeric text-[13px] font-black leading-none"
              style={{ left: `${seg.left}%`, top: `${seg.top}%`, color: seg.ink }}
            >
              {Math.round(seg.share)}%
            </div>
          ))}

        {/* the insight, not a number the hero already shows */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
          <div className="text-[15px] font-black uppercase leading-tight tracking-tight text-gray-900 dark:text-white">
            {dominant?.type ?? "—"}
          </div>
          <div
            className="mt-1 text-[20px] font-black leading-none pickem-numeric"
            style={{ color: dominant?.colour ?? FALLBACK_COLOUR }}
          >
            {Math.round(dominant?.share ?? 0)}%
          </div>
        </div>
      </div>

      {/* legend runs in the same order as the ring, so segments can be matched by
          position as well as colour */}
      <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-1 border-t border-gray-200/70 pt-4 dark:border-white/5">
        {segments.map((seg) => (
          <div key={seg.type} className="flex items-center gap-2">
            <span
              className="h-2 w-2 flex-none rounded-[2px]"
              style={{ backgroundColor: seg.colour }}
            />
            <span className="min-w-0 flex-1 truncate text-[11px] text-gray-500 dark:text-white/40">
              {seg.type}
            </span>
            <span className="pickem-numeric text-[11px] font-bold text-gray-500 dark:text-white/40">
              {Math.round(seg.share)}%
            </span>
          </div>
        ))}
      </div>

      {unclassified && unclassified.total > 0 && (
        <p className="mt-3 text-[11px] text-gray-400 dark:text-white/30">
          ({Math.round((unclassified.total / (styleTotal + unclassified.total)) * 100)}% of kills
          unclassified)
        </p>
      )}
    </div>
  );
}

/**
 * A season average with its change against the previous season.
 *
 * `higherIsBetter` drives the colour: false inverts it (a rising cost per kill is worse),
 * null withholds judgement entirely — pick % going up is neither good nor bad, so the
 * arrow shows direction while the colour stays neutral.
 */
function SeasonStat({
  label,
  value,
  delta,
  prevSeason,
  format,
  higherIsBetter,
  align = "left",
  note,
}: {
  label: string;
  value: string;
  delta: number | null;
  prevSeason: string | null;
  format: (v: number) => string;
  higherIsBetter: boolean | null;
  align?: "left" | "right";
  /** How many events stand behind the average, when that is fewer than were played. */
  note?: string;
}) {
  const right = align === "right";
  const up = delta != null && delta > 0;
  const flat = delta == null || Math.abs(delta) < 0.005;
  const good = higherIsBetter === null ? null : up === higherIsBetter;
  // No value at all is not the same as an unchanged one — "no change vs 2025" against a
  // dash would claim a comparison that was never made.
  const missing = value === "—";

  return (
    <div className={cn(right && "text-right")}>
      <div className={LABEL}>{label}</div>
      <div className="pickem-numeric mt-1.5 text-[30px] font-black leading-none text-gray-900 dark:text-white">
        {value}
      </div>
      {missing || flat ? (
        <div className={cn(LABEL, "mt-1.5 text-gray-300 dark:text-white/20")}>
          {missing
            ? "no scoring events"
            : prevSeason
              ? `no change vs ${prevSeason}`
              : "no prior season"}
        </div>
      ) : (
        <div className={cn("mt-1.5 flex items-baseline gap-1.5", right && "justify-end")}>
          <span
            className={cn(
              "pickem-numeric text-[12px] font-black",
              good === null
                ? "text-gray-500 dark:text-white/50"
                : good
                  ? "text-emerald-600 dark:text-[#00e689]"
                  : "text-red-500 dark:text-red-400",
            )}
          >
            {up ? "▲" : "▼"} {format(delta as number)}
          </span>
          <span className={cn(LABEL, "text-gray-400 dark:text-white/30")}>vs {prevSeason}</span>
        </div>
      )}
      {note && (
        <div className={cn(LABEL, "mt-1 text-gray-400 dark:text-white/30")}>{note}</div>
      )}
    </div>
  );
}

/** Round an axis maximum up to a readable value, with a sensible floor. */
function niceCeiling(v: number): number {
  if (v <= 10) return 10;
  const step = v > 50 ? 10 : 5;
  return Math.ceil(v / step) * step;
}

/**
 * Fixed colour per kill type for the stacked view.
 *
 * A band must mean the same type at every event, so these are assigned by type — not by
 * size as the donut does. One navy ramp rather than seven hues: at this many bands
 * distinct hues stop being separable, and stacking order plus the legend carry identity.
 * `Unclassified` is grey because it is a gap in the data, not a style.
 */
const STACK_COLOURS: Record<string, string> = {
  Gunfights: "#12294a",
  Breakshooting: "#1a3c6e",
  Movement: "#245290",
  "Zone Coverage": "#2f6bb0",
  Pressure: "#4a8bcd",
  Trades: "#6ea9d4",
  Unclassified: "#9ca3af",
};

/**
 * Dark-mode ramp. NOT an automatic flip of the navy — its own steps, on the brand
 * green, validated against the dark panel.
 *
 * The navy ramp is unusable here: on `#1c1917` its two darkest steps sit at 1.20:1
 * and 1.60:1, so the largest categories on most players' charts read as black. This
 * runs bright→dim instead, because on a dark surface it is the light end that is
 * prominent. All four ordinal checks pass (monotone L, ΔL ≥ 0.06, pale end 2.98:1,
 * hue spread 3°).
 */
const STACK_COLOURS_DARK: Record<string, string> = {
  Gunfights: "#137349",
  Breakshooting: "#12945f",
  Movement: "#14b878",
  "Zone Coverage": "#1fdd92",
  Pressure: "#5cf5b0",
  Trades: "#b6ffd9",
  Unclassified: "#6b7280",
};/** Kills split by type across a career, stacked so the total still reads as the outline. */
function KillsStacked({
  appearances,
  hovered,
  onHover,
  accessible = false,
  dark = false,
}: {
  appearances: (CareerAppearance & { label: string })[];
  hovered: string | null;
  onHover: (id: string | null) => void;
  accessible?: boolean;
  /** Palettes are chosen per theme, not flipped — see `typePalette`. */
  dark?: boolean;
}) {
  const palette = typePalette(dark, accessible);
  const H = 170;
  const PAD = 26;
  const INSET = 4;
  const n = appearances.length;
  const xAt = (i: number) => (n > 1 ? INSET + i * ((100 - INSET * 2) / (n - 1)) : 50);

  const active = KILL_TYPES.filter((t) => appearances.some((a) => a.types[t] > 0));
  const maxTotal = Math.max(...appearances.map((a) => a.kills), 1);
  const yAt = (v: number) => H - PAD - (v / maxTotal) * (H - PAD * 2);

  // Cumulative boundaries per event, so each band is the gap between two running totals.
  const cumulative = appearances.map((a) => {
    let running = 0;
    return active.map((t) => {
      const from = running;
      running += a.types[t];
      return { from, to: running };
    });
  });

  /**
   * Runs of consecutive events the player actually played.
   *
   * Bands are drawn per run rather than across the whole series: at a missed event
   * every type is zero, so an unbroken polygon would pinch to the baseline and read
   * as "played and scored nothing" — the claim this model exists to prevent.
   */
  const runs: number[][] = [];
  let run: number[] = [];
  appearances.forEach((a, i) => {
    if (missedEvent(a)) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(i);
  });
  if (run.length) runs.push(run);

  // A lone played event between two absences has no neighbour to span to, so it gets a
  // narrow band of its own rather than a zero-width polygon that renders as nothing.
  const SOLO = 1.4;

  return (
    <div className="mt-6">
      <div className="relative" style={{ height: H }}>
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {runs.map((idxs, ri) =>
            active.map((t, ti) => {
              const xs =
                idxs.length === 1
                  ? [xAt(idxs[0]) - SOLO, xAt(idxs[0]) + SOLO]
                  : idxs.map((i) => xAt(i));
              const src = idxs.length === 1 ? [idxs[0], idxs[0]] : idxs;
              const top = src.map((i, k) => `${xs[k]},${yAt(cumulative[i][ti].to)}`);
              const bottom = src
                .map((i, k) => `${xs[k]},${yAt(cumulative[i][ti].from)}`)
                .reverse();
              return (
                <polygon
                  key={`${ri}-${t}`}
                  points={[...top, ...bottom].join(" ")}
                  fill={palette[t] ?? "#9ca3af"}
                  stroke="none"
                />
              );
            }),
          )}
        </svg>

        {appearances.map((a, i) => {
          const on = hovered === a.eventId;
          const colWidth = n > 1 ? (100 - INSET * 2) / (n - 1) : 100;
          return (
            <button
              key={a.eventId}
              type="button"
              className="absolute top-0 h-full -translate-x-1/2 outline-none"
              style={{ left: `${xAt(i)}%`, width: `${Math.max(colWidth, 6)}%` }}
              onMouseEnter={() => onHover(a.eventId)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(a.eventId)}
              onBlur={() => onHover(null)}
              aria-label={
                missedEvent(a)
                  ? `${a.label}: ${absenceWord(a)}`
                  : `${a.label}: ${fmtK(a.kills)} kills by type`
              }
            >
              {on && <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/70" />}
              <span
                className={cn(
                  "pickem-numeric absolute whitespace-nowrap text-[13px] font-black transition-colors",
                  on ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-white/60",
                )}
                style={{ left: "50%", top: `${(yAt(a.kills) / H) * 100}%`, transform: "translate(-50%, -180%)" }}
              >
                {fmtK(a.kills)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative mt-2 h-4">
        {appearances.map((a, i) => (
          <div
            key={a.eventId}
            className={cn(LABEL, "absolute -translate-x-1/2 whitespace-nowrap")}
            style={{ left: `${xAt(i)}%` }}
          >
            {a.shortLabel}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {active.map((t) => (
          <span key={t} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: palette[t] }} />
            <span className={LABEL}>{t}</span>
          </span>
        ))}
      </div>
    </div>
  );
}


/**
 * One row of the event table: a league event, with PickEm's numbers where they exist.
 *
 * THE TABLE IS THE WHOLE CAREER NOW, not just the eight events PickEm scores. Those
 * eight carry kills, cost and pick %; the other forty-odd carry a result and nothing
 * else, and their PickEm columns render as dashes rather than zeroes. A zero is a
 * measurement — "took the field and scored nothing" — and printing one for a 2017
 * tournament we never tracked would be inventing a result.
 */
interface TimelineRow {
  key: string;
  label: string;
  shortLabel: string;
  year: string;
  team: string;
  teamId: string | null;
  record: TeamEventRecord | null;
  /** ISO date, for ordering. */
  start: string;
  /** Null for a league event PickEm does not score. */
  pickem: (CareerAppearance & { label: string }) | null;
}

/**
 * One row of the match table, from either source.
 *
 * `pickem` carries the kill breakdown and is null for a league event PickEm does not
 * score — those rows show a result and dashes across every kill column.
 */
interface CareerMatch {
  key: string;
  /** A PickEm event id, or a league event key like "2019|NXL Texas Open". */
  eventKey: string;
  round: string;
  opponent: string;
  opponentId: string | null;
  result: "W" | "L" | "T" | null;
  scoreFor: number | null;
  scoreAgainst: number | null;
  pickem: (PlayerMatch & { eventId: string }) | null;
}

/**
 * Tournament order for sorting, across BOTH vocabularies.
 *
 * Our long data labels prelims by day and knockouts by bracket size; the league labels
 * prelims by group and knockouts by name. A career table interleaves both, so one
 * ordering has to understand each — anything unrecognised sorts as a group game, which
 * is what an unfamiliar label almost always is.
 */
const ROUND_RANK: Record<string, number> = {
  Thursday: 0, Friday: 1, Saturday: 2, Sunday: 3,
  "A Prelims": 0, "B Prelims": 1, "C Prelims": 2, "D Prelims": 3, "E Prelims": 4,
  Wildcard: 5, Ochos: 5,
  Top8: 6, Quarters: 6,
  Top4: 7, Semifinals: 7,
  Finals: 8, Final: 8,
};
const roundRankOf = (r: string) => ROUND_RANK[r] ?? 0;

/**
 * "NXL Mid Atlantic Major" -> "Mid Atlantic · 19".
 *
 * The league prefix and the tier word both go. "Major" and "Open" describe a ranking
 * status that changed between seasons for the same tournament — Windy City was a Major
 * in 2023 and an Open in 2024 — so they say nothing about WHICH event a row is, while
 * costing enough width to wrap the column onto two lines and double the row height.
 *
 * Checked across all 51 events: no two events in any single year collapse to the same
 * name once they are removed.
 */
const stripEventTier = (label: string) =>
  label.replace(/^NXL\s+/i, "").replace(/\s+(Major|Open)\b/gi, "").trim();

const nxlEventLabel = (label: string, year: string) =>
  `${stripEventTier(label)} \u00b7 ${year.slice(2)}`;

/**
 * Initials plus the year, for the phone column — "Mid-Atlantic Major · 19" -> "MM 19".
 *
 * Deliberately not `eventAxisLabel`: that derives its initials from a canonical PickEm
 * location, and these events have no PickEm identity to look up.
 */
const nxlShortLabel = (label: string, year: string) => {
  const initials = label
    // The tier word is KEPT here, unlike the full label: initials are lossy enough
    // already, and without it "World Cup" and "Windy City Open" both become "WC" in the
    // same season. "WCO" against "WC" is the whole difference.
    .replace(/^NXL\s+/i, "")
    .split(/[\s-]+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .map((w) => w[0].toUpperCase())
    .join("")
    .slice(0, 3);
  return `${initials} ${year.slice(2)}`;
};

/**
 * "2015-2026", or just "2025" for a single season.
 *
 * A range whose ends are equal reads as a mistake — "2025-2025" is the kind of detail
 * that makes a reader distrust the numbers beside it.
 */
const yearSpan = (from: string | null, to: string | null) =>
  from && to && from !== to ? `${from}\u2013${to}` : (to ?? from ?? "\u2014");


/**
 * A record needs at least two seasons before it has a SHAPE.
 *
 * With one season the chart is a single full-width bar, which reads as a progress meter
 * rather than a trend, and the readout underneath calls it the "best season" of one.
 * The hero already states the totals for those players, so the panel simply does not
 * render — there is nothing it could add.
 */
const NXL_PANEL_MIN_SEASONS = 2;

/**
 * One season of a player's league record, folded up from its events.
 *
 * PER SEASON, NOT PER EVENT — and this is the whole design decision in the panel.
 * A career runs to fifty tournaments of roughly seven matches each, so a per-event
 * win rate moves in steps of 14 points and the line reads as noise: a 4-3 event and a
 * 5-2 event look like a collapse and a peak. Seasons carry 25-35 matches, which is
 * enough for the number to mean something, and twelve points fit on an axis a person
 * can actually read. The events are still there — they are what the hover shows.
 */
interface NxlSeason {
  year: string;
  events: number;
  w: number;
  l: number;
  winPct: number | null;
  titles: number;
  topFours: number;
  clubs: string[];
}

function seasonsOf(events: NxlEvent[]): NxlSeason[] {
  const byYear = new Map<string, NxlEvent[]>();
  for (const e of events) {
    if (!byYear.has(e.year)) byYear.set(e.year, []);
    byYear.get(e.year)!.push(e);
  }
  return Array.from(byYear.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, evs]: [string, NxlEvent[]]) => {
      const w = evs.reduce((a, e) => a + e.w, 0);
      const l = evs.reduce((a, e) => a + e.l, 0);
      return {
        year,
        events: evs.length,
        w,
        l,
        winPct: w + l > 0 ? (w / (w + l)) * 100 : null,
        titles: evs.filter((e) => e.finishRank === 1).length,
        topFours: evs.filter((e) => e.finishRank != null && e.finishRank <= 3).length,
        clubs: Array.from(new Set(evs.map((e) => e.club))),
      };
    });
}

/**
 * The league record over time.
 *
 * SEPARATE PANEL, AND SEPARATE ON PURPOSE. Everything else on this page is measured
 * over the eight events PickEm scores. This is measured over every NXL event since
 * 2015, and the two must never be read as one series — which is why it does not share
 * an axis with the kills chart, does not sit inside the same panel, and names its own
 * span in the heading.
 *
 * A TEAM RECORD ON A PLAYER'S PAGE. The line is what the player's teams did at the
 * tournaments the player was at. It is not a measure of individual contribution and
 * the caption says so, because a page that quietly implies otherwise is worse than one
 * that shows nothing.
 */
function NxlRecordPanel({ nxl }: { nxl: NxlCareer }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const seasons = seasonsOf(nxl.events);

  /**
   * BARS, NOT A LINE — and this is the one decision in the panel worth defending.
   *
   * It was a line first, and in dark mode the result was two green area charts stacked
   * one above the other: this panel and "Kills by event" directly below it, same mark,
   * same fill, same colour, same height. A reader scrolling past reads them as one
   * series in two halves, which is precisely the conflation the whole two-scope design
   * exists to prevent — one covers twelve seasons of team results, the other eight
   * events of this player's kills.
   *
   * Bars also fit the quantity better than a line did. Seasons are discrete and a win
   * rate is a bounded proportion, so a bar from the floor is the honest mark; a line
   * implies a continuum between 2019 and 2020 that does not exist. And it fixes the
   * empty-space problem the fixed 0-100 scale caused for free: a bar occupies its own
   * value rather than leaving the bottom of the panel blank.
   */
  const PLOT = 104;
  const active = seasons.find((sn) => sn.year === hovered) ?? null;
  /**
   * Reserve the trophy row for the WHOLE chart, or for none of it.
   *
   * Per-bar it would ripple the bar tops out of line. Always-on it left a 13px band of
   * nothing above every chart belonging to a player who has never won a tournament —
   * which is most of them, and exactly the readers for whom empty space reads as
   * something failing to load.
   */
  const anyTitles = seasons.some((sn) => sn.titles > 0);

  return (
    <section className={cn(PANEL, "mt-3.5 p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={SECTION_HEADING}>NXL record</h2>
          {/*
            The caption does two jobs and both are load-bearing: it states the span,
            because this panel alone covers more than a decade while the rest of the
            page covers eight events; and it states that the record belongs to the
            team, because "76%" beside a portrait will otherwise be read as the
            player's own.
          */}
          <p className="mt-2.5 max-w-[62ch] text-[11px] leading-relaxed text-gray-500 dark:text-white/40">
            Match win rate by season, from the league&rsquo;s own results,{" "}
            {yearSpan(nxl.firstYear, nxl.lastYear)}. These are the results of the{" "}
            <b className="font-bold text-gray-700 dark:text-white/60">teams</b> they played
            for, at the tournaments they took the field at &mdash; not a measure of what
            any one player did in a match.
          </p>
        </div>
        {/*
          No stat block here. Tournaments played, tournaments won and the match record
          are the first three tiles of the hero, roughly 400px up the same page, and
          repeating them in smaller type taught a reader nothing while implying the two
          blocks might differ. The panel's job is the SHAPE of the record over time,
          which is the one thing the hero cannot show.
        */}
      </div>

      <div className="mt-5">
        <div className="relative">
          {/* An even record. The one reference line that means something here, drawn
              over the bars so a season can be read as above or below it at a glance. */}
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-gray-400/50 dark:border-white/20"
            style={{ bottom: PLOT / 2 }}
          />
          <div className="flex items-end gap-1 sm:gap-2">
            {seasons.map((sn) => {
              const on = hovered === sn.year;
              const pct = sn.winPct ?? 0;
              return (
                <button
                  key={sn.year}
                  type="button"
                  className="group flex flex-1 flex-col justify-end outline-none"
                  onMouseEnter={() => setHovered(sn.year)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(sn.year)}
                  onBlur={() => setHovered(null)}
                  aria-label={`${sn.year}: ${sn.w} won, ${sn.l} lost across ${sn.events} tournaments${sn.titles ? `, ${sn.titles} won` : ""}`}
                >
                  {/* A trophy over the seasons that produced a title, matching the one
                      on the event table so the glyph means the same thing in both
                      places. The count rides along when a season produced more than
                      one, which a single mark would flatten. */}
                  {anyTitles && (
                    <span className="mb-0.5 block h-[13px] text-[10px] leading-none">
                      {sn.titles > 0 && (
                        <span className="pickem-numeric font-black text-gray-600 dark:text-white/60">
                          <span aria-hidden="true">🏆</span>
                          {sn.titles > 1 && sn.titles}
                        </span>
                      )}
                    </span>
                  )}
                  <span
                    className={cn(
                      "pickem-numeric mb-1 block text-center text-[11px] font-black leading-none transition-colors",
                      on ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-white/50",
                    )}
                  >
                    {sn.winPct != null ? `${sn.winPct.toFixed(0)}%` : "\u2014"}
                  </span>
                  <span
                    className={cn(
                      "block w-full rounded-t-[2px] transition-colors",
                      on
                        ? "bg-[#1a3c6e] dark:bg-[#00f976]"
                        : "bg-[#1a3c6e]/70 dark:bg-[#00f976]/55",
                    )}
                    style={{ height: Math.max((pct / 100) * PLOT, 2) }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-1.5 flex gap-1 sm:gap-2">
          {seasons.map((sn) => (
            <span
              key={sn.year}
              className={cn(
                "pickem-numeric flex-1 text-center text-[10px] font-bold transition-colors",
                hovered === sn.year
                  ? "text-gray-900 dark:text-white"
                  : "text-gray-400 dark:text-white/35",
              )}
            >
              {sn.year.slice(2)}
            </span>
          ))}
        </div>
      </div>

      {/* Fixed-height readout so the panel does not jump as the pointer crosses it.
          With nothing hovered it names the best season, which is the thing a reader
          would otherwise hunt along the line for. */}
      <div className="mt-4 min-h-[18px] border-t border-gray-200/70 pt-3 dark:border-white/5">
        <SeasonReadout season={active} seasons={seasons} />
      </div>
    </section>
  );
}

function SeasonReadout({
  season,
  seasons,
}: {
  season: NxlSeason | null;
  seasons: NxlSeason[];
}) {
  const ranked = seasons.filter((s) => s.winPct != null);
  const best = ranked.length
    ? ranked.reduce((a, b) => (b.winPct! > a.winPct! ? b : a))
    : null;
  const sn = season ?? best;
  if (!sn) return null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-white/50">
      <span className="font-black text-gray-900 dark:text-white">
        {season ? sn.year : `Best season · ${sn.year}`}
      </span>
      <span>
        <b className="pickem-numeric font-black text-gray-900 dark:text-white">
          {sn.w}&ndash;{sn.l}
        </b>{" "}
        {sn.winPct != null && `(${sn.winPct.toFixed(0)}%)`}
      </span>
      <span>
        <b className="pickem-numeric font-black text-gray-900 dark:text-white">{sn.events}</b>{" "}
        {sn.events === 1 ? "tournament" : "tournaments"}
      </span>
      {sn.titles > 0 && (
        <span className="font-bold text-[#1a3c6e] dark:text-[#00f976]">
          {sn.titles} won
        </span>
      )}
      {sn.titles === 0 && sn.topFours > 0 && (
        <span>
          <b className="pickem-numeric font-black text-gray-900 dark:text-white">{sn.topFours}</b>{" "}
          top-four finish{sn.topFours === 1 ? "" : "es"}
        </span>
      )}
      <span className="text-gray-400 dark:text-white/30">{sn.clubs.join(", ")}</span>
    </div>
  );
}

