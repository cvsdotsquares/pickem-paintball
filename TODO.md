# TODO — moved to the TO DO board

**Open items now live on the TO DO board** in the admin panel (`npm run admin` →
http://127.0.0.1:3005/admin/todo; data in `~/Documents/pickem-hub/todo/board.json`).
Moved 17 Oct 2026: every open action from this file is a card or a checklist item there,
grouped under the **Site** and **Data** work streams, with the details in each card's notes.
Add new work there, not here (Claude: `python3 todo/todo.py` in pickem-hub — see
`todo/README.md`).

Companion docs (still current): [`SECURITY_HARDENING.md`](./SECURITY_HARDENING.md) ·
[`ROSTER_IDENTITY.md`](./ROSTER_IDENTITY.md) · [`DATA_PIPELINE.md`](./DATA_PIPELINE.md) ·
[`LONG_DATA_MIGRATION.md`](./LONG_DATA_MIGRATION.md)

---

## Done — kept for the history

Dark mode and mobile are both signed off on the player page.

- [x] **Six roster rows describe nobody — two deleted, four hidden.**
      Found 8 Sep. All six carry no NXL record (missing `league_id`, or one the 2015-2026
      crawl has never seen) AND have never scored, so a career page for them is a column
      of zeros — a claim about our data that reads as a claim about the player.

      | Player | league_id | Picked by | Action |
      |---|---|---|---|
      | Norman Reitemyer | — | nobody | **deleted** |
      | Matthew Helgeson | 840 | nobody | **deleted** |
      | Henry Portillo | 206876 | 8 users, 1 captain | hidden |
      | Joey Petrucelli | 206976 | 2 users | hidden |
      | Jonathan Liljeblad | 224174 | 1 user | hidden |
      | Nicholas Schaedel | — | 1 user | hidden |

      Hiding is a RULE in `functions/playerSummaries.js` — no league record and no kills —
      not a list of names, so anyone who scores or gets a correct id reappears on their
      own. It could not be a flag on the roster document: `syncRoster()` rewrites those
      from the sheet and would wipe it. Their roster rows are untouched, so picks still
      score; 17,837 picks across 1,602 users all resolve after the change.

      ✅ **Removed from the sheet too (13 Sep), so the deletions now hold.** `syncRoster()`
      builds rosters from the Google Sheet, so a Firestore delete alone would have been
      undone by the next upload. Verified still absent from all three roster documents and
      from `playerSummaries`. Backup of all five deleted documents remains at
      `scripts/backups/phantom-players-pre-delete.json`.

      ⚠️ Helgeson's `league_id` is **840**, far below the range of every other id here
      (206876, 224174). That looks like a wrong id on a real player rather than a phantom,
      and James has said he expects Helgeson to have kills. Worth resolving before the
      next event rather than after.

      Also spotted: Portillo and Petrucelli carry a `league_id` but their participation
      reason still reads "no league id" — those verdicts predate the identity backfill, so
      participation reasons generally may be stale relative to it.

- [x] **Live data loss on the 2026 events — projection is currently the only copy.**
      Found 4 Sep 2026 by `scripts/nxl-history/safety-diff.mjs`. **Resolved 8 Sep 2026**,
      before the marker was ever set — see the note under the table.

      Nothing was broken on the site because `projections/playerSummaries.staleSince`
      stayed unset, so no rebuild ran. The next upload would have set that marker and the
      scheduled function would have published all of it within five minutes.

      | Event | `participation` on roster docs | `brand_color` |
      |---|---|---|
      | `mid_west_open_2026` | **missing on all 218** | **null** |
      | `mid_atlantic_open_2026` | 187 played / 24 absent, intact | **null** |
      | all 2025 events | intact | intact |

      The stored summaries still hold `participation: "played"` / `reason: "scored"` for
      those 218 players; the roster documents no longer do. Rebuilding copies the
      degraded source over the good projection: **38 players flip from correctly-marked
      DNP to "played"**, and the field size behind every rank at that event inflates from
      180 to 218, moving ranks and averages for everyone.

      **What was done, 8 Sep 2026.** `scripts/restore-midwest-participation.mjs` put back
      `participation`, `participationReason`, `eventId` and `playerId` for all 218 Mid
      West players from the pre-sync snapshot — 180 played / 38 absent, matching the
      snapshot exactly, filling blanks only. `participationAt` and `recomputedAt` do not
      come back: the snapshot serialised both as empty strings.

      `brand_color` was recomputed rather than restored. It is a cache — `onEventLogoChanged`
      derives it by averaging the logo to one pixel — so `scripts/recompute-brand-color.mjs`
      runs that same derivation by hand. Mid West `#929889`, Mid Atlantic `#64666b`. Note
      the trigger CANNOT self-heal this: it fires on the logo URL changing, and the logo
      never changed. Any future wipe needs the script.

      Then one clean rebuild, and `safety-diff` now reports 325/325 identical with both
      aggregates identical — the projection and its source finally agree.

      ⚠️ **Still unexplained: what removed them.** `syncRoster()` owns a different field
      set and uses an update mask, so it should not have been able to. Until that is
      understood the same loss can recur, which is what the scheduled-`safety-diff` idea
      above is for.

- [x] **DONE — long-data backfill, all 8 events.** All eight PickEm events now carry
      kill-by-kill rows (18,271 of them); `scripts/nxl-history/validate.mjs` resolves
      400/400 games against the league fixture list. The note below is kept for the
      shape of the process.

      ~~Only `mid_west_open_2026` has kill-by-kill rows loaded.~~ Each remaining event needs row ids stamped, validating, uploading and
      verifying. **The Matches tab on the player page is already built and waiting** —
      each event lights up the moment its long data lands, no code change needed. Until
      then those events show a "no kill-by-kill data loaded yet" note.

- [x] **Share graphics** — built 8-10 Sep. `api/share/career/route.tsx` renders career,
      season and event cards at 1080x1920, shaped by `src/lib/careerShareCard.ts` so the
      cards and the page cannot state different things about the same player. Shares the
      PNG only, never a link: a URL makes WhatsApp and Discord unfurl a second copy of the
      card beneath it, which is also why there is no landing page to build.

      `scripts/verify-share-cards.mjs` guards nine card shapes on three axes — the footer
      reaches the last row, content clears it, nothing runs off the right edge. All three
      were bugs that shipped past a human review at least once, and the right-edge one
      passed both of the other checks.

      ⚠️ **The share sheet itself has never run.** `navigator.share()` with a file exists
      only on iOS and Android, so every verification so far has exercised the DOWNLOAD
      fallback. Needs one pass on a phone against the preview before this is really done.
