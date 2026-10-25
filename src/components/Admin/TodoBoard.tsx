"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IoMdClose, IoMdTrash } from "react-icons/io";
import { pill, primaryButton, sectionLabel } from "./types";

// Client copies of src/lib/admin/todo.ts (that module reads the disk).
type Column = { key: string; label: string; color?: string; folder?: string };
type CheckItem = { id: string; text: string; done: boolean; by?: "James" | "Claude" };
type Who = "all" | "James" | "Claude";
type Card = {
  id: string;
  title: string;
  desc: string;
  stage: string;
  stream: string;
  order: number;
  due: string;
  blocker: string;
  doneFrom?: string;
  checklist: CheckItem[];
  comments: { at: string; by: string; text: string }[];
  archived: boolean;
  addedBy: "James" | "Claude";
  created: string;
  updated: string;
};
type Board = { stages: Column[]; streams: Column[]; cards: Card[] };
type Pivot = "stage" | "stream";
type Group = "stages" | "streams";

/** Trello's label colours. */
const COLOURS = ["#61bd4f", "#f2d600", "#ff9f1a", "#eb5a46", "#c377e0", "#0079bf", "#00c2e0", "#51e898", "#ff78cb", "#344563"];
const today = () => new Date().toISOString().slice(0, 10);
const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const newKey = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Math.random().toString(36).slice(2, 7);
const rid = () => Math.random().toString(36).slice(2, 10);
const TODO_PY = "python3 ~/Documents/pickem-hub/todo/todo.py";

/**
 * "Work on this in Claude" (James, 17 Oct): a new Claude Code session in the Claude app, in the work stream's
 * folder, with the card as its first message (claude://code/new?q=…&folder=…; the app caps q at ~14k).
 */
function claudeLink(card: Card, board: Board): string {
  const stream = board.streams.find((s) => s.key === card.stream);
  const stage = board.stages.find((s) => s.key === card.stage);
  const open = card.checklist.map((x, i) => ({ ...x, n: i + 1 })).filter((x) => !x.done);
  const doneCount = card.checklist.length - open.length;
  const notes = card.desc.trim().length > 7000 ? card.desc.trim().slice(0, 7000) + "\n…(cut — see the card)" : card.desc.trim();
  const lines = [
    "Let's work on this card from my TO DO board (Pick'Em admin panel → TO DO) and tick things off.",
    "",
    `**${card.title}** — ${stream?.label ?? card.stream} · ${stage?.label ?? card.stage}${card.due ? ` · due ${card.due}` : ""}${
      card.blocker ? ` · blocked by: ${card.blocker}` : ""
    } (card id ${card.id})`,
  ];
  if (notes) lines.push("", "Notes:", notes);
  if (card.checklist.length)
    lines.push("", `Checklist — still open (${doneCount} of ${card.checklist.length} done):`, ...open.map((x) => `${x.n}. ${x.text}`));
  const recent = card.comments.slice(-3);
  if (recent.length) lines.push("", "Latest comments:", ...recent.map((m) => `- ${m.by}: ${m.text}`));
  lines.push(
    "",
    "Read what's needed first, then tell me in plain language what you'd do first and wait for my OK before building. " +
      `As items get done, tick them on the board: \`${TODO_PY} tick ${card.id} <number>\`; when the whole card is finished: \`${TODO_PY} stage ${card.id} done\`. ` +
      "New follow-ups go on the board only when needed, grouped (~/Documents/pickem-hub/todo/README.md).",
  );
  const q = new URLSearchParams({ q: lines.join("\n").slice(0, 13000) });
  if (stream?.folder) q.set("folder", stream.folder);
  return `claude://code/new?${q.toString()}`;
}

/**
 * TODO (admin page 3, James 17 Oct): one Trello-style board for all outstanding work. Pivot between columns
 * by progress (stages) and by work stream; drag a card to another column to change that field.
 */
export default function TodoBoard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [pivot, setPivot] = useState<Pivot>("stage");
  const [openId, setOpenId] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // column key with the "add a card" box open
  // filters (James, 17 Oct): work streams (none ticked = all) and who added the card
  const [streamsOn, setStreamsOn] = useState<string[]>([]);
  const [who, setWho] = useState<Who>("all");

  useEffect(() => {
    try {
      const p = localStorage.getItem("todo-pivot");
      if (p === "stage" || p === "stream") setPivot(p);
      const f = JSON.parse(localStorage.getItem("todo-filter") ?? "{}");
      if (Array.isArray(f.streams)) setStreamsOn(f.streams);
      if (["all", "James", "Claude"].includes(f.who)) setWho(f.who);
    } catch {}
    fetch("/api/admin/todo", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setBoard(d)));
  }, []);
  const choosePivot = (p: Pivot) => {
    setPivot(p);
    try {
      localStorage.setItem("todo-pivot", p);
    } catch {}
  };

  const send = useCallback(async (body: Record<string, unknown>) => {
    setError("");
    const res = await fetch("/api/admin/todo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Could not save");
      return null;
    }
    setBoard(d);
    return d as Board;
  }, []);
  const saveCard = (card: Partial<Card>) => send({ action: "card", card });
  const setFilter = (streams: string[], w: Who) => {
    setStreamsOn(streams);
    setWho(w);
    try {
      localStorage.setItem("todo-filter", JSON.stringify({ streams, who: w }));
    } catch {}
  };

  if (!board) return <div className="p-8 text-xs text-gray-400">{error || "Loading…"}</div>;

  const group: Group = pivot === "stage" ? "stages" : "streams";
  const allLive = board.cards.filter((c) => !c.archived);
  const live = allLive.filter(
    (c) => (!streamsOn.length || streamsOn.includes(c.stream)) && (who === "all" || c.addedBy === who),
  );
  const columns = pivot === "stream" && streamsOn.length ? board.streams.filter((s) => streamsOn.includes(s.key)) : board[group];
  const filtered = live.length !== allLive.length;
  // by work stream, cards are grouped by stage (James, 17 Oct); within a stage (and by progress) they keep their order
  const stageIndex = (k: string) => board.stages.findIndex((s) => s.key === k);
  const inColumn = (key: string) =>
    live
      .filter((c) => c[pivot] === key)
      .sort((a, b) => (pivot === "stream" ? stageIndex(a.stage) - stageIndex(b.stage) : 0) || a.order - b.order);
  const streamOf = (k: string) => board.streams.find((s) => s.key === k);
  const stageOf = (k: string) => board.stages.find((s) => s.key === k);
  const open = board.cards.find((c) => c.id === openId) ?? null;

  /** Drop the dragged card into a column, before `beforeId` (or at the end). */
  const drop = (col: string, beforeId: string | null) => {
    const id = drag;
    setDrag(null);
    if (!id || id === beforeId) return;
    const list = inColumn(col).filter((c) => c.id !== id);
    const i = beforeId ? list.findIndex((c) => c.id === beforeId) : list.length;
    const prev = list[i - 1]?.order;
    const next = list[i]?.order;
    const order = prev === undefined ? (next === undefined ? 1 : next - 1) : next === undefined ? prev + 1 : (prev + next) / 2;
    setBoard({ ...board, cards: board.cards.map((c) => (c.id === id ? { ...c, [pivot]: col, order } : c)) });
    saveCard({ id, [pivot]: col, order });
  };

  const saveCols = (cols: Column[]) => send({ action: "columns", group, columns: cols });

  /** The tick on a card (James, 17 Oct): done goes to the top of Done; un-ticking puts it back where it was. */
  const toggleDone = (c: Card) => {
    if (c.stage === "done") return saveCard({ id: c.id, stage: c.doneFrom || "todo", doneFrom: "" });
    const top = Math.min(1, ...board.cards.filter((x) => x.stage === "done").map((x) => x.order)) - 1;
    return saveCard({ id: c.id, stage: "done", doneFrom: c.stage, order: top });
  };
  const removeCard = async (c: Card) => {
    if (!window.confirm(`Delete "${c.title}" for good?`)) return;
    if (await send({ action: "delete", id: c.id })) setOpenId((id) => (id === c.id ? null : id));
  };
  const clearDone = (n: number) => {
    if (window.confirm(`Clear Done? The ${n} card${n === 1 ? "" : "s"} there get archived (kept in the file, off the board).`))
      send({ action: "clear-done" });
  };
  const addColumn = () => {
    const label = window.prompt(pivot === "stage" ? "New stage" : "New work stream")?.trim();
    if (!label) return;
    const color = pivot === "stream" ? COLOURS[columns.length % COLOURS.length] : undefined;
    saveCols([...columns, { key: newKey(label), label, ...(color ? { color } : {}) }]);
  };
  const editColumn = (i: number, what: "rename" | "left" | "right" | "colour" | "remove") => {
    const cols = [...columns];
    if (what === "rename") {
      const label = window.prompt("Name", cols[i].label)?.trim();
      if (!label) return;
      cols[i] = { ...cols[i], label };
    } else if (what === "colour") {
      const at = COLOURS.indexOf(cols[i].color ?? "");
      cols[i] = { ...cols[i], color: COLOURS[(at + 1) % COLOURS.length] };
    } else if (what === "remove") {
      if (!window.confirm(`Remove the "${cols[i].label}" column? It has to be empty.`)) return;
      cols.splice(i, 1);
    } else {
      const j = what === "left" ? i - 1 : i + 1;
      if (j < 0 || j >= cols.length) return;
      [cols[i], cols[j]] = [cols[j], cols[i]];
    }
    saveCols(cols);
  };

  return (
    <main className="flex h-[calc(100dvh-49px)] flex-col gap-4 px-3 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="basis-full sm:basis-0 sm:flex-1">
          <h1 className="text-lg font-black uppercase tracking-wide">TO DO</h1>
          <div className="text-[10px] text-gray-400 dark:text-white/40">
            {live.filter((c) => c.stage !== "done").length} open · {live.length} cards
            {filtered && ` (filtered from ${allLive.length})`} · everything outstanding, one board · drag a card to move it
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={sectionLabel}>Pivot</span>
          <button className={pill(pivot === "stage")} onClick={() => choosePivot("stage")}>
            By progress
          </button>
          <button className={pill(pivot === "stream")} onClick={() => choosePivot("stream")}>
            By work stream
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${sectionLabel} mr-1`}>Category</span>
        {board.streams.map((s) => {
          const on = streamsOn.includes(s.key);
          return (
            <button
              key={s.key}
              onClick={() => setFilter(on ? streamsOn.filter((k) => k !== s.key) : [...streamsOn, s.key], who)}
              className={`flex items-center gap-1.5 ${pill(on)}`}
            >
              <span className="h-2 w-2 rounded-sm" style={{ background: s.color ?? "#344563" }} />
              {s.label}
            </button>
          );
        })}
        <span className={`${sectionLabel} ml-4 mr-1`}>Added by</span>
        {(["all", "James", "Claude"] as Who[]).map((w) => (
          <button key={w} onClick={() => setFilter(streamsOn, w)} className={pill(who === w)}>
            {w === "all" ? "Anyone" : w}
          </button>
        ))}
        {filtered && (
          <button onClick={() => setFilter([], "all")} className="ml-2 text-[10px] font-bold text-gray-400 underline hover:text-gray-900 dark:hover:text-white">
            Clear filters
          </button>
        )}
      </div>
      {error && <div className="text-[11px] text-red-500">{error}</div>}

      {/* phone: one column per swipe (snaps), the next one peeking in */}
      <div className="flex min-h-0 flex-1 snap-x snap-mandatory items-start gap-3 overflow-x-auto pb-3 md:snap-none">
        {columns.map((col, ci) => {
          const cards = inColumn(col.key);
          return (
            <section
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(col.key, null)}
              className="flex max-h-full w-[85vw] shrink-0 snap-start flex-col rounded-xl bg-gray-200/70 dark:bg-white/5 sm:w-72"
            >
              <div className="group flex items-center gap-2 px-3 pb-1 pt-3">
                {col.color && (
                  <button
                    title="Change colour"
                    onClick={() => editColumn(ci, "colour")}
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ background: col.color }}
                  />
                )}
                <button
                  onDoubleClick={() => editColumn(ci, "rename")}
                  title="Double-click to rename"
                  className="flex-1 truncate text-left text-[11px] font-black uppercase tracking-wide"
                >
                  {col.label}
                </button>
                <span className="text-[10px] text-gray-400">{cards.length}</span>
                {pivot === "stage" && col.key === "done" && cards.length > 0 && (
                  <button
                    onClick={() => clearDone(cards.length)}
                    title="Archive every card in Done"
                    className="rounded px-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-400 hover:bg-gray-300/60 hover:text-gray-900 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    Clear
                  </button>
                )}
                <span className="hidden gap-1 text-[10px] text-gray-400 group-hover:flex">
                  <button title="Move left" onClick={() => editColumn(ci, "left")} className="hover:text-gray-900 dark:hover:text-white">
                    ←
                  </button>
                  <button title="Move right" onClick={() => editColumn(ci, "right")} className="hover:text-gray-900 dark:hover:text-white">
                    →
                  </button>
                  <button title="Rename" onClick={() => editColumn(ci, "rename")} className="hover:text-gray-900 dark:hover:text-white">
                    ✎
                  </button>
                  {!cards.length && (
                    <button title="Remove column" onClick={() => editColumn(ci, "remove")} className="hover:text-red-500">
                      ✕
                    </button>
                  )}
                </span>
              </div>

              <div className="flex min-h-[8px] flex-col gap-2 overflow-y-auto px-2 pb-1 pt-1">
                {cards.map((c) => (
                  <CardTile
                    key={c.id}
                    card={c}
                    pivot={pivot}
                    stream={streamOf(c.stream)}
                    stage={stageOf(c.stage)}
                    dragging={drag === c.id}
                    onOpen={() => setOpenId(c.id)}
                    onDragStart={() => setDrag(c.id)}
                    onDropBefore={() => drop(col.key, c.id)}
                    onToggleDone={() => toggleDone(c)}
                    onDelete={() => removeCard(c)}
                  />
                ))}
              </div>

              {adding === col.key ? (
                <AddCard
                  onAdd={async (title) => {
                    const last = cards[cards.length - 1]?.order ?? 0;
                    const other = pivot === "stage" ? { stream: board.streams[0]?.key } : { stage: board.stages[0]?.key };
                    await saveCard({ title, [pivot]: col.key, ...other, order: last + 1 });
                  }}
                  onClose={() => setAdding(null)}
                />
              ) : (
                <button
                  onClick={() => setAdding(col.key)}
                  className="m-2 mt-1 rounded-lg px-2 py-1.5 text-left text-[11px] text-gray-500 hover:bg-gray-300/60 dark:text-white/40 dark:hover:bg-white/10"
                >
                  + Add a card
                </button>
              )}
            </section>
          );
        })}
        <button
          onClick={addColumn}
          className="w-60 shrink-0 rounded-xl bg-gray-200/40 px-3 py-3 text-left text-[11px] font-bold text-gray-500 hover:bg-gray-200 dark:bg-white/5 dark:text-white/40"
        >
          + Add {pivot === "stage" ? "a stage" : "a work stream"}
        </button>
      </div>

      {open && (
        <CardDrawer
          key={open.id}
          card={open}
          board={board}
          onSave={(patch) => saveCard({ id: open.id, ...patch })}
          onComment={(text) => send({ action: "comment", id: open.id, text })}
          onDelete={() => send({ action: "delete", id: open.id })}
          onClose={() => setOpenId(null)}
        />
      )}
    </main>
  );
}

function CardTile({
  card: c,
  pivot,
  stream,
  stage,
  dragging,
  onOpen,
  onDragStart,
  onDropBefore,
  onToggleDone,
  onDelete,
}: {
  card: Card;
  pivot: Pivot;
  stream?: Column;
  stage?: Column;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDropBefore: () => void;
  onToggleDone: () => void;
  onDelete: () => void;
}) {
  const done = c.checklist.filter((x) => x.done).length;
  const overdue = c.due && c.due < today() && c.stage !== "done";
  const isDone = c.stage === "done";
  const [completing, setCompleting] = useState(false); // green tick, then the card fades out before it moves
  const tick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDone) return onToggleDone();
    setCompleting(true);
    setTimeout(onToggleDone, 650);
  };
  const ticked = isDone || completing;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.stopPropagation();
        onDropBefore();
      }}
      onClick={onOpen}
      className={`group relative cursor-pointer rounded-lg bg-white p-2.5 shadow-sm transition-opacity duration-500 hover:ring-2 hover:ring-[#1a3c6e]/40 dark:bg-[#0d0d0d] ${
        dragging || completing ? "opacity-30" : isDone ? "opacity-60 hover:opacity-100" : ""
      }`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete card"
        className="absolute right-1.5 top-1.5 hidden rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 group-hover:block dark:hover:bg-red-500/20"
      >
        <IoMdTrash size={13} />
      </button>
      <div className="mb-1.5 flex flex-wrap gap-1">
        {stream && (
          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: stream.color ?? "#344563" }}>
            {stream.label}
          </span>
        )}
        {c.addedBy === "Claude" && (
          <span className="rounded bg-[#1a3c6e]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#1a3c6e] dark:bg-white/10 dark:text-white/60">
            Claude
          </span>
        )}
        {pivot === "stream" && stage && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-500 dark:bg-white/10 dark:text-white/50">
            {stage.label}
          </span>
        )}
      </div>
      <div className="flex items-start gap-1.5 pr-5">
        <button
          onClick={tick}
          title={isDone ? "Not done — put it back" : "Mark done"}
          className={`mt-[1px] h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-black ${
            ticked
              ? "flex border-green-600 bg-green-600 text-white"
              : "hidden border-gray-400 text-transparent hover:border-green-600 hover:text-green-600 group-hover:flex"
          }`}
        >
          ✓
        </button>
        <div className={`text-[12px] font-bold leading-snug ${isDone ? "text-gray-500 dark:text-white/50" : ""}`}>{c.title}</div>
      </div>
      {c.blocker && <div className="mt-1 text-[10px] font-bold text-red-500">⛔ {c.blocker}</div>}
      {(c.desc || c.checklist.length > 0 || c.due || c.comments.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[10px] text-gray-400 dark:text-white/40">
          {c.due && (
            <span className={`rounded px-1 ${overdue ? "bg-red-500 text-white" : ""}`}>🕑 {shortDate(c.due)}</span>
          )}
          {c.desc && <span title="Has a description">≡</span>}
          {c.checklist.length > 0 && (
            <span className={`rounded px-1 ${done === c.checklist.length ? "bg-green-600 text-white" : ""}`}>
              ☑ {done}/{c.checklist.length}
            </span>
          )}
          {c.comments.length > 0 && <span>💬 {c.comments.length}</span>}
        </div>
      )}
    </div>
  );
}

function AddCard({ onAdd, onClose }: { onAdd: (title: string) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const add = async () => {
    if (!title.trim()) return onClose();
    await onAdd(title.trim());
    setTitle("");
    ref.current?.focus();
  };
  return (
    <div className="m-2 mt-1 flex flex-col gap-1.5">
      <textarea
        ref={ref}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            add();
          }
          if (e.key === "Escape") onClose();
        }}
        rows={2}
        placeholder="What needs doing?"
        className="rounded-lg bg-white p-2 text-[12px] shadow-sm outline-none dark:bg-[#0d0d0d]"
      />
      <div className="flex items-center gap-2">
        <button onClick={add} className={`${primaryButton} !px-3 !py-1.5 !text-[10px]`}>
          Add card
        </button>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-900 dark:hover:text-white">
          <IoMdClose />
        </button>
      </div>
    </div>
  );
}

const field = "w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-gray-400 dark:border-white/10 dark:bg-white/5";

/** One card up close: everything about it, saved as you go. */
function CardDrawer({
  card,
  board,
  onSave,
  onComment,
  onDelete,
  onClose,
}: {
  card: Card;
  board: Board;
  onSave: (patch: Partial<Card>) => Promise<Board | null>;
  onComment: (text: string) => Promise<Board | null>;
  onDelete: () => Promise<Board | null>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [blocker, setBlocker] = useState(card.blocker);
  const [item, setItem] = useState("");
  const [comment, setComment] = useState("");
  const done = card.checklist.filter((x) => x.done).length;
  const setList = (checklist: CheckItem[]) => onSave({ checklist });

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col gap-5 overflow-y-auto bg-white p-6 dark:bg-[#0d0d0d]"
      >
        <div className="flex items-start gap-3">
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() !== card.title && onSave({ title })}
            rows={2}
            className="flex-1 resize-none bg-transparent text-base font-black outline-none"
          />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 dark:hover:text-white">
            <IoMdClose size={20} />
          </button>
        </div>

        <a
          href={claudeLink(card, board)}
          title={`Opens a new Claude Code session${
            board.streams.find((s) => s.key === card.stream)?.folder ? ` in ${board.streams.find((s) => s.key === card.stream)?.folder}` : ""
          } with this card as the first message`}
          className={`${primaryButton} self-start`}
        >
          ▶ Work on this in Claude
        </a>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={sectionLabel}>Stage</span>
            <select value={card.stage} onChange={(e) => onSave({ stage: e.target.value })} className={field}>
              {board.stages.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={sectionLabel}>Work stream</span>
            <select value={card.stream} onChange={(e) => onSave({ stream: e.target.value })} className={field}>
              {board.streams.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={sectionLabel}>Due</span>
            <input type="date" value={card.due} onChange={(e) => onSave({ due: e.target.value })} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={sectionLabel}>Blocked by</span>
            <input
              value={blocker}
              onChange={(e) => setBlocker(e.target.value)}
              onBlur={() => blocker !== card.blocker && onSave({ blocker: blocker.trim() })}
              placeholder="Nothing"
              className={field}
            />
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <span className={sectionLabel}>Notes</span>
          <NotesBox value={card.desc} onSave={(desc) => onSave({ desc })} />
        </div>

        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className={sectionLabel}>Checklist</span>
            {card.checklist.length > 0 && (
              <span className="text-[10px] text-gray-400">
                {done}/{card.checklist.length}
              </span>
            )}
          </div>
          {card.checklist.length > 0 && (
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
              <div
                className={`h-full ${done === card.checklist.length ? "bg-green-600" : "bg-[#1a3c6e]"}`}
                style={{ width: `${(100 * done) / card.checklist.length}%` }}
              />
            </div>
          )}
          {card.checklist.map((x) => (
            <div key={x.id} className="group flex items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={x.done}
                onChange={() => setList(card.checklist.map((y) => (y.id === x.id ? { ...y, done: !y.done } : y)))}
              />
              <span className={`flex-1 ${x.done ? "text-gray-400 line-through" : ""}`}>
                {x.text}
                {x.by === "Claude" && <span className="ml-1.5 text-[9px] font-bold text-[#1a3c6e]/60 dark:text-white/40">Claude</span>}
              </span>
              <button
                onClick={() => setList(card.checklist.filter((y) => y.id !== x.id))}
                className="hidden text-gray-400 hover:text-red-500 group-hover:block"
              >
                <IoMdClose />
              </button>
            </div>
          ))}
          <input
            value={item}
            onChange={(e) => setItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && item.trim()) {
                setList([...card.checklist, { id: rid(), text: item.trim(), done: false }]);
                setItem("");
              }
            }}
            placeholder="+ Add an item (Enter)"
            className={field}
          />
        </section>

        <section className="flex flex-col gap-2">
          <span className={sectionLabel}>Comments</span>
          {card.comments.map((m, i) => (
            <div key={i} className="rounded-lg bg-gray-50 p-2.5 text-[12px] dark:bg-white/5">
              <div className="mb-1 text-[9px] font-bold text-gray-400">
                {m.by} · {new Date(m.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
              <div className="whitespace-pre-wrap">{m.text}</div>
            </div>
          ))}
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Write a comment…" className={field} />
          <button
            disabled={!comment.trim()}
            onClick={async () => {
              if (await onComment(comment)) setComment("");
            }}
            className={`${primaryButton} self-start`}
          >
            Comment
          </button>
        </section>

        <div className="mt-auto flex items-center gap-3 border-t border-gray-100 pt-4 text-[10px] text-gray-400 dark:border-white/10">
          <span className="flex-1">
            Added by {card.addedBy} {new Date(card.created).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · updated{" "}
            {new Date(card.updated).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
          <button
            onClick={async () => {
              if (window.confirm("Archive this card? It leaves the board but is kept in board.json.")) {
                await onSave({ archived: true });
                onClose();
              }
            }}
            className="rounded-lg border border-gray-200 px-3 py-1.5 font-bold uppercase tracking-widest hover:border-red-400 hover:text-red-500 dark:border-white/10"
          >
            Archive
          </button>
          <button
            onClick={async () => {
              if (window.confirm(`Delete "${card.title}" for good?`)) {
                if (await onDelete()) onClose();
              }
            }}
            className="rounded-lg border border-red-200 px-3 py-1.5 font-bold uppercase tracking-widest text-red-500 hover:bg-red-500 hover:text-white dark:border-red-500/40"
          >
            Delete
          </button>
        </div>
      </aside>
    </div>
  );
}

/** **bold**, *italic* / _italic_ and `code` inside one line of notes. */
function inlineMd(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`)/g).map((part, i) => {
    if (/^\*\*.+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^(\*|_).+(\*|_)$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^`.+`$/.test(part)) return <code key={i} className="rounded bg-gray-100 px-1 text-[11px] dark:bg-white/10">{part.slice(1, -1)}</code>;
    return part;
  });
}

/** Notes as written (Markdown-ish): # headings, - / 1. lists nested by indent (2 spaces a level), indented text. */
function NotesView({ text }: { text: string }) {
  let n = 0; // running number for 1. lists at the same level
  return (
    <div className="flex flex-col gap-1 text-[12px] leading-relaxed">
      {text.split("\n").map((raw, i) => {
        const indent = Math.floor((raw.match(/^ */)?.[0].length ?? 0) / 2);
        const line = raw.trim();
        if (!line) {
          n = 0;
          return <div key={i} className="h-1.5" />;
        }
        const pad = { paddingLeft: `${indent * 18}px` };
        const h = line.match(/^(#{1,3})\s+(.*)$/);
        if (h)
          return (
            <div key={i} style={pad} className={`${h[1].length === 1 ? "text-sm" : "text-[12px]"} mt-1 font-black`}>
              {inlineMd(h[2])}
            </div>
          );
        const bullet = line.match(/^[-*•]\s+(.*)$/);
        const num = line.match(/^\d+[.)]\s+(.*)$/);
        if (bullet || num) {
          if (num) n += 1;
          return (
            <div key={i} style={pad} className="flex gap-2">
              <span className="w-3 shrink-0 text-right text-gray-400">{num ? `${n}.` : indent % 2 ? "◦" : "•"}</span>
              <span className="flex-1">{inlineMd((bullet ?? num)![1])}</span>
            </div>
          );
        }
        n = 0;
        return (
          <p key={i} style={pad}>
            {inlineMd(line)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * The notes box (James, 17 Oct): bold, italic, bullets, numbers, headings and indenting, from the buttons or
 * ⌘B / ⌘I / Tab / ⇧Tab. Stored as plain Markdown so Claude reads it too. Shows formatted; click to edit.
 */
function NotesBox({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  /** Change the selected text (or the whole lines it touches) and keep it selected. */
  const apply = (how: "bold" | "italic" | "bullet" | "number" | "heading" | "indent" | "outdent") => {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b } = ta;
    let next = text;
    let selA = a;
    let selB = b;
    if (how === "bold" || how === "italic") {
      const mark = how === "bold" ? "**" : "*";
      next = text.slice(0, a) + mark + text.slice(a, b) + mark + text.slice(b);
      selA = a + mark.length;
      selB = b + mark.length;
    } else {
      const start = text.lastIndexOf("\n", a - 1) + 1;
      const endAt = text.indexOf("\n", b);
      const end = endAt === -1 ? text.length : endAt;
      const lines = text.slice(start, end).split("\n");
      const changed = lines.map((l) => {
        const lead = l.match(/^ */)![0];
        const body = l.slice(lead.length);
        if (how === "indent") return "  " + l;
        if (how === "outdent") return l.replace(/^ {1,2}/, "");
        if (how === "heading") return lead + (body.startsWith("## ") ? body.slice(3) : "## " + body.replace(/^#+\s*/, ""));
        if (how === "bullet") return lead + (/^[-*•]\s/.test(body) ? body.replace(/^[-*•]\s+/, "") : "- " + body.replace(/^\d+[.)]\s+/, ""));
        return lead + (/^\d+[.)]\s/.test(body) ? body.replace(/^\d+[.)]\s+/, "") : "1. " + body.replace(/^[-*•]\s+/, ""));
      });
      const joined = changed.join("\n");
      next = text.slice(0, start) + joined + text.slice(end);
      selA = start;
      selB = start + joined.length;
    }
    setText(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(selA, selB);
    });
  };
  const done = () => {
    setEditing(false);
    if (text !== value) onSave(text);
  };

  const tools: [Parameters<typeof apply>[0], string, string][] = [
    ["bold", "B", "Bold (⌘B)"],
    ["italic", "I", "Italic (⌘I)"],
    ["heading", "H", "Heading"],
    ["bullet", "•", "Bullet list"],
    ["number", "1.", "Numbered list"],
    ["outdent", "⇤", "Indent less (⇧Tab)"],
    ["indent", "⇥", "Indent more (Tab)"],
  ];

  if (!editing)
    return (
      <div
        onClick={() => setEditing(true)}
        className="min-h-[60px] cursor-text rounded-lg border border-gray-200 px-3 py-2 hover:border-gray-400 dark:border-white/10 dark:hover:border-white/30"
      >
        {value.trim() ? <NotesView text={value} /> : <span className="text-[12px] text-gray-400">Add notes…</span>}
      </div>
    );
  return (
    <div className="flex flex-col rounded-lg border border-gray-400 dark:border-white/30">
      <div className="flex items-center gap-0.5 border-b border-gray-100 px-1.5 py-1 dark:border-white/10">
        {tools.map(([how, label, title]) => (
          <button
            key={how}
            title={title}
            onMouseDown={(e) => e.preventDefault()} // keep the selection in the box
            onClick={() => apply(how)}
            className={`h-6 min-w-6 rounded px-1.5 text-[11px] hover:bg-gray-100 dark:hover:bg-white/10 ${
              how === "bold" ? "font-black" : how === "italic" ? "italic" : "font-bold"
            }`}
          >
            {label}
          </button>
        ))}
        <button onClick={done} className="ml-auto rounded px-2 text-[10px] font-bold uppercase tracking-widest text-[#1a3c6e] hover:bg-gray-100 dark:text-white dark:hover:bg-white/10">
          Done
        </button>
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "i")) {
            e.preventDefault();
            apply(e.key === "b" ? "bold" : "italic");
          } else if (e.key === "Tab") {
            e.preventDefault();
            apply(e.shiftKey ? "outdent" : "indent");
          } else if (e.key === "Enter" && !e.shiftKey) {
            // carry a list on to the next line (an empty item ends the list)
            const ta = e.currentTarget;
            const start = text.lastIndexOf("\n", ta.selectionStart - 1) + 1;
            const line = text.slice(start, ta.selectionStart);
            const m = line.match(/^( *)([-*•]|\d+[.)])\s+(.*)$/);
            if (!m) return;
            e.preventDefault();
            if (!m[3].trim()) {
              const next = text.slice(0, start) + text.slice(ta.selectionStart);
              setText(next);
              requestAnimationFrame(() => ta.setSelectionRange(start, start));
              return;
            }
            const marker = /\d/.test(m[2]) ? `${parseInt(m[2]) + 1}.` : m[2];
            const insert = `\n${m[1]}${marker} `;
            const at = ta.selectionStart;
            setText(text.slice(0, at) + insert + text.slice(ta.selectionEnd));
            requestAnimationFrame(() => ta.setSelectionRange(at + insert.length, at + insert.length));
          }
        }}
        rows={Math.max(6, text.split("\n").length + 1)}
        placeholder="Add notes… (**bold**, *italic*, - bullets, Tab to indent)"
        className="resize-y bg-transparent px-3 py-2 font-mono text-[12px] leading-relaxed outline-none"
      />
    </div>
  );
}
