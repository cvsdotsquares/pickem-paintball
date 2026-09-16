/**
 * Whether this build may show a tournament that is still being played.
 *
 * The projection is ONE collection shared by production and preview, so the live crawl
 * cannot be hidden by writing less — it is hidden by reading less. The build writes
 * `nxlLive` and `recordLive` alongside the settled `nxl` and `record`; production never
 * asks for them, and preview prefers them.
 *
 * Spelled out in full rather than read from a variable, because Next inlines
 * `process.env.NEXT_PUBLIC_*` at build time by literal substitution.
 */
export const SHOW_LIVE_EVENT = process.env.NEXT_PUBLIC_SHOW_LIVE_EVENT === "1";

/**
 * Swap in the live view of a summary document, when this build is allowed one.
 *
 * Returns the document untouched in production, so the consumers have exactly one code
 * path and the two cannot drift.
 *
 * Deliberately generic over an unconstrained `T`: the callers pass a typed interface,
 * and an interface without an index signature is not assignable to
 * `Record<string, unknown>` — constraining it would fail the build.
 */
export function withLiveEvent<T>(summary: T): T {
  if (!SHOW_LIVE_EVENT || !summary || typeof summary !== "object") return summary;

  const out = { ...(summary as object) } as Record<string, unknown>;
  if (out.nxlLive) out.nxl = out.nxlLive;

  const rows = out.events;
  if (Array.isArray(rows)) {
    out.events = rows.map((r) => {
      if (!r || typeof r !== "object") return r;
      const row = r as Record<string, unknown>;
      return row.recordLive ? { ...row, record: row.recordLive } : row;
    });
  }
  return out as T;
}
