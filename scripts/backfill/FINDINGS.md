# Historic long-data backfill — 31 Aug 2026

**Uploaded: Atlantic City 2025 and Lone Star 2025.** Both passed every check, and the
recompute they triggered reproduced the published stats exactly — 0 totals changed
across 391 players. Four events still halt; each needs something fixed at source.

| Event | Rows | Status | Blocking |
|---|---|---|---|
| atlantic_city_2025 | 2,272 | **uploaded** | — |
| lonestar_open_2025 | 1,477 | **uploaded** | — |
| tampa_bay_open_2025 | 2,527 | halted | 1 stat delta |
| world_cup_2025 | 2,447 | halted | 1 split game, 1 unknown fixture |
| mid_atlantic_open_2026 | 2,437 | halted | 1 unresolved name |
| midwest_open_2025 | 1,783 | halted | 1 delta, 6 unresolved names, 6 unknown fixtures |

Excluded: `tampa_bay_2026` (archive holds 5 rows — the "Broken" file) and
`mid_west_open_2026` (already loaded; archive has no row_ids so re-upload would duplicate).

---

## What resolving by ID fixed

Switching from name-matching to **archive id → identity remap → live id** cleared almost
every name problem at once. The archives predate the 22 Aug fix, so their ids are correct
as of export but stale now; `identity-fix-plan.mjs` holds the exact remap.

```
100052 → 100389  Askren        100145 → 100381  Antetomaso
100149 → 100403  Lopez         100313 → 100207  Donaldson
```

No archive id failed to remap onto a live player, so the identity fix accounted for
everyone — the "larger problem" case did not occur.

## What the fixture list settled

Of 12 team pairs appearing under two rounds, **10 were never splits** — those teams
genuinely met twice, once in prelims and again in a playoff, and the league's record
says so. Flagging them was over-caution.

Two were real and were corrected automatically from the league's own round:

```
world_cup_2025          LEG v TON   Friday → Top8      (league: Quarters, 2025-11-16)
mid_atlantic_open_2026  AFT v HUR   Friday → Saturday  (league: D Prelims, 2026-05-01)
```

Prelims cannot be mapped directly — ours are days, the league's are groups — so the
correct day is derived from the fixture's DATE against the day labels the event's own
rows use.

---

## Still to fix, at source

### 1. Midwest 2025 has shifted rows
19 rows carry a kill TYPE in the player column (`Zone Coverage` ×7, `Gunfight` ×5,
`Pressure` ×4, `Movement` ×2, `Other` ×1) and three "teams" named `1`, `2`, `3`. A column
misalignment, not a name problem. This is also what causes its 6 unknown fixtures.

### 2. Two names not on any roster
- **`Alex DAcquisto`** (Mid Atlantic 2026, 1 kill) — missing apostrophe; roster has
  `Alex D'Acquisto`. Fixing the sheet or adding the roster spelling clears this event.
- **`Jackson Noodle Knees Frey`** (Tampa Bay 2025, 5 kills) — a nickname. Resolves by
  name to `Jackson Frey`, which is why Tampa Bay's only blocker is the delta below.

### 3. World Cup: HEA v UPR under three rounds
`Saturday + Friday + Top8`, and the league records two meetings. Two of those three
labels are right; one is a typo. Needs a human — the fixture list cannot say which.

### 4. Two stat deltas where the long data is MORE correct
- **Jackson Frey, Tampa Bay 2025: published 0 → 5.** His kills were logged under the
  nickname and the original upload lost them.
- **Clayton Hughes, Midwest 2025: published 11 → 13.** Same cause (`Clay Hughes`).

Both are corrections, not regressions — but they change a published number, so the gate
holds them. Approving them is a decision, not a fix.

---

## Calendar mismatch

The sheets and the league disagree by a day on some events:

```
tampa_bay_open_2025   ours Mar 7–9     league Mar 7–9     identical
atlantic_city_2025    ours May 2–4     league May 1–3     ours a day later
midwest_open_2025     ours Jun 20–22   league Jun 19–21   ours a day later
```

Prelims are matched with ±1 day tolerance. Without it, 84 real games were rejected over
a calendar quibble. Worth reconciling at source eventually; not blocking.
