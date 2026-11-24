import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import {
  authEmailsEnabled,
  ensureAdmin,
  logFailure,
  makeLink,
  sendViaKlaviyo,
  underRateLimit,
  type AuthEmailType,
} from "@/src/lib/authEmailsServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/send-email { type: "verify" | "reset", email? } → { handled: boolean }
 *
 * handled: true  = we dealt with it (sent our branded email, or there was nothing to send); the browser does nothing.
 * handled: false = switched off or something failed; the browser sends Firebase's own email instead.
 *
 * verify needs the signed-in user's ID token (the address comes from the token, never the body).
 * reset takes the address from the body and answers the same whether or not an account exists.
 */
export async function POST(request: Request) {
  if (!process.env.AUTH_EMAILS_VIA_KLAVIYO || !ensureAdmin()) return NextResponse.json({ handled: false });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const type = body.type === "verify" || body.type === "reset" ? (body.type as AuthEmailType) : null;
  if (!type) return NextResponse.json({ error: "bad params" }, { status: 400 });

  let email: string;
  if (type === "verify") {
    const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const decoded = await getAuth().verifyIdToken(token);
      if (decoded.email_verified) return NextResponse.json({ handled: true });
      if (!decoded.email) return NextResponse.json({ handled: false });
      email = decoded.email;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const raw = typeof body.email === "string" ? body.email.trim() : "";
    if (!raw || raw.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      return NextResponse.json({ error: "bad email" }, { status: 400 });
    }
    email = raw;
  }

  if (!authEmailsEnabled(email)) return NextResponse.json({ handled: false });

  try {
    if (!(await underRateLimit(type, email))) return NextResponse.json({ handled: true });
    const link = await makeLink(type, email);
    if (link) await sendViaKlaviyo(type, email, link);
    return NextResponse.json({ handled: true });
  } catch (err) {
    await logFailure(type, email, err);
    return NextResponse.json({ handled: false });
  }
}
