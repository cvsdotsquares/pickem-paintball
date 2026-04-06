"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";

/** Same shape as leaderboard `bannerEvent` — live first, else first in sorted list. */
export type PromoBannerEventDoc = {
  id: string;
  name: string;
  status?: string;
  event_place?: string;
  year?: string;
  lockDate?: unknown;
  event_logo?: string;
  brand_color?: string | null;
  startDate?: string;
  endDate?: string;
  venue?: string;
  city?: string;
  eventNumber?: string;
  eventEndsAt?: unknown;
  nextPicksOpenAt?: unknown;
  nextEventImage?: string;
  nextEventName?: string;
  next_event_id?: string;
  next_brand_color?: string | null;
  eventDate?: string;
  nextEventDate?: string;
  eventLocation?: string;
  event_location?: string;
  nextEventLocation?: string;
  next_event_location?: string;
};

function sortEventsLikeLeaderboard(events: PromoBannerEventDoc[]): PromoBannerEventDoc[] {
  const eventsByYear = events
    .filter((e) => e.year !== "2024")
    .reduce(
      (acc, event) => {
        const year = event.year ?? "Unknown";
        if (!acc[year]) acc[year] = [];
        acc[year].push(event);
        return acc;
      },
      {} as Record<string, PromoBannerEventDoc[]>,
    );

  return Object.entries(eventsByYear)
    .sort(([yearA], [yearB]) => {
      const numA = parseInt(yearA) || 0;
      const numB = parseInt(yearB) || 0;
      return numB - numA;
    })
    .flatMap(([_, yearEvents]) =>
      yearEvents.sort((a, b) => {
        const placeA = parseInt(a.event_place ?? "0") || 0;
        const placeB = parseInt(b.event_place ?? "0") || 0;
        if (placeB !== placeA) return placeB - placeA;
        const la = a.lockDate as { seconds?: number } | null | undefined;
        const lb = b.lockDate as { seconds?: number } | null | undefined;
        if (la && lb && typeof la.seconds === "number" && typeof lb.seconds === "number") {
          return lb.seconds - la.seconds;
        }
        return 0;
      }),
    );
}

export function usePromoBannerEvent() {
  const [allEvents, setAllEvents] = useState<PromoBannerEventDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "events"));
        const events: PromoBannerEventDoc[] = querySnapshot.docs.map((doc) => {
          const id = doc.id;
          const yearFromId = id.split("_").pop() ?? new Date().getFullYear().toString();
          return {
            id,
            name: doc.get("name") || "Unnamed Event",
            status: doc.get("status") || "archived",
            event_place: doc.get("event_place") || "0",
            year: doc.get("year") || yearFromId,
            lockDate: doc.get("lockDate") || null,
            event_logo: doc.get("event_logo") || undefined,
            brand_color: doc.get("brand_color") ?? null,
            startDate: doc.get("startDate") || "",
            endDate: doc.get("endDate") || "",
            venue: doc.get("venue") || "",
            city: doc.get("city") || "",
            eventNumber:
              doc.get("eventNumber") != null ? String(doc.get("eventNumber")) : undefined,
            eventEndsAt: doc.get("eventEndsAt") ?? undefined,
            nextPicksOpenAt: doc.get("nextPicksOpenAt") ?? undefined,
            nextEventImage: doc.get("nextEventImage") || undefined,
            nextEventName: doc.get("nextEventName") || undefined,
            next_event_id: doc.get("next_event_id") || undefined,
            next_brand_color: doc.get("next_brand_color") ?? undefined,
            eventDate: doc.get("eventDate") || undefined,
            nextEventDate: doc.get("nextEventDate") || undefined,
            eventLocation: doc.get("eventLocation") || doc.get("event_location") || undefined,
            nextEventLocation: doc.get("nextEventLocation") || doc.get("next_event_location") || undefined,
          };
        });
        const sorted = sortEventsLikeLeaderboard(events);
        if (!cancelled) setAllEvents(sorted);
      } catch (e) {
        console.error("usePromoBannerEvent:", e);
        if (!cancelled) setAllEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bannerEvent = useMemo(() => {
    if (allEvents.length === 0) return null;
    return allEvents.find((e) => e.status === "live") ?? allEvents[0] ?? null;
  }, [allEvents]);

  return { bannerEvent, loading };
}
