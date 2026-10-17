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

export const genUrl = (rel: string, thumb = false) =>
  `/api/admin/genfile?path=${encodeURIComponent(rel)}${thumb ? "&thumb=1" : ""}`;
export type Preview = { kind: "final" | "current" | "options" | "none"; images: string[] };

/**
 * Plain words for each stage. Colours (James, 17 Oct): orange = your turn, green = done, red = something
 * went wrong, blue = Claude is working, grey = not started.
 */
export type Tone = "grey" | "orange" | "blue" | "green" | "red";
export const STAGE: Record<Stage, { label: string; tone: Tone }> = {
  not_started: { label: "Not started", tone: "grey" },
  brief: { label: "Brief ready for you", tone: "orange" },
  brief_approved: { label: "Making rough layouts", tone: "blue" },
  options: { label: "Pick a layout", tone: "orange" },
  chosen: { label: "Building the final version", tone: "blue" },
  ready: { label: "Ready for you", tone: "orange" },
  feedback: { label: "Applying your feedback", tone: "blue" },
  signed_off: { label: "Templated", tone: "green" },
};

/** The pill to show: working beats the stage; a failed last run shows red. */
export function pillFor(stage: Stage, running: boolean, failed: boolean): { label: string; tone: Tone; spin: boolean } {
  if (running) return { label: "Claude is working", tone: "blue", spin: true };
  if (failed) return { label: "Stopped — open to retry", tone: "red", spin: false };
  const st = STAGE[stage] ?? STAGE.not_started;
  return { ...st, spin: false };
}

export const toneClass = (tone: string) =>
  ({
    grey: "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40",
    orange: "bg-orange-500 text-white",
    blue: "bg-[#1a3c6e] text-white",
    red: "bg-red-500 text-white",
    green: "bg-green-600 text-white",
  })[tone] ?? "";

export type Finals = {
  ready: boolean;
  madeAt: string;
  test: boolean;
  single: boolean; // one post for the whole event (builder sets EVENT_LEVEL = True), not one per team
  source: string;
  posts: { team: string; name: string; png: string; pdf: string }[];
  teams: { key: string; name: string }[];
};

/** One graphic on the board / post-type page (a post type can hold several: key = <base> or <base>__2 …). */
export type GraphicRow = PackItem & {
  base: string;
  name: string; // James's name for it ("" until named)
  display: string; // name, or "<post type> #n"
  status: Status;
  running: boolean;
  failed: boolean;
  preview: Preview;
};
