/**
 * Where the master ID list (player_id <-> league_id) lives.
 *
 * Since 24 Oct 2026 the current list is kept by the Data agent in pickem-hub
 * (`agents/rosters/registry.py`, add-only, updated after every Roster Sync that adds
 * players), not in this repo: a data file that changes during an event shouldn't need
 * a PR each time. `scripts/player-identity-registry.json` here is the frozen 2 Sep 2026
 * copy, used only when the hub's isn't on this machine (e.g. CI).
 *
 * Order: $PICKEM_IDENTITY_REGISTRY -> ~/Documents/pickem-hub/identity/player-identity-registry.json
 * -> scripts/player-identity-registry.json.
 */

import fs from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export const HUB_REGISTRY = `${homedir()}/Documents/pickem-hub/identity/player-identity-registry.json`;
export const REPO_REGISTRY = fileURLToPath(new URL("./player-identity-registry.json", import.meta.url));

export function registryPath() {
  if (process.env.PICKEM_IDENTITY_REGISTRY) return process.env.PICKEM_IDENTITY_REGISTRY;
  return fs.existsSync(HUB_REGISTRY) ? HUB_REGISTRY : REPO_REGISTRY;
}

/** The hub's list only grows through registry.py (add-only). A script that would rewrite it stops here. */
export function refuseHubWrite(script) {
  const path = registryPath();
  if (path !== REPO_REGISTRY) {
    console.error(
      `\nABORT: ${script} --apply would rewrite the master ID list at ${path}.\n` +
        "It is kept add-only by pickem-hub's agents/rosters/registry.py; changing or removing an entry is a\n" +
        "Data agent job on James's OK. Nothing was written.",
    );
    process.exit(1);
  }
}
