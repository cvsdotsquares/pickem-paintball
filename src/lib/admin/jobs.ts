import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { baseOf, graphicName, keyInspo } from "./generator";
import { HUB } from "./library";
import { MODEL_CHOICES, PICKABLE_DEFAULTS } from "./models";

/**
 * Jobs = Claude Code run on James's Mac, on his subscription (`claude -p`, the same as typing
 * `claude` in Terminal), from inside pickem-hub so the skills and scripts are there.
 * One run per graphic, up to MAX_PARALLEL at once (James, 17 Oct: several graphics in the works, each with its own
 * Stop button). Each run's output is kept in pickem-hub/library/jobs/.
 */

// model: James's pick, options/revise only; teams / set / auto: Populate (step 5) only
export type JobParams = { event?: string; type?: string; model?: string; teams?: string; set?: string[]; auto?: boolean };
type JobDef = {
  label: string;
  prompt: string | ((p: JobParams) => string);
  allowedTools: string[];
  /** A plain script instead of Claude (python3 in generator/): no tokens, not counted in MAX_PARALLEL. */
  script?: (p: JobParams) => string[];
};

const SLACK = "mcp__claude_ai_Slack__";
const TOKEN_FILE = path.join(os.homedir(), ".config/pickem/claude_token");
/**
 * Model + effort per job (James, 17 Oct). Opus 5.5 for judgment and building; Sonnet 5.5 (~30% faster, half
 * the cost) for routine work; Fable 5.1 for a new event's look (once per event, where the idea matters most) and,
 * from 30 Oct, the first three layouts (Options). Every run's time/tokens go to generator/feedback/runs.jsonl, so these get
 * reviewed against real numbers. ADMIN_JOB_MODEL overrides all (for a quick test).
 */
const JOB_SETUP: Record<string, { model: string; effort: "low" | "medium" | "high" }> = {
  "check-inspo": { model: "claude-sonnet-5-5", effort: "medium" },
  "event-setup": { model: "claude-fable-5-1", effort: "medium" },
  "post-brief": { model: "claude-opus-5-5", effort: "high" },
  "post-options": { model: PICKABLE_DEFAULTS["post-options"], effort: "medium" },
  "post-review": { model: "claude-opus-5-5", effort: "medium" },
  "post-revise": { model: PICKABLE_DEFAULTS["post-revise"], effort: "medium" },
};
const setupFor = (job: string, picked?: string) => {
  const s = JOB_SETUP[job] ?? { model: "claude-opus-5-5", effort: "medium" as const };
  // James's pick from the post page wins over the default, on the steps that have a picker
  const pick = picked && job in PICKABLE_DEFAULTS && MODEL_CHOICES.some((m) => m.id === picked) ? picked : undefined;
  return { ...s, model: process.env.ADMIN_JOB_MODEL || pick || s.model, picked: !!pick };
};

// Post Generator jobs: the steps of PROCESS.md, run by the pickem-social-post skill ("Admin panel jobs" section).
const POST_TOOLS = [
  "Skill",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Agent",
  "Task",
  "Bash(python3:*)",
  "Bash(cp:*)",
  "Bash(mkdir:*)",
  "Bash(ls:*)",
  "Bash(sips:*)",
];
const postJob = (step: string, label: string): JobDef => ({
  label,
  allowedTools: POST_TOOLS,
  prompt: ({ event = "", type = "" }) =>
    `Post Generator job "${step}" for event ${event}, post type ${baseOf(type)}. Follow the pickem-social-post skill, ` +
    `section "Admin panel jobs" → ${step}, working in generator/work/${event}/${type}/. ` +
    (type !== baseOf(type) || graphicName(event, type)
      ? `This graphic is "${graphicName(event, type) || type}", one of several in the ${baseOf(type)} bucket: ` +
        `the master is generator/masters/${baseOf(type)}/ (if there is one) and it must be a different post from its siblings ` +
        `(generator/work/${event}/${baseOf(type)}*/). `
      : "") +
    (keyInspo(event, type).length
      ? `James starred these as KEY inspiration for this graphic — look at each one and give them the most weight ` +
        `(inspo:<file> = kit 05. Inspiration/<file>, past:<file> = kit 06. Past Work/Instagram archive/<file>; ` +
        `thumbnails in library/.thumbs/): ${keyInspo(event, type).join(", ")}. `
      : "") +
    "Nobody is watching this run, so do not ask questions: decide, note any stand-ins in the files, and finish. " +
    "Make your LAST line one plain sentence for James saying what is ready.",
});

export const JOBS: Record<string, JobDef> = {
  "check-inspo": {
    label: "Check inspo",
    prompt:
      "Check inspo: follow the pickem-check-inspo skill exactly. Nobody is watching this run, so do not ask questions. " +
      "When finished, make your LAST line a one-line summary for James, e.g. '2 new: 1 image, 1 reel' or 'No new inspiration'.",
    allowedTools: [
      "Skill",
      "Read",
      "Write",
      "Edit",
      "Bash(python3:*)",
      `${SLACK}slack_read_channel`,
      `${SLACK}slack_read_thread`,
      `${SLACK}slack_read_file`,
      `${SLACK}slack_send_message`,
    ],
  },
  "event-setup": {
    label: "Set up event + brand board",
    allowedTools: POST_TOOLS,
    prompt: ({ event }) =>
      `Post Generator job "event-setup" for new event ${event}. Follow the pickem-social-post skill, ` +
      `section "Admin panel jobs" → event-setup, reading generator/work/${event}/event_request.json. ` +
      "Nobody is watching this run, so do not ask questions: decide, note any stand-ins in board_notes.md, and finish. " +
      "Make your LAST line one plain sentence for James saying the board is ready to approve.",
  },
  "post-brief": postJob("brief", "Write brief"),
  "post-options": postJob("options", "Make rough layouts A/B/C"),
  "post-review": postJob("review", "Build the final version"),
  "post-revise": postJob("revise", "Apply feedback"),
  // Step 5 (James, 17 Oct): fill the signed-off template with the latest numbers and make every version → Drive kit.
  // auto = right after sign-off: one post with all its numbers → made now; otherwise it stays Templated.
  populate: {
    label: "Populate final posts",
    prompt: "",
    allowedTools: [],
    script: ({ event = "", type = "", teams, set, auto }) => [
      "-I",
      path.join(HUB, "generator/make_finals.py"),
      event,
      type,
      ...(teams ? ["--teams", teams] : []),
      ...(set ?? []).flatMap((s) => ["--set", s]),
      ...(auto ? ["--auto"] : []),
    ],
  },
};

export type JobRun = {
  id: string;
  job: string;
  label: string;
  params: JobParams;
  status: "running" | "done" | "failed";
  startedAt: string;
  finishedAt?: string;
  summary?: string;
  logFile: string;
  stopped?: boolean; // James pressed Stop
  model?: string; // the model this run used
};

// Survives dev-server hot reloads.
const g = globalThis as unknown as { __adminJobs?: JobRun[] };
const runs = (g.__adminJobs ??= []);
const gc = globalThis as unknown as { __adminChildren?: Map<string, import("child_process").ChildProcess> };
const children = (gc.__adminChildren ??= new Map());
/** At most this many Claude runs at once — each uses James's subscription limit (James, 30 Oct: 3 → 5). */
export const MAX_PARALLEL = 5;

export const listRuns = () => runs.slice(-10).reverse();
/** Newest run for one event + post type (Post Generator page). */
export const lastRunFor = (event: string, type: string) =>
  [...runs].reverse().find((r) => r.params?.event === event && r.params?.type === type);
/**
 * A failed last run only matters while the graphic hasn't moved on since. Once its status changed after the run
 * ended (e.g. James signed it off, or a later step wrote files), the old failure is history, not a red pill.
 */
export const failedFor = (event: string, type: string, status: { stage: string; updated: string }) => {
  const r = lastRunFor(event, type);
  if (r?.status !== "failed") return false;
  if (status.stage === "signed_off") return false;
  const ended = r.finishedAt ? Date.parse(r.finishedAt) : NaN;
  const changed = status.updated ? Date.parse(status.updated.replace(" ", "T") + "Z") : NaN;
  return !(changed >= ended);
};
export const running = () => runs.find((r) => r.status === "running");
export const runningAll = () => runs.filter((r) => r.status === "running");
/** Claude runs only (scripts like Populate don't use the subscription, so they don't count towards MAX_PARALLEL). */
export const runningClaude = () => runningAll().filter((r) => !JOBS[r.job]?.script);
/** The run working on this graphic right now (event + type), if any. */
export const runningFor = (event: string, type: string) =>
  runs.find((r) => r.status === "running" && r.params?.event === event && r.params?.type === type);

/** Stop the run on this graphic (James's Stop button). The step can be started again from the page. */
export function stopJob(event: string, type: string): { ok: true } | { error: string } {
  const run = runningFor(event, type);
  if (!run) return { error: "Nothing is running on this graphic" };
  run.stopped = true;
  const child = children.get(run.id);
  try {
    if (child?.pid) process.kill(-child.pid, "SIGTERM"); // the whole group: Claude and anything it started
  } catch {
    child?.kill("SIGTERM");
  }
  return { ok: true };
}

export function readLog(run: JobRun): string {
  try {
    return fs.readFileSync(run.logFile, "utf8");
  } catch {
    return "";
  }
}

/** One line per run in pickem-hub/generator/feedback/runs.jsonl: time, steps, tokens (reviewed with James after each event). */
function logRun(job: string, params: JobParams, ok: boolean, r: { duration_ms?: number; num_turns?: number; usage?: object; total_cost_usd?: number; session_id?: string; is_error?: boolean }) {
  if (!job.startsWith("post-") && job !== "event-setup") return;
  const line = {
    at: new Date().toISOString().slice(0, 16).replace("T", " "),
    event: params.event ?? "",
    type: params.type ?? "",
    step: job.replace("post-", ""),
    model: setupFor(job, params.model).model,
    effort: setupFor(job, params.model).effort,
    model_picked: setupFor(job, params.model).picked, // James chose it, not the default
    ok,
    is_error: !ok,
    duration_ms: r.duration_ms ?? null,
    turns: r.num_turns ?? null,
    usage: r.usage ?? null,
    cost_usd_equiv: r.total_cost_usd ?? null,
    session_id: r.session_id ?? null,
  };
  try {
    fs.mkdirSync(path.join(HUB, "generator/feedback"), { recursive: true });
    fs.appendFileSync(path.join(HUB, "generator/feedback/runs.jsonl"), JSON.stringify(line) + "\n");
  } catch {
    // logging must never break a job
  }
}

/** Save what a Post Generator job wrote in pickem-hub's git (local commit only; James pushes backups). */
function commitWork(message: string) {
  const git = (args: string[]) => spawn("git", ["-C", HUB, ...args], { stdio: "ignore" });
  const add = git(["add", "generator/work", "generator/feedback", "generator/masters", "generator/CONTEXT.md", "generator/themes.json", "generator/boards"]);
  add.on("close", () => git(["commit", "-q", "-m", `Post Generator: ${message}`]));
}

export function startJob(job: string, params: JobParams = {}): JobRun | { error: string } {
  const def = JOBS[job];
  if (!def) return { error: "Unknown job" };
  if (params.type && runningFor(params.event ?? "", params.type)) return { error: "Claude is already working on this graphic" };
  if (!params.type && runs.some((r) => r.status === "running" && r.job === job && r.params?.event === params.event))
    return { error: "That job is already running" };
  if (!def.script && runningClaude().length >= MAX_PARALLEL)
    return { error: `${MAX_PARALLEL} Claude runs are going already — wait for one to finish (or stop one)` };

  const dir = path.join(HUB, "library/jobs");
  fs.mkdirSync(dir, { recursive: true });
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}_${job}`;
  const run: JobRun = {
    id,
    job,
    label: def.label,
    params,
    status: "running",
    startedAt: new Date().toISOString(),
    logFile: path.join(dir, `${id}.log`),
  };
  runs.push(run);
  if (def.script) return startScript(run, def.script(params));

  const bin = process.env.CLAUDE_BIN || path.join(os.homedir(), ".local/bin/claude");
  const out = fs.createWriteStream(run.logFile);
  // A clean environment: nothing from the panel, and no sign of a parent Claude session.
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k === "ADMIN_PANEL" || k.startsWith("CLAUDE_CODE") || k === "CLAUDECODE") delete env[k];
  // The long-lived login (`claude setup-token`), as agents/run.py does: without it `claude -p` falls back on the
  // app login, which expires ("OAuth session expired and could not be refreshed", Post Generator on the mini, 29 Oct).
  try {
    const token = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (token) env.CLAUDE_CODE_OAUTH_TOKEN = token;
  } catch {
    // no token file: the app login it is
  }
  const prompt = typeof def.prompt === "function" ? def.prompt(params) : def.prompt;
  // JSON output: the final message plus duration, steps and tokens, so every run's cost is logged.
  // Always pass the model: the Mac's CLI default was the older Opus 5 at high effort (3–7x slower per step, 17 Oct).
  const { model, effort } = setupFor(job, params.model);
  run.model = model;
  const child = spawn(bin, ["-p", prompt, "--model", model, "--effort", effort, "--output-format", "json", "--allowedTools", def.allowedTools.join(",")], {
    cwd: HUB,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // its own process group, so Stop ends everything it started
  });
  children.set(run.id, child);
  let stdout = "";
  child.stdout.on("data", (b) => (stdout += b));
  child.stderr.pipe(out, { end: false });
  let finished = false;
  const finish = (ok: boolean, note?: string) => {
    if (finished) return; // "error" and "close" can both fire
    finished = true;
    let result: { result?: string; is_error?: boolean; duration_ms?: number; num_turns?: number; usage?: object; total_cost_usd?: number; session_id?: string } = {};
    try {
      result = JSON.parse(stdout.trim().split("\n").pop() || "{}");
    } catch {
      result = { result: stdout };
    }
    out.write(`${result.result ?? stdout}\n`);
    if (run.stopped) {
      ok = false;
      note = "Stopped by James";
    }
    if (note) out.write(`\n${note}\n`);
    if (result.is_error) ok = false;
    logRun(job, params, ok, result);
    out.end(() => {
      const lines = readLog(run).trim().split("\n").filter(Boolean);
      // Success: Claude's last line is the summary. Failure: its first line usually says why (e.g. a usage limit).
      run.summary = run.stopped ? "Stopped by James" : ok ? lines[lines.length - 1] : lines[0] ?? note;
      run.status = ok ? "done" : "failed";
      run.finishedAt = new Date().toISOString();
    });
  };
  child.on("error", (e) => finish(false, `Could not start Claude: ${e.message}`));
  child.on("close", (code) => {
    children.delete(run.id);
    finish(code === 0, code === 0 ? undefined : `Claude stopped with code ${code}`);
    if (job.startsWith("post-") || job === "event-setup") commitWork(`${def.label}: ${params.event ?? ""} ${params.type ?? ""}`.trim());
  });
  return run;
}

/** A script job (Populate): python3 from generator/, its own process group so Stop ends it; last line = summary. */
function startScript(run: JobRun, args: string[]): JobRun {
  const out = fs.createWriteStream(run.logFile);
  const child = spawn("python3", args, {
    cwd: path.join(HUB, "generator"),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  children.set(run.id, child);
  child.stdout.pipe(out, { end: false });
  child.stderr.pipe(out, { end: false });
  let finished = false;
  const finish = (ok: boolean, note?: string) => {
    if (finished) return;
    finished = true;
    if (run.stopped) {
      ok = false;
      note = "Stopped by James";
    }
    if (note) out.write(`\n${note}\n`);
    out.end(() => {
      const lines = readLog(run).trim().split("\n").filter(Boolean);
      run.summary = run.stopped ? "Stopped by James" : lines[lines.length - 1] ?? note;
      run.status = ok ? "done" : "failed";
      run.finishedAt = new Date().toISOString();
    });
  };
  child.on("error", (e) => finish(false, `Could not start: ${e.message}`));
  child.on("close", (code) => {
    children.delete(run.id);
    finish(code === 0, code === 0 ? undefined : `Stopped with code ${code}`);
    commitWork(`${run.label}: ${run.params.event ?? ""} ${run.params.type ?? ""}`.trim());
  });
  return run;
}
