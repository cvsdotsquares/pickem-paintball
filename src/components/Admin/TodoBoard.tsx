"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IoMdClose } from "react-icons/io";
import { pill, primaryButton, sectionLabel } from "./types";

// Client copies of src/lib/admin/todo.ts (that module reads the disk).
type Column = { key: string; label: string; color?: string };
type CheckItem = { id: string; text: string; done: boolean };
type Card = {
  id: string;
  title: string;
  desc: string;
  stage: string;
  stream: string;
  order: number;
  due: string;
  blocker: string;
  checklist: CheckItem[];
  comments: { at: string; by: string; text: string }[];
  archived: boolean;
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

  useEffect(() => {
    try {
      const p = localStorage.getItem("todo-pivot");
      if (p === "stage" || p === "stream") setPivot(p);
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

  if (!board) return <div className="p-8 text-xs text-gray-400">{error || "Loading…"}</div>;

  const group: Group = pivot === "stage" ? "stages" : "streams";
  const columns = board[group];
  const live = board.cards.filter((c) => !c.archived);
  const inColumn = (key: string) => live.filter((c) => c[pivot] === key).sort((a, b) => a.order - b.order);
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
    <main className="flex h-[calc(100vh-45px)] flex-col gap-4 px-5 py-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1">
          <h1 className="text-lg font-black uppercase tracking-wide">TO DO</h1>
          <div className="text-[10px] text-gray-400 dark:text-white/40">
            {live.filter((c) => c.stage !== "done").length} open · {live.length} cards · everything outstanding, one board ·
            drag a card to move it
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
      {error && <div className="text-[11px] text-red-500">{error}</div>}

      <div className="flex flex-1 items-start gap-3 overflow-x-auto pb-3">
        {columns.map((col, ci) => {
          const cards = inColumn(col.key);
          return (
            <section
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(col.key, null)}
              className="flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-gray-200/70 dark:bg-white/5"
            >
              <div className="group flex items-center gap-2 px-3 pb-2 pt-3">
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

              <div className="flex min-h-[8px] flex-col gap-2 overflow-y-auto px-2 pb-1">
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
}: {
  card: Card;
  pivot: Pivot;
  stream?: Column;
  stage?: Column;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDropBefore: () => void;
}) {
  const done = c.checklist.filter((x) => x.done).length;
  const overdue = c.due && c.due < today() && c.stage !== "done";
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
      className={`cursor-pointer rounded-lg bg-white p-2.5 shadow-sm hover:ring-2 hover:ring-[#1a3c6e]/40 dark:bg-[#0d0d0d] ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="mb-1.5 flex flex-wrap gap-1">
        {stream && (
          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: stream.color ?? "#344563" }}>
            {stream.label}
          </span>
        )}
        {pivot === "stream" && stage && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-500 dark:bg-white/10 dark:text-white/50">
            {stage.label}
          </span>
        )}
      </div>
      <div className="text-[12px] font-bold leading-snug">{c.title}</div>
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
  onClose,
}: {
  card: Card;
  board: Board;
  onSave: (patch: Partial<Card>) => Promise<Board | null>;
  onComment: (text: string) => Promise<Board | null>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [desc, setDesc] = useState(card.desc);
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

        <label className="flex flex-col gap-1">
          <span className={sectionLabel}>Description</span>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => desc !== card.desc && onSave({ desc })}
            rows={5}
            placeholder="More detail…"
            className={field}
          />
        </label>

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
              <span className={`flex-1 ${x.done ? "text-gray-400 line-through" : ""}`}>{x.text}</span>
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
            Added {new Date(card.created).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · updated{" "}
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
        </div>
      </aside>
    </div>
  );
}
