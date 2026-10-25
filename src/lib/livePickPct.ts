import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";

/**
 * How often a player is being picked for the event whose picks are open right now.
 *
 * Read from `events/{id}/summaries/pickPctLive`, which `refreshLivePickPct` (functions/
 * pickPct.js) rewrites every hour until the lock. A career page's own rows only cover
 * events that have produced kills, so without this the event everyone is picking for is
 * invisible on the page until it is over. After the lock the frozen number takes over in
 * the career rows and this returns null.
 */
export type LivePickPct = {
  eventId: string;
  eventName: string;
  pickPct: number;
  captainPct: number;
  entries: number;
  updatedAt: Date | null;
};

export async function fetchLivePickPct(playerId: string): Promise<LivePickPct | null> {
  const live = await getDocs(query(collection(db, "events"), where("status", "==", "live")));
  const now = Date.now();
  const open = live.docs.find((d) => {
    const lock = d.get("lockDate");
    return lock && lock.toDate().getTime() > now;
  });
  if (!open) return null;
  const snap = await getDoc(doc(db, `events/${open.id}/summaries/pickPctLive`));
  if (!snap.exists() || snap.get("open") !== true) return null;
  const mine = (snap.get("players") || {})[playerId];
  if (!mine) return null; // not on this event's roster
  return {
    eventId: open.id,
    eventName: open.get("name") || open.id,
    pickPct: mine.pickPct ?? 0,
    captainPct: mine.captainPct ?? 0,
    entries: snap.get("entries") ?? 0,
    updatedAt: snap.get("updatedAt")?.toDate?.() ?? null,
  };
}
