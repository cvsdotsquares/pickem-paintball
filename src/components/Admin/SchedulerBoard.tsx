"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IoMdClose } from "react-icons/io";
import { genUrl, toneClass } from "./generatorTypes";
import { pill, primaryButton, sectionLabel } from "./types";

/**
 * Scheduler (admin page 4): an event's posts on a calendar (Month, or Week for bigger previews).
 * Drag a post from "Not on the calendar" onto a day, drag a draft to another day, click any post for
 * its panel: slides, caption, details, data it needs, what's blocking it, Approve.
 * Approved posts go out on Instagram + Facebook by themselves (cloud job, every 5 min). Times are US Eastern.
 * Plan: pickem-hub/ideas/2026-10-17-scheduler-plan.md.
 */

type Check = { level: "block" | "warn"; text: string };
type Slot = {
  id: string;
  event: string;
  type: string;
  variant: string;
  title: string;
  status: "draft" | "approved" | "sending" | "posted" | "failed";
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
  preview: string[];
  data: { source: string; madeAt: string; test: boolean; typed: Record<string, string>; waiting: { label: string; hint: string }[] };
  variants: { key: string; name: string; png: string; caption: string }[];
  checks: Check[];
  link: string;
};
type TrayItem = { type: string; variant: string; title: string; label: string; phase: string; priority: string; png: string; placeholder: boolean };
type Data = {
  event: string;
  events: { id: string; label: string }[];
  slots: Slot[];
  tray: TrayItem[];
  dates: { date: string; label: string }[];
  posts: { png: string; title: string }[];
  error?: string;
};

const TZ = "America/New_York";
const DEFAULT_TIME = "12:00";
const field =
  "w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-gray-400 dark:border-white/10 dark:bg-white/5";

/** ISO → US Eastern date + time ("2026-11-12", "08:00"). */
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

/** Status → pill (panel colours: orange = your turn, blue = scheduled/working, green = done, red = failed). */
function statusPill(s: Slot): { label: string; tone: string } {
  if (s.placeholder) return { label: "Not made yet", tone: "grey" };
  if (s.status === "draft") return { label: s.checks.some((c) => c.level === "block") ? "Blocked" : "Needs approval", tone: "orange" };
  if (s.status === "approved") return { label: "Scheduled", tone: "blue" };
  if (s.status === "sending") return { label: "Sending…", tone: "blue" };
  if (s.status === "posted") return { label: "Posted ✓", tone: "green" };
  return { label: "Failed", tone: "red" };
}
const edge: Record<string, string> = {
  grey: "border-l-gray-300 dark:border-l-white/20",
  orange: "border-l-orange-500",
  blue: "border-l-[#1a3c6e] dark:border-l-[#39b5e6]",
  green: "border-l-green-600",
  red: "border-l-red-500",
};

export default function SchedulerBoard() {
  const [data, setData] = useState<Data | null>(null);
  const [event, setEvent] = useState("");
  const [mode, setMode] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(todayET());
  const [open, setOpen] = useState<string | null>(null);
  const [trayFilter, setTrayFilter] = useState<"all" | "made" | "planned">("all");
  const [adding, setAdding] = useState<TrayItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async (ev = event) => {
    const r = await fetch(`/api/admin/scheduler${ev ? `?event=${ev}` : ""}`);
    const d = (await r.json()) as Data;
    if (d.error) setErr(d.error);
    setData(d);
    if (!ev && d.event) setEvent(d.event);
  }, [event]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const act = useCallback(
    async (body: Record<string, unknown>, confirmText?: string) => {
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

  const byDay = useMemo(() => {
    const m: Record<string, Slot[]> = {};
    for (const s of data?.slots ?? []) {
      const d = et(s.publishAt).date || "unscheduled";
      (m[d] ??= []).push(s);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => (a.publishAt ?? "").localeCompare(b.publishAt ?? ""));
    return m;
  }, [data]);
  const datesByDay = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const d of data?.dates ?? []) (m[d.date] ??= []).push(d.label);
    return m;
  }, [data]);

  const days = useMemo(() => {
    if (mode === "week") return Array.from({ length: 7 }, (_, i) => addDays(monday(anchor), i));
    const first = `${anchor.slice(0, 7)}-01`;
    const start = monday(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [mode, anchor]);

  const step = (n: number) => {
    if (mode === "week") return setAnchor(addDays(anchor, 7 * n));
    const d = parse(`${anchor.slice(0, 7)}-01`);
    d.setMonth(d.getMonth() + n);
    setAnchor(ymd(d));
  };
  const heading =
    mode === "month"
      ? parse(`${anchor.slice(0, 7)}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
      : `${parse(days[0]).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${parse(days[6]).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

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
      if (s.status !== "draft" && s.status !== "failed") return setErr("Un-approve it first to move it");
      await act({ action: "save", id: s.id, at: `${day}T${et(s.publishAt).time || DEFAULT_TIME}` });
    }
  };

  const slot = data?.slots.find((s) => s.id === open) ?? null;
  const trayItems = (data?.tray ?? []).filter((t) => trayFilter === "all" || (trayFilter === "made") === !t.placeholder);
  const phases = Array.from(new Set(trayItems.map((t) => t.phase)));
  const today = todayET();

  return (
    <main className="flex h-[calc(100vh-45px)] flex-col gap-4 px-5 py-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-black uppercase tracking-widest">Scheduler</h1>
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
          {(["month", "week"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={pill(mode === m)}>
              {m === "month" ? "Month" : "Week"}
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
        <span className="ml-auto flex flex-wrap items-center gap-2 text-[10px] text-gray-400 dark:text-white/40">
          {[
            ["grey", "Not made yet"],
            ["orange", "Needs approval / blocked"],
            ["blue", "Scheduled"],
            ["green", "Posted"],
            ["red", "Failed"],
          ].map(([t, l]) => (
            <span key={t} className={`rounded-full px-2 py-0.5 font-bold ${toneClass(t)}`}>
              {l}
            </span>
          ))}
          <span>Times are US Eastern · goes to Instagram + Facebook</span>
        </span>
      </div>

      {err && (
        <div className="flex items-start gap-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:bg-red-500/10 dark:text-red-300">
          <span className="flex-1">{err}</span>
          <button onClick={() => setErr("")}>
            <IoMdClose />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Not on the calendar */}
        <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-gray-100 bg-white p-3 dark:border-white/5 dark:bg-[#0d0d0d]">
          <div className={sectionLabel}>Not on the calendar ({data?.tray.length ?? 0})</div>
          <p className="text-[10px] text-gray-400 dark:text-white/40">Drag onto a day (lands as a draft at {nice(DEFAULT_TIME)} ET), or click to pick a date.</p>
          <div className="flex gap-1">
            {(["all", "made", "planned"] as const).map((f) => (
              <button key={f} onClick={() => setTrayFilter(f)} className={pill(trayFilter === f)}>
                {f === "all" ? "All" : f === "made" ? "Made" : "Not made"}
              </button>
            ))}
          </div>
          {phases.map((ph) => (
            <div key={ph} className="flex flex-col gap-1.5">
              <div className={sectionLabel}>{ph}</div>
              {trayItems
                .filter((t) => t.phase === ph)
                .map((t) => (
                  <div
                    key={`${t.type}|${t.variant}`}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ tray: t }))}
                    onClick={() => setAdding(t)}
                    title={t.placeholder ? "Not made yet: place it to hold the date" : t.title}
                    className={`flex cursor-grab items-center gap-2 rounded-lg border p-1.5 text-[11px] active:cursor-grabbing ${
                      t.placeholder
                        ? "border-dashed border-gray-300 text-gray-500 dark:border-white/15 dark:text-white/50"
                        : "border-gray-100 hover:border-gray-400 dark:border-white/5 dark:hover:border-white/30"
                    }`}
                  >
                    {t.png ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={genUrl(t.png, true)} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-gray-100 text-[9px] dark:bg-white/5">plan</span>
                    )}
                    <span className="line-clamp-2">
                      {t.title}
                      {t.priority === "nice" && <span className="ml-1 text-gray-400">(nice)</span>}
                    </span>
                  </div>
                ))}
            </div>
          ))}
          {!data && <p className="text-[11px] text-gray-400">Loading…</p>}
          {data && !data.tray.length && <p className="text-[11px] text-gray-400">Everything is on the calendar.</p>}
        </aside>

        {/* Calendar */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-white/5 dark:bg-[#0d0d0d]">
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
                  <div className="flex items-center gap-1">
                    <span
                      className={`text-[11px] font-black ${day === today ? "rounded-full bg-[#1a3c6e] px-1.5 text-white" : other ? "text-gray-300 dark:text-white/20" : ""}`}
                    >
                      {parse(day).getDate()}
                    </span>
                  </div>
                  {(datesByDay[day] ?? []).map((l) => (
                    <span key={l} className="truncate rounded bg-[#00f976]/20 px-1 text-[9px] font-bold text-green-800 dark:text-[#00f976]">
                      {l}
                    </span>
                  ))}
                  {(byDay[day] ?? []).map((s) => (
                    <SlotChip key={s.id} s={s} big={mode === "week"} onClick={() => setOpen(s.id)} />
                  ))}
                </div>
              );
            })}
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

      {slot && (
        <SlotDrawer
          key={slot.id}
          s={slot}
          posts={data?.posts ?? []}
          busy={busy}
          act={act}
          onClose={() => setOpen(null)}
        />
      )}
    </main>
  );
}

/** Click-to-add (works on a phone/iPad too, where dragging doesn't). */
function AddDialog({ item, busy, onAdd, onClose }: { item: TrayItem; busy: boolean; onAdd: (at: string) => void; onClose: () => void }) {
  const [date, setDate] = useState(addDays(todayET(), 1));
  const [time, setTime] = useState(DEFAULT_TIME);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-sm flex-col gap-3 rounded-xl bg-white p-5 dark:bg-[#0d0d0d]">
        <div className="text-sm font-black">{item.title}</div>
        {item.png ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={genUrl(item.png, true)} alt="" className="w-full rounded-lg" />
        ) : (
          <p className="text-[12px] text-gray-500">Not made yet. This holds the date; the post joins it once it&apos;s made.</p>
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
      </div>
    </div>
  );
}

function SlotChip({ s, big, onClick }: { s: Slot; big: boolean; onClick: () => void }) {
  const p = statusPill(s);
  const time = et(s.publishAt).time;
  const movable = s.status === "draft" || s.status === "failed";
  return (
    <button
      draggable={movable}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ slot: s.id }))}
      onClick={onClick}
      title={`${s.title} · ${p.label}`}
      className={`flex w-full ${big ? "flex-col" : "items-center"} gap-1.5 rounded-md border border-l-4 border-gray-100 bg-white p-1 text-left text-[10px] hover:border-gray-400 dark:border-white/5 dark:bg-[#141414] dark:hover:border-white/30 ${edge[p.tone]} ${
        s.placeholder ? "border-dashed opacity-70" : ""
      }`}
    >
      {s.preview[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={genUrl(s.preview[0], true)} alt="" className={`${big ? "aspect-[4/5] w-full" : "h-7 w-7"} shrink-0 rounded object-cover ${s.placeholder ? "grayscale" : ""}`} />
      ) : (
        <span className={`${big ? "aspect-[4/5] w-full" : "h-7 w-7"} flex shrink-0 items-center justify-center rounded bg-gray-100 text-[8px] dark:bg-white/5`}>plan</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-bold">
          {time ? nice(time) : "—"}
          {s.slides.length > 1 && <span className="ml-1 font-normal text-gray-400">· {s.slides.length} slides</span>}
        </span>
        <span className={`block ${big ? "" : "truncate"}`}>{s.title}</span>
        {big && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 font-bold ${toneClass(p.tone)}`}>{p.label}</span>}
      </span>
    </button>
  );
}

function SlotDrawer({
  s,
  posts,
  busy,
  act,
  onClose,
}: {
  s: Slot;
  posts: { png: string; title: string }[];
  busy: boolean;
  act: (body: Record<string, unknown>, confirmText?: string) => Promise<string | boolean>;
  onClose: () => void;
}) {
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

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

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
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-xl flex-col gap-5 overflow-y-auto bg-white p-6 dark:bg-[#0d0d0d]"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="text-base font-black">{s.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${toneClass(p.tone)}`}>{p.label}</span>
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
              <img
                src={genUrl(slides[Math.min(shown, slides.length - 1)])}
                alt=""
                className={`w-full rounded-lg border border-gray-100 dark:border-white/5 ${s.placeholder ? "opacity-60 grayscale" : ""}`}
              />
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
              Not made yet
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
            <select
              value=""
              onChange={(e) => e.target.value && setSlides([...s.slides, e.target.value])}
              className={field}
              disabled={busy || s.slides.length >= 10}
            >
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
            <input
              type="time"
              value={time}
              step={300}
              disabled={!editable || busy}
              onChange={(e) => setTime(e.target.value)}
              onBlur={() => time !== t.time && saveWhen(date, time)}
              className={field}
            />
          </div>
          {s.publishAt && <span className="text-[11px] text-gray-500 dark:text-white/50">Your time: {local(s.publishAt)}</span>}
        </div>

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
                  c.text.startsWith("Ready")
                    ? "bg-green-50 text-green-800 dark:bg-green-500/10 dark:text-green-300"
                    : "bg-orange-50 text-orange-800 dark:bg-orange-500/10 dark:text-orange-300"
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
              <button
                disabled={busy}
                onClick={() => act({ action: "postnow", id: s.id }, "Post this now? It goes out within 5 minutes on Instagram and Facebook.")}
                className={pill(false)}
              >
                Post now
              </button>
            </>
          )}
          {s.status !== "posted" && s.status !== "sending" && (
            <button
              disabled={busy}
              onClick={async () => (await act({ action: "remove", id: s.id }, "Take this off the calendar?")) && onClose()}
              className={`${pill(false)} ml-auto`}
            >
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
            <span className="text-[12px] text-gray-500 dark:text-white/50">{s.placeholder ? "Known once the template is signed off." : "Nothing missing."}</span>
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
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== s.notes && act({ action: "save", id: s.id, notes })}
            rows={3}
            className={field}
            placeholder="Anything to remember about this post"
          />
        </label>
      </aside>
    </div>
  );
}
