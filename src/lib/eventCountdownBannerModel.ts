import type { EventCountdownBannerModel } from "@/src/components/Dashboard/EventCountdownBanner";

/** Same defaults as Live Pick’em when Firestore omits venue/city — keeps CTA banner copy consistent on every dashboard route. */
const DEFAULT_BANNER_VENUE = "RAYMOND JAMES STADIUM";
const DEFAULT_BANNER_CITY = "TAMPA, FLORIDA";

function toLockDate(lock: unknown): Date | null {
  if (lock == null) return null;
  if (lock instanceof Date) return lock;
  const ts = lock as { toDate?: () => Date };
  if (typeof ts.toDate === "function") return ts.toDate();
  return null;
}

/** Map a Firestore event doc (or `{ id, ...data }`) to the dashboard countdown banner model. */
export function eventRecordToBannerModel(
  e: Record<string, unknown> & { id: string },
): EventCountdownBannerModel {
  const rawVenue = typeof e.venue === "string" ? e.venue.trim() : "";
  const rawCity = typeof e.city === "string" ? e.city.trim() : "";

  return {
    id: e.id,
    name: (e.name as string) || "EVENT",
    brandColor: (e.brand_color as string) || "#b91c1c",
    logoUrl: (e.event_logo as string) || null,
    eventNumber: String(e.eventNumber ?? "1"),
    startDate: (e.startDate as string) || "",
    endDate: (e.endDate as string) || "",
    lockDate: toLockDate(e.lockDate),
    venue: rawVenue || DEFAULT_BANNER_VENUE,
    city: rawCity || DEFAULT_BANNER_CITY,
  };
}
