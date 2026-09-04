# TODO — open items

Everything outstanding, newest work first. Companion docs:
[`SECURITY_HARDENING.md`](./SECURITY_HARDENING.md) · [`ROSTER_IDENTITY.md`](./ROSTER_IDENTITY.md) ·
[`DATA_PIPELINE.md`](./DATA_PIPELINE.md) · [`LONG_DATA_MIGRATION.md`](./LONG_DATA_MIGRATION.md)

---

## Next session

Dark mode and mobile are both signed off on the player page.

1. **Append long data for the 7 remaining events** (see Data below). The Matches tab
   lights up per event as its rows land; no code change needed.
2. **Tidy this list.** It has grown through several sessions and now mixes live
   blockers with design notes and one-line bugs.

Accepted as-is on mobile, not bugs — recorded so they are not rediscovered:
- Both tables still scroll horizontally (events 790px, matches 654px into a ~303px
  column). Truncation took it as far as it goes; fitting a phone properly means
  dropping columns or a card layout, which was a deliberate no for now.
- Chart hovers are pointer-driven, so the crosshair readouts and the
  `% of Team’s Kills` tooltip do nothing on touch. A tap-to-show equivalent is the
  fix whenever it matters.

---

## Blocking real use

**Career-stats projection now rebuilds itself.** `longDataRecompute` marks
`projections/playerSummaries.staleSince` whenever it writes a player, and the
`rebuildPlayerSummaries` scheduled function (every 5 min) rebuilds if the marker is
set, then clears it only if no new upload arrived mid-build. Build logic lives in
`functions/playerSummaries.js`, shared with `scripts/build-player-summaries.mjs` so
the live path and the manual rebuild cannot drift. Career pages can therefore lag a
live event by up to 5 minutes; the stats page and leaderboard are unaffected because
they read the player docs directly.

**Optimising the rebuild — measured, not guessed.** A pass is ~12-40s wall (the spread
is network, not code: the same build measured 12s, 35s and 49s on one laptop). Where it
goes, profiled:

| stage | share | note |
|---|---|---|
| `long_data` full read (18,271 rows) | **69%** of buildAll | one query, grows ~2,300 rows/event forever |
| rosters + users | ~20% | now issued in parallel with long data |
| aggregates (incl. photo HEAD checks) | ~5% | was 86% before the check was narrowed to candidates |
| write (diffed) | ~15% | 325 reads to avoid up to 325 writes; pays off below ~217 changed |

Already done: the three read stages run concurrently (roster+users stage 9.99s -> 6.94s,
1.44x, benchmarked alternating on one connection); the event list is read once and
threaded through; photo checks only cover players near the top of a row's ordering
(84s -> 12s at the time).

**The remaining win, and the one that matters: stop reading all of `long_data`.**
It is 69% of the build and it exists to compute `matches`, which for seven of eight
events cannot have changed since the last pass. The fix is per-event match summaries
written at recompute time — `src/lib/playerMatches.ts` already anticipates exactly this
("the fix is a per-game summary written at recompute time"). The build would then read
eight small documents instead of 18,271 rows.

Not built yet on purpose: it adds a derived collection to keep in sync, and the migration
touches `onLongDataUpload`, which sits on the scoring path. Against that, the benefit
today is a background job finishing in ~4s instead of ~13s and about $5 an event weekend —
nobody waits on it.

**Do it as scheduled off-season work, not as an optimisation.** The reason is timing, not
performance: the natural trigger (~50,000 rows, roughly two more seasons at ~2,300 rows an
event) lands mid-season, and refactoring the data pipeline during a live event is the
worst possible moment. "We will do it when it hurts" guarantees exactly that.

It is cheaper than it first looks, because `recomputeEvent` **already reads every long row
for the event** — it can write the game summaries from rows it has in memory, so the
trigger side costs no extra reads at all.

Plan when it happens:
1. `gameSummaries/{gameId}` — round, teams, points, and per-player kills plus type
   splits. Written by `recomputeEvent` from rows already loaded. ~400 docs today,
   growing ~50 an event, against 18,271 long rows growing ~2,300 an event.
2. One-off backfill for the 400 existing games before anything reads it.
3. `buildAll` reads game summaries instead of `long_data`. Keep a `--from-long-data`
   flag on the CLI so a true from-source rebuild stays the reconciliation — that is what
   preserves "a full rebuild is the definition of correct".
4. Verify the way the projection work was verified: a rebuild reporting `0 changed,
   325 unchanged` proves the new path is output-identical to the old one.

Smaller items, in rough value order:
- `matchesForEvent` is O(games x roster x rows-per-game) — it re-filters every game's
  rows once per player on the team. Indexing rows by playerId once per game would cut
  it, but it is not currently hot enough to measure against the network noise.
- The photo HEAD checks could be cached in Firestore (URL -> last known status) so a
  rebuild does not re-check the same ~45 URLs every pass.
- `writeAll` re-reads all 325 summaries to diff. Cheap and correct, but a stored content
  hash per player would make it one read.

Two follow-ups it does *not* cover:
- **Pick % during an open pick window.** The rebuild only triggers on long data, so
  before an event starts nothing marks the projection stale and pick % sits at
  whatever the last rebuild saw. Marking stale on every pick save would rebuild
  continuously for days (~22k reads a pass), so this needs its own cheaper path.
- **Cost during a live event.** A rebuild is ~22,000 reads. Continuous uploads mean
  one every 5 minutes — roughly $5 across an event weekend. Lengthen the schedule if
  that is not worth it.

**Pick % is on a temporary data path.** `fetchOwnership()` scans all ~1,600 user
documents on every player-page load. Fine locally, will not survive traffic.

The real version: ownership freezes at **pick lock**, so compute it once then and store
one summary doc per event. The calculation already exists in
`functions/extract-pick-percentages.js` — it writes an `.xlsx` today and needs to write
Firestore instead, triggered on `lockDate`. Then the page does one read.

Needs no long-data backfill. It is independent of everything below.

**Firestore rules, stages 2 and 3.** Stage 1 shipped (game data is read-only). `users`,
`leagues`, `notifications` and `shareCards` are still world-readable *and writable* —
1,600 emails, real names and Stripe customer ids. Full plan in `SECURITY_HARDENING.md`;
first step is creating the service-account key and adding it to `.env.local` **and**
Vercel.

---

## Player page — design

- [ ] **Scope toggle for the career charts.** Not needed at 8 events; it bites as the
      count grows. Cole Scott (`100192`) already shows the shape of the problem — five
      "not rostered" rows between his debut and his two played events.
      Decisions already taken, so the work is mechanical when it comes up:
      - **One control for the whole page**, not per panel. There is already a scope
        dropdown on Playing Style; a second window control on the kills chart would
        put two scopes on one page, which is the inconsistency this replaced.
      - **Offer time-based windows, not count-based** — `Career / Last 2 seasons /
        This season`. "Last 10 played" reaches back two seasons for an ever-present and
        five for an occasional player, so two charts stop meaning the same thing.
        A sparse career should give a sparse chart; that sparseness is real information.
      - **Career totals never window.** Career kills, all-time rank and the type
        breakdown stay over everything, or "career" drifts as events accumulate.
      - **The table never windows** — it is the record, let it scroll. Charts read a
        trend; tables get looked up.
      - Label the window on the chart, or a reader takes it for the whole career.
- [ ] **Semi-retired players need a status line rather than more chart logic.**
      Johnny Luckau (`100181`) is on 8 rosters with 7 DNPs because he moved to coaching
      — the league lists him as `Coach` for three 2026 events. Honest but nearly empty.
      Something like "Last played Tampa Bay 26", or a coach marker.

- [ ] **Pick the high-contrast palette.** Current set is ocean/coral/teal/sand/violet/cyan,
      validated at ΔE 16.0 normal vision / 8.8 CVD in both themes.
      ⚠️ Constraint learned the hard way: **muted palettes fail**. Low chroma is exactly
      what makes colours indistinguishable — three restrained sets were tried and all
      failed. Go for different *hues* at similar saturation, not lower saturation.
      Validate with `dataviz/scripts/validate_palette.js "<hexes>" --pairs all`.
- [ ] **Event history table.** The least-worked part of the page: very airy rows, the
      Team column floats alone mid-table, and every number carries equal weight so
      nothing guides the eye. Kills and rank are the interesting columns.
- [ ] **Page rhythm.** Five panels of identical radius, padding and background, so the
      reference table has the same visual weight as the career story. No hierarchy.
- [ ] **Hero tile whitespace** — bottom-aligned as agreed, which leaves 90px above the
      content and 18px below. The tile is 168px only because the photo sets the row
      height. Shrinking the photo or capping the tile column would tighten it without
      moving the numbers off the floor.

## Player page — features not built

- [ ] **Match detail — head-to-head and by-day views.** The per-match table is built
      (Matches tab on the history panel); these are the cuts it does not yet offer.
      Needs the long-data backfill (below) to be worth building.
- [ ] **Team tab.** `fetchPlayerMatches()` already computes `teamKills` and
      `opponentKills` per match — eliminations for and against. Parked from the player
      view because it describes the team, not the player. Note it is NOT the scoreline:
      X-Ball is won on points and long data holds no result, so it must never be
      coloured or labelled as a win.
- [ ] Team names and event names in the table are **not links** — the page is a dead end.
- [ ] No nav entry for players; reachable only from the stats table or by URL.

---

## Data

- [ ] **Review the data pipeline as a whole — we now ingest several streams and pull
      each one by hand.** Raised 4 Sep 2026. Not a bug; a shape problem that is starting
      to cost. What currently feeds the site, and how each arrives:

      | Stream | Source | How it gets in | Cadence |
      |---|---|---|---|
      | Rosters, costs, status | Google Sheet | `syncRoster()` on submit | live, automatic |
      | Long data (one row per kill) | Google Sheet | `02_LongDataUpload.gs` -> `longDataRecompute` | live, automatic |
      | Player identity (NXL numeric ids) | pbleagues crawl, `~/Documents/nxl-pro-players/crawl.js` | run by hand, CSV read by hand | ad hoc |
      | Match results + brackets | Power Rankings workbook, `5. Historic Results` | run by hand -> `functions/data/nxlHistory.json` | ad hoc |
      | Career projection | derived from the above | scheduled rebuild on a staleness marker | every 5 min when stale |

      The two ad-hoc rows are the problem. Both are a person remembering to run a script
      after an event, and both are now load-bearing for a page users see. Questions worth
      settling in one pass rather than one at a time:
      - **What triggers a pull?** An event finishing is the natural hook for both the
        roster crawl and the results import, and `eventEndsAt` already exists as a Cloud
        Task trigger for the badge recalculation.
      - **Where does match-result truth live?** Today it is a spreadsheet James maintains.
        pbleagues publishes the same results and the crawl is documented
        (`.claude/skills/pbleagues-match-data`), so the workbook could become a fallback
        rather than the source. That would also close the 2022 Golden State / Lone Star
        gap the workbook simply does not carry.
      - **What validates a pull before it lands?** `scripts/nxl-history/build.mjs` fails
        the run on anything it cannot resolve and `validate.mjs` checks the join against
        long data (400/400 today). That gate is the pattern; the other streams have
        nothing equivalent.
      - **How do we notice data going backwards?** The 4 Sep find below (participation
        and brand colours lost on 2026 events, with a stale projection the only thing
        still holding the good values) was caught by accident, by a diff written for an
        unrelated reason. `scripts/nxl-history/safety-diff.mjs` is that diff — running it
        on a schedule and alerting on a `CHANGED` bucket would have caught it in a day.

- [ ] **Live data loss on the 2026 events — projection is currently the only copy.**
      Found 4 Sep 2026 by `scripts/nxl-history/safety-diff.mjs`. Nothing is broken on the
      site *yet* because `projections/playerSummaries.staleSince` is unset, so no rebuild
      has run. The next upload sets that marker and the scheduled function publishes all
      of it within five minutes.

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

      Fix is to re-run `scripts/apply-participation.mjs` for `mid_west_open_2026` and
      restore `brand_color` on both 2026 events, then rebuild. Worth finding out what
      removed them first — `syncRoster()` owns a different field set and uses an update
      mask, so it should not have been able to.

- [ ] **Long Data stores player NAMES, not ids — fix at source.** Every data problem in
      the 31 Aug backfill traced to this. The scorer types a name, and the id is derived
      at upload from `lookups.playerIdByName[player] || ''` — which returns an empty id
      on any variant and writes the row anyway. A kill that scores for nobody looks
      exactly like a quiet game, so nothing surfaces it.
      Seven variants found across six events, four of which had **silently lost kills
      from the live site** since the original upload:

      | In Long Data | Roster | Cost |
      |---|---|---|
      | `Jackson Noodle Knees Frey` | Jackson Frey | 5 kills |
      | `Clay Hughes` | Clayton Hughes | 2 kills |
      | `Steve Pablo Wojnicz` | Steve Wojnicz | 2 kills |
      | `Alex DAcquisto` | Alex D'Acquisto | 1 kill |
      | `Matthew Askren` | Matt Askren | — |
      | `Francis Antetomaso` | Frank Antetomaso | — |
      | `Sebastian Ivan Lopez` | Ivan Lopez | — |

      Two fixes, both worth doing:
      - **Data-validation dropdown on the Player column**, sourced from `Live Data`, so
        a name that is not on the roster cannot be typed. Kills it at source; scorers
        still see names.
      - **Fail the upload on an unresolved name**, naming the row. `02_LongDataUpload.gs`
        currently writes a blank id and continues. Refusing a submit is far better than
        losing a kill — the sentinels (`Missed`, `Penalty`) stay the only legitimate
        rows without an id.

      A hidden id column alongside the name would also work, but the dropdown is simpler
      and does not change what a scorer sees.
- [ ] **Tampa Bay 2026 has no long data.** The archive holds 5 rows, all Finals — the
      file is literally named "Broken". Its published stats came from the old macro
      pipeline and have nothing to reconcile against, so it is the one event with no
      match detail. Recover the scoring sheet if it exists anywhere.
- [ ] **Three World Cup 2025 Ochos games were never scored** — Ironmen v TonTon,
      Damage v Leverage, Joy Division v X-Factor, all 2025-11-16. The league has them;
      we have no rows. Missing from the published stats too, so nothing disagrees — a
      completeness gap, not a correctness one.
- [ ] **Participation must be re-run after every event.** This is manual by choice
      until the offseason. After an event finishes and the league's team sheets settle,
      re-crawl `~/Documents/nxl-pro-players` and then:

      node scripts/dry-run-participation.mjs      # review the absent list
      node scripts/apply-participation.mjs --yes  # then write

      Both take `--csv <path>`. Use the **role-aware** export
      (`Player_Roster_Historic.csv`) — the older `nxl_pro_players_long.csv` has no
      `role` column and sweeps in coaches, staff and pit crew.
      Runs on firebase-admin via Application Default Credentials, which bypasses the
      Stage 1 rules; the client SDK cannot write to `events/{id}/players`.
      Rules live in `scripts/participation-plan.mjs`. Writes only `participation`,
      `participationReason`, `participationAt` — never a stat, pick or leaderboard field.
      *Offseason:* schedule this at `eventEndsAt` like the badge recalc, and port the
      crawler into `functions/`. Keep the 80% coverage floor — its failure mode is
      silently marking a whole roster absent.
- [ ] **Verify the "my picks" DNP path.** Absent players are hidden from the stats
      table but deliberately kept under *Show only my picks*, rendering `DNP` instead
      of zeros. Unverified in the browser: the test account holds no picks on an event
      where one of its players was absent. Check this at the next live event.
- [ ] **Finish the AFT/SDA team-code swap in the database.** James is renaming these in
      the Live Data sheet; once that lands, migrate the stored data and delete the
      display override.
      Target: Aftermath `SDA` → **AFT** · Aftershock `AFT` → **SHK**.
      - **The two codes collide** — Aftermath wants the code Aftershock holds. Must go
        through a temp value (`AFT`→`TMP`, `SDA`→`AFT`, `TMP`→`SHK`) or one atomic
        remap. A naive find-replace merges the two teams.
      - **`gameId` embeds the sorted team pair, and 6 of 8 re-sort** because `SHK`
        sorts after `DYN`/`IRN`/`JNG` where `AFT` sorted before them, e.g.
        `mid_west_open_2026_Friday_AFT-IRN` → `..._IRN-SHK`. Miss this and the Matches
        tab silently drops those games.
      - Scope at time of writing: **79 AFT + 70 SDA** docs in `events/{id}/players`,
        **453** `long_data` rows (`teamId`/`opponentId`), **8** gameIds, and
        `scripts/player-identity-registry.json` (16 + 12). Long-data counts grow with
        each event backfilled — re-scope before running.
      - **Do the sheet first.** `syncRoster()` owns `team_id` under an updateMask
        (`06_RosterSync.gs`), so migrating Firestore alone gets reverted on the next
        roster upload, leaving rosters and long data disagreeing.
      - Then **delete `TEAM_CODE_OVERRIDES`** from the player page — it exists only to
        paper over this, and leaving it in after the migration would double-swap.
      - ⚠️ Worth confirming before committing: the league's own data uses `SDA` for
        Aftermath, and `Player_Roster_Historic.csv` keys on it. Renaming ours means our
        codes stop matching theirs when reconciling rosters against their team sheets.
- [ ] **Long-data backfill — 7 events.** Only `mid_west_open_2026` has kill-by-kill rows
      loaded. Each remaining event needs row ids stamped, validating, uploading and
      verifying. **The Matches tab on the player page is already built and waiting** —
      each event lights up the moment its long data lands, no code change needed. Until
      then those events show a "no kill-by-kill data loaded yet" note.
- [ ] **Scope the match-detail query.** `fetchPlayerMatches()` reads every long row for
      the event (~2,900 today) and filters in memory. Fine for one event, and it only
      fires when the Matches tab is opened, but it grows with each backfill. The real
      fix is a per-game summary written at recompute time — the same move the pick-%
      path needs, and both could share one pass.
- [ ] **Decide on points-played.** Long data records kills only, so there is no
      denominator — no K/D, no per-point rates, and raw totals reward deep tournament
      runs over individual performance. **Cannot be applied retroactively**, so the
      decision only affects events from the next one onward.
- [ ] **`syncRoster()` guard** — refuse a roster that mints a new id for a player who
      already exists. This is the root cause of every merge defect fixed in August, and
      it recurs at every event boundary, not just season rollovers. James is building a
      crawler keyed on `league_id`; it must map to *existing* player ids, never mint
      fresh ones. Seed data: `scripts/player-identity-registry.json`.
- [ ] **4 players show the wrong headshot** — their `img_url` carries another player's
      league id: `100097` Josh Taylor, `100110` Mark Frans, `100177` Ashton Bufton,
      `100183` Diego Gallego.
- [ ] **Player photo library is the limit on the card grid.** Career-stats cards render
      only for players with a real, reachable photo — a brand rule, not a fallback — so
      the picture library now decides who can appear. Three separate problems sit under
      it, all surfaced by `build-player-summaries.mjs`:
      - **187 of 325 players have a real photo URL (58%).** The other 138 are reachable
        by search and appear in every table, but never as a card.
      - **12 of those URLs are 404s** and are excluded at build time (the script prints
        them on every run): Ashton Bufton, Charles Dowden Vii, Cj Canter, David Luckau,
        Diego Gallego, Jake McDarby, Jeronimo Patino Benavent, John Peterson, Johnny
        Luckau, Joseph Altamore, Rene Rodriguez, Tj Danner. Some overlap the wrong-
        headshot list above, so fixing identity may fix the URL.
      - **58 players carry `placeholder.svg` pointing at `pickem-paintball-cyan.vercel.app`**
        — a stale deployment, not production. Harmless while the cards filter it out,
        but any surface that renders `img_url` blindly breaks the day that deployment
        goes. Store an empty value instead.
      Source portraits are also inconsistent: almost all are 200x200 (a handful 300x300),
      and the subject is framed at different scales, so heads vary in size across the
      grid. Re-exporting at a consistent crop and >=400px would visibly lift the page.
- [ ] **Two roster identities won't join to the official team sheet.** Found by
      `dry-run-participation.mjs`, which cross-checks our rosters against the NXL
      team sheets scraped into `~/Documents/nxl-pro-players/Player_Roster_Historic.csv`.
      Neither breaks anything today — the kills-outrank-everything rule keeps both
      players visible — but neither can be validated either.
      - **`100053` Carlos Cortes — league_id `37312` looks wrong.** That id appears
        nowhere in the league's own data across 2015–2026, and no player named Cortes
        appears at all, yet he scores at all eight events (17 kills at Mid West 26).
        He was already one of the two ids the Aug identity pass could not resolve.
        Find his real numeric id the usual way: his avatar filename on pbleagues.com.
      - **`100174` Keith Devit — league_id `58216` is real but stale.** Rows exist only
        for 2017 (LA Ironmen) and nothing since, so he is absent from every recent team
        sheet while sitting on three of our rosters. Probably a genuine return the
        league never re-listed — worth confirming rather than assuming.

---

## Fonts

- [ ] **Roll the variable font out beyond the player page.** `HitmarkerVF-CondensedLight.ttf`
      is registered and the player page opts in via `data-numeric="variable"` on its root.
      Add that attribute per surface, check for overflow, move on.
      ⚠️ **wdth 25 renders ~43% wider** than the static Condensed Light everywhere else,
      so fixed-width numeric columns will break. Order of risk:
      dashboard home → leaderboard → stats table (`w-[7rem]` pinned) →
      pick-em (`GRID_COLS` fixed) → **share card last** (fixed 1080×1920 canvas; overflow
      clips silently rather than wrapping, so nothing will tell you it broke).
- [ ] Once every surface is converted, replace `.pickem-numeric` with the scoped block
      and drop the three static Hitmarker files.
- [ ] **Tailwind font aliases are misleading**: `font-azonix`, `font-inter`, `font-hanson`,
      `font-heading` and `font-body` all resolve to `--font-industry`. Applying
      `font-azonix` changes nothing. Worth collapsing.

---

## Bugs found in passing, not yet fixed

- [ ] **`firebasePublicEnv.ts:19` always reports env vars missing in the browser.** It
      reads `process.env[k]` with a *variable* key, and Next only substitutes literal
      `process.env.NAME` at build time. The scary red "Missing env" panel on the local
      login screen is a false positive and always has been.
- [ ] **`tailwind-merge` silently drops `leading-*` before `text-[size]`.** Cost an hour
      on the player page; likely present elsewhere.
- [ ] **Stale `tampa_bay_2025` event id** (real id is `tampa_bay_open_2025`) in
      `season-totals/page.tsx`, `SeasonTotals.tsx` and `user-details/route.ts:112`. All
      three are orphaned or dead code, but the id is a trap.
- [ ] **`pickems.test`** — a user has a `test` event key holding a real pick.
- [ ] **6 users have `isSubscribed: true`** with no Stripe customer, tier or status.
      Probably comped by hand; worth confirming, since until 22 Aug anyone could have set
      that on themselves with one HTTP request.
- [ ] Confirm **`NEXT_PUBLIC_DEV_ALLOW_UNVERIFIED_LOGIN`** is not set in Vercel — if true
      outside local dev, unverified accounts can sign in.

---

## Next features

- [ ] **Team pages** — same treatment as player pages. Team ids are clean since the
      August fix.
- [ ] **Share graphics** — extend the existing `api/share/og/route.tsx` pipeline
      (1,038 lines, `next/og`, 1080×1920 branded cards) rather than starting fresh.
- [ ] **Public player pages?** Currently under `/dashboard` behind auth. Player names are
      exactly what fans search for, so there is a real SEO case — but it is a product
      call, and it decides whether the data needs precomputing for static rendering.
