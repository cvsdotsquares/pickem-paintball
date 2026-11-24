import { db } from "@/src/lib/firebaseClient";
import { addDoc, collection } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/client-error — one row in `clientErrors` per crash a visitor's browser reports
 * (src/lib/reportClientError.ts). scripts/client-errors-report.mjs groups them by kind,
 * device and browser.
 *
 * Same shape as /api/subscription/track: the collection is create-only to clients (see
 * firestore.rules), every field is checked and capped here, and nothing personal is stored.
 * Rows carry `expireAt` (90 days) for a Firestore TTL policy, if one is switched on.
 */

const KINDS = ["page-crash", "site-crash", "script-error", "viewport-shift"] as const;
const RETAIN_MS = 90 * 24 * 60 * 60 * 1000;

const oneOf = <T extends readonly string[]>(list: T, v: unknown): T[number] | null =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : null;

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;

const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/** Up to 8 short flat values, e.g. { at: "/_next/…:12:4" } or { offsetTop: 24 }. */
function cleanExtra(v: unknown): Record<string, string | number | boolean | null> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 8)) {
    const key = k.slice(0, 40);
    out[key] = typeof val === "string" ? val.slice(0, 200) : num(val) ?? bool(val);
  }
  return out;
}

export async function POST(req: NextRequest) {
  const text = await req.text().catch(() => "");
  if (!text || text.length > 8000) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const kind = oneOf(KINDS, body.kind);
  if (!kind) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }

  const now = Date.now();
  try {
    await addDoc(collection(db, "clientErrors"), {
      kind,
      message: str(body.message, 300),
      name: str(body.name, 60),
      stack: str(body.stack, 2000),
      path: str(body.path, 200),
      ua: str(body.ua, 400),
      vw: num(body.vw),
      vh: num(body.vh),
      standalone: bool(body.standalone),
      translated: bool(body.translated),
      dark: bool(body.dark),
      dvh: bool(body.dvh),
      vvOffsetTop: num(body.vvOffsetTop),
      vvHeight: num(body.vvHeight),
      extra: cleanExtra(body.extra),
      createdAt: now,
      expireAt: new Date(now + RETAIN_MS),
    });
  } catch (err) {
    console.error("clientErrors write failed:", err);
    return NextResponse.json({ error: "not recorded" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
