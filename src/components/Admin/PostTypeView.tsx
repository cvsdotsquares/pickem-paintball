"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Markdown } from "./ReelStudy";
import { STAGE, genUrl, toneClass, type Busy, type PackItem, type Round, type RoundFile, type Stage, type Status } from "./generatorTypes";
import { imageUrl, primaryButton, sectionLabel, type LibraryItem } from "./types";

type Run = { label: string; status: "running" | "done" | "failed"; startedAt: string; summary?: string; log?: string } | null;
type Data = {
  event: string;
  eventLabel: string;
  item: PackItem;
  status: Status;
  brief: string;
  feedback: string;
  rounds: Round[];
  final: boolean;
  examples: LibraryItem[];
  run: Run;
  busy: Busy;
};

const STEPS: { label: string; stages: Stage[] }[] = [
  { label: "Brief", stages: ["not_started", "brief"] },
  { label: "Options", stages: ["brief_approved", "options"] },
  { label: "Review", stages: ["chosen", "ready", "feedback"] },
  { label: "Signed off", stages: ["signed_off"] },
];

const textarea =
  "w-full resize-y rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-3 py-2 text-[11px] outline-none placeholder-gray-400 focus:border-gray-400 dark:placeholder-white/30 dark:focus:border-white/30";
const secondaryButton =
  "rounded-lg border border-gray-300 dark:border-white/20 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40";

function minutesSince(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function Render({ f, big }: { f: RoundFile; big?: boolean }) {
  return (
    <a href={genUrl(f.png)} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={genUrl(f.png)} alt={f.label} className={`w-full rounded-lg ${big ? "" : "shadow"}`} />
    </a>
  );
}

/** Post Generator, one post type for one event: brief → options → review → sign off. */
export default function PostTypeView({ event, type }: { event: string; type: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/generator?event=${event}&type=${type}`, { cache: "no-store" });
    const d = await res.json();
    if (!res.ok) return setError(d.error ?? "Could not load");
    setData(d);
  }, [event, type]);

  useEffect(() => {
    load();
  }, [load]);

  const working = data?.run?.status === "running";
  useEffect(() => {
    if (!working) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [working, load]);

  const act = async (action: string, extra: Record<string, string> = {}, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setSending(true);
    setMessage("");
    const res = await fetch("/api/admin/generator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, type, action, comment, ...extra }),
    });
    const d = await res.json();
    setSending(false);
    if (!res.ok) return setMessage(d.error ?? "Something went wrong");
    setComment("");
    if (action === "signoff") setMessage("Signed off — template and post saved to the Drive kit.");
    load();
  };

  if (error) return <div className="p-8 text-xs text-red-400">{error}</div>;
  if (!data) return <div className="p-8 text-xs text-gray-400">Loading…</div>;

  const { status, rounds } = data;
  const stage = STAGE[status.stage] ?? STAGE.not_started;
  const stepIndex = STEPS.findIndex((s) => s.stages.includes(status.stage));
  const optionsRound = [...rounds].reverse().find((r) => r.options.length);
  const current = rounds.find((r) => r.name === status.current);
  const otherBusy = data.busy && !working;
  const canAct = !working && !sending && !otherBusy;
  const failed = data.run?.status === "failed";
  const needsRetry = ["brief_approved", "chosen", "feedback"].includes(status.stage) && !working;

  const commentBox = (placeholder: string) => (
    <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder={placeholder} className={textarea} />
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-6">
      {/* header */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <Link href="/admin/generator" className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:underline">
            ← {data.eventLabel}
          </Link>
          <h1 className="mt-1 text-lg font-black uppercase tracking-wide">{data.item.label}</h1>
          <div className="text-[10px] text-gray-400 dark:text-white/40">
            {data.item.phase} · {data.item.priority === "must" ? "Must" : "Nice to have"} · template: at the event only logos, photos, names and stats change
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${toneClass(stage.tone)}`}>{stage.label}</span>
      </div>

      {/* steps */}
      <div className="flex gap-1">
        {STEPS.map((s, i) => (
          <div
            key={s.label}
            className={`flex-1 rounded px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-widest ${
              i < stepIndex
                ? "bg-green-500/15 text-green-700 dark:text-green-400"
                : i === stepIndex
                  ? "bg-gray-900 text-white dark:bg-white dark:text-black"
                  : "bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-white/30"
            }`}
          >
            {i + 1}. {s.label}
          </div>
        ))}
      </div>

      {/* job status */}
      {working && data.run && (
        <div className="rounded-xl bg-[#1a3c6e]/10 dark:bg-white/5 px-4 py-3 text-[11px]">
          <span className="animate-pulse font-bold">Claude is working: {data.run.label}</span>{" "}
          <span className="text-gray-500 dark:text-white/50">
            — started {minutesSince(data.run.startedAt)} min ago. Briefs take a few minutes; options and reviews 15–30. You can leave this page.
          </span>
        </div>
      )}
      {otherBusy && (
        <div className="rounded-xl bg-gray-100 dark:bg-white/5 px-4 py-3 text-[11px] text-gray-500">
          Claude is busy on another post ({data.busy?.label} · {data.busy?.params.type}). Buttons come back when it&apos;s done.
        </div>
      )}
      {failed && needsRetry && (
        <div className="rounded-xl bg-red-500/10 px-4 py-3 text-[11px] text-red-500">
          The last run stopped: {data.run?.summary}{" "}
          <button className="ml-2 font-bold underline" disabled={!canAct} onClick={() => act("retry")}>
            Try again
          </button>
        </div>
      )}
      {message && <div className="text-[11px] font-bold text-green-600 dark:text-green-400">{message}</div>}

      {/* current step */}
      <section className="flex flex-col gap-4 rounded-xl bg-white dark:bg-[#0d0d0d] p-5">
        {status.stage === "not_started" && (
          <>
            <div className={sectionLabel}>Step 1 — brief</div>
            <p className="text-[11px] text-gray-500 dark:text-white/50">
              Claude checks the inputs, looks at past versions and inspiration (below), and writes a short brief: what the post shows,
              the idea for this event, and which parts become the template&apos;s slots.
            </p>
            {data.feedback && <p className="text-[10px] text-gray-400">Your earlier comments will be used.</p>}
            <div>
              <button className={primaryButton} disabled={!canAct} onClick={() => act("write-brief")}>
                Write brief
              </button>
            </div>
          </>
        )}

        {status.stage === "brief" && (
          <>
            <div className={sectionLabel}>Step 1 — Claude&apos;s brief</div>
            <Markdown text={data.brief || "(brief.md is empty)"} />
            {commentBox("Optional note for the options — or, if something's wrong, say what to change")}
            <div className="flex flex-wrap gap-3">
              <button className={primaryButton} disabled={!canAct} onClick={() => act("approve-brief")}>
                Approve brief → make options
              </button>
              <button className={secondaryButton} disabled={!canAct || !comment.trim()} onClick={() => act("change-brief")}>
                Change it
              </button>
            </div>
          </>
        )}

        {status.stage === "options" && optionsRound && (
          <>
            <div className={sectionLabel}>Step 2 — pick a direction</div>
            {optionsRound.notes && <Markdown text={optionsRound.notes} />}
            <div className="grid gap-4 md:grid-cols-3">
              {optionsRound.options.map((o) => (
                <div key={o.label} className="flex flex-col gap-2">
                  <div className="text-xs font-black">
                    {o.label} — {o.label === "A" ? "Familiar" : o.label === "B" ? "Evolved" : "Fresh"}
                  </div>
                  <Render f={o} />
                  <button
                    className={primaryButton}
                    disabled={!canAct}
                    onClick={() => act("choose", { option: o.label }, `Go with ${o.label}${comment ? " (with your note)" : ""}?`)}
                  >
                    Choose {o.label}
                  </button>
                </div>
              ))}
            </div>
            {commentBox('Optional: mix or tweak, e.g. "B with A\'s podium" — goes with your choice')}
          </>
        )}

        {status.stage === "ready" && current && (
          <>
            <div className={sectionLabel}>Step 3 — ready for you ({current.name.replace("_", " ")})</div>
            <div className="grid gap-5 md:grid-cols-2">
              {current.post && <Render f={current.post} big />}
              <div className="flex flex-col gap-4">
                {current.review && (
                  <div>
                    <div className={`${sectionLabel} mb-2`}>Review</div>
                    <Markdown text={current.review} />
                  </div>
                )}
                {current.post?.caption && (
                  <div>
                    <div className={`${sectionLabel} mb-2`}>Caption</div>
                    <p className="whitespace-pre-wrap text-[11px] text-gray-600 dark:text-white/60">{current.post.caption}</p>
                  </div>
                )}
                {current.post?.pdf && (
                  <a href={genUrl(current.post.pdf)} target="_blank" rel="noreferrer" className="text-[10px] font-bold underline">
                    Open the PDF (for Canva)
                  </a>
                )}
              </div>
            </div>
            {current.checks.length > 0 && (
              <div>
                <div className={`${sectionLabel} mb-2`}>Awkward-data checks (longest names, ties, missing photos)</div>
                <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                  {current.checks.map((c) => (
                    <a key={c} href={genUrl(c)} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={genUrl(c)} alt="" className="w-full rounded" />
                    </a>
                  ))}
                </div>
              </div>
            )}
            {commentBox("What to change? Be as precise as you like — Claude makes a new round from this")}
            <div className="flex flex-wrap gap-3">
              <button className={secondaryButton} disabled={!canAct || !comment.trim()} onClick={() => act("feedback")}>
                Send feedback → new round
              </button>
              <button
                className={primaryButton}
                disabled={!canAct}
                onClick={() =>
                  act("signoff", {}, "Sign off? The template and the post are saved to the Drive kit (08. Templates + 07. Output).")
                }
              >
                Sign off as the event template
              </button>
            </div>
          </>
        )}

        {status.stage === "signed_off" && (
          <>
            <div className={sectionLabel}>Signed off</div>
            <p className="text-[11px] text-gray-500 dark:text-white/50">
              Saved to the Drive kit: <b>08. Templates</b> (template, example PNG, Canva PDF, how to use) and <b>07. Output</b> (the post).
              At the event only the logos, photos, names and stats change.
            </p>
            {current?.post && (
              <div className="md:w-1/2">
                <Render f={current.post} big />
              </div>
            )}
          </>
        )}

        {["brief_approved", "chosen", "feedback"].includes(status.stage) && !working && !failed && (
          <div className="flex items-center gap-3 text-[11px] text-gray-500">
            Waiting to start.
            <button className={secondaryButton} disabled={!canAct} onClick={() => act("retry")}>
              Start
            </button>
          </div>
        )}
        {["brief_approved", "chosen", "feedback"].includes(status.stage) && working && (
          <p className="text-[11px] text-gray-500 dark:text-white/50">The next step appears here when Claude is done.</p>
        )}
      </section>

      {/* plan: past versions + inspiration */}
      <section>
        <div className={`${sectionLabel} mb-2`}>
          Past versions + inspiration for this post type ({data.examples.length}) —{" "}
          <Link href="/admin/library" className="underline">
            open the Post Library
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {data.examples.map((i) => (
            <a key={i.id} href={imageUrl(i.source, i.files[0])} target="_blank" rel="noreferrer" title={`${i.date} · ${i.title}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(i.source, i.files[0], true)} alt="" className="aspect-[4/5] w-full rounded object-cover" />
              {i.source === "inspo" && (
                <span className="absolute left-1 top-1 rounded bg-[#1a3c6e] px-1 text-[8px] font-bold uppercase text-white">Inspo</span>
              )}
            </a>
          ))}
        </div>
      </section>

      {/* history */}
      {(rounds.length > 0 || data.brief || data.feedback) && (
        <section className="flex flex-col gap-4">
          <div className={sectionLabel}>History</div>
          {rounds.map((r) => (
            <div key={r.name} className="rounded-xl bg-white dark:bg-[#0d0d0d] p-4">
              <div className="mb-2 text-[11px] font-black">{r.name.replace("_", " ")}</div>
              <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                {(r.options.length ? r.options : r.post ? [r.post] : []).map((f) => (
                  <div key={f.png}>
                    <Render f={f} />
                    <div className="mt-1 text-[9px] text-gray-400">{f.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {data.brief && status.stage !== "brief" && (
            <details className="rounded-xl bg-white dark:bg-[#0d0d0d] p-4">
              <summary className="cursor-pointer text-[11px] font-black">Brief</summary>
              <div className="mt-3">
                <Markdown text={data.brief} />
              </div>
            </details>
          )}
          {data.feedback && (
            <details className="rounded-xl bg-white dark:bg-[#0d0d0d] p-4">
              <summary className="cursor-pointer text-[11px] font-black">Your comments</summary>
              <div className="mt-3">
                <Markdown text={data.feedback} />
              </div>
            </details>
          )}
        </section>
      )}
    </main>
  );
}
