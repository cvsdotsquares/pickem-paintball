"use client";

import { useEffect, useMemo, useState } from "react";
import { IoMdClose } from "react-icons/io";
import {
  imageUrl,
  pill,
  primaryButton,
  sectionLabel,
  type LibraryItem,
} from "./types";

/**
 * New event side panel: upload the event's assets, write a short brief, tick the inspiration to pull in
 * (like the iPhone photo picker). Create → Claude builds the theme + brand board on this Mac.
 */
export default function NewEventDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (event: string) => void;
}) {
  const [name, setName] = useState("");
  const [dates, setDates] = useState("");
  const [brief, setBrief] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [show, setShow] = useState<"inspo" | "past">("inspo");
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    fetch("/api/admin/library", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []));
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const shown = useMemo(
    () =>
      items
        .filter((i) => i.source === show)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [items, show],
  );
  const previews = useMemo(
    () =>
      files.map((f) =>
        f.type.startsWith("image/") ? URL.createObjectURL(f) : "",
      ),
    [files],
  );
  useEffect(
    () => () => previews.forEach((u) => u && URL.revokeObjectURL(u)),
    [previews],
  );

  const addFiles = (list: FileList | null) =>
    list && setFiles((prev) => [...prev, ...Array.from(list)]);
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const create = async () => {
    setSending(true);
    setError("");
    const form = new FormData();
    form.append("name", name);
    form.append("dates", dates);
    form.append("brief", brief);
    form.append("inspo", JSON.stringify(picked));
    files.forEach((f) => form.append("files", f));
    const res = await fetch("/api/admin/generator/event", {
      method: "POST",
      body: form,
    });
    const d = await res.json();
    setSending(false);
    if (!res.ok) return setError(d.error ?? "Could not create the event");
    onCreated(d.event);
  };

  const input =
    "w-full rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-3 py-2 text-[12px] outline-none placeholder-gray-400 focus:border-gray-400 dark:placeholder-white/30 dark:focus:border-white/30";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-xl flex-col bg-white dark:bg-[#0d0d0d]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-gray-100 dark:border-white/5 px-5 py-4">
          <h2 className="flex-1 text-sm font-black uppercase tracking-widest">
            New event
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <IoMdClose size={20} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div>
              <div className={`${sectionLabel} mb-1.5`}>Event name</div>
              <input
                className={input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 2027 Tampa Bay Open"
              />
            </div>
            <div>
              <div className={`${sectionLabel} mb-1.5`}>Dates</div>
              <input
                className={input}
                value={dates}
                onChange={(e) => setDates(e.target.value)}
                placeholder="e.g. 18–21 March"
              />
            </div>
          </div>

          <div>
            <div className={`${sectionLabel} mb-1.5`}>
              Assets — event logo, colours, photos
            </div>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center ${
                dragging
                  ? "border-gray-500 bg-gray-50 dark:bg-white/10"
                  : "border-gray-200 dark:border-white/10"
              }`}
            >
              <span className="text-[12px] font-bold">+ Add files</span>
              <span className="text-[10px] text-gray-400">
                Click or drag them here
              </span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </label>
            {files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="relative flex w-20 flex-col items-center gap-1"
                  >
                    {previews[i] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previews[i]}
                        alt=""
                        className="h-16 w-20 rounded bg-gray-100 object-contain dark:bg-white/5"
                      />
                    ) : (
                      <div className="flex h-16 w-20 items-center justify-center rounded bg-gray-100 text-[9px] text-gray-400 dark:bg-white/5">
                        file
                      </div>
                    )}
                    <span className="w-full truncate text-center text-[9px] text-gray-500">
                      {f.name}
                    </span>
                    <button
                      onClick={() =>
                        setFiles((p) => p.filter((_, j) => j !== i))
                      }
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black text-[10px] text-white"
                      aria-label={`Remove ${f.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className={`${sectionLabel} mb-1.5`}>Brief for Claude</div>
            <textarea
              className={`${input} resize-y`}
              rows={4}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="The feel you want, colours to lean on, anything to avoid, what should change from last event…"
            />
          </div>

          <div className="flex flex-col">
            <div className="mb-2 flex items-center gap-2">
              <div className={`${sectionLabel} flex-1`}>
                Highlight key inspiration{" "}
                {picked.length > 0 && (
                  <span className="text-gray-900 dark:text-white">
                    · {picked.length} highlighted
                  </span>
                )}
              </div>
              <button
                className={pill(show === "inspo")}
                onClick={() => setShow("inspo")}
              >
                Inspiration
              </button>
              <button
                className={pill(show === "past")}
                onClick={() => setShow("past")}
              >
                Past posts
              </button>
            </div>
            <p className="mb-2 text-[10px] text-gray-400 dark:text-white/40">
              Tick the ones you&apos;d like worked into some of this event&apos;s graphics. Nothing is left out: Claude still
              uses the whole library, and ticked posts get extra weight.
            </p>
            {/* the box scrolls; the grid inside keeps full-size tiles (a height limit on the grid itself squashed them) */}
            <div
              className="h-[360px] shrink-0 overflow-y-auto rounded-lg bg-gray-100 p-0.5 dark:bg-white/5"
              style={{ scrollbarGutter: "stable" }}
            >
              <div className="grid grid-cols-3 gap-0.5 sm:grid-cols-4">
                {shown.map((i) => {
                  const on = picked.includes(i.id);
                  return (
                    <button
                      key={i.id}
                      onClick={() => toggle(i.id)}
                      className="relative block aspect-[4/5] w-full overflow-hidden"
                      title={i.title}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl(i.source, i.files[0], true)}
                        alt=""
                        loading="lazy"
                        className={`h-full w-full object-cover transition ${on ? "scale-95 opacity-80" : ""}`}
                      />
                      {i.kind === "reel" && (
                        <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[8px] font-bold text-white">
                          ▶
                        </span>
                      )}
                      <span
                        className={`absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white text-[11px] font-black ${
                          on
                            ? "bg-[#0a84ff] text-white"
                            : "bg-black/20 text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                    </button>
                  );
                })}
                {shown.length === 0 && (
                  <div className="col-span-full p-6 text-center text-[11px] text-gray-400">
                    Nothing here yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-gray-100 dark:border-white/5 px-5 py-4">
          {error && (
            <span className="flex-1 text-[11px] text-red-400">{error}</span>
          )}
          {!error && (
            <span className="flex-1 text-[10px] text-gray-400">
              Claude builds the event&apos;s look and brand board on this Mac (a
              few minutes). You approve it on the next screen.
            </span>
          )}
          <button
            className={primaryButton}
            disabled={sending || !name.trim()}
            onClick={create}
          >
            {sending ? "Creating…" : "Create event"}
          </button>
        </div>
      </aside>
    </div>
  );
}
