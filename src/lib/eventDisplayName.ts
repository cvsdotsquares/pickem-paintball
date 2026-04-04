/**
 * Stats page event nav only: canonical label `Location - YY` (two-digit year).
 * Do not use for header banner, leaderboard, or other routes — those use raw `event.name`.
 */

/** Short location labels for known event IDs — must match season aggregate column keys where applicable. */
export const EVENT_LOCATION_SHORT_LABEL_BY_EVENT_ID: Record<string, string> = {
  tampa_bay_2025: "Tampa Bay",
  world_cup_2025: "World Cup",
  lonestar_open_2025: "Lone Star",
  midwest_open_2025: "Mid West",
  atlantic_city_2025: "Atlantic City",
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
 * User-facing label: `[location] - [YY]`. Prefer known ID map, else cleaned `name`, else id.
 */
export function individualEventDisplayName(event: IndividualEventDisplayInput): string {
  const yy =
    toTwoDigitYear(event.year ?? yearSuffixFromEventId(event.id)) || "??";
  const location =
    EVENT_LOCATION_SHORT_LABEL_BY_EVENT_ID[event.id] ??
    (normalizeLocationFromUploadedEventName(event.name?.trim() || "") ||
      event.id.replace(/_/g, " "));
  return `${location} - ${yy}`;
}
