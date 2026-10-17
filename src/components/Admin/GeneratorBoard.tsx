"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import {
  genUrl,
  type Busy,
  type PackItem,
  type Preview,
  type Status,
} from "./generatorTypes";
import NewEventDrawer from "./NewEventDrawer";
import StagePill from "./StagePill";
import { Markdown } from "./ReelStudy";
import { pill, primaryButton, sectionLabel } from "./types";

type TypeRow = PackItem & {
  base: string; // the post type (bucket); key is this graphic: <base> or <base>__2 …
  name: string; // this graphic's own name, when a bucket holds several
  status: Status;
  running: boolean;
  failed: boolean;
  preview: Preview;
};
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

/** What's been made so far: the signed-off post, the current round, or the three options. */
function CardPreview({ p }: { p: Preview }) {
  if (p.kind === "none") return null; // nothing made yet: no picture, just the card
  if (p.kind === "options")
    return (
      <div className="grid w-1/2 grid-cols-3 gap-1">
        {p.images.map((img, i) => (
          <div key={img} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={genUrl(img, true)}
              alt=""
              className="aspect-[4/5] w-full rounded object-cover"
            />
            <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[8px] font-bold text-white">
              {String.fromCharCode(65 + i)}
            </span>
          </div>
        ))}
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={genUrl(p.images[0], true)}
      alt=""
      className="aspect-[4/5] w-1/2 rounded-lg object-cover"
    />
  );
}

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

  const addGraphic = async (base: string, label: string) => {
    const name = window.prompt(
      `New graphic under "${label}". What is it? (e.g. Team lock deadline)`,
    );
    if (!name?.trim()) return;
    const res = await fetch("/api/admin/generator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: data?.event, type: base, action: "add-graphic", name }),
    });
    const d = await res.json();
    if (!res.ok) return setMessage(d.error ?? "Something went wrong");
    window.location.href = `/admin/generator/${data?.event}/${d.key}`;
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
                    {p[row].map((t, i, all) => {
                      // after the last graphic of a bucket: add another graphic under the same post type
                      const addAnother =
                        data.board.approved && all[i + 1]?.base !== t.base ? (
                          <button
                            onClick={() => addGraphic(t.base, t.label)}
                            className="-mt-1 self-start px-1 text-[10px] font-bold text-gray-400 hover:text-gray-900 hover:underline dark:hover:text-white"
                          >
                            + Add another graphic here
                          </button>
                        ) : null;
                      const card = (
                        <div
                          className={`flex h-full flex-col gap-2 rounded-xl border border-gray-100 bg-white p-3 dark:border-white/5 dark:bg-[#0d0d0d] ${
                            data.board.approved
                              ? "hover:border-gray-400 dark:hover:border-white/30"
                              : "opacity-50"
                          }`}
                        >
                          <div className="text-xs font-black leading-snug">
                            {t.key !== t.base ? <span className="text-gray-400">+ </span> : null}
                            {t.name || t.label}
                          </div>
                          {t.name && (
                            <div className="-mt-1 text-[9px] text-gray-400 dark:text-white/40">
                              {t.label}
                            </div>
                          )}
                          {t.phase === "Pre/post-event" && (
                            <div className="text-[9px] uppercase tracking-widest text-gray-400 dark:text-white/40">
                              Also post-event
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <StagePill
                              stage={t.status.stage}
                              running={t.running}
                              failed={t.failed}
                            />
                            {t.running && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault(); // the card is a link
                                  stopGraphic(t.key, t.name || t.label);
                                }}
                                className="rounded border border-gray-300 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-gray-500 hover:border-gray-900 hover:text-gray-900 dark:border-white/20 dark:text-white/50 dark:hover:text-white"
                              >
                                Stop
                              </button>
                            )}
                          </div>
                          <CardPreview p={t.preview} />
                        </div>
                      );
                      return data.board.approved ? (
                        <Fragment key={t.key}>
                          <Link href={`/admin/generator/${data.event}/${t.key}`}>
                            {card}
                          </Link>
                          {addAnother}
                        </Fragment>
                      ) : (
                        <div key={t.key} title="Approve the brand board first">
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
