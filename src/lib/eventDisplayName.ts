/**
 * Stats page event nav only: canonical label `Location - YY` (two-digit year).
 * Do not use for header banner, leaderboard, or other routes — those use raw `event.name`.
 */

/**
 * Short location labels for known event IDs.
 *
 * Unlisted events fall through to the cleaned `name`, which works — but pinning them
 * here keeps the label stable if someone edits an event's name in Firestore.
 */
export const EVENT_LOCATION_SHORT_LABEL_BY_EVENT_ID: Record<string, string> = {
  // 2025
  tampa_bay_open_2025: "Tampa Bay",
  atlantic_city_2025: "Atlantic City",
  midwest_open_2025: "Mid West",
  lonestar_open_2025: "Lone Star",
  world_cup_2025: "World Cup",
  // 2026
  tampa_bay_2026: "Tampa Bay",
  mid_atlantic_open_2026: "Mid Atlantic",
  mid_west_open_2026: "Mid West",
};

export function toTwoDigitYear(year: string | number | undefined | null): string {
  if (year == null || year === "") return "";
  const s = String(year).trim();
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return s.slice(-2).padStart(2, "0");
  const yy = n >= 100 ? n % 100 : n;
  return String(yy).padStart(2, "0");
}

function yearSuffixFromEventId(id: string): string | undefined {
  const last = id.split("_").pop();
  if (last && /^\d{4}$/.test(last)) return last;
  return undefined;
}

/** Remove trailing year fragments from a stored name so we can rebuild `Location - YY`. */
function stripYearSuffixFromName(name: string): string {
  return name
    .replace(/\s*[-\u2013\u2014]\s*\d{2,4}\s*$/, "")
    .replace(/\s*\((\d{2,4})\)\s*$/, "")
    .replace(/\s+\d{4}\s*$/, "")
    .replace(/\s+'\d{2}\s*$/, "")
    .trim();
}

/**
 * Strip whole words often copied from NXL titles in uploaded Firestore `name` values
 * (not part of the short location we show in `Location - YY`).
 */
function stripOpenAndMajorWords(name: string): string {
  return name
    .replace(/\b(OPEN|MAJOR)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize raw uploaded `name` before deriving the location segment. */
function normalizeLocationFromUploadedEventName(name: string): string {
  return stripOpenAndMajorWords(stripYearSuffixFromName(name));
}

export type IndividualEventDisplayInput = {
  id: string;
  name?: string;
  year?: string;
};

/**
 * The location segment alone — "Mid West", "World Cup". Prefer the ID map, else the
 * cleaned `name`, else the id.
 */
export function eventLocationLabel(event: IndividualEventDisplayInput): string {
  return (
    EVENT_LOCATION_SHORT_LABEL_BY_EVENT_ID[event.id] ??
    (normalizeLocationFromUploadedEventName(event.name?.trim() || "") ||
      event.id.replace(/_/g, " "))
  );
}

/**
 * Very short axis label: `MW 26`. Initials come from the canonical location, not the
 * raw stored name — otherwise "Midwest Open 2025" and "Mid West Open" yield different
 * initials ("M" vs "MW") for what is the same event location.
 */
export function eventAxisLabel(event: IndividualEventDisplayInput): string {
  const yy = toTwoDigitYear(event.year ?? yearSuffixFromEventId(event.id)) || "??";
  const initials = eventLocationLabel(event)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);
  return `${initials || "EV"} ${yy}`;
}

/**
 * User-facing label: `[location] - [YY]`. Prefer known ID map, else cleaned `name`, else id.
 */
export function individualEventDisplayName(event: IndividualEventDisplayInput): string {
  const yy =
    toTwoDigitYear(event.year ?? yearSuffixFromEventId(event.id)) || "??";
  return `${eventLocationLabel(event)} - ${yy}`;
}
