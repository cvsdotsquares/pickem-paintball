"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IoMdClose } from "react-icons/io";
import { genUrl, toneClass } from "./generatorTypes";
import { pill, primaryButton, sectionLabel } from "./types";

/**
 * Schedule (admin page 4): one calendar of an event's posts, the agents' work and the things James must do
 * (James, 18 Oct 2026). Views: Month, Week (big previews), Lanes (one row per agent) and Agenda (a list, for
 * the phone). The "needs you" strip at the top lists everything only James can move, oldest deadline first.
 * The left tray is the event's to-do list: tasks, then every post not on the calendar yet, grouped by type
 * ("Spread these" lays a whole group over a date range). Click anything for its panel; a post's panel shows
 * the path behind it (data → populate → approve → post). Approved posts go out on Instagram + Facebook by
 * themselves (cloud job, every 5 min). Times are US Eastern. Plan: pickem-hub/ideas/2026-10-17-scheduler-plan.md.
 */

type Check = { level: "block" | "warn"; text: string };
type Agent = { id: string; name: string; icon: string; colour: string; blurb: string; kind?: "agent" | "job"; parent?: string; enabled?: boolean };
type PathStep = { label: string; agent: string; state: "done" | "now" | "next" | "blocked"; when: string };
type Slot = {
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
type Mode = "month" | "week" | "lanes" | "agenda";
type Act = (body: Record<string, unknown>, confirmText?: string) => Promise<string | boolean>;

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

export default function SchedulerBoard() {
  const [data, setData] = useState<Data | null>(null);
  const [event, setEvent] = useState("");
  const [mode, setMode] = useState<Mode>("month");
  const [anchor, setAnchor] = useState(todayET());
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<TrayItem | null>(null);
  const [spreading, setSpreading] = useState<{ type: string; label: string; items: TrayItem[] } | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const [legend, setLegend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(
    async (ev = event) => {
      const r = await fetch(`/api/admin/scheduler${ev ? `?event=${ev}` : ""}`);
      const d = (await r.json()) as Data;
      if (d.error) setErr(d.error);
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

  const days = useMemo(() => {
    if (mode === "week" || mode === "lanes") return Array.from({ length: 7 }, (_, i) => addDays(monday(anchor), i));
    if (mode === "agenda") return Array.from({ length: 14 }, (_, i) => addDays(anchor, i));
    return Array.from({ length: 42 }, (_, i) => addDays(monday(`${anchor.slice(0, 7)}-01`), i));
  }, [mode, anchor]);

  const step = (n: number) => {
    if (mode === "week" || mode === "lanes") return setAnchor(addDays(anchor, 7 * n));
    if (mode === "agenda") return setAnchor(addDays(anchor, 14 * n));
    const d = parse(`${anchor.slice(0, 7)}-01`);
    d.setMonth(d.getMonth() + n);
    setAnchor(ymd(d));
  };
  const heading =
    mode === "month"
      ? parse(`${anchor.slice(0, 7)}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
      : `${parse(days[0]).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${parse(days[days.length - 1]).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

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
  // Lanes: the agents (never the design reviewer, which is never on the Schedule) plus any job that has something this week.
  const lanes = agents.filter((a) => a.id !== "reviewer" && (a.kind !== "job" || days.some((d) => (byDay[d] ?? []).some((s) => s.agent === a.id))));
  const needs = data?.needsYou ?? [];
  const [showAllNeeds, setShowAllNeeds] = useState(false);

  return (
    <main className="flex h-[calc(100vh-45px)] flex-col gap-3 px-5 py-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-black uppercase tracking-widest">Schedule</h1>
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
        <div className="flex gap-1">
          {(["month", "week", "lanes", "agenda"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={pill(mode === m)}>
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className={pill(false)} aria-label="Previous">
            ‹
          </button>
          <button onClick={() => setAnchor(todayET())} className={pill(false)}>
            Today
          </button>
          <button onClick={() => step(1)} className={pill(false)} aria-label="Next">
            ›
          </button>
        </div>
        <span className="text-sm font-black">{heading}</span>
        <span className="ml-auto flex items-center gap-2 text-[10px] text-gray-400 dark:text-white/40">
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
            <button
              key={`${n.id}-${i}`}
              onClick={() => setOpen(n.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-90 ${n.tone === "red" ? "bg-red-500" : "bg-orange-500"}`}
            >
              {n.text}
              {n.due && <span className="ml-1 font-normal opacity-80">· by {dueText(n.due)}</span>}
            </button>
          ))}
          {needs.length > 5 && (
            <button onClick={() => setShowAllNeeds((v) => !v)} className="text-[11px] font-bold text-orange-700 underline dark:text-orange-300">
              {showAllNeeds ? "fewer" : `+${needs.length - 5} more`}
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
        <Tray data={data} agents={agents} onAdd={setAdding} onSpread={setSpreading} onTask={() => setAddingTask(true)} onOpen={setOpen} />

        {/* Calendar */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-white/5 dark:bg-[#0d0d0d]">
          {mode === "agenda" ? (
            <div className="flex flex-col gap-3 overflow-y-auto p-3">
              {days.map((day) => {
                const items = byDay[day] ?? [];
                const marks = datesByDay[day] ?? [];
                if (!items.length && !marks.length) return null;
                return (
                  <div key={day} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-black ${day === today ? "rounded-full bg-[#1a3c6e] px-2 text-white" : ""}`}>{dayLabel(day, true)}</span>
                      {marks.map((l) => (
                        <span key={l} className="rounded bg-[#00f976]/20 px-1 text-[9px] font-bold text-green-800 dark:text-[#00f976]">
                          {l}
                        </span>
                      ))}
                    </div>
                    {items.map((s) => (
                      <SlotChip key={s.id} s={s} agents={agents} size="row" onClick={() => setOpen(s.id)} />
                    ))}
                  </div>
                );
              })}
              {!days.some((d) => byDay[d]?.length) && <p className="text-[12px] text-gray-400">Nothing in these two weeks.</p>}
            </div>
          ) : mode === "lanes" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-auto">
              <div className="sticky top-0 z-10 grid grid-cols-[150px_repeat(7,minmax(120px,1fr))] border-b border-gray-100 bg-white text-[9px] font-black uppercase tracking-widest text-gray-400 dark:border-white/5 dark:bg-[#0d0d0d] dark:text-white/40">
                <div className="px-2 py-1.5">Lane</div>
                {days.map((day) => (
                  <div key={day} className={`px-2 py-1.5 ${day === today ? "text-[#1a3c6e] dark:text-[#39b5e6]" : ""}`}>
                    {dayLabel(day)}
                    {(datesByDay[day] ?? []).map((l) => (
                      <span key={l} className="ml-1 rounded bg-[#00f976]/20 px-1 normal-case tracking-normal text-green-800 dark:text-[#00f976]">
                        {l}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              {lanes.map((a) => (
                <div key={a.id} className="grid min-h-[120px] grid-cols-[150px_repeat(7,minmax(120px,1fr))] border-b border-gray-100 dark:border-white/5">
                  <div className="flex items-start gap-2 border-r border-gray-100 p-2 dark:border-white/5" title={a.blurb}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px]" style={{ background: a.colour + "22" }}>
                      {a.icon}
                    </span>
                    <span className="text-[11px] font-black leading-tight">{a.name}</span>
                  </div>
                  {days.map((day) => (
                    <div
                      key={day}
                      onDragOver={(e) => day >= today && e.preventDefault()}
                      onDrop={(e) => onDrop(day, e)}
                      className={`flex flex-col gap-1 border-r border-gray-100 p-1.5 dark:border-white/5 ${day < today ? "bg-gray-50/60 dark:bg-white/[0.02]" : ""}`}
                    >
                      {(byDay[day] ?? [])
                        .filter((s) => s.agent === a.id)
                        .map((s) => (
                          <SlotChip key={s.id} s={s} agents={agents} size="big" onClick={() => setOpen(s.id)} />
                        ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 border-b border-gray-100 text-[9px] font-black uppercase tracking-widest text-gray-400 dark:border-white/5 dark:text-white/40">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} className="px-2 py-1.5">
                    {d}
                  </div>
                ))}
              </div>
              <div className={`grid min-h-0 flex-1 grid-cols-7 ${mode === "month" ? "grid-rows-6" : "grid-rows-1"} overflow-y-auto`}>
                {days.map((day) => {
                  const other = mode === "month" && day.slice(0, 7) !== anchor.slice(0, 7);
                  const past = day < today;
                  return (
                    <div
                      key={day}
                      onDragOver={(e) => !past && e.preventDefault()}
                      onDrop={(e) => onDrop(day, e)}
                      className={`flex min-h-0 flex-col gap-1 overflow-y-auto border-b border-r border-gray-100 p-1.5 dark:border-white/5 ${
                        other || past ? "bg-gray-50/60 dark:bg-white/[0.02]" : ""
                      }`}
                    >
                      <span className={`text-[11px] font-black ${day === today ? "self-start rounded-full bg-[#1a3c6e] px-1.5 text-white" : other ? "text-gray-300 dark:text-white/20" : ""}`}>
                        {parse(day).getDate()}
                      </span>
                      {(datesByDay[day] ?? []).map((l) => (
                        <span key={l} className="truncate rounded bg-[#00f976]/20 px-1 text-[9px] font-bold text-green-800 dark:text-[#00f976]">
                          {l}
                        </span>
                      ))}
                      {(byDay[day] ?? [])
                        .filter((s) => mode === "week" || !s.id.includes("~"))
                        .map((s) => (
                          <SlotChip key={s.id} s={s} agents={agents} size={mode === "week" ? "big" : "small"} onClick={() => setOpen(s.id)} />
                        ))}
                      {mode !== "week" && (() => {
                        // Month: a repeating job's later days fold into one line, so posts keep their room (James 24 Oct 2026)
                        const reps = (byDay[day] ?? []).filter((s) => s.id.includes("~"));
                        if (!reps.length) return null;
                        const names = reps.map((s) => `${findAgent(agents, s.agent).icon} ${s.title}`);
                        return (
                          <button onClick={() => setOpen(reps[0].id)} title={`Repeats today: ${names.join(", ")}`} className="truncate text-left text-[9px] text-gray-400 hover:text-gray-700 dark:hover:text-white">
                            ↻ {reps.length === 1 ? names[0] : `${reps.length} daily: ${reps.map((s) => s.title).join(", ")}`}
                          </button>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </>
          )}
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
      {addingTask && (
        <TaskDialog
          agents={agents}
          busy={busy}
          onAdd={async (t) => {
            const id = await act({ action: "task", event, ...t });
            if (typeof id === "string") {
              setAddingTask(false);
              setAnchor(t.at.slice(0, 10));
              setOpen(id);
            }
          }}
          onClose={() => setAddingTask(false)}
        />
      )}
      {slot && slot.kind === "post" && <SlotDrawer key={slot.id} s={slot} agents={agents} posts={data?.posts ?? []} busy={busy} act={act} onClose={() => setOpen(null)} />}
      {slot && slot.kind !== "post" && <TaskDrawer key={slot.id} s={slot} agents={agents} busy={busy} act={act} onClose={() => setOpen(null)} />}
    </main>
  );
}

/** The event's to-do list: open tasks, then every post not on the calendar yet, grouped by type. */
function Tray({
  data,
  agents,
  onAdd,
  onSpread,
  onTask,
  onOpen,
}: {
  data: Data | null;
  agents: Agent[];
  onAdd: (t: TrayItem) => void;
  onSpread: (g: { type: string; label: string; items: TrayItem[] }) => void;
  onTask: () => void;
  onOpen: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "made" | "planned">("all");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const tasks = (data?.slots ?? []).filter((s) => s.kind !== "post" && s.status !== "done").sort((a, b) => (a.publishAt ?? "").localeCompare(b.publishAt ?? ""));
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
        <span className={sectionLabel}>Event to-do list</span>
        <button onClick={onTask} className={pill(false)}>
          + Task
        </button>
      </div>

      {tasks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className={sectionLabel}>Tasks ({tasks.length})</div>
          {tasks.map((s) => {
            const a = findAgent(agents, s.agent);
            return (
              <button key={s.id} onClick={() => onOpen(s.id)} className="flex items-center gap-2 rounded-lg border border-l-4 border-gray-100 p-1.5 text-left text-[11px] hover:border-gray-400 dark:border-white/5" style={{ borderLeftColor: a.colour }}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px]" style={{ background: a.colour + "22" }}>
                  {a.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2">{s.title}</span>
                  <span className="block text-[10px] text-gray-400">
                    {a.name} · {dueText(s.publishAt)}
                    {s.duration ? ` · ~${s.duration} min` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

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
      <img src={genUrl(s.preview[0], true)} alt="" className={`${size === "big" ? "aspect-[4/5] w-full" : "h-8 w-8"} shrink-0 rounded object-cover ${s.placeholder ? "grayscale" : ""}`} />
    ) : (
      <span className={`${size === "big" ? "aspect-[4/5] w-full" : "h-8 w-8"} flex shrink-0 items-center justify-center rounded text-[8px] ${s.templated ? "bg-[#39b5e6]/20" : "bg-gray-100 dark:bg-white/5"}`}>
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
      className={`flex w-full ${size === "big" ? "flex-col" : "items-center"} gap-1.5 rounded-md border border-l-4 border-gray-100 bg-white p-1 text-left text-[10px] hover:border-gray-400 dark:border-white/5 dark:bg-[#141414] dark:hover:border-white/30 ${
        s.placeholder ? "border-dashed opacity-80" : ""
      } ${s.status === "done" ? "opacity-50" : ""}`}
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
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
function TaskDialog({
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
      <aside onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-xl flex-col gap-5 overflow-y-auto bg-white p-6 dark:bg-[#0d0d0d]">
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

function TaskDrawer({ s, agents, busy, act, onClose }: { s: Slot; agents: Agent[]; busy: boolean; act: Act; onClose: () => void }) {
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
