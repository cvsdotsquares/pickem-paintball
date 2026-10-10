import { NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
// CommonJS, shared with the Cloud Functions — the same career code the NXL page uses.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { proCareer } = require("@/functions/proCareer");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadHistory } = require("@/functions/nxlEventsStore");

export const dynamic = "force-dynamic";

/**
 * GET /api/career/pro?playerId=… — a player's pro career in three views (All / NXL / PSP).
 *
 * ⚠️ PRIVATE UNTIL RELEASED. PSP history (2003-2015) is scheduled for January; until then
 * this answers only accounts listed in PRO_CAREER_PREVIEW_EMAILS, checked server-side
 * against a verified Firebase ID token. Everyone else gets a 404, so the page renders
 * exactly as it does today. James turns it on for everyone by setting
 * PRO_CAREER_PUBLIC=true — nothing else changes.
 *
 * Computed on request rather than stored, so building this writes nothing to production:
 * `playerSummaries` is read, never rebuilt.
 */

function ensureAdmin(): boolean {
  if (getApps().length > 0) return true;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  try {
    if (privateKey && clientEmail && projectId) {
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") }) });
    } else if (projectId && process.env.NODE_ENV !== "production") {
      // Localhost has no service-account key; the machine's own Google sign-in (ADC) is
      // what the repo's scripts already use.
      initializeApp({ projectId });
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const isPublic = () => process.env.PRO_CAREER_PUBLIC === "true";
const previewEmails = () =>
  (process.env.PRO_CAREER_PREVIEW_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** Not "forbidden": to anyone outside the preview, this feature does not exist yet. */
const hidden = () => NextResponse.json({ error: "Not found" }, { status: 404 });

let historyCache: { at: number; history: unknown } | null = null;
const HISTORY_TTL_MS = 10 * 60 * 1000; // the live crawler writes nxlEvents every 10 min

export async function GET(request: Request) {
  if (!ensureAdmin()) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  if (!isPublic()) {
    const auth = request.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return hidden();
    try {
      const decoded = await getAuth().verifyIdToken(auth.slice("Bearer ".length));
      const email = String(decoded.email ?? "").toLowerCase();
      if (!decoded.email_verified || !previewEmails().includes(email)) return hidden();
    } catch {
      return hidden();
    }
  }

  const playerId = new URL(request.url).searchParams.get("playerId");
  if (!playerId) return NextResponse.json({ error: "playerId required" }, { status: 400 });

  try {
    const db = getFirestore();
    const snap = await db.collection("playerSummaries").doc(playerId).get();
    if (!snap.exists) return NextResponse.json({ error: "No such player" }, { status: 404 });
    const s = snap.data() as {
      leagueId?: string | number | null;
      nxl?: { leagueId?: string | null } | null;
      appearances?: { eventId: string; kind: string }[];
    };

    /* The ids the summary was built with: numeric league id, or "epid:…" for a player with no photo. */
    const stored = s.nxl?.leagueId ?? null;
    const epid = typeof stored === "string" && stored.startsWith("epid:") ? stored.slice(5) : null;
    const leagueId = s.leagueId ?? (epid ? null : stored);
    /* Same absence rule as the stored NXL career (playerSummaries.js). */
    const absentEventIds = new Set((s.appearances ?? []).filter((a) => a.kind !== "played").map((a) => a.eventId));

    if (!historyCache || Date.now() - historyCache.at > HISTORY_TTL_MS) {
      historyCache = { at: Date.now(), history: await loadHistory(db) };
    }
    const views = proCareer(historyCache.history, leagueId, { epid, absentEventIds });
    return NextResponse.json({ views, defaultView: "all" });
  } catch (err) {
    console.error("[career/pro] failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
