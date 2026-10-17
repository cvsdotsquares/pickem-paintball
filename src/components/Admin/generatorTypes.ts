// Client-side copies of the shapes in src/lib/admin/generator.ts (that module reads the disk).

export type Stage =
  | "not_started"
  | "brief"
  | "brief_approved"
  | "options"
  | "chosen"
  | "ready"
  | "feedback"
  | "signed_off";

export type Status = {
  stage: Stage;
  round: number;
  chosen: string;
  current: string;
  updated: string;
  history: { at: string; stage: string; note: string }[];
};

export type PackItem = { key: string; label: string; phase: string; priority: "must" | "nice"; tags: string[] };
export type RoundFile = { label: string; png: string; pdf: string; caption: string };
export type Round = { name: string; options: RoundFile[]; post: RoundFile | null; notes: string; review: string; checks: string[] };
export type Busy = { label: string; params: { event?: string; type?: string } } | null;

export const genUrl = (rel: string) => `/api/admin/genfile?path=${encodeURIComponent(rel)}`;

/** Plain words for each stage, as James sees them. */
export const STAGE: Record<Stage, { label: string; tone: "grey" | "yellow" | "blue" | "green" }> = {
  not_started: { label: "Not started", tone: "grey" },
  brief: { label: "Brief ready for you", tone: "yellow" },
  brief_approved: { label: "Making options", tone: "blue" },
  options: { label: "Pick an option", tone: "yellow" },
  chosen: { label: "Reviewing + polishing", tone: "blue" },
  ready: { label: "Ready for you", tone: "yellow" },
  feedback: { label: "Applying your feedback", tone: "blue" },
  signed_off: { label: "Signed off", tone: "green" },
};

export const toneClass = (tone: string) =>
  ({
    grey: "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40",
    yellow: "bg-yellow-400/15 text-yellow-700 dark:text-yellow-400",
    blue: "bg-[#1a3c6e]/10 text-[#1a3c6e] dark:bg-white/10 dark:text-white/70",
    green: "bg-green-500/10 text-green-600 dark:text-green-400",
  })[tone] ?? "";
