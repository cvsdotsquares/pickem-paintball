# Roster Identity — how players are identified and how rosters get created

**Read this before writing anything that creates or updates a roster.**

Every identity defect this project has had came from one mistake: treating a player's
name, or their position in a list, as who they are. This document exists so that
mistake cannot be made again.

Last updated: 22 August 2026, after the identity fix.
See also [`DATA_PIPELINE.md`](./DATA_PIPELINE.md) for how stats flow once a roster exists.

---

## 1. The two identifiers

There are two, they are not interchangeable, and neither can be dropped.

| | `player_id` | `league_id` |
|---|---|---|
| Example | `100307` | `108677` |
| Owned by | **us** | the NXL |
| Means | the key a user's pick resolves against | which human being this is |
| Where it lives | Firestore doc id, `pickems` arrays, Live Data sheet | roster field, embedded in the photo filename |
| Can it change? | **Never** | Never (it's the league's) |

> **`league_id` is the identity. `player_id` is the key that history depends on.**

A user who picked `100307` for World Cup 2025 has that number stored in their
`pickems`. Their score, rank and badges all resolve through it. It cannot be
reassigned, reused, or renumbered — not for tidiness, not to close a gap in the
sequence, not ever.

`league_id` is what tells you that "Matt Askren" and "Matthew Askren" are one person.
Names cannot do this. Neither can jersey numbers.

---

## 2. The registry

[`scripts/player-identity-registry.json`](./scripts/player-identity-registry.json) is the
authoritative map. **325 players, 321 with a `league_id`, zero clashes.**

```jsonc
{
  "player_id": "100307",
  "league_id": "108677",
  "Player":    "Leonid Smotrov",
  "team_id":   "LEG",
  "events":    ["atlantic_city_2025", "..."]
}
```

Any tool that creates a roster **must load this first** and treat it as read-only
input. Do not re-derive it — a second derivation that disagrees is exactly how this
went wrong before.

Four players have no `league_id` yet: `100349` Nicholas Schaedel, `100350` Norman
Reitemyer, `100360` Henry Portillo, `100362` Joey Petrucelli. They must be resolved
by hand before appearing on a new roster.

---

## 3. The rules

These are load-bearing. Breaking one causes quiet, hard-to-trace wrongness that
surfaces months later as wrong season totals.

**1. Never mint a new `player_id` for a `league_id` already in the registry.**
This is the single most important rule. It is the cause of every merge defect found
so far — returning players were re-entered as new people at event boundaries.

**2. Never match players by name.** Not exact, not fuzzy, not as a fallback.
Names in this dataset vary as `Matthew`/`Matt`, `Francis`/`Frank`,
`Dustin`/`Dusty`, `Steve Pablo`/`Steve`, and once as `Carter`/`William` for the same
person. Two different people can also share a name.

**3. Never reassign an existing `player_id` to a different person.** If a number is
in the registry, it belongs to that person permanently, including after they retire.

**4. Never renumber a historic roster.** Past events are frozen. Their ids resolve
picks that are already scored.

**5. `player_id` is global, not per-event.** One number per person, across all events
and all seasons.

**6. Refuse rather than guess.** A roster that fails validation must abort entirely
and report why. A partially-written roster is worse than no roster.

---

## 4. Creating a roster

```
1. Crawl the event roster from the NXL           -> [{league_id, name, team, number, photo}]
2. Load scripts/player-identity-registry.json    -> league_id -> player_id
3. For each crawled player:
     league_id in registry?
        YES -> reuse that player_id                    (returning player)
        NO  -> mint the next unused player_id,
               append to the registry                  (genuinely new player)
4. Validate (§5). Abort entirely on any failure.
5. Write the roster.
6. Commit the updated registry.
```

**Minting:** the next id is `max(all player_id) + 1` across the whole registry — never
per-event, never reusing a gap. Gaps exist because people retire; filling them
reassigns a number that historic picks may still reference.

**No `league_id` from the crawl?** Do not mint. Stop and resolve it by hand. A player
without a league id cannot be safely matched later.

**Cross-check available:** photo filenames embed the league id, in two formats —
`{league_id}_First_Last.webp` and `{league_id}-{n}_Last, First.webp`. Parse with
`/players/(\d+)[-_]`, not `_` alone. This cross-check caught a 48-row error in a
manually built export and is worth keeping as a validation step.

---

## 5. Validation — abort on any of these

| Check | Why |
|---|---|
| A `league_id` maps to two different `player_id`s | The merge defect. Fix the registry first. |
| A `player_id` appears twice in one roster | Duplicate roster entry — the World Cup 2025 defect. |
| A minted `player_id` already exists | Collision; the mint logic is wrong. |
| A crawled player has no `league_id` | Cannot be matched later. Resolve by hand. |
| A `player_id` in the registry maps to a different `league_id` | Someone renumbered. Stop. |
| `team_id` not in the canonical list (§7) | Typo — `COl` for `COL` shipped this way. |
| Photo league id disagrees with the crawled `league_id` | Either the photo or the match is wrong. |

Report the offending rows by name and id. Silence during roster setup is how a
scorer ends up trusting data that never landed.

---

## 6. Field ownership

Three writers touch `events/{eventId}/players/{playerId}`. They must never write
each other's fields — a field written by two flip-flops on every submit.

| Owner | Fields |
|---|---|
| `syncRoster()` / the crawler | `player_id`, `league_id`, `img_url`, `team_id`, `Player`, `Status`, `Number`, `Team`, `Cost` |
| Recompute function | `Confirmed Kills`, `Gunfights`, `Breakshooting`, `Movement`, `Zone Coverage`, `Pressure`, `Trades`, `Unclassified`, `Rank` |
| Cloud Functions | `StatusUpdatedAt` |

`syncRoster()` enforces this with an `updateMask` built from `ROSTER_CONFIG.fields`
([`scripts/apps-script/06_RosterSync.gs`](./scripts/apps-script/06_RosterSync.gs)).
**If you add a field, decide which side owns it.**

> **The Google Sheet wins.** For any event whose pipeline is still live, a fix applied
> only in Firestore is undone by the next submit. Change the sheet too.

---

## 7. Team identity

`team_id` is a 3-letter code. Display names change when a team picks up a sponsor
prefix; ids don't, which is why `gameId` and everything else keys on the id.

| | | | | | |
|---|---|---|---|---|---|
| `ACD` ac DIESEL | `AFT` Aftershock | `ARS` Arsenal | `BKS` Breakout Spa | `COL` Collision | `DAM` Damage |
| `DST` Distortion | `DYN` Dynasty | `FIT` PaintballFIT | `HEA` Heat | `HUR` Hurricanes | `IMF` Infamous |
| `IMP` Impact | `IRN` Ironmen | `JNG` Jungle Cats | `JYD` Joy Division | `LEG` Red Legion | `LEV` Leverage |
| `LKY` Lucky15s | `NRG` NRG Elite | `NYX` Xtreme | `PLT` Papeletto | `RCS` Seadogs | `SDA` Aftermath |
| `TON` TonTon | `UPR` Uprising | `XFA` X-Factor | | | |

Two traps in this table: **`IMF` is Infamous, not Ironmen** (`IRN`), and **`AFT` is
Aftershock, not Aftermath** (`SDA`). Both have been miscoded in production.

---

## 8. What went wrong before

Not history for its own sake — each rule above exists because of one of these.

| Defect | Cause | Cost |
|---|---|---|
| `atlantic_city_2025` renumbered a block of 11 slots | roster numbered independently per event | 10 ids each held two people; 13 players' season totals wrong for over a year |
| 5 players split across two ids | returning players re-entered as new at event boundaries | career totals split in half |
| 3 duplicate ids at World Cup 2025 | same player entered twice on one roster | double-counted kills, duplicate table rows |
| `IMF` on an Ironmen player, `AFT` on an Aftermath player, `COl` for `COL` | hand-typed team ids | wrong team attribution |
| 199 players with no `team_id` | field added after the event | no team filtering for that event |

The re-minting happened at **every** boundary observed — between seasons, and between
two events *within* one season. Any guard must run on every roster load, not just at
season rollover.
