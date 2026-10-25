"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TaskDialog, TaskDrawer, type Act, type Agent, type Slot } from "./SocialCalendar";
import { pill, primaryButton, sectionLabel } from "./types";
import WeekBullets, { type BAgent, type BItem, type BJob, type BSlot } from "./WeekBullets";

/**
 * Schedule tab (James 25 Oct 2026): the whole team's calendar as bullet points, like the Workflows page: Monday →
 * Sunday weeks (or a month), each day's jobs and posts grouped by agent, every repeating job on every day it runs.
 * Click a job or task for its panel (move it, tick it, notes); click a post and it opens on the Social calendar, where
 * posts are approved. "+ Task" adds agent work or something for James. Data: /api/admin/workflows (jobs, states,
 * slots) + /api/admin/scheduler (the slots in full, for the panels). Month + ‹ › ("Previous" / "Next") are what
 * agents/calendar_shot.mjs clicks for the Slack screenshots.
 */

type View = {
  event: string; eventName: string; date: string; anchors: Record<string, string>; slots: BSlot[];
  team: (BAgent & { kind: string })[]; cards: { workflows: { steps: BJob[] }[] }[]; needsYou: unknown[]; error?: string;
};
type Sched = { event: string; slots: Slot[]; agents: Agent[]; error?: string };

export default function TeamSchedule() {
  const router = useRouter();
  const [view, setView] = useState<View | null>(null);
  const [sched, setSched] = useState<Sched | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [deepLinked, setDeepLinked] = useState(false);

  const load = useCallback(async () => {
    const [v, s] = await Promise.all([
      fetch("/api/admin/workflows", { cache: "no-store" }).then((r) => r.json() as Promise<View>),
      fetch("/api/admin/scheduler", { cache: "no-store" }).then((r) => r.json() as Promise<Sched>),
    ]);
    if (v.error || s.error) setErr(v.error || s.error || "");
    setView(v);
    setSched(s);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
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

  // ?slot=<id>: a post goes to the Social calendar; a job or task opens its panel here
  useEffect(() => {
    if (!sched || deepLinked) return;
    setDeepLinked(true);
    const id = new URLSearchParams(window.location.search).get("slot");
    const s = id ? sched.slots.find((x) => x.id === id) : undefined;
    if (!s) return;
    if (s.kind === "post") router.replace(`/admin/social?slot=${s.id}`);
    else setOpen(s.id);
  }, [sched, deepLinked, router]);

  const jobs = useMemo(() => (view?.cards ?? []).flatMap((c) => c.workflows.flatMap((w) => w.steps)), [view]);
  const byId = useMemo(() => Object.fromEntries((view?.team ?? []).map((a) => [a.id, a])), [view]);
  const onItem = (it: BItem) => (it.kind === "post" ? router.push(`/admin/social?slot=${it.slot}`) : setOpen(it.slot));
  const slot = sched?.slots.find((s) => s.id === open) ?? null;

  return (
    <main className="mx-auto max-w-7xl px-5 py-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <div className={sectionLabel}>Schedule{view ? ` · ${view.eventName}` : ""}</div>
          <h1 className="text-2xl font-black uppercase tracking-wide">The team&apos;s calendar</h1>
          <div className="text-[12px] text-gray-500 dark:text-white/50">
            Every job and post, one line each. Click a job to move or tick it; posts open on the{" "}
            <Link href="/admin/social" className="underline">Social calendar</Link>, where you approve them. Times are US Eastern.
          </div>
        </div>
        <Link href="/admin/workflows#needs-you" className={pill(false)}>✋ What needs you</Link>
        <button className={primaryButton} disabled={busy || !sched} onClick={() => setAdding(true)}>+ Task</button>
      </div>
      {err && <div className="mb-3 text-[11px] text-red-500">{err}</div>}
      <section className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/5 dark:bg-[#0d0d0d]">
        {!view ? (
          <div className="text-[11px] text-gray-400">Loading…</div>
        ) : (
          <WeekBullets jobs={jobs} slots={view.slots} anchors={view.anchors} today={view.date} byId={byId} months tall onItem={onItem} />
        )}
      </section>
      {adding && sched && (
        <TaskDialog
          agents={sched.agents}
          busy={busy}
          onAdd={async (t) => {
            const id = await act({ action: "task", event: sched.event, ...t });
            if (typeof id === "string") {
              setAdding(false);
              setOpen(id);
            }
          }}
          onClose={() => setAdding(false)}
        />
      )}
      {slot && slot.kind !== "post" && sched && <TaskDrawer key={slot.id} s={slot} agents={sched.agents} busy={busy} act={act} onClose={() => setOpen(null)} />}
    </main>
  );
}
