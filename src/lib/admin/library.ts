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
  id: string; // "<source>:<file of first slide>"
  source: Source;
  files: string[]; // every slide, in order
  date: string;
  event: string;
  postTypes: string[];
  phases: string[];
  style: string[];
  tagsFrom: string; // "Claude" = suggested, waiting for James; "James" = confirmed
  title: string; // headline (past) or Slack message (inspo)
  caption: string;
  permalink: string;
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

/** Past posts: one row per slide; a post starts at slide "" or "1" and owns the slides after it. */
function groupPast(table: CsvTable): { item: LibraryItem; rows: Record<string, string>[] }[] {
  const out: { item: LibraryItem; rows: Record<string, string>[] }[] = [];
  for (const r of table.rows) {
    const continues = r.slide && r.slide !== "1" && out.length;
    if (continues) {
      const last = out[out.length - 1];
      last.rows.push(r);
      last.item.files.push(r.file);
      continue;
    }
    out.push({
      rows: [r],
      item: {
        id: `past:${r.file}`,
        source: "past",
        files: [r.file],
        date: r.post_date,
        event: r.event ?? "",
        postTypes: split(r.post_type),
        phases: split(r.phase),
        style: split(r.style_tags),
        tagsFrom: r.tags_from ?? "",
        title: r.headline ?? "",
        caption: r.caption ?? "",
        permalink: "",
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
      date: (r.posted ?? "").slice(0, 10),
      event: "Inspiration",
      postTypes: split(r.post_types),
      phases: split(r.phases),
      style: split(r.style_tags),
      tagsFrom: r.tags_from ?? "",
      title: r.message ?? "",
      caption: "",
      permalink: r.permalink ?? "",
    },
  }));
}

const group = (s: Source, t: CsvTable) => (s === "past" ? groupPast(t) : groupInspo(t));

export function loadLibrary(): LibraryItem[] {
  return (Object.keys(SOURCES) as Source[]).flatMap((s) => group(s, readCsv(indexFile(s))).map((g) => g.item));
}

export type TagEdit = { postTypes: string[]; phases: string[]; style: string[] };

/** Save James's tags for one post (all its slides). Marks the post as confirmed by James. */
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

/** Resolve an image path inside a source folder, refusing anything that escapes it. */
export function mediaPath(source: string, file: string): string | null {
  if (!(source in SOURCES)) return null;
  const dir = SOURCES[source as Source].dir;
  const p = path.resolve(dir, file);
  if (path.dirname(p) !== dir || !fs.existsSync(p)) return null;
  return p;
}
