export type PlayerStatus =
  | "Confirmed"
  | "Addition"
  | "Out"
  | "Dropped"
  | "Injured"
  | "Questionable"
  | "Unconfirmed";

export type StatusTone = "green" | "red" | "amber" | "grey";

export interface StatusMeta {
  label: string;
  tone: StatusTone;
  buttonClass: string;
  tickClass: string;
  tickGlyph: string;
}

const TONE_BUTTON: Record<StatusTone, string> = {
  green:
    "border-[#00f976] bg-[#00f976]/10 text-emerald-700 hover:bg-[#00f976]/18 dark:text-[#00e689] focus-visible:ring-[#00f976]",
  red:
    "border-red-500 bg-red-500/10 text-red-700 hover:bg-red-500/18 dark:text-red-300 focus-visible:ring-red-500",
  amber:
    "border-amber-500 bg-amber-500/10 text-amber-700 hover:bg-amber-500/18 dark:text-amber-300 focus-visible:ring-amber-500",
  grey:
    "border-gray-400 bg-gray-400/10 text-gray-700 hover:bg-gray-400/18 dark:text-gray-300 focus-visible:ring-gray-400",
};

const TONE_TICK: Record<StatusTone, string> = {
  green: "bg-[#00f976] text-black",
  red: "bg-red-500 text-white",
  amber: "bg-amber-500 text-black",
  grey: "bg-gray-400 text-white",
};

function build(label: string, tone: StatusTone, tickGlyph: string): StatusMeta {
  return {
    label,
    tone,
    buttonClass: TONE_BUTTON[tone],
    tickClass: TONE_TICK[tone],
    tickGlyph,
  };
}

export const STATUS_META: Record<PlayerStatus, StatusMeta> = {
  Confirmed: build("Confirmed", "green", "✓"),
  Addition: build("Addition", "green", "＋"),
  Out: build("Out", "red", "✕"),
  Dropped: build("Dropped", "red", "✕"),
  Injured: build("Injured", "amber", "!"),
  Questionable: build("Questionable", "amber", "?"),
  Unconfirmed: build("Unconfirmed", "grey", "?"),
};

export const STATUS_BUTTON_BASE_CLASS =
  "inline-flex shrink-0 items-center justify-center rounded-md border px-1.5 pt-[3px] pb-[1px] font-azonix text-[8px] font-bold uppercase tracking-wide leading-none";

export function shouldShowStatusPill(status: unknown): status is PlayerStatus {
  return isPlayerStatus(status);
}

export const STATUS_TICK_BASE_CLASS =
  "inline-flex items-center justify-center rounded-full font-black leading-none shadow-sm pt-[1px]";

export const STATUSES_TRIGGERING_NOTIFICATION: PlayerStatus[] = [
  "Out",
  "Dropped",
  "Injured",
  "Questionable",
  "Addition",
];

export const STATUSES_FOR_DASHBOARD_TABLE: PlayerStatus[] = [
  "Out",
  "Dropped",
  "Injured",
  "Questionable",
  "Addition",
];

export function isPlayerStatus(value: unknown): value is PlayerStatus {
  return typeof value === "string" && value in STATUS_META;
}

export function getStatusMeta(value: unknown): StatusMeta | null {
  return isPlayerStatus(value) ? STATUS_META[value] : null;
}
