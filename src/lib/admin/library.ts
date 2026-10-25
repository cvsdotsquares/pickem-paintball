import fs from "fs";
import os from "os";
import path from "path";
import { readCsv, writeCsvWithBackup, type CsvTable } from "./csv";

/**
 * Post Library data. The Drive kit's CSVs are the home for every post and its tags
 * (decided by James, 16 Oct 2026) — this module only reads and edits them in place.
 * The tag list itself lives in pickem-hub/inspo/tags.json, shared with the check-inspo skill.
 */

const HOME = os.homedir();
export const HUB = process.env.PICKEM_HUB || path.join(HOME, "Documents/pickem-hub");
export const KIT =
  process.env.PICKEM_KIT ||
  path.join(HOME, "Library/CloudStorage/GoogleDrive-greenjoc3397@gmail.com/My Drive/PickEm Paintball/Social Media Kit");

export const SOURCES = {
  past: { dir: path.join(KIT, "06. Past Work/Instagram archive"), fields: { types: "post_type", phases: "phase" } },
  inspo: { dir: path.join(KIT, "05. Inspiration"), fields: { types: "post_types", phases: "phases" } },
} as const;
export type Source = keyof typeof SOURCES;

const indexFile = (s: Source) => path.join(SOURCES[s].dir, "_index.csv");
const TAGS_FILE = path.join(HUB, "inspo/tags.json");

export type TagGroup = "post_types" | "phases" | "style";
export type TagList = {
  signed_off?: boolean;
  signed_off_at?: string;
  post_types: Record<string, string>;
  phases: Record<string, string>;
  style: Record<string, string>;
  [k: string]: unknown;
};

export type LibraryItem = {
  id: string; // "<source>:<file>"
  source: Source;
  files: string[]; // the image (one file per post)
  carousel: string[]; // every slide of the carousel this image came from (empty if not a carousel)
  slide: number; // 1-based slide number in that carousel (0 if not a carousel)
  date: string;
  event: string;
  postTypes: string[];
  phases: string[];
  style: string[];
  tagsFrom: string; // "Claude" = suggested, waiting for James; "James" = confirmed
  title: string; // headline (past) or Slack message (inspo)
  caption: string;
  permalink: string;
  notes: string; // James's own notes (e.g. what he likes about an inspiration image)
  kind: "image" | "reel" | "screenshot"; // inspiration: reel = motion study (videos + strips + breakdown)
  link: string; // the link James shared (reels and screenshots)
  study: string; // reels: study folder inside 05. Inspiration (e.g. "studies/2026-10-17_0342_DeaHA0PicUh")
};

const split = (v: string | undefined) =>
  (v ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
const join = (xs: string[]) => Array.from(new Set(xs)).join("; ");

export function readTags(): TagList {
  return JSON.parse(fs.readFileSync(TAGS_FILE, "utf8"));
}

export function writeTags(tags: TagList): void {
  const dir = path.join(HUB, "inspo/_backups");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(TAGS_FILE, path.join(dir, `tags_${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
  fs.writeFileSync(TAGS_FILE, JSON.stringify(tags, null, 2) + "\n", "utf8");
}

/**
 * Past posts: one item per image. Carousel slides often do different jobs (James, 17 Oct), so each slide
 * is its own post with its own tags; `carousel` lists every slide of the post it came from, for context.
 * A carousel starts at slide "1" and owns the rows after it.
 */
function groupPast(table: CsvTable): { item: LibraryItem; rows: Record<string, string>[] }[] {
  const out: { item: LibraryItem; rows: Record<string, string>[] }[] = [];
  let carousel: string[] = [];
  for (const r of table.rows) {
    if (r.slide === "1") carousel = [];
    if (r.slide) carousel.push(r.file);
    out.push({
      rows: [r],
      item: {
        id: `past:${r.file}`,
        source: "past",
        files: [r.file],
        carousel: r.slide ? carousel : [], // shared array: later slides of the same carousel get pushed in
        slide: Number(r.slide) || 0,
        date: r.post_date,
        event: r.event ?? "",
        postTypes: split(r.post_type),
        phases: split(r.phase),
        style: split(r.style_tags),
        tagsFrom: r.tags_from ?? "",
        title: r.headline ?? "",
        caption: r.caption ?? "",
        permalink: "",
        notes: r.notes ?? "",
        kind: "image",
        link: "",
        study: "",
      },
    });
  }
  return out;
}

function groupInspo(table: CsvTable): { item: LibraryItem; rows: Record<string, string>[] }[] {
  return table.rows.map((r) => ({
    rows: [r],
    item: {
      id: `inspo:${r.file}`,
      source: "inspo" as const,
      files: [r.file],
      carousel: [],
      slide: 0,
      date: (r.posted ?? "").slice(0, 10),
      event: "Inspiration",
      postTypes: split(r.post_types),
      phases: split(r.phases),
      style: split(r.style_tags),
      tagsFrom: r.tags_from ?? "",
      title: r.message ?? "",
      caption: "",
      permalink: r.permalink ?? "",
      notes: r.notes ?? "",
      kind: (["reel", "screenshot"].includes(r.kind) ? r.kind : "image") as LibraryItem["kind"],
      link: r.link ?? "",
      study: r.study ?? "",
    },
  }));
}

const group = (s: Source, t: CsvTable) => (s === "past" ? groupPast(t) : groupInspo(t));

export function loadLibrary(): LibraryItem[] {
  return (Object.keys(SOURCES) as Source[]).flatMap((s) => group(s, readCsv(indexFile(s))).map((g) => g.item));
}

export type TagEdit = { postTypes: string[]; phases: string[]; style: string[] };

/** Save James's tags for one post (one image). Marks it as confirmed by James. */
export function saveItemTags(id: string, edit: TagEdit): LibraryItem | null {
  const cut = id.indexOf(":");
  const source = id.slice(0, cut) as Source;
  const file = id.slice(cut + 1);
  if (!(source in SOURCES)) return null;
  const table = readCsv(indexFile(source));
  const g = group(source, table).find((x) => x.item.files[0] === file);
  if (!g) return null;
  const f = SOURCES[source].fields;
  for (const c of [f.types, f.phases, "style_tags", "tags_from"]) if (!table.cols.includes(c)) table.cols.push(c);
  for (const r of g.rows) {
    r[f.types] = join(edit.postTypes);
    r[f.phases] = join(edit.phases);
    r.style_tags = join(edit.style);
    r.tags_from = "James";
  }
  writeCsvWithBackup(indexFile(source), table);
  return group(source, table).find((x) => x.item.files[0] === file)!.item;
}

/** Save James's notes on one post. Leaves its tags (and whether they're confirmed) alone. */
export function saveItemNotes(id: string, notes: string): LibraryItem | null {
  const cut = id.indexOf(":");
  const source = id.slice(0, cut) as Source;
  const file = id.slice(cut + 1);
  if (!(source in SOURCES)) return null;
  const table = readCsv(indexFile(source));
  const row = table.rows.find((r) => r.file === file);
  if (!row) return null;
  if (!table.cols.includes("notes")) table.cols.push("notes");
  row.notes = notes.trim();
  writeCsvWithBackup(indexFile(source), table);
  return group(source, table).find((x) => x.item.files[0] === file)!.item;
}

/**
 * Rename, merge or delete a tag value in every post of both CSVs.
 * Post types and phases are stored by their full label; style tags by their short word.
 */
export function replaceTagEverywhere(groupName: TagGroup, from: string, to: string | null): number {
  let changed = 0;
  for (const s of Object.keys(SOURCES) as Source[]) {
    const f = SOURCES[s].fields;
    const col = groupName === "post_types" ? f.types : groupName === "phases" ? f.phases : "style_tags";
    const table = readCsv(indexFile(s));
    let touched = false;
    for (const r of table.rows) {
      const vals = split(r[col]);
      if (!vals.includes(from)) continue;
      r[col] = join(vals.flatMap((v) => (v === from ? (to ? [to] : []) : [v])));
      touched = true;
      changed++;
    }
    if (touched) writeCsvWithBackup(indexFile(s), table);
  }
  return changed;
}

/**
 * Resolve a media path inside a source folder, refusing anything that escapes it.
 * Inspiration also serves files from its study folders (studies/<name>/video_1.mp4, strip_1.jpg).
 */
export function mediaPath(source: string, file: string): string | null {
  if (!(source in SOURCES)) return null;
  const dir = SOURCES[source as Source].dir;
  const p = path.resolve(dir, file);
  const allowed =
    path.dirname(p) === dir || (source === "inspo" && path.dirname(path.dirname(p)) === path.join(dir, "studies"));
  if (!allowed || !fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
  return p;
}

export type Study = { videos: string[]; strips: string[]; breakdown: string };

/** A reel's study folder: its videos, frame strips and Claude's breakdown (paths relative to 05. Inspiration). */
export function readStudy(study: string): Study | null {
  const dir = path.resolve(SOURCES.inspo.dir, study);
  if (path.dirname(dir) !== path.join(SOURCES.inspo.dir, "studies") || !fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const rel = (f: string) => path.join(study, f);
  const breakdown = path.join(dir, "breakdown.md");
  return {
    videos: files.filter((f) => /^video_\d+\.(mp4|mov)$/i.test(f)).map(rel),
    strips: files.filter((f) => /^strip_\d+\.jpg$/i.test(f)).map(rel),
    breakdown: fs.existsSync(breakdown) ? fs.readFileSync(breakdown, "utf8") : "",
  };
}
