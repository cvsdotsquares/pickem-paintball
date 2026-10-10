import type { Firestore } from "firebase-admin/firestore";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadHistory } = require("@/functions/nxlEventsStore");

/**
 * The live NXL history (Firestore `nxlEvents`), shared by the pro-career preview routes.
 * Held for ten minutes because the live crawler rewrites `nxlEvents` on that cadence.
 */
let cached: { at: number; history: unknown } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function nxlHistoryCached(db: Firestore): Promise<unknown> {
  if (!cached || Date.now() - cached.at > TTL_MS) cached = { at: Date.now(), history: await loadHistory(db) };
  return cached.history;
}
