"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Markdown } from "./ReelStudy";
import StagePill from "./StagePill";
import { MODEL_CHOICES, modelLabel, PICKABLE_DEFAULTS } from "@/src/lib/admin/models";
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
  model?: string;
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
  graphicNumber: number;
  keyInspo: string[];
  holds?: { waitsFor: string[] | null; flags: string[] }; // post holds: the Data jobs this graphic's posts wait for (short names)
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

/** Which model makes the next round (options / feedback). Default = the step's usual model; picked per round. */
function ModelPick({ step, value, onChange, disabled }: { step: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-white/50">
      Model
      <select
        className="rounded-lg border border-gray-300 dark:border-white/20 bg-transparent px-2 py-2 text-[11px] font-bold normal-case tracking-normal text-gray-800 dark:text-white disabled:opacity-40"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Default ({modelLabel(PICKABLE_DEFAULTS[step])})</option>
        {MODEL_CHOICES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}

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

/** A time typed on the page in US Eastern (the league's time zone) → ISO UTC, DST-aware. */
function etToIso(local: string): string {
  if (!local) return "";
  for (const off of [-4, -5]) {
    const d = new Date(`${local}:00${off === -4 ? "-04:00" : "-05:00"}`);
    const back = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(d)
      .replace(", ", "T");
    if (back === local) return d.toISOString();
  }
  return new Date(`${local}:00-05:00`).toISOString();
}

/**
 * Step 5, after the posts are made (James, 18 Oct): approve the caption + time here, so a finished post lands on
 * the Schedule already approved instead of becoming a "needs you" item there. The recommended time is a plain
 * rule for now (next free noon / 6 PM in the graphic's window); the social media agent's plan will replace it.
 */
type ForGraphic = {
  posts: { key: string; name: string; png: string; caption: string }[];
  scheduled: Record<string, { id: string; status: string; publishAt: string | null }>;
  recommend: string[];
  why: string;
};
const etShow = (iso: string | null) =>
  iso
    ? `${new Date(iso).toLocaleString("en-GB", { timeZone: "America/New_York", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })} ET`
    : "";
const SPREAD_TIMES = ["09:00", "12:00", "15:00", "18:00", "20:00"];

function ApproveAndSchedule({ event, type, single, picked, disabled, onChanged }: { event: string; type: string; single: boolean; picked: string[]; disabled: boolean; onChanged: () => void }) {
  const [g, setG] = useState<ForGraphic | null>(null);
  const [caption, setCaption] = useState("");
  const [at, setAt] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [times, setTimes] = useState<Record<string, boolean>>({ "12:00": true, "18:00": true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showSpread, setShowSpread] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/scheduler?event=${event}&type=${type}`);
    const d = (await r.json()) as ForGraphic & { error?: string };
    if (d.error) return setErr(d.error);
    setG(d);
    setCaption((c) => c || d.posts[0]?.caption || "");
    setAt((a) => a || d.recommend[0] || "");
    setFrom((f) => f || d.recommend[0]?.slice(0, 10) || "");
    setTo((t) => t || d.recommend[d.recommend.length - 1]?.slice(0, 10) || "");
  }, [event, type]);
  useEffect(() => {
    load();
  }, [load]);

  const post = async (body: Record<string, unknown>, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/scheduler", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, type, ...body }) });
      const j = await r.json();
      if (j.error) setErr(j.error);
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  if (!g) return null;
  const field = "rounded border border-gray-300 bg-white px-2 py-1 text-[11px] dark:border-white/20 dark:bg-black";
  const schedLink = (
    <Link href="/admin/social" className="text-[10px] text-gray-500 underline dark:text-white/50">
      Open the Schedule ↗
    </Link>
  );

  // One post for the event: caption + time + two buttons.
  if (single) {
    const p = g.posts[0];
    const sc = p ? g.scheduled[p.key] : undefined;
    const done = sc && sc.status !== "draft" && sc.status !== "failed";
    const [d, t] = at.split("T");
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3 dark:border-white/10 md:w-2/3">
        <div className="text-[11px] font-bold">Approve + schedule</div>
        {done ? (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className={`rounded-full px-2 py-0.5 font-bold text-white ${sc!.status === "posted" ? "bg-green-600" : sc!.status === "failed" ? "bg-red-500" : "bg-[#1a3c6e]"}`}>
              {sc!.status === "posted" ? "Posted ✓" : sc!.status === "approved" ? "Scheduled" : sc!.status}
            </span>
            <span>{etShow(sc!.publishAt)}</span>
            {schedLink}
            <span className="text-gray-400">Change the time or un-approve it on the Schedule.</span>
          </div>
        ) : (
          <>
            <p className="text-[10px] text-gray-500 dark:text-white/50">The design is signed off; this approves the caption and the time. It then goes out on Instagram + Facebook by itself.</p>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={7} className={`${field} w-full font-mono`} disabled={busy} />
            <span className={`text-[10px] ${caption.length > 2200 ? "text-red-600" : "text-gray-400"}`}>{caption.length}/2,200 characters · {(caption.match(/#\w+/g) ?? []).length}/30 hashtags</span>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-gray-500">Goes out (ET)</span>
              <input type="date" value={d ?? ""} onChange={(e) => setAt(`${e.target.value}T${t ?? "12:00"}`)} className={field} disabled={busy} />
              <input type="time" value={t ?? "12:00"} step={300} onChange={(e) => setAt(`${d}T${e.target.value}`)} className={field} disabled={busy} />
              {g.recommend[0] && <span className="text-[10px] text-gray-400">Suggested: {g.why}</span>}
            </div>
            {err && <div className="text-[11px] text-red-600">{err}</div>}
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={primaryButton}
                disabled={disabled || busy || !at || !caption.trim() || caption.length > 2200}
                onClick={() => post({ action: "approve-now", variant: p.key, at, caption }, `Approve and schedule "${p.name === p.key ? "this post" : p.name}" for ${at.replace("T", " at ")} ET?\n\nIt goes out on Instagram and Facebook by itself.`)}
              >
                {busy ? "Working…" : "Approve + schedule"}
              </button>
              <button
                className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-black uppercase tracking-widest hover:border-gray-500 disabled:opacity-40 dark:border-white/20"
                disabled={disabled || busy || !caption.trim() || caption.length > 2200}
                onClick={() => post({ action: "approve-now", variant: p.key, at: null, caption }, "Approve and post NOW? It goes out on Instagram and Facebook within 5 minutes.")}
              >
                Approve + post now
              </button>
              {sc && <span className="text-[10px] text-gray-400">A draft of this is on the Schedule; this approves it.</span>}
            </div>
          </>
        )}
      </div>
    );
  }

  // Many posts (one per team / bracket): approve all (or the selected) and spread them.
  const chosen = (picked.length ? g.posts.filter((p) => picked.includes(p.key)) : g.posts).filter((p) => {
    const sc = g.scheduled[p.key];
    return !sc || sc.status === "draft" || sc.status === "failed";
  });
  const already = g.posts.length - chosen.length;
  const nTimes = Object.values(times).filter(Boolean).length;
  const nDays = from && to ? Math.max(0, Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000) + 1) : 0;
  const fits = chosen.length <= nDays * nTimes;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold">Approve + schedule</span>
        <span className="text-[10px] text-gray-500 dark:text-white/50">
          {already ? `${already} already on the Schedule · ` : ""}
          {chosen.length} to approve{picked.length ? " (selected above)" : ""}. Captions come from each post; edit one on the Schedule.
        </span>
        {schedLink}
      </div>
      {!showSpread ? (
        <div>
          <button className={primaryButton} disabled={disabled || busy || !chosen.length} onClick={() => setShowSpread(true)}>
            {picked.length ? `Approve ${chosen.length} selected + spread…` : `Approve all ${chosen.length} + spread…`}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-gray-500">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
            <span className="text-gray-500">to</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={field} />
            <span className="text-gray-500">at</span>
            {SPREAD_TIMES.map((tm) => (
              <button key={tm} onClick={() => setTimes((x) => ({ ...x, [tm]: !x[tm] }))} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${times[tm] ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-black" : "border-gray-200 text-gray-500 dark:border-white/10"}`}>
                {tm.replace(/^0/, "").replace(":00", "")}{Number(tm.slice(0, 2)) < 12 ? " AM" : " PM"}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-gray-400">Suggested: {g.why}</span>
          <span className={`text-[11px] ${fits ? "text-gray-500" : "text-red-600"}`}>
            {chosen.length} posts over {nDays} day{nDays === 1 ? "" : "s"} × {nTimes} time{nTimes === 1 ? "" : "s"} = {nDays * nTimes} slots{fits ? ` (about ${nDays ? (chosen.length / nDays).toFixed(1) : 0} a day), in the order shown above` : ": add days or times"}
          </span>
          {err && <div className="text-[11px] text-red-600">{err}</div>}
          <div className="flex flex-wrap gap-2">
            <button
              className={primaryButton}
              disabled={disabled || busy || !fits || !chosen.length || !nTimes}
              onClick={() =>
                post(
                  { action: "spread-approved", variants: chosen.map((p) => p.key), from, to, times: SPREAD_TIMES.filter((tm) => times[tm]) },
                  `Approve ${chosen.length} posts and spread them ${from} – ${to}?\n\nThey go out on Instagram and Facebook by themselves at those times.`,
                )
              }
            >
              {busy ? "Approving… (uploads each one, give it a minute)" : `Approve ${chosen.length} + schedule`}
            </button>
            <button className="text-[10px] text-gray-400 underline" onClick={() => setShowSpread(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Step 5 "Populate" (James, 17 Oct): fill the signed-off template with the latest numbers and make every version
 * (all teams / brackets, or the one post) → Drive kit. Runs in the background like steps 1–3. A number that isn't
 * live yet is listed; ones James can type (lock time, entries) get a box.
 */
function FinalPosts({
  f,
  working,
  canAct,
  onPopulate,
  event,
  type,
  onChanged,
}: {
  f: Finals;
  working: boolean;
  canAct: boolean;
  onPopulate: (teams: string[], set: Record<string, string>) => void;
  event: string;
  type: string;
  onChanged: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const box = "mt-2 flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-white/10";
  if (!f.ready)
    return (
      <div className={box}>
        <div className={sectionLabel}>5. Final posts</div>
        <p className="text-[11px] text-gray-500 dark:text-white/50">
          This graphic has no data builder yet (the bit that knows where its numbers come from), so it can&apos;t be
          populated. Ask Claude to write <code>final/data.py</code> for it.
        </p>
      </div>
    );
  // what isn't there yet, from the last check / populate (newer than the last finished posts)
  const waiting = f.waiting.length && (!f.posts.length || f.checkedAt >= f.madeAt) ? f.waiting : [];
  const typeable = waiting.filter((w) => w.kind);
  const blocked = waiting.some((w) => !w.kind);
  const set = Object.fromEntries(
    typeable
      .filter((w) => typed[w.key])
      .map((w) => [w.key, w.kind === "datetime" ? etToIso(typed[w.key]) : typed[w.key]]),
  );
  const allTyped = typeable.length > 0 && typeable.every((w) => typed[w.key]);
  const realPosts = f.posts.length > 0 && !f.test;
  const label = working
    ? "Working…"
    : allTyped
      ? "Populate with these"
      : f.single
        ? realPosts
          ? "Populate again with the latest numbers"
          : "Populate"
        : picked.length
          ? `Populate ${picked.length} selected`
          : `Populate all${f.teams.length ? ` ${f.teams.length}` : ""}`;
  return (
    <div className={box}>
      <div className={sectionLabel}>5. Final posts{f.single ? "" : " — one per team / bracket"}</div>
      <p className="text-[11px] text-gray-500 dark:text-white/50">
        <b>Populate</b> fills the signed-off template with the latest numbers and makes {f.single ? "the post" : "every version"},
        saved to the Drive kit (07. Output → Final Posts). It runs in the background — you can go back to the board.
      </p>
      {waiting.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-500/30 dark:bg-orange-500/10">
          <div className="text-[11px] font-bold">Waiting on:</div>
          {waiting.map((w) => (
            <div key={w.key} className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-bold">{w.label}</span>
              <span className="text-gray-500 dark:text-white/50">— {w.hint}</span>
              {w.kind && (
                <span className="flex items-center gap-1.5">
                  <span className="text-gray-500">or type it in:</span>
                  <input
                    type={w.kind === "datetime" ? "datetime-local" : "number"}
                    value={typed[w.key] ?? ""}
                    onChange={(e) => setTyped((t) => ({ ...t, [w.key]: e.target.value }))}
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] dark:border-white/20 dark:bg-black"
                  />
                  {w.kind === "datetime" && <span className="text-gray-500">ET</span>}
                </span>
              )}
            </div>
          ))}
          {blocked && (
            <div className="text-[10px] text-gray-500 dark:text-white/50">
              Populate again once it&apos;s there.
            </div>
          )}
        </div>
      )}
      {!f.single && f.teams.length > 0 && (
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
          {picked.length > 0 && (
            <button className="text-[10px] text-gray-400 underline" onClick={() => setPicked([])}>
              Clear (= all)
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          className={primaryButton}
          disabled={!canAct || working || (typeable.length > 0 && !allTyped && blocked)}
          onClick={() => onPopulate(picked, set)}
        >
          {label}
        </button>
        {working && <span className="text-[10px] text-gray-400">Populating in the background — you can leave this page.</span>}
      </div>
      {realPosts && (
        <>
          <div className="text-[10px] text-gray-400 dark:text-white/40">
            Made {f.madeAt}
            {f.source ? ` from ${f.source}` : ""}
            {" — saved to the Drive kit: 07. Output → Final Posts."}
            {Object.keys(f.typed).length > 0 &&
              ` Used your typed-in ${Object.keys(f.typed).join(", ").replace("lock_at", "lock time")} — populate again once it's live to swap in the real one.`}
          </div>
          <div className={f.single ? "md:w-1/4" : "grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6"}>
            {f.posts.map((p) => (
              <div key={p.team} className="flex flex-col gap-1">
                <a href={genUrl(p.png)} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={genUrl(p.png, true)} alt={p.name} className="w-full rounded-lg shadow" />
                </a>
                {!f.single && <div className="text-[10px] font-bold">{p.name}</div>}
                {p.pdf && (
                  <a href={genUrl(p.pdf)} className="text-[9px] text-gray-400 underline">
                    Canva PDF
                  </a>
                )}
              </div>
            ))}
          </div>
          <ApproveAndSchedule event={event} type={type} single={f.single} picked={picked} disabled={!canAct || working} onChanged={onChanged} />
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
  const [photos, setPhotos] = useState<string[]>([]); // added to the comment box (generator/-relative paths)
  const [uploading, setUploading] = useState(0);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  // a finished step James clicked to look at again (0 brief, 1 options, 2 review); null = where the post is now
  const [view, setView] = useState<number | null>(null);
  // model for the next options/feedback round ("" = default); kept after sending so the next round can stay or switch
  const [model, setModel] = useState("");

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
    extra: Record<string, unknown> = {},
    confirmText?: string,
  ) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setSending(true);
    setMessage("");
    const res = await fetch("/api/admin/generator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        type,
        action,
        comment,
        photos,
        ...(["approve-brief", "feedback", "retry"].includes(action) && model ? { model } : {}),
        ...extra,
      }),
    });
    const d = await res.json();
    setSending(false);
    if (!res.ok) return setMessage(d.error ?? "Something went wrong");
    setComment("");
    setPhotos([]);
    setView(null);
    if (action === "signoff")
      setMessage("Signed off — template saved to the Drive kit. Checking if the final post can be made now…");
    if (action === "populate") setMessage("Populating in the background — you can go back to the board.");
    if (action === "stop") setMessage("Stopped. Start the step again when you're ready.");
    load();
  };

  const rename = async () => {
    const name = window.prompt("Name this graphic (e.g. Picks are Live)", data?.graphicName ?? "");
    if (name === null) return;
    await fetch("/api/admin/generator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, type, action: "rename-graphic", name }),
    });
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
  const canAct = !working && !sending && !otherBusy && uploading === 0;
  const failed = data.run?.status === "failed";
  const needsRetry =
    ["not_started", "brief_approved", "chosen", "feedback"].includes(
      status.stage,
    ) && !working;

  /** Photos pasted, dropped or chosen in the comment box go up straight away; they're sent with the comment. */
  const addPhotos = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    setUploading((n) => n + imgs.length);
    for (const f of imgs) {
      const form = new FormData();
      form.append("event", event);
      form.append("type", type);
      form.append("file", f);
      const res = await fetch("/api/admin/generator/photo", { method: "POST", body: form });
      const d = await res.json();
      if (res.ok) setPhotos((p) => [...p, d.rel]);
      else setMessage(d.error ?? "Couldn't add that photo");
      setUploading((n) => n - 1);
    }
  };
  const hasComment = !!comment.trim() || photos.length > 0;

  const commentBox = (placeholder: string, rows = 3) => (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        addPhotos(Array.from(e.dataTransfer.files));
      }}
      className="flex flex-col gap-2"
    >
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files);
          if (files.some((f) => f.type.startsWith("image/"))) {
            e.preventDefault();
            addPhotos(files);
          }
        }}
        rows={rows}
        placeholder={placeholder}
        className={textarea}
      />
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((rel) => (
          <div key={rel} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={genUrl(rel, true)} alt="" className="h-16 w-16 rounded object-cover" />
            <button
              onClick={() => setPhotos((p) => p.filter((x) => x !== rel))}
              title="Remove photo"
              className="absolute -right-1.5 -top-1.5 h-4 w-4 rounded-full bg-black text-[9px] leading-none text-white"
            >
              ✕
            </button>
          </div>
        ))}
        {uploading > 0 && <span className="text-[10px] text-gray-400">Adding photo…</span>}
        <label className="cursor-pointer text-[10px] font-bold text-gray-400 hover:text-gray-900 dark:text-white/40 dark:hover:text-white">
          📎 Add photos
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addPhotos(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-[10px] text-gray-300 dark:text-white/25">or paste / drop them in</span>
      </div>
    </div>
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-6">
      {/* header */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            <Link href="/admin/social?tab=generator" className="hover:underline">
              ← {data.eventLabel}
            </Link>
            <span className="mx-1.5">/</span>
            <Link href={`/admin/generator/${event}/${data.item.key}`} className="hover:underline">
              {data.item.label}
            </Link>
          </div>
          <h1 className="mt-1 flex items-baseline gap-3 text-lg font-black uppercase tracking-wide">
            {data.graphicName || `${data.item.label} #${data.graphicNumber}`}
            <button
              className="text-[10px] font-bold normal-case tracking-normal text-gray-400 underline hover:text-gray-900 dark:hover:text-white"
              onClick={rename}
            >
              Rename
            </button>
          </h1>
          <div className="text-[10px] text-gray-400 dark:text-white/40">
            {data.item.phase} ·{" "}
            {data.item.priority === "must" ? "Must" : "Nice to have"} ·
            template: at the event only logos, photos, names and stats change
          </div>
          {data.holds?.waitsFor && (
            <div className="mt-1 text-[11px] text-gray-500 dark:text-white/50" title="Its posts aren't sent until these Data jobs' latest run passed">
              ⏳ Waits for: {data.holds.waitsFor.length ? data.holds.waitsFor.join(", ") : "nothing"}
            </div>
          )}
          {data.holds?.flags.map((f) => (
            <div key={f} className="mt-1 text-[11px] font-bold text-orange-500">⚠ {f}</div>
          ))}
        </div>
        <StagePill
          stage={status.stage}
          running={!!working}
          since={data.run?.startedAt}
          failed={!!failed && !working}
          finalMade={data.finals.posts.length > 0 && !data.finals.test}
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
          <span className="font-bold">
            {data.run.label === "Populate final posts" ? "Working" : "Claude is working"}: {data.run.label}
            {data.run.model ? ` · ${modelLabel(data.run.model)}` : ""}
          </span>{" "}
          <span className="text-white/70">
            — started {minutesSince(data.run.startedAt)} min ago.{" "}
            {data.run.label === "Populate final posts"
              ? "Seconds per post; up to a couple of minutes when it reads Pick'Em."
              : "Briefs take a few minutes; options and reviews 15–30."}{" "}
            You can leave this page.
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
                disabled={!canAct || !hasComment}
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
            <div className="flex flex-wrap items-center gap-3">
              {!revisit && <ModelPick step="post-options" value={model} onChange={setModel} disabled={!canAct} />}
              <button
                className={`${primaryButton} ${revisit ? "hidden" : ""}`}
                disabled={!canAct}
                onClick={() => act("approve-brief")}
              >
                Approve brief → make rough layouts
              </button>
              <button
                className={secondaryButton}
                disabled={!canAct || !hasComment}
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
                        `Go with ${o.label}${hasComment ? " (with your note)" : ""}?`,
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
            <div className="flex flex-wrap items-center gap-3">
              <ModelPick step="post-revise" value={model} onChange={setModel} disabled={!canAct} />
              <button
                className={secondaryButton}
                disabled={!canAct || !hasComment}
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
              working={!!working}
              canAct={!sending}
              onPopulate={(teams, set) => act("populate", { teams: teams.join(","), set })}
              event={event}
              type={type}
              onChanged={load}
            />
          </>
        )}

        {["brief_approved", "chosen", "feedback"].includes(shown) &&
          !working &&
          !failed && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
              Waiting to start.
              {(shown === "brief_approved" || shown === "feedback") && (
                <ModelPick
                  step={shown === "brief_approved" ? "post-options" : "post-revise"}
                  value={model}
                  onChange={setModel}
                  disabled={!canAct}
                />
              )}
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
          <Link href="/admin/social?tab=library" className="underline">
            open the Post Library
          </Link>
        </div>
        <p className="mb-2 text-[11px] text-gray-500 dark:text-white/50">
          Click ☆ on the ones that matter most for this graphic. Claude gives starred references the most weight
          in the brief, the layouts and the build
          {data.keyInspo.length ? ` (${data.keyInspo.length} starred)` : ""}. Scroll down for older ones.
        </p>
        <div className="grid max-h-[560px] grid-cols-3 gap-2 overflow-y-auto rounded-xl bg-white p-2 sm:grid-cols-6 lg:grid-cols-8 dark:bg-[#0d0d0d]">
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
