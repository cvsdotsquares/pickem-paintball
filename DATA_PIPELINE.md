# PickEm Paintball — Stats Data Pipeline

**How player stats get from a live paintball point to the website.**

This describes the system as it works now. For *why* it was built this way and what
it replaced, see [`LONG_DATA_MIGRATION.md`](./LONG_DATA_MIGRATION.md).

Last updated: 19 July 2026 (post-cutover).

---

## 1. The shape of it, in one line

> A scorer records a kill → it becomes a **row** in a Google Sheet → the row is
> uploaded to Firestore → a Cloud Function **derives** every aggregate from those
> rows → the site updates.

The governing principle: **long rows are the only thing ever uploaded. Every
aggregate is derived, never uploaded.**

That's what makes the pipeline idempotent. Uploading the same rows twice, or
deleting and re-uploading an entire event, cannot double-count — because totals are
rebuilt from scratch from the underlying rows rather than adjusted in place.

---

## 2. End-to-end flow

```
┌─ GOOGLE SHEET ──────────────────────────────────────────────────────┐
│                                                                     │
│  Stats Tracker 1 / 2   (two scorers, one per side of the bracket)   │
│         │  scorer enters a point, hits Submit                       │
│         ▼                                                           │
│  SubmitAndSync1() / SubmitAndSync2()      ← the buttons             │
│         │                                                           │
│         ├─ 1. StatsTracker1()      flatten form → Long Data         │
│         │                          + row_id, last_modified          │
│         │                          (lock-guarded)                   │
│         │                                                           │
│         ├─ 2. syncRoster()         player metadata → Firestore      │
│         │                          batched + diffed (~0–2s)         │
│         │                                                           │
│         └─ 3. uploadLongDataDelta()  unsynced rows → Firestore      │
│                                      one batch, then a manifest     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ FIRESTORE ─────────────────────────────────────────────────────────┐
│  long_data/{row_id}          the granular rows (source of truth)    │
│  uploads/{eventId}_{ts}      one manifest doc per upload            │
└─────────────────────────────────────────────────────────────────────┘
                              │  manifest triggers ↓
┌─ CLOUD FUNCTIONS ───────────────────────────────────────────────────┐
│  onLongDataUpload                                                   │
│    reads ALL long rows for the event                                │
│    recomputes every player's totals + Rank from scratch             │
│    writes only the players whose numbers changed                    │
│    bumps events/{eventId}.last_updated  ─────┐                      │
│                                              ▼                      │
│  recalculateLeaderboard                                             │
│    reads all players + all users                                    │
│    writes leaderboards/{eventId}, leaderboards/season_{year},        │
│    and per-user flat fields                                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              Website — onSnapshot listeners update live
```

**Timing:** a submit returns in ~3.6s. The recompute runs after, taking ~8s warm.

---

## 3. The Google Sheet

One spreadsheet per event. Every past event has one, all with the same structure.

### 3.1 Long Data — the source of truth

| Col | Field | Notes |
|---|---|---|
| A | `Round` | Friday, Saturday, Wildcard, Top8, Top4, Finals |
| B | `Date` | **Attribute only — never part of any key.** It drifts mid-game (a game running past midnight lands its last points on the next date). |
| C | `Team` | The team credited with the kill |
| D | `Opponent` | |
| E | `Point` | Point number within the game; continuous across a game |
| F | `Player` | A player name, or the sentinels `Missed` / `Penalty` |
| G | `Type` | Gunfight, Breakshooting, Movement, Zone Coverage, Pressure, Trade, Other, or blank |
| H | `Weight` | `1` normally, `0.5` for shared kills, **`0` = voided** |
| I | `row_id` | Permanent opaque id, e.g. `mid_west_open_2026_000123` |
| J | `sync_state` | See §3.2 |
| K | `last_modified` | When the row was entered |

Each game appears **twice, directionally** — one set of rows for each team's kills.

### 3.2 `sync_state` — the four values

| Value | Meaning | Uploaded next run? |
|---|---|---|
| *(blank)* | New row, never uploaded | Yes |
| `Reviewed` | Amended by a human | Yes |
| `Synced` | New row, uploaded | No |
| `Reviewed - Synced` | Amended row, uploaded | No |

The macro writes `Synced` and `Reviewed - Synced`. A human only ever writes `Reviewed`.

Anything that isn't **exactly** `Synced` or `Reviewed - Synced` is treated as pending.
The comparison is case-sensitive, and `Reviewed - Synced` has spaces around the hyphen.

### 3.3 Live Data — the roster

Player metadata: `player_id`, `Player`, `Team`, `team_id`, `Cost`, `Status`, `Number`,
`img_url`, `league_id`. **This is not derivable from long rows** — it's uploaded
separately by `syncRoster()`.

The stat columns in this sheet (`Confirmed Kills`, the type splits, `Rank`) are still
computed by in-sheet `SUMIFS` for the scorers' benefit, but **they are no longer
uploaded anywhere.** Firestore derives its own. If the sheet and the site ever
disagree, the site is right.

---

## 4. The macros

All in the sheet's Apps Script project. Repo copies live in
[`scripts/apps-script/`](./scripts/apps-script) — **these do not sync automatically.**
Edit one, and you must paste it into the other.

| File | Entry points | When it runs |
|---|---|---|
| `01_LongDataRowIds` | `ensureRowIds()`, `backfillRowIds()`, `auditLongData()` | Automatically before every upload; manually for backfill/audit |
| `02_LongDataUpload` | `uploadLongDataDelta()`, `dryRunLongDataUpload()` | Every submit |
| `03_StatsTrackerSubmit` | `StatsTracker1()`, `StatsTracker2()` | Every submit |
| `04_SubmitAndSync` | `SubmitAndSync1()`, `SubmitAndSync2()` | **The buttons** |
| `05_EventSetup` | `setupEvent()` + `EVENT_DETAILS` | Manually, when creating or editing an event |
| `06_RosterSync` | `syncRoster()` | Every submit |

### Credentials

Three Script Properties (Project Settings → Script Properties):

```
FIREBASE_PROJECT_ID      fantasy-paintball
FIREBASE_CLIENT_EMAIL    firebase-adminsdk-fbsvc@fantasy-paintball.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY     -----BEGIN PRIVATE KEY-----\n…
```

The upload calls the Firestore **REST API** directly rather than using the
`FirestoreApp` library, because that library only writes one document per HTTP
request. At ~240ms per request, 2,937 rows would take ~12 minutes and exceed Apps
Script's 6-minute execution ceiling. `:batchWrite` takes 500 writes per request.

---

## 5. Firestore

| Collection | Written by | Contains |
|---|---|---|
| `long_data/{row_id}` | `uploadLongDataDelta()` | Granular rows — **source of truth** |
| `uploads/{eventId}_{ts}` | `uploadLongDataDelta()` | Upload manifest; triggers the recompute |
| `events/{eventId}` | `setupEvent()`, recompute | Event metadata + `last_updated` |
| `events/{eventId}/players/{playerId}` | `syncRoster()` **and** recompute | Metadata + stats — see §6 |
| `leaderboards/{eventId}` | `recalculateLeaderboard` | Per-event user scores |
| `leaderboards/season_{year}` | `recalculateLeaderboard` | Season user scores |

### Long row document

```js
{
  row_id, eventId,
  gameId,                    // {eventId}_{round}_{sorted team ids}
  round, team, teamId, opponent, opponentId, point,
  player, playerId,          // playerId is null for Missed / Penalty
  credit,                    // "player" | "missed" | "penalty"
  type, weight, date, last_modified
}
```

**`gameId`** sorts the two team ids so both directional halves of a game collapse to
one id — `IMP-UPR` regardless of which side the row belongs to. It sorts on `team_id`
rather than display name, because ids don't change when a team picks up a sponsor
prefix mid-season.

---

## 6. Field ownership — the one thing not to break

`syncRoster()` and the recompute function **both write to the same player
documents**. They must never touch each other's fields.

| Owner | Fields |
|---|---|
| `syncRoster()` | `player_id`, `league_id`, `img_url`, `team_id`, `Player`, `Status`, `Number`, `Team`, `Cost` |
| Recompute function | `Confirmed Kills`, `Gunfights`, `Breakshooting`, `Movement`, `Zone Coverage`, `Pressure`, `Trades`, `Unclassified`, `Rank` |

`syncRoster()` enforces this with an `updateMask`; the recompute uses `merge: true`.
**If you add a field, decide which side owns it** — a field written by both will
flip-flop on every submit.

---

## 7. Invariants

These are load-bearing. Breaking one causes quiet, hard-to-trace wrongness.

**Always SUM weight, never COUNT rows.** Shared kills carry `0.5` and voided rows
carry `0`. Counting rows readmits both.

**`row_id` must be a static value, never a formula.** Anything built on `ROW()`,
`RAND()` or `NOW()` recalculates, and an id that changes makes re-uploads *duplicate*
instead of *update*.

**`row_id` is opaque and carries no meaning.** A semantic id encoding player or point
becomes a lie the moment someone corrects a misattributed kill.

**`Date` is never part of any key.** It drifts mid-game.

**`Missed` and `Penalty` must never resolve to a `playerId`.** They're team-level
events; the recompute skips anything where `credit !== 'player'`.

**Recompute, never increment.** Rebuild totals from all rows. Adjusting stored values
is what caused the original double-count bug.

**Round labels are part of `gameId`.** Retroactively editing one orphans that game's
rows. Also assumes two teams never play twice within one round — true under current
tournament structures; if that changes, the form needs a game number.

---

## 8. Operating it

### Normal event

1. Edit `EVENT_DETAILS` in `05_EventSetup.gs`, run **`setupEvent()`**
2. Populate the Live Data roster
3. Scorers use the tracker buttons — everything else is automatic

### Correcting a mistake — void, don't delete

**Never delete a row from the sheet.** The Firestore document stays behind, and a
deleted weight-1 row keeps counting forever with nothing in the sheet to explain it.

To void:
1. Set **`Weight` to 0**
2. Set **`sync_state` to `Reviewed`**
3. Optionally highlight red — a human cue only; cell colour is invisible to scripts
4. Submit, or run `uploadLongDataDelta()`

The row stays in `long_data` as an audit record, contributing nothing.

To amend a value, change it, set `sync_state` to `Reviewed`, and re-upload. The
`row_id` is unchanged, so the document is updated in place.

### Checking before you trust it

| Function | What it does | Writes? |
|---|---|---|
| `auditLongData()` | Reports null weights, missing ids, malformed rows | No |
| `dryRunLongDataUpload()` | Reports exactly what would upload, incl. validation errors | No |
| `scripts/diff-long-data-v2.js` | Compares recomputed vs live, field by field | No |

The upload **aborts entirely** on any validation error — unmatched player name,
missing/negative weight, missing team — rather than writing partial data. It alerts
loudly because a silent failure during live scoring would leave a scorer believing
their data landed.

---

## 9. Performance

| Operation | Time | Notes |
|---|---|---|
| Submit (1 point) | **~3.6s** | Was ~52s before the migration |
| `syncRoster()`, nothing changed | 1.3s, 0 writes | Diffed |
| Recompute | 8.2s warm / 13.3s cold | Reads all ~3,000 rows |
| `recalculateLeaderboard` | ~3.5s | Reads all 1,597 users |
| Full event backfill | ~134s | One-off, 6 batch requests |

The recompute scales with **total event size**, not with how much changed — it reads
every row every time. That's deliberate: it's what makes the result correct by
construction. At ~3,000 rows it's comfortable.

`written=56` for a single kill is normal. Ranks are interdependent, so one kill shifts
everyone it passes.

---

## 10. Troubleshooting

**"Upload aborted — N invalid rows"** — validation caught something. The alert names
the sheet row and reason. Nothing was written. Fix and re-run.

**A submit succeeded but the site didn't update** — check the `onLongDataUpload` logs
(`firebase functions:log --only onLongDataUpload`). If the recompute wrote nothing,
`events.last_updated` isn't bumped and the leaderboard won't refresh; that's correct
when nothing changed.

**Sheet and site disagree** — the site is authoritative. The sheet's `SUMIFS` are for
the scorers; Firestore derives its own. Run the diff script to see field-by-field
differences.

**Rows uploading repeatedly** — `sync_state` isn't matching exactly. Check for a
trailing space or wrong capitalisation. Harmless (same document id, overwritten) but
it inflates row counts.

**A row exists in Firestore but not the sheet** — someone deleted instead of voiding.
Find it by `row_id` in `long_data` and set its weight to 0 directly, or restore the
sheet row.
