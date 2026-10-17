"use client";

import { pillFor, toneClass, type Stage } from "./generatorTypes";

/** Status pill: orange = your turn, green = done, red = stopped, blue (spinning) = Claude is working. */
export default function StagePill({ stage, running, failed, big }: { stage: Stage; running: boolean; failed: boolean; big?: boolean }) {
  const p = pillFor(stage, running, failed);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold ${big ? "px-3 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]"} ${toneClass(p.tone)}`}
    >
      {p.spin && <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
      {p.label}
    </span>
  );
}
