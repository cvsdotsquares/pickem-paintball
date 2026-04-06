/**
 * Derived CTA banner phase from event timestamps (clock-driven; no cron).
 * See plan: picks_live → event_live (hidden) → event_break → picks_live (new cycle / doc).
 */

export type BannerPhase = "picks_live" | "event_live" | "event_break";

export type BannerPhaseInputs = {
  lockDate: Date | null;
  eventEndsAt: Date | null;
  nextPicksOpenAt: Date | null;
};

/**
 * @param nowMs - Current time (usually Date.now())
 */
export function getBannerPhase(nowMs: number, input: BannerPhaseInputs): BannerPhase {
  const { lockDate, eventEndsAt, nextPicksOpenAt } = input;

  if (!lockDate) {
    return "picks_live";
  }

  const t = nowMs;
  const lockMs = lockDate.getTime();
  if (t < lockMs) {
    return "picks_live";
  }

  // t >= lock — if no event end, keep legacy “post-lock” banner (countdown at zero)
  if (!eventEndsAt) {
    return "picks_live";
  }

  const endMs = eventEndsAt.getTime();
  if (t < endMs) {
    return "event_live";
  }

  // t >= eventEndsAt
  if (nextPicksOpenAt && t < nextPicksOpenAt.getTime()) {
    return "event_break";
  }

  return "picks_live";
}

/** Inputs for CTA + logo-panel accent color (current event vs next event during Event Break). */
export type BannerAccentInputs = BannerPhaseInputs & {
  brandColor?: string | null;
  nextBrandColor?: string | null;
};

/**
 * Uses `brandColor` normally; during **event_break** uses `nextBrandColor` when set
 * (so the button and left panel match the next event’s art).
 */
export function getBannerAccentColor(input: BannerAccentInputs, nowMs: number = Date.now()): string {
  const phase = getBannerPhase(nowMs, {
    lockDate: input.lockDate,
    eventEndsAt: input.eventEndsAt,
    nextPicksOpenAt: input.nextPicksOpenAt,
  });
  if (phase === "event_break") {
    const next = input.nextBrandColor?.trim();
    if (next) return next;
  }
  return input.brandColor?.trim() || "#b91c1c";
}
