import { NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

/**
 * The one gate for the PSP / pro-career preview (career-update branch).
 *
 * Every `/api/career/pro*` route asks this first. Until PRO_CAREER_PUBLIC=true it lets
 * through only a verified Firebase ID token whose email is in PRO_CAREER_PREVIEW_EMAILS;
 * everyone else gets a 404, so to them the feature does not exist and every page renders
 * exactly as it does today. James flips PRO_CAREER_PUBLIC when he wants it live.
 */

export function ensureAdmin(): boolean {
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

/** Null when the request may proceed; otherwise the response to send. */
export async function previewGate(request: Request): Promise<NextResponse | null> {
  if (!ensureAdmin()) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });
  if (isPublic()) return null;
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return hidden();
  try {
    const decoded = await getAuth().verifyIdToken(auth.slice("Bearer ".length));
    const email = String(decoded.email ?? "").toLowerCase();
    if (!decoded.email_verified || !previewEmails().includes(email)) return hidden();
    return null;
  } catch {
    return hidden();
  }
}
