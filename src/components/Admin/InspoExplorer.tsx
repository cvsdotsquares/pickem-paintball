"use client";

import { useEffect, useMemo, useState } from "react";
import { IoMdClose } from "react-icons/io";
import { imageUrl, pill, primaryButton, sectionLabel, type LibraryItem } from "./types";

const PAGE = 120;

/**
 * Explore side panel on a post page: the whole Post Library (every post type, past posts and inspiration),
 * so James can star a reference from anywhere, not only this post type's (James, 13 Nov 2026: the post
 * type's own list "can be a bit restrictive"). A star here is the same star as on the post page.
 */
export default function InspoExplorer({
  starred,
  onToggle,
  onClose,
}: {
  starred: string[];
  onToggle: (id: string, on: boolean) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState("");
  const [source, setSource] = useState<"all" | "inspo" | "past">("all");
  const [postType, setPostType] = useState("");
  const [style, setStyle] = useState("");
  const [text, setText] = useState("");
  const [onlyStarred, setOnlyStarred] = useState(false);
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    fetch("/api/admin/library", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) return setError(d.error ?? "Could not load the library");
        setItems(d.items ?? []);
      })
      .catch(() => setError("Could not load the library"));
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  useEffect(() => setShown(PAGE), [source, postType, style, text, onlyStarred]);

  // the tags that are actually on a post, with how many posts carry each
  const [postTypes, styles] = useMemo(() => {
    const count = (values: (i: LibraryItem) => string[]) => {
      const m = new Map<string, number>();
      for (const i of items ?? []) for (const v of values(i)) m.set(v, (m.get(v) ?? 0) + 1);
      return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    };
    return [count((i) => i.postTypes), count((i) => i.style)];
  }, [items]);

  const results = useMemo(() => {
    const q = text.trim().toLowerCase();
    return (items ?? [])
      .filter(
        (i) =>
          (source === "all" || i.source === source) &&
          (!postType || i.postTypes.includes(postType)) &&
          (!style || i.style.includes(style)) &&
          (!onlyStarred || starred.includes(i.id)) &&
          (!q || `${i.title} ${i.caption} ${i.notes} ${i.event} ${i.style.join(" ")}`.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [items, source, postType, style, text, onlyStarred, starred]);

  const input =
    "rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-3 py-2 text-[12px] outline-none placeholder-gray-400 focus:border-gray-400 dark:placeholder-white/30 dark:focus:border-white/30";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-3xl flex-col bg-white dark:bg-[#0d0d0d]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-gray-100 dark:border-white/5 px-5 py-4">
          <h2 className="flex-1 text-sm font-black uppercase tracking-widest">Explore the whole library</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <IoMdClose size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-3 border-b border-gray-100 dark:border-white/5 px-5 py-4">
          <p className="text-[11px] text-gray-500 dark:text-white/50">
            Every past post and inspiration, from any post type. Click one to star it for this graphic: Claude
            gives starred references the most weight in the brief, the layouts and the build.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button className={pill(source === "all")} onClick={() => setSource("all")}>
              Everything
            </button>
            <button className={pill(source === "inspo")} onClick={() => setSource("inspo")}>
              Inspiration
            </button>
            <button className={pill(source === "past")} onClick={() => setSource("past")}>
              Past posts
            </button>
            <button className={pill(onlyStarred)} onClick={() => setOnlyStarred((v) => !v)}>
              ★ Starred ({starred.length})
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <select className={input} value={postType} onChange={(e) => setPostType(e.target.value)}>
              <option value="">All post types</option>
              {postTypes.map(([v, n]) => (
                <option key={v} value={v}>
                  {v} ({n})
                </option>
              ))}
            </select>
            <select className={input} value={style} onChange={(e) => setStyle(e.target.value)}>
              <option value="">Any style</option>
              {styles.map(([v, n]) => (
                <option key={v} value={v}>
                  {v} ({n})
                </option>
              ))}
            </select>
            <input
              className={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search words, e.g. podium"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarGutter: "stable" }}>
          {error && <div className="text-[11px] text-red-400">{error}</div>}
          {!error && !items && <div className="text-[11px] text-gray-400">Loading the library from the Drive kit…</div>}
          {items && (
            <>
              <div className={`${sectionLabel} mb-2`}>
                {results.length} {results.length === 1 ? "post" : "posts"}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {results.slice(0, shown).map((i) => {
                  const on = starred.includes(i.id);
                  return (
                    <div key={i.id} className={`relative rounded ${on ? "ring-2 ring-amber-400" : ""}`}>
                      <button
                        onClick={() => onToggle(i.id, !on)}
                        title={`${on ? "Starred — click to unstar" : "Star for this graphic"} · ${i.date} · ${i.title}`}
                        className="relative block w-full"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl(i.source, i.files[0], true)}
                          alt=""
                          loading="lazy"
                          className="aspect-[4/5] w-full rounded object-cover"
                        />
                        <span
                          className={`absolute right-1 top-1 rounded px-1 text-[13px] leading-none ${
                            on ? "bg-amber-400 text-black" : "bg-black/60 text-white"
                          }`}
                        >
                          {on ? "★" : "☆"}
                        </span>
                        {i.source === "inspo" && (
                          <span className="absolute left-1 top-1 rounded bg-[#1a3c6e] px-1 text-[8px] font-bold uppercase text-white">
                            {i.kind === "reel" ? "▶ Inspo" : "Inspo"}
                          </span>
                        )}
                      </button>
                      <a
                        href={imageUrl(i.source, i.files[0])}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate px-0.5 pt-1 text-[9px] text-gray-400 hover:underline dark:text-white/40"
                        title="Open full size"
                      >
                        {i.postTypes[0] ?? i.event} ↗
                      </a>
                    </div>
                  );
                })}
              </div>
              {results.length === 0 && (
                <div className="p-6 text-center text-[11px] text-gray-400">Nothing matches these filters</div>
              )}
              {results.length > shown && (
                <button className={`${pill(false)} mx-auto mt-4 block`} onClick={() => setShown((n) => n + PAGE)}>
                  Show more ({results.length - shown} left)
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-gray-100 dark:border-white/5 px-5 py-4">
          <span className="flex-1 text-[10px] text-gray-400">
            {starred.length} starred for this graphic. Stars save as you click.
          </span>
          <button className={primaryButton} onClick={onClose}>
            Done
          </button>
        </div>
      </aside>
    </div>
  );
}
