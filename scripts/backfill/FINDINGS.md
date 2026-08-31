# Historic long-data backfill — dry run, 31 Aug 2026

Nothing was uploaded. Every one of the six events tripped the gate, which is the
designed outcome: the gate halts an event rather than rewriting published stats
unattended, and a halt never blocks the others.

Full output: `DRY-RUN-2026-08-31.txt`. Re-run with `node scripts/backfill/run.mjs`.

| Event | Rows | Stat deltas | Unresolved names | Split games | Unknown fixtures |
|---|---|---|---|---|---|
| tampa_bay_open_2025 | 2,527 | 2 | 1 | 0 | 0 |
| atlantic_city_2025 | 2,272 | 1 | 1 | 2 | 0 |
| midwest_open_2025 | 1,783 | 2 | 7 | 3 | 6 |
| lonestar_open_2025 | 1,477 | 1 | 1 | 0 | 0 |
| world_cup_2025 | 2,447 | **0** | **0** | 2 | 1 |
| mid_atlantic_open_2026 | 2,437 | 1 | 2 | 4 | 1 |

Excluded: `tampa_bay_2026` (archive holds 5 rows, all Finals — the "Broken" file) and
`mid_west_open_2026` (already loaded; the archive carries no row_ids, so re-uploading
would duplicate all 2,940 rows and restore the three voided rows deleted on 31 Aug).

---

## 1. Split games — the round errors you predicted

12 across five events. One match whose rows were scattered across two gameIds by a
mistyped round, so both halves are wrong and neither looks wrong on its own.

```
atlantic_city_2025       FIT v XFA   Friday + Top8
                         ACD v FIT   Saturday + Wildcard
midwest_open_2025        AFT v TON   Friday + Top8
                         IRN v XFA   Friday + Wildcard
                         LEG v TON   Saturday + Finals
lonestar_open_2025       HUR v XFA   Saturday + Top4
world_cup_2025           HEA v UPR   Saturday + Friday + Top8   ← three rounds
                         LEG v TON   Friday + Top8
mid_atlantic_open_2026   IMP v IRN   Friday + Top8
                         AFT v HUR   Saturday + Friday
                         DAM v HUR   Saturday + Top8
                         DYN v FIT   Saturday + Top8
```

Most are a prelim round mislabelled as a playoff one. Fixing means correcting the
round in the source sheet — these are the rows to look at.

## 2. Names that need a human

Auto-resolution handles clear shortenings (`Matthew`→`Matt`, `Sebastian Ivan Lopez`→
`Ivan Lopez`, `Jackson Noodle Knees Frey`→`Jackson Frey`) but refuses anything where a
wrong guess would credit the wrong player. These need confirming once, then they can be
added as explicit aliases:

- **`Francis Antetomaso` → `Frank Antetomaso`?** Appears at Tampa Bay, Atlantic City and
  Midwest 2025. Costs him 2 / 10.5 / 6.5 kills respectively — the largest single issue
  in the batch.
- **`William Donaldson` → `Carter Donaldson`?** Lone Star, 6 kills. Note the identity fix
  already merged a Carter/William Donaldson pair, so this is probably the same person.
- **`Ronnie Tiner` → `Ronny Tiner`?** Mid Atlantic 2026, 11 kills.
- **`Alex DAcquisto` → `Alex D'Acquisto`?** Mid Atlantic 2026, 1 kill — an apostrophe.

## 3. Midwest 2025 has shifted rows

19 rows carry a kill TYPE in the player column — `Zone Coverage` ×7, `Gunfight` ×5,
`Pressure` ×4, `Movement` ×2, `Other` ×1 — and three "teams" are named `1`, `2`, `3`.
That is a column misalignment in the source sheet, not a name problem. Worth fixing at
source before this event is loaded.

## 4. Stat deltas — where long data disagrees with what is published

Small and all explained. Two are corrections in our favour:

- **Jackson Frey, Tampa Bay 2025: published 0 → 5.** His kills were recorded under a
  nickname the original upload could not resolve, so they were lost. The long data is
  more correct than what is live.
- **Clayton Hughes, Midwest 2025: published 11 → 13.** Same cause (`Clay Hughes`).

The rest are the unresolved names above, and resolve themselves once those are confirmed.

**World Cup 2025 has zero deltas across 229 players** — the long data reproduces the
published stats exactly. That is a strong signal the pipeline is faithful, and it is why
World Cup is the natural first upload once its two split games are fixed.

## 5. Calendar mismatch between the two sources

The sheets and the league's fixture list disagree by a day on some events:

```
tampa_bay_open_2025    long data Mar 7–9    fixtures Mar 7–9    identical
atlantic_city_2025     long data May 2–4    fixtures May 1–3    ours a day later
midwest_open_2025      long data Jun 20–22  fixtures Jun 19–21  ours a day later
```

Neither source is consistently right, so prelim fixtures are matched with ±1 day
tolerance. Without it, 84 real games were rejected over a calendar quibble. Worth
resolving at source eventually, but it is not blocking anything.
