"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { primaryButton, sectionLabel } from "./types";
import WeekBullets, { type BSlot } from "./WeekBullets";

/**
 * Workflows (admin page 5, James 18 Oct 2026): the team of agents, for a human to read at a glance.
 * Redesigned after James's feedback (18 Oct: "what a computer would find easy to navigate, not a human"), taking the
 * cues of agent mission-control dashboards and org-chart systems: lead with what needs you and why; big tiles with a
 * fixed set of states; one event roadmap with a today marker; the team as avatars with one agent's detail open at a
 * time (focused view, not every card stacked); workflows as progress tracks with short labels; the brief as a message,
 * not a dump. Icons only, no colour coding (James). Data: /api/admin/workflows (src/lib/admin/workflows.ts).
 */

type AgentRow = { id: string; name: string; icon: string; blurb: string; parent: string; kind: "agent" | "job"; enabled: boolean; paused_until: string; status: "on" | "off" | "paused" };
type Report = {
  agent: string; job: string; name: string; started: string; finished: string; result: string; summary: string; checks: { text: string; state: string; note: string }[];
  actions: string[]; files: string[]; needs: ({ who?: string; why?: string } | string)[]; would_send?: { channel: string; text: string }[]; test?: boolean; model?: string;
  duration_ms?: number | null; turns?: number | null; cost_usd?: number | null; brief?: string; file: string;
};
type LogLine = { at: string; agent: string; job: string; action: string; link?: string; note?: string; report?: string };
type Job = {
  id: string; name: string; agent: string; workflow: string; repeat: string; needs_first: string[]; inputs: string[]; done: string; checks: string[]; writes: string; built: boolean;
  model: string; due: string; first_due: string; state: string; waiting_on?: string[]; last_report: string; last_result: string; last_summary: string; icon: string; agent_name: string; slot: string;
  short?: string; until_date?: string; vstate: string; when1: string; when2: string; how: string; next_at: string; counts: boolean;
};
type Timer = { label: string; name: string; ok: boolean; running: boolean; exit: string; lastOutput: string };
type Done = { icon: string; agent: string; task: string; when: string; result: string; link: string; kind: string };
type Upcoming = { icon: string; agent: string; task: string; due: string; waiting: string; link: string; state: string };
type Card = {
  agent: AgentRow; children: AgentRow[]; lastRun: Report | null; nextRun: { when: string; why: string; job: string } | null; waitingOn: string[];
  workflows: { id: string; name: string; steps: Job[] }[]; actions: LogLine[]; jobRuns: { id: string; label: string; status: string; startedAt: string; summary: string }[];
};
type PostCheck = { id: string; title: string; due: string; done: boolean; note: string; link: string };
type NeedsYou = { text: string; due: string; link: string; kind: "input" | "approve" | "blocked" | "review" | "posts"; posts?: PostCheck[] };
type View = {
  event: string; eventName: string; date: string; planningStart: string; team: AgentRow[]; completed: Done[]; upcoming: Upcoming[];
  brief: { text: string; at: string; test: boolean; file: string } | null; inputs: { text: string; done: boolean }[]; inputsCard: string; needsYou: NeedsYou[];
  anchors: Record<string, string>; listener: { on: boolean; lastWake: string; lastWakeText: string }; timers: Timer[]; wakeups: string[]; slots: BSlot[]; cards: Card[]; error?: string;
};

const TZ = "America/New_York";
const DAY = 86400000;
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => {
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleString("en-GB", { timeZone: TZ, ...o });
};
const dayOf = (iso: string) => fmt(iso, { weekday: "short", day: "numeric", month: "short" });
const timeOf = (iso: string) => fmt(iso, { hour: "numeric", minute: "2-digit", hour12: true });
const etDate = (iso: string) => fmt(iso, { year: "numeric", month: "2-digit", day: "2-digit" }).split("/").reverse().join("-"); // YYYY-MM-DD in ET
const ago = (iso: string) => {
  const ms = Date.now() - Date.parse(iso);
  if (isNaN(ms)) return "";
  const m = Math.round(ms / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const inDays = (iso: string, today: string) => Math.round((Date.parse(iso.slice(0, 10) + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / DAY);
const relDay = (iso: string, today: string) => {
  const n = inDays(iso, today);
  return n === 0 ? "Today" : n === 1 ? "Tomorrow" : n === -1 ? "Yesterday" : n < 0 ? `${-n} days ago` : dayOf(iso);
};
/** One glyph + one plain word per state (a fixed vocabulary, icons not colours). */
const STATE: Record<string, { glyph: string; label: string }> = {
  done: { glyph: "✓", label: "done" }, running: { glyph: "⏳", label: "running" }, failed: { glyph: "✗", label: "failed" }, due: { glyph: "▶", label: "due now" },
  overdue: { glyph: "‼", label: "overdue" }, waiting: { glyph: "⏸", label: "waiting" }, not_due: { glyph: "○", label: "later" }, not_built: { glyph: "◌", label: "not built yet" },
  off: { glyph: "⏻", label: "switched off" }, skipped: { glyph: "–", label: "skipped" },
  today: { glyph: "✓", label: "ran today" }, ticking: { glyph: "↻", label: "on its timer" }, listen: { glyph: "↩", label: "waits for your ✅" },
};
const shortName = (j: { short?: string; name: string }) => j.short || j.name.split(/[:(—]/)[0].trim();
/** "2026-10-25T08:30" (ET wall time, the day planner's wake-ups) → "8:30 AM" */
const wallTime = (w: string) => {
  const [h, m] = w.slice(11, 16).split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const KIND_ICON: Record<NeedsYou["kind"], string> = { input: "📥", approve: "✅", blocked: "⛔", review: "📋", posts: "📣" };
const card = "rounded-2xl border border-gray-100 dark:border-white/5 bg-white dark:bg-[#0d0d0d]";
const field = "rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-gray-400 dark:border-white/10 dark:bg-white/5";
const reportUrl = (rel: string) => `/api/admin/workflows?report=${encodeURIComponent(rel)}`;

/** Turn a log line into a human sentence: "drafted the brief" rather than "finished ok — Test run: …". */
function humanAction(l: LogLine, byId: Record<string, AgentRow>, jobName: (id: string) => string) {
  const who = byId[l.agent]?.name ?? l.agent;
  const job = jobName(l.job);
  if (l.action.startsWith("started")) return `${who} started ${job}${l.action.includes("test") ? " (test)" : ""}`;
  if (l.action.startsWith("finished ok")) return `${who} finished ${job}${l.note ? ` — ${l.note}` : ""}`;
  if (l.action.startsWith("failed")) return `${who} could not finish ${job}: ${l.action.replace(/^failed:\s*/, "")}`;
  if (l.action.startsWith("slot added")) return `${who} put “${l.action.replace("slot added: ", "")}” on the Schedule`;
  return `${who} · ${job}: ${l.action}${l.note ? ` — ${l.note}` : ""}`;
}

/**
 * "Chat to the Manager / Data agent / Social agent" (James, 18 Oct): a new Claude Code session in pickem-hub with the
 * agent's role as its first message, like the TO DO board's "Work on this in Claude". The Manager's chat is where the
 * team's ways of working change (playbook, agents.json, skills) and it cascades to the other agents; an agent's own chat
 * is for its own work and responsibilities. Stage 2 gives Data and Social their skills.
 */
function chatLink(a: AgentRow): string {
  const skill = { gm: "pickem-manager", data: "pickem-data", social: "pickem-social-growth" }[a.id] ?? "";
  const lines = [
    `Let's talk. You are the ${a.name} ${a.icon} on Pick'Em Paintball's team of agents (plan: ideas/2026-10-18-agents-plan.md; the team: scheduler/agents.json; every job: scheduler/playbook.json; how runs work: agents/README.md).`,
    a.id === "data"
      ? "Follow the pickem-data skill. Every Data job is built and runs on its own (docs/DATA_FLOW.md): the Manager's day planner starts dated jobs at their Schedule slot time, timers run the rest, and my ✅s in Slack wake the listener. Use this chat to run one by hand, change one (its task file + the playbook; my OK before `built` changes), or explain a result. Log anything you touch with agents/log.py. Changes to your responsibilities or to the team's rules go to the Manager."
      : a.id === "social"
      ? "Follow the pickem-social-growth skill. You plan and run our Instagram + Facebook content and coach me on growth: when you suggest something, say why in one line (which signal, which past result). World Cup 2026 is the learning event: we do each social job together here, and as each one is done you write or update its task file in the skill's tasks/ folder, record it with python3 agents/record.py social <job_id> --result ok --minutes <n> --summary \"…\", and log what you touched. You only draft on the Schedule (agents/schedule.py); you never approve or post. Changes to your responsibilities or the team's rules go to the Manager."
      : a.id === "gm"
      ? "Follow the pickem-manager skill (section “Chat with James”). This chat is where we discuss tasks, the agents' responsibilities and our ways of working. When I ask for a change: a responsibility → agents.json blurb and the playbook; a task → the playbook (and a Schedule slot through the admin API if it's dated); a way of working → your skill and the plan doc. Cascade anything that belongs to the Data agent or the Social media agent: change their playbook jobs and leave them a dated note under “From the Manager” in their skill (pickem-data / pickem-social-growth) and, for a Data job, its task file."
      : `${skill ? `Your skill will be ${skill} (stage 2); until it exists, this chat is for your responsibilities and how your jobs should work, not for doing them. ` : ""}When I ask for a change to your work: edit your jobs in scheduler/playbook.json (when, needs-first, done-looks-like, checks, writes vs asks) and note decisions in ideas/2026-10-18-agents-plan.md under “Notes for stage 2”. Anything that changes another agent's work or the team's rules goes to the Manager: say so and I'll take it there.`,
    "James's rules: one step at a time, plain language, one question at a time, approval before building anything, never deploy without being asked. Start by telling me in a short paragraph where things stand for you right now (python3 agents/playbook.py schedule, your latest reports in agents/runs/), then ask what I want to talk about.",
  ];
  const q = new URLSearchParams({ q: lines.join("\n\n").slice(0, 13000), folder: "~/Documents/pickem-hub" });
  return `claude://code/new?${q.toString()}`;
}

export default function WorkflowsBoard() {
  const [data, setData] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Report | null>(null);
  const [selected, setSelected] = useState<string>("gm");
  const router = useRouter();

  const load = useCallback(() => {
    fetch("/api/admin/workflows", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : (setError(""), setData(d))));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);
  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setNote("");
      try {
        const r = await fetch("/api/admin/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const d = await r.json();
        if (!r.ok) setError(d.error ?? "Could not save");
        else if (d.note) setNote(d.note);
        load();
      } finally {
        setBusy(false);
      }
    },
    [load],
  );
  const openReport = useCallback((file: string) => {
    fetch(reportUrl(file), { cache: "no-store" })
      .then((r) => r.json())
      .then((r) => setOpen({ ...r, file }))
      .catch(() => alert("Could not open the report"));
  }, []);

  const byId = useMemo(() => Object.fromEntries((data?.team ?? []).map((a) => [a.id, a])), [data]);
  const allJobs = useMemo(() => (data?.cards ?? []).flatMap((c) => c.workflows.flatMap((w) => w.steps)), [data]);
  const jobName = useCallback((id: string) => allJobs.find((j) => j.id === id)?.name ?? id.replace(/_/g, " "), [allJobs]);

  if (!data) return <div className="p-8 text-xs text-gray-400">{error || "Loading…"}</div>;
  const today = data.date;
  const running = allJobs.filter((j) => j.state === "running");
  const doneToday = data.completed.filter((d) => etDate(d.when) === today && !d.result.startsWith("failed"));
  const failed = data.completed.filter((d) => d.result.startsWith("failed") && inDays(d.when, today) >= -1);
  const sel = data.cards.find((c) => c.agent.id === selected) ?? data.cards[0];
  const picksIn = inDays(data.anchors.picks_open, today);
  const lockIn = inDays(data.anchors.lock, today);
  const dayOneIn = inDays(data.anchors.day_one, today);
  const phase =
    picksIn > 0 ? `Picks open in ${picksIn} day${picksIn === 1 ? "" : "s"}` : lockIn > 0 ? `Picks are open · lock in ${lockIn} day${lockIn === 1 ? "" : "s"}` : dayOneIn >= 0 && inDays(data.anchors.event_end, today) >= 0 ? "Event week" : inDays(data.anchors.event_end, today) < 0 ? "After the event" : "Picks locked";

  return (
    <main className="mx-auto flex max-w-6xl flex-col px-3 py-4 sm:px-5 sm:py-6 md:block">
      {/* ── Today ─────────────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
        <div className="flex-1">
          <div className={sectionLabel}>Workflows · {data.eventName}</div>
          <h1 className="text-2xl font-black uppercase tracking-wide">{dayOf(today + "T12:00:00")}</h1>
          <div className="text-[12px] text-gray-500 dark:text-white/50">{phase} · lock {dayOf(data.anchors.lock)} {timeOf(data.anchors.lock)} ET · event {dayOf(data.anchors.day_one)} – {dayOf(data.anchors.event_end)}</div>
          <div className="mt-1 text-[11px] text-gray-500 dark:text-white/50" title="Slack listener (launchd com.pickem.listener): wakes an agent the moment you post">
            💬 Slack listener {data.listener.on ? "on" : "⏻ off — messages wait until it's back"}
            {data.listener.lastWake ? ` · last woke ${ago(data.listener.lastWake)}: ${data.listener.lastWakeText.slice(0, 60)}` : " · no wakes yet"}
          </div>
          <Timers timers={data.timers} wakeups={data.wakeups} />
        </div>
        {byId.gm && (
          <a href={chatLink(byId.gm)} className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-black uppercase tracking-widest hover:border-gray-900 dark:border-white/20 dark:hover:border-white" title="Discuss tasks, responsibilities and ways of working; the Manager cascades changes to the agents">
            💬 Chat to the Manager
          </a>
        )}
        <button className={primaryButton} disabled={busy} onClick={() => act({ action: "run", agent: "gm", job: "morning" })} title="Plan if needed, update the inputs list, post the brief">
          🧢 Run the Manager now
        </button>
      </div>
      {error && <div className="mb-3 text-[11px] text-red-500">{error}</div>}
      {note && <div className="mb-3 text-[11px] text-gray-600 dark:text-white/60">{note}</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon="✋" n={data.needsYou.length} label={data.needsYou.length === 1 ? "thing needs you" : "things need you"} sub={data.needsYou[0] ? `first: ${data.needsYou[0].text.split(" — ")[0].slice(0, 40)}` : "nothing waiting on you"} href="#needs-you" />
        <Tile icon="⏳" n={running.length} label={running.length === 1 ? "job running" : "jobs running"} sub={running[0] ? running[0].name : "the team is idle"} href="#team" />
        <Tile icon="✓" n={doneToday.length} label="done today" sub={doneToday[0] ? `latest: ${doneToday[0].task}` : "nothing finished yet today"} href="#happened" />
        <Tile icon="⚠️" n={failed.length} label={failed.length === 1 ? "failure" : "failures"} sub={failed[0] ? failed[0].task : "nothing failed since yesterday"} href="#happened" />
      </div>

      {/* ── Roadmap ───────────────────────────────────────────────────────── */}
      <section className={`${card} order-3 mb-4 p-4 md:order-none`}>
        <div className={`${sectionLabel} mb-2`}>Two weeks, Monday to Sunday · what each agent does each day · the full calendar is the Schedule tab</div>
        <WeekBullets
          jobs={allJobs}
          slots={data.slots}
          anchors={data.anchors}
          today={today}
          byId={byId}
          onItem={(it) => router.push(it.kind === "post" ? `/admin/social?slot=${it.slot}` : `/admin/scheduler?slot=${it.slot}`)}
        />
      </section>

      {/* ── Needs you + Up next ───────────────────────────────────────────── */}
      <div className="order-1 mb-4 grid gap-4 md:order-none md:grid-cols-2 [&>*]:min-w-0">
        <section id="needs-you" className={`${card} scroll-mt-16 p-4`}>
          <div className="mb-2 flex items-baseline justify-between">
            <div className={sectionLabel}>✋ Needs you</div>
            {data.inputsCard && <Link href="/admin/todo" className="text-[10px] text-gray-400 underline">the Inputs needed card</Link>}
          </div>
          {data.needsYou.length === 0 && <Empty>Nothing. Enjoy it.</Empty>}
          <ol className="space-y-2">
            {data.needsYou.map((n, i) => {
              if (n.kind === "posts") return <ApprovePosts key={i} n={n} today={today} />;
              const [what, forWhat] = n.text.split(" — ");
              return (
                <li key={i} className="flex items-start gap-3 rounded-xl border border-gray-100 p-3 dark:border-white/5">
                  <span className="text-lg leading-none">{KIND_ICON[n.kind]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-bold">{what}</div>
                    {forWhat && <div className="text-[11px] text-gray-500 dark:text-white/50">{forWhat}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    {n.due && <div className={`text-[11px] font-bold ${inDays(n.due, today) <= 2 ? "" : "text-gray-500 dark:text-white/50"}`}>{relDay(n.due, today)}</div>}
                    {n.link && <Link href={n.link} className="text-[10px] text-gray-400 underline hover:text-gray-900 dark:hover:text-white">open</Link>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
        <section className={`${card} p-4`}>
          <div className={`${sectionLabel} mb-2`}>📅 Up next</div>
          {data.upcoming.length === 0 && <Empty>Nothing due.</Empty>}
          <Agenda items={data.upcoming} today={today} />
        </section>
      </div>

      {/* ── Team ──────────────────────────────────────────────────────────── */}
      <section id="team" className={`${card} order-4 mb-4 scroll-mt-16 p-4 md:order-none`}>
        <div className={`${sectionLabel} mb-3`}>The team · click someone for their desk</div>
        <OrgChart team={data.team} cards={data.cards} selected={sel?.agent.id ?? ""} onSelect={setSelected} />
        {sel && <Desk c={sel} byId={byId} today={today} busy={busy} act={act} onOpen={openReport} jobName={jobName} />}
      </section>

      {/* ── Brief + what happened ─────────────────────────────────────────── */}
      <div className="order-2 mb-4 grid gap-4 md:order-none md:mb-0 md:grid-cols-[3fr_2fr] [&>*]:min-w-0">
        <section className={`${card} p-4`}>
          <div className={`${sectionLabel} mb-3`}>🧢 The Manager&apos;s brief</div>
          {data.brief ? <BriefMessage brief={data.brief} onOpen={openReport} /> : <Empty>No brief yet. Press “Run the Manager now” or wait for 7 AM ET.</Empty>}
        </section>
        <section id="happened" className={`${card} scroll-mt-16 p-4`}>
          <div className={`${sectionLabel} mb-3`}>What happened</div>
          <Feed completed={data.completed} today={today} onOpen={openReport} />
        </section>
      </div>

      {open && <ReportDrawer r={open} onClose={() => setOpen(null)} />}
    </main>
  );
}

/**
 * Every post that needs a ✅ in one box (James 24 Oct 2026): closed, it's one line with the count and the first date;
 * open, a checklist (ticked = approved, goes out by itself) where each post opens its slot on the Schedule to approve it.
 */
function ApprovePosts({ n, today }: { n: NeedsYou; today: string }) {
  const posts = n.posts ?? [];
  const waiting = posts.filter((p) => !p.done);
  return (
    <li className="rounded-xl border border-gray-100 dark:border-white/5">
      <details>
        <summary className="flex cursor-pointer list-none items-start gap-3 p-3">
          <span className="text-lg leading-none">{KIND_ICON.posts}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-bold">Approve posts · {waiting.length} waiting</div>
            <div className="text-[11px] text-gray-500 dark:text-white/50">
              {posts.length - waiting.length} of {posts.length} upcoming approved{waiting[0] ? ` · first: ${waiting[0].title}` : ""} · click to see them
            </div>
          </div>
          <div className="shrink-0 text-right">
            {n.due && <div className={`text-[11px] font-bold ${inDays(n.due, today) <= 2 ? "" : "text-gray-500 dark:text-white/50"}`}>{relDay(n.due, today)}</div>}
            <span className="text-[14px] text-gray-400">▾</span>
          </div>
        </summary>
        <ul className="space-y-1 border-t border-gray-100 p-3 dark:border-white/5">
          {posts.map((p) => (
            // phone: the whole row is the link, tall enough to tap; desktop: one line with an "approve" link
            <li key={p.id}>
              <Link href={p.link} className="flex items-center gap-2 rounded-lg px-1 py-2 text-[13px] hover:bg-gray-50 dark:hover:bg-white/5 sm:py-0.5 sm:text-[11px]">
                <span className="w-4 shrink-0 text-center" aria-label={p.done ? "approved" : "needs approval"}>{p.done ? "☑" : "☐"}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${p.done ? "text-gray-400 line-through" : "font-bold"}`} title={p.title}>{p.title}</span>
                  <span className="block text-[11px] text-gray-500 dark:text-white/50 sm:hidden">{p.due ? `${relDay(p.due, today)} ${timeOf(p.due)}` : "no date"} · {p.note}</span>
                </span>
                <span className="hidden shrink-0 text-gray-500 dark:text-white/50 sm:inline">{p.due ? `${relDay(p.due, today)} ${timeOf(p.due)}` : "no date"}</span>
                <span className="hidden w-36 shrink-0 truncate text-gray-400 md:block" title={p.note}>{p.note}</span>
                <span className="shrink-0 text-gray-400 underline">{p.done ? "view" : "approve"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-gray-400 dark:text-white/40">{children}</div>;
}

function Tile({ icon, n, label, sub, href }: { icon: string; n: number; label: string; sub: string; href: string }) {
  return (
    <a href={href} className={`${card} flex items-center gap-3 p-4 hover:border-gray-400 dark:hover:border-white/30`}>
      <span className="text-2xl">{icon}</span>
      <span className="min-w-0">
        <span className="block text-2xl font-black leading-none">{n}</span>
        <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-white/50">{label}</span>
        <span className="block truncate text-[10px] text-gray-400" title={sub}>{sub}</span>
      </span>
    </a>
  );
}

function Agenda({ items, today }: { items: Upcoming[]; today: string }) {
  const groups: { day: string; items: Upcoming[] }[] = [];
  for (const u of items) {
    const d = etDate(u.due); // the ET day (a bare "YYYY-MM-DD" reads as UTC midnight = the evening before in ET)
    const g = groups.find((g) => g.day === d);
    g ? g.items.push(u) : groups.push({ day: d, items: [u] });
  }
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.day}>
          <div className="mb-1 text-[10px] font-black uppercase tracking-widest">{relDay(g.day + "T16:00:00Z", today)}{inDays(g.day, today) > 1 ? "" : ` · ${dayOf(g.day + "T16:00:00Z")}`}</div>
          <ul className="space-y-1">
            {g.items.map((u, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-2 text-[12px] sm:flex-nowrap sm:text-[11px]">
                <span className="w-16 shrink-0 text-gray-400">{timeOf(u.due)}</span>
                <span className="w-5 text-center">{u.icon}</span>
                <span className="min-w-0 flex-1 truncate" title={u.task}>{u.task}</span>
                {/* phone: the note goes on its own line under the job */}
                <span className="order-last basis-full truncate pl-[5.5rem] text-gray-400 sm:order-none sm:max-w-[40%] sm:basis-auto sm:pl-0 sm:text-right" title={u.waiting}>{u.waiting}</span>
                {u.link && <Link href={u.link} className="text-gray-400 underline hover:text-gray-900 dark:hover:text-white">open</Link>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The team as avatars in reporting lines: You → Manager → Data · Social → their jobs. One click selects a desk. */
function OrgChart({ team, cards, selected, onSelect }: { team: AgentRow[]; cards: Card[]; selected: string; onSelect: (id: string) => void }) {
  const kids = (id: string) => team.filter((a) => a.parent === id);
  const cardOf = (id: string) => cards.find((c) => c.agent.id === id);
  const Avatar = ({ a, big }: { a: AgentRow; big?: boolean }) => {
    const c = cardOf(a.id);
    const clickable = !!c;
    const last = c?.lastRun;
    const line = !c ? a.blurb.split(".")[0] : last ? `${last.result === "running" ? "working on" : last.result === "ok" ? "last did" : "failed"} ${last.name || last.job} · ${ago(last.finished || last.started)}` : "nothing yet";
    const next = c?.nextRun ? `next: ${c.nextRun.when}` : "";
    return (
      <button
        disabled={!clickable}
        onClick={() => clickable && onSelect(a.id)}
        className={`group flex ${big ? "w-56" : "w-44"} flex-col items-center rounded-2xl border p-3 text-center transition-colors ${selected === a.id ? "border-gray-900 dark:border-white" : "border-gray-100 dark:border-white/5"} ${clickable ? "hover:border-gray-400 dark:hover:border-white/30" : "cursor-default"} ${a.status === "on" ? "" : "opacity-50"}`}
      >
        <span className={`relative flex ${big ? "h-14 w-14 text-3xl" : "h-11 w-11 text-2xl"} items-center justify-center rounded-full border-2 ${last?.result === "running" ? "border-gray-900 border-dashed dark:border-white" : "border-gray-200 dark:border-white/10"} bg-gray-50 dark:bg-white/5`}>
          {a.icon}
          {a.status !== "on" && <span className="absolute -bottom-1 -right-1 rounded-full bg-white px-1 text-[9px] dark:bg-black">{a.status === "off" ? "⏻" : "⏸"}</span>}
        </span>
        <span className="mt-2 text-[11px] font-black uppercase tracking-wide">{a.name}</span>
        <span className="text-[9px] uppercase tracking-widest text-gray-400">{a.kind === "job" ? "job" : a.id === "james" ? "" : "agent"}{a.status !== "on" ? ` · ${a.status}${a.status === "paused" ? ` until ${a.paused_until}` : ""}` : ""}</span>
        <span className="mt-1 line-clamp-2 text-[10px] text-gray-500 dark:text-white/50" title={line}>{line}</span>
        {next && <span className="text-[10px] text-gray-400">{next}</span>}
      </button>
    );
  };
  const root = team.find((a) => !a.parent);
  const manager = root ? kids(root.id)[0] : undefined;
  const agents = manager ? kids(manager.id) : [];
  // Phone (James 25 Oct 2026): the tree is too wide, so the team is a list: tap someone for their desk below
  const phoneList = [root, manager, ...agents].filter(Boolean) as AgentRow[];
  return (
    <>
    <div className="space-y-2 md:hidden">
      {phoneList.map((a) => {
        const c = cardOf(a.id);
        const last = c?.lastRun;
        return (
          <button key={a.id} disabled={!c} onClick={() => c && onSelect(a.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${selected === a.id ? "border-gray-900 dark:border-white" : "border-gray-100 dark:border-white/5"} ${a.status === "on" ? "" : "opacity-50"} ${a.parent && a.parent !== root?.id ? "ml-4 w-[calc(100%-1rem)]" : ""}`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-50 text-2xl dark:bg-white/5">{a.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-black uppercase tracking-wide">{a.name}</span>
              <span className="block truncate text-[12px] text-gray-500 dark:text-white/50">
                {!c ? a.blurb.split(".")[0] : last ? `${last.result === "running" ? "working on" : last.result === "ok" ? "last did" : "failed"} ${last.name || last.job} · ${ago(last.finished || last.started)}` : "nothing yet"}
              </span>
              {c?.nextRun && <span className="block truncate text-[11px] text-gray-400">next: {c.nextRun.when}</span>}
            </span>
            {c && <span className="text-gray-300">›</span>}
          </button>
        );
      })}
    </div>
    <div className="hidden flex-col items-center md:flex">
      {root && <Avatar a={root} />}
      {manager && (
        <>
          <div className="h-5 w-px bg-gray-300 dark:bg-white/20" />
          <Avatar a={manager} big />
          <div className="h-5 w-px bg-gray-300 dark:bg-white/20" />
          <div className="relative flex w-full justify-center gap-10 pt-5">
            <div className="absolute left-1/4 right-1/4 top-0 h-px bg-gray-300 dark:bg-white/20" />
            {agents.map((ag) => (
              <div key={ag.id} className="relative flex flex-col items-center">
                <div className="absolute -top-5 h-5 w-px bg-gray-300 dark:bg-white/20" />
                <Avatar a={ag} />
                {kids(ag.id).length > 0 && (
                  <>
                    <div className="h-4 w-px bg-gray-300 dark:bg-white/20" />
                    <div className="flex gap-2">
                      {kids(ag.id).map((k) => (
                        <div key={k.id} className="flex w-24 flex-col items-center rounded-xl border border-dashed border-gray-200 p-2 text-center dark:border-white/10" title={k.blurb}>
                          <span className="text-xl">{k.icon}</span>
                          <span className="text-[9px] font-black uppercase tracking-wide">{k.name}</span>
                          <span className="text-[8px] uppercase tracking-widest text-gray-400">{k.kind}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
    </>
  );
}

/** The selected agent's desk: switch, status, and each workflow as a progress track. */
function Desk({ c, byId, today, busy, act, onOpen, jobName }: { c: Card; byId: Record<string, AgentRow>; today: string; busy: boolean; act: (b: Record<string, unknown>) => Promise<void>; onOpen: (f: string) => void; jobName: (id: string) => string }) {
  const a = c.agent;
  const [pause, setPause] = useState(a.paused_until);
  const [openStep, setOpenStep] = useState<string | null>(null);
  useEffect(() => setPause(a.paused_until), [a.paused_until, a.id]);
  const last = c.lastRun;
  const counted = c.workflows.flatMap((w) => w.steps).filter((s) => s.counts);
  const total = counted.length;
  const doneN = counted.filter((s) => s.vstate === "done").length;
  return (
    <div className="mt-5 rounded-2xl border border-gray-200 p-3 dark:border-white/10 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-3xl">{a.icon}</span>
        {/* phone: the name and blurb take the whole row (blurb cut to 3 lines); the controls wrap below */}
        <div className="min-w-0 basis-[calc(100%-3.5rem)] sm:basis-0 sm:flex-1">
          <div className="text-sm font-black uppercase tracking-widest">{a.name}&apos;s desk</div>
          <div className="line-clamp-3 text-[11px] text-gray-500 dark:text-white/50 sm:line-clamp-none" title={a.blurb}>{a.blurb}</div>
        </div>
        <a href={chatLink(a)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:border-gray-900 dark:border-white/20 dark:hover:border-white" title={a.id === "gm" ? "Discuss tasks, responsibilities and ways of working" : "Discuss this agent's own work and responsibilities"}>
          💬 Chat to {a.id === "gm" ? "the Manager" : a.name.replace(" media agent", "").replace(" agent", "")}
        </a>
        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
          {a.enabled ? "On" : "Off"}
          <button role="switch" aria-checked={a.enabled} disabled={busy} onClick={() => act({ action: "switch", id: a.id, enabled: !a.enabled })} className={`relative h-5 w-9 rounded-full border transition-colors ${a.enabled ? "border-gray-900 bg-gray-900 dark:border-white dark:bg-white" : "border-gray-300 bg-gray-200 dark:border-white/20 dark:bg-white/10"}`} title={a.enabled ? "Switch off: the Manager won't start it; a running job finishes" : "Switch on"}>
            <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all dark:bg-black ${a.enabled ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-white/50">
          Pause until <input type="date" className={field} value={pause} onChange={(e) => setPause(e.target.value)} />
          {pause !== a.paused_until && <button className="font-bold underline" disabled={busy} onClick={() => act({ action: "pause", id: a.id, until: pause })}>save</button>}
          {a.paused_until && <button className="underline" disabled={busy} onClick={() => (setPause(""), act({ action: "pause", id: a.id, until: "" }))}>clear</button>}
        </label>
      </div>

      <div className="mt-4 grid gap-3 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Last run">
          {last ? (
            <>
              <div className="font-bold">{STATE[last.result]?.glyph} {last.name || last.job}{last.test ? " (test)" : ""}</div>
              <div className="text-gray-500 dark:text-white/50">{relDay(last.finished || last.started, today)} {timeOf(last.finished || last.started)} · {ago(last.finished || last.started)}</div>
              <div className="line-clamp-2 text-gray-500 dark:text-white/50" title={last.summary}>{last.summary}</div>
              <button className="text-gray-400 underline" onClick={() => onOpen(last.file)}>read the report</button>
            </>
          ) : (
            <div className="text-gray-400">hasn&apos;t run yet</div>
          )}
        </Stat>
        <Stat label="Next run">
          {c.nextRun ? (
            <>
              <div className="font-bold">{c.nextRun.when}</div>
              <div className="text-gray-500 dark:text-white/50">{c.nextRun.why}</div>
            </>
          ) : (
            <div className="text-gray-400">nothing scheduled</div>
          )}
        </Stat>
        <Stat label="Waiting on">
          {c.waitingOn.length ? <ul className="list-disc pl-4">{c.waitingOn.slice(0, 4).map((w, i) => <li key={i}>{w}</li>)}</ul> : <div className="text-gray-400">nothing</div>}
        </Stat>
        <Stat label="Last run cost">
          {last ? (
            <>
              <div className="font-bold">{last.duration_ms ? `${Math.round(last.duration_ms / 1000)} s` : "—"}{last.turns ? ` · ${last.turns} steps` : ""}{typeof last.cost_usd === "number" ? ` · ~$${last.cost_usd.toFixed(2)}` : ""}</div>
              <div className="text-gray-500 dark:text-white/50">{last.model}</div>
            </>
          ) : (
            <div className="text-gray-400">—</div>
          )}
        </Stat>
      </div>

      {total > 0 && (
        <div className="mt-5">
          <div className="mb-1 flex items-baseline justify-between">
            <div className={sectionLabel}>Workflows</div>
            <div className="text-[10px] text-gray-400">{doneN} of {total} steps done</div>
          </div>
          <div className="mb-4 h-1.5 w-full rounded bg-gray-100 dark:bg-white/10"><div className="h-1.5 rounded bg-gray-900 dark:bg-white" style={{ width: `${(100 * doneN) / Math.max(1, total)}%` }} /></div>
          <div className="space-y-5">
            {c.workflows.map((w) => (
              <Track key={w.id} w={w} agent={a} byId={byId} today={today} busy={busy} act={act} onOpen={onOpen} openStep={openStep} setOpenStep={setOpenStep} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-5">
        <div className={`${sectionLabel} mb-1`}>Recent actions</div>
        {c.actions.length === 0 && <Empty>Nothing logged yet.</Empty>}
        <ul className="space-y-0.5 text-[11px]">
          {c.actions.slice(0, 8).map((l, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-24 shrink-0 text-gray-400">{relDay(l.at, today)} {timeOf(l.at)}</span>
              <span className="flex-1 truncate">{humanAction(l, byId, jobName)}</span>
              {l.link?.startsWith("agents/runs/") && <button className="text-gray-400 underline" onClick={() => onOpen(l.link!)}>report</button>}
              {l.link?.startsWith("/admin") && <Link href={l.link.split("#")[0]} className="text-gray-400 underline">open</Link>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/5">
      <div className={`${sectionLabel} mb-1`}>{label}</div>
      {children}
    </div>
  );
}

/**
 * One workflow as a track: nodes on a line in time order, short labels, the day/time and how each starts underneath,
 * click a node for the detail. "now:" only when something is running or due today; otherwise "next:" (James 24 Oct 2026).
 */
const LIVE = ["running", "due", "overdue", "failed", "waiting"];
function Track({ w, agent, byId, today, busy, act, onOpen, openStep, setOpenStep }: { w: { id: string; name: string; steps: Job[] }; agent: AgentRow; byId: Record<string, AgentRow>; today: string; busy: boolean; act: (b: Record<string, unknown>) => Promise<void>; onOpen: (f: string) => void; openStep: string | null; setOpenStep: (id: string | null) => void }) {
  const steps = w.steps;
  const counted = steps.filter((s) => s.counts);
  const done = counted.filter((s) => s.vstate === "done").length;
  const nowSteps = steps.filter((s) => LIVE.includes(s.vstate));
  const next = steps.filter((s) => s.next_at).sort((a, b) => Date.parse(a.next_at) - Date.parse(b.next_at))[0];
  const head = nowSteps.length
    ? `now: ${nowSteps.map((s) => `${shortName(s)} (${STATE[s.vstate]?.label ?? s.vstate})`).join(", ")}`
    : next
    ? `next: ${shortName(next)} · ${relDay(next.next_at, today)} ${timeOf(next.next_at)}`
    : counted.length && done === counted.length
    ? "all done"
    : "";
  const ringed = new Set(nowSteps.length ? nowSteps.map((s) => s.id) : next ? [next.id] : []);
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <div className="text-[11px] font-black uppercase tracking-wide">{w.name}</div>
        <div className="text-[10px] text-gray-400">{counted.length ? `${done}/${counted.length}` : ""}{head ? `${counted.length ? " · " : ""}${head}` : ""}</div>
      </div>
      <ol className="relative flex flex-wrap gap-y-4">
        {steps.map((s, i) => {
          const st = STATE[s.vstate] ?? { glyph: "", label: s.vstate };
          const isCur = ringed.has(s.id);
          const filled = s.vstate === "done";
          return (
            <li key={s.id} className="relative flex w-28 flex-col items-center text-center">
              {i > 0 && <span className={`absolute right-1/2 top-4 h-px w-full ${steps[i - 1].vstate === "done" ? "bg-gray-900 dark:bg-white" : "bg-gray-200 dark:bg-white/10"}`} />}
              <button
                onClick={() => setOpenStep(openStep === s.id ? null : s.id)}
                className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-[12px] ${filled ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-black" : isCur || s.vstate === "today" ? "border-gray-900 bg-white dark:border-white dark:bg-[#0d0d0d]" : s.vstate === "not_built" ? "border-dashed border-gray-300 bg-white dark:border-white/20 dark:bg-[#0d0d0d]" : "border-gray-300 bg-white dark:border-white/20 dark:bg-[#0d0d0d]"} ${isCur ? "ring-4 ring-gray-200 dark:ring-white/20" : ""}`}
                title={`${s.name} · ${st.label}`}
              >
                {st.glyph}
              </button>
              <span className={`mt-1.5 line-clamp-2 px-1 text-[10px] leading-tight ${isCur ? "font-bold" : ""}`} title={s.name}>{shortName(s)}</span>
              <span className="text-[9px] leading-tight text-gray-500 dark:text-white/50">{s.agent !== agent.id ? `${byId[s.agent]?.icon} ` : ""}{s.when1}</span>
              {s.when2 && <span className="text-[9px] leading-tight text-gray-500 dark:text-white/50">{s.when2}</span>}
              <span className="text-[9px] leading-tight text-gray-400">{s.vstate === "today" ? "ran today · " : ""}{s.how}</span>
              {openStep === s.id && (
                <div className="fixed inset-x-3 bottom-3 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 text-left text-[13px] shadow-xl dark:border-white/10 dark:bg-[#111] md:absolute md:inset-x-auto md:bottom-auto md:left-1/2 md:top-10 md:z-20 md:max-h-none md:w-64 md:-translate-x-1/2 md:p-3 md:text-[11px]" onClick={(e) => e.stopPropagation()}>
                  <div className="mb-1 font-black">{s.name}</div>
                  <div className="mb-1 text-gray-500 dark:text-white/50">{byId[s.agent]?.icon} {s.agent_name} · {st.label} · {[s.when1, s.when2].filter(Boolean).join(" · ")} ET · {s.how}</div>
                  {s.next_at && <div className="mb-1">Next run: {dayOf(s.next_at)} {timeOf(s.next_at)} ET</div>}
                  {s.waiting_on?.length ? <div className="mb-1">Waiting on: {s.waiting_on.map((x) => x.replace(/_/g, " ")).join(", ")}</div> : null}
                  <div className="mb-1"><b>Done looks like:</b> {s.done}</div>
                  <div className="mb-1"><b>Checks:</b> {s.checks.join("; ")}</div>
                  <div className="mb-2 text-gray-500 dark:text-white/50">{s.writes === "asks" ? "Asks first: a diff in #approvals, your ✅ writes it" : s.writes === "james" ? "This one is yours" : "Writes its own result"}{s.inputs.length ? ` · needs from you: ${s.inputs.join("; ")}` : ""}</div>
                  <div className="flex gap-3 text-gray-400">
                    {s.slot && <Link href={`/admin/scheduler?slot=${s.slot}`} className="underline">Schedule slot</Link>}
                    {s.last_report && <button className="underline" onClick={() => onOpen(s.last_report)}>last report</button>}
                    {s.built && s.repeat !== "own_timer" && s.state !== "running" && agent.status === "on" && <button className="underline" disabled={busy} onClick={() => act({ action: "run", agent: s.agent, job: s.id })}>run now</button>}
                    <button className="ml-auto" onClick={() => setOpenStep(null)}>✕</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The Mac's timers in one line (handoff 24 Oct 2026): ● fine, ✗ stopped (its last exit), when each last wrote output; the day planner's wake-ups still to fire today. */
function Timers({ timers, wakeups }: { timers: Timer[]; wakeups: string[] }) {
  if (!timers.length) return null;
  const bad = timers.filter((t) => !t.ok);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500 dark:text-white/50">
      <span title="launchd timers on this Mac (launchctl list | grep pickem)">⏱ Timers {bad.length ? `· ${bad.length} stopped` : "· all fine"}:</span>
      {timers.map((t) => (
        <span key={t.label} title={`${t.label} · last exit ${t.exit}${t.running ? " · running now" : ""}${t.lastOutput ? ` · last output ${new Date(t.lastOutput).toLocaleString()}` : ""}`} className={t.ok ? "hidden sm:inline" : "font-bold text-gray-900 dark:text-white"}>
          {t.ok ? "●" : "✗"} {t.name}{t.ok ? "" : ` (exit ${t.exit})`}{t.lastOutput ? ` · ${ago(t.lastOutput)}` : ""}
        </span>
      ))}
      <span title="The Manager's day planner: one wake-up per slot time today (agents/manager/dayplan.py list)">
        ⏰ {wakeups.length ? `wake-ups: ${wakeups.map(wallTime).join(", ")} ET` : "no wake-ups left today"}
      </span>
    </div>
  );
}

/** The brief as a message: avatar, name, time, then its sections as blocks. */
function BriefMessage({ brief, onOpen }: { brief: { text: string; at: string; test: boolean; file: string }; onOpen: (f: string) => void }) {
  const lines = brief.text.split("\n");
  const title = lines[0]?.replace(/^🧢\s*/, "") ?? "";
  const blocks: { head: string; lines: string[] }[] = [];
  for (const l of lines.slice(1)) {
    if (!l.trim()) continue;
    if (/^[•\d]/.test(l.trim()) && blocks.length) blocks[blocks.length - 1].lines.push(l.trim());
    else if (l.includes(" — ")) blocks.push({ head: l.split(" — ")[0], lines: [l.split(" — ").slice(1).join(" — ")] }); // "📋 Please review the plan — 34 slots…"
    else blocks.push({ head: l, lines: [] });
  }
  return (
    <div className="flex gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl dark:bg-white/10">🧢</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] font-black">Manager</span>
          <span className="text-[10px] text-gray-400">#daily-brief · {dayOf(brief.at)} {timeOf(brief.at)} ET{brief.test ? " · test run, not sent" : ""}</span>
          <button className="ml-auto text-[10px] text-gray-400 underline" onClick={() => onOpen(brief.file)}>report</button>
        </div>
        <div className="mt-1 text-[12px] font-bold">{title}</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {blocks.map((b, i) => (
            <div key={i} className={`rounded-xl bg-gray-50 p-3 dark:bg-white/5 ${b.head.startsWith("✋") || b.head.startsWith("📋") ? "sm:col-span-2" : ""}`}>
              <div className="mb-1 text-[10px] font-black uppercase tracking-widest">{b.head}</div>
              <ul className="space-y-0.5 text-[11px]">
                {b.lines.map((l, k) => (
                  <li key={k}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** What happened, newest first, grouped by day, in sentences. */
function Feed({ completed, today, onOpen }: { completed: Done[]; today: string; onOpen: (f: string) => void }) {
  if (!completed.length) return <Empty>Nothing yet. The first thing here will be the Manager&apos;s first morning run.</Empty>;
  const groups: { day: string; items: Done[] }[] = [];
  for (const d of completed) {
    const k = etDate(d.when);
    const g = groups.find((g) => g.day === k);
    g ? g.items.push(d) : groups.push({ day: k, items: [d] });
  }
  const verb = (d: Done) => (d.kind === "post" ? "went out" : d.kind === "task" ? "was ticked done" : d.result.startsWith("ok") ? "finished" : d.result.startsWith("failed") ? "failed" : d.result);
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.day}>
          <div className="mb-1 text-[10px] font-black uppercase tracking-widest">{relDay(g.day, today)}</div>
          <ul className="space-y-1.5">
            {g.items.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px]">
                <span className="w-5 text-center">{d.icon}</span>
                <span className="flex-1">
                  <span className="font-bold">{d.task}</span> {verb(d)}{d.result.includes("test") ? " (test)" : ""}
                  <span className="text-gray-400"> · {timeOf(d.when)}</span>
                </span>
                {d.link && (d.kind === "run" ? <button className="text-gray-400 underline" onClick={() => onOpen(d.link)}>report</button> : <Link href={d.link} className="text-gray-400 underline">open</Link>)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ReportDrawer({ r, onClose }: { r: Report; onClose: () => void }) {
  const needs = (r.needs ?? []).map((n) => (typeof n === "string" ? n : [n.who, n.why].filter(Boolean).join(": ")));
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 text-[12px] dark:bg-[#0d0d0d]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start gap-3">
          <div className="flex-1">
            <div className="text-xs font-black uppercase tracking-widest">{r.name || r.job}</div>
            <div className="text-[10px] text-gray-400">
              {r.agent} · {dayOf(r.started)} {timeOf(r.started)} → {r.finished ? timeOf(r.finished) : "running"} · <b>{r.result}</b>{r.test ? " · test run" : ""} · {r.model}
              {r.duration_ms ? ` · ${Math.round(r.duration_ms / 1000)} s` : ""}{r.turns ? ` · ${r.turns} steps` : ""}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 dark:hover:text-white">✕</button>
        </div>
        <p className="mb-3">{r.summary}</p>
        <Block title="Checks"><ul>{(r.checks ?? []).map((c, i) => <li key={i}>{c.state === "pass" ? "✓" : c.state === "fail" ? "✗" : "○"} {c.text}{c.note ? <span className="text-gray-400"> — {c.note}</span> : null}</li>)}</ul></Block>
        {(r.actions ?? []).length > 0 && <Block title="Actions"><ul className="list-disc pl-4">{r.actions.map((x, i) => <li key={i}>{x}</li>)}</ul></Block>}
        {needs.length > 0 && <Block title="Needs"><ul className="list-disc pl-4">{needs.map((x, i) => <li key={i}>{x}</li>)}</ul></Block>}
        {(r.files ?? []).length > 0 && <Block title="Files"><ul>{r.files.map((x, i) => <li key={i} className="font-mono text-[10px]">{x}</li>)}</ul></Block>}
        {(r.would_send ?? []).length > 0 && (
          <Block title="Would have sent (test mode)">
            {r.would_send!.map((w, i) => (
              <div key={i} className="mb-2">
                <div className="text-[10px] text-gray-400">{w.channel}</div>
                <pre className="whitespace-pre-wrap font-sans">{w.text}</pre>
              </div>
            ))}
          </Block>
        )}
        <div className="mt-4 text-[10px] text-gray-400">{r.file}</div>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className={`${sectionLabel} mb-1`}>{title}</div>
      {children}
    </div>
  );
}
