"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CheckInspoButton from "./CheckInspoButton";
import PostDrawer from "./PostDrawer";
import TagListEditor from "./TagListEditor";
import { imageUrl, isVideo, pill, sectionLabel, type LibraryItem, type TagList } from "./types";

type Filters = {
  source: string[];
  postTypes: string[];
  phases: string[];
  events: string[];
  style: string[];
  review: "all" | "suggested" | "confirmed";
  text: string;
};

const EMPTY: Filters = { source: [], postTypes: [], phases: [], events: [], style: [], review: "all", text: "" };
const SOURCE_LABEL: Record<string, string> = { past: "Past posts", inspo: "Inspiration" };
const PAGE = 60;

/**
 * Post Library: every past post and Slack inspiration image, filtered by any mix of tags.
 * Within post type / phase / event / source a post matches ANY ticked value; style tags must ALL match
 * (so "podium + grid" finds posts that have both).
 */
export default function PostLibrary() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [tags, setTags] = useState<TagList | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"posts" | "tags">("posts");
  const [f, setF] = useState<Filters>(EMPTY);
  const [open, setOpen] = useState<LibraryItem | null>(null);
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/library", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "Could not load the library");
    setItems(data.items);
    setTags(data.tags);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setShown(PAGE), [f]);

  const matches = useCallback(
    (i: LibraryItem, skip?: keyof Filters) => {
      const any = (have: string[], want: string[]) => !want.length || want.some((w) => have.includes(w));
      const text = f.text.trim().toLowerCase();
      return (
        (skip === "source" || any([i.source], f.source)) &&
        (skip === "postTypes" || any(i.postTypes, f.postTypes)) &&
        (skip === "phases" || any(i.phases, f.phases)) &&
        (skip === "events" || any([i.event], f.events)) &&
        (skip === "style" || f.style.every((s) => i.style.includes(s))) &&
        (f.review === "all" || (f.review === "confirmed") === (i.tagsFrom === "James")) &&
        (!text || `${i.title} ${i.caption}`.toLowerCase().includes(text))
      );
    },
    [f],
  );

  const results = useMemo(
    () => items.filter((i) => matches(i)).sort((a, b) => b.date.localeCompare(a.date)),
    [items, matches],
  );

  // Each filter group lists its values with how many posts would match if ticked (given the other filters).
  const groups = useMemo(() => {
    const count = (key: keyof Filters, values: (i: LibraryItem) => string[]) => {
      const pool = key === "style" ? results : items.filter((i) => matches(i, key));
      const counts = new Map<string, number>();
      for (const i of pool) for (const v of values(i)) counts.set(v, (counts.get(v) ?? 0) + 1);
      return counts;
    };
    const eventsInOrder = Array.from(new Set(items.map((i) => i.event)));
    return [
      { key: "source" as const, label: "Source", counts: count("source", (i) => [i.source]), order: ["past", "inspo"] },
      { key: "postTypes" as const, label: "Post type", counts: count("postTypes", (i) => i.postTypes), order: null },
      { key: "phases" as const, label: "Phase", counts: count("phases", (i) => i.phases), order: null },
      { key: "style" as const, label: "Style (all must match)", counts: count("style", (i) => i.style), order: null },
      { key: "events" as const, label: "Event", counts: count("events", (i) => [i.event]), order: eventsInOrder },
    ];
  }, [items, results, matches]);

  const toggle = (key: "source" | "postTypes" | "phases" | "events" | "style", v: string) =>
    setF((p) => ({ ...p, [key]: p[key].includes(v) ? p[key].filter((x) => x !== v) : [...p[key], v] }));

  const active = f.source.length + f.postTypes.length + f.phases.length + f.events.length + f.style.length;
  const suggested = items.filter((i) => i.tagsFrom !== "James").length;

  if (error) return <div className="p-8 text-xs text-red-400">{error}</div>;
  if (!tags) return <div className="p-8 text-xs text-gray-400">Loading the library from the Drive kit…</div>;

  return (
    <main>
      <div className="flex flex-wrap items-start gap-4 border-b border-gray-200 dark:border-white/5 bg-white dark:bg-[#0d0d0d] px-5 py-4">
        <div>
          <h1 className="text-lg font-black uppercase tracking-wide">Post Library</h1>
          <div className="text-[10px] text-gray-400 dark:text-white/40">
            {items.filter((i) => i.source === "past").length} past posts ·{" "}
            {items.filter((i) => i.source === "inspo").length} inspiration · {suggested} with tags still to check ·
            tag list {tags.signed_off ? "signed off" : "not signed off"}
          </div>
        </div>
        <div className="flex gap-2 self-center">
          <button className={pill(view === "posts")} onClick={() => setView("posts")}>
            Posts
          </button>
          <button className={pill(view === "tags")} onClick={() => setView("tags")}>
            Tag list
          </button>
        </div>
        <div className="ml-auto">
          <CheckInspoButton onDone={load} />
        </div>
      </div>

      {view === "tags" ? (
        <TagListEditor tags={tags} items={items} onChanged={load} />
      ) : (
        <div className="flex flex-col md:flex-row">
          <aside
            className="flex shrink-0 flex-col gap-5 border-r border-gray-200 dark:border-white/5 bg-white dark:bg-[#0d0d0d] p-5 md:sticky md:top-[49px] md:h-[calc(100vh-49px)] md:w-80 md:overflow-y-auto"
            style={{ scrollbarGutter: "stable" }}
          >
            <input
              className="rounded-full border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-4 py-2 text-xs outline-none placeholder-gray-400 focus:border-gray-400 dark:placeholder-white/30 dark:focus:border-white/30"
              placeholder="Search headlines and captions"
              value={f.text}
              onChange={(e) => setF({ ...f, text: e.target.value })}
            />
            <div>
              <div className={`${sectionLabel} mb-2`}>Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "suggested", "confirmed"] as const).map((r) => (
                  <button key={r} className={pill(f.review === r)} onClick={() => setF({ ...f, review: r })}>
                    {r === "all" ? "All" : r === "suggested" ? "Still to check" : "Confirmed"}
                  </button>
                ))}
              </div>
            </div>
            {groups.map((g) => {
              const values = g.order ?? Array.from(g.counts.keys()).sort((a, b) => (g.counts.get(b) ?? 0) - (g.counts.get(a) ?? 0));
              return (
                <div key={g.key}>
                  <div className={`${sectionLabel} mb-2`}>{g.label}</div>
                  <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                    {values.map((v) => {
                      const on = f[g.key].includes(v);
                      const n = g.counts.get(v) ?? 0;
                      if (!n && !on) return null;
                      return (
                        <button key={v} className={pill(on)} onClick={() => toggle(g.key, v)}>
                          {SOURCE_LABEL[v] ?? v} <span className="opacity-50">{n}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {active > 0 && (
              <button className="text-left text-[10px] font-bold underline" onClick={() => setF(EMPTY)}>
                Clear all filters
              </button>
            )}
          </aside>

          <section className="flex-1 p-5">
            <div className={`${sectionLabel} mb-3`}>{results.length} posts</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {results.slice(0, shown).map((i) => (
                <button
                  key={i.id}
                  onClick={() => setOpen(i)}
                  className="group overflow-hidden rounded-lg bg-white dark:bg-[#0d0d0d] text-left"
                >
                  <div className="relative aspect-[4/5] bg-[#1a1a1a]">
                    {isVideo(i.files[0]) ? (
                      <video src={imageUrl(i.source, i.files[0])} muted preload="metadata" className="h-full w-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl(i.source, i.files[0], true)}
                        alt={i.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                      />
                    )}
                    {i.files.length > 1 && (
                      <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
                        {i.files.length} slides
                      </span>
                    )}
                    {i.source === "inspo" && (
                      <span className="absolute left-2 top-2 rounded bg-[#1a3c6e] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                        Inspo
                      </span>
                    )}
                  </div>
                  <div className="p-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        title={i.tagsFrom === "James" ? "Confirmed" : "Suggested by Claude"}
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${i.tagsFrom === "James" ? "bg-green-500" : "bg-yellow-400"}`}
                      />
                      <span className="truncate text-[10px] font-bold">{i.postTypes[0] ?? "No post type"}</span>
                    </div>
                    <div className="truncate text-[9px] text-gray-400 dark:text-white/40">
                      {i.date} · {i.event}
                    </div>
                    <div className="mt-1 truncate text-[9px] text-gray-500 dark:text-white/50">{i.style.join(" · ")}</div>
                  </div>
                </button>
              ))}
            </div>
            {shown < results.length && (
              <button className={`${pill(false)} mx-auto mt-6 block`} onClick={() => setShown((n) => n + PAGE)}>
                Show more ({results.length - shown} left)
              </button>
            )}
          </section>
        </div>
      )}

      {open && (
        <PostDrawer
          item={open}
          tags={tags}
          onClose={() => setOpen(null)}
          onSaved={(saved) => {
            setItems((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
            setOpen(saved);
          }}
        />
      )}
    </main>
  );
}
