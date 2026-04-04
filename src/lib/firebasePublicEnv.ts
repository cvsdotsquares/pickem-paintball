/** Which `NEXT_PUBLIC_FIREBASE_*` vars the client bundle expects (measurement is optional). */
const REQUIRED_FIREBASE_PUBLIC_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

export function getFirebasePublicEnvStatus(): {
  ok: boolean;
  missing: string[];
  /** Masked project id so you can confirm it matches Vercel without exposing the full id in UI. */
  projectIdHint: string | null;
} {
  const missing: string[] = [];
  for (const k of REQUIRED_FIREBASE_PUBLIC_KEYS) {
    const v = process.env[k];
    if (v == null || String(v).trim() === "") missing.push(k);
  }
  const raw = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? "";
  const projectIdHint =
    raw.length >= 8 ? `${raw.slice(0, 4)}…${raw.slice(-4)}` : raw.length > 0 ? `${raw.slice(0, 2)}…` : null;

  return { ok: missing.length === 0, missing, projectIdHint };
}

/** When true (dev only), email/password login skips the verified-email requirement. */
export function devAllowUnverifiedLogin(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_DEV_ALLOW_UNVERIFIED_LOGIN === "true"
  );
}
