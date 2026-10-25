/**
 * Instagram collaborators on a post (James, 25 Oct 2026: a must-have on every post). The rule: the post's Player +
 * its Team + NXL (@nxlpaintball), at most 3. Handles come from pickem-hub generator/data/handles.json (name → @handle,
 * built from past captions), team names matched through generator/data/teams.json. A name with no handle is skipped,
 * never guessed. Many players → the headline (#1) player; many teams → the #1 team. Never our own accounts (Pick'Em's,
 * or James's, though he's on Aftermath's roster).
 *
 * Stored on the scheduledPosts doc as `collaborators: [username]` (no "@"); the posting job
 * (pickem-paintball-scheduler functions/postScheduler.js) puts them on the Instagram container and drops any that
 * Instagram refuses. Pure functions only (no Firestore, no files): the panel's pages use it too, and
 * tests/collab.node.test.mjs runs it.
 */

export const MAX_COLLABORATORS = 3; // Instagram's limit
export const NXL = "nxlpaintball";
export const OWN = ["pickempaintball", "greenyy42"]; // never collab with ourselves: Pick'Em, and James (also a player)

export type Handles = Record<string, string>; // name → "@handle"
export type TeamInfo = { name?: string; short?: string; code?: string; handle?: string };
export type Teams = Record<string, TeamInfo>;
type Obj = Record<string, unknown>;

/** "@Foo.Bar" / "foo.bar" / "instagram.com/foo.bar" → "foo.bar"; null when it isn't an Instagram username. */
export function cleanHandle(raw: string): string | null {
  const h = String(raw ?? "")
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^@/, "")
    .toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) && !/^\.|\.$/.test(h) ? h : null;
}

/**
 * A typed or saved list → clean usernames, duplicates and our own accounts removed. `bad` = what isn't a username,
 * `own` = our own accounts that were left out, `tooMany` = past the limit of 3.
 */
export function cleanList(list: string[]): { ok: string[]; bad: string[]; own: string[]; tooMany: boolean } {
  const ok: string[] = [];
  const bad: string[] = [];
  const own: string[] = [];
  for (const raw of list.flatMap((x) => String(x).split(/[\s,]+/)).filter(Boolean)) {
    const h = cleanHandle(raw);
    if (!h) bad.push(raw);
    else if (OWN.includes(h)) own.push(h);
    else if (!ok.includes(h)) ok.push(h);
  }
  return { ok, bad, own, tooMany: ok.length > MAX_COLLABORATORS };
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
/** A team as a post's data writes it: "Heat", or { key, team, name, short, code }. */
const teamNames = (v: unknown): string[] => (isObj(v) ? ["key", "team", "short", "name", "code"].map((k) => str(v[k])).filter(Boolean) : [str(v)].filter(Boolean));

/**
 * Who a post is about, from its data.json (finals/<version>/data.json). Player: a top-level `player`, else the first
 * row (in data order, which is rank order) of the first list whose rows name a player. Team: a top-level `team`, else
 * the first of `teams`, else the headline player's team.
 */
export function headline(data: unknown): { player: string; team: string[] } {
  if (!isObj(data)) return { player: "", team: [] };
  let player = str(data.player);
  let playerTeam: unknown = player ? data.team : undefined;
  if (!player) {
    for (const v of Object.values(data)) {
      if (!Array.isArray(v)) continue;
      const row = v.find((r) => isObj(r) && str(r.player));
      if (row) {
        player = str((row as Obj).player);
        playerTeam = (row as Obj).team;
        break;
      }
    }
  }
  const team = data.team !== undefined ? teamNames(data.team) : Array.isArray(data.teams) && data.teams.length ? teamNames(data.teams[0]) : teamNames(playerTeam);
  return { player, team };
}

/** A player's handle: the exact name, or the name without a quoted nickname ('Andrew "AJ" Malsam' → 'Andrew Malsam'). */
function playerHandle(name: string, handles: Handles): string | null {
  if (!name) return null;
  const plain = name.replace(/\s*(“[^”]*”|"[^"]*")\s*/g, " ").replace(/\s+/g, " ").trim();
  return cleanHandle(handles[name] ?? handles[plain] ?? "");
}

/** A team's handle: any of its names, matched to teams.json (key, full name, short name or code), then handles.json. */
function teamHandle(names: string[], handles: Handles, teams: Teams): string | null {
  for (const n of names) {
    if (handles[n]) return cleanHandle(handles[n]);
    const low = n.toLowerCase();
    const hit = Object.entries(teams).find(([k, t]) => [k, t.name, t.short, t.code].some((x) => x && x.toLowerCase() === low));
    if (hit) {
      const [k, t] = hit;
      const h = handles[k] ?? (t.short ? handles[t.short] : undefined) ?? t.handle;
      if (h) return cleanHandle(h);
    }
  }
  return null;
}

/** "@a, @b" ↔ ["a", "b"] for the "Collab with" boxes (Social calendar, Post Generator step 5). */
export const showCollab = (list: string[] | undefined) => (list ?? []).map((h) => `@${h}`).join(", ");
export const readCollab = (text: string) => text.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

/** The rule: Player + Team + NXL, max 3, no handle = skipped, never our own accounts. `data` null = no made post yet. */
export function autoCollaborators(data: unknown, handles: Handles, teams: Teams): string[] {
  const h = headline(data);
  const picks = [playerHandle(h.player, handles), teamHandle(h.team, handles, teams), NXL].filter((x): x is string => !!x);
  return cleanList(picks).ok.slice(0, MAX_COLLABORATORS);
}
