"use client";

import { useCallback, useEffect, useState } from "react";
import { primaryButton } from "./types";

type Run = { id: string; status: "running" | "done" | "failed"; summary?: string; finishedAt?: string };

/** Starts the check-inspo job on this Mac and shows how it went. Calls onDone so the grid can refresh. */
export default function CheckInspoButton({ onDone }: { onDone: () => void }) {
  const [run, setRun] = useState<Run | null>(null);
  const [log, setLog] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [error, setError] = useState("");

  const poll = useCallback(async () => {
    const res = await fetch("/api/admin/jobs", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setRun(data.runs[0] ?? null);
    setLog(data.latestLog ?? "");
    return data.runs[0] as Run | undefined;
  }, []);

  useEffect(() => {
    poll();
  }, [poll]);

  useEffect(() => {
    if (run?.status !== "running") return;
    const t = setInterval(async () => {
      const latest = await poll();
      if (latest && latest.status !== "running") onDone();
    }, 3000);
    return () => clearInterval(t);
  }, [run?.status, poll, onDone]);

  const start = async () => {
    setError("");
    const res = await fetch("/api/admin/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job: "check-inspo" }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Could not start");
    else setRun(data.run);
  };

  const running = run?.status === "running";
  return (
    <div className="flex flex-col items-end gap-1">
      <button className={primaryButton} onClick={start} disabled={running}>
        {running ? "Checking inspo…" : "Check inspo"}
      </button>
      <div className="max-w-xs text-right text-[10px] text-gray-400 dark:text-white/40">
        {error && <span className="text-red-400">{error}</span>}
        {!error && running && "Claude is reading #social-media-inspo (about a minute)"}
        {!error && !running && run && (
          <span className={run.status === "failed" ? "text-red-400" : ""}>
            Last check: {run.summary || run.status}{" "}
          </span>
        )}
        {run && (
          <button className="underline" onClick={() => setShowLog((v) => !v)}>
            {showLog ? "hide log" : "log"}
          </button>
        )}
      </div>
      {showLog && (
        <pre className="max-h-60 w-[min(36rem,90vw)] overflow-auto whitespace-pre-wrap rounded-lg bg-black p-3 text-left text-[10px] text-white/70">
          {log || "(nothing yet)"}
        </pre>
      )}
    </div>
  );
}
