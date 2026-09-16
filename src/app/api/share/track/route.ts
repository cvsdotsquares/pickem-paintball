import { db } from "@/src/lib/firebaseClient";
import { addDoc, collection, doc, getDoc } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";
import { lockDateMs, resolveCurrentEvent } from "@/src/lib/currentEvent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/share/track — one row in `shareEvents` per finished share attempt.
 *
 * Deliberately server-side: the uid comes from the opaque shareId's mapping
 * (never from the request body), and `phase` is computed from the event's
 * lockDate against the server clock, so a wrong device clock can't file a share
 * on the wrong side of the lock.
 *
 * Fired when the outcome is KNOWN, not on click — `dismissed` is the signal for
 * "opened the share sheet and backed out", which is what separates a real share
 * from a button press.
 */

/** `shared` counts the desktop path too: a downloaded card / copied link is a share. */
const OUTCOMES = ["shared", "dismissed", "failed"] as const;
/** How the card left the app (`unknown` when it failed before either path). */
const METHODS = ["native", "download", "unknown"] as const;
/** Which screen the button was on. */
const SURFACES = ["dashboard", "pick-em", "leaderboard", "post-event"] as const;

type Outcome = (typeof OUTCOMES)[number];
type Method = (typeof METHODS)[number];
type Surface = (typeof SURFACES)[number];

const oneOf = <T extends readonly string[]>(list: T, v: unknown): T[number] | null =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : null;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const shareId = typeof body.shareId === "string" ? body.shareId : "";
  const outcome = oneOf(OUTCOMES, body.outcome) as Outcome | null;
  const method = oneOf(METHODS, body.method) as Method | null;
  const surface = oneOf(SURFACES, body.surface) as Surface | null;

  if (!shareId || !outcome || !method || !surface) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }

  // The client only ever holds the opaque id; the uid is ours to look up.
  const mapping = await getDoc(doc(db, "shareCards", shareId));
  if (!mapping.exists()) {
    return NextResponse.json({ error: "unknown shareId" }, { status: 404 });
  }
  const uid = (mapping.get("userId") as string) || "";

  const event = await resolveCurrentEvent(null);
  const lockMs = lockDateMs(event);
  const now = Date.now();

  await addDoc(collection(db, "shareEvents"), {
    uid,
    shareId,
    eventId: event?.id ?? null,
    outcome,
    method,
    surface,
    // null when the event has no lockDate — reported separately rather than
    // silently lumped in with "after".
    phase: lockMs == null ? null : now < lockMs ? "before_lock" : "after_lock",
    lockDateMs: lockMs,
    createdAt: now,
  });

  return NextResponse.json({ ok: true });
}
