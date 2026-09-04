# Career page — NXL record: review log

Running list of everything on the NXL win/loss work that needs James, kept so decisions
are not rediscovered. Started 4 Sep 2026.

Preview URLs (throwaway docs, no existing document touched — delete with
`node scripts/nxl-history/preview.mjs --delete`):

| URL | Case |
|---|---|
| `/dashboard/players/zzpreview_veteran` | Justin Rabackoff — 16 wins, tier A |
| `/dashboard/players/zzpreview_titleless` | Tj Danner — 0 wins, 43 Sundays, tier B |
| `/dashboard/players/zzpreview_nosunday` | Jordan Boyum — no bracket ever, tier C |
| `/dashboard/players/zzpreview_rookie` | Dominic DeVivo — 1 season, panel hidden |
| `/dashboard/players/zzpreview_norecord` | Nikolao Asabedo — no NXL id at all |

---

## 1. Decisions I need from you

- [ ] **"Sunday" is defined as reaching the knockout bracket, not the calendar day.**
      At every event in the file the whole bracket is played on the final day, and that
      day has sometimes been a Saturday — Lone Star 2025 finished on Sat 13 September.
      Kept your word because it is the sport's term; the gloss is now a hover tooltip
      (see below). Say if you want it renamed.

- [ ] **Ranks are against all 699 Pro players since 2015, not the ~233 on current PickEm
      rosters.** "All-time" has to mean all-time or it inflates every year as veterans
      retire. Consequence: a rank is out of 699 even though only 233 players have a page.

- [ ] **The rank tile is labelled by what it ranks** — "Wins rank", "Sundays rank",
      "Matches rank" — rather than "All-time rank", because the PickEm row directly below
      already has an "All-time rank" on career kills and two tiles inches apart under the
      same words would read as the same measurement.

- [ ] **Tier C's middle tile is matches rank.** You said "just match statistics" without
      specifying; I kept the shape consistent (count → rank of that count → rate). The
      alternative is ranking by match win % instead, which is a performance stat rather
      than a longevity one. Your call.

- [ ] **The career won-lost record is no longer anywhere on the page for tiers A and B.**
      Removing "224-72" from under the match win % (4 Sep, your call, and it is what made
      every tile the same height) leaves that tile without a visible denominator — those
      two tiers show no match count at all, since "Career matches" is the bottom tier's
      lead tile. It is recoverable arithmetic and the NXL panel's readout gives a
      per-season W-L on hover. If you want it back, the cheap version is an inline
      `/296` on the match win % tile, mirroring the rank tile's `/699` and costing no
      height.

- [ ] **"Reached the bracket" moved from under the Sundays number to a hover tooltip.**
      Same reason — it was the last thing making a tile taller than its neighbours. The
      gloss on the one piece of jargon on the page is now only discoverable by hovering,
      and not at all on touch.

- [ ] **The season and tournament counts have left the NXL strip.** It now reads
      "NXL career · 2015 to date" rather than "· 12 seasons · 49 tournaments". The
      tournament count was the visible denominator behind the win % tile and is now only
      on the rank tile's hover, so on touch there is nothing saying 33% is 16 of 49. The
      NXL panel's own caption still names the span.

- [ ] **⚠️ THE SCOPE NAMES ARE GONE FROM BOTH HEADERS.** They now read "Tracked 2015 to
      date" and "Tracked 2025 to date" (your wording, 4 Sep). Nothing on screen says one
      row is the whole league and the other is PickEm's eight events — the differing
      start years are the only hint. This was the mechanism that made two scopes on one
      page honest. Prefixing "NXL ·" and "Pick&rsquo;Em ·" puts it back in one line;
      say the word.

- [ ] **The trophy is a colour emoji** — 🏆 on winning events in the table, and above
      title-winning seasons in the chart. The only emoji on a deliberately austere page.
      It reads in both themes and does not depend on colour to carry meaning, but it is
      a taste call.

- [ ] **The NXL panel plots per season, not per event.** At ~7 matches an event a
      per-event line moves in 14-point steps and reads as noise; seasons carry 25–35.
      Events are still there on hover.

- [ ] **The panel is hidden for players with fewer than two seasons.** One season is a
      single full-width bar that reads as a progress meter, captioned "best season" of
      one. The hero still carries their totals.

- [ ] **`topFours` and `finals` are still computed but no longer have a hero tile** after
      you replaced that row. They are used in the panel's season readout ("3 top-four
      finishes" for a title-less season). Keep or drop?

## 2. Known limits — no action unless you disagree

- [ ] **A win here is the TEAM's, at an event the player took the field for.** Not a
      measure of individual contribution. The panel caption says so in as many words.
      Per-point lineups are the only way to do better and pbleagues publishes those
      reliably for 2023 alone — absent entirely in 2021, 2022 and 2024.

- [ ] **233 of 328 players have an NXL record.** The other 95 are overwhelmingly
      one-event players; 90 simply have no `league_id` in Firestore and 5 have one that
      is not in the crawl (Cortes, Portillo, Petrucelli, Brinkman, Raffield). Only 9
      regulars are affected. Self-heals as `syncRoster` stamps ids. Those players still
      get per-event W–L and match results, which key off `team_id`.

- [ ] **2022 Golden State Open and Lone Star Open have rosters but no results** in the
      Power Rankings workbook. Players who attended are not counted as having played a
      tournament there — a denominator we cannot fill would push their win rates down.

- [ ] **The event table now scrolls horizontally below ~1300px viewport.** The W–L column
      added 62px to a table that already overflowed at that width. Fits at 1440. TODO.md
      already accepts the table scrolling on mobile; this makes it slightly worse.

- [ ] **Pre-PickEm matches show the opponent's full club name, not a three-letter code.**
      Those rows come from the league file, which has no `team_id` for a club that never
      played a PickEm event, so `teamCode` falls back to the name. Fine at desktop;
      truncated in a 46px column on a phone.

- [ ] **Short event labels for league events are initials** — "WC 24" (World Cup) sits
      near "WCO 24" (Windy City Open) and "WCM 23" (Windy City Major). Only shown on
      narrow screens; desktop gets the full name. Checked: unique within every year.

- [ ] **A long career is now ~300 match rows and ~50 event rows.** Both tables cap the
      visible rows and scroll, and the whole lot is already on the summary document, so
      there is no extra query — but it is a much longer page than the eight-event
      version, and worth a look on a phone.

- [ ] **A 3-tile NXL row does not align with the 4-tile PickEm row below it** (tier C
      only). The scope strip separates them so they read as two blocks.

- [ ] **Ranking population uses raw totals; a player's own figure drops events they sat
      out.** So someone who missed a tournament their team won can sit a place lower than
      their raw record implies. That is the right way round — it never credits an absence
      — and the gap is at most a place or two.

## 2b. Failure modes — checked 4 Sep

**Ruled out with evidence**

| Risk | Check | Result |
|---|---|---|
| A player inherits someone else's career (bad `league_id`) | crawl's club vs our roster's team, every overlapping event | **746/746 agree** |
| Two players share one `league_id` | scan all 9 event rosters | **0** |
| Matches joined to the wrong fixture | `validate.mjs` against long data | **400/400 resolve** |
| A club or event silently dropped | `build.mjs` fails the run on any residue | **0 unresolved / 51 events** |
| Two events share a short label in one year | generated and compared per year | **none** |
| Stripping "Major"/"Open" merges two events | compared per year | **none** |

19 players' names differ between our roster and the crawl — all formal-vs-familiar
("Matthew"/"Matt", "William (Billy)"), one mojibake (`ReppesgÃ¥rd`, a UTF-8 read as
Latin-1 in the CSV). The team cross-check above is what proves these are the same
people rather than bad ids.

**Guarded — these fail loudly**

- A new club or event the resolver cannot pair → `build.mjs` exits non-zero.
- A PickEm-season event with no `pickemEventId` → warns; without it the event renders
  TWICE, once from each source.
- A match that cannot be identified beyond doubt → `null`, so the cell shows a dash.
- An unreadable Round → counted as a prelim AND reported.

**Live, unguarded**

- [ ] **The pipeline has two manual steps and nothing enforces either.** After an event
      the roster crawl and the workbook must BOTH be refreshed. If the crawl is stale,
      new players get no NXL record and the new event appears in nobody's career; if the
      workbook is stale, the event shows dashes in W-L. Neither is an error, so nothing
      complains. This is the TODO.md pipeline item, and it is the most likely way this
      feature goes quietly wrong.
- [ ] **"Arsenal" names two unrelated clubs and the alias map is what keeps them apart.**
      Baltimore Revo → Arsenal, and TonTon Arsenal → TonTons. Safe only because the
      workbook retires "Arsenal" after 2025. If it ever uses "Arsenal" for the French
      club, the map mis-assigns silently — no check would catch it.
- [ ] **A tie renders in the loss styling.** `result === "W"` is green, everything else
      grey, so a "T" reads as a loss. One tie exists in 2,393 matches (2015).
- [ ] **Doc size is 49.6KB max, 4.7% of the 1 MiB limit**, growing roughly 1KB per player
      per event. Years of headroom, but it is now the field that grows fastest.

## 3. Before this ships

- [ ] **Delete the preview documents**: `node scripts/nxl-history/preview.mjs --delete`

- [ ] **Deploy `functions/`** with `functions/nxlHistory.js` and
      `functions/data/nxlHistory.json`. Until then the deployed Cloud Function would
      strip the new fields on its next rebuild.

- [ ] **Fix the 2026 data loss before any full projection rebuild.** See the Data section
      of TODO.md. `mid_west_open_2026` has lost `participation` on all 218 roster docs and
      both 2026 events have lost `brand_color`; the stale projection is currently the only
      place the good values exist. Rebuilding publishes the loss — 38 players flip from
      correctly-marked DNP to "played". `scripts/nxl-history/safety-diff.mjs` is the check.

- [ ] **Decide how these pulls get automated** — the roster crawl and the results import
      are both "someone remembers to run a script after an event", and both are now
      load-bearing for a page users see. Logged in TODO.md under Data.

## 4. Settled — recorded so it is not relitigated

- **Full NXL history 2015–2026**, not just PickEm's eight events. Agreed 3 Sep.
- **Rostered-and-played attribution**, using the existing `participation` verdict.
- **Ties are excluded from win rate** rather than scored as half. One tie exists in 2,393
  matches (2015), so any convention is arithmetically irrelevant.
- **Prelims join on the team pair, not the date.** Our sheets and the workbook differ by
  a day at four of the eight events. A pair meets twice in the group stage exactly once
  across all 51 events (2017 World Cup, no long data). 400/400 games resolve.
- **The 2022 World Cup's eight rows with a corrupted Round cell are prelims**, not junk
  to drop: adding them back gives all 24 teams a clean 3-or-4 game group stage.
- **Every hero tile is one number and one label, nothing between.** A supporting figure
  goes inline after the value (`1st /699`) or not at all. Tiles carrying a third line
  were 94px against 73px for those that did not, so the NXL row and the PickEm row kept
  different rhythms; all eight now match and the numbers land on one grid.
- **The two headers are FIXED for every player** — "Tracked 2015 to date" and "Tracked
  2025 to date". They describe where OUR DATA starts, not the player's career: paintball
  goes back much further than 2015 and those results are hard to come by, so saying where
  we begin is the transparent version of that. Both years are derived (earliest event in
  the league file; earliest event PickEm scored), so backfilling an earlier season updates
  the claim by itself. The per-player version was worse than untidy — "Tracked 2020" on a
  player who debuted in 2020 turned a statement about coverage into one about them.
- **"Major" and "Open" are stripped from the full event name** ("Windy City Open · 24"
  -> "Windy City · 24"), and the name never wraps. The tier word described a ranking
  status that changed between seasons for the same tournament, so it said nothing about
  which event a row was while wrapping the column and doubling the row height. Checked
  across all 51 events: no two events in a year collapse to the same name. It is KEPT in
  the initials, where dropping it made "World Cup" and "Windy City Open" both "WC".
- **The hero's tile rows carry `flex-1`** so the stats column always fills its side.
  With the portrait stacked, the left column is the taller of the two and the leftover
  height was collecting under the last row of tiles as an empty bar.
- **Both tables carry the whole league career**, not just PickEm's eight events. Where
  PickEm never scored an event the kill columns show a DASH, never a zero: a zero is a
  measurement ("took the field, scored nothing") and printing one for a 2017 tournament
  nobody was counting would invent a result. "DNP" is still used, but only where the
  participation verdict actually says the player sat out.
- **The jersey number is gone from the hero.** It changes between seasons, and it was
  the first line read on a page about a decade-long career.
- **The portrait is stacked above the name** rather than beside it, so both get the full
  width of the column.
- **`matchLog` uses single-letter object keys, not tuples.** Firestore rejects an array
  whose elements are arrays — "Property nxl contains an invalid nested entity" — so the
  compact tuple form is unavailable.
- **The portrait was vertically centred and 148px at desktop**, up from 128px and
  bottom-aligned. The column stretches to the stats column beside it (232px), and
  `items-end` was putting all 84px of the slack above the photo and 20px below.
- **Tile padding is top-heavy** (24px above the number, 11px below the label at desktop).
  `justify-end` bottom-aligns content against the padding, and the padding used to be the
  wrong way round — 12px above, 17px below — so every tile read as floating with a margin
  underneath it rather than sitting on the floor of its box.
- **An event where nobody has scored has not happened yet** and is excluded from the
  projection. Lone Star 2026 had 188 rosters loaded for an event that locks on the 18th,
  and was dragging every average down ~12%.
