"use client";

import { useEffect, useState } from "react";
import { pillFor, toneClass, type Stage } from "./generatorTypes";

/**
 * "Working." → ".." → "..." then the minutes this run has been going ("2 min"), round and round
 * (James, 17 Oct). The pill keeps one width the whole time.
 */
function Working({ since }: { since?: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  const step = tick % 5; // 0–2 dots, 3–4 the time (shown for a second)
  if (since && step >= 3) {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
    return <>{mins < 1 ? "<1 min" : `${mins} min`}</>;
  }
  return (
    <span>
      Working<span className="inline-block w-[1.1em] text-left">{".".repeat((step % 3) + 1)}</span>
    </span>
  );
}

/** Status pill: orange = your turn, green = done, red = stopped, blue = Claude is working. */
export default function StagePill({
  stage,
  running,
  failed,
  since,
  finalMade,
  big,
}: {
  stage: Stage;
  running: boolean;
  failed: boolean;
  since?: string;
  finalMade?: boolean;
  big?: boolean;
}) {
  const p = pillFor(stage, running, failed, finalMade);
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full font-bold ${big ? "px-3 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]"} ${
        running ? `justify-center ${big ? "w-[92px]" : "w-[80px]"}` : ""
      } ${toneClass(p.tone)}`}
    >
      {running ? <Working since={since} /> : p.label}
    </span>
  );
}
