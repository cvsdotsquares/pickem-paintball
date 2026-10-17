"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Markdown } from "./ReelStudy";
import StagePill from "./StagePill";
import {
  genUrl,
  type Busy,
  type Finals,
  type PackItem,
  type Round,
  type RoundFile,
  type Stage,
  type Status,
} from "./generatorTypes";
import {
  imageUrl,
  primaryButton,
  sectionLabel,
  type LibraryItem,
} from "./types";

type Run = {
  label: string;
  status: "running" | "done" | "failed";
  startedAt: string;
  summary?: string;
  log?: string;
} | null;
type Data = {
  event: string;
  eventLabel: string;
  item: PackItem;
  status: Status;
  brief: string;
  feedback: string;
  rounds: Round[];
  final: boolean;
  finals: Finals;
  examples: LibraryItem[];
  graphicName: string;
  keyInspo: string[];
  run: Run;
  busy: Busy;
  full: boolean; // the most Claude runs at once are going: no room for another
};

const STEPS: { label: string; stages: Stage[] }[] = [
  { label: "Brief", stages: ["not_started", "brief"] },
  { label: "Options", stages: ["brief_approved", "options"] },
  { label: "Review", stages: ["chosen", "ready", "feedback"] },
  { label: "Templated", stages: ["signed_off"] },
  { label: "Final posts", stages: [] },
];

const textarea =
  "w-full resize-y rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-3 py-2 text-[11px] outline-none placeholder-gray-400 focus:border-gray-400 dark:placeholder-white/30 dark:focus:border-white/30";
const secondaryButton =
  "rounded-lg border border-gray-300 dark:border-white/20 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40";

function minutesSince(iso: string) {
  return Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );
}

function Render({ f, big }: { f: RoundFile; big?: boolean }) {
  return (
    <a href={genUrl(f.png)} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={genUrl(f.png)}
        alt={f.label}
        className={`w-full rounded-lg ${big ? "" : "shadow"}`}
      />
    </a>
  );
}

/** Step 5: pick teams, make their posts from the signed-off template, see them. */
function FinalPosts({ f, busy, onMake }: { f: Finals; busy: boolean; onMake: (teams: string[]) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  if (!f.ready)
    return (
      <p className="text-[11px] text-gray-400">
        5. Final posts: not set up for this post type yet (ask Claude to add its data builder).
      </p>
    );
  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-white/10">
      <div className={sectionLabel}>5. Final posts — one per team</div>
      <p className="text-[11px] text-gray-500 dark:text-white/50">
        Tick the teams, then make their posts. Numbers come from the event databook; colours and logos from
        each team&apos;s brand board. Takes a few seconds per team.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {f.teams.map((t) => (
          <button
            key={t.key}
            onClick={() => toggle(t.key)}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${
              picked.includes(t.key)
                ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-black"
                : "border-gray-200 text-gray-500 hover:border-gray-400 dark:border-white/10 dark:text-white/50"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          className={primaryButton}
          disabled={busy || !picked.length}
          onClick={() => onMake(picked)}
        >
          {busy ? "Making…" : `Make ${picked.length || ""} final post${picked.length === 1 ? "" : "s"}`}
        </button>
        <button
          className="text-[10px] text-gray-400 underline"
          onClick={() => setPicked(picked.length === f.teams.length ? [] : f.teams.map((t) => t.key))}
        >
          {picked.length === f.teams.length ? "Clear" : "All teams"}
        </button>
      </div>
      {f.posts.length > 0 && (
        <>
          <div className="text-[10px] text-gray-400 dark:text-white/40">
            Made {f.madeAt} from {f.source}
            {f.test
              ? " — TEST: Lone Star numbers until the World Cup databook is linked; not copied to the Drive kit."
              : " — saved to the Drive kit: 07. Output → Final Posts."}
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {f.posts.map((p) => (
              <div key={p.team} className="flex flex-col gap-1">
                <a href={genUrl(p.png)} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={genUrl(p.png, true)} alt={p.name} className="w-full rounded-lg shadow" />
                </a>
                <div className="text-[10px] font-bold">{p.name}</div>
                {p.pdf && (
                  <a href={genUrl(p.pdf)} className="text-[9px] text-gray-400 underline">
                    Canva PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The brief's "## Summary" section for James to assess at a glance; the full brief (written for Claude's
 * next steps) folds away underneath. Older briefs without a summary show in full.
 */
function BriefSummary({ text }: { text: string }) {
  if (!text) return <p className="text-[11px] text-gray-400">(brief.md is empty)</p>;
  const start = text.search(/^##\s*Summary/m);
  if (start < 0) return <Markdown text={text} />;
  const afterHeading = text.indexOf("\n", start) + 1;
  const next = text.slice(afterHeading).search(/\n##\s/);
  const end = next < 0 ? text.length : afterHeading + next;
  const summary = text.slice(afterHeading, end).trim();
  const rest = text.slice(0, start) + text.slice(end);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg bg-gray-50 p-4 dark:bg-white/5">
        <Markdown text={summary} />
      </div>
      <details>
        <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Full brief (detail for Claude&apos;s next steps)
        </summary>
        <div className="mt-3">
          <Markdown text={rest} />
        </div>
      </details>
    </div>
  );
}

/** Post Generator, one post type for one event: brief → options → review → sign off. */
export default function PostTypeView({
  event,
  type,
}: {
  event: string;
  type: string;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  // a finished step James clicked to look at again (0 brief, 1 options, 2 review); null = where the post is now
  const [view, setView] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/admin/generator?event=${event}&type=${type}`,
      { cache: "no-store" },
    );
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

  const act = async (
    action: string,
    extra: Record<string, string> = {},
    confirmText?: string,
  ) => {
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
    setView(null);
    if (action === "signoff")
      setMessage("Signed off — template and post saved to the Drive kit.");
    if (action === "make-finals") setMessage(d.log ?? "Done");
    if (action === "stop") setMessage("Stopped. Start the step again when you're ready.");
    load();
  };

  const toggleKey = async (id: string, on: boolean) => {
    const res = await fetch("/api/admin/generator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, type, action: "key-inspo", id, on }),
    });
    if (res.ok) load();
  };

  if (error) return <div className="p-8 text-xs text-red-400">{error}</div>;
  if (!data) return <div className="p-8 text-xs text-gray-400">Loading…</div>;

  const { status, rounds } = data;
  const stepIndex = data.finals.posts.length && !data.finals.test
    ? STEPS.length - 1
    : STEPS.findIndex((s) => s.stages.includes(status.stage));
  const revisit = view !== null;
  const shown: Stage = view === 0 ? "brief" : view === 1 ? "options" : view === 2 ? "ready" : status.stage;
  const optionsRound = [...rounds].reverse().find((r) => r.options.length);
  const current = rounds.find((r) => r.name === status.current);
  const otherBusy = data.full && !working;
  const canAct = !working && !sending && !otherBusy;
  const failed = data.run?.status === "failed";
  const needsRetry =
    ["not_started", "brief_approved", "chosen", "feedback"].includes(
      status.stage,
    ) && !working;

  const commentBox = (placeholder: string, rows = 3) => (
    <textarea
      value={comment}
      onChange={(e) => setComment(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className={textarea}
    />
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-6">
      {/* header */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <Link
            href="/admin/generator"
            className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:underline"
          >
            ← {data.eventLabel}
          </Link>
          <h1 className="mt-1 text-lg font-black uppercase tracking-wide">
            {data.graphicName || data.item.label}
          </h1>
          {data.graphicName && (
            <div className="text-[11px] font-bold text-gray-500 dark:text-white/50">{data.item.label}</div>
          )}
          <div className="text-[10px] text-gray-400 dark:text-white/40">
            {data.item.phase} ·{" "}
            {data.item.priority === "must" ? "Must" : "Nice to have"} ·
            template: at the event only logos, photos, names and stats change
          </div>
        </div>
        <StagePill
          stage={status.stage}
          running={!!working}
          failed={!!failed && !working}
          big
        />
      </div>

      {/* steps */}
      <div className="flex gap-1">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            disabled={i > stepIndex}
            title={i < stepIndex && i < 3 ? "Look at this step again — you can change things from there" : ""}
            onClick={() => setView(i < 3 && i < stepIndex ? i : null)}
            className={`flex-1 rounded px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-widest ${
              view === i ? "ring-2 ring-gray-900 dark:ring-white " : ""
            }${i <= stepIndex ? "cursor-pointer hover:opacity-80 " : "cursor-default "}${
              i < stepIndex
                ? "bg-green-500/15 text-green-700 dark:text-green-400"
                : i === stepIndex
                  ? "bg-gray-900 text-white dark:bg-white dark:text-black"
                  : "bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-white/30"
            }`}
          >
            {i + 1}. {s.label}
          </button>
        ))}
      </div>
      {revisit && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-100 px-4 py-2 text-[11px] text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
          Looking back at step {view! + 1}. Change something here and the post picks up from this step;
          the signed-off template stays in the kit until you sign off again.
          <button className="font-bold underline" onClick={() => setView(null)}>
            Back to where it is now
          </button>
        </div>
      )}

      {/* job status */}
      {working && data.run && (
        <div className="flex items-center gap-3 rounded-xl bg-[#1a3c6e] px-4 py-3 text-[11px] text-white">
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <span className="font-bold">Claude is working: {data.run.label}</span>{" "}
          <span className="text-white/70">
            — started {minutesSince(data.run.startedAt)} min ago. Briefs take a
            few minutes; options and reviews 15–30. You can leave this page.
          </span>
          <button
            className="ml-auto shrink-0 rounded bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#1a3c6e] hover:bg-white/80"
            disabled={sending}
            onClick={() =>
              act("stop", {}, "Stop Claude on this graphic? What it has done so far is kept; you can start the step again.")
            }
          >
            Stop
          </button>
        </div>
      )}
      {otherBusy && (
        <div className="rounded-xl bg-gray-100 dark:bg-white/5 px-4 py-3 text-[11px] text-gray-500">
          Claude is already working on 3 graphics — that&apos;s the most at once. Buttons come back when one
          finishes (or stop one from its page or the board).
        </div>
      )}
      {failed && needsRetry && (
        <div className="rounded-xl bg-red-500 px-4 py-3 text-[11px] text-white">
          The last run stopped: {data.run?.summary}{" "}
          <button
            className="ml-2 font-bold underline"
            disabled={!canAct}
            onClick={() => act("retry")}
          >
            Try again
          </button>
        </div>
      )}
      {message && (
        <div className="text-[11px] font-bold text-green-600 dark:text-green-400">
          {message}
        </div>
      )}

      {/* current step */}
      <section className="flex flex-col gap-4 rounded-xl bg-white dark:bg-[#0d0d0d] p-5">
        {shown === "not_started" && working && (
          <>
            <div className={sectionLabel}>
              Step 1 — your brief is with Claude
            </div>
            <p className="text-[11px] text-gray-500 dark:text-white/50">
              Claude is turning it into the full brief (usually a few minutes).
              It appears here when it&apos;s ready, for you to approve.
            </p>
            {data.feedback && (
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/5">
                <Markdown text={data.feedback} />
              </div>
            )}
          </>
        )}

        {shown === "not_started" && !working && (
          <>
            <div className={sectionLabel}>Step 1 — your brief</div>
            <p className="text-[11px] text-gray-500 dark:text-white/50">
              Write what you want from this post: what it should show, ideas you
              have, what to keep or change from past versions, anything to
              avoid. Claude turns it into the full brief — checking the inputs,
              past versions and inspiration (below) and which parts become the
              template&apos;s slots — and shows it to you to approve.
            </p>
            {data.feedback && (
              <p className="text-[10px] text-gray-400">
                Your earlier comments are used too.
              </p>
            )}
            {commentBox("Your brief for this post…", 7)}
            <div>
              <button
                className={primaryButton}
                disabled={!canAct || !comment.trim()}
                onClick={() => act("write-brief")}
              >
                Send brief to Claude
              </button>
            </div>
          </>
        )}

        {shown === "brief" && (
          <>
            <div className={sectionLabel}>Step 1 — Claude&apos;s brief</div>
            <BriefSummary text={data.brief} />
            {commentBox(
              "Optional note for the options — or, if something's wrong, say what to change",
            )}
            <div className="flex flex-wrap gap-3">
              <button
                className={`${primaryButton} ${revisit ? "hidden" : ""}`}
                disabled={!canAct}
                onClick={() => act("approve-brief")}
              >
                Approve brief → make rough layouts
              </button>
              <button
                className={secondaryButton}
                disabled={!canAct || !comment.trim()}
                onClick={() => act("change-brief")}
              >
                Change it
              </button>
            </div>
          </>
        )}

        {shown === "options" && optionsRound && (
          <>
            <div className={sectionLabel}>Step 2 — pick a layout (rough drafts: colours and polish come next)</div>
            {optionsRound.notes && <Markdown text={optionsRound.notes} />}
            <div className="grid gap-4 md:grid-cols-3">
              {optionsRound.options.map((o) => (
                <div key={o.label} className="flex flex-col gap-2">
                  <div className="text-xs font-black">
                    {o.label} —{" "}
                    {o.label === "A"
                      ? "Familiar"
                      : o.label === "B"
                        ? "Evolved"
                        : "Fresh"}
                  </div>
                  <Render f={o} />
                  <button
                    className={primaryButton}
                    disabled={!canAct}
                    onClick={() =>
                      act(
                        "choose",
                        { option: o.label },
                        `Go with ${o.label}${comment ? " (with your note)" : ""}?`,
                      )
                    }
                  >
                    Choose {o.label}
                  </button>
                </div>
              ))}
            </div>
            {commentBox(
              'Optional: mix or tweak, e.g. "B with A\'s podium" — goes with your choice',
            )}
          </>
        )}

        {shown === "ready" && current && (
          <>
            <div className={sectionLabel}>
              Step 3 — ready for you ({current.name.replace("_", " ")})
            </div>
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
                    <p className="whitespace-pre-wrap text-[11px] text-gray-600 dark:text-white/60">
                      {current.post.caption}
                    </p>
                  </div>
                )}
                {current.post?.pdf && (
                  <a
                    href={genUrl(current.post.pdf)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-bold underline"
                  >
                    Open the PDF (for Canva)
                  </a>
                )}
              </div>
            </div>
            {current.checks.length > 0 && (
              <div>
                <div className={`${sectionLabel} mb-2`}>
                  Awkward-data checks (longest names, ties, missing photos)
                </div>
                <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                  {current.checks.map((c) => (
                    <a
                      key={c}
                      href={genUrl(c)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={genUrl(c)} alt="" className="w-full rounded" />
                    </a>
                  ))}
                </div>
              </div>
            )}
            {commentBox(
              "What to change? Be as precise as you like — Claude makes a new round from this",
            )}
            <div className="flex flex-wrap gap-3">
              <button
                className={secondaryButton}
                disabled={!canAct || !comment.trim()}
                onClick={() => act("feedback")}
              >
                Send feedback → new round
              </button>
              <button
                className={`${primaryButton} ${revisit ? "hidden" : ""}`}
                disabled={!canAct}
                onClick={() =>
                  act(
                    "signoff",
                    {},
                    "Sign off? The template is saved to the Drive kit (07. Output → Templates).",
                  )
                }
              >
                Sign off as the event template
              </button>
            </div>
          </>
        )}

        {shown === "signed_off" && (
          <>
            <div className={sectionLabel}>Templated</div>
            <p className="text-[11px] text-gray-500 dark:text-white/50">
              Saved to the Drive kit: <b>07. Output → Templates</b> (template, example
              PNG, Canva PDF, how to use). Real posts made from it at the event
              go to <b>07. Output → Final Posts</b>; only the logos, photos, names and stats change.
            </p>
            {current?.post && (
              <div className="md:w-1/4">
                <Render f={current.post} big />
              </div>
            )}
            <FinalPosts
              f={data.finals}
              busy={sending}
              onMake={(teams) => act("make-finals", { teams: teams.join(",") })}
            />
          </>
        )}

        {["brief_approved", "chosen", "feedback"].includes(shown) &&
          !working &&
          !failed && (
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              Waiting to start.
              <button
                className={secondaryButton}
                disabled={!canAct}
                onClick={() => act("retry")}
              >
                Start
              </button>
            </div>
          )}
        {["brief_approved", "chosen", "feedback"].includes(shown) &&
          working && (
            <p className="text-[11px] text-gray-500 dark:text-white/50">
              The next step appears here when Claude is done.
            </p>
          )}
      </section>

      {/* plan: past versions + inspiration */}
      <section>
        <div className={`${sectionLabel} mb-2`}>
          Past versions + inspiration for this post type ({data.examples.length}
          ) —{" "}
          <Link href="/admin/library" className="underline">
            open the Post Library
          </Link>
        </div>
        <p className="mb-2 text-[11px] text-gray-500 dark:text-white/50">
          Click ☆ on the ones that matter most for this graphic. Claude gives starred references the most weight
          in the brief, the layouts and the build
          {data.keyInspo.length ? ` (${data.keyInspo.length} starred)` : ""}.
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {[...data.examples]
            .sort((a, b) => Number(data.keyInspo.includes(b.id)) - Number(data.keyInspo.includes(a.id)))
            .map((i) => {
            const starred = data.keyInspo.includes(i.id);
            return (
            <div key={i.id} className={`relative rounded ${starred ? "ring-2 ring-amber-400" : ""}`}>
            <button
              onClick={() => toggleKey(i.id, !starred)}
              title={starred ? "Key inspiration — click to unstar" : "Star as key inspiration for this graphic"}
              className={`absolute right-1 top-1 z-10 rounded px-1 text-[13px] leading-none ${
                starred ? "bg-amber-400 text-black" : "bg-black/60 text-white hover:bg-black/80"
              }`}
            >
              {starred ? "★" : "☆"}
            </button>
            <a
              href={imageUrl(i.source, i.files[0])}
              target="_blank"
              rel="noreferrer"
              title={`${i.date} · ${i.title}`}
              className="relative block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl(i.source, i.files[0], true)}
                alt=""
                className="aspect-[4/5] w-full rounded object-cover"
              />
              {i.source === "inspo" && (
                <span className="absolute left-1 top-1 rounded bg-[#1a3c6e] px-1 text-[8px] font-bold uppercase text-white">
                  Inspo
                </span>
              )}
            </a>
            </div>
            );
          })}
        </div>
      </section>

      {/* history */}
      {(rounds.length > 0 || data.brief || data.feedback) && (
        <section className="flex flex-col gap-4">
          <div className={sectionLabel}>History</div>
          {rounds.map((r) => (
            <div
              key={r.name}
              className="rounded-xl bg-white dark:bg-[#0d0d0d] p-4"
            >
              <div className="mb-2 text-[11px] font-black">
                {r.name.replace("_", " ")}
              </div>
              <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                {(r.options.length ? r.options : r.post ? [r.post] : []).map(
                  (f) => (
                    <div key={f.png}>
                      <Render f={f} />
                      <div className="mt-1 text-[9px] text-gray-400">
                        {f.label}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          ))}
          {data.brief && status.stage !== "brief" && (
            <details className="rounded-xl bg-white dark:bg-[#0d0d0d] p-4">
              <summary className="cursor-pointer text-[11px] font-black">
                Brief
              </summary>
              <div className="mt-3">
                <Markdown text={data.brief} />
              </div>
            </details>
          )}
          {data.feedback && (
            <details className="rounded-xl bg-white dark:bg-[#0d0d0d] p-4">
              <summary className="cursor-pointer text-[11px] font-black">
                Your comments
              </summary>
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
