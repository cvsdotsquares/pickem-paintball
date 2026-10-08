/**
 * Shared plan for resolving player participation — did this player take the field?
 *
 * Both `dry-run-participation.mjs` and `apply-participation.mjs` import this, so the
 * plan that gets reviewed is byte-for-byte the plan that gets written. Do not
 * duplicate any of these rules into either script.
 *
 * WHY THIS EXISTS
 * A zero in `Confirmed Kills` means two completely different things: a player who
 * took the field and scored nothing, and a player who was never there. The site
 * cannot tell them apart, so it renders both as a real score of zero — which drags
 * down averages, pads the field size behind every rank, and puts people on the stats
 * table for events they never attended.
 *
 * THE EVIDENCE, IN PRIORITY ORDER
 *   1. Kills. If a player scored, they were there. This cannot be wrong, and it is
 *      the only signal that cannot be wrong, so it outranks everything below.
 *   2. The official NXL team sheet, scraped from pbleagues.com. Stronger than our
 *      own roster flag, but not infallible — a team admin who never updated their
 *      roster on the league site looks exactly like a genuine absence.
 *   3. Our own `Status` field (DNP / Out / Injured / Dropped). Only exists from 2026
 *      and is a pre-event availability note that nobody restamps, so it is used to
 *      confirm an absence the team sheet already suggests, never to assert one alone.
 *
 * Rules 2 and 3 agreed on 60 of 67 flagged absences across the 2026 events. The
 * seven disagreements are all resolved by rule 1.
 *
 * KNOWN LIMITATION — 2025 absences are single-source. There were no Status flags
 * before 2026, so nothing corroborates the team sheet, and a stale roster on the
 * league site would be indistinguishable from a real absence.
 */

export const EVENTS = [
  "tampa_bay_open_2025",
  "atlantic_city_2025",
  "midwest_open_2025",
  "lonestar_open_2025",
  "world_cup_2025",
  "tampa_bay_2026",
  "mid_atlantic_open_2026",
  "mid_west_open_2026",
];

export const SHORT = {
  tampa_bay_open_2025: "TB25",
  atlantic_city_2025: "AC25",
  midwest_open_2025: "MW25",
  lonestar_open_2025: "LS25",
  world_cup_2025: "WC25",
  tampa_bay_2026: "TB26",
  mid_atlantic_open_2026: "MA26",
  mid_west_open_2026: "MW26",
};

/**
 * `{event}|{year}` as the crawler writes it -> our event id.
 *
 * The league renames events between seasons ("NXL Lone Star Open" in 2025, plain
 * "NXL Lone Star" in 2026), so the year is part of the key. An unlisted pairing is
 * skipped rather than guessed — a wrong mapping would mark a whole roster absent.
 */
export const SHEET_EVENT = {
  "NXL Tampa Bay Open 2025|2025": "tampa_bay_open_2025",
  "NXL Atlantic City Open 2025|2025": "atlantic_city_2025",
  "NXL Midwest Open|2025": "midwest_open_2025",
  "NXL Lone Star Open|2025": "lonestar_open_2025",
  "NXL World Cup 2025|2025": "world_cup_2025",
  "NXL Tampa Bay Open 2026|2026": "tampa_bay_2026",
  "NXL Mid-Atlantic Open|2026": "mid_atlantic_open_2026",
  "NXL Midwest Open|2026": "mid_west_open_2026",
};

/** Roster statuses that claim the player did not take the field. */
export const ABSENT_STATUSES = new Set(["DNP", "Out", "Injured", "Dropped"]);

/**
 * How much of our roster must appear on a scraped sheet before we trust it.
 *
 * This job's failure mode is silently erasing people: if the league changes their
 * HTML, or the crawl half-fails, every player it missed looks absent. Below this
 * floor the whole event resolves to `unknown` and writes nothing, which is
 * recoverable — a wrongly-emptied event is not.
 */
export const SHEET_COVERAGE_FLOOR = 0.8;

export const VERDICTS = ["played", "absent", "unknown"];

export const num = (v) => Number(v ?? 0) || 0;

/** Split a CSV line, respecting quoted fields. */
function splitCsv(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * player_id -> league_id, from the registry written by the 22 Aug identity fix.
 *
 * The league id is the join key to the team sheet. Reading it from the registry
 * rather than the event documents matters: `league_id` is only present on some
 * event docs, and a player missing it there would be unjoinable and fall through
 * to `unknown` for no reason.
 */
export function loadRegistry(json) {
  const map = new Map();
  for (const p of json.players ?? []) {
    if (p.league_id != null && String(p.league_id) !== "") {
      map.set(String(p.player_id), String(p.league_id).trim());
    }
  }
  return map;
}

/**
 * The scraped team sheets: event id -> Map(league_id -> name).
 *
 * Only `role=Player` rows count. The crawler also emits coaches, and a playing
 * coach appears under both roles, so filtering on role rather than deduplicating
 * keeps a coach who never played off the field list.
 */
export function loadTeamSheet(csvText) {
  const lines = csvText.replace(/\r/g, "").trim().split("\n");
  const head = splitCsv(lines[0]).map((h) => h.trim());
  const sheet = new Map();
  const skipped = new Map();

  for (const line of lines.slice(1)) {
    const cells = splitCsv(line);
    const row = Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? "").trim()]));
    if (row.role !== "Player") continue;

    const key = `${row.event}|${row.year}`;
    const eventId = SHEET_EVENT[key];
    if (!eventId) {
      skipped.set(key, (skipped.get(key) ?? 0) + 1);
      continue;
    }
    if (!sheet.has(eventId)) sheet.set(eventId, new Map());
    sheet.get(eventId).set(String(row.numeric_id).trim(), row.name);
  }
  return { sheet, skipped };
}

export async function loadRosters(db, { collection, getDocs }) {
  const rosters = new Map();
  for (const eventId of EVENTS) {
    const snap = await getDocs(collection(db, "events", eventId, "players"));
    const byId = new Map();
    snap.docs.forEach((d) => byId.set(d.id, d.data()));
    rosters.set(eventId, byId);
  }
  return rosters;
}

/**
 * How much of an event's roster the scraped sheet accounts for.
 *
 * Measured against players we can actually join (those with a league id), so a
 * registry gap reads as a registry gap rather than as a failed crawl.
 */
export function sheetCoverage(roster, sheetForEvent, leagueIdOf) {
  let joinable = 0;
  let found = 0;
  for (const playerId of roster.keys()) {
    const lid = leagueIdOf(playerId);
    if (!lid) continue;
    joinable++;
    if (sheetForEvent?.has(lid)) found++;
  }
  return { joinable, found, ratio: joinable ? found / joinable : 0 };
}

/**
 * Resolve one player at one event.
 *
 * Returns the verdict and the rule that produced it, so every row on the report can
 * be traced back to its evidence rather than taken on trust.
 */
export function resolveOne({ kills, leagueId, sheetUsable, onSheet, status }) {
  // 1. Scored, therefore present. Outranks both roster signals, either of which can
  //    be stale — a team admin who never updated the league roster looks identical
  //    to a genuine absence, and a scored kill is the only proof against that.
  if (kills > 0) return { verdict: "played", reason: "scored" };

  // 2. No join key, so the team sheet cannot be consulted at all.
  if (!leagueId) return { verdict: "unknown", reason: "no league id" };

  // 3. The sheet for this event is missing or too thin to trust.
  if (!sheetUsable) return { verdict: "unknown", reason: "team sheet unusable" };

  // 4. Dropped from the official team sheet.
  if (!onSheet) return { verdict: "absent", reason: "off team sheet" };

  // 5. On the sheet, but our own roster flag says they did not play. Second source
  //    to the sheet's first, never used on its own.
  if (status && ABSENT_STATUSES.has(status)) {
    return { verdict: "absent", reason: `roster flag: ${status}` };
  }

  return { verdict: "played", reason: "on team sheet" };
}

/**
 * Build the full plan across every event.
 *
 * `rows` carries one entry per roster document, whether or not the verdict changes
 * anything, so the dry run can report totals and the apply step can write only the
 * documents whose stored value differs.
 */
export function buildPlan({ rosters, sheet, registry }) {
  const leagueIdOf = (playerId) => registry.get(String(playerId)) ?? null;
  const byEvent = new Map();
  const warnings = [];
  const totals = { played: 0, absent: 0, unknown: 0 };

  for (const eventId of EVENTS) {
    const roster = rosters.get(eventId) ?? new Map();
    const sheetForEvent = sheet.get(eventId);

    if (!sheetForEvent) {
      warnings.push(`${eventId}: no team sheet rows — every player resolves to unknown`);
    }
    const coverage = sheetCoverage(roster, sheetForEvent, leagueIdOf);
    const usable = Boolean(sheetForEvent) && coverage.ratio >= SHEET_COVERAGE_FLOOR;
    if (sheetForEvent && !usable) {
      warnings.push(
        `${eventId}: team sheet covers only ${(coverage.ratio * 100).toFixed(0)}% of ` +
          `joinable roster (${coverage.found}/${coverage.joinable}), below the ` +
          `${SHEET_COVERAGE_FLOOR * 100}% floor — refusing to mark anyone absent`,
      );
    }

    const rows = [];
    for (const [playerId, data] of roster) {
      const leagueId = leagueIdOf(playerId);
      const kills = num(data["Confirmed Kills"]);
      const status = data.Status != null && data.Status !== "" ? String(data.Status) : null;
      const { verdict, reason } = resolveOne({
        kills,
        leagueId,
        sheetUsable: usable,
        onSheet: Boolean(leagueId) && Boolean(sheetForEvent?.has(leagueId)),
        status,
      });
      totals[verdict]++;
      rows.push({
        eventId,
        playerId,
        name: data.Player ?? "(unnamed)",
        team: data.Team ?? "—",
        kills,
        status,
        leagueId,
        verdict,
        reason,
        stored: data.participation ?? null,
        changed: (data.participation ?? null) !== verdict,
      });
    }

    // Surfaced rather than acted on: a player the league dropped who still scored is
    // either a bad league_id join or a roster the team never updated. Rule 1 keeps
    // them visible either way, but a cluster of these means the sheet needs a look.
    const scoredOffSheet = rows.filter(
      (r) => r.kills > 0 && r.leagueId && usable && !sheetForEvent?.has(r.leagueId),
    );

    byEvent.set(eventId, { rows, coverage, usable, scoredOffSheet });
  }

  return { byEvent, warnings, totals };
}
