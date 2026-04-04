"use client";

import { getFirebasePublicEnvStatus } from "@/src/lib/firebasePublicEnv";

/**
 * Shown only on `/login` in development. Production login is unchanged.
 * Helps when the live site works but localhost fails (env, API key referrers, authorized domains).
 */
export default function LocalDevFirebaseHint() {
  /** Omit entirely in production (`NODE_ENV` is inlined at build time). */
  if (process.env.NODE_ENV !== "development") return null;

  const { ok, missing, projectIdHint } = getFirebasePublicEnvStatus();

  return (
    <div
      className="mb-4 rounded-lg border border-amber-500/80 bg-amber-950/90 p-3 text-left text-xs text-amber-100 shadow-md"
      role="region"
      aria-label="Local development Firebase notes"
    >
      <p className="font-bold text-amber-200">Local dev — Firebase</p>
      {!ok ? (
        <p className="mt-2 text-red-200">
          Missing env: {missing.join(", ")}. Add them to <code className="rounded bg-black/30 px-1">.env.local</code>{" "}
          (copy <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_FIREBASE_*</code> from Vercel), then restart{" "}
          <code className="rounded bg-black/30 px-1">npm run dev</code>.
        </p>
      ) : (
        <p className="mt-2 text-amber-100/95">
          Project id check: <code className="rounded bg-black/30 px-1">{projectIdHint ?? "—"}</code> — confirm this
          matches your production/Vercel project.
        </p>
      )}
      <ul className="mt-2 list-inside list-disc space-y-1 text-amber-100/90">
        <li>
          <strong className="text-amber-200">Google Cloud API key</strong> (common fix when prod works, localhost
          doesn&apos;t): APIs &amp; Services → Credentials → your Browser key → Application restrictions → HTTP referrers
          → add{" "}
          <code className="whitespace-nowrap rounded bg-black/30 px-1">http://localhost:*/*</code>,{" "}
          <code className="whitespace-nowrap rounded bg-black/30 px-1">http://127.0.0.1:*/*</code>, and your phone URL
          (e.g. <code className="rounded bg-black/30 px-1">http://192.168.x.x:3000/*</code>).
        </li>
        <li>
          <strong className="text-amber-200">Firebase Auth authorized domains</strong>: Authentication → Settings →
          Authorized domains → add your LAN host (e.g. <code className="rounded bg-black/30 px-1">192.168.1.12</code>) for
          phone testing.
        </li>
        <li>
          If you only need to test before email verification:{" "}
          <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_DEV_ALLOW_UNVERIFIED_LOGIN=true</code> in{" "}
          <code className="rounded bg-black/30 px-1">.env.local</code> (dev only).
        </li>
      </ul>
    </div>
  );
}
