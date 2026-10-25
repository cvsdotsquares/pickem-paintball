"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IoMdClose } from "react-icons/io";
import { genUrl, toneClass } from "./generatorTypes";
import { pill, primaryButton, sectionLabel } from "./types";

/**
 * Social calendar (the Social hub's Calendar tab, James 25 Oct 2026): every post of an event with its preview, Month
 * and Week. It used to be the whole Schedule (posts + the agents' work + James's tasks, Lanes, Agenda) and got crowded;
 * the team's calendar is now the Schedule tab as bullet points (TeamSchedule.tsx), and this page is posts only.
 * Placeholders (no template yet) are greyed out; templated ones (signed off, waiting on data) are dashed. The "needs
 * you" strip lists the posts only James can move. The left tray is every post not on the calendar yet, grouped by
 * type ("Spread these" lays a whole group over a date range). Click a post for its panel: the path behind it
 * (data → populate → approve → post) and Approve. Approved posts go out on Instagram + Facebook by themselves (cloud
 * job, every 5 min). Times are US Eastern. Plan: pickem-hub/ideas/2026-10-17-scheduler-plan.md.
 * TaskDrawer / TaskDialog (agent work and James's tasks) are exported for the Schedule tab.
 */

type Check = { level: "block" | "warn"; text: string };
export type Agent = { id: string; name: string; icon: string; colour: string; blurb: string; kind?: "agent" | "job"; parent?: string; enabled?: boolean };
type PathStep = { label: string; agent: string; state: "done" | "now" | "next" | "blocked"; when: string };
export type Slot = {
  id: string;
  kind: "post" | "work" | "action";
  agent: string;
  duration: number;
  event: string;
  type: string;
  variant: string;
  title: string;
  status: "draft" | "approved" | "sending" | "posted" | "failed" | "planned" | "done";
  publishAt: string | null;
  caption: string;
  slides: string[];
  notes: string;
  approvedAt: string | null;
  result: { instagram?: { permalink: string }; facebook?: { permalink: string } } | null;
  error: string;
  label: string;
  graphic: string;
  phase: string;
  priority: string;
  stage: string;
  placeholder: boolean;
  templated: boolean;
  preview: string[];
  data: { source: string; madeAt: string; test: boolean; typed: Record<string, string>; waiting: { label: string; hint: string }[] };
  variants: { key: string; name: string; png: string; caption: string }[];
  checks: Check[];
  link: string;
  path: PathStep[];
};
type TrayItem = { type: string; variant: string; title: string; label: string; phase: string; priority: string; png: string; placeholder: boolean; templated: boolean };
type NeedsYou = { id: string; text: string; due: string | null; tone: "orange" | "red" };
type Data = {
  event: string;
  events: { id: string; label: string }[];
  agents: Agent[];
  needsYou: NeedsYou[];
  slots: Slot[];
  tray: TrayItem[];
  dates: { date: string; label: string }[];
  posts: { png: string; title: string }[];
  error?: string;
};
type Mode = "month" | "week";
export type Act = (body: Record<string, unknown>, confirmText?: string) => Promise<string | boolean>;

const TZ = "America/New_York";
const DEFAULT_TIME = "12:00";
const TIMES = ["09:00", "12:00", "15:00", "18:00", "20:00"];
const field =
  "w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-gray-400 dark:border-white/10 dark:bg-white/5";

/** ISO → US Eastern date + time ("2026-11-12", "08:00"). */
/** ET wall time ("2026-11-02", "09:00") → an ISO instant, right across the clock change. */
function etToISO(day: string, time: string): string {
  const guess = Date.parse(`${day}T${time}:00Z`);
  const w = et(new Date(guess).toISOString());
  return new Date(guess - (Date.parse(`${w.date}T${w.time}:00Z`) - guess)).toISOString();
}

/**
 * A repeating job has one slot, on its first day; its notes carry `to:YYYY-MM-DD` (James 24 Oct 2026). Draw it again
 * on every later day up to then, same ET time, as a copy: id `<slot id>~<day>`, opens the real slot, can't be dragged.
 */
function withRepeats(slots: Slot[]): Slot[] {
  const out: Slot[] = [];
  for (const s of slots) {
    out.push(s);
    const to = s.kind !== "post" && s.publishAt ? (s.notes ?? "").match(/\bto:(\d{4}-\d{2}-\d{2})/)?.[1] : undefined;
    if (!to || !s.publishAt) continue;
    const { date, time } = et(s.publishAt);
    for (let d = addDays(date, 1), n = 0; d <= to && n < 120; d = addDays(d, 1), n++) {
      out.push({ ...s, id: `${s.id}~${d}`, publishAt: etToISO(d, time), status: "planned" });
    }
  }
  return out;
}
const realId = (id: string) => id.split("~")[0];

function et(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
const nice = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};
const local = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const todayET = () => et(new Date().toISOString()).date;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(`${s}T12:00:00`);
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
/** Monday on or before the date (weeks start on Monday). */
const monday = (s: string) => addDays(s, -((parse(s).getDay() + 6) % 7));
const dayLabel = (s: string, long = false) => parse(s).toLocaleDateString("en-GB", long ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "short" });
const dueText = (iso: string | null) => {
  if (!iso) return "";
  const { date, time } = et(iso);
  const today = todayET();
  return `${date === today ? "today" : date === addDays(today, 1) ? "tomorrow" : dayLabel(date)} ${nice(time)}`;
};

/** Templated gets its own light-blue tone; the rest are the panel's (orange = your turn, blue = scheduled, green = done, red = failed). */
const tone = (t: string) => (t === "templated" ? "bg-[#39b5e6]/20 text-[#1a3c6e] dark:text-[#39b5e6]" : toneClass(t));

function statusPill(s: Slot): { label: string; tone: string } {
  if (s.kind !== "post") return s.status === "done" ? { label: "Done ✓", tone: "green" } : s.kind === "action" ? { label: "For you", tone: "orange" } : { label: "Planned", tone: "grey" };
  if (s.templated) return { label: "Templated", tone: "templated" };
  if (s.placeholder) return { label: "Not made yet", tone: "grey" };
  if (s.status === "draft") return { label: s.checks.some((c) => c.level === "block") ? "Blocked" : "Needs approval", tone: "orange" };
  if (s.status === "approved") return { label: "Scheduled", tone: "blue" };
  if (s.status === "sending") return { label: "Sending…", tone: "blue" };
  if (s.status === "posted") return { label: "Posted ✓", tone: "green" };
  return { label: "Failed", tone: "red" };
}
const dot: Record<string, string> = { grey: "bg-gray-300", templated: "bg-[#39b5e6]", orange: "bg-orange-500", blue: "bg-[#1a3c6e]", green: "bg-green-600", red: "bg-red-500" };
const LEGEND: [string, string][] = [
  ["grey", "Not made yet / planned"],
  ["templated", "Templated (waiting on data)"],
  ["orange", "Needs you / blocked"],
  ["blue", "Scheduled"],
  ["green", "Posted / done"],
  ["red", "Failed"],
];

const findAgent = (agents: Agent[], id: string): Agent => agents.find((a) => a.id === id) ?? { id, name: id, icon: "•", colour: "#9ca3af", blurb: "" };

export default function SocialCalendar() {
  const [data, setData] = useState<Data | null>(null);
  const [event, setEvent] = useState("");
  const [mode, setMode] = useState<Mode>("month");
  const [anchor, setAnchor] = useState(todayET()); // where to scroll to (‹ › Today, a deep link, a placed post)
  const [jump, setJump] = useState(0); // bumps so "Today" scrolls again even when the anchor is already today
  const [visible, setVisible] = useState(todayET()); // the first day in view, for the heading
  const scroller = useRef<HTMLDivElement>(null);
  const [trayOpen, setTrayOpen] = useState(false); // phone: the tray opens full screen from a button
  const [earlier, setEarlier] = useState(false); // phone list: also show the last two weeks
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<TrayItem | null>(null);
  const [spreading, setSpreading] = useState<{ type: string; label: string; items: TrayItem[] } | null>(null);
  const [legend, setLegend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(
    async (ev = event) => {
      const r = await fetch(`/api/admin/scheduler${ev ? `?event=${ev}` : ""}`);
      const d = (await r.json()) as Data;
      if (d.error) setErr(d.error);
      // posts only (James 25 Oct 2026): the agents' work and James's tasks live on the Schedule tab
      if (d.slots) {
        const posts = new Set(d.slots.filter((s) => s.kind === "post").map((s) => s.id));
        d.slots = d.slots.filter((s) => posts.has(s.id));
        d.needsYou = (d.needsYou ?? []).filter((n) => posts.has(n.id));
      }
      setData(d);
      if (!ev && d.event) setEvent(d.event);
    },
    [event],
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ?slot=<id> (links from the Workflows page's "Approve posts", James 24 Oct 2026): open that slot on its week, once.
  const [deepLinked, setDeepLinked] = useState(false);
  useEffect(() => {
    if (!data || deepLinked) return;
    setDeepLinked(true);
    const id = new URLSearchParams(window.location.search).get("slot");
    const s = id ? data.slots.find((x) => x.id === id) : undefined;
    if (!s) return;
    if (s.publishAt) setAnchor(et(s.publishAt).date);
    setOpen(s.id);
  }, [data, deepLinked]);

  // Keep statuses fresh (Scheduled → Posted ✓) without a reload: every minute, and when the tab comes back.
  useEffect(() => {
    const again = () => document.visibilityState === "visible" && load();
    const t = setInterval(again, 60_000);
    document.addEventListener("visibilitychange", again);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", again);
    };
  }, [load]);

  const act: Act = useCallback(
    async (body, confirmText) => {
      if (confirmText && !window.confirm(confirmText)) return false;
      setBusy(true);
      setErr("");
      try {
        const r = await fetch("/api/admin/scheduler", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json();
        if (j.error) setErr(j.error);
        await load();
        return !j.error ? (j.id as string | undefined) ?? true : false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const agents = useMemo(() => data?.agents ?? [], [data]);
  const byDay = useMemo(() => {
    const m: Record<string, Slot[]> = {};
    for (const s of withRepeats(data?.slots ?? [])) (m[et(s.publishAt).date || "unscheduled"] ??= []).push(s);
    for (const k of Object.keys(m)) m[k].sort((a, b) => (a.publishAt ?? "").localeCompare(b.publishAt ?? ""));
    return m;
  }, [data]);
  const datesByDay = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const d of data?.dates ?? []) (m[d.date] ??= []).push(d.label);
    return m;
  }, [data]);

  /**
   * One continuous timeline (James 25 Oct 2026: scroll on into the next week / month to explore): every day from
   * ~3 months back to ~9 months ahead (further if a post or the anchor is beyond). Week = one column per day, sideways;
   * Month = weeks stacked, downwards. ‹ › and Today jump along it; the heading follows the scroll.
   */
  const COL = 240; // Week view column width (px)
  const days = useMemo(() => {
    const dated = (data?.slots ?? []).map((s) => et(s.publishAt).date).filter(Boolean).sort();
    let from = monday(addDays(todayET(), -91));
    let to = addDays(monday(addDays(todayET(), 7 * 39)), 6);
    for (const d of [anchor, dated[0], dated[dated.length - 1]].filter(Boolean) as string[]) {
      if (d < from) from = monday(addDays(d, -28));
      if (d > to) to = addDays(monday(addDays(d, 28)), 6);
    }
    const out: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }, [data, anchor]);

  // Scroll to the anchor: its week (Week) or the week holding the 1st of its month (Month)
  useEffect(() => {
    const el = scroller.current;
    if (!el || !data) return;
    // Month: the first week that is mostly that month (its Thursday is in it), so 1 Nov on a Sunday doesn't land on October
    const target = mode === "week" ? monday(anchor) : monday(addDays(`${anchor.slice(0, 7)}-01`, 3));
    const cell = el.querySelector<HTMLElement>(`[data-day="${target}"]`);
    if (!cell) return;
    if (mode === "week") el.scrollTo({ left: cell.offsetLeft });
    else el.scrollTo({ top: cell.offsetTop - 28 });
  }, [anchor, jump, mode, data]);

  // The heading follows the scroll: the first day in view
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    if (mode === "week") {
      const d = days[Math.min(days.length - 1, Math.max(0, Math.round(el.scrollLeft / COL)))];
      if (d && d !== visible) setVisible(d);
      return;
    }
    const mondays = Array.from(el.querySelectorAll<HTMLElement>("[data-monday]"));
    const row = mondays.find((m) => m.offsetTop + m.offsetHeight > el.scrollTop + 40) ?? mondays[0];
    const d = row ? addDays(row.dataset.day ?? "", 3) : ""; // the row's Thursday decides its month
    if (d && d !== visible) setVisible(d);
  };
  useEffect(onScroll); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (d: string) => {
    setAnchor(d);
    setJump((n) => n + 1);
  };
  const step = (n: number) => {
    if (mode === "week") return goTo(addDays(monday(visible), 7 * n));
    const d = parse(`${visible.slice(0, 7)}-01`);
    d.setMonth(d.getMonth() + n);
    goTo(ymd(d));
  };
  const heading =
    mode === "month"
      ? parse(`${visible.slice(0, 7)}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
      : `${parse(monday(visible)).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${parse(addDays(monday(visible), 6)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  /** Drop: a tray item lands as a draft at noon ET; a slot keeps its time and moves day. */
  const onDrop = async (day: string, e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;
    const it = JSON.parse(raw) as { tray?: TrayItem; slot?: string };
    if (day < todayET()) return setErr("That day has passed");
    if (it.tray) {
      const id = await act({ action: "add", event, type: it.tray.type, variant: it.tray.variant, at: `${day}T${DEFAULT_TIME}` });
      if (typeof id === "string") setOpen(id);
    } else if (it.slot) {
      const s = data?.slots.find((x) => x.id === it.slot);
      if (!s) return;
      if (s.kind === "post" && s.status !== "draft" && s.status !== "failed") return setErr("Un-approve it first to move it");
      await act({ action: "save", id: s.id, at: `${day}T${et(s.publishAt).time || DEFAULT_TIME}` });
    }
  };

  const slot = data?.slots.find((s) => s.id === realId(open ?? "")) ?? null;
  const today = todayET();
  const needs = data?.needsYou ?? [];
  const [showAllNeeds, setShowAllNeeds] = useState(false);

  /** Phone: days that have posts (or a milestone), from today (or two weeks back), each post a tappable row with its preview. */
  const phoneList = () => {
    const from = earlier ? addDays(today, -14) : today;
    const list = days.filter((d) => d >= from && ((byDay[d] ?? []).length || (datesByDay[d] ?? []).length || d === today));
    return (
      <div className="w-full space-y-3 md:hidden">
        <button onClick={() => setEarlier((v) => !v)} className="text-[12px] text-gray-500 underline dark:text-white/50">
          {earlier ? "Hide the last two weeks" : "Show the last two weeks"}
        </button>
        {list.map((day) => (
          <div key={day} className={`rounded-xl border bg-white p-3 dark:bg-[#0d0d0d] ${day === today ? "border-2 border-gray-900 dark:border-white" : "border-gray-100 dark:border-white/5"} ${day < today ? "opacity-60" : ""}`}>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[13px] font-black">{day === today ? "Today · " : ""}{parse(day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
              {(datesByDay[day] ?? []).map((l) => (
                <span key={l} className="rounded bg-[#00f976]/20 px-1 text-[10px] font-bold text-green-800 dark:text-[#00f976]">{l}</span>
              ))}
            </div>
            {(byDay[day] ?? []).length === 0 && <div className="text-[12px] text-gray-400">No posts</div>}
            <div className="space-y-2">
              {(byDay[day] ?? []).map((s) => (
                <SlotChip key={s.id} s={s} agents={agents} size="row" onClick={() => setOpen(s.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  /** One day: its date, milestones and posts; a drop target for the tray and for moving a post. */
  const dayCell = ({ day, past, other, big }: { day: string; past: boolean; other: boolean; big: boolean }) => (
    <div
      onDragOver={(e) => !past && e.preventDefault()}
      onDrop={(e) => onDrop(day, e)}
      className={`flex min-h-[190px] w-full flex-1 flex-col gap-1 border-b border-r border-gray-100 p-1.5 dark:border-white/5 ${!big && (other || past) ? "bg-gray-50/60 dark:bg-white/[0.02]" : ""}`}
    >
      {!big && (
        <span className={`text-[11px] font-black ${day === today ? "self-start rounded-full bg-[#1a3c6e] px-1.5 text-white" : other ? "text-gray-300 dark:text-white/20" : ""}`}>
          {parse(day).getDate() === 1 ? parse(day).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : parse(day).getDate()}
        </span>
      )}
      {(datesByDay[day] ?? []).map((l) => (
        <span key={l} className="truncate rounded bg-[#00f976]/20 px-1 text-[9px] font-bold text-green-800 dark:text-[#00f976]">
          {l}
        </span>
      ))}
      {(byDay[day] ?? []).map((s) => (
        <SlotChip key={s.id} s={s} agents={agents} size={big ? "big" : "small"} onClick={() => setOpen(s.id)} />
      ))}
    </div>
  );

  return (
    <main className="flex flex-col gap-3 px-3 py-4 md:h-[calc(100vh-86px)] md:overflow-hidden md:px-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-black uppercase tracking-widest">Social calendar</h1>
        <select
          value={event}
          onChange={(e) => {
            setEvent(e.target.value);
            load(e.target.value);
          }}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] dark:border-white/10 dark:bg-white/5"
        >
          {data?.events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
        <div className="hidden gap-1 md:flex">
          {(["month", "week"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={pill(mode === m)}>
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className={`${pill(false)} hidden md:inline-flex`} aria-label="Previous">
            ‹
          </button>
          <button onClick={() => goTo(todayET())} className={`${pill(false)} hidden md:inline-flex`}>
            Today
          </button>
          <button onClick={() => setTrayOpen(true)} className={`${pill(false)} md:hidden`}>
            + Not on the calendar ({data?.tray.length ?? 0})
          </button>
          <button onClick={() => step(1)} className={`${pill(false)} hidden md:inline-flex`} aria-label="Next">
            ›
          </button>
        </div>
        <span className="hidden text-sm font-black md:inline">{heading}</span>
        <span className="ml-auto hidden items-center gap-2 text-[10px] text-gray-400 dark:text-white/40 md:flex">
          <span>Times are US Eastern · posts go to Instagram + Facebook</span>
          <span className="relative">
            <button onClick={() => setLegend((v) => !v)} className={pill(legend)} aria-label="What the colours mean">
              ?
            </button>
            {legend && (
              <div className="absolute right-0 top-8 z-30 flex w-64 flex-col gap-2 rounded-xl border border-gray-100 bg-white p-3 text-[11px] shadow-lg dark:border-white/10 dark:bg-[#0d0d0d]">
                <div className={sectionLabel}>Status</div>
                {LEGEND.map(([t, l]) => (
                  <span key={t} className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 font-bold ${tone(t)}`}>{l}</span>
                  </span>
                ))}
                <div className={`${sectionLabel} mt-1`}>Who</div>
                {agents.map((a) => (
                  <span key={a.id} className="flex items-center gap-2" title={a.blurb}>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px]" style={{ background: a.colour + "22" }}>
                      {a.icon}
                    </span>
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: a.colour }} />
                    {a.name}
                  </span>
                ))}
              </div>
            )}
          </span>
        </span>
      </div>

      {/* Needs you */}
      {needs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-500/30 dark:bg-orange-500/10">
          <span className="text-[11px] font-black uppercase tracking-widest text-orange-700 dark:text-orange-300">
            {needs.length === 1 ? "1 thing needs you" : `${needs.length} things need you`}
          </span>
          {(showAllNeeds ? needs : needs.slice(0, 5)).map((n, i) => (
            // phone: the first two only, until "more"
            <button
              key={`${n.id}-${i}`}
              onClick={() => setOpen(n.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-90 ${n.tone === "red" ? "bg-red-500" : "bg-orange-500"} ${!showAllNeeds && i >= 2 ? "hidden md:inline-block" : ""}`}
            >
              {n.text}
              {n.due && <span className="ml-1 font-normal opacity-80">· by {dueText(n.due)}</span>}
            </button>
          ))}
          {needs.length > 5 && (
            <button onClick={() => setShowAllNeeds((v) => !v)} className="hidden text-[11px] font-bold text-orange-700 underline dark:text-orange-300 md:inline">
              {showAllNeeds ? "fewer" : `+${needs.length - 5} more`}
            </button>
          )}
          {needs.length > 2 && (
            <button onClick={() => setShowAllNeeds((v) => !v)} className="text-[11px] font-bold text-orange-700 underline dark:text-orange-300 md:hidden">
              {showAllNeeds ? "fewer" : `+${needs.length - 2} more`}
            </button>
          )}
        </div>
      )}

      {err && (
        <div className="flex items-start gap-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:bg-red-500/10 dark:text-red-300">
          <span className="flex-1">{err}</span>
          <button onClick={() => setErr("")}>
            <IoMdClose />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        <div className={trayOpen ? "fixed inset-0 z-50 flex flex-col bg-black/50 p-3 [&>aside]:w-full [&>aside]:flex-1 md:static md:z-auto md:bg-transparent md:p-0 md:[&>aside]:w-72 md:[&>aside]:flex-none" : "hidden md:flex"}>
          {trayOpen && (
            <button onClick={() => setTrayOpen(false)} className="mb-2 self-end rounded-full bg-white px-3 py-1 text-[12px] font-bold dark:bg-[#0d0d0d] md:hidden">
              Close ✕
            </button>
          )}
          <Tray
            data={data}
            onAdd={(t) => {
              setTrayOpen(false);
              setAdding(t);
            }}
            onSpread={(g) => {
              setTrayOpen(false);
              setSpreading(g);
            }}
          />
        </div>

        {/* Phone (James 25 Oct 2026): the coming days with their posts, top to bottom; tap one to open it */}
        {phoneList()}

        {/* Calendar */}
        <section className="hidden min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-white/5 dark:bg-[#0d0d0d] md:flex">
          {/* One timeline: Week scrolls sideways day after day, Month scrolls down week after week; the day names stay put */}
          <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-auto">
            {!data ? (
              <div className="p-4 text-[11px] text-gray-400">Loading…</div>
            ) : mode === "week" ? (
              <div className="flex min-h-full">
                {days.map((day) => (
                  <div key={day} data-day={day} style={{ width: COL }} className={`flex shrink-0 flex-col border-r border-gray-100 dark:border-white/5 ${day < today ? "bg-gray-50/60 dark:bg-white/[0.02]" : ""} ${parse(day).getDay() === 1 ? "border-l-2 border-l-gray-200 dark:border-l-white/10" : ""}`}>
                    <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-2 py-1.5 dark:border-white/5 dark:bg-[#0d0d0d]">
                      <span className={`text-[9px] font-black uppercase tracking-widest ${day === today ? "rounded-full bg-[#1a3c6e] px-1.5 text-white" : "text-gray-400 dark:text-white/40"}`}>
                        {parse(day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                      </span>
                    </div>
                    {dayCell({ day, past: day < today, other: false, big: true })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="min-w-[900px]">
                <div className="sticky top-0 z-10 grid grid-cols-7 border-b border-gray-100 bg-white text-[9px] font-black uppercase tracking-widest text-gray-400 dark:border-white/5 dark:bg-[#0d0d0d] dark:text-white/40">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                    <div key={d} className="px-2 py-1.5">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid auto-rows-[minmax(190px,auto)] grid-cols-7">
                  {days.map((day) => (
                    <div key={day} data-day={day} {...(parse(day).getDay() === 1 ? { "data-monday": "" } : {})} className="flex">
                      {dayCell({ day, past: day < today, other: day.slice(0, 7) !== visible.slice(0, 7), big: false })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {adding && (
        <AddDialog
          item={adding}
          busy={busy}
          onAdd={async (at) => {
            const id = await act({ action: "add", event, type: adding.type, variant: adding.variant, at });
            if (typeof id === "string") {
              setAdding(null);
              setAnchor(at.slice(0, 10));
              setOpen(id);
            }
          }}
          onClose={() => setAdding(null)}
        />
      )}
      {spreading && (
        <SpreadDialog
          group={spreading}
          busy={busy}
          onSpread={async (variants, from, to, times) => {
            if (await act({ action: "spread", event, type: spreading.type, variants, from, to, times })) {
              setSpreading(null);
              setAnchor(from);
            }
          }}
          onClose={() => setSpreading(null)}
        />
      )}
      {slot && slot.kind === "post" && <SlotDrawer key={slot.id} s={slot} agents={agents} posts={data?.posts ?? []} busy={busy} act={act} onClose={() => setOpen(null)} />}
    </main>
  );
}

/** Every post not on the calendar yet, grouped by type (tasks live on the Schedule tab now). */
function Tray({
  data,
  onAdd,
  onSpread,
}: {
  data: Data | null;
  onAdd: (t: TrayItem) => void;
  onSpread: (g: { type: string; label: string; items: TrayItem[] }) => void;
}) {
  const [filter, setFilter] = useState<"all" | "made" | "planned">("all");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const items = (data?.tray ?? []).filter((t) => filter === "all" || (filter === "made") === !t.placeholder);
  // Group by graphic (type): bracket breakdowns ×24 fold into one row.
  const groups: { type: string; label: string; phase: string; items: TrayItem[] }[] = [];
  for (const t of items) {
    const g = groups.find((x) => x.type === t.type);
    if (g) g.items.push(t);
    else groups.push({ type: t.type, label: t.title.split(" · ")[0], phase: t.phase, items: [t] });
  }
  const phases = Array.from(new Set(groups.map((g) => g.phase)));

  const Item = ({ t }: { t: TrayItem }) => (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ tray: t }))}
      onClick={() => onAdd(t)}
      title={t.templated ? "Templated: signed off, waiting on data. Place it to set when it goes out" : t.placeholder ? "Not made yet: place it to hold the date" : t.title}
      className={`flex cursor-grab items-center gap-2 rounded-lg border p-1.5 text-[11px] active:cursor-grabbing ${
        t.templated
          ? "border-dashed border-[#39b5e6] text-gray-700 dark:text-white/70"
          : t.placeholder
          ? "border-dashed border-gray-300 text-gray-500 dark:border-white/15 dark:text-white/50"
          : "border-gray-100 hover:border-gray-400 dark:border-white/5 dark:hover:border-white/30"
      }`}
    >
      {t.png ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={genUrl(t.png, true)} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
      ) : (
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded text-[9px] ${t.templated ? "bg-[#39b5e6]/20 text-[#1a3c6e] dark:text-[#39b5e6]" : "bg-gray-100 dark:bg-white/5"}`}>
          {t.templated ? "tmpl" : "plan"}
        </span>
      )}
      <span className="line-clamp-2">
        {t.title}
        {t.priority === "nice" && <span className="ml-1 text-gray-400">(nice)</span>}
      </span>
    </div>
  );

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-gray-100 bg-white p-3 dark:border-white/5 dark:bg-[#0d0d0d]">
      <div className="flex items-center justify-between">
        <span className={sectionLabel}>Not on the calendar yet</span>
      </div>


      <div className="flex items-center justify-between">
        <span className={sectionLabel}>Not on the calendar ({data?.tray.length ?? 0})</span>
        <div className="flex gap-1">
          {(["all", "made", "planned"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={pill(filter === f)}>
              {f === "all" ? "All" : f === "made" ? "Made" : "Not made"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-gray-400 dark:text-white/40">Drag onto a day (lands as a draft at {nice(DEFAULT_TIME)} ET), or click to pick a date.</p>
      {phases.map((ph) => (
        <div key={ph} className="flex flex-col gap-1.5">
          <div className={sectionLabel}>{ph}</div>
          {groups
            .filter((g) => g.phase === ph)
            .map((g) => {
              const many = g.items.length > 1;
              const isOpen = openGroups[g.type] ?? !many;
              const made = g.items.filter((t) => !t.placeholder);
              return (
                <div key={g.type} className="flex flex-col gap-1">
                  {many && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setOpenGroups((o) => ({ ...o, [g.type]: !isOpen }))} className="flex flex-1 items-center gap-1.5 text-left text-[11px] font-bold">
                        <span className="text-gray-400">{isOpen ? "▾" : "▸"}</span>
                        {g.label} <span className="font-normal text-gray-400">· {g.items.length}</span>
                      </button>
                      {made.length > 1 && (
                        <button onClick={() => onSpread({ type: g.type, label: g.label, items: made })} className={pill(false)} title="Lay these over a date range in one go">
                          Spread…
                        </button>
                      )}
                    </div>
                  )}
                  {isOpen && (
                    <div className={`flex flex-col gap-1 ${many ? "ml-2" : ""}`}>
                      {g.items.map((t) => (
                        <Item key={`${t.type}|${t.variant}`} t={t} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ))}
      {!data && <p className="text-[11px] text-gray-400">Loading…</p>}
      {data && !data.tray.length && <p className="text-[11px] text-gray-400">Everything is on the calendar.</p>}
    </aside>
  );
}

/** One thing on the calendar. Left edge = who (agent colour); the dot / pill = status. */
function SlotChip({ s, agents, size, onClick }: { s: Slot; agents: Agent[]; size: "small" | "big" | "row"; onClick: () => void }) {
  const p = statusPill(s);
  const a = findAgent(agents, s.agent);
  const time = et(s.publishAt).time;
  const repeat = s.id.includes("~"); // a repeating job's later day: move its first-day slot instead
  const movable = !repeat && (s.kind !== "post" || s.status === "draft" || s.status === "failed");
  const isPost = s.kind === "post";
  const thumb = isPost ? (
    s.preview[0] ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={genUrl(s.preview[0], true)} alt="" className={`${size === "big" ? "aspect-[4/5] w-full" : size === "row" ? "h-20 w-16" : "h-8 w-8"} shrink-0 rounded object-cover ${s.placeholder ? "grayscale" : ""}`} />
    ) : (
      <span className={`${size === "big" ? "aspect-[4/5] w-full" : size === "row" ? "h-20 w-16" : "h-8 w-8"} flex shrink-0 items-center justify-center rounded text-[8px] ${s.templated ? "bg-[#39b5e6]/20" : "bg-gray-100 dark:bg-white/5"}`}>
        {s.templated ? "tmpl" : "plan"}
      </span>
    )
  ) : (
    <span className={`${size === "big" ? "h-10 w-10 text-[18px]" : "h-8 w-8 text-[14px]"} flex shrink-0 items-center justify-center rounded-full`} style={{ background: a.colour + "22" }}>
      {a.icon}
    </span>
  );
  return (
    <button
      draggable={movable}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ slot: s.id }))}
      onClick={onClick}
      title={`${a.name}: ${s.title} · ${p.label}`}
      style={{ borderLeftColor: a.colour }}
      className={`flex w-full ${size === "big" ? "flex-col" : "items-center"} ${size === "row" ? "gap-3 p-2 text-[12px]" : "gap-1.5 p-1 text-[10px]"} rounded-md border border-l-4 border-gray-100 bg-white text-left hover:border-gray-400 dark:border-white/5 dark:bg-[#141414] dark:hover:border-white/30 ${
        s.placeholder ? "border-dashed opacity-80" : ""
      } ${s.placeholder && !s.templated ? "opacity-45 grayscale" : ""} ${s.status === "done" ? "opacity-50" : ""}`}
    >
      {thumb}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 font-bold">
          {size === "small" && <span className={`h-2 w-2 shrink-0 rounded-full ${dot[p.tone]}`} />}
          {time ? nice(time) : "—"}
          {isPost && s.slides.length > 1 && <span className="font-normal text-gray-400">· {s.slides.length} slides</span>}
          {!isPost && s.duration > 0 && <span className="font-normal text-gray-400">· ~{s.duration} min</span>}
          {repeat && <span className="font-normal text-gray-400" title="Repeats daily: open it to see or move the first day">↻</span>}
          {size === "small" && isPost && <span className="ml-auto text-[10px]">{a.icon}</span>}
        </span>
        <span className={`block ${size === "small" ? "truncate" : ""}`}>{s.title}</span>
        {isPost && s.placeholder && (
          <span className="block text-[9px] text-gray-400">{s.templated ? "template ready · waiting on data" : "needs a template"}</span>
        )}
        {size !== "small" && (
          <span className="mt-1 flex items-center gap-1.5">
            <span className={`inline-block rounded-full px-2 py-0.5 font-bold ${tone(p.tone)}`}>{p.label}</span>
            <span className="text-gray-400">{a.name}</span>
          </span>
        )}
      </span>
    </button>
  );
}

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`flex max-h-[90vh] w-full ${wide ? "max-w-lg" : "max-w-sm"} flex-col gap-3 overflow-y-auto rounded-xl bg-white p-5 dark:bg-[#0d0d0d]`}>
        {children}
      </div>
    </div>
  );
}

/** Click-to-add (works on a phone/iPad too, where dragging doesn't). */
function AddDialog({ item, busy, onAdd, onClose }: { item: TrayItem; busy: boolean; onAdd: (at: string) => void; onClose: () => void }) {
  const [date, setDate] = useState(addDays(todayET(), 1));
  const [time, setTime] = useState(DEFAULT_TIME);
  return (
    <Modal onClose={onClose}>
      <div className="text-sm font-black">{item.title}</div>
      {item.png ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={genUrl(item.png, true)} alt="" className="w-full rounded-lg" />
      ) : (
        <p className="text-[12px] text-gray-500">{item.templated ? "Templated: signed off, waiting on data. This sets when it goes out." : "Not made yet. This holds the date; the post joins it once it's made."}</p>
      )}
      <span className={sectionLabel}>Goes out (US Eastern)</span>
      <div className="flex gap-2">
        <input type="date" value={date} min={todayET()} onChange={(e) => setDate(e.target.value)} className={field} />
        <input type="time" value={time} step={300} onChange={(e) => setTime(e.target.value)} className={field} />
      </div>
      <div className="flex gap-2">
        <button disabled={busy || !date || !time} onClick={() => onAdd(`${date}T${time}`)} className={primaryButton}>
          Add to calendar
        </button>
        <button onClick={onClose} className={pill(false)}>
          Cancel
        </button>
      </div>
      <p className="text-[10px] text-gray-400">It lands as a draft; nothing goes out until you approve it.</p>
    </Modal>
  );
}

/** "Spread these": a whole group (e.g. 24 bracket breakdowns) over a date range, N times a day, as drafts. */
function SpreadDialog({
  group,
  busy,
  onSpread,
  onClose,
}: {
  group: { type: string; label: string; items: TrayItem[] };
  busy: boolean;
  onSpread: (variants: string[], from: string, to: string, times: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Record<string, boolean>>(Object.fromEntries(group.items.map((t) => [t.variant, true])));
  const [from, setFrom] = useState(addDays(todayET(), 1));
  const [to, setTo] = useState(addDays(todayET(), 7));
  const [times, setTimes] = useState<Record<string, boolean>>({ "12:00": true, "18:00": true });
  const chosen = group.items.filter((t) => picked[t.variant]).map((t) => t.variant);
  const nTimes = Object.values(times).filter(Boolean).length;
  const nDays = Math.max(0, Math.round((parse(to).getTime() - parse(from).getTime()) / 86400000) + 1);
  const fits = chosen.length <= nDays * nTimes;
  return (
    <Modal onClose={onClose} wide>
      <div className="text-sm font-black">Spread {group.label}</div>
      <p className="text-[12px] text-gray-500">Lays the ticked posts over the days below, in this order, as drafts. You still approve each one.</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={sectionLabel}>From</span>
          <input type="date" value={from} min={todayET()} onChange={(e) => setFrom(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={sectionLabel}>To</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={field} />
        </label>
      </div>
      <span className={sectionLabel}>Times each day (ET)</span>
      <div className="flex flex-wrap gap-1">
        {TIMES.map((t) => (
          <button key={t} onClick={() => setTimes((x) => ({ ...x, [t]: !x[t] }))} className={pill(!!times[t])}>
            {nice(t)}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className={sectionLabel}>
          Posts ({chosen.length} of {group.items.length})
        </span>
        <button onClick={() => setPicked(Object.fromEntries(group.items.map((t) => [t.variant, chosen.length !== group.items.length])))} className="text-[10px] underline">
          {chosen.length === group.items.length ? "none" : "all"}
        </button>
      </div>
      <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto">
        {group.items.map((t) => (
          <label key={t.variant} className="flex items-center gap-2 text-[11px]">
            <input type="checkbox" checked={!!picked[t.variant]} onChange={(e) => setPicked((x) => ({ ...x, [t.variant]: e.target.checked }))} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={genUrl(t.png, true)} alt="" className="h-6 w-6 rounded object-cover" />
            <span className="truncate">{t.title.split(" · ").slice(1).join(" · ") || t.title}</span>
          </label>
        ))}
      </div>
      <p className={`text-[11px] ${fits ? "text-gray-500" : "text-red-600"}`}>
        {chosen.length} posts over {nDays} day{nDays === 1 ? "" : "s"} × {nTimes} time{nTimes === 1 ? "" : "s"} = {nDays * nTimes} slots
        {fits ? ` (about ${nDays ? (chosen.length / nDays).toFixed(1) : 0} a day)` : ": add days or times"}
      </p>
      <div className="flex gap-2">
        <button
          disabled={busy || !fits || !chosen.length || !nTimes}
          onClick={() => onSpread(chosen, from, to, TIMES.filter((t) => times[t]))}
          className={primaryButton}
        >
          {busy ? "Working…" : `Add ${chosen.length} drafts`}
        </button>
        <button onClick={onClose} className={pill(false)}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

/** A task: an agent's work or something James must do, on the Schedule. */
export function TaskDialog({
  agents,
  busy,
  onAdd,
  onClose,
}: {
  agents: Agent[];
  busy: boolean;
  onAdd: (t: { kind: "work" | "action"; agent: string; title: string; at: string; duration: number; notes: string }) => void;
  onClose: () => void;
}) {
  const [agent, setAgent] = useState("james");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(addDays(todayET(), 1));
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(15);
  const [notes, setNotes] = useState("");
  const kind = agent === "james" ? "action" : "work";
  return (
    <Modal onClose={onClose}>
      <div className="text-sm font-black">Add a task</div>
      <label className="flex flex-col gap-1">
        <span className={sectionLabel}>Who</span>
        <select value={agent} onChange={(e) => setAgent(e.target.value)} className={field}>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.icon} {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={sectionLabel}>What</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder={kind === "action" ? "e.g. Add the Roster Updates tab" : "e.g. Populate Roster changes"} />
      </label>
      <span className={sectionLabel}>When (US Eastern)</span>
      <div className="flex gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        <input type="time" value={time} step={300} onChange={(e) => setTime(e.target.value)} className={field} />
      </div>
      {kind === "work" && (
        <label className="flex flex-col gap-1">
          <span className={sectionLabel}>About how long (minutes)</span>
          <input type="number" min={0} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={field} />
        </label>
      )}
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={field} placeholder="Notes (optional)" />
      <div className="flex gap-2">
        <button disabled={busy || !title.trim()} onClick={() => onAdd({ kind, agent, title, at: `${date}T${time}`, duration: kind === "work" ? duration : 0, notes })} className={primaryButton}>
          Add
        </button>
        <button onClick={onClose} className={pill(false)}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function Drawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      {/* phone: a close button that stays put while the panel scrolls */}
      <button onClick={onClose} aria-label="Close" className="fixed bottom-4 right-4 z-50 rounded-full bg-gray-900 px-4 py-2 text-[13px] font-bold text-white shadow-lg dark:bg-white dark:text-black md:hidden">
        Close ✕
      </button>
      <aside onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-xl flex-col gap-5 overflow-y-auto bg-white p-4 dark:bg-[#0d0d0d] sm:p-6">
        {children}
      </aside>
    </div>
  );
}

/** The chain behind a post, with who does each step. */
function Path({ steps, agents }: { steps: PathStep[]; agents: Agent[] }) {
  if (!steps.length) return null;
  const style: Record<PathStep["state"], string> = {
    done: "text-gray-400 line-through dark:text-white/30",
    now: "font-black",
    next: "text-gray-500 dark:text-white/50",
    blocked: "font-bold text-red-600",
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className={sectionLabel}>Path</span>
      <ol className="flex flex-col">
        {steps.map((st, i) => {
          const a = findAgent(agents, st.agent);
          return (
            <li key={i} className="flex items-stretch gap-2">
              <div className="flex w-6 flex-col items-center">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] ${st.state === "done" ? "opacity-40" : ""} ${st.state === "now" ? "ring-2 ring-offset-1" : ""}`} style={{ background: a.colour + "22", ["--tw-ring-color" as string]: a.colour }}>
                  {st.state === "done" ? "✓" : st.state === "blocked" ? "!" : a.icon}
                </span>
                {i < steps.length - 1 && <span className="w-px flex-1 bg-gray-200 dark:bg-white/10" />}
              </div>
              <div className={`pb-3 text-[12px] ${style[st.state]}`}>
                {st.label}
                <span className="ml-1 text-[10px] font-normal text-gray-400 no-underline">
                  · {a.name}
                  {st.when ? ` · ${dueText(st.when)}` : ""}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function TaskDrawer({ s, agents, busy, act, onClose }: { s: Slot; agents: Agent[]; busy: boolean; act: Act; onClose: () => void }) {
  const t = et(s.publishAt);
  const a = findAgent(agents, s.agent);
  const [title, setTitle] = useState(s.title);
  const [date, setDate] = useState(t.date);
  const [time, setTime] = useState(t.time || "09:00");
  const [duration, setDuration] = useState(s.duration);
  const [notes, setNotes] = useState(s.notes);
  const p = statusPill(s);
  const done = s.status === "done";
  return (
    <Drawer onClose={onClose}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[20px]" style={{ background: a.colour + "22" }}>
          {a.icon}
        </span>
        <div className="flex-1">
          <textarea value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() !== s.title && act({ action: "save", id: s.id, title })} rows={2} className="w-full resize-none bg-transparent text-base font-black outline-none" />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${tone(p.tone)}`}>{p.label}</span>
            <span className="text-[11px] text-gray-500">
              {a.name} · {s.kind === "work" ? "agent work" : "your action"}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-900 dark:hover:text-white">
          <IoMdClose size={20} />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <span className={sectionLabel}>When (US Eastern)</span>
        <div className="flex gap-2">
          <input type="date" value={date} disabled={busy} onChange={(e) => { setDate(e.target.value); if (e.target.value) act({ action: "save", id: s.id, at: `${e.target.value}T${time}` }); }} className={field} />
          <input type="time" value={time} step={300} disabled={busy} onChange={(e) => setTime(e.target.value)} onBlur={() => time !== t.time && act({ action: "save", id: s.id, at: `${date}T${time}` })} className={field} />
        </div>
        {s.publishAt && <span className="text-[11px] text-gray-500 dark:text-white/50">Your time: {local(s.publishAt)}</span>}
      </div>
      {s.kind === "work" && (
        <label className="flex flex-col gap-1">
          <span className={sectionLabel}>About how long (minutes)</span>
          <input type="number" min={0} value={duration} onChange={(e) => setDuration(Number(e.target.value))} onBlur={() => duration !== s.duration && act({ action: "save", id: s.id, duration })} className={field} />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => act({ action: "done", id: s.id, done: !done })} className={primaryButton}>
          {done ? "Not done" : "Done ✓"}
        </button>
        <button disabled={busy} onClick={async () => (await act({ action: "remove", id: s.id }, "Take this off the schedule?")) && onClose()} className={`${pill(false)} ml-auto`}>
          Remove
        </button>
      </div>
      <label className="flex flex-col gap-1">
        <span className={sectionLabel}>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== s.notes && act({ action: "save", id: s.id, notes })} rows={4} className={field} />
      </label>
    </Drawer>
  );
}

function SlotDrawer({ s, agents, posts, busy, act, onClose }: { s: Slot; agents: Agent[]; posts: { png: string; title: string }[]; busy: boolean; act: Act; onClose: () => void }) {
  const t = et(s.publishAt);
  const [date, setDate] = useState(t.date);
  const [time, setTime] = useState(t.time || DEFAULT_TIME);
  const [caption, setCaption] = useState(s.caption);
  const [notes, setNotes] = useState(s.notes);
  const [shown, setShown] = useState(0);
  const p = statusPill(s);
  const editable = s.status === "draft" || s.status === "failed";
  const blocks = s.checks.filter((c) => c.level === "block");
  const warns = s.checks.filter((c) => c.level === "warn");
  const slides = s.placeholder ? s.preview : s.slides;
  const tags = (caption.match(/#\w+/g) ?? []).length;

  const saveWhen = (d: string, tm: string) => d && tm && act({ action: "save", id: s.id, at: `${d}T${tm}` });
  const setSlides = (next: string[]) => act({ action: "save", id: s.id, slides: next });
  const move = (i: number, by: number) => {
    const next = [...s.slides];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setSlides(next);
  };

  const meta: [string, React.ReactNode][] = [
    ["Post type", s.label],
    ["Graphic", s.graphic || "—"],
    ["Version", s.variant && s.variant !== "event" ? s.variants.find((v) => v.key === s.variant)?.name ?? s.variant : "One post for the event"],
    ["Phase", s.phase],
    ["Priority", s.priority === "must" ? "Must" : s.priority === "nice" ? "Nice to have" : "—"],
    ["Generator stage", s.stage.replace(/_/g, " ")],
    ["Goes to", "Instagram @pickempaintball + Facebook Pick'Em Paintball"],
    ["Format", s.slides.length > 1 ? `Carousel, ${s.slides.length} slides` : "Single image"],
    ["Made", s.data.madeAt || "—"],
    ["Data from", s.data.source || "—"],
    ["Approved", s.approvedAt ? new Date(s.approvedAt).toLocaleString() : "—"],
  ];

  return (
    <Drawer onClose={onClose}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="text-base font-black">{s.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${tone(p.tone)}`}>{p.label}</span>
            <Link href={s.link} className="text-[11px] text-gray-500 hover:underline dark:text-white/50">
              Open in Post Generator ↗
            </Link>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-900 dark:hover:text-white">
          <IoMdClose size={20} />
        </button>
      </div>

      {/* Slides */}
      <div className="flex flex-col gap-2">
        {slides.length ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={genUrl(slides[Math.min(shown, slides.length - 1)])} alt="" className={`w-full rounded-lg border border-gray-100 dark:border-white/5 ${s.placeholder ? "opacity-60 grayscale" : ""}`} />
            {s.placeholder && <p className="text-[11px] text-gray-500">Preview of a made version. This slot isn&apos;t linked to a post yet.</p>}
            {slides.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {slides.map((sl, i) => (
                  <div key={`${sl}-${i}`} className="flex flex-col items-center gap-1">
                    <button onClick={() => setShown(i)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={genUrl(sl, true)} alt="" className={`h-14 w-14 rounded object-cover ${i === shown ? "ring-2 ring-[#1a3c6e]" : ""}`} />
                    </button>
                    {editable && !s.placeholder && (
                      <span className="flex gap-1 text-[10px] text-gray-400">
                        <button disabled={i === 0 || busy} onClick={() => move(i, -1)} className="disabled:opacity-30">
                          ←
                        </button>
                        <button disabled={busy} onClick={() => setSlides(s.slides.filter((_, j) => j !== i))}>
                          ✕
                        </button>
                        <button disabled={i === slides.length - 1 || busy} onClick={() => move(i, 1)} className="disabled:opacity-30">
                          →
                        </button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex aspect-[4/5] w-full items-center justify-center rounded-lg border border-dashed border-gray-300 text-[12px] text-gray-400 dark:border-white/15">
            {s.templated ? "Templated: waiting on data" : "Not made yet"}
          </div>
        )}
        {editable && s.placeholder && s.variants.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className={sectionLabel}>Use a made post</span>
            <select defaultValue="" onChange={(e) => e.target.value && act({ action: "save", id: s.id, variant: e.target.value })} className={field}>
              <option value="">Pick the version for this slot…</option>
              {s.variants.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {editable && !s.placeholder && (
          <select value="" onChange={(e) => e.target.value && setSlides([...s.slides, e.target.value])} className={field} disabled={busy || s.slides.length >= 10}>
            <option value="">+ Add a slide (makes it a carousel)…</option>
            {posts
              .filter((x) => !s.slides.includes(x.png))
              .map((x) => (
                <option key={x.png} value={x.png}>
                  {x.title}
                </option>
              ))}
          </select>
        )}
      </div>

      {/* When */}
      <div className="flex flex-col gap-1">
        <span className={sectionLabel}>Goes out (US Eastern)</span>
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            disabled={!editable || busy}
            onChange={(e) => {
              setDate(e.target.value);
              saveWhen(e.target.value, time);
            }}
            className={field}
          />
          <input type="time" value={time} step={300} disabled={!editable || busy} onChange={(e) => setTime(e.target.value)} onBlur={() => time !== t.time && saveWhen(date, time)} className={field} />
        </div>
        {s.publishAt && <span className="text-[11px] text-gray-500 dark:text-white/50">Your time: {local(s.publishAt)}</span>}
      </div>

      <Path steps={s.path} agents={agents} />

      {/* Checks */}
      {(blocks.length > 0 || warns.length > 0) && (
        <div className="flex flex-col gap-1.5">
          <span className={sectionLabel}>Blockers + notes</span>
          {blocks.map((c) => (
            <div key={c.text} className="rounded-lg bg-red-50 px-3 py-1.5 text-[12px] text-red-700 dark:bg-red-500/10 dark:text-red-300">
              ⛔ {c.text}
            </div>
          ))}
          {warns.map((c) => (
            <div
              key={c.text}
              className={`rounded-lg px-3 py-1.5 text-[12px] ${
                c.text.startsWith("Ready") ? "bg-green-50 text-green-800 dark:bg-green-500/10 dark:text-green-300" : "bg-orange-50 text-orange-800 dark:bg-orange-500/10 dark:text-orange-300"
              }`}
            >
              {c.text.startsWith("Ready") ? "✓" : "⚠️"} {c.text}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {s.status === "draft" && (
          <button
            disabled={busy || blocks.length > 0}
            onClick={() => act({ action: "approve", id: s.id }, `Approve "${s.title}"?\n\nIt will go out on Instagram and Facebook by itself on ${date} at ${nice(time)} ET.`)}
            className={primaryButton}
          >
            {busy ? "Working…" : "Approve"}
          </button>
        )}
        {s.status === "approved" && (
          <>
            <button disabled={busy} onClick={() => act({ action: "unapprove", id: s.id })} className={primaryButton}>
              Un-approve
            </button>
            <button disabled={busy} onClick={() => act({ action: "postnow", id: s.id }, "Post this now, on both Instagram and Facebook? It goes out within 5 minutes.")} className={pill(false)}>
              Post now
            </button>
          </>
        )}
        {s.status !== "posted" && s.status !== "sending" && (
          <button disabled={busy} onClick={async () => (await act({ action: "remove", id: s.id }, "Take this off the calendar?")) && onClose()} className={`${pill(false)} ml-auto`}>
            Remove
          </button>
        )}
      </div>

      {(s.result || s.error) && (
        <div className="flex flex-col gap-1 text-[12px]">
          {s.result?.instagram && (
            <a href={s.result.instagram.permalink} target="_blank" rel="noreferrer" className="text-[#1a3c6e] underline dark:text-[#39b5e6]">
              View on Instagram ↗
            </a>
          )}
          {s.result?.facebook && (
            <a href={s.result.facebook.permalink} target="_blank" rel="noreferrer" className="text-[#1a3c6e] underline dark:text-[#39b5e6]">
              View on Facebook ↗
            </a>
          )}
          {s.error && <span className="text-red-600">Failed: {s.error}</span>}
        </div>
      )}

      {/* Caption */}
      <div className="flex flex-col gap-1">
        <span className={sectionLabel}>Caption (same on both)</span>
        <textarea
          value={caption}
          disabled={!editable || busy}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => caption !== s.caption && act({ action: "save", id: s.id, caption })}
          rows={9}
          className={`${field} font-mono text-[11px]`}
          placeholder={s.placeholder ? "Comes from the made post (or write it here)" : "Write the caption"}
        />
        <span className={`text-[10px] ${caption.length > 2200 || tags > 30 ? "text-red-600" : "text-gray-400"}`}>
          {caption.length}/2,200 characters · {tags}/30 hashtags
        </span>
      </div>

      {/* Data */}
      <div className="flex flex-col gap-1.5">
        <span className={sectionLabel}>Data it needs</span>
        {s.data.waiting.length === 0 && Object.keys(s.data.typed).length === 0 ? (
          <span className="text-[12px] text-gray-500 dark:text-white/50">
            {s.templated ? "Template signed off. Populate it in the Post Generator once the data is in, then this slot picks up the post." : s.placeholder ? "Known once the template is signed off." : "Nothing missing."}
          </span>
        ) : (
          <ul className="flex flex-col gap-1 text-[12px]">
            {s.data.waiting.map((w) => (
              <li key={w.label}>
                ⏳ Waiting on <b>{w.label}</b>
                {w.hint && <span className="text-gray-500"> ({w.hint})</span>}
              </li>
            ))}
            {Object.entries(s.data.typed).map(([k, v]) => (
              <li key={k}>
                ✍️ Typed in: <b>{k}</b> = {v}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-col gap-1.5">
        <span className={sectionLabel}>Details</span>
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[12px]">
          {meta.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-gray-400 dark:text-white/40">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <label className="flex flex-col gap-1">
        <span className={sectionLabel}>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== s.notes && act({ action: "save", id: s.id, notes })} rows={3} className={field} placeholder="Anything to remember about this post" />
      </label>
    </Drawer>
  );
}
