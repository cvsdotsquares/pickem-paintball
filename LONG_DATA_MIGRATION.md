# Long-Data Migration — Audit Findings & Implementation Plan

**Date:** 19 July 2026
**Supersedes:** `pickem-long-data-migration-handoff.md` (several of its assumptions are stale — see §1.4)
**Window:** Mid West Open ended 28 June; next picks open 3 September. No live scoring in between.

## STATUS — Phases 0–4 COMPLETE. Cutover done and verified (19 July 2026)

The long-data pipeline is now the only source of player stats.
`uploadEventWithPlayers()` is retired; `firestore.gs` deleted.

**Submit time: ~52s → ~3.6s.**

Cutover verification (Mid West Open, tested in both directions):

| Check | Result |
|---|---|
| Stats written by the function, not the sheet | ✅ `target=events` |
| Test kill applied then reverted | ✅ 2,285 → 2,286 → 2,285 |
| `Rank` computed server-side | ✅ all 218, matches sheet `RANK()` incl. ties |
| Roster metadata survives recompute writes | ✅ 0 of 218 docs lost `Player`/`Team`/`Cost`/`Status` |
| `events.last_updated` bump → `recalculateLeaderboard` | ✅ fired, 382 users ranked |
| `syncRoster()` diff | ✅ `written=0 unchanged=218` in 1.3s when nothing changed |

Measured post-cutover:
- Submit (1 row): **3.6s**, one batch request
- `recomputeEvent`: 13.3s cold / **8.2s warm** — dominated by reading all 2,940 long
  rows, so it scales with event size, not with how much changed
- `written=56` for a one-kill change: ranks are interdependent, so a single kill
  shifts everyone it passes. Expected, and still far below the old 218-every-time.

**Operational rule: void, don't delete.** Deleting a row from the sheet leaves its
Firestore document orphaned — harmless at weight 0, but a deleted weight-1 row
keeps counting forever with nothing in the sheet to explain it.

**Remaining: Phase 5 only — including the Node 20 deadline of 30 October.**

---

### Superseded — Phases 0–3 parallel run (kept for reference)

Both pipelines ran in parallel on every submit. Nothing user-facing changed.

| Path exercised against Mid West Open | Result |
|---|---|
| Bulk backfill, 2,937 rows / 49 games / 6 batch requests | ✅ 162 players, all 8 fields, exact match |
| Delta upload (2 new rows) | ✅ propagated to both pipelines |
| Amendment → void (`Reviewed`, weight 0) | ✅ aggregates corrected; rows retained as audit record |
| Idempotent re-run of `ensureRowIds()` | ✅ `assigned=0` — no duplicate ids |
| Validation abort (row with id but no data) | ✅ refused, nothing written |

Final diff: **218 players compared, 0 mismatches, 2,285 kills on both sides.**

Measured (previously estimated):
- `recalculateLeaderboard` 3,450ms — `readPlayers` 1,074ms, `readAllUsers` 787ms dominate; `allUsers=1597` vs `usersWithPicks=382`
- `recomputeEvent` 16,767ms for the 2,937-row backfill — read 15,383ms, aggregate 202ms, write 1,182ms
- Full backfill upload from Apps Script: 134s (not the "couple of seconds" originally estimated — 500-doc batch writes are slower than assumed). Steady-state deltas are one batch request.
- `migrateSingleEvent` now runs ~3× per upload, down from ~220.

**Remaining: Phase 4 (cutover) and Phase 5 (tidy-up, incl. the Node 20 deadline).**

---

## 1. Audit Findings

### 1.1 The cutover surface is one field

Every user-facing number traces back to **`Confirmed Kills`** on `events/{eventId}/players/{playerId}`.

| Consumer | Reads | Location |
|---|---|---|
| Event + season leaderboards | `Confirmed Kills` only | `functions/index.js:54` |
| Badges | `Confirmed Kills`, then `{eventId}PTS` / `{eventId}Rank` / `seasonRank` (all downstream of it) | `src/lib/badgeCalculator.ts:54` |
| ROI on user picks | `Cost` ÷ kills, computed client-side | `src/app/dashboard/leaderboard/page.tsx:1819`, `:2192`, `:2241` |
| Stats tables | `Confirmed Kills` + the 7 type splits | `src/app/dashboard/stats/page.tsx`, `src/components/Dashboard/datatable.tsx` |
| Season totals (2026) | Sums `Confirmed Kills` across events, client-side | `src/app/dashboard/stats/page.tsx:348` |

**The seven type splits (Gunfights, Breakshooting, Movement, Zone Coverage, Pressure, Trades, Unclassified) are display-only.** Nothing scores off them.

If the long-data recompute produces a correct `Confirmed Kills` per player per event, the entire scoring chain is satisfied. That is the whole diff to prove.

### 1.2 Write amplification — the main performance defect

`onPlayerChange` triggers on `events/{eventId}/players/{playerId}` **onWrite** and calls `migrateSingleEvent(eventId)`, which reads *all* players and rewrites *all* players, then does a second full read/write pass for ranking.

The macro writes 218 player documents one at a time, so:

> **218 player writes → 218 function invocations → each rewriting 218 docs, twice ≈ 95,000 writes per macro run.**

`onEventChange` fires `migrateSingleEvent` again on top. There is no infinite loop (it writes to a different path), but this is the dominant latency in the system.

Four separate triggers fire on `events/{eventId}`: `recalculateLeaderboard`, `onEventChange`, `onEventLogoChanged`, `scheduleBadgeRecalc`.

### 1.3 Upload is one HTTP request per row

`uploadEventWithPlayers` calls `firestore.updateDocument()` inside a `forEach` — 218 sequential round-trips at ~240ms each ≈ 1 minute. Request count is the bottleneck, not row count.

**Consequence:** at that rate, 2,940 long rows would take ~12 minutes, and Apps Script hard-kills execution at 6. **The initial backfill is impossible on the current pattern.** Batching is a prerequisite, not an optimisation.

### 1.4 Stale assumptions from the original handoff

| Assumption | Reality |
|---|---|
| "Functions increment season totals" | They don't. `migrateSingleEvent` uses `batch.set` (full overwrite); `run-migration.js` rebuilds from a fresh Map. Already recompute-not-increment. The only `FieldValue.increment` in the codebase is `totalParticipants` (`index.js:300`). |
| "Legacy flat fields `totalElims`/`lonestarElims`/`midwestElims`" | Zero references in `src`. Already removed. |
| "RIO isn't derivable" | It's spelled **ROI**, and it's `Cost ÷ Confirmed Kills` computed client-side. Needs no long-data change. |
| "Season totals are stale/manual" | 2026 season totals are live: `stats/page.tsx:341` tries the pre-aggregated `players/season_{year}/players` doc, and falls through to a client-side sum across `events/{eventId}/players` when absent. 2024/2025 use pre-aggregated docs written by `run-migration.js`; 2026 takes the fallback. |

### 1.5 Structural notes

- **`migrateSingleEvent`'s output may be unread.** It writes `players/season_{season}/{eventId}/{playerId}`; the frontend reads `players/season_{year}/players/{playerId}` — a different path shape, written only by `run-migration.js`. Verify before deleting.
- **`season-totals/page.tsx` is orphaned** — not linked anywhere in `src`. The live page is `stats/page.tsx`.
- **2026 season table has no per-event breakdown.** The client-side fallback sums totals but doesn't populate per-event columns (those literals are hardcoded for 2024/2025 in the pre-aggregated branch). Cosmetic; independent of this migration.
- **Live propagation works.** `stats` and `leaderboard` use `onSnapshot`, so changes reach open browsers without a refresh.
- **No per-player error handling in the upload.** If row 140 fails, 139 are uploaded and nothing records which.
- **Service-account private key is in the Apps Script source.** Should move to `PropertiesService`.
- **⚠️ Data-loss race in the Stats Tracker submit macros (pre-existing, unrelated to this migration).** `StatsTracker1()` and `StatsTracker2()` each do `getLastRow()` → `setValues()` with no lock. Two scorers submitting simultaneously compute the *same* destination row, and the second write silently overwrites the first — a full point of kills lost, no error raised. Fixed in `scripts/apps-script/03_StatsTrackerSubmit.gs` by serialising both trackers through one `LockService` lock.
- **Row-selection bug in the same macros.** They count non-empty rows, then re-read a *contiguous* block of that length from `DATA_START_ROW` — so any gap in the flattened block silently shifts which rows get appended. Fixed by keeping the filtered rows themselves rather than just their count.

---

## 2. The Long Data (verified against the live Mid West Open workbook)

2,940 rows. Columns: `Round | Date | Team | Opponent | Point | Player | Type | Weight`

| Field | Findings |
|---|---|
| `Round` | Friday, Saturday, Wildcard, Top8, Top4, Finals |
| `Date` | **Unreliable — must not be part of any key.** It drifts mid-game: Ironmen vs Red Legion has points 1–13 on 06-26 and point 14 on 06-27; Heat vs Red Legion has points 1–5 with a *null* date and 6–9 dated 06-28. Point numbering runs continuously across every split, which proves these are single games, not rematches. |
| `Player` | 164 distinct names; **163 matched the `Live Data` roster exactly.** All 218 roster players have a `player_id`; no duplicate names. Sentinels: `Missed` (484 rows, unattributed elim), `Penalty` (93 rows, free kill from opponent infraction). |
| `Type` | Movement 593, blank 549, Zone Coverage 491, Trade 454, Breakshooting 313, Gunfight 265, Pressure 257, Other 18. `Other` has no column in the aggregate, so it lands in `Unclassified`. |
| `Weight` | 1.0 (2,783) and **0.5 (150)** — shared kills, driven by the `Shared` toggle on the input form. Must always be **summed, never counted**. |
| Uniqueness | `Round + Team + Opponent + Point + Player + Type` has **280 collisions across 605 rows** — a player legitimately gets multiple same-type kills in one point. A row identifier is required. |
| Teams | Reconcile perfectly against `Live Data` in both directions. |

**Aggregation today:** `Live Data!K = SUMIFS('Long Data'!H:H, 'Long Data'!F:F, <player name>)`, with type columns adding a Type filter and `Unclassified = K - SUM(L:Q)`. Everything in the aggregate table is derivable from the eight long columns. Points-played is not tracked at all (future work).

---

## 3. Agreed Design

### 3.1 Principles

1. **Long rows are the only thing uploaded.** Aggregates are always derived, never uploaded.
2. **Recompute, never increment.**
3. **Read wide, write narrow.** The recompute reads *all* of an event's long rows from Firestore and rebuilds every player total in memory, then writes only the players whose numbers changed. Reading is cheap and guarantees correctness; writing is what costs time.
4. **Firestore derives its own aggregates.** The sheet never computes a total that gets uploaded — otherwise a silently failed row produces a total that can't disagree with its own data.
5. **Parallel run with diff** into `_v2` collections before any frontend cutover.
6. **If a stat can't be derived from long rows, extend the long schema** — never patch an aggregate.

### 3.2 Google Sheets changes

Three new columns in `Long Data` (append at **column I onward** — inserting at column A would shift every `SUMIFS` range in `Live Data`):

| Column | Owner | Values |
|---|---|---|
| `row_id` | Apps Script | `{eventId}_T{tracker}_{seq}` — opaque, **written as a static value**, never a formula |
| `sync_state` | Apps Script | blank → `Synced`; `Reviewed` → `Reviewed - Synced` |
| `last_modified` | Apps Script | timestamp |

**`row_id` must be opaque, not semantic.** A composite like `..._p4_100013_2` becomes a lie the moment someone corrects a misattributed kill. Since human revision is the use case, the ID must carry no revisable meaning.

**A Sheets formula would not work** — anything built on `ROW()`, `RAND()` or `NOW()` recalculates, and an ID that changes causes re-uploads to duplicate rather than update.

**`T{tracker}` prevents a real collision.** Stats Tracker 1 and 2 run simultaneously. If both computed "max + 1" they would mint the same ID and silently overwrite in Firestore. Per-tracker counters remove the contention without putting a lock in the hot path of live scoring.

**`sync_state` is one column with four compound states**, encoding both axes (pending/done × new/amended). The macro decides which value to stamp by reading the prior value — no Firestore lookup needed.

**Deletion = tombstone, not removal.** Set `Weight = 0`, highlight red (human cue only — cell colour is invisible to scripts and lost on export), and clear `sync_state` so the void gets pushed. Because every aggregate is `SUMIFS` over weight, a voided row contributes zero with no formula changes, the row stays visible, and the audit trail survives.

> **Rule this creates: never `COUNTIF` long data — always `SUMIFS` on weight.** Weight 0 excludes a row from a sum but not from a count.

**Unchanged:** the `Player` column keeps `Missed` and `Penalty` as sentinels. Neither must ever resolve to a `playerId`. A future major/minor split goes in the `Type` column.

### 3.3 Firestore schema

**One collection**, with `eventId` as an indexed field — not one collection per event. The failure case this migration exists to fix is *cross-event* aggregation; a single collection makes season totals one query instead of N fanned-out queries stitched together. Volume is trivial (~2,900 rows × ~5 events/year).

Per row:

```
row_id        (document ID — from the sheet, immutable)
eventId       stamped by the macro from EVENT_DETAILS.id — must match the events collection ID
gameId        {eventId}_{round}_{sorted team_ids}   ← derived at upload, not stored in the sheet
round, team, opponent, point, player, type, weight
date          attribute only — never part of any key
last_modified
```

**`gameId` sorts on `team_id` (`IMP`, `UPR`, `LEG`…), not display names.** Long Data stores each game twice, directionally (`Team=Impact, Opponent=Uprising` and the reverse); unconditional sorting collapses both to one ID. Team IDs are more stable than display strings, which can pick up sponsor prefixes mid-season.

`gameId` is **derived in the upload script, not maintained in the sheet** — a formula column sitting where scorers work will eventually be overwritten. It isn't needed for row identity; it's a denormalisation that makes per-game queries cheap for future features (head-to-head, per-game breakdowns).

**Caveat:** `Round` becomes part of game identity, so retroactively editing a round label orphans that game's rows. Confirmed with James: teams cannot play twice within a round under current tournament structures. If that ever changes, the form needs a game number.

### 3.4 Target pipeline

1. Scorer submits a point → rows land in `Long Data` with `row_id`, blank `sync_state`, `last_modified`.
2. Macro reads the sheet locally, filters to unsynced rows (~10–20), pushes them in **one batched request**, and stamps `sync_state` back **only after a confirmed successful write**.
3. Macro writes one manifest doc: `uploads/{eventId}_{timestamp}` → `{ eventId, affectedGameIds[], rowCount }`.
4. **One** function fires on the manifest. Reads all long rows for the event, recomputes every player total in memory, diffs against current player docs, writes only what changed.
5. That function touches `events/{eventId}.last_updated`, firing `recalculateLeaderboard` exactly as today.
6. `onSnapshot` listeners update open browsers live.

**Everything downstream of `Confirmed Kills` is unchanged** — leaderboards, badges, ROI, stats tables. This migration replaces how the number is computed, not what happens after it exists.

Expected per run: **1 invocation, ~3,000 reads, 5–20 writes** — against today's 218 invocations and ~95,000 writes.

---

## 4. Implementation Plan

### Phase 0 — Instrument and take the free win

- [ ] Add timing logs around each pipeline stage so optimisation targets real numbers, not estimates.
- [ ] Verify nothing reads `players/season_{season}/{eventId}/` (the path `migrateSingleEvent` populates).
- [ ] **Remove the `migrateSingleEvent` call from `onPlayerChange` (`functions/index.js:554`), keeping `handlePlayerStatusChange`.** Eliminates the 218× fan-out immediately, no migration dependency.
- [ ] Confirm Firestore and Functions are in the same region.

*Independent of everything below. Ship first.*

### Phase 1 — Apps Script: sheet columns and upload path

All of this is Apps Script and should be built in one pass. The ordering below is a
real dependency chain, not a phase boundary: `row_id` must exist before the upload can
address rows, and `sync_state` is only meaningful once there's an upload to stamp it.

**1a — Row identity (ship first, independently)**

- [ ] Add `row_id`, `sync_state`, `last_modified` at column I onward.
- [ ] Write `row_id` and `last_modified` as static values on append, only for rows with data (this also skips the `#N/A` empty rows for free).
- [ ] Backfill `row_id` for the existing 2,940 Mid West Open rows.
- [ ] Document the void-don't-delete convention for scorers.

*Deadline-driven: every row scored without a `row_id` needs backfilling later. This is
the one piece that touches the live scoring submit path, so it wants its own testing.*

**1b — Upload (greenfield, alongside the existing macro)**

- [ ] Resolve whether `FirestoreApp` exposes `:batchWrite`. If not, call the REST endpoint directly via `UrlFetchApp` with a service-account token (500 writes/request), or fall back to `UrlFetchApp.fetchAll()` for parallelism. *Blocks the rest of 1b — resolve first.*
- [ ] Build the delta upload: filter on `sync_state`, batch, confirm, then stamp back.
- [ ] Derive `gameId` and stamp `eventId` at upload time.
- [ ] Upload validation: reject null weights, unmatched player names, malformed rows.
- [ ] Write the manifest doc on completion.
- [ ] Move the private key to `PropertiesService`.

*The existing `uploadEventWithPlayers` is untouched throughout — it gets retired at cutover, not modified.*

**1c — Stamp row identity at entry, and fix the submit race** (`03_StatsTrackerSubmit.gs`)

- [ ] Replace `StatsTracker1()` / `StatsTracker2()` with the locked, shared implementation. Entry-point names are unchanged so existing buttons keep working.
- [ ] Verify both trackers still submit correctly, including a deliberate simultaneous-submit test.

*Two reasons this is worth doing rather than leaving ids to `ensureRowIds()`:*

1. *`last_modified` becomes the time data was **entered** rather than the time it
   was first uploaded — which is what makes it usable as an audit trail.*
2. *It fixes the pre-existing data-loss race (§1.5). That bug is live today and
   is worth fixing on its own merits, migration or not.*

*`ensureRowIds()` stays as the safety net for rows arriving any other way
(manual paste, backfill, or a submit that failed after writing but before
stamping). Test this before an event, never during one — it is the only change
in this plan that touches the live scoring path.*

### Phase 2 — Recompute function

- [ ] Trigger on the manifest doc, not on rows.
- [ ] Read all long rows for the event → recompute all player totals → diff → write only changes.
- [ ] Write to **`_v2` collections**. Nothing user-facing yet.
- [ ] Backfill the full Mid West Open long dataset so there's real data to diff.

### Phase 3 — Parallel run and diff

- [ ] Compare `_v2` recomputed `Confirmed Kills` against the live per-player values, for all 218 players.
- [ ] Compare the seven type splits.
- [ ] **Cutover gate: every number matches, or every difference is explained.**

### Phase 4 — Cutover

- [ ] Point the frontend at the derived aggregates.
- [ ] Retire `uploadEventWithPlayers`.
- [ ] Remove `migrateSingleEvent` / `onEventChange` if confirmed unread.

### Phase 5 — Tidy-up and future

- [ ] **⏳ Node 20 → 22 runtime upgrade. HARD DEADLINE: 30 October 2026.** Node 20 was deprecated 30 April 2026 and is decommissioned 30 Oct; after that date **no function can be deployed or updated** while `engines.node` is `20`. Existing functions will most likely keep running but become unsupported — the real exposure is being frozen, unable to ship a fix.
  - Changes are small: `functions/package.json` `engines.node` → `22`, `firebase-functions` `^4.5.0` → `^6`, and `index.js:1` `require('firebase-functions')` → `require('firebase-functions/v1')`. All 8 v1-style triggers then work unchanged; the v2 imports (`/v2/tasks`, `/params`) are unaffected.
  - **The risk is `sharp`**, the native image library behind `onEventLogoChanged`'s brand-colour extraction — native modules are what actually break across Node versions. Verify logo colour extraction explicitly after deploying.
  - Redeploys all ten functions at once, so it wants its own focused session.
  - **Do it before 3 September** if at all possible — that's when picks open for Lone Star and the no-live-event window closes.
- [ ] **`onEdit` trigger** that clears `sync_state` automatically when a row is edited. *Important: manual amendment flagging will be forgotten, and a forgotten flag means a correction silently never reaches production.*
- [ ] **Event creation macro.** Setting up a new event still means hand-editing `EVENT_DETAILS` in `05_EventSetup.gs` then running `setupEvent()`. A guided macro (prompt for the fields, validate, write) would be less error-prone. *Partly addressed in Phase 4: `EVENT_DETAILS` now has a single definition and `getEventId_()` reads from it, so the event id can no longer drift between two copies.*
- [ ] Per-event breakdown columns for the 2026 season table.
- [ ] Delete the orphaned `season-totals/page.tsx`.
- [x] ~~Restrict the upload to a known column list~~ — done in Phase 4: `syncRoster()` writes only the named fields in `ROSTER_CONFIG.fields`, so the blank headers in columns S–AB are no longer mapped into `""` field names.
- [ ] Latency: minimum instances to kill cold starts; consider collapsing the recompute → leaderboard trigger hop into one invocation; watch the full `users` scan in `recalculateLeaderboard` as the user base grows.
- [ ] Two-level aggregation (per-game subtotals) if reads ever become the bottleneck — takes ~3,000 reads to ~40.
- [ ] New use cases: points played, per-game breakdowns, form over last N events, head-to-head, pick % trends.

---

## 5. Open Items

- `FirestoreApp` batch-write support — needs verifying before Phase 1b.
- Whether anything consumes `players/season_{season}/{eventId}/` — gates the Phase 4 deletions.
- Fix `Alex DAcquisto` → `Alex D'Acquisto` (the one name that didn't match the roster).
- Where end-to-end latency actually goes — measure in Phase 0 before optimising.
