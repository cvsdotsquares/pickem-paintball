import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { ensureAdmin } from "@/src/lib/authEmailsServer";
import { sendWelcome } from "@/src/lib/welcomeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/user/welcome (signed in) → { welcomed, final }. Called by the browser on a logged-in visit until it gets
 * final: true (welcomed now, already welcomed, or signed up before the series launched). See src/lib/welcomeServer.ts.
 */
export async function POST(request: Request) {
  if (!ensureAdmin()) return NextResponse.json({ welcomed: false, final: false });
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let uid: string, provider: string | undefined;
  try {
    const decoded = await getAuth().verifyIdToken(token);
    uid = decoded.uid;
    provider = decoded.firebase?.sign_in_provider;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await sendWelcome(uid, provider));
  } catch (err) {
    console.error("[welcome] route failed", err);
    return NextResponse.json({ welcomed: false, final: false });
  }
}
