import { execFileSync } from "child_process";
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

export type PackItem = { key: string; label: string; phase: string; priority: "must" | "nice"; tags: string[] };
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

export function listEvents(): { id: string; label: string }[] {
  const themes = readJson<Record<string, { event_label?: string }>>(path.join(GEN, "themes.json"), {});
  return Object.entries(themes)
    .filter(([id]) => id !== "brand")
    .map(([id, t]) => ({ id, label: t.event_label ?? id }));
}

export const eventPack = (): PackItem[] => readJson<{ post_types: PackItem[] }>(path.join(GEN, "event_pack.json"), { post_types: [] }).post_types;

export function board(event: string) {
  const b = readJson<{ approved?: boolean; approved_at?: string }>(path.join(WORK, event, "board.json"), {});
  const img = path.join("boards", `${event}.png`);
  return { approved: !!b.approved, approvedAt: b.approved_at ?? "", image: fs.existsSync(path.join(GEN, img)) ? img : "" };
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

/** Past versions of this post type + matching inspiration, from the Post Library, newest first. */
export function examples(tags: string[], limit = 16): LibraryItem[] {
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
