"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import GraphicStrip from "./GraphicStrip";
import PostDrawer from "./PostDrawer";
import { type GraphicRow } from "./generatorTypes";
import { imageUrl, primaryButton, sectionLabel, type LibraryItem, type TagList } from "./types";

type Show = "all" | "inspo" | "past";

type Data = {
  events: { id: string; label: string }[];
  event: string;
  board: { approved: boolean };
  types: GraphicRow[];
};

/**
 * Post Generator, one post type: all its graphics side by side, + New graphic, then the inspiration and past
 * posts tagged with this post type, to explore before designing (James, 17 Oct). Click a graphic to work on it.
 */
export default function PostTypeHub({ event, type }: { event: string; type: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [library, setLibrary] = useState<{ items: LibraryItem[]; tags: TagList } | null>(null);
  const [show, setShow] = useState<Show>("all");
  const [open, setOpen] = useState<LibraryItem | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/generator?event=${event}`, { cache: "no-store" });
    const d = await res.json();
    if (!res.ok) return setError(d.error ?? "Could not load");
    setData(d);
  }, [event]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    fetch("/api/admin/library", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d.items && setLibrary(d));
  }, []);

  const graphics = data?.types.filter((t) => t.base === type) ?? [];
  const anyRunning = graphics.some((g) => g.running);
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [anyRunning, load]);

  const post = async (body: Record<string, string>) => {
    setMessage("");
    const res = await fetch("/api/admin/generator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, ...body }),
    });
    const d = await res.json();
    if (!res.ok) setMessage(d.error ?? "Something went wrong");
    return res.ok ? d : null;
  };
  const addGraphic = async () => {
    const name = window.prompt(`New graphic under "${graphics[0]?.label}". What is it? (e.g. Team lock deadline)`);
    if (!name?.trim()) return;
    const d = await post({ type, action: "add-graphic", name });
    if (d) window.location.href = `/admin/generator/${event}/${type}/${d.key}`;
  };
  const stop = async (g: GraphicRow) => {
    if (!window.confirm(`Stop Claude on "${g.display}"? What it has done so far is kept.`)) return;
    await post({ type: g.key, action: "stop" });
    load();
  };

  if (error) return <div className="p-8 text-xs text-red-400">{error}</div>;
  if (!data) return <div className="p-8 text-xs text-gray-400">Loading…</div>;
  if (!graphics.length) return <div className="p-8 text-xs text-red-400">Unknown post type</div>;
  const t = graphics[0];
  const done = graphics.filter((g) => g.status.stage === "signed_off").length;
  // same order as the graphic page: inspiration first, then past posts, newest first
  const related = (library?.items ?? [])
    .filter((i) => i.postTypes.some((p) => t.tags.includes(p)))
    .sort((a, b) => (a.source === b.source ? b.date.localeCompare(a.date) : a.source === "inspo" ? -1 : 1));
  const shown = related.filter((i) => show === "all" || (show === "inspo") === (i.source === "inspo"));
  const count = (s: Show) => related.filter((i) => s === "all" || (s === "inspo") === (i.source === "inspo")).length;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <Link
            href="/admin/social?tab=generator"
            className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:underline"
          >
            ← {data.events.find((e) => e.id === event)?.label ?? event}
          </Link>
          <h1 className="mt-1 text-lg font-black uppercase tracking-wide">{t.label}</h1>
          <div className="text-[10px] text-gray-400 dark:text-white/40">
            {t.phase} · {t.priority === "must" ? "Must" : "Nice to have"} ·{" "}
            {graphics.length === 1 ? "1 graphic" : `${graphics.length} graphics`}
            {done > 0 && `, ${done} templated`} · each one is its own template
          </div>
        </div>
        <button className={primaryButton} disabled={!data.board.approved} onClick={addGraphic}>
          + New graphic
        </button>
      </div>
      {message && <div className="text-[11px] text-red-500">{message}</div>}
      <section className="rounded-xl bg-white p-5 dark:bg-[#0d0d0d]">
        <GraphicStrip event={event} graphics={graphics} big onStop={stop} />
        <p className="mt-3 text-[10px] text-gray-400 dark:text-white/40">
          Click a graphic to work on it. Scroll across when there are more than fit.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className={`${sectionLabel} flex-1`}>
            Inspiration + past posts —{" "}
            <Link href="/admin/social?tab=library" className="underline">
              open the Post Library
            </Link>
          </div>
          <div className="flex gap-1">
            {(
              [
                ["all", "All"],
                ["inspo", "Inspo"],
                ["past", "Past posts"],
              ] as [Show, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setShow(k)}
                className={`rounded-full px-3 py-1 text-[10px] font-bold ${
                  show === k ? "bg-black text-white dark:bg-white dark:text-black" : "bg-white text-gray-500 dark:bg-white/10 dark:text-white/60"
                }`}
              >
                {l} {library ? count(k) : ""}
              </button>
            ))}
          </div>
        </div>
        {!library ? (
          <div className="text-[11px] text-gray-400">Loading…</div>
        ) : !shown.length ? (
          <div className="text-[11px] text-gray-400">Nothing tagged with this post type yet.</div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {shown.map((i) => (
              <button key={i.id} onClick={() => setOpen(i)} title={`${i.date} · ${i.title}`} className="relative block hover:opacity-80">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(i.source, i.files[0], true)} alt="" className="aspect-[4/5] w-full rounded object-cover" />
                {i.source === "inspo" && (
                  <span className="absolute left-1 top-1 rounded bg-[#1a3c6e] px-1 text-[8px] font-bold uppercase text-white">
                    Inspo
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {open && library && (
        <PostDrawer
          item={open}
          tags={library.tags}
          onClose={() => setOpen(null)}
          onSaved={(saved) => {
            setLibrary((prev) => prev && { ...prev, items: prev.items.map((x) => (x.id === saved.id ? saved : x)) });
            setOpen(saved);
          }}
          onOpenFile={(file) => setOpen(library.items.find((x) => x.id === `${open.source}:${file}`) ?? open)}
        />
      )}
    </main>
  );
}
