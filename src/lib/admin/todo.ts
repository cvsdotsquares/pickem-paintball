import fs from "fs";
import path from "path";
import { HUB } from "./library";

/**
 * TODO board (admin page 3, James 17 Oct): one Trello-style board for all outstanding work, kept in
 * pickem-hub/todo/board.json so Claude can read and edit it too. Every save backs the old file up first.
 * Each card has one stage (progress) and one work stream; the page pivots between the two.
 */

export const TODO_FILE = path.join(HUB, "todo/board.json");
const BACKUPS = path.join(HUB, "todo/_backups");
const KEEP_BACKUPS = 100;

export type Column = { key: string; label: string; color?: string; folder?: string }; // folder: where "Work on this in Claude" opens
export type CheckItem = { id: string; text: string; done: boolean; by?: "James" | "Claude" };
export type Comment = { at: string; by: string; text: string };
export type Card = {
  id: string;
  title: string;
  desc: string;
  stage: string;
  stream: string;
  order: number; // position inside its column, in either view
  due: string; // YYYY-MM-DD or ""
  blocker: string; // what it is waiting on ("" = not blocked)
  doneFrom?: string; // the stage it was in before the tick, so un-ticking puts it back
  checklist: CheckItem[];
  comments: Comment[];
  archived: boolean;
  addedBy: "James" | "Claude"; // Claude's follow-ups can be filtered out (James, 17 Oct)
  created: string;
  updated: string;
};
export type Board = { stages: Column[]; streams: Column[]; cards: Card[] };

const EMPTY: Board = { stages: [], streams: [], cards: [] };
const now = () => new Date().toISOString();
export const newId = () => Math.random().toString(36).slice(2, 10);

export function readBoard(): Board {
  try {
    const b: Board = { ...EMPTY, ...JSON.parse(fs.readFileSync(TODO_FILE, "utf8")) };
    b.cards = b.cards.map((c) => ({ ...c, addedBy: c.addedBy ?? "James" }));
    return b;
  } catch {
    return EMPTY;
  }
}

function writeBoard(b: Board) {
  fs.mkdirSync(path.dirname(TODO_FILE), { recursive: true });
  if (fs.existsSync(TODO_FILE)) {
    fs.mkdirSync(BACKUPS, { recursive: true });
    fs.copyFileSync(TODO_FILE, path.join(BACKUPS, `board_${now().replace(/[:.]/g, "-")}.json`));
    const old = fs.readdirSync(BACKUPS).sort();
    old.slice(0, Math.max(0, old.length - KEEP_BACKUPS)).forEach((f) => fs.rmSync(path.join(BACKUPS, f)));
  }
  fs.writeFileSync(TODO_FILE, JSON.stringify(b, null, 2) + "\n", "utf8");
}

const CARD_FIELDS = ["title", "desc", "stage", "stream", "order", "due", "blocker", "doneFrom", "checklist", "archived"] as const;

/** Add a card (no id) or change some of its fields. Returns the board. */
export function saveCard(patch: Partial<Card>): Board {
  const b = readBoard();
  let card = patch.id ? b.cards.find((c) => c.id === patch.id) : undefined;
  if (!card) {
    if (patch.id) throw new Error("Card not found");
    const col = b.cards.filter((c) => c.stage === patch.stage);
    card = {
      id: newId(),
      title: "",
      desc: "",
      stage: b.stages[0]?.key ?? "",
      stream: b.streams[0]?.key ?? "",
      order: Math.max(0, ...col.map((c) => c.order)) + 1,
      due: "",
      blocker: "",
      checklist: [],
      comments: [],
      archived: false,
      addedBy: patch.addedBy === "Claude" ? "Claude" : "James",
      created: now(),
      updated: now(),
    };
    b.cards.push(card);
  }
  for (const f of CARD_FIELDS) if (patch[f] !== undefined) (card as Record<string, unknown>)[f] = patch[f];
  card.title = card.title.trim() || "Untitled";
  card.updated = now();
  writeBoard(b);
  return b;
}

/** Delete a card for good (James, 17 Oct). The backup taken before this save still has it. */
export function deleteCard(id: string): Board {
  const b = readBoard();
  if (!b.cards.some((c) => c.id === id)) throw new Error("Card not found");
  b.cards = b.cards.filter((c) => c.id !== id);
  writeBoard(b);
  return b;
}

/** "Clear done" (James, 17 Oct): archive every card in the Done stage. Returns the board. */
export function clearDone(): Board {
  const b = readBoard();
  for (const c of b.cards) if (c.stage === "done" && !c.archived) Object.assign(c, { archived: true, updated: now() });
  writeBoard(b);
  return b;
}

export function addComment(id: string, text: string, by = "James"): Board {
  const b = readBoard();
  const card = b.cards.find((c) => c.id === id);
  if (!card) throw new Error("Card not found");
  card.comments.push({ at: now(), by, text: text.trim() });
  card.updated = now();
  writeBoard(b);
  return b;
}

/** Replace the stage or work stream columns (add, rename, recolour, reorder). Keys of columns in use can't go. */
export function saveColumns(group: "stages" | "streams", cols: Column[]): Board {
  const b = readBoard();
  const field = group === "stages" ? "stage" : "stream";
  const keys = new Set(cols.map((c) => c.key));
  const orphan = b.cards.find((c) => !c.archived && !keys.has(c[field]));
  if (orphan) throw new Error(`"${orphan.title}" is still in that column — move it first`);
  b[group] = cols.map((c) => ({
    key: c.key,
    label: c.label.trim() || c.key,
    ...(c.color ? { color: c.color } : {}),
    ...(c.folder ? { folder: c.folder } : {}),
  }));
  writeBoard(b);
  return b;
}
