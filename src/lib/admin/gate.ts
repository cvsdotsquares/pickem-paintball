import { NextResponse } from "next/server";

/**
 * The one gate for the admin panel.
 *
 * The panel reads James's Drive kit and runs Claude Code on his Mac, so it only exists when
 * the site is started with `npm run admin` (ADMIN_PANEL=1, bound to 127.0.0.1 so nothing else
 * on the network can reach it). On Vercel and under a plain `npm run dev` every /admin page and
 * /api/admin route is a 404 — to everyone else the panel does not exist.
 */
export function adminEnabled(): boolean {
  return process.env.ADMIN_PANEL === "1" && process.env.NODE_ENV !== "production";
}

/** Null when the request may proceed; otherwise the 404 to send. */
export function adminGate(): NextResponse | null {
  return adminEnabled() ? null : NextResponse.json({ error: "Not found" }, { status: 404 });
}
