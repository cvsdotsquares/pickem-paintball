import { createHash } from "crypto";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Branded account emails (verify email, password reset), sent through Klaviyo instead of Firebase's plain default
 * emails (James, 3 Nov 2026: Firebase has locked template edits for this project).
 *
 * The site makes the Firebase action link with the Admin SDK, rewrites it to our own page (/auth/action) and sends
 * Klaviyo an event; a Klaviyo flow, approved as transactional, sends the email. Switched off until
 * AUTH_EMAILS_VIA_KLAVIYO=on; while off, or if anything here fails, the browser falls back to Firebase's own email.
 */

export type AuthEmailType = "verify" | "reset";

const METRIC: Record<AuthEmailType, string> = {
  verify: "Auth - Verify email",
  reset: "Auth - Password reset",
};
const SITE_URL = process.env.AUTH_EMAIL_SITE_URL || "https://www.pickempaintball.com";
const MAX_PER_HOUR = 5;

export function authEmailsEnabled(): boolean {
  return process.env.AUTH_EMAILS_VIA_KLAVIYO === "on" && !!process.env.KLAVIYO_PRIVATE_KEY;
}

export function ensureAdmin(): boolean {
  if (getApps().length > 0) return true;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!privateKey || !clientEmail || !projectId) return false;
  try {
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") }),
    });
    return true;
  } catch {
    return false;
  }
}

/** Firebase's link points at firebaseapp.com/__/auth/action; keep only mode + oobCode and point it at our page. */
export function siteActionLink(firebaseLink: string): string {
  const src = new URL(firebaseLink);
  const out = new URL("/auth/action", SITE_URL);
  out.searchParams.set("mode", src.searchParams.get("mode") || "");
  out.searchParams.set("oobCode", src.searchParams.get("oobCode") || "");
  return out.toString();
}

const emailKey = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

/** At most MAX_PER_HOUR emails of one type to one address, so the reset form can't be used to flood an inbox. */
export async function underRateLimit(type: AuthEmailType, email: string): Promise<boolean> {
  const db = getFirestore();
  const ref = db.collection("authEmailSends").doc(`${type}_${emailKey(email)}`);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const recent = ((snap.data()?.times as number[]) || []).filter((t) => now - t < 3600_000);
    if (recent.length >= MAX_PER_HOUR) return false;
    tx.set(ref, { times: [...recent, now], updatedAt: now });
    return true;
  });
}

/** The link for this email, or null when there's nothing to send (already verified / no such account). */
export async function makeLink(type: AuthEmailType, email: string): Promise<string | null> {
  try {
    const link =
      type === "verify"
        ? await getAuth().generateEmailVerificationLink(email)
        : await getAuth().generatePasswordResetLink(email);
    return siteActionLink(link);
  } catch (err) {
    if ((err as { code?: string }).code === "auth/user-not-found") return null;
    throw err;
  }
}

export async function sendViaKlaviyo(type: AuthEmailType, email: string, link: string): Promise<void> {
  const res = await fetch("https://a.klaviyo.com/api/events", {
    method: "POST",
    headers: {
      Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
      revision: "2024-10-15",
      accept: "application/vnd.api+json",
      "content-type": "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "event",
        attributes: {
          properties: { link, email },
          metric: { data: { type: "metric", attributes: { name: METRIC[type] } } },
          profile: { data: { type: "profile", attributes: { email } } },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Klaviyo ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Failures land in Firestore (no address stored) so the hub can alert on them; the user still gets Firebase's email. */
export async function logFailure(type: AuthEmailType, email: string, err: unknown): Promise<void> {
  console.error(`[auth-emails] ${type} failed`, err);
  try {
    await getFirestore().collection("authEmailErrors").add({
      type,
      emailKey: emailKey(email),
      message: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      createdAt: Date.now(),
    });
  } catch {
    /* logging must never break sign-up */
  }
}
