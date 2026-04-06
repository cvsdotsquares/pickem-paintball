import type { EventCountdownBannerModel } from "@/src/components/Dashboard/EventCountdownBanner";
import { getBannerAccentColor } from "@/src/lib/bannerPhase";

/** Same defaults as Live Pick’em when Firestore omits venue/city — keeps CTA banner copy consistent on every dashboard route. */
const DEFAULT_BANNER_VENUE = "RAYMOND JAMES STADIUM";
const DEFAULT_BANNER_CITY = "TAMPA, FLORIDA";

function toDateOrNull(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  const ts = v as { toDate?: () => Date };
  if (typeof ts.toDate === "function") return ts.toDate();
  return null;
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

/** Map a Firestore event doc (or `{ id, ...data }`) to the dashboard countdown banner model. */
export function eventRecordToBannerModel(
  e: Record<string, unknown> & { id: string },
): EventCountdownBannerModel {
  const rawVenue = typeof e.venue === "string" ? e.venue.trim() : "";
  const rawCity = typeof e.city === "string" ? e.city.trim() : "";

  const brandColor =
    (typeof e.brand_color === "string" && e.brand_color) ||
    (typeof e.brandColor === "string" && e.brandColor) ||
    "#b91c1c";
  const nextBrandColor =
    strOrNull(e.next_brand_color) ?? strOrNull(e.nextBrandColor);
  const logoUrl =
    (typeof e.event_logo === "string" && e.event_logo) ||
    (typeof e.logoUrl === "string" && e.logoUrl) ||
    null;

  return {
    id: e.id,
    name: (e.name as string) || "EVENT",
    brandColor,
    logoUrl,
    eventNumber: String(e.eventNumber ?? "1"),
    startDate: (e.startDate as string) || "",
    endDate: (e.endDate as string) || "",
    lockDate: toDateOrNull(e.lockDate),
    eventEndsAt: toDateOrNull(e.eventEndsAt),
    nextPicksOpenAt: toDateOrNull(e.nextPicksOpenAt),
    nextEventImage:
      typeof e.nextEventImage === "string" && e.nextEventImage.trim()
        ? e.nextEventImage.trim()
        : null,
    nextEventName: strOrNull(e.nextEventName) ?? strOrNull(e.next_event_name),
    nextEventId: strOrNull(e.next_event_id) ?? strOrNull(e.nextEventId),
    nextBrandColor,
    eventDate: strOrNull(e.eventDate),
    nextEventDate: strOrNull(e.nextEventDate),
    eventLocation: strOrNull(e.eventLocation) ?? strOrNull(e.event_location),
    nextEventLocation: strOrNull(e.nextEventLocation) ?? strOrNull(e.next_event_location),
    venue: rawVenue || DEFAULT_BANNER_VENUE,
    city: rawCity || DEFAULT_BANNER_CITY,
  };
}

/** Accent color for CTAs outside `EventCountdownBanner` (same rules as the banner). */
export function getBannerAccentFromRecord(
  e: Record<string, unknown> & { id: string },
  nowMs: number = Date.now(),
): string {
  const m = eventRecordToBannerModel(e);
  return getBannerAccentColor(
    {
      lockDate: m.lockDate,
      eventEndsAt: m.eventEndsAt ?? null,
      nextPicksOpenAt: m.nextPicksOpenAt ?? null,
      brandColor: m.brandColor,
      nextBrandColor: m.nextBrandColor,
    },
    nowMs,
  );
}
