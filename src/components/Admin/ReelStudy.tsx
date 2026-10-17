"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { imageUrl, sectionLabel, type Study } from "./types";

/** Loads a reel's study folder (videos, frame strips, Claude's breakdown). */
export function useStudy(study: string) {
  const [data, setData] = useState<Study | null>(null);
  useEffect(() => {
    setData(null);
    if (!study) return;
    let live = true;
    fetch(`/api/admin/study?study=${encodeURIComponent(study)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [study]);
  return data;
}

/** The reel itself: plays each video on a loop, with buttons to switch between them. */
export function ReelPlayer({ study, poster }: { study: Study | null; poster: string }) {
  const [n, setN] = useState(0);
  useEffect(() => setN(0), [study]);
  const videos = study?.videos ?? [];
  if (!videos.length) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={poster} alt="" className="max-h-[80vh] w-full object-contain" />;
  }
  return (
    <div className="w-full">
      <video
        key={videos[n]}
        src={imageUrl("inspo", videos[n])}
        poster={poster}
        autoPlay
        loop
        muted
        playsInline
        controls
        className="max-h-[70vh] w-full object-contain"
      />
      {videos.length > 1 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1">
          {videos.map((v, i) => (
            <button
              key={v}
              onClick={() => setN(i)}
              className={`h-6 min-w-6 rounded px-2 text-[10px] font-bold ${
                i === n ? "bg-white text-black" : "bg-white/10 text-white/60"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
      <div className="mt-1 text-center text-[9px] font-bold uppercase tracking-widest text-white/50">
        {videos.length > 1 ? `Video ${n + 1} of ${videos.length}` : "Reel"}
      </div>
    </div>
  );
}

/** Just enough markdown for a breakdown: headings, bullets, numbered lists, **bold**. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

function Breakdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-[11px] leading-relaxed text-gray-600 dark:text-white/60">
      {text.split("\n").map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return null;
        if (line.startsWith("# ")) return <div key={i} className="text-xs font-black text-gray-900 dark:text-white">{inline(line.slice(2))}</div>;
        if (line.startsWith("## "))
          return (
            <div key={i} className={`${sectionLabel} mt-2`}>
              {line.slice(3)}
            </div>
          );
        const bullet = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
        if (bullet)
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-gray-300 dark:text-white/25">•</span>
              <span>{inline(bullet[1])}</span>
            </div>
          );
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

/** Right-hand column for a reel: Claude's breakdown, then the frame strips it was written from. */
export function StudyDetails({ study }: { study: Study | null }) {
  if (!study) return <div className="text-[10px] text-gray-400">Loading the study…</div>;
  return (
    <>
      <div>
        <div className={`${sectionLabel} mb-2`}>Claude&apos;s breakdown</div>
        {study.breakdown ? (
          <Breakdown text={study.breakdown} />
        ) : (
          <p className="text-[11px] text-gray-400">Not written yet — the next Check inspo writes it.</p>
        )}
      </div>
      {study.strips.length > 0 && (
        <div>
          <div className={`${sectionLabel} mb-2`}>Frame strips (a frame every ~0.5 s) — click to open</div>
          <div className="flex flex-col gap-2">
            {study.strips.map((s, i) => (
              <a key={s} href={imageUrl("inspo", s)} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl("inspo", s)} alt={`Strip ${i + 1}`} className="w-full rounded border border-gray-100 dark:border-white/5" />
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
