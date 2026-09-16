import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";

export type EventRecord = Record<string, unknown> & { id: string };

type MaybeTimestamp = { toDate?: () => Date; toMillis?: () => number } | undefined;

/** Milliseconds of an event's `lockDate`, or null when it has none. */
export function lockDateMs(event: EventRecord | null): number | null {
  const lock = (event as { lockDate?: MaybeTimestamp } | null)?.lockDate;
  const ms = lock?.toMillis?.();
  return typeof ms === "number" ? ms : null;
}

/**
 * Which event "now" belongs to: a live one, else the soonest whose picks are
 * still open, else whatever exists. Same rules the share card renders by — the
 * two must not drift, or a share gets logged against a different event than the
 * card it produced.
 */
export function selectCurrentEvent(raw: EventRecord[]): EventRecord | null {
  const live = raw.find((e) => (e as { status?: string }).status === "live");
  if (live) return live;

  const upcoming = raw
    .filter((e) => {
      const lock = (e as { lockDate?: MaybeTimestamp }).lockDate;
      return Boolean(lock?.toDate && lock.toDate() > new Date());
    })
    .sort((a, b) => {
      const la = (a as { lockDate?: MaybeTimestamp }).lockDate;
      const lb = (b as { lockDate?: MaybeTimestamp }).lockDate;
      return (la?.toMillis?.() ?? 0) - (lb?.toMillis?.() ?? 0);
    });

  return upcoming[0] ?? raw[0] ?? null;
}

/** An explicit id wins when it resolves; otherwise fall back to the current event. */
export async function resolveCurrentEvent(
  eventIdParam?: string | null,
): Promise<EventRecord | null> {
  if (eventIdParam) {
    const snap = await getDoc(doc(db, "events", eventIdParam));
    if (snap.exists()) return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }
  const all = await getDocs(collection(db, "events"));
  return selectCurrentEvent(
    all.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })),
  );
}
