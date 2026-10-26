import { db } from "@/src/lib/firebaseClient";
import { addDoc, collection } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/subscription/track — one row in `subscribeEvents` per step of the subscribe pop-up.
 *
 * Every row from one showing of the pop-up shares a `viewId`, and the same id rides into the
 * Stripe checkout metadata, so the webhook's `paid` row joins back to the prompt that sold it.
 * scripts/subscribe-report.mjs turns the rows into a funnel per prompt.
 *
 * `uid` comes from the browser and is not verified: fine for counting, never used for access.
 * `paid` is not accepted here; only the Stripe webhook writes it.
 */

const STEPS = [
  "opened",
  "plan_selected",
  "read_more",
  "checkout_started",
  "checkout_failed",
  "checkout_cancelled",
  "login_redirect",
  "dismissed",
] as const;
const TYPES = ["passive", "soft-gate", "hard-gate"] as const;
const REASONS = [
  "general",
  "career",
  "share",
  "leagues",
  "badges",
  "picks",
] as const;
const PLANS = ["monthly", "quarterly", "yearly"] as const;
const HOWS = ["continue", "close", "backdrop", "escape"] as const;
const CURRENCIES = ["usd", "gbp", "eur"] as const;

const oneOf = <T extends readonly string[]>(
  list: T,
  v: unknown,
): T[number] | null =>
  typeof v === "string" && (list as readonly string[]).includes(v)
    ? (v as T[number])
    : null;

const shortString = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : null;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const step = oneOf(STEPS, body.step);
  const type = oneOf(TYPES, body.type);
  const reason = oneOf(REASONS, body.reason);
  const viewId = shortString(body.viewId, 64);

  if (!step || !type || !reason || !viewId) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }

  try {
    await addDoc(collection(db, "subscribeEvents"), {
      step,
      type,
      reason,
      viewId,
      uid: shortString(body.uid, 128),
      plan: oneOf(PLANS, body.plan),
      how: oneOf(HOWS, body.how),
      currency: oneOf(CURRENCIES, body.currency),
      path: shortString(body.path, 200),
      createdAt: Date.now(),
    });
  } catch (err) {
    console.error("subscribeEvents write failed:", err);
    return NextResponse.json({ error: "not recorded" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
