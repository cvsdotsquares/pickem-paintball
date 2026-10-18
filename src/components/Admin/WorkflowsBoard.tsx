"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { pill, primaryButton, sectionLabel } from "./types";

/**
 * Workflows (admin page 5, James 18 Oct 2026): the per-agent view of the team. Top to bottom: the team picture (drawn
 * from agents.json parents), recently completed, upcoming, the Manager's latest brief + the inputs list, then one card
 * per agent: on/off, pause until, last run, next run, waiting on, every workflow as a chain of steps from the playbook,
 * recent actions, run now. Icons only, no colour coding (James). Data: /api/admin/workflows (src/lib/admin/workflows.ts).
 */

// Client copies of src/lib/admin/workflows.ts (that module reads the disk).
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
};
type Done = { icon: string; agent: string; task: string; when: string; result: string; link: string; kind: string };
type Upcoming = { icon: string; agent: string; task: string; due: string; waiting: string; link: string; state: string };
type Card = {
  agent: AgentRow; children: AgentRow[]; lastRun: Report | null; nextRun: { when: string; why: string; job: string } | null; waitingOn: string[];
  workflows: { id: string; name: string; steps: Job[] }[]; actions: LogLine[]; jobRuns: { id: string; label: string; status: string; startedAt: string; summary: string }[];
};
type View = {
  event: string; eventName: string; date: string; planningStart: string; team: AgentRow[]; completed: Done[]; upcoming: Upcoming[];
  brief: { text: string; at: string; test: boolean; file: string } | null; inputs: { text: string; done: boolean }[]; inputsCard: string; cards: Card[]; error?: string;
};

const TZ = "America/New_York";
const when = (iso: string, withTime = true) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", ...(withTime ? { hour: "numeric", minute: "2-digit", hour12: true } : {}) });
};
const ago = (iso: string) => {
  const ms = Date.now() - Date.parse(iso);
  if (isNaN(ms)) return "";
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
/** One glyph per state: icons, not colours (James). */
const STATE: Record<string, { glyph: string; label: string }> = {
  done: { glyph: "✓", label: "done" }, running: { glyph: "⏳", label: "running" }, failed: { glyph: "✗", label: "failed" }, due: { glyph: "▶", label: "due now" },
  overdue: { glyph: "‼", label: "overdue" }, waiting: { glyph: "⏸", label: "waiting" }, not_due: { glyph: "○", label: "not due" }, not_built: { glyph: "◌", label: "not built yet" },
  off: { glyph: "⏻", label: "switched off" }, skipped: { glyph: "–", label: "skipped" },
};
const STATUS_GLYPH = { on: "", off: "⏻ off", paused: "⏸ paused" };
const card = "rounded-xl border border-gray-100 dark:border-white/5 bg-white dark:bg-[#0d0d0d] p-4";
const field = "rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-gray-400 dark:border-white/10 dark:bg-white/5";
const hubFile = (rel: string) => `/api/admin/workflows?report=${encodeURIComponent(rel)}`;

export default function WorkflowsBoard() {
  const [data, setData] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Report | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/workflows", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : (setError(""), setData(d))));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // a run's report lands while you watch
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

  if (!data) return <div className="p-8 text-xs text-gray-400">{error || "Loading…"}</div>;
  const byId = Object.fromEntries(data.team.map((a) => [a.id, a]));

  return (
    <main className="mx-auto max-w-6xl px-5 py-6">
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <h1 className="text-lg font-black uppercase tracking-wide">Workflows</h1>
          <div className="text-[10px] text-gray-400 dark:text-white/40">
            The team of agents: who reports to whom, what each has done and will do next. {data.eventName} · today {when(data.date + "T12:00:00", false)} · times are US Eastern.
          </div>
        </div>
        <button className={primaryButton} disabled={busy} onClick={() => act({ action: "run", agent: "gm", job: "morning" })} title="Plan if needed, update the inputs list, post the brief">
          🧢 Run the Manager now
        </button>
      </div>
      {error && <div className="mb-3 text-[11px] text-red-500">{error}</div>}
      {note && <div className="mb-3 text-[11px] text-gray-600 dark:text-white/60">{note}</div>}

      {/* 1. Team structure */}
      <section className={`${card} mb-4`}>
        <div className={`${sectionLabel} mb-3`}>Team structure</div>
        <Tree team={data.team} rootId={data.team.find((a) => !a.parent)?.id ?? "james"} />
      </section>

      {/* 2 + 3. Recently completed / Upcoming */}
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <section className={card}>
          <div className={`${sectionLabel} mb-2`}>Recently completed · last {data.completed.length}</div>
          {data.completed.length === 0 && <Empty>Nothing finished yet. The first thing here will be the Manager&apos;s first morning run.</Empty>}
          <ul className="divide-y divide-gray-100 dark:divide-white/5">
            {data.completed.map((d, i) => (
              <li key={i} className="flex items-center gap-2 py-1.5 text-[11px]">
                <span className="w-5 text-center">{d.icon}</span>
                <span className="flex-1 truncate">{d.task}</span>
                <span className="text-gray-400">{when(d.when)}</span>
                <span className="w-16 text-right font-bold">{d.result}</span>
                {d.link && (d.kind === "run" ? <ReportLink file={d.link} onOpen={setOpen} /> : <Link href={d.link} className="text-gray-400 underline hover:text-gray-900 dark:hover:text-white">open</Link>)}
              </li>
            ))}
          </ul>
        </section>
        <section className={card}>
          <div className={`${sectionLabel} mb-2`}>Upcoming · next {data.upcoming.length}</div>
          {data.upcoming.length === 0 && <Empty>Nothing due.</Empty>}
          <ul className="divide-y divide-gray-100 dark:divide-white/5">
            {data.upcoming.map((u, i) => (
              <li key={i} className="flex items-center gap-2 py-1.5 text-[11px]">
                <span className="w-5 text-center">{u.icon}</span>
                <span className="w-4 text-center" title={STATE[u.state]?.label ?? u.state}>{STATE[u.state]?.glyph ?? ""}</span>
                <span className="flex-1 truncate">{u.task}</span>
                <span className="text-gray-400">{when(u.due)}</span>
                <span className="max-w-[40%] truncate text-right text-gray-500 dark:text-white/50" title={u.waiting}>{u.waiting}</span>
                {u.link && <Link href={u.link} className="text-gray-400 underline hover:text-gray-900 dark:hover:text-white">open</Link>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 4. Brief + inputs */}
      <div className="mb-6 grid gap-4 md:grid-cols-[3fr_2fr]">
        <section className={card}>
          <div className={`${sectionLabel} mb-2`}>
            The Manager&apos;s latest brief {data.brief ? `· ${when(data.brief.at)}${data.brief.test ? " · test run, not sent" : ""}` : ""}
          </div>
          {data.brief ? <pre className="whitespace-pre-wrap font-sans text-[12px] leading-5">{data.brief.text}</pre> : <Empty>No brief yet. Press &quot;Run the Manager now&quot; or wait for 7 AM ET.</Empty>}
        </section>
        <section className={card}>
          <div className={`${sectionLabel} mb-2`}>
            Inputs needed {data.inputsCard ? <Link href="/admin/todo" className="ml-1 underline">(TO DO card)</Link> : <span className="ml-1 normal-case">(drafted, card not made yet)</span>}
          </div>
          {data.inputs.length === 0 && <Empty>Nothing needed from you.</Empty>}
          <ul className="space-y-1 text-[11px]">
            {data.inputs.map((i, n) => (
              <li key={n} className={`flex gap-2 ${i.done ? "text-gray-400 line-through" : ""}`}>
                <span>{i.done ? "☑" : "☐"}</span>
                <span>{i.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 5. One card per agent */}
      <div className="space-y-4">
        {data.cards.map((c) => (
          <AgentCard key={c.agent.id} c={c} byId={byId} busy={busy} act={act} onOpen={setOpen} />
        ))}
      </div>

      {open && <ReportDrawer r={open} onClose={() => setOpen(null)} />}
    </main>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-gray-400 dark:text-white/40">{children}</div>;
}

/** The tree from agents.json parents: each node = icon, name, one line, on/off/paused; click → its card. */
function Tree({ team, rootId }: { team: AgentRow[]; rootId: string }) {
  const kids = (id: string) => team.filter((a) => a.parent === id);
  const Node = ({ a, depth }: { a: AgentRow; depth: number }) => {
    const hasCard = a.kind === "agent" && a.id !== "james" && a.id !== "reviewer";
    const inner = (
      <div className={`inline-flex max-w-full items-start gap-2 rounded-lg border px-3 py-2 ${a.status === "on" ? "border-gray-200 dark:border-white/10" : "border-dashed border-gray-300 opacity-60 dark:border-white/20"} ${hasCard ? "hover:border-gray-500 dark:hover:border-white/50" : ""}`}>
        <span className="text-lg leading-none">{a.icon}</span>
        <span className="min-w-0">
          <span className="block text-[11px] font-black uppercase tracking-wide">
            {a.name}
            {a.kind === "job" && <span className="ml-1 font-normal normal-case text-gray-400">job</span>}
            {a.status !== "on" && <span className="ml-2 font-normal normal-case text-gray-500">{STATUS_GLYPH[a.status]}{a.status === "paused" ? ` until ${a.paused_until}` : ""}</span>}
          </span>
          <span className="block max-w-md text-[10px] text-gray-500 dark:text-white/50">{a.blurb}</span>
        </span>
      </div>
    );
    return (
      <li className={depth ? "relative pl-6 before:absolute before:left-0 before:top-5 before:h-px before:w-4 before:bg-gray-300 dark:before:bg-white/20" : ""}>
        {hasCard ? <a href={`#agent-${a.id}`}>{inner}</a> : inner}
        {kids(a.id).length > 0 && (
          <ul className="ml-4 mt-2 space-y-2 border-l border-gray-300 pl-0 dark:border-white/20">
            {kids(a.id).map((k) => (
              <Node key={k.id} a={k} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  };
  const root = team.find((a) => a.id === rootId);
  return <ul className="space-y-2">{root && <Node a={root} depth={0} />}</ul>;
}

function ReportLink({ file, onOpen }: { file: string; onOpen: (r: Report) => void }) {
  return (
    <button
      className="text-gray-400 underline hover:text-gray-900 dark:hover:text-white"
      onClick={() =>
        fetch(hubFile(file), { cache: "no-store" })
          .then((r) => r.json())
          .then((r) => onOpen({ ...r, file }))
          .catch(() => alert("Could not open the report"))
      }
    >
      report
    </button>
  );
}

function AgentCard({ c, byId, busy, act, onOpen }: { c: Card; byId: Record<string, AgentRow>; busy: boolean; act: (b: Record<string, unknown>) => Promise<void>; onOpen: (r: Report) => void }) {
  const a = c.agent;
  const [pause, setPause] = useState(a.paused_until);
  const last = c.lastRun;
  return (
    <section id={`agent-${a.id}`} className={`${card} scroll-mt-16 ${a.status === "on" ? "" : "opacity-70"}`}>
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-2xl">{a.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black uppercase tracking-widest">{a.name}</div>
          <div className="text-[10px] text-gray-500 dark:text-white/50">{a.blurb}</div>
        </div>
        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
          <span>{a.enabled ? "On" : "Off"}</span>
          <button
            role="switch"
            aria-checked={a.enabled}
            disabled={busy}
            onClick={() => act({ action: "switch", id: a.id, enabled: !a.enabled })}
            className={`relative h-5 w-9 rounded-full border transition-colors ${a.enabled ? "border-gray-900 bg-gray-900 dark:border-white dark:bg-white" : "border-gray-300 bg-gray-200 dark:border-white/20 dark:bg-white/10"}`}
            title={a.enabled ? "Switch off: the Manager won't start it; a running job finishes" : "Switch on"}
          >
            <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all dark:bg-black ${a.enabled ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-white/50">
          Pause until
          <input type="date" className={field} value={pause} onChange={(e) => setPause(e.target.value)} />
          {pause !== a.paused_until && (
            <button className="text-[10px] font-bold underline" disabled={busy} onClick={() => act({ action: "pause", id: a.id, until: pause })}>
              save
            </button>
          )}
          {a.paused_until && (
            <button className="text-[10px] underline" disabled={busy} onClick={() => (setPause(""), act({ action: "pause", id: a.id, until: "" }))}>
              clear
            </button>
          )}
        </label>
      </div>

      {/* status row */}
      <div className="mt-3 grid gap-3 text-[11px] md:grid-cols-4">
        <div>
          <div className={sectionLabel}>Last run</div>
          {last ? (
            <div>
              {when(last.finished || last.started)} <span className="text-gray-400">({ago(last.finished || last.started)})</span> · <b>{last.result}</b>
              {last.test ? " (test)" : ""} · {last.name || last.job} · <ReportLink file={last.file} onOpen={onOpen} />
              <div className="text-gray-500 dark:text-white/50">{last.summary}</div>
            </div>
          ) : (
            <div className="text-gray-400">never</div>
          )}
        </div>
        <div>
          <div className={sectionLabel}>Next run</div>
          {c.nextRun ? (
            <div>
              {c.nextRun.when}
              <div className="text-gray-500 dark:text-white/50">{c.nextRun.why}</div>
            </div>
          ) : (
            <div className="text-gray-400">nothing scheduled{a.id !== "gm" ? " (its jobs come in stage 2)" : ""}</div>
          )}
        </div>
        <div>
          <div className={sectionLabel}>Waiting on</div>
          {c.waitingOn.length ? (
            <ul className="list-disc pl-4">
              {c.waitingOn.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : (
            <div className="text-gray-400">nothing</div>
          )}
        </div>
        <div>
          <div className={sectionLabel}>Model · cost of last run</div>
          {last ? (
            <div>
              {last.model || "—"}
              {last.duration_ms ? ` · ${Math.round(last.duration_ms / 1000)} s` : ""}
              {last.turns ? ` · ${last.turns} steps` : ""}
              {typeof last.cost_usd === "number" ? ` · ~$${last.cost_usd.toFixed(2)} equiv.` : ""}
            </div>
          ) : (
            <div className="text-gray-400">—</div>
          )}
        </div>
      </div>

      {/* team under this agent */}
      {c.children.length > 0 && (
        <div className="mt-3 text-[11px]">
          <span className={sectionLabel}>Its team </span>
          {c.children.map((k) => (
            <span key={k.id} className="mr-3">
              {k.icon} {k.name}
              <span className="text-gray-400"> · {k.kind}{k.status !== "on" ? ` · ${STATUS_GLYPH[k.status]}` : ""}</span>
            </span>
          ))}
          {c.jobRuns.length > 0 && (
            <span className="text-gray-500 dark:text-white/50">
              · 👀 last check inspo: {c.jobRuns[0].status} {ago(c.jobRuns[0].startedAt)} {c.jobRuns[0].summary ? `· ${c.jobRuns[0].summary}` : ""}
            </span>
          )}
        </div>
      )}

      {/* workflows as step chains */}
      <div className="mt-4 space-y-3">
        {c.workflows.map((w) => (
          <div key={w.id}>
            <div className={`${sectionLabel} mb-1`}>{w.name}</div>
            <ol className="flex flex-wrap items-stretch gap-1">
              {w.steps.map((s, i) => {
                const st = STATE[s.state] ?? { glyph: "", label: s.state };
                const who = byId[s.agent];
                return (
                  <li key={s.id} className="flex items-stretch gap-1">
                    <div
                      className={`flex w-40 flex-col rounded-lg border px-2 py-1.5 text-[10px] ${s.state === "done" ? "border-gray-300 dark:border-white/30" : s.state === "failed" || s.state === "overdue" ? "border-gray-900 border-2 dark:border-white" : s.state === "due" || s.state === "running" ? "border-gray-900 dark:border-white" : "border-dashed border-gray-200 dark:border-white/10"}`}
                      title={`${s.done}\n\nChecks: ${s.checks.join("; ")}\n${s.writes === "asks" ? "Asks: diff in #approvals, James's ✅ writes it" : s.writes === "james" ? "James does this" : "Writes its result itself"}`}
                    >
                      <div className="flex items-center gap-1 font-bold">
                        <span>{st.glyph}</span>
                        <span className="truncate" title={s.name}>{s.name}</span>
                      </div>
                      <div className="text-gray-500 dark:text-white/50">
                        {who && who.id !== a.id ? `${who.icon} ` : ""}
                        {st.label} · {when(s.due, s.repeat !== "once" ? false : true)}
                        {s.repeat !== "once" ? ` · ${s.repeat.replace(/_/g, " ")}` : ""}
                      </div>
                      <div className="mt-auto flex gap-2 pt-1 text-gray-400">
                        {s.slot && <Link href="/admin/scheduler" className="underline hover:text-gray-900 dark:hover:text-white">slot</Link>}
                        {s.last_report && <ReportLink file={s.last_report} onOpen={onOpen} />}
                        {s.built && s.repeat !== "own_timer" && s.state !== "running" && a.status === "on" && (
                          <button className="underline hover:text-gray-900 dark:hover:text-white" disabled={busy} onClick={() => act({ action: "run", agent: s.agent, job: s.id })} title="Run this step now (for testing)">
                            run now
                          </button>
                        )}
                      </div>
                    </div>
                    {i < w.steps.length - 1 && <span className="self-center text-gray-300 dark:text-white/20">›</span>}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>

      {/* recent actions */}
      <div className="mt-4">
        <div className={`${sectionLabel} mb-1`}>Recent actions</div>
        {c.actions.length === 0 && <Empty>No actions logged yet.</Empty>}
        <ul className="text-[10px]">
          {c.actions.map((l, i) => (
            <li key={i} className="flex gap-2 py-0.5">
              <span className="w-28 shrink-0 text-gray-400">{when(l.at)}</span>
              <span className="w-24 shrink-0 truncate text-gray-500">{byId[l.agent]?.icon} {l.job}</span>
              <span className="flex-1 truncate" title={l.note}>{l.action}{l.note ? ` — ${l.note}` : ""}</span>
              {l.link && (l.link.startsWith("agents/runs/") ? <ReportLink file={l.link} onOpen={onOpen} /> : l.link.startsWith("http") || l.link.startsWith("/") ? <a href={l.link.split("#")[0]} className="text-gray-400 underline">link</a> : <span className="text-gray-400">{l.link}</span>)}
            </li>
          ))}
        </ul>
      </div>
    </section>
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
              {r.agent} · {when(r.started)} → {r.finished ? when(r.finished) : "running"} · <b>{r.result}</b>{r.test ? " · test run" : ""} · {r.model}
              {r.duration_ms ? ` · ${Math.round(r.duration_ms / 1000)} s` : ""}{r.turns ? ` · ${r.turns} steps` : ""}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 dark:hover:text-white">✕</button>
        </div>
        <p className="mb-3">{r.summary}</p>
        <Block title="Checks">
          <ul>
            {(r.checks ?? []).map((c, i) => (
              <li key={i}>{c.state === "pass" ? "✓" : c.state === "fail" ? "✗" : "○"} {c.text}{c.note ? <span className="text-gray-400"> — {c.note}</span> : null}</li>
            ))}
          </ul>
        </Block>
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
