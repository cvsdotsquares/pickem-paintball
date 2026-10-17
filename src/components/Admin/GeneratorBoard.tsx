"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import {
  genUrl,
  type Busy,
  type GraphicRow,
} from "./generatorTypes";
import GraphicStrip from "./GraphicStrip";
import NewEventDrawer from "./NewEventDrawer";
import { Markdown } from "./ReelStudy";
import { pill, primaryButton, sectionLabel } from "./types";

type TypeRow = GraphicRow;
type Data = {
  events: { id: string; label: string; settingUp?: boolean }[];
  event: string;
  board: {
    approved: boolean;
    approvedAt: string;
    image: string;
    notes: string;
    request: {
      brief: string;
      inspo: string[];
      files: string[];
      board_feedback?: { at: string; comment: string }[];
    } | null;
  };
  types: TypeRow[];
  busy: Busy;
  busyAll: NonNullable<Busy>[];
  feedbackToReview: number;
};

/** Post Generator, event view: the brand board, then one card per post type in the event pack. */
export default function GeneratorBoard() {
  const [event, setEvent] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");

  const stopGraphic = async (key: string, label: string) => {
    if (!window.confirm(`Stop Claude on "${label}"? What it has done so far is kept.`)) return;
    const res = await fetch("/api/admin/generator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: data?.event, type: key, action: "stop" }),
    });
    const d = await res.json();
    if (!res.ok) setMessage(d.error ?? "Something went wrong");
    load();
  };

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/admin/generator${event ? `?event=${event}` : ""}`,
      { cache: "no-store" },
    );
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

  const post = async (action: string, extra: Record<string, string> = {}) => {
    setMessage("");
    const res = await fetch("/api/admin/generator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, action, ...extra }),
    });
    const d = await res.json();
    if (!res.ok) setMessage(d.error ?? "Something went wrong");
    else setComment("");
    load();
  };
  const approve = () => post("approve-board");

  if (error) return <div className="p-8 text-xs text-red-400">{error}</div>;
  if (!data) return <div className="p-8 text-xs text-gray-400">Loading…</div>;
  const boardBuilding =
    data.busy?.label?.startsWith("Set up event") &&
    data.busy.params.event === data.event;

  // Rows = when the post goes out; columns = must vs nice to have. "Pre/post-event" (season standings) sits in Pre-event.
  const phaseOf = (t: TypeRow) =>
    t.phase.startsWith("Pre") ? "pre" : t.phase === "Live" ? "live" : "post";
  const phases = [
    {
      key: "pre",
      title: "Pre-event",
      hint: "the build-up: rosters, brackets, countdowns",
    },
    { key: "live", title: "During the event", hint: "one click at the event" },
    { key: "post", title: "Post-event", hint: "results, leaders, champions" },
  ].map((p) => ({
    ...p,
    must: data.types.filter(
      (t) => phaseOf(t) === p.key && t.priority === "must",
    ),
    nice: data.types.filter(
      (t) => phaseOf(t) === p.key && t.priority === "nice",
    ),
  }));

  // one card per post type, holding all its graphics in order
  const buckets = (rows: TypeRow[]) =>
    rows.reduce<TypeRow[][]>((acc, r) => {
      const last = acc[acc.length - 1];
      if (last && last[0].base === r.base) last.push(r);
      else acc.push([r]);
      return acc;
    }, []);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-lg font-black uppercase tracking-wide">
          Post Generator
        </h1>
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
        <button className={pill(false)} onClick={() => setAdding(true)}>
          + New event
        </button>
        {data.busyAll.length > 0 && (
          <span className="text-[10px] text-gray-500 dark:text-white/50">
            Claude is working on {data.busyAll.length}:{" "}
            {data.busyAll.map((b) => `${b.label} · ${b.params.type ?? b.params.event}`).join(" | ")}
          </span>
        )}
      </div>
      {data.feedbackToReview > 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-orange-500 px-4 py-3 text-[11px] text-white">
          <b>
            {data.feedbackToReview} feedback item
            {data.feedbackToReview === 1 ? "" : "s"} to review
          </b>
          <span className="text-white/85">
            Say &quot;review feedback&quot; to Claude in chat — you decide
            together what becomes a rule, a guideline or a one-off.
          </span>
        </div>
      )}
      {message && <div className="text-[11px] text-red-400">{message}</div>}
      {adding && (
        <NewEventDrawer
          onClose={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false);
            setEvent(id);
          }}
        />
      )}

      <section className="flex flex-col gap-4 rounded-xl bg-white dark:bg-[#0d0d0d] p-5 md:flex-row">
        {data.board.image ? (
          <a
            href={genUrl(data.board.image)}
            target="_blank"
            rel="noreferrer"
            className="md:w-2/3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={genUrl(data.board.image)}
              alt="Brand board"
              className="w-full rounded-lg"
            />
          </a>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-lg bg-gray-50 dark:bg-white/5 text-[11px] text-gray-400 md:w-2/3">
            {boardBuilding ? (
              <span className="animate-pulse">
                Claude is building the brand board…
              </span>
            ) : (
              "No brand board yet for this event"
            )}
          </div>
        )}
        <div className="flex flex-1 flex-col gap-3">
          <div className={sectionLabel}>Step 0 — event brand board</div>
          <p className="text-[11px] text-gray-500 dark:text-white/50">
            The event&apos;s look: palette, tools this event, do / don&apos;t.
            Every post for this event starts from it.
          </p>
          {boardBuilding && data.board.image && (
            <div className="animate-pulse text-[11px] text-gray-500">
              Claude is updating the board…
            </div>
          )}
          {data.board.approved ? (
            <div className="text-[11px] font-bold text-green-600 dark:text-green-400">
              Approved {data.board.approvedAt}
            </div>
          ) : (
            <button
              className={primaryButton}
              onClick={approve}
              disabled={!data.board.image || boardBuilding}
            >
              Approve brand board
            </button>
          )}
          {data.board.notes && (
            <details className="text-[11px]">
              <summary className="cursor-pointer font-bold">
                How Claude built it
              </summary>
              <div className="mt-2">
                <Markdown text={data.board.notes} />
              </div>
            </details>
          )}
          {data.board.request && data.board.image && !boardBuilding && (
            <div className="flex flex-col gap-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Want changes? Say what — Claude redoes the board (you approve it again)"
                className="w-full resize-y rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-3 py-2 text-[11px] outline-none"
              />
              <button
                className="self-start text-[10px] font-bold uppercase tracking-widest underline disabled:opacity-40"
                disabled={!comment.trim() || !!data.busy}
                onClick={() => post("change-board", { comment })}
              >
                Change the board
              </button>
            </div>
          )}
        </div>
      </section>

      {/* columns = when it goes out (pre / during / post); in each column: must have, then nice to have.
          Each column stacks on its own, so a short column doesn't leave white space. */}
      <section className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-3 items-start gap-3">
          {phases.map((p) => (
            <div key={p.key} className="flex flex-col gap-2">
              <div className="border-b border-gray-200 pb-1 dark:border-white/10">
                <h2 className="text-sm font-black uppercase tracking-wide">
                  {p.title}
                </h2>
                <div className="text-[10px] text-gray-400 dark:text-white/40">
                  {p.hint}
                </div>
              </div>
              {(["must", "nice"] as const).map((row) => (
                <Fragment key={row}>
                  <div className={`${sectionLabel} pt-2`}>
                    {row === "must" ? "Must have" : "Nice to have"}
                  </div>
                  <div className="flex flex-col gap-2 rounded-xl bg-gray-50 p-2 dark:bg-white/[0.03]">
                    {p[row].length === 0 && (
                      <div className="p-2 text-[10px] text-gray-300 dark:text-white/25">
                        None
                      </div>
                    )}
                    {buckets(p[row]).map((gs) => {
                      const t = gs[0];
                      const done = gs.filter((g) => g.status.stage === "signed_off").length;
                      const card = (
                        <div
                          className={`flex h-full flex-col gap-2 rounded-xl border border-gray-100 bg-white p-3 dark:border-white/5 dark:bg-[#0d0d0d] ${
                            data.board.approved
                              ? "hover:border-gray-400 dark:hover:border-white/30"
                              : "opacity-50"
                          }`}
                        >
                          <div className="flex items-baseline gap-2">
                            <div className="flex-1 text-xs font-black leading-snug">{t.label}</div>
                            <div className="shrink-0 text-[9px] text-gray-400 dark:text-white/40">
                              {gs.length === 1 ? "1 graphic" : `${gs.length} graphics`}
                              {done > 0 && ` · ${done} templated`}
                            </div>
                          </div>
                          {t.phase === "Pre/post-event" && (
                            <div className="-mt-1 text-[9px] uppercase tracking-widest text-gray-400 dark:text-white/40">
                              Also post-event
                            </div>
                          )}
                          <GraphicStrip
                            event={data.event}
                            graphics={gs}
                            onStop={(g) => stopGraphic(g.key, g.display)}
                          />
                        </div>
                      );
                      return data.board.approved ? (
                        <Link key={t.base} href={`/admin/generator/${data.event}/${t.base}`}>
                          {card}
                        </Link>
                      ) : (
                        <div key={t.base} title="Approve the brand board first">
                          {card}
                        </div>
                      );
                    })}
                  </div>
                </Fragment>
              ))}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
