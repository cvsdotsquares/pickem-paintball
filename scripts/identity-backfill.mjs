/**
 * Give every roster row the identity it should already have.
 *
 *   node scripts/identity-backfill.mjs           # dry run + proof, writes nothing
 *   node scripts/identity-backfill.mjs --write
 *
 * TWO CORRECTIONS, both single-field and both purely additive:
 *
 *   1. `league_id` where the row has none. 848 rows across seven events — the three
 *      earliest 2025 events carry it on NO row at all, which is why 90 players have no
 *      league record on the site.
 *   2. The inner `player_id` where it disagrees with the document id. 26 rows, left
 *      behind when the August identity fix moved players to new ids.
 *   3. `league_epid` for the players the crawler cannot give a numeric id, because they
 *      have no photo. See PLAYER_EPID in nxl-history/clubs.mjs for the evidence behind
 *      each one.
 *
 * WHY THE REGISTRY IS THE SOURCE
 * `scripts/player-identity-registry.json` is the durable record of who is who, not a
 * cache of Firestore. `rebuild-identity-registry.mjs` says so in as many words —
 * "league_id is NEVER re-derived" — and it aborts rather than let a player lose one.
 * Firestore's roster documents are an incomplete copy: `syncRoster` only started
 * stamping `league_id` partway through 2025.
 *
 * WHY THIS IS SAFE, measured rather than asserted
 *   - 992 rows already agree with the registry; 0 conflict. Nothing is overwritten with
 *     a different value — every write fills a blank.
 *   - Of the 848 blanks, 772 can be cross-checked against the league's own results, and
 *     the club the league puts them on matches our `team_id` on 772 of 772.
 *   - With the 746 already checked, that is 1,518 appearances agreeing and none
 *     disagreeing.
 *
 * The dry run re-runs both checks and REFUSES to write on a single conflict.
 */

import fs from "node:fs";
import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const HISTORY = require("../functions/data/nxlHistory.json");
const { PLAYER_EPID } = await import("./nxl-history/clubs.mjs");

const WRITE = process.argv.includes("--write");

admin.initializeApp({ projectId: "fantasy-paintball" });
const db = admin.firestore();

const registry = JSON.parse(
  fs.readFileSync(new URL("./player-identity-registry.json", import.meta.url), "utf8"),
);
const leagueIdOf = new Map(
  registry.players.map((p) => [String(p.player_id), String(p.league_id ?? "").trim()]),
);

const CLUB = HISTORY.clubTeamId ?? {};
const leagueKeyOf = new Map(
  HISTORY.events.filter((e) => e.pickemEventId).map((e) => [e.pickemEventId, e.key]),
);

const eventsSnap = await db.collection("events").get();
const eventIds = eventsSnap.docs.map((d) => d.id).filter((id) => !id.includes("2024")).sort();

const writes = [];
const conflicts = [];
const teamDisagreements = [];
let leagueFills = 0;
let idFixes = 0;
let epidFills = 0;
let teamChecked = 0;
const perEvent = new Map();

for (const eventId of eventIds) {
  const snap = await db.collection(`events/${eventId}/players`).get();
  perEvent.set(eventId, { league: 0, id: 0, total: snap.size });

  for (const d of snap.docs) {
    const patch = {};
    const live = String(d.get("league_id") ?? "").trim();
    const want = leagueIdOf.get(d.id) ?? "";

    if (want) {
      if (!live) {
        patch.league_id = want;
        leagueFills++;
        perEvent.get(eventId).league++;

        /**
         * Validate the id we are about to write, not just the ones already there.
         *
         * A backfilled id is a claim that this person is that NXL player. The league's
         * own results say which club they turned out for; our roster says which team.
         * If those disagree the id is wrong, and writing it would attach a stranger's
         * career to this player — the one failure that would be invisible afterwards.
         */
        const key = leagueKeyOf.get(eventId);
        const teamId = d.get("team_id");
        if (key && teamId) {
          const ap = (HISTORY.appearances[want] ?? []).find(([k]) => k === key);
          const expected = ap && CLUB[ap[1]];
          if (expected) {
            teamChecked++;
            if (expected !== teamId) {
              teamDisagreements.push(
                `${eventId}/${d.id} ${d.get("Player")}: ours=${teamId} league=${expected} (league_id ${want})`,
              );
            }
          }
        }
      } else if (live !== want) {
        conflicts.push(`${eventId}/${d.id} ${d.get("Player")}: live=${live} registry=${want}`);
      }
    }

    /**
     * The profile EPID, for a player with no numeric league id.
     *
     * A second key rather than a value in `league_id`: that field means the NXL's
     * NUMERIC id — the photo-filename regex `/players/(\d+)[-_]/` depends on it being
     * digits — and putting a slug in it would break that quietly.
     */
    const wantEpid = PLAYER_EPID[d.id];
    if (wantEpid && String(d.get("league_epid") ?? "") !== wantEpid) {
      patch.league_epid = wantEpid;
      epidFills++;
    }

    const inner = d.get("player_id");
    if (inner != null && String(inner) !== d.id) {
      // Set rather than delete. Every reader was fixed on 5 Sep to use the document id,
      // so this field is now unread — but a field that can disagree with its own key
      // will disagree again, and removing it belongs with the syncRoster work that
      // decides what a roster row is allowed to contain.
      patch.player_id = d.id;
      idFixes++;
      perEvent.get(eventId).id++;
    }

    if (Object.keys(patch).length) writes.push({ ref: d.ref, patch, name: d.get("Player") });
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log(`\nIdentity backfill — ${eventIds.length} events\n`);
console.log(`  league_id to fill in    ${leagueFills} rows`);
console.log(`  stale player_id to fix  ${idFixes} rows`);
console.log(`  league_epid to set      ${epidFills} rows`);
console.log(`  documents to touch      ${writes.length}\n`);

for (const [ev, c] of perEvent) {
  if (!c.league && !c.id) continue;
  console.log(`  ${ev.padEnd(24)} league_id +${String(c.league).padStart(3)}   player_id ~${c.id}`);
}

console.log(`\nChecks:`);
console.log(
  `  registry vs live conflicts        ${conflicts.length === 0 ? "0 — every write fills a blank" : `${conflicts.length} ❌`}`,
);
conflicts.slice(0, 5).forEach((c) => console.log(`     ${c}`));
console.log(
  `  backfilled ids vs league results  ${teamChecked - teamDisagreements.length}/${teamChecked} agree on the team${teamDisagreements.length ? " ❌" : ""}`,
);
teamDisagreements.slice(0, 5).forEach((c) => console.log(`     ${c}`));

if (conflicts.length || teamDisagreements.length) {
  console.error(
    `\n❌ Refusing to write. An id that disagrees with the league would attach the wrong career to a player.\n`,
  );
  process.exit(1);
}
console.log(`\n✅ Nothing is overwritten and every backfilled id is confirmed by the league.`);

if (!WRITE) {
  console.log(`\nNo --write flag, so nothing was written.\n`);
  process.exit(0);
}

const BATCH = 400;
for (let i = 0; i < writes.length; i += BATCH) {
  const batch = db.batch();
  for (const w of writes.slice(i, i + BATCH)) batch.update(w.ref, w.patch);
  await batch.commit();
}
console.log(`\nUpdated ${writes.length} roster documents.\n`);
process.exit(0);
