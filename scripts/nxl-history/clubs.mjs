/**
 * Club identity across the two sources.
 *
 * TWO VOCABULARIES, AGAIN. The Power Rankings fixture list names a club the short way
 * ("Damage", "Impact") — the same way our own rosters do, which is why `normTeam` in
 * scripts/backfill/fixtures.mjs only ever needed three aliases. The pbleagues roster
 * crawler names it the long way, with whatever city or sponsor prefix the league was
 * using that season ("Tampa Bay Damage", "Perris ASG Aftermath").
 *
 * Almost all of that resolves itself: a fixture name is a suffix of the crawler name,
 * matched WITHIN A YEAR so the field is only ever ~20 teams wide. `resolveTeams` does
 * that automatically and reports anything it could not pair, so a future season cannot
 * quietly drop a club.
 *
 * What follows is the residue — the renames where the two names share no letters, or
 * where the shared word belongs to a different club. Each was confirmed by roster
 * overlap, not by reading the names, because the names are exactly what is unreliable
 * here. Overlaps are quoted as shared/union of numeric player ids.
 */

/**
 * Crawler name → fixture name, applied before the automatic pass.
 *
 * ⚠️ "Arsenal" names two unrelated clubs and the map must never be inverted. Baltimore
 * Revo was renamed Baltimore Arsenal for 2025, and the fixture list has called that
 * club "Arsenal" throughout (Revo 2024 vs Arsenal 2025 = 6/14 shared players, better
 * continuity than Revo 2023 vs Revo 2024's 5/17). The French TonTons then picked up a
 * sponsor and became "TonTon Arsenal" for 2026 — a different club entirely, sharing
 * 1/19 players with Baltimore. The fixture list retires "Arsenal" after 2025, so the
 * word never has to mean two things in one season; keep it that way.
 */
export const CRAWLER_TEAM_ALIAS = {
  "Baltimore Revo": "Arsenal", // renamed Baltimore Arsenal in 2025
  "TonTon FSU": "TonTons",
  "TonTon Arsenal": "TonTons", // NOT Baltimore Arsenal — see above
};

/**
 * Fixture event label → crawler event label, per year, where the automatic pass cannot
 * pair them. Keyed `"{year}|{fixture label}"`.
 *
 * The automatic pass strips "NXL" and a trailing year and then matches, which covers
 * every ordinary case. These four are the ones where the two sources genuinely disagree
 * about the event's name.
 */
export const EVENT_ALIAS = {
  // The league moved the Mid-Atlantic Major to Atlantic City in 2022 and the workbook
  // recorded it by venue. Same event: 16–18 June 2022, 49 matches, same field.
  "2022|Atlantic City Major": "NXL Mid-Atlantic Major 2022",
  // Downgraded from Major to Open in the workbook only.
  "2024|Windy City Open": "NXL Windy City Major 2024",
  // Workbook typo, already known to the long-data backfill.
  "2025|Tamp Bay Open": "NXL Tampa Bay Open 2025",
  // Workbook drops the location for the season opener.
  "2026|Open": "NXL Tampa Bay Open 2026",
};

/**
 * Crawler events the fixture list does not carry, acknowledged so the validator stays
 * quiet about them and the report stays honest about the hole.
 *
 * These two 2022 events are real Pro X-Ball tournaments with rosters, and no results.
 * A player who was there gets no matches from them and — importantly — they are NOT
 * counted as a tournament played, because a denominator we cannot fill would push every
 * win rate down for the teams that happened to attend.
 */
export const EVENTS_WITHOUT_RESULTS = [
  "2022|NXL Golden State Open 2022",
  "2022|NXL Lone Star Open",
  // Rostered but not yet played (18-19 Sep 2026). Drops off this list of its own accord
  // once the workbook carries its results; nothing here needs editing for that.
  "2026|NXL Lone Star",
];

/** Fixture label → the Firestore event id it is the same tournament as. */
export const PICKEM_EVENT_ID = {
  "2025|Tamp Bay Open": "tampa_bay_open_2025",
  "2025|Atlantic City Open": "atlantic_city_2025",
  "2025|Midwest Open": "midwest_open_2025",
  "2025|Lone Star": "lonestar_open_2025",
  "2025|NXL World Cup": "world_cup_2025",
  "2026|Open": "tampa_bay_2026",
  "2026|Mid Atlantic Open": "mid_atlantic_open_2026",
  "2026|Midwest Open": "mid_west_open_2026",
  // lone_star_open_2026 is rostered but unplayed (18–19 Sep 2026), so it has no
  // fixture row yet. It appears here the moment the workbook carries its results.
};

/**
 * Fixture club name → our `team_id`, for the events PickEm scores.
 *
 * Only needed where the two disagree; everything else matches on the name. Taken from
 * the live rosters, and deliberately NOT inverted from TEAM_CODE_OVERRIDES on the
 * career page — that map is display-only and swaps AFT/SDA.
 */
export const CLUB_TEAM_ID = {
  Aftermath: "SDA",
  Aftershock: "AFT",
  Arsenal: "ARS",
  "Breakout Spa": "BKS",
  Collision: "COL",
  Damage: "DAM",
  Distortion: "DST",
  Dynasty: "DYN",
  Heat: "HEA",
  Hurricanes: "HUR",
  Impact: "IMP",
  Infamous: "IMF",
  Ironmen: "IRN",
  "Joy Division": "JYD",
  "Jungle Cats": "JNG",
  Leverage: "LEV",
  "Lucky 15s": "LKY",
  "NRG Elite": "NRG",
  PaintballFIT: "FIT",
  "Papeletto Team": "PLT",
  "Red Legion": "LEG",
  Seadogs: "RCS",
  TonTons: "TON",
  Uprising: "UPR",
  "X-Factor": "XFA",
  Xtreme: "NYX",
  "ac DIESEL": "ACD",
};

/**
 * Our `player_id` → the pbleagues profile EPID, for players the crawler cannot number.
 *
 * The numeric league id is read off the avatar filename, so a player the club never
 * photographed has none. Eleven such people appear across 2015-2026; only one is on a
 * current PickEm roster.
 *
 * ⚠️ NAME IS THE ONLY LINK between our roster and an EPID, which is exactly the fragile
 * path the rest of this pipeline avoids — so each entry is verified the same way a club
 * alias is, by checking that the league puts the player on the team our own roster says,
 * at every overlapping event. An entry without that evidence does not belong here.
 *
 * Carlos Cortes, EPID alKcjMJZiJAUBJrp — 45 crawl appearances 2015-2026, one EPID for
 * the name and no "Cortes" in the numbered file at all. All NINE overlapping events
 * agree, including the mid-2025 move: ac DIESEL at Tampa Bay, Atlantic City and Midwest
 * 2025 (our ACD), then X-Factor from Lone Star 2025 onward (our XFA). A coincidental
 * match on a team-switch pattern is not credible.
 */
export const PLAYER_EPID = {
  100053: "alKcjMJZiJAUBJrp", // Carlos Cortes
};
