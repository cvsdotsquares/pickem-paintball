import { execFileSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { HUB } from "./library";
import { agents as scheduleAgents, listSlots, needsYou, type SlotView } from "./scheduler";
import { readBoard } from "./todo";
import { listRuns } from "./jobs";

/**
 * Workflows (admin panel page 5, James 18 Oct 2026): the per-agent view of the team of agents.
 * Plan: pickem-hub/ideas/2026-10-18-agents-plan.md §4. Icons only, no colour coding.
 *
 * Reads: scheduler/agents.json (the team: parent, kind, enabled, paused_until), `python3 agents/playbook.py schedule`
 * (every playbook job with its real due date and state — the one place dates are worked out), agents/runs/ (one report
 * per run), agents/log.jsonl (one line per action), the Schedule's slots (read-only, through scheduler.ts) and the TO DO
 * board's "Inputs needed" card. Writes: the on/off switch and "pause until" (agents.json), and "run now" (spawns
 * agents/run.py or the Manager's morning run). Nothing else.
 */

const AGENTS_JSON = path.join(HUB, "scheduler/agents.json");
const PLAYBOOK_PY = path.join(HUB, "agents/playbook.py");
const RUNS = path.join(HUB, "agents/runs");
const LOG = path.join(HUB, "agents/log.jsonl");
const MORNING = path.join(HUB, "agents/manager/morning.py");

export type AgentRow = { id: string; name: string; icon: string; blurb: string; parent: string; kind: "agent" | "job"; enabled: boolean; paused_until: string; status: "on" | "off" | "paused" };
export type Report = {
  agent: string; job: string; event: string; name: string; workflow: string; started: string; finished: string;
  result: "running" | "ok" | "failed" | "skipped"; summary: string; checks: { text: string; state: string; note: string }[];
  actions: string[]; files: string[]; needs: { who?: string; why?: string }[] | string[]; would_send?: { channel: string; text: string }[];
  test?: boolean; slot?: string; model?: string; duration_ms?: number | null; turns?: number | null; cost_usd?: number | null; brief?: string; file: string;
};
export type LogLine = { at: string; agent: string; job: string; action: string; link?: string; note?: string; report?: string };
export type Job = {
  id: string; name: string; agent: string; workflow: string; repeat: string; needs_first: string[]; inputs: string[]; done: string; checks: string[];
  writes: string; built: boolean; model: string; notes?: string; due: string; first_due: string; state: string; waiting_on?: string[];
  last_report: string; last_result: string; last_started: string; last_summary: string; icon: string; agent_name: string;
  slot: string; // Schedule slot id (notes contain job:<id>), "" if none
  slot_status?: string; short?: string; until_date?: string; last_ok?: string;
  // How the Workflows track shows it (James 24 Oct 2026), worked out here so the page only draws:
  vstate: string; // done · today (a repeating job ran today) · ticking (own timer, in its window) · listen (on_message) · or the playbook state
  when1: string; when2: string; how: string; next_at: string; counts: boolean; // counts = part of "N of M steps done"
};
export type Timer = { label: string; name: string; ok: boolean; running: boolean; exit: string; lastOutput: string };
export type Done = { icon: string; agent: string; task: string; when: string; result: string; link: string; kind: "run" | "post" | "task" };
export type Upcoming = { icon: string; agent: string; task: string; due: string; waiting: string; link: string; state: string };
export type Card = {
  agent: AgentRow;
  children: AgentRow[]; // jobs (and the reviewer) under this agent
  lastRun: Report | null;
  nextRun: { when: string; why: string; job: string } | null;
  waitingOn: string[];
  workflows: { id: string; name: string; steps: Job[] }[];
  actions: LogLine[];
  jobRuns: { id: string; label: string; status: string; startedAt: string; summary: string }[]; // the panel's own Claude jobs (check-inspo)
};
export type View = {
  event: string; eventName: string; date: string; planningStart: string;
  team: AgentRow[];
  completed: Done[];
  upcoming: Upcoming[];
  brief: { text: string; at: string; test: boolean; file: string } | null;
  inputs: { text: string; done: boolean }[];
  inputsCard: string; // TO DO card id, "" if none yet
  needsYou: { text: string; due: string; link: string; kind: "input" | "approve" | "blocked" | "review" }[]; // the inbox, soonest first
  anchors: Record<string, string>; // picks_open, lock, day_one, event_end (ET ISO)
  listener: { on: boolean; lastWake: string; lastWakeText: string }; // the Slack listener (launchd com.pickem.listener)
  timers: Timer[]; // every launchd com.pickem.* timer: last exit (0 = fine), running, last output
  wakeups: string[]; // the day planner's wake-ups still to fire (ET ISO), soonest first
  cards: Card[];
  error?: string;
};

function readAgents(): AgentRow[] {
  const raw = JSON.parse(fs.readFileSync(AGENTS_JSON, "utf8"));
  const today = new Date().toISOString().slice(0, 10);
  return (raw.agents as Partial<AgentRow>[]).map((a) => {
    const enabled = a.enabled !== false;
    const paused = !!a.paused_until && a.paused_until.slice(0, 10) > today;
    return { id: a.id ?? "", name: a.name ?? "", icon: a.icon ?? "•", blurb: a.blurb ?? "", parent: a.parent ?? "", kind: a.kind === "job" ? "job" : "agent", enabled, paused_until: a.paused_until ?? "", status: !enabled ? "off" : paused ? "paused" : "on" };
  });
}

function playbook(): { event: string; name: string; date: string; planning_start: string; anchors: Record<string, string>; workflows: { id: string; agent: string; name: string }[]; jobs: Omit<Job, "slot">[] } {
  return JSON.parse(execFileSync("python3", ["-I", PLAYBOOK_PY, "schedule"], { cwd: HUB, encoding: "utf8", timeout: 20000 }));
}

function reports(): Report[] {
  const out: Report[] = [];
  if (!fs.existsSync(RUNS)) return out;
  for (const agent of fs.readdirSync(RUNS)) {
    const dir = path.join(RUNS, agent);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        // Agents also leave working files (plans, drafts) here; only run reports carry a result
        if (typeof r?.result !== "string") continue;
        out.push({ ...r, file: path.relative(HUB, path.join(dir, f)) });
      } catch {}
    }
  }
  return out.sort((a, b) => (b.started ?? "").localeCompare(a.started ?? ""));
}

function logLines(): LogLine[] {
  try {
    return fs.readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as LogLine).reverse();
  } catch {
    return [];
  }
}

const REPEAT_WHY: Record<string, string> = {
  once: "once", daily: "daily", weekly: "weekly (Mondays)", each_event_day: "every event day", after_each_upload: "after each long-data upload",
  every_30_min_event_days: "every 30 min on event days", own_timer: "on its own timer", on_message: "when you answer in Slack",
};
const ymdET = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD
const dayET = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "America/New_York", weekday: "short", day: "numeric", month: "short" });
const timeET = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const dayYmd = (ymd: string) => dayET(ymd + "T16:00:00Z");

/**
 * One step as the Workflows track draws it (James 24 Oct 2026). A once-job is done when it ran for real (a slot dated
 * later and not ticked = a re-run still to come). A repeating job is done only after its last day, "ran today" in
 * between; test runs never count. Own-timer jobs tick in their window; on-message jobs wait for James.
 */
function stepView(j: Omit<Job, "vstate" | "when1" | "when2" | "how" | "next_at" | "counts">, today: string, now: number) {
  const rep = j.repeat;
  const start = ymdET(j.first_due);
  const t = timeET(j.first_due);
  const standing = j.workflow.endsWith("_standing");
  let how = rep === "own_timer" ? "own timer" : rep === "on_message" ? "when you ✅ in Slack" : !j.built ? "not built yet" : j.agent === "james" ? "yours" : "starts itself";
  if (j.writes === "asks" && rep !== "on_message") how += " · asks your ✅";
  let vstate = j.state, when1 = "", when2 = "", next_at = "";
  if (rep === "once") {
    const later = Date.parse(j.first_due) > now;
    const rerun = later && !!j.slot && j.slot_status !== "done";
    if (j.state === "done" && !rerun) {
      vstate = "done";
      when1 = `done ${dayET(j.last_ok || j.first_due)}`;
    } else {
      if (j.state === "done") vstate = "not_due";
      when1 = dayET(j.first_due);
      when2 = t;
      next_at = later ? j.first_due : "";
    }
  } else if (rep === "on_message") {
    vstate = j.state === "running" ? "running" : "listen";
    when1 = j.last_ok ? `last ${dayET(j.last_ok)}` : "not used yet";
  } else {
    const end = j.until_date ?? "";
    when1 = standing ? "all year" : end === start ? dayYmd(start) : end ? `${dayYmd(start)} → ${dayYmd(end)}` : `from ${dayYmd(start)}`;
    when2 = rep === "own_timer" ? (standing ? `daily ${t}` : `from ${t}`) : `${REPEAT_WHY[rep] ?? rep} ${t}`;
    if (end && today > end) {
      vstate = "done";
      when1 = `finished ${dayYmd(end)}`;
      when2 = "";
    } else if (today < start) {
      vstate = j.built ? "not_due" : j.state;
      next_at = j.first_due;
    } else if (rep === "own_timer") {
      vstate = "ticking";
    } else {
      if (j.state === "done") vstate = "today";
      else if (j.state === "not_due") vstate = "not_due";
      const todayAt = Date.parse(j.due);
      const next = j.state === "done" || todayAt <= now ? todayAt + 86400000 : todayAt;
      if (!end || ymdET(new Date(next).toISOString()) <= end) next_at = new Date(next).toISOString();
    }
  }
  return { vstate, when1, when2, how, next_at, counts: rep !== "on_message" && !standing };
}

const TIMER_NAME: Record<string, string> = {
  "com.pickem.manager": "Manager 7 AM", "com.pickem.dayplan": "Day planner 00:01", "com.pickem.listener": "Slack listener",
  "com.pickem.livecrawl": "Live crawl", "com.pickem.eventday": "Event-day runner", "com.pickem.longdatacheck": "Long data check",
  "com.pickem.safetydiff": "Safety diff", "com.pickem.surveyrefresh": "Survey refresh",
};

/** Every launchd com.pickem.* timer (handoff 24 Oct 2026: the Manager sat at exit 78 for two days and nobody saw). */
function timers(): { timers: Timer[]; wakeups: string[] } {
  let out = "";
  try {
    out = execFileSync("launchctl", ["list"], { encoding: "utf8", timeout: 5000 });
  } catch {
    return { timers: [], wakeups: [] };
  }
  const la = path.join(process.env.HOME || "", "Library/LaunchAgents");
  const list: Timer[] = [];
  const wakeups: string[] = [];
  for (const line of out.split("\n")) {
    const [pid, exit, label] = line.split("\t");
    if (!label?.startsWith("com.pickem.")) continue;
    const w = label.match(/^com\.pickem\.wake\.(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
    if (w) {
      wakeups.push(`${w[1]}-${w[2]}-${w[3]}T${w[4]}:${w[5]}`);
      continue;
    }
    if (label.startsWith("com.pickem.wake.")) continue;
    let lastOutput = "";
    try {
      const plist = fs.readFileSync(path.join(la, `${label}.plist`), "utf8");
      const m = plist.match(/<key>StandardOutPath<\/key>\s*<string>([^<]+)<\/string>/);
      if (m && fs.existsSync(m[1])) lastOutput = fs.statSync(m[1]).mtime.toISOString();
    } catch {}
    const running = /^\d+$/.test(pid);
    list.push({ label, name: TIMER_NAME[label] ?? label.replace("com.pickem.", ""), ok: running || exit === "0", running, exit, lastOutput });
  }
  return { timers: list.sort((a, b) => a.name.localeCompare(b.name)), wakeups: wakeups.sort() };
}
const niceWhen = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleString("en-GB", { timeZone: "America/New_York", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) + " ET";
};

export async function view(): Promise<View> {
  const team = readAgents();
  const pb = playbook();
  const reps = reports();
  const log = logLines();
  let slots: SlotView[] = [];
  try {
    slots = await listSlots(pb.event);
  } catch {
    slots = [];
  }
  const slotFor = (jobId: string) => slots.find((s) => s.kind !== "post" && (s.notes ?? "").includes(`job:${jobId}`));
  const now = Date.now();
  const jobs: Job[] = pb.jobs.map((j) => {
    const base = { ...j, slot: slotFor(j.id)?.id ?? "", slot_status: slotFor(j.id)?.status ?? "" };
    return { ...base, ...stepView(base, pb.date, now) };
  });
  const icon = (id: string) => team.find((a) => a.id === id)?.icon ?? "•";

  // Recently completed: finished runs + posted posts + done tasks, newest first, 15
  const completed: Done[] = [
    ...reps.filter((r) => r.result !== "running").map((r) => ({ icon: icon(r.agent), agent: r.agent, task: r.name || r.job, when: r.finished || r.started, result: r.test ? `${r.result} (test)` : r.result, link: r.file, kind: "run" as const })),
    ...slots.filter((s) => s.status === "posted" || s.status === "done").map((s) => ({ icon: icon(s.agent), agent: s.agent, task: s.title, when: s.publishAt ?? "", result: s.status, link: `/admin/scheduler`, kind: s.kind === "post" ? ("post" as const) : ("task" as const) })),
  ]
    .sort((a, b) => b.when.localeCompare(a.when))
    .slice(0, 15);

  // Upcoming: playbook jobs not done + approved/draft posts ahead, soonest first, 15
  const waitingText = (j: Job) =>
    j.state === "not_built" ? "not built yet" : j.state === "off" ? `${j.agent_name} is off` : j.waiting_on?.length ? `waiting on ${j.waiting_on.join(", ")}` : j.inputs.length ? `needs: ${j.inputs[0]}` : j.state === "overdue" ? "overdue" : "";
  const upcoming: Upcoming[] = [
    ...jobs
      .filter((j) => !["done", "running"].includes(j.state) && j.repeat !== "own_timer" && Date.parse(j.due) >= now - 86400000)
      .map((j) => ({ icon: j.icon, agent: j.agent, task: j.name, due: j.due, waiting: waitingText(j), link: j.slot ? "/admin/scheduler" : "", state: j.state })),
    ...slots
      .filter((s) => s.kind === "post" && ["draft", "approved"].includes(s.status) && s.publishAt && Date.parse(s.publishAt) >= now)
      .map((s) => ({ icon: icon("posts"), agent: "posts", task: `Post: ${s.title}`, due: s.publishAt ?? "", waiting: s.status === "draft" ? "needs your approval" : "approved, goes out by itself", link: "/admin/scheduler", state: s.status })),
  ]
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 15);

  // The Manager's latest brief (real or test) + the Inputs needed card
  const briefRep = reps.find((r) => r.agent === "gm" && r.job === "daily_brief" && (r.brief || r.would_send?.length));
  const brief = briefRep ? { text: briefRep.brief || briefRep.would_send?.[0]?.text || "", at: briefRep.finished || briefRep.started, test: !!briefRep.test, file: briefRep.file } : null;
  const board = readBoard();
  const card = board.cards.find((c) => c.title.toLowerCase().startsWith("inputs needed") && !c.archived);
  let inputs = card ? card.checklist.map((i) => ({ text: i.text, done: i.done })) : [];
  if (!inputs.length) {
    const ir = reps.find((r) => r.agent === "gm" && r.job === "inputs_list" && r.would_send?.length);
    const t = ir?.would_send?.[0]?.text ?? "";
    inputs = t.split("\n").filter(Boolean).map((text) => ({ text, done: false }));
  }

  const panelRuns = listRuns();
  const cards: Card[] = team
    .filter((a) => a.kind === "agent" && a.id !== "james" && a.id !== "reviewer")
    .map((agent) => {
      const mine = jobs.filter((j) => j.agent === agent.id || team.find((c) => c.id === j.agent)?.parent === agent.id);
      const lastRun = reps.find((r) => r.agent === agent.id) ?? null;
      const next = mine.filter((j) => j.next_at && j.built && agent.status === "on").sort((a, b) => Date.parse(a.next_at) - Date.parse(b.next_at))[0];
      const nextRun = agent.id === "gm" ? { when: "7:00 AM ET daily", why: "the brief; the day planner sets today's wake-ups at 00:01 and whenever you move a slot", job: "daily_brief" } : next ? { when: niceWhen(next.next_at), why: `${next.short || next.name} · starts itself`, job: next.id } : null;
      const needs = (lastRun?.needs ?? []).map((n) => (typeof n === "string" ? n : [n.who, n.why].filter(Boolean).join(": ")));
      const waiting = mine.filter((j) => j.state === "waiting").map((j) => `${j.name}: waiting on ${(j.waiting_on ?? []).join(", ")}`);
      const waitingOn = Array.from(new Set([...needs, ...waiting])).slice(0, 8);
      // in time order (James 24 Oct 2026): by first date, then time; on-message jobs last
      const order = (j: Job) => (j.repeat === "on_message" ? "9" : j.first_due ? new Date(j.first_due).toISOString() : "8");
      const workflows = pb.workflows.filter((w) => w.agent === agent.id).map((w) => ({ id: w.id, name: w.name, steps: mine.filter((j) => j.workflow === w.id).sort((a, b) => order(a).localeCompare(order(b))) }));
      const childIds = team.filter((c) => c.parent === agent.id).map((c) => c.id);
      const actions = log.filter((l) => l.agent === agent.id || childIds.includes(l.agent)).slice(0, 10);
      const jobRuns = agent.id === "social" ? panelRuns.filter((r) => r.job === "check-inspo").slice(0, 3).map((r) => ({ id: r.id, label: r.label, status: r.status, startedAt: r.startedAt, summary: r.summary ?? "" })) : [];
      return { agent, children: team.filter((c) => c.parent === agent.id), lastRun, nextRun, waitingOn, workflows, actions, jobRuns };
    });

  // Needs you: the inbox. Inputs (from the card or the draft), the Schedule's needs-you strip, the plan review.
  const planRep = reps.find((r) => r.agent === "gm" && r.job === "event_plan" && r.result === "ok" && !r.test);
  const inputDue = (t: string) => {
    const m = t.match(/by ([A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2})/);
    if (!m) return "";
    const d = new Date(`${m[1]} ${new Date().getFullYear()} 12:00`);
    return isNaN(+d) ? "" : d.toISOString();
  };
  const inbox: View["needsYou"] = [
    ...inputs.filter((i) => !i.done).map((i) => ({ text: i.text, due: inputDue(i.text), link: card ? "/admin/todo" : "", kind: "input" as const })),
    ...needsYou(slots).map((n) => ({ text: n.text, due: n.due ?? "", link: "/admin/scheduler", kind: n.tone === "red" ? ("blocked" as const) : ("approve" as const) })),
    ...(planRep ? [{ text: "Review the event plan the Manager put on the Schedule", due: "", link: "/admin/scheduler", kind: "review" as const }] : []),
  ].sort((a, b) => (a.due || "9").localeCompare(b.due || "9"));

  let on = false;
  try {
    on = execFileSync("launchctl", ["list"], { encoding: "utf8", timeout: 5000 }).split("\n").some((l) => l.endsWith("com.pickem.listener") && /^\d+/.test(l));
  } catch {}
  const wake = log.find((l) => l.action === "woken by Slack");
  const listener = { on, lastWake: wake?.at ?? "", lastWakeText: wake ? `${team.find((a) => a.id === wake.agent)?.icon ?? ""} ${wake.note ?? ""}`.trim() : "" };

  const tm = timers();
  return { event: pb.event, eventName: pb.name, date: pb.date, planningStart: pb.planning_start, team, completed, upcoming, brief, inputs, inputsCard: card?.id ?? "", needsYou: inbox, anchors: pb.anchors, listener, timers: tm.timers, wakeups: tm.wakeups, cards };
}

/** One report by its hub-relative path (agents/runs/<agent>/<file>.json only). */
export function readReport(rel: string): Report {
  if (!/^agents\/runs\/[a-z_]+\/[A-Za-z0-9_.-]+\.json$/.test(rel)) throw new Error("Not a report");
  return { ...JSON.parse(fs.readFileSync(path.join(HUB, rel), "utf8")), file: rel };
}

/** The on/off switch and "pause until" (agents.json keeps every other field). */
export function setAgent(id: string, patch: { enabled?: boolean; paused_until?: string }) {
  const raw = JSON.parse(fs.readFileSync(AGENTS_JSON, "utf8"));
  const a = (raw.agents as Record<string, unknown>[]).find((x) => x.id === id);
  if (!a) throw new Error("Unknown agent");
  if (patch.enabled !== undefined) a.enabled = !!patch.enabled;
  if (patch.paused_until !== undefined) {
    if (patch.paused_until && !/^\d{4}-\d{2}-\d{2}$/.test(patch.paused_until)) throw new Error("Pause until needs a date");
    a.paused_until = patch.paused_until;
  }
  fs.writeFileSync(AGENTS_JSON, JSON.stringify(raw, null, 2) + "\n");
  scheduleAgents(); // no cache to bust; kept so the Schedule reads the same file next request
}

/** Run now: one playbook job (agents/run.py, detached, its report shows up on the page) or the Manager's whole morning run. */
export function runNow(agent: string, job: string, opts: { test?: boolean; force?: boolean } = {}): { ok: true; note: string } {
  if (!/^[a-z_]+$/.test(agent) || !/^[a-z_]+$/.test(job)) throw new Error("Unknown job");
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k === "ADMIN_PANEL" || k.startsWith("CLAUDE_CODE") || k === "CLAUDECODE") delete env[k];
  const args = job === "morning" ? [MORNING, "--now", ...(opts.test ? ["--test"] : []), ...(opts.force ? ["--force"] : [])] : [path.join(HUB, "agents/run.py"), agent, job, ...(opts.test ? ["--test"] : []), ...(opts.force ? ["--force"] : [])];
  const outDir = path.join(HUB, "agents/manager");
  fs.mkdirSync(outDir, { recursive: true });
  const out = fs.openSync(path.join(outDir, "runnow.log"), "a");
  const child = spawn("python3", args, { cwd: HUB, env, stdio: ["ignore", out, out], detached: true });
  child.unref();
  return { ok: true, note: job === "morning" ? "Morning run started: the brief lands in a minute or two." : `${job} started: its report shows here when it finishes.` };
}
