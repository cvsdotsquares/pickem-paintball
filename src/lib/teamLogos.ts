/** The grey silhouette — the last resort when a player has neither a photo nor a team logo. */
export const PLACEHOLDER_HEADSHOT = "/placeholder.svg";

/**
 * Whether a stored image URL is an actual headshot.
 *
 * `img_url` is the one source of truth. Empty means no headshot, and so does a
 * placeholder URL: the data job hides a moved player's wrong-team photo by writing
 * "/placeholder.svg", and some older rows carry one too. Same test as `looksLikePhoto` in
 * functions/playerSummaries.js. Pages used to fall back to the legacy `players/` Storage
 * folder when `img_url` was empty, which brought back the very photos hidden on purpose.
 */
export function isRealHeadshot(url: string | null | undefined): url is string {
  const u = typeof url === "string" ? url.trim() : "";
  return u !== "" && !/placeholder|no-image|default/i.test(u);
}

/**
 * Team ids (the player's `team_id`) with a logo in `public/team-logos/{ID}.png`.
 *
 * Source: the Drive Social Media Kit, `03. Team Assets/2026 Logos/Full colour` (signed off
 * 17 Oct 2026), trimmed and shrunk to 256 px. The kit's AFM (Aftermath) and JCT (Jungle
 * Cats) are SDA and JNG on the site. ACD, ARS and NRG have no 2026 logo, so theirs are the
 * older kit files one folder up. Add a team: drop `{ID}.png` in the folder and its id here.
 */
const TEAM_LOGO_IDS = new Set([
  "ACD", "AFT", "ALA", "ARS", "COL", "DAM", "DST", "DYN", "FIT", "HEA", "HUR", "IMF", "IMP",
  "IRN", "JNG", "LEG", "LEV", "LTF", "NRG", "NYX", "RCS", "RGR", "SDA", "TON", "TPP", "UPR",
  "XFA",
]);

/** Public path of a team's logo, or null when the team has none. */
export function teamLogoPath(teamId: string | number | null | undefined): string | null {
  const id = teamId == null ? "" : String(teamId).trim().toUpperCase();
  return TEAM_LOGO_IDS.has(id) ? `/team-logos/${id}.png` : null;
}
