import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { previewGate } from "@/src/lib/proCareerGate";
// CommonJS, shared with the Cloud Functions — the same career code the NXL page uses.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { proCareer } = require("@/functions/proCareer");
import { nxlHistoryCached } from "@/src/lib/proCareerData";

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


export async function GET(request: Request) {
  const blocked = await previewGate(request);
  if (blocked) return blocked;

  const playerId = new URL(request.url).searchParams.get("playerId");
  if (!playerId) return NextResponse.json({ error: "playerId required" }, { status: 400 });

  try {
    const db = getFirestore();
    const snap = await db.collection("playerSummaries").doc(playerId).get();
    if (!snap.exists) return NextResponse.json({ error: "No such player" }, { status: 404 });
    const s = snap.data() as {
      leagueId?: string | number | null;
      nxl?: { leagueId?: string | null } | null;
      /* PickEm appearances, each with its participation verdict (`kind`). */
      events?: { eventId: string; kind: string }[];
    };

    /* The ids the summary was built with: numeric league id, or "epid:…" for a player with no photo. */
    const stored = s.nxl?.leagueId ?? null;
    const epid = typeof stored === "string" && stored.startsWith("epid:") ? stored.slice(5) : null;
    const leagueId = s.leagueId ?? (epid ? null : stored);
    /* Same absence rule as the stored NXL career (playerSummaries.js). */
    const absentEventIds = new Set((s.events ?? []).filter((a) => a.kind !== "played").map((a) => a.eventId));

    const views = proCareer(await nxlHistoryCached(db), leagueId, { epid, absentEventIds });
    return NextResponse.json({ views, defaultView: "all" });
  } catch (err) {
    console.error("[career/pro] failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
