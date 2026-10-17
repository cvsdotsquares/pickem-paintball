import { execFile, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { HUB, loadLibrary, type LibraryItem } from "./library";

/**
 * Post Generator data. Everything lives in pickem-hub/generator (decided by James, 17 Oct 2026):
 * work/<event>/<type>/ holds the brief, rounds, feedback and status (layout: generator/work/README.md).
 * Claude jobs write the files; this module reads them and records James's clicks.
 */

export const GEN = path.join(HUB, "generator");
const WORK = path.join(GEN, "work");
const ID = /^[a-z0-9_]+$/;

export type PackItem = { key: string; label: string; phase: string; priority: "must" | "nice"; tags: string[]; graphics?: string[] };
export type Stage =
  | "not_started"
  | "brief"
  | "brief_approved"
  | "options"
  | "chosen"
  | "ready"
  | "feedback"
  | "signed_off";
export type Status = {
  stage: Stage;
  round: number;
  chosen: string;
  current: string;
  updated: string;
  history: { at: string; stage: string; note: string }[];
};

const now = () => new Date().toISOString().slice(0, 16).replace("T", " ");
const readJson = <T>(p: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
};
const readText = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");

export const validId = (s: string) => ID.test(s);

export type EventRequest = {
  id: string;
  name: string;
  dates: string;
  brief: string;
  inspo: string[]; // Post Library ids James ticked ("inspo:<file>" / "past:<file>")
  files: string[]; // uploaded assets, relative to generator/ (work/<id>/inputs/...)
  created: string;
  board_feedback?: { at: string; comment: string }[];
};

const readRequest = (id: string) => readJson<EventRequest | null>(path.join(WORK, id, "event_request.json"), null);

/** Events with a theme, plus new ones still being set up (event_request.json, no theme yet). */
export function listEvents(): { id: string; label: string; settingUp?: boolean }[] {
  const themes = readJson<Record<string, { event_label?: string }>>(path.join(GEN, "themes.json"), {});
  const out: { id: string; label: string; settingUp?: boolean }[] = Object.entries(themes)
    .filter(([id]) => id !== "brand")
    .map(([id, t]) => ({ id, label: t.event_label ?? id }));
  if (fs.existsSync(WORK)) {
    for (const id of fs.readdirSync(WORK)) {
      const r = readRequest(id);
      if (r && !themes[id]) out.push({ id, label: `${r.name} (setting up)`, settingUp: true });
    }
  }
  return out;
}

export const eventId = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

/** Save a New event request: James's files, brief and ticked inspiration (the event-setup job reads it). */
export function createEventRequest(
  name: string,
  dates: string,
  brief: string,
  inspo: string[],
  uploads: { name: string; data: Buffer }[],
): EventRequest {
  const id = eventId(name);
  const inputs = path.join(WORK, id, "inputs");
  fs.mkdirSync(inputs, { recursive: true });
  const files = uploads.map((u) => {
    const safe = u.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
    fs.writeFileSync(path.join(inputs, safe), u.data);
    return path.join("work", id, "inputs", safe);
  });
  const prev = readRequest(id);
  const req: EventRequest = {
    id,
    name,
    dates,
    brief,
    inspo,
    files: Array.from(new Set([...(prev?.files ?? []), ...files])),
    created: prev?.created ?? now(),
    board_feedback: prev?.board_feedback ?? [],
  };
  fs.writeFileSync(path.join(WORK, id, "event_request.json"), JSON.stringify(req, null, 2) + "\n");
  return req;
}

/** "Change the board": James's comment goes into the request for the next event-setup run. */
export function addBoardFeedback(event: string, comment: string) {
  const r = readRequest(event);
  if (!r || !comment.trim()) return;
  r.board_feedback = [...(r.board_feedback ?? []), { at: now(), comment: comment.trim() }];
  fs.writeFileSync(path.join(WORK, event, "event_request.json"), JSON.stringify(r, null, 2) + "\n");
  const b = path.join(WORK, event, "board.json");
  if (fs.existsSync(b)) fs.rmSync(b); // a changed board needs approving again
}

export const eventPack = (): PackItem[] => readJson<{ post_types: PackItem[] }>(path.join(GEN, "event_pack.json"), { post_types: [] }).post_types;

export function board(event: string) {
  const b = readJson<{ approved?: boolean; approved_at?: string }>(path.join(WORK, event, "board.json"), {});
  const img = path.join("boards", `${event}.png`);
  const r = readRequest(event);
  return {
    approved: !!b.approved,
    approvedAt: b.approved_at ?? "",
    image: fs.existsSync(path.join(GEN, img)) ? img : "",
    notes: readText(path.join(WORK, event, "board_notes.md")),
    request: r,
  };
}

export function approveBoard(event: string) {
  fs.mkdirSync(path.join(WORK, event), { recursive: true });
  fs.writeFileSync(
    path.join(WORK, event, "board.json"),
    JSON.stringify({ approved: true, approved_at: now().slice(0, 10) }, null, 2) + "\n",
  );
}

const dir = (event: string, type: string) => path.join(WORK, event, type);

export function readStatus(event: string, type: string): Status {
  return readJson<Status>(path.join(dir(event, type), "status.json"), {
    stage: "not_started",
    round: 0,
    chosen: "",
    current: "",
    updated: "",
    history: [],
  });
}

export function setStatus(event: string, type: string, patch: Partial<Status>, note: string): Status {
  const s = { ...readStatus(event, type), ...patch, updated: now() };
  s.history = [...(s.history ?? []), { at: now(), stage: s.stage, note }];
  fs.mkdirSync(dir(event, type), { recursive: true });
  fs.writeFileSync(path.join(dir(event, type), "status.json"), JSON.stringify(s, null, 2) + "\n");
  return s;
}

/** James's comments go to feedback.md, newest last; every job reads it first. */
export function addFeedback(event: string, type: string, stage: string, comment: string) {
  if (!comment.trim()) return;
  fs.mkdirSync(dir(event, type), { recursive: true });
  fs.appendFileSync(path.join(dir(event, type), "feedback.md"), `\n## ${now()} — at stage "${stage}"\n${comment.trim()}\n`);
  logFeedback(event, type, stage, comment);
}

/** Every comment also goes to the feedback log (generator/feedback/log.jsonl), reviewed with James after each stage/event. */
function logFeedback(event: string, type: string, stage: string, said: string) {
  try {
    execFileSync(
      "python3",
      ["-I", path.join(GEN, "feedback", "log_feedback.py"), "add", "--event", event, "--type", type, "--stage", stage, "--said", said.trim()],
      { stdio: "ignore" },
    );
  } catch {
    // never block James's click on logging
  }
}

/** How many feedback items haven't been reviewed with James yet. */
export function openFeedbackCount(): number {
  const p = path.join(GEN, "feedback", "log.jsonl");
  if (!fs.existsSync(p)) return 0;
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .filter((l) => {
      try {
        return !JSON.parse(l).decision;
      } catch {
        return false;
      }
    }).length;
}

export type RoundFile = { label: string; png: string; pdf: string; caption: string };
export type Round = { name: string; options: RoundFile[]; post: RoundFile | null; notes: string; review: string; checks: string[] };

function roundFile(rel: string, label: string): RoundFile | null {
  const abs = path.join(GEN, rel);
  if (!fs.existsSync(path.join(abs, "post.png"))) return null;
  return {
    label,
    png: path.join(rel, "post.png"),
    pdf: fs.existsSync(path.join(abs, "post.pdf")) ? path.join(rel, "post.pdf") : "",
    caption: readText(path.join(abs, "caption.txt")),
  };
}

export function detail(event: string, type: string) {
  const d = dir(event, type);
  const rounds: Round[] = [];
  if (fs.existsSync(d)) {
    const names = fs
      .readdirSync(d)
      .filter((n) => /^round_\d+$/.test(n))
      .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
    for (const name of names) {
      const rel = path.join("work", event, type, name);
      const abs = path.join(GEN, rel);
      const options = ["A", "B", "C"].map((x) => roundFile(path.join(rel, x), x)).filter((x): x is RoundFile => !!x);
      rounds.push({
        name,
        options,
        post: roundFile(rel, name.replace("_", " ")),
        notes: readText(path.join(abs, "options.md")),
        review: readText(path.join(abs, "review.md")),
        checks: fs
          .readdirSync(abs)
          .filter((f) => /^check_.*\.png$/.test(f))
          .map((f) => path.join(rel, f)),
      });
    }
  }
  return {
    status: readStatus(event, type),
    brief: readText(path.join(d, "brief.md")),
    feedback: readText(path.join(d, "feedback.md")),
    rounds,
    final: fs.existsSync(path.join(d, "final", "post.png")),
  };
}

/**
 * What a board card shows: the signed-off post, else the current round, else the latest options (A/B/C).
 * Paths are relative to generator/ (served by /api/admin/genfile).
 */
export function preview(event: string, type: string): { kind: "final" | "current" | "options" | "none"; images: string[] } {
  const d = dir(event, type);
  const rel = (...p: string[]) => path.join("work", event, type, ...p);
  if (fs.existsSync(path.join(d, "final", "post.png"))) return { kind: "final", images: [rel("final", "post.png")] };
  const st = readStatus(event, type);
  if (st.current && fs.existsSync(path.join(d, st.current, "post.png"))) return { kind: "current", images: [rel(st.current, "post.png")] };
  if (fs.existsSync(d)) {
    const rounds = fs
      .readdirSync(d)
      .filter((n) => /^round_\d+$/.test(n))
      .sort((a, b) => Number(b.slice(6)) - Number(a.slice(6)));
    for (const r of rounds) {
      const opts = ["A", "B", "C"].filter((x) => fs.existsSync(path.join(d, r, x, "post.png"))).map((x) => rel(r, x, "post.png"));
      if (opts.length) return { kind: "options", images: opts };
      if (fs.existsSync(path.join(d, r, "post.png"))) return { kind: "current", images: [rel(r, "post.png")] };
    }
  }
  return { kind: "none", images: [] };
}

/** Past versions of this post type + matching inspiration, from the Post Library, newest first (all of them: James, 17 Oct). */
export function examples(tags: string[], limit = Infinity): LibraryItem[] {
  const hits = loadLibrary().filter((i) => i.postTypes.some((t) => tags.includes(t)));
  hits.sort((a, b) => (a.source === b.source ? b.date.localeCompare(a.date) : a.source === "inspo" ? -1 : 1));
  return hits.slice(0, limit);
}

/** A file inside generator/work or generator/boards (renders, PDFs), refusing anything outside. */
export function genFile(rel: string): string | null {
  const p = path.resolve(GEN, rel);
  const ok = [path.join(GEN, "work") + path.sep, path.join(GEN, "boards") + path.sep].some((root) => p.startsWith(root));
  return ok && fs.existsSync(p) && fs.statSync(p).isFile() ? p : null;
}

/** Freeze the current round and copy the template + post to the Drive kit (generator/signoff.py). */
export function signoff(event: string, type: string): string {
  return execFileSync("python3", ["-I", path.join(GEN, "signoff.py"), event, type], { cwd: GEN, encoding: "utf8" });
}

export type Finals = {
  ready: boolean; // this post type has a data builder (generator/finals/<type>.py)
  madeAt: string;
  test: boolean;
  single: boolean; // one post for the whole event (builder sets EVENT_LEVEL = True), not one per team
  source: string;
  posts: { team: string; name: string; png: string; pdf: string }[];
  teams: { key: string; name: string }[];
};

/** Step 5: the final posts made from the signed-off template (generator/make_finals.py), plus the teams to pick from. */
export function finals(event: string, type: string): Finals {
  const teamsJson = JSON.parse(readText(path.join(GEN, "data", "teams.json")) || "{}") as Record<string, { name: string }>;
  const teams = Object.entries(teamsJson)
    .map(([key, t]) => ({ key, name: t.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const root = path.join(dir(event, type), "finals");
  const run = JSON.parse(readText(path.join(root, "run.json")) || "{}") as { made_at?: string; test?: boolean; source?: string };
  const rel = (...p: string[]) => path.join("work", event, type, "finals", ...p);
  const posts = (fs.existsSync(root) ? fs.readdirSync(root) : [])
    .filter((k) => fs.existsSync(path.join(root, k, "post.png")))
    .map((k) => ({
      team: k,
      name: teamsJson[k]?.name ?? k,
      png: rel(k, "post.png"),
      pdf: fs.existsSync(path.join(root, k, "post.pdf")) ? rel(k, "post.pdf") : "",
    }));
  const builder = readText(path.join(GEN, "finals", `${baseOf(type)}.py`)) || "";
  return {
    ready: !!builder,
    single: /^EVENT_LEVEL\s*=\s*True/m.test(builder),
    madeAt: run.made_at ?? "",
    test: !!run.test,
    source: run.source ?? "",
    posts,
    teams,
  };
}

/** Render the final posts for these teams (all when empty). A plain script, no Claude run: seconds per post. */
export function makeFinals(event: string, type: string, teams: string[]): Promise<string> {
  const args = ["-I", path.join(GEN, "make_finals.py"), event, type];
  if (teams.length) args.push("--teams", teams.join(","));
  return new Promise((resolve, reject) =>
    execFile("python3", args, { cwd: GEN, encoding: "utf8", timeout: 15 * 60 * 1000 }, (err, stdout, stderr) =>
      err ? reject(new Error((stderr || err.message).trim().split("\n").slice(-1)[0])) : resolve(
            stdout
              .trim()
              .split("\n")
              .filter((l, i, all) => l.startsWith("skipped") || i === all.length - 1)
              .join(" · "),
          ),
    ),
  );
}

/**
 * Several graphics per post type (James, 17 Oct: e.g. Countdown → "Picks open" and "Team lock deadline").
 * The first lives in work/<event>/<type>/, extra ones in work/<event>/<type>__2/, __3/ …, each with graphic.json {name}.
 * Everywhere else a "type" can be either; baseOf() gives the post type (event pack key, master, data builder).
 */
export const baseOf = (type: string) => type.split("__")[0];

export function graphicName(event: string, type: string): string {
  return readJson<{ name?: string }>(path.join(WORK, event, type, "graphic.json"), {}).name ?? "";
}

export function graphics(event: string, base: string): { key: string; name: string }[] {
  const d = path.join(WORK, event);
  const extra = fs.existsSync(d)
    ? fs
        .readdirSync(d)
        .filter((n) => n.startsWith(`${base}__`) && /^\d+$/.test(n.slice(base.length + 2)))
        .sort((a, b) => Number(a.slice(base.length + 2)) - Number(b.slice(base.length + 2)))
    : [];
  return [base, ...extra].map((key) => ({ key, name: graphicName(event, key) }));
}

/**
 * The graphics every event expects in a card (event_pack.json "graphics", e.g. Rosters → confirmed + changes;
 * James, 17 Oct): give each one its folder and name so it shows before anything is made. Never renames one.
 */
export function ensurePlanned(event: string, p: PackItem) {
  if (!fs.existsSync(path.join(WORK, event))) return;
  (p.graphics ?? []).forEach((name, i) => {
    const key = i ? `${p.key}__${i + 1}` : p.key;
    if (fs.existsSync(path.join(WORK, event, key, "graphic.json"))) return;
    renameGraphic(event, key, name);
  });
}

export function addGraphic(event: string, base: string, name: string): string {
  const n = Math.max(1, ...graphics(event, base).map((g) => Number(g.key.split("__")[1] ?? 1))) + 1;
  const key = `${base}__${n}`;
  fs.mkdirSync(path.join(WORK, event, key), { recursive: true });
  fs.writeFileSync(path.join(WORK, event, key, "graphic.json"), JSON.stringify({ name: name.trim() }, null, 2) + "\n");
  setStatus(event, key, { stage: "not_started" }, `New graphic: ${name.trim()}`);
  return key;
}

/** Name the first graphic of a bucket too, once there are several (optional). */
export function renameGraphic(event: string, type: string, name: string) {
  fs.mkdirSync(path.join(WORK, event, type), { recursive: true });
  fs.writeFileSync(path.join(WORK, event, type, "graphic.json"), JSON.stringify({ name: name.trim() }, null, 2) + "\n");
}

/**
 * Key inspiration James starred on the post page (Post Library ids "inspo:<file>" / "past:<file>"), saved to
 * work/<event>/<type>/key_inspo.json. Every job for this graphic gives them the most weight.
 */
export function keyInspo(event: string, type: string): string[] {
  return readJson<string[]>(path.join(WORK, event, type, "key_inspo.json"), []);
}

export function setKeyInspo(event: string, type: string, id: string, on: boolean): string[] {
  const list = keyInspo(event, type).filter((x) => x !== id);
  if (on) list.push(id);
  fs.mkdirSync(path.join(WORK, event, type), { recursive: true });
  fs.writeFileSync(path.join(WORK, event, type, "key_inspo.json"), JSON.stringify(list, null, 2) + "\n");
  return list;
}
