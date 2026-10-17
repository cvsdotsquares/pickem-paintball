import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { HUB } from "./library";

/**
 * Jobs = Claude Code run on James's Mac, on his subscription (`claude -p`, the same as typing
 * `claude` in Terminal), from inside pickem-hub so the skills and scripts are there.
 * One job at a time. Each run's output is kept in pickem-hub/library/jobs/.
 */

export type JobParams = { event?: string; type?: string };
type JobDef = { label: string; prompt: string | ((p: JobParams) => string); allowedTools: string[] };

const SLACK = "mcp__claude_ai_Slack__";

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
  prompt: ({ event, type }) =>
    `Post Generator job "${step}" for event ${event}, post type ${type}. Follow the pickem-social-post skill, ` +
    `section "Admin panel jobs" → ${step}, working in generator/work/${event}/${type}/. ` +
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
};

// Survives dev-server hot reloads.
const g = globalThis as unknown as { __adminJobs?: JobRun[] };
const runs = (g.__adminJobs ??= []);

export const listRuns = () => runs.slice(-10).reverse();
/** Newest run for one event + post type (Post Generator page). */
export const lastRunFor = (event: string, type: string) =>
  [...runs].reverse().find((r) => r.params?.event === event && r.params?.type === type);
export const running = () => runs.find((r) => r.status === "running");

export function readLog(run: JobRun): string {
  try {
    return fs.readFileSync(run.logFile, "utf8");
  } catch {
    return "";
  }
}

/** Save what a Post Generator job wrote in pickem-hub's git (local commit only; James pushes backups). */
function commitWork(message: string) {
  const git = (args: string[]) => spawn("git", ["-C", HUB, ...args], { stdio: "ignore" });
  const add = git(["add", "generator/work", "generator/masters", "generator/CONTEXT.md", "generator/themes.json", "generator/boards"]);
  add.on("close", () => git(["commit", "-q", "-m", `Post Generator: ${message}`]));
}

export function startJob(job: string, params: JobParams = {}): JobRun | { error: string } {
  const def = JOBS[job];
  if (!def) return { error: "Unknown job" };
  if (running()) return { error: "Another job is still running" };

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

  const bin = process.env.CLAUDE_BIN || path.join(os.homedir(), ".local/bin/claude");
  const out = fs.createWriteStream(run.logFile);
  // A clean environment: nothing from the panel, and no sign of a parent Claude session.
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k === "ADMIN_PANEL" || k.startsWith("CLAUDE_CODE") || k === "CLAUDECODE") delete env[k];
  const prompt = typeof def.prompt === "function" ? def.prompt(params) : def.prompt;
  const child = spawn(bin, ["-p", prompt, "--allowedTools", def.allowedTools.join(",")], {
    cwd: HUB,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(out, { end: false });
  child.stderr.pipe(out, { end: false });
  let finished = false;
  const finish = (ok: boolean, note?: string) => {
    if (finished) return; // "error" and "close" can both fire
    finished = true;
    if (note) out.write(`\n${note}\n`);
    out.end(() => {
      const lines = readLog(run).trim().split("\n").filter(Boolean);
      // Success: Claude's last line is the summary. Failure: its first line usually says why (e.g. a usage limit).
      run.summary = ok ? lines[lines.length - 1] : lines[0] ?? note;
      run.status = ok ? "done" : "failed";
      run.finishedAt = new Date().toISOString();
    });
  };
  child.on("error", (e) => finish(false, `Could not start Claude: ${e.message}`));
  child.on("close", (code) => {
    finish(code === 0, code === 0 ? undefined : `Claude stopped with code ${code}`);
    if (job.startsWith("post-") || job === "event-setup") commitWork(`${def.label}: ${params.event ?? ""} ${params.type ?? ""}`.trim());
  });
  return run;
}
