# PSP career data — edge cases to review

Everything below is a place where the PSP data needs a judgement call before it feeds the career page. Each item says what the data shows, what I'd propose, and leaves the decision to you. Reply by number (e.g. "B3: agree").

---

## A. Which teams count as Pro

**A1 — ✅ SIGNED OFF 10 Oct.** Pro = games labelled "Pro X-Ball", read per GAME, not per schedule row. A row can hold two games and names both divisions pipe-separated (`Pro X-Ball™|Pro Challengers X-Ball™`); the NXL parser reads only the first, which let Challengers and Division 1 games in at 2013 West Coast. Validated across all 42,931 saved PSP games: every Pro-labelled game is between two Pro-table teams, no non-Pro game is between two Pro teams (bar Challengers), and at the three split events Pro (10) and Challengers (10) teams never overlap. Chicago and Mid-Atlantic have every game in its own row; only West Coast has shared rows (Pro always the first game, but the builder doesn't rely on that). Result: 10 Pro teams at each of the three events. Also resolved B6. *(Original item below.)*

**A1. 2013 Chicago, Mid-Atlantic, West Coast — Champions vs Challengers.**
The league table lists 20 "Pro" teams; the schedule splits them into Pro X-Ball (10) and Pro Challengers (10). At Chicago and Mid-Atlantic the 10 schedule teams are exactly league ranks 1–10. West Coast's schedule is messier (see B6), but its Pro knockout teams are also ranks 1–10.
*Proposal:* Pro = ranks 1–10 at these three events.

**A2 — ✅ SIGNED OFF 10 Oct.** All 15 teams Pro — one division, no Challengers games on the schedule (pre-split). *(Original item below.)*

**A2. 2013 Dallas — 15 teams, one division.** No Challengers split yet.
*Proposal:* all 15 are Pro.

**A3 — ✅ SIGNED OFF 10 Oct.** All 16 teams Pro — every game labelled Pro X-Ball, 16 teams on the Pro table, four prelim groups of four. Flagged in error: TRADEMYGUN OUTLAWS, Boom, ac DALLAS and Baltimore Revo play Division 1 at other events, but here they are on the Pro table (#12–#15) and played the Pro prelims. *(Original item below.)*

**A3. 2015 Dallas — 16 teams, one division.** All 16 played the Pro prelims (four groups of four). The bottom teams then played a side bracket against Division 1 teams (see B5).
*Proposal:* all 16 are Pro.

---

## B. Knockout rounds and who "made Sunday"

**B1 — ✅ SIGNED OFF 10 Oct.** Brackets rebuilt by elimination at 2006 Las Vegas, Chicago, SoCal, World Cup and 2007 LA, Mid-Atlantic, Chicago, River City; every one matches the league placings (QF = #1–#8, semis = #3–#4, runner-up #2, winner #1). 2006 World Cup's two unscored games (final, 3rd place) kept with the winner from the placings and a blank score — count in win-loss, not points — with a note. 2006 Texas: Pro table (same 15 teams as Las Vegas) but no Pro games; finishes inferred from placings by the 2006 format and flagged as inferred. *(Original item below.)*

**B1. 2006 events + 2007 LA, Mid-Atlantic, Chicago, River City — the whole Sunday bracket is labelled "Finals".**
6–8 games all called "Finals", e.g. 2006 Las Vegas: four quarter-finals (Legion v Naughty Dogs, Dynasty v Philly, Raiders v Aftershock, Ironmen v Trauma), two semis, a 3rd-place game and the final (Legion beat Ironmen). Taken literally, every team in the bracket "reached the final".
*Proposal:* work out quarters/semis/final from the order of games (who reappears), champion = league rank 1, runner-up = rank 2.

**B2 — ✅ SIGNED OFF 10 Oct.** Best-of-3 series (like NBA playoffs): quarters Thu–Fri, semis Sat, final Sun — Ironmen beat Red Legion 2-1. Matches the placings exactly (#1 Ironmen, #2 Red Legion, #3–#4 semi losers, #5–#8 QF losers). Each series = one round for finishes; each game stored as "<Round> G<n>" (e.g. "Final G2") and counts as a match in win-loss (Ironmen 6-2 overall). The unneeded third game of Red Legion v Aftershock (posted 0-0) is dropped. The builder strips "G<n>" when working out depth. *(Original item below.)*

**B2. 2007 World Cup — 18 "Finals" games, played Thursday–Sunday.** Best-of-three series between 8 teams (e.g. Ironmen v Philly three times), ending Red Legion v Ironmen.
*Proposal:* same as B1, treating each series as one knockout round.

**B3 — ✅ SIGNED OFF 10 Oct.** All 8 events (2009 Phoenix, Mid-Atlantic, Chicago, World Cup; 2010 Phoenix, Chicago, Mid-Atlantic, World Cup) have exactly two kinds of "Finals" game, told apart by the placings: #1 v #2 = Final, #3 v #4 = "3rd Place" (the two semi-final losers). The higher-ranked team won both at every event. 3rd Place counts in win-loss but adds no depth. Event note added. *(Original item below.)*

**B3. 2009 & 2010 events — two "Finals" games each.** One is the final, the other a 3rd-place game. E.g. 2009 Phoenix: Philly 6-3 Ironmen (final, Philly are rank 1) and Dynasty 7-3 Red Legion (3rd place).
*Proposal:* the final is the game between ranks 1 and 2; the other two teams are semi-finalists.

**B4 — ✅ SIGNED OFF 10 Oct.** Same as B2: best-of-3 quarters (Fri), semis (Sat, both 2-0) and final (Sun, Red Legion beat Philly 2-1), plus a single 3rd-place game (Damage beat Ironmen). Games stored as "<Round> G<n>", each counts as a match. Matches the placings. *(Original item below.)*

**B4. 2009 World Cup — four "Finals" games:** a best-of-three final (Red Legion beat Philly 2-1) plus a 3rd-place game (Damage v Ironmen). Quarters were Friday, semis Saturday, also best-of-three.
*Proposal:* as B3, series counted as one round.

**B5 — ✅ SIGNED OFF 10 Oct (all 11 events).** These are RELEGATION games between the bottom Pro teams, not part of the bracket. Validated: at 2013 Dallas, Mid-Atlantic, Chicago, West Coast, World Cup and 2014 Dallas, MAO, Chicago, West Coast (labelled "Ochos", "1/16" or "1/32"), every loser is in Challengers at the next event and every winner stays Pro (18 games; 2013 Dallas is a 3-team ladder for 10th as the field went from 15 to 10). Relabelled "Relegation": counts in win-loss, NOT a Sunday. Note: this means the 2013–14 "Ochos" games were relegation too, which I had missed. 2011–2012 have none.
**2014 World Cup** (#7–#10, 1/16) — ✅ Relegation, confirmed by James's manual review (2015 had no Challengers to check against).
*Second validation (promotion):* at all 9 events with a Challengers division, the two Challengers finalists are exactly the two teams promoted to Pro at the next event — matching the two relegated. 2014 World Cup → 2015 Dallas promoted six (league expanded to 16).
**2015 Dallas** — ✅ Placement (James, 10 Oct). #1–#8 = standard knockout (Quarters → Semis → Final); #9–#16 played a ladder (1/32 → 1/16 → "Ochos") for 9th–16th, relabelled "Placement": win-loss counts, not a Sunday. No Challengers existed to relegate to, so not called Relegation. *(Original item below.)*

**B5. "1/16" and "1/32" rounds — 2013 Chicago, 2013 World Cup, 2014 World Cup, 2015 Dallas.** *(Rechecked 10 Oct with each game's own label and the league ranks — the earlier version of this item was wrong: every one of these games is labelled Pro X-Ball and is between two Pro teams. No Challengers or Division 1 teams are involved.)*
In every case the games are between the LOWER Pro teams, and the winners never reach the semis/quarters:
- 2013 Chicago: #7 Infamous beat #10 upTon, #8 X-Factor beat #9 TonTons. Semis = #1–#4.
- 2013 World Cup: #8 Aftershock beat #9 upTon, #7 Infamous beat #10 Red Legion. Semis = #1–#4.
- 2014 World Cup: #7 Revo beat #10 Heat, #8 Red Legion beat #9 upTon. Semis = #1–#4.
- 2015 Dallas: #9–#16 play 1/32 → 1/16 → "Ochos" (Aftershock beat Thunder = 9th/10th). Quarters = #1–#8.
They look like placing (or relegation) playoffs for the bottom of the table, not the route to the title.
*Question:* do teams that only played these games count as making Sunday? (Games still count in win-loss either way.)

**B6 — ✅ RESOLVED by A1.** The per-game division label drops these games automatically. *(Original item below.)*

**B6. Other divisions' games filed under Pro.** 2013 West Coast: an "Ochos" (Philadelphia Energy v VcK) and a "Semifinal" (RNT ALLSTARZ v Revo) between Division 1 teams. 2014 World Cup: a college game (FAU v Fresno State).
*Proposal:* ignore — neither team is Pro (already filtered out).

**B7 — ✅ RESOLVED by B5.** X-Factor's "Ochos" win was the relegation ladder for 10th, not the bracket, so the bracket isn't incomplete: two quarter-finals, then the group winners join in the semis. *(Original item below.)*

**B7. 2013 Dallas — bracket looks incomplete.** X-Factor beat upTon in the Ochos but never appears in the quarter-finals, and only two quarter-finals are listed; Damage and Infamous go straight to the semis.
*Proposal:* your call — trust the rounds as listed, or treat 2013 Dallas as placings-only for Sunday.

**B8 — ✅ REVIEWED 10 Oct, no change.** Sunday is counted by round, not date, so off-day knockouts change nothing. Each event re-checked against the placings. 2012 Galveston is the rain-off: semis + final Monday 12 Mar, the two quarter-finals dated Thursday 19 Apr (eve of the next event); results still match the placings (#5, #6 lost the QFs). *(Original item below.)*

**B8. Knockouts not on the last day (for awareness — no change proposed, since Sunday counts by round, not date).**
- 2006 World Cup: Finals Saturday
- 2007 Chicago: Finals Saturday
- 2007 World Cup: Finals Thursday–Saturday (B2)
- 2008 Chicago: Semis + Final Saturday
- 2009 World Cup: Quarters Friday, Semis Saturday
- 2012 Galveston: Semis + Final on Monday, and the Quarters dated Thursday 19 April — the next event's Thursday (rain-off, like NXL Lone Star 2024)

**B9 — ✅ SIGNED OFF 10 Oct.** Groups worked out from who played whom (the page doesn't label them). Where all three went 1-1, margin decided the finalist — validated: Chicago Aftermath +1 (Dynasty 0, X-Factor −1), Northeast Philly +1 (Ironmen 0, Naughty Dogs −1). Group games and the four non-finalists' finish are both labelled **"1/6"**: makes Sunday, not top four. Winner/runner-up unchanged (= #1/#2). **Build note:** the career code's Sunday list (MADE_BRACKET) must include "1/6". *(Original item below.)*

**B9. 2008 Phoenix, Mid-Atlantic, Chicago, Northeast — Sunday was two round-robin groups of three.** *(Found 10 Oct while checking B8.)*
Six teams made Sunday and split into two groups of 3; each group winner played the final. E.g. 2008 Mid-Atlantic: Dynasty beat Red Legion and X-Factor; Ironmen beat Philly and Infamous; Dynasty beat Ironmen in the final. pbleagues labels the group games "Quarters" at Phoenix but "Semifinals" at the other three, so today:
- Mid-Atlantic, Chicago, Northeast: all 6 teams get "Semi-finals" → two extra teams wrongly get a top-four finish.
- Phoenix: the same games count as quarter-finals.
Winner/runner-up are correct (final winner = #1, loser = #2 at all four). Sunday count (6) is correct.
*Proposal:* give the 4 group losers one consistent label at all four events (made Sunday).
*Question:* do #3 and #4 in the placings count as top four, or are all four group losers treated the same (made Sunday only)?

---

## C. Events without full results

**C1 — ✅ SIGNED OFF 10 Oct.** 2003–05 (11 events) = placings only:
- Counted: titles, events played, event win % (titles ÷ events), an event-table row (team + final ranking, e.g. "Dynasty, 1st of 8", W-L blank), and the season summary line (top-four there is read from the placing number, so it works).
- Not counted: match record/win %, match table (no games), Sunday %.
- Finals reached isn't shown anywhere on the page, so no rule needed.
- **Build rule for the career code:** leave an event out of Sunday % (both the count and the total) when `results` is false and `finishInferred` isn't set. Catches 2003–05; keeps 2006 Texas in. No new field needed.
- 2006 Texas keeps the B1 inference: rounds shown like the other 2006 events and counted in Sunday %, flagged as inferred. *(Original item below.)*

**C1. 2003–05 (11 events) and 2006 Texas — placings, no games.**
We know every team's final place, so titles are certain. How far anyone else got is not recorded.
*Proposal:* count titles; leave these events out of finals, top-four and Sunday (and out of the Sunday % denominator). Alternative: rank 2 = runner-up, ranks 3–4 = top four.

**C2 — ✅ SIGNED OFF 10 Oct.** James's manual review: Group B's prelims are simply missing. Applied: placings only — all 10 teams with the league's own ranks (ties kept: #3, #5, #6 shared), Ironmen title, every game dropped (incl. Group A's 10), out of Sunday % by the C1 rule. Also fixed: the builder had renumbered every event 1–N, erasing league ties; it now only renumbers the three 2013 split events (where Challengers are removed). Ties now kept at 10 events (2003–05 and 2008 World Cup).
*(Findings at time of review:)* What the saved pages show:
- Placings: all 10 Pro teams, with shared places — Ironmen #1, Philly #2, Red Legion + Infamous #3, Damage #4, Dynasty + Impact #5, X-Factor + Naughty Dogs #6, Aftershock #7.
- Group A prelims: complete — 10 scored games among Infamous, Damage, Impact, Naughty Dogs, Aftershock.
- Group B prelims (Ironmen, Philly, Red Legion, Dynasty, X-Factor): none on the schedule.
- No quarters or semis. Final Ironmen v Philly: three games listed, all 0-0 / no score.
Proposal on the table: all 10 teams with placings + Ironmen title; out of Sunday % (like C1); drop all games (alternative: keep Group A's 10).
**Builder bug fixed meanwhile:** it dropped the 5 Group B teams as "not Pro" because they never appear on the schedule. Ranked teams are now only dropped when the event actually ran a Challengers division; 2008 World Cup now has all 10 teams. *(Original item below.)*

**C2. 2008 World Cup — partial.** 10 prelim games covering 5 of 10 teams, no knockouts.
*Proposal:* placings only, like C1; drop the 10 games so nobody gets half a record.

---

## D. 2003–05 rosters

**D — ✅ SIGNED OFF 10 Oct (D1–D3).** Coverage measured, not assumed: at the 2004 World Cup (the one early event with surviving public rosters) the profile rebuild found 85 of 87 players (98%) with none extra; the two misses weren't on any team member list, so their profiles were never opened — the only way the method can miss someone. 2004–05 team sizes (median 14, range 9–18) match the complete 2006–07 years (median 12–13). 2003 World Cup is thinner (median 11.5, SYN 6) — likely a few more missing. Accepted at this level; optional wider member-list pass not done. *(Original items below.)*

**D1. Rosters rebuilt from player profiles.** Every team present at all 11 events; 6–17 players per team. Completeness can't be proven against an official list (none survives). SYN at the 2003 World Cup has 6 — you've said keep.

**D2. Players vs staff.** Profile rows marked "Staff" are excluded. Coaches can't be told apart from staff in these years.

**D3. 2004 World Cup** has both public rosters (87 players) and profile rows (85) — I've merged them.

---

## E. Combined ("All") career figures

**E1 — ✅ SIGNED OFF 10 Oct.** Event win % (titles ÷ events) = all events 2003–2026. Sunday % = events with a known bracket (all except 2003–05 and 2008 World Cup; 2006 Texas included, inferred). Match win % = events with games (2006 Las Vegas on, minus 2008 World Cup). Same rule in All / NXL / PSP views; NXL figures unchanged. *(Original item below.)*

**E1. Rates with placings-only events.** Title rate counts every event; Sunday % and match win % only events where it's knowable (follows C1).

**E2 — ✅ SIGNED OFF 10 Oct.** Each view ranks against its own pool: All = every NXL Pro + PSP Pro player 2003–2026 (ranks may differ from today's site); NXL = as today; PSP = PSP only. Players in both leagues (~214, matched on photo ID) are one person in All, figures added together. *(Original item below.)*

**E2. All-time ranks in the "All" view** rank against every NXL + PSP player since 2003 (one combined population). NXL and PSP views rank within their own league.

**E3 — ✅ All-view line agreed 10 Oct:** "Careers combine player performances from PSP (2003–2015) and NXL (2015–present)". Proposed for the other views: NXL "Careers show player performances from NXL (2015–present)", PSP "Careers show player performances from PSP (2003–2015)". Data caveat (placings-only years) parked by James until the build. *(Original item below.)*

**E3. "Tracked from" line:** All = 2003, PSP = 2003, NXL = 2015 — each with its caveat text (to write together).

---

## F. Team names

**F1 — ✅ SIGNED OFF 10 Oct.** One name per team, so no page shows "Red Legion" and "Moscow Red Legion" as two clubs. Source of truth: pbleagues team pages — every roster is filed under a permanent team ID whatever name it entered under, and each team's page lists that history. 608 of 610 PSP team entries linked to a team page through their roster code (2006+: the roster page's own team link; 2003–05: team histories and the logged-in roster → team map). Naming rule:
- Team carried on into NXL → its NXL club name, as already used on the site (e.g. DYNASTY / San Diego Dynasty → **Dynasty**; Russian Legion / Boston / Moscow Red Legion → **Red Legion**; Oakland Assassins / Oakland / LA / Los Angeles Infamous → **Infamous**; Baltimore Revo → **Arsenal**, per NXL's existing alias).
- PSP-only team whose names share a core → that core (VICIOUS / Omaha Vicious → **Vicious**; Trauma / Baltimore Trauma → **Trauma**; Miami / Jacksonville Raiders → **Raiders**).
- James's calls: **Naughty Dogs** (NAUGHTY DOGS / Naughty Dogs Inc. / Portland / Seattle Naughty Dogs, plus a second ID's one-off Portland entry); **XSV** (Excessive / XSV / Sacramento XSV); **New York Hurricanes** (New York Xtreme / New York Hurricanes / Hurricanes — kept distinct from the unrelated NXL Hurricanes 2022+).
- 2004 World Cup "Naughty Dogs Inc." isn't on a team page; folded into Naughty Dogs on its name and roster (11 of 13 players on Naughty Dogs at the next event).
- Clash check: no PSP-only team shares a name with an unrelated NXL club; no two team IDs share a display name.
Result: 55 team names. The entered name is kept on each entry as `rosterName`. Map: `scripts/psp-history/team-names.json` (generated by the archive's `checks/team_names.py`; the 2004 World Cup Naughty Dogs line is a manual addition).

**F2 — ✅ DECIDED 10 Oct (James) — ⚠️ NEEDS EXPERT REVIEW.** Pairs pbleagues lists as different teams, judged on seasons and roster overlap. Overlap = share of the earlier team's players on the later team; for scale, a continuing team keeps ~64% next season and ~37% three seasons later.

| Pair | Earlier | Later | Gap | Overlap | Decision |
|---|---|---|---|---|---|
| Team Strange / Detroit Strange | 2003: won World Cup (1 event) | 2006–07: 10 events, best 5th | 3 seasons | 27% (4 of 15) | **Merged → "Strange"** |
| All Americans / Philly Americans | 2003–04: 2 events, best 8th | 2006–09: 19 events, won 2006 Texas + 2009 Phoenix | 2 seasons | 20% (3 of 15) | **Merged → "All Americans"** |
| Avalanche / St. Louis Avalanche | 2004–05: 10 events, won 2004 Chicago | 2008: 3 events, 11th–12th | 3 seasons | 6% (2 of 31) | **Merged → "Avalanche"** |
| Storm / Texas Storm | 2003–04 | 2014 | 10 seasons | 0% | Kept separate |
| Outlaws / TRADEMYGUN OUTLAWS | 2005 | 2015 | 10 seasons | 0% | Kept separate |
| arsenal A / Arsenal (NXL) | 2004 | 2015–25 | 11 seasons | 10% (1 of 10) | Kept separate |

The three merges live in `scripts/psp-history/team-merges.json` (with evidence), and every merged team entry carries `merged: "needs expert review"` in the data. Result: 52 team names.

**F3 — not done on this branch.** NXL club names still come from the existing NXL rules (`scripts/nxl-history/clubs.mjs`); team pages could replace them later, first as a cross-check (needs the NXL-only teams' pages).

---

## Already decided (for the record)
- Top division = Pro, whatever it was called. Challengers, Semi-Pro, women's, 5-man excluded.
- Excluded events: 2003 Chicago, 2003 Philadelphia (incomplete rosters), 2004 Mardi Gras (5-man), 2006 Mid-Atlantic (all-star game), 2015 Nashville (cancelled).
- 2003 World Cup kept.
- "Finals" = "Final"; 2006–07 champion from league placings.
- Combined pro career with a league filter (All / NXL / PSP), default All; hidden in production except for your account until January.

## Checked and fine
- Photo IDs: the same person has the same ID in profiles and rosters (4,469 of 4,469).
- Where there's a single deciding final, its winner is the league's rank 1 at every event.
- Every round name is accounted for.

---

## Expert review list

Decisions to put in front of people who know the era. Nothing here is wrong as far as the data shows, but each rests on judgement rather than a record.
- **Team merges (F2):** Team Strange + Detroit Strange → Strange; All Americans + Philly Americans → All Americans; Avalanche + St. Louis Avalanche → Avalanche. Also confirm the three kept separate.
- **Team names chosen by James (F1):** Naughty Dogs, XSV, New York Hurricanes.
- **2006 Texas finishes inferred** from placings (B1.1).
- **2003–05 rosters** rebuilt from player profiles; 2003 World Cup likely missing a few players (D).

## Disclaimer register (events where outcomes were inferred or data is incomplete)

Use this to write the on-site caveats. Per-event detail is also stored in `functions/data/pspHistory.json` under each event's `notes` (internal — not shown on the site).

| Kind | Events | What it means for the page |
|---|---|---|
| **Placings only — no games** | 2003 World Cup; 2004 LA, Orlando, Chicago, Northeast, World Cup; 2005 SoCal, Orlando, Chicago, Northeast, World Cup; 2008 World Cup | Titles, events, event win % and final ranking only. No match record, no Sunday %. |
| **Rosters rebuilt from player profiles** | All 2003–05 events above | ~98% of players found (2004 World Cup benchmark); 2003 World Cup likely missing a few. |
| **Rounds inferred from placings** | 2006 Texas | No games survive; rounds inferred from the 2006 format. Counts in Sunday %, no match record. |
| **Unscored games** | 2006 World Cup (final, 3rd place) | Winner from placings, score blank. Counts in win-loss, not points. |
| **Rounds rebuilt from games labelled "Finals"** | 2006 Las Vegas, Chicago, SoCal, World Cup; 2007 LA, Mid-Atlantic, Chicago, River City | Quarters/semis/final worked out from who played whom; checked against placings. Fully counted. |
| **Best-of-3 series** | 2007 World Cup; 2009 World Cup | Each game listed "<Round> G<n>" and counted as a match. Fully counted. |
| **Sunday groups ("1/6")** | 2008 Phoenix, Mid-Atlantic, Chicago, Northeast | Six-team Sunday in two groups of three, worked out from who played whom. Fully counted; "1/6" = Sunday, not top four. |
| **Relegation / Placement rounds** | 2013 Dallas, Mid-Atlantic, Chicago, West Coast, World Cup; 2014 all five; 2015 Dallas | Bottom-team games relabelled; count in win-loss, not Sunday. Validated against next-event promotion/relegation. |
| **Excluded events** | 2003 Chicago, 2003 Philadelphia, 2004 Mardi Gras, 2006 Mid-Atlantic, 2015 Nashville | Not in any career figure. |
