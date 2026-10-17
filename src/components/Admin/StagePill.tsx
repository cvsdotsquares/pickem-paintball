"use client";

import { useEffect, useState } from "react";
import { pillFor, toneClass, type Stage } from "./generatorTypes";

/** "Working..." with the dots going round, then how many minutes this run has been going (James, 17 Oct). */
function Working({ since }: { since?: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  const mins = since ? Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000)) : null;
  return (
    <>
      Working
      <span className="inline-block w-[1.1em] text-left">{".".repeat((tick % 3) + 1)}</span>
      {mins !== null && <span className="opacity-80">{mins < 1 ? "<1 min" : `${mins} min`}</span>}
    </>
  );
}

/** Status pill: orange = your turn, green = done, red = stopped, blue = Claude is working. */
export default function StagePill({
  stage,
  running,
  failed,
  since,
  big,
}: {
  stage: Stage;
  running: boolean;
  failed: boolean;
  since?: string;
  big?: boolean;
}) {
  const p = pillFor(stage, running, failed);
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full font-bold ${big ? "px-3 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]"} ${toneClass(p.tone)}`}
    >
      {running ? <Working since={since} /> : p.label}
    </span>
  );
}
