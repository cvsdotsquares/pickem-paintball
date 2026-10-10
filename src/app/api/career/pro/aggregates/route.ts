import { NextResponse } from "next/server";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { previewGate } from "@/src/lib/proCareerGate";
import { nxlHistoryCached } from "@/src/lib/proCareerData";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { proTable, proLeaders } = require("@/functions/proCareer");

export const dynamic = "force-dynamic";

/**
 * GET /api/career/pro/aggregates?part=table&view=all|nxl|psp — the all-time table
 * GET /api/career/pro/aggregates?part=leaders                 — the landing "Career stats" row
 *
 * The preview versions of `aggregates/allTime` and `aggregates/spotlight.allTimeLeaders`,
 * with PSP (2003-2015) in. Same gate as `/api/career/pro`: preview accounts only until
 * PRO_CAREER_PUBLIC=true, 404 for everyone else. Read-only — nothing is written.
 */

type Pickem = {
  playerId: string;
  leagueId: string | null;
  epid: string | null;
  absentEventIds: Set<string>;
  name: string;
  currentTeam: string;
  number: unknown;
  imgUrl: string | null;
  playedCount: number;
  totalKills: number;
  avgKills: number;
};

let pickemCache: { at: number; pickem: Pickem[]; allTimeRows: Record<string, unknown>[] } | null = null;
/**
 * An hour, and only the fields used. Reading the whole collection took 26s (each summary
 * carries every match); these fields take ~8s, once. Summaries only change when the
 * projection is rebuilt, so an hour is safe. At release this table should be built ahead of
 * time into an aggregate like `aggregates/allTime`, which makes it a single read.
 */
const TTL_MS = 60 * 60 * 1000;
const FIELDS = ["leagueId", "nxl.leagueId", "events", "name", "currentTeam", "number", "imgUrl", "playedCount", "totalKills", "avgKills"];

async function loadPickem(db: Firestore) {
  if (pickemCache && Date.now() - pickemCache.at < TTL_MS) return pickemCache;
  const [snap, allTime] = await Promise.all([db.collection("playerSummaries").select(...FIELDS).get(), db.doc("aggregates/allTime").get()]);
  const pickem: Pickem[] = snap.docs.map((d) => {
    const s = d.data();
    const stored = s.nxl?.leagueId ?? null;
    const epid = typeof stored === "string" && stored.startsWith("epid:") ? stored.slice(5) : null;
    return {
      playerId: d.id,
      leagueId: s.leagueId != null ? String(s.leagueId) : epid ? null : stored,
      epid,
      absentEventIds: new Set(((s.events ?? []) as { eventId: string; kind: string }[]).filter((a) => a.kind !== "played").map((a) => a.eventId)),
      name: s.name,
      currentTeam: s.currentTeam ?? "",
      number: s.number ?? null,
      imgUrl: s.imgUrl ?? null,
      playedCount: s.playedCount ?? 0,
      totalKills: s.totalKills ?? 0,
      avgKills: s.avgKills ?? 0,
    };
  });
  pickemCache = { at: Date.now(), pickem, allTimeRows: (allTime.data()?.players ?? []) as Record<string, unknown>[] };
  return pickemCache;
}

/** Cards require a real photo (players/page.tsx): not a placeholder, and the URL answers. */
const photoOk = new Map<string, boolean>();
async function hasPhoto(url: string | null): Promise<boolean> {
  if (!url || !/^https?:\/\//.test(url) || /placeholder|default-avatar|nophoto/i.test(url)) return false;
  if (photoOk.has(url)) return photoOk.get(url)!;
  let ok = false;
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4000) });
    ok = res.ok && (res.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    ok = false;
  }
  photoOk.set(url, ok);
  return ok;
}

export async function GET(request: Request) {
  const blocked = await previewGate(request);
  if (blocked) return blocked;
  const params = new URL(request.url).searchParams;
  const part = params.get("part") ?? "table";
  const view = params.get("view") ?? "all";
  if (!["all", "nxl", "psp"].includes(view)) return NextResponse.json({ error: "bad view" }, { status: 400 });

  try {
    const db = getFirestore();
    const [history, { pickem, allTimeRows }] = await Promise.all([nxlHistoryCached(db), loadPickem(db)]);
    if (part === "leaders") return NextResponse.json({ leaders: await proLeaders(history, pickem, hasPhoto) });
    return NextResponse.json({ view, rows: proTable(history, pickem, allTimeRows, view) });
  } catch (err) {
    console.error("[career/pro/aggregates] failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
