import { sendEmailVerification, sendPasswordResetEmail, type User } from "firebase/auth";
import { auth } from "./firebaseClient";

/**
 * Account emails: ask the site to send our branded email (/api/auth/send-email, via Klaviyo) and fall back to
 * Firebase's own email when that's switched off or fails, so nobody is ever left without a link.
 */
async function viaSite(type: "verify" | "reset", init: { token?: string; email?: string }): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/send-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: JSON.stringify({ type, email: init.email }),
    });
    if (!res.ok) return false;
    return Boolean(((await res.json()) as { handled?: boolean }).handled);
  } catch {
    return false;
  }
}

export async function sendVerificationEmail(user: User): Promise<void> {
  const token = await user.getIdToken().catch(() => undefined);
  if (token && (await viaSite("verify", { token }))) return;
  await sendEmailVerification(user);
}

export async function sendResetEmail(email: string): Promise<void> {
  if (await viaSite("reset", { email })) return;
  await sendPasswordResetEmail(auth, email);
}
