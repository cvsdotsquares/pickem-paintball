/**
 * Finished tournaments do not change. This is what enforces that.
 *
 * The history was reconciled against the league's own schedules in September 2026 - 2,393
 * matches compared, every difference reviewed by hand, five corrections signed off. It is
 * as good as two independent sources can make it. The risk from here is not that it is
 * wrong; it is that it changes without anyone noticing.
 *
 * Three ways that happens, and all three are quiet:
 *   - the workbook is re-exported and a hand fix is lost, or a fresh error arrives
 *   - a `corrections.mjs` entry stops matching and silently stops applying
 *   - a crawl is re-run and overwrites a result somebody had already adjudicated
 *
 * NEITHER FABRICATED 2017 GAME WAS CAUGHT BY ANY CHECK WE HAD, because team records are
 * derived from the match list: a game that never happened produces a win and a loss that
 * balance perfectly. Only comparing against a second source found them. A fingerprint is
 * the cheap standing version of that comparison - it cannot tell you a result is TRUE, but
 * it tells you the moment one stops being the result you already verified.
 *
 * ADDING an event is fine; history grows every season. CHANGING one that already has a
 * fingerprint is an error until someone says otherwise.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";

export const FINGERPRINT_FILE = new URL("./fixtures/history-fingerprints.json", import.meta.url);

/** Separator for the canonical match string - any character not found in a team name. */
const SEP = "~|~";

/**
 * The result of a tournament, in a form that hashes the same way every time.
 *
 * Only the result-bearing fields: who played whom and what the score was, each team's
 * record and finish, the champion, the size of the field. Labels and dates are left out so
 * a cosmetic rename does not read as history changing.
 *
 * Rows are SORTED, but team order within a match is NOT normalised - swapping the sides of
 * a scoreline is a real change, and the 2024 Lone Star final is exactly that shape.
 */
export function fingerprintEvent(ev) {
  const canonical = {
    fieldSize: ev.fieldSize,
    champion: ev.champion ?? null,
    teams: Object.entries(ev.teams ?? {})
      .map(([club, t]) => [club, t.w, t.l, t.t, t.finish, t.finishRank])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    matches: (ev.matches ?? []).map((m) => m.join(SEP)).sort(),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 16);
}

export function loadFingerprints() {
  try {
    return JSON.parse(fs.readFileSync(FINGERPRINT_FILE, "utf8"));
  } catch {
    return null;
  }
}

export function saveFingerprints(events, note) {
  const payload = {
    generated: new Date().toISOString(),
    note: note ?? "",
    events: Object.fromEntries(
      events.map((e) => [e.key, { hash: fingerprintEvent(e), matches: (e.matches ?? []).length }]),
    ),
  };
  fs.writeFileSync(FINGERPRINT_FILE, JSON.stringify(payload, null, 2));
  return payload;
}

/**
 * Compare a freshly built history against the recorded fingerprints.
 *
 * A caller finding anything in `changed` should refuse to write: the whole point is that a
 * silent edit becomes a loud one.
 */
export function checkFingerprints(events) {
  const recorded = loadFingerprints();
  if (!recorded) return { missing: true, changed: [], added: [], removed: [] };

  const now = new Map(events.map((e) => [e.key, e]));
  const changed = [];
  const removed = [];
  for (const [key, was] of Object.entries(recorded.events)) {
    const ev = now.get(key);
    if (!ev) { removed.push(key); continue; }
    const hash = fingerprintEvent(ev);
    if (hash !== was.hash) {
      changed.push({ key, was: was.matches, now: (ev.matches ?? []).length, wasHash: was.hash, nowHash: hash });
    }
  }
  const added = events.filter((e) => !(e.key in recorded.events)).map((e) => e.key);
  return { missing: false, changed, added, removed, generated: recorded.generated };
}
