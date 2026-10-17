"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import GraphicStrip from "./GraphicStrip";
import { type GraphicRow } from "./generatorTypes";
import { primaryButton } from "./types";

type Data = {
  events: { id: string; label: string }[];
  event: string;
  board: { approved: boolean };
  types: GraphicRow[];
};

/** Post Generator, one post type: all its graphics side by side, + New graphic. Click one to work on it. */
export default function PostTypeHub({ event, type }: { event: string; type: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/generator?event=${event}`, { cache: "no-store" });
    const d = await res.json();
    if (!res.ok) return setError(d.error ?? "Could not load");
    setData(d);
  }, [event]);
  useEffect(() => {
    load();
  }, [load]);

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

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <Link
            href="/admin/generator"
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
    </main>
  );
}
