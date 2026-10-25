"use client";

import { useState } from "react";

/**
 * The team's calendar as bullet points (James 25 Oct 2026): Monday → Sunday rows, each day's plan grouped by agent,
 * one line per job or post. Used by the Workflows page (two weeks) and the Schedule tab (two weeks or a month).
 * The rows always start on a Monday; ‹ › move a whole week (or month), "This week" comes back.
 * Repeating jobs show on every day of their window, greyed after their first day so a start or a one-off stands out;
 * posts show their state (needs ✅, needs a template, approved…).
 * Each line has a status dot (James 25 Oct 2026; the one place colour is used): green = built, runs by itself at that
 * time · blue = ready, but needs James on the day (a ✅, his action, the post's data) · orange = not built yet (or no
 * template) · red = blocked (waiting on another job, failed, overdue, or needs a job that isn't built).
 */

export type BJob = {
  id: string; name: string; short?: string; agent: string; repeat: string; workflow: string; first_due: string; due: string; next_at: string;
  until_date?: string; state: string; vstate: string; when1: string; when2: string; how: string; slot: string;
  built: boolean; writes: string; needs_first: string[];
};
export type BSlot = { id: string; kind: string; agent: string; title: string; at: string; status: string; job: string; placeholder: boolean; templated: boolean };
export type BAgent = { id: string; name: string; icon: string };
export type Dot = "green" | "blue" | "orange" | "red";
export type BItem = { text: string; title: string; state: string; time: string; sort: string; slot: string; kind: string; dot: Dot; again: boolean };
export const DOT: Record<Dot, { cls: string; label: string }> = {
  green: { cls: "bg-green-500", label: "built: runs by itself" },
  blue: { cls: "bg-blue-500", label: "ready, needs you on the day" },
  orange: { cls: "bg-orange-400", label: "not built yet" },
  red: { cls: "bg-red-500", label: "blocked" },
};

/** A job's dot on one day. Live states (waiting / failed / overdue) only count for today. */
function jobDot(j: BJob, day: string, today: string, built: Record<string, boolean>): Dot {
  if (day === today && ["waiting", "failed", "overdue"].includes(j.state)) return "red";
  if (!j.built || j.state === "not_built") return "orange";
  if (j.needs_first.some((n) => built[n] === false)) return "red";
  if (j.agent === "james" || j.writes === "asks" || j.writes === "james") return "blue";
  return "green";
}
function postDot(st: string): Dot {
  return st === "failed" ? "red" : st === "template" ? "orange" : st === "approve" || st === "data" ? "blue" : "green";
}

const TZ = "America/New_York";
const DAY = 86400000;
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => {
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleString("en-GB", { timeZone: TZ, ...o });
};
const timeOf = (iso: string) => fmt(iso, { hour: "numeric", minute: "2-digit", hour12: true }).replace(":00", "").replace(" ", "");
const etDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const key = (t: number) => new Date(t).toISOString().slice(0, 10);
const noon = (ymd: string) => Date.parse(ymd + "T12:00:00Z");
const mondayOf = (ymd: string) => {
  const t = noon(ymd);
  return t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;
};
const shortName = (j: { short?: string; name: string }) => j.short || j.name.split(/[:(—]/)[0].trim();

/** One glyph + one plain word per state: jobs (the playbook's states) and posts (the Schedule's). Icons, no colours. */
export const BULLET_STATE: Record<string, { glyph: string; label: string; grey?: boolean; strike?: boolean }> = {
  done: { glyph: "✓", label: "done", strike: true }, running: { glyph: "⏳", label: "running" }, failed: { glyph: "✗", label: "failed" },
  due: { glyph: "▶", label: "due now" }, overdue: { glyph: "‼", label: "overdue" }, waiting: { glyph: "⏸", label: "waiting" },
  not_due: { glyph: "", label: "planned" }, not_built: { glyph: "◌", label: "not built yet", grey: true }, off: { glyph: "⏻", label: "switched off", grey: true },
  ticking: { glyph: "↻", label: "on its timer" }, past: { glyph: "", label: "", grey: true },
  approve: { glyph: "✋", label: "needs your ✅" }, approved: { glyph: "◷", label: "approved, goes out by itself" }, posted: { glyph: "✓", label: "posted", strike: true },
  template: { glyph: "◌", label: "needs a template", grey: true }, data: { glyph: "◔", label: "template ready, waiting on data", grey: true },
  you: { glyph: "✋", label: "yours" },
};

function postState(s: BSlot): string {
  if (s.status === "posted") return "posted";
  if (s.status === "failed") return "failed";
  if (s.status === "approved" || s.status === "scheduled") return "approved";
  if (s.placeholder) return s.templated ? "data" : "template";
  return "approve";
}

/** Every item per day (YYYY-MM-DD ET) per agent, for the days start..end. */
export function bulletDays(jobs: BJob[], slots: BSlot[], today: string, start: string, end: string): Record<string, Record<string, BItem[]>> {
  const byDay: Record<string, Record<string, BItem[]>> = {};
  const put = (day: string, agent: string, it: BItem) => {
    if (day < start || day > end) return;
    ((byDay[day] ??= {})[agent] ??= []).push(it);
  };
  const built = Object.fromEntries(jobs.map((j) => [j.id, !!j.built]));
  for (const j of jobs) {
    // left out: on-message jobs, the posting job itself (each post is listed), and anything that runs every day for
    // good (standing checks, the Manager's own morning runs): they'd fill every day. Weekly jobs show on their weekday.
    if (j.repeat === "on_message" || j.agent === "posts") continue;
    if (j.repeat !== "weekly" && j.repeat !== "once" && (j.workflow.endsWith("_standing") || !j.until_date)) continue;
    const title = `${j.name} · ${[j.when1, j.when2].filter(Boolean).join(" · ")} · ${j.how}`;
    const t = timeOf(j.first_due);
    const sort = fmt(j.first_due, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    if (j.repeat === "once") {
      const day = etDate(j.vstate === "done" ? j.due : j.next_at || j.due);
      put(day, j.agent, { text: shortName(j), title, state: j.vstate === "done" ? "done" : j.state === "done" ? "not_due" : j.state, time: t, sort, slot: j.slot, kind: "work", dot: jobDot(j, day, today, built), again: false }); // done before + a slot to come = a re-run
      continue;
    }
    const first = etDate(j.first_due);
    const last = j.until_date || end;
    const step = j.repeat === "weekly" ? 7 * DAY : DAY;
    let d0 = noon(first);
    while (key(d0) < start) d0 += step;
    for (let d = d0; key(d) <= last && key(d) <= end; d += step) {
      const k = key(d);
      const state = k === today ? (j.vstate === "today" ? "done" : j.repeat === "own_timer" ? "ticking" : j.state) : k < today ? "past" : "not_due";
      put(k, j.agent, { text: shortName(j), title, state, time: t, sort, slot: j.slot, kind: "work", dot: jobDot(j, k, today, built), again: k !== first });
    }
  }
  // Posts, and the Schedule's own tasks that aren't a playbook job (James's actions, the Manager's follow-ups, Check inspo)
  for (const s of slots) {
    if (!s.at || (s.kind !== "post" && s.job)) continue;
    const st = s.kind === "post" ? postState(s) : s.status === "done" ? "done" : s.kind === "action" ? "you" : "not_due";
    // posts by their state; James's own tasks need him (blue); other free tasks aren't a built job (orange)
    const dot: Dot = s.kind === "post" ? postDot(st) : st === "done" ? "green" : s.kind === "action" ? "blue" : "orange";
    const label = BULLET_STATE[st]?.label ?? st;
    put(etDate(s.at), s.agent, {
      text: s.title, title: `${s.title} · ${fmt(s.at, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} ET · ${label}`,
      state: st, time: timeOf(s.at), sort: fmt(s.at, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), slot: s.id, kind: s.kind, dot, again: false,
    });
  }
  for (const d of Object.values(byDay)) for (const list of Object.values(d)) list.sort((a, b) => a.sort.localeCompare(b.sort));
  return byDay;
}

const ORDER = ["gm", "data", "social", "posts", "inspo", "james"];

export default function WeekBullets({
  jobs, slots, anchors, today, byId, months = false, weeks = 2, tall = false, from, onItem, onModeChange,
}: {
  jobs: BJob[]; slots: BSlot[]; anchors: Record<string, string>; today: string; byId: Record<string, BAgent>;
  months?: boolean; // offer a Month view next to the weeks (the Schedule tab)
  weeks?: number; tall?: boolean; onItem?: (it: BItem) => void; onModeChange?: (m: "weeks" | "month") => void;
  from?: string; // one row of 7 days starting that day, not a Monday (the Slack picture: the next 7 days)
}) {
  const [mode, setMode] = useState<"weeks" | "month">("weeks");
  const [offset, setOffset] = useState(0); // weeks (or months) from this one
  const thisMonday = mondayOf(today);
  let first: number, rows: number, monthLabel = "";
  let inMonth: (k: string) => boolean = () => true;
  if (mode === "month") {
    const d = new Date(noon(today));
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + offset);
    const m0 = key(d.getTime()).slice(0, 7);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12));
    first = mondayOf(key(d.getTime()));
    rows = Math.floor((lastDay.getTime() - first) / DAY / 7) + 1;
    monthLabel = d.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    inMonth = (k: string) => k.slice(0, 7) === m0;
  } else if (from) {
    first = noon(from) + offset * 7 * DAY;
    rows = 1;
  } else {
    first = thisMonday + offset * 7 * DAY;
    rows = weeks;
  }
  const start = key(first), end = key(first + (rows * 7 - 1) * DAY);
  const byDay = bulletDays(jobs, slots, today, start, end);
  const miles: Record<string, string[]> = {};
  for (const [k, label] of [["picks_open", "Picks open"], ["lock", "Picks lock"], ["day_one", "Day 1"], ["event_end", "Finals"]] as const)
    if (anchors[k]) (miles[etDate(anchors[k])] ??= []).push(label);
  const ev0 = anchors.day_one ? etDate(anchors.day_one) : "", ev1 = anchors.event_end ? etDate(anchors.event_end) : "";
  const fmtDay = (t: number) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const switchMode = (m: "weeks" | "month") => {
    setMode(m);
    setOffset(0);
    onModeChange?.(m);
  };

  /** One day's lines grouped by agent. `phone`: bigger text that wraps, always with the time. */
  const dayItems = (k: string, phone: boolean) => {
    const agents = Object.keys(byDay[k] ?? {}).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    return (
      <div className={phone ? "mt-2 space-y-2" : "mt-1 space-y-1.5"}>
        {agents.map((ag) => (
          <div key={ag}>
            <div className={`flex items-center gap-1 font-black uppercase tracking-wide text-gray-500 dark:text-white/50 ${phone ? "text-[10px]" : "text-[9px]"}`}>
              <span className={phone ? "text-[13px]" : "text-[11px]"}>{byId[ag]?.icon ?? "•"}</span>
              <span className="truncate">{byId[ag]?.name ?? ag}</span>
            </div>
            <ul className={`ml-1 border-l border-gray-200 dark:border-white/10 ${phone ? "space-y-1 pl-2" : "pl-1.5"}`}>
              {byDay[k][ag].map((it, n) => {
                const st = BULLET_STATE[it.state];
                const cls = `block w-full text-left leading-tight ${phone ? "py-0.5 text-[13px]" : "truncate text-[10px]"} ${st?.strike ? "text-gray-400 line-through" : st?.grey || it.again ? "text-gray-400 dark:text-white/35" : ""}`;
                const body = (
                  <>
                    <span className={`mr-1 inline-block rounded-full align-middle ${phone ? "h-2 w-2" : "h-1.5 w-1.5"} ${DOT[it.dot].cls} ${it.again ? "opacity-50" : ""}`} title={DOT[it.dot].label} />
                    {st?.glyph && <span className="mr-0.5">{st.glyph}</span>}
                    {(tall || phone) && it.time && <span className="mr-1 text-gray-400">{it.time}</span>}
                    {it.text}
                  </>
                );
                return (
                  <li key={n} title={it.title}>
                    {onItem && it.slot ? <button className={`${cls} hover:underline`} onClick={() => onItem(it)}>{body}</button> : <span className={cls}>{body}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    );
  };
  const btn = "rounded border border-gray-200 px-2 py-0.5 hover:border-gray-500 dark:border-white/10";
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px]">
        {months && (
          <>
            <button className={`${btn} ${mode === "weeks" ? "bg-gray-900 text-white dark:bg-white dark:text-black" : ""}`} onClick={() => switchMode("weeks")}>Weeks</button>
            <button className={`${btn} ${mode === "month" ? "bg-gray-900 text-white dark:bg-white dark:text-black" : ""}`} onClick={() => switchMode("month")}>Month</button>
          </>
        )}
        <button className={btn} aria-label="Previous" title={mode === "month" ? "A month earlier" : "A week earlier"} onClick={() => setOffset(offset - 1)}>‹</button>
        <button className={btn} aria-label="Next" title={mode === "month" ? "A month later" : "A week later"} onClick={() => setOffset(offset + 1)}>›</button>
        {offset !== 0 && <button className="underline" onClick={() => setOffset(0)}>{mode === "month" ? "This month" : "This week"}</button>}
        <span className="ml-2 font-bold">{mode === "month" ? monthLabel : `${fmtDay(first)} – ${fmtDay(first + (rows * 7 - 1) * DAY)}`}</span>
        <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-gray-400 md:ml-auto md:w-auto">
          {(Object.keys(DOT) as Dot[]).map((d) => (
            <span key={d} className="flex items-center gap-1"><span className={`inline-block h-1.5 w-1.5 rounded-full ${DOT[d].cls}`} />{DOT[d].label}</span>
          ))}
          <span>· ✋ needs your ✅ · ◷ approved · ✓ done · grey = repeat</span>
        </span>
      </div>
      {/* Phone: one card per day, top to bottom (James 25 Oct 2026) */}
      <div className="space-y-2 md:hidden">
        {Array.from({ length: rows * 7 }, (_, n) => {
          const t = first + n * DAY;
          const k = key(t);
          const isToday = k === today, past = k < today, inEvent = !!ev0 && k >= ev0 && k <= ev1, other = !inMonth(k);
          const empty = !Object.keys(byDay[k] ?? {}).length;
          if (other) return null;
          if (past && offset === 0 && mode === "weeks" && !from) return null; // phone: this week starts today (‹ goes back)
          return (
            <div key={k} className={`rounded-xl border p-3 ${isToday ? "border-2 border-gray-900 dark:border-white" : "border-gray-100 dark:border-white/5"} ${inEvent ? "bg-gray-100 dark:bg-white/10" : "bg-white dark:bg-[#0d0d0d]"} ${past && !isToday ? "opacity-60" : ""}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-[13px] ${isToday ? "font-black" : "font-bold"}`}>
                  {isToday ? "Today · " : ""}{new Date(t).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                </span>
                {miles[k] && <span className="truncate rounded bg-gray-900 px-1.5 text-[9px] font-black uppercase tracking-wider text-white dark:bg-white dark:text-black">{miles[k].join(" · ")}</span>}
              </div>
              {empty ? <div className="mt-1 text-[12px] text-gray-400">Nothing planned</div> : dayItems(k, true)}
            </div>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <div className="min-w-[760px]">
          <div className="mb-1 grid grid-cols-7 gap-1 text-[9px] font-black uppercase tracking-widest text-gray-400">
            {Array.from({ length: 7 }, (_, i) => new Date(first + i * DAY).toLocaleString("en-GB", { weekday: "short", timeZone: "UTC" })).map((d) => <div key={d} className="px-1.5">{d}</div>)}
          </div>
          {Array.from({ length: rows }, (_, w) => (
            <div key={w} className="mb-1 grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }, (_, i) => {
                const t = first + (w * 7 + i) * DAY;
                const k = key(t);
                const isToday = k === today, past = k < today, inEvent = !!ev0 && k >= ev0 && k <= ev1, other = !inMonth(k);
                const agents = Object.keys(byDay[k] ?? {}).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
                return (
                  <div key={k} className={`${tall ? "min-h-[190px]" : "min-h-[150px]"} min-w-0 rounded-xl border p-1.5 ${isToday ? "border-2 border-gray-900 dark:border-white" : "border-gray-100 dark:border-white/5"} ${inEvent ? "bg-gray-100 dark:bg-white/10" : past ? "bg-gray-50/60 dark:bg-white/[0.02]" : "bg-white dark:bg-[#0d0d0d]"} ${(past && !isToday) || other ? "opacity-60" : ""}`}>
                    <div className="flex items-baseline justify-between gap-1">
                      <span className={`text-[11px] ${isToday ? "font-black" : "text-gray-400"}`}>{isToday ? "Today" : new Date(t).toLocaleString("en-GB", { day: "numeric", ...(new Date(t).getUTCDate() === 1 || i === 0 ? { month: "short" } : {}), timeZone: "UTC" })}</span>
                      {miles[k] && <span className="truncate rounded bg-gray-900 px-1 text-[8px] font-black uppercase tracking-wider text-white dark:bg-white dark:text-black" title={miles[k].join(" · ")}>{miles[k].join(" · ")}</span>}
                    </div>
                    {agents.length === 0 && <div className="mt-6 text-center text-[9px] text-gray-300 dark:text-white/20">—</div>}
                    {dayItems(k, false)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
