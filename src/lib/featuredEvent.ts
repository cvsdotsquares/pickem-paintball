import { collection, getDocs } from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";
import { eventRecordToBannerModel } from "@/src/lib/eventCountdownBannerModel";
import type { EventCountdownBannerModel } from "@/src/components/Dashboard/EventCountdownBanner";

type EventRecord = Record<string, unknown> & { id: string };

/**
 * Last successfully-selected featured event, kept in module memory so client-side
 * navigations between dashboard routes don't blank the banner while it refetches.
 * Cleared automatically on full page reload (fresh JS bundle).
 */
let cachedFeaturedEvent: EventCountdownBannerModel | null = null;

/** Synchronous read for initial render — avoids the "no banner" flash on navigation. */
export function getCachedFeaturedEvent(): EventCountdownBannerModel | null {
  return cachedFeaturedEvent;
}

/**
 * Prime the cache from another dashboard route that has already loaded the events list
 * (leaderboard / stats), so navigating to the dashboard home renders the banner instantly.
 * Ignores null so a route can't blank the cache for everyone else.
 */
export function setCachedFeaturedEvent(event: EventCountdownBannerModel | null): void {
  if (event) cachedFeaturedEvent = event;
}

/** Same selection rules as before: live → soonest upcoming (future lock) → first doc. */
function selectFeaturedRecord(raw: EventRecord[]): EventRecord | null {
  const live = raw.find((e) => (e as { status?: string }).status === "live");
  if (live) return live;

  const upcoming = raw
    .filter((e) => {
      const lock = (e as { lockDate?: { toDate?: () => Date } }).lockDate;
      return Boolean(lock?.toDate && lock.toDate() > new Date());
    })
    .sort((a, b) => {
      const la = (a as { lockDate?: { toMillis?: () => number } }).lockDate;
      const lb = (b as { lockDate?: { toMillis?: () => number } }).lockDate;
      return (la?.toMillis?.() ?? 0) - (lb?.toMillis?.() ?? 0);
    });
  if (upcoming[0]) return upcoming[0];

  return raw[0] ?? null;
}

/**
 * Fetch the dashboard's featured event, retrying a few times on transient failures.
 * On total failure (or an empty collection) the last-known event is returned, so an
 * already-visible banner is never blanked by a flaky read.
 *
 * The returned model keeps all timestamps (lockDate / eventEndsAt / nextPicksOpenAt)
 * intact, so the banner's clock-driven phase transitions keep working exactly as
 * before — this only changes *whether/when* data is available, not how phase is derived.
 */
export async function fetchFeaturedEvent(
  retries = 2,
): Promise<EventCountdownBannerModel | null> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const snap = await getDocs(collection(db, "events"));
      const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as EventRecord[];
      const selected = selectFeaturedRecord(raw);
      if (selected) {
        cachedFeaturedEvent = eventRecordToBannerModel(selected);
      }
      // Empty collection: keep whatever we already had rather than blanking.
      return cachedFeaturedEvent;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }
  console.error("fetchFeaturedEvent failed after retries:", lastErr);
  return cachedFeaturedEvent;
}
