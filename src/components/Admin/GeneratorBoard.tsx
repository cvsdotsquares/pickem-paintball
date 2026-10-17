"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { STAGE, genUrl, toneClass, type Busy, type PackItem, type Status } from "./generatorTypes";
import { primaryButton, sectionLabel } from "./types";

type TypeRow = PackItem & { status: Status; running: boolean };
type Data = {
  events: { id: string; label: string }[];
  event: string;
  board: { approved: boolean; approvedAt: string; image: string };
  types: TypeRow[];
  busy: Busy;
};

/** Post Generator, event view: the brand board, then one card per post type in the event pack. */
export default function GeneratorBoard() {
  const [event, setEvent] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/generator${event ? `?event=${event}` : ""}`, { cache: "no-store" });
    const d = await res.json();
    if (!res.ok) return setError(d.error ?? "Could not load");
    setData(d);
    if (!event) setEvent(d.event);
  }, [event]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data?.busy) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [data?.busy, load]);

  const approve = async () => {
    await fetch("/api/admin/generator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, action: "approve-board" }),
    });
    load();
  };

  if (error) return <div className="p-8 text-xs text-red-400">{error}</div>;
  if (!data) return <div className="p-8 text-xs text-gray-400">Loading…</div>;

  const groups: { title: string; items: TypeRow[] }[] = [
    { title: "Must", items: data.types.filter((t) => t.priority === "must") },
    { title: "Nice to have", items: data.types.filter((t) => t.priority === "nice") },
  ];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-lg font-black uppercase tracking-wide">Post Generator</h1>
        <select
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          className="rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0d0d0d] px-3 py-1.5 text-xs font-bold"
        >
          {data.events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
        {data.busy && (
          <span className="text-[10px] text-gray-500 dark:text-white/50">
            Claude is working: {data.busy.label} · {data.busy.params.type}
          </span>
        )}
      </div>

      <section className="flex flex-col gap-4 rounded-xl bg-white dark:bg-[#0d0d0d] p-5 md:flex-row">
        {data.board.image ? (
          <a href={genUrl(data.board.image)} target="_blank" rel="noreferrer" className="md:w-2/3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={genUrl(data.board.image)} alt="Brand board" className="w-full rounded-lg" />
          </a>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-lg bg-gray-50 dark:bg-white/5 text-[11px] text-gray-400 md:w-2/3">
            No brand board yet for this event
          </div>
        )}
        <div className="flex flex-1 flex-col gap-3">
          <div className={sectionLabel}>Step 0 — event brand board</div>
          <p className="text-[11px] text-gray-500 dark:text-white/50">
            The event&apos;s look: palette, tools this event, do / don&apos;t. Every post for this event starts from it.
          </p>
          {data.board.approved ? (
            <div className="text-[11px] font-bold text-green-600 dark:text-green-400">Approved {data.board.approvedAt}</div>
          ) : (
            <button className={primaryButton} onClick={approve} disabled={!data.board.image}>
              Approve brand board
            </button>
          )}
        </div>
      </section>

      {groups.map((g) => (
        <section key={g.title}>
          <div className={`${sectionLabel} mb-2`}>{g.title}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {g.items.map((t) => {
              const st = STAGE[t.status.stage] ?? STAGE.not_started;
              const card = (
                <div
                  className={`flex h-full flex-col gap-2 rounded-xl border border-gray-100 dark:border-white/5 bg-white dark:bg-[#0d0d0d] p-4 ${
                    data.board.approved ? "hover:border-gray-400 dark:hover:border-white/30" : "opacity-50"
                  }`}
                >
                  <div className="text-[9px] uppercase tracking-widest text-gray-400 dark:text-white/40">{t.phase}</div>
                  <div className="text-xs font-black leading-snug">{t.label}</div>
                  <div className="mt-auto flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${toneClass(st.tone)}`}>{st.label}</span>
                    {t.running && <span className="animate-pulse text-[9px] text-gray-400">working…</span>}
                  </div>
                </div>
              );
              return data.board.approved ? (
                <Link key={t.key} href={`/admin/generator/${data.event}/${t.key}`}>
                  {card}
                </Link>
              ) : (
                <div key={t.key} title="Approve the brand board first">
                  {card}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
