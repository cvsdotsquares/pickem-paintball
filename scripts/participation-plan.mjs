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
  lone_star_open_2026: "LS26",
  world_cup_2026: "WC26",
};

/** Short label for the reports; any event id works, listed or not. */
export const shortOf = (eventId) => SHORT[eventId] ?? eventId;

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

/**
 * The per-team check: how many of a team's rostered players must be on its league sheet
 * before an absence on that team is believed.
 *
 * Not a percentage, deliberately. A team's coverage counts its own absentees against it
 * (they are off the sheet - that is what makes them absent), so an 80% team floor would
 * have undone 56 correct absences across the 2025-26 events, 25 of Mid West 2026's 37.
 * What this guards against is one team's league roster coming back empty or broken while
 * the rest of the event looks fine. Five is a line on the field; every team at every
 * event 2025-26 had at least six on its sheet.
 */
export const TEAM_SHEET_MIN = 5;

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
 * One event's team sheet from a fresh crawl, instead of the historic CSV.
 *
 * The CSV is a manual, occasional crawl, so during a live event it is days or weeks
 * stale. The PickEm hub's Data agent re-crawls the event's pbleagues rosters just before
 * each run and passes them here as JSON: a list of `{ league_id, name, team }`, players
 * only (coaches and staff are separate tables on the league page). A team with no players
 * on the league site comes through as `{ team, empty: true }` and adds nobody.
 *
 * Returns the same shape as `loadTeamSheet`, holding just this one event.
 */
export function loadSheetJson(json, eventId) {
  const rows = Array.isArray(json) ? json : json.players ?? [];
  const forEvent = new Map();
  for (const r of rows) {
    if (r.empty || r.league_id == null || String(r.league_id).trim() === "") continue;
    forEvent.set(String(r.league_id).trim(), r.name ?? "");
  }
  return { sheet: new Map([[eventId, forEvent]]), skipped: new Map() };
}

/**
 * Corrections James made by hand: event id -> Map(player_id -> { verdict, note }).
 *
 * They are the final word for that player at that event. `buildPlan` applies them with a
 * reason starting "James", and any stored reason starting "James" is never overwritten by
 * a later run, so a Monday re-run cannot undo a Saturday correction.
 */
export function loadOverrides(json) {
  const out = new Map();
  for (const [eventId, players] of Object.entries(json ?? {})) {
    const m = new Map();
    for (const [playerId, o] of Object.entries(players ?? {})) {
      if (!VERDICTS.includes(o?.verdict)) throw new Error(`override ${eventId}/${playerId}: bad verdict ${o?.verdict}`);
      m.set(String(playerId), { verdict: o.verdict, note: o.note ?? "" });
    }
    out.set(eventId, m);
  }
  return out;
}

export const JAMES = "James";
export const isJames = (reason) => String(reason ?? "").startsWith(JAMES);

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

export async function loadRosters(db, { collection, getDocs }, events = EVENTS) {
  const rosters = new Map();
  for (const eventId of events) {
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
    const lid = leagueIdOf(playerId, roster.get(playerId));
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
 * Build the plan for the given events (every listed event by default).
 *
 * `rows` carries one entry per roster document, whether or not the verdict changes
 * anything, so the dry run can report totals and the apply step can write only the
 * documents whose stored value differs.
 *
 * Options added for the live-event runs (Data agent, Oct 2026):
 *   events     which events to plan (any id, listed in EVENTS or not)
 *   teams      only these team_ids get rows; coverage is still measured for every team
 *   overrides  James's corrections (`loadOverrides`)
 *
 * TWO COVERAGE CHECKS. The event's sheet must cover 80% of the joinable roster, and each
 * TEAM's sheet must hold at least TEAM_SHEET_MIN of its players: one team whose league
 * roster came back empty would otherwise slip through an event-wide check and have its
 * whole squad marked absent.
 */
export function buildPlan({ rosters, sheet, registry, events = EVENTS, teams = null, overrides = null }) {
  const warnings = [];
  /*
   * The registry first, as before. A player it does not know yet (a new face at this
   * event, added after the registry was last written) falls back to the league_id on the
   * roster document itself, which syncRoster writes - better than "no league id".
   */
  const leagueIdOf = (playerId, data) => {
    const fromRegistry = registry.get(String(playerId)) ?? null;
    const raw = data?.league_id;
    const fromDoc = raw == null || String(raw).trim() === "" ? null : String(Math.trunc(Number(raw)) || String(raw).trim());
    return fromRegistry ?? fromDoc;
  };
  const byEvent = new Map();
  const totals = { played: 0, absent: 0, unknown: 0 };
  const teamFilter = teams ? new Set([...teams].map(String)) : null;

  for (const eventId of events) {
    const roster = rosters.get(eventId) ?? new Map();
    const sheetForEvent = sheet.get(eventId);
    const fixes = overrides?.get(eventId) ?? new Map();

    for (const [playerId, data] of roster) {
      const reg = registry.get(String(playerId));
      const own = leagueIdOf(null, data);
      if (reg && own && reg !== own) {
        warnings.push(`${eventId}: ${data.Player} (${playerId}) registry league_id ${reg} ≠ roster doc ${own} — using the registry`);
      }
    }

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

    // Per-team coverage, keyed by team_id (the roster's own team key).
    const teamOf = (data) => String(data.team_id ?? data.Team ?? "—");
    const teamRosters = new Map();
    for (const [playerId, data] of roster) {
      const t = teamOf(data);
      if (!teamRosters.has(t)) teamRosters.set(t, new Map());
      teamRosters.get(t).set(playerId, data);
    }
    const teamStats = new Map();
    for (const [t, tr] of teamRosters) {
      const c = sheetCoverage(tr, sheetForEvent, leagueIdOf);
      const name = [...tr.values()][0]?.Team ?? t;
      const teamUsable = usable && c.found >= Math.min(TEAM_SHEET_MIN, c.joinable);
      teamStats.set(t, { teamId: t, name, players: tr.size, ...c, usable: teamUsable });
      if (usable && !teamUsable && (!teamFilter || teamFilter.has(t))) {
        warnings.push(
          `${eventId}: ${name} — only ${c.found} of its ${c.joinable} joinable players are on ` +
            `its team sheet (fewer than ${TEAM_SHEET_MIN}) — nobody on it marked absent`,
        );
      }
    }

    const rows = [];
    for (const [playerId, data] of roster) {
      const t = teamOf(data);
      if (teamFilter && !teamFilter.has(t)) continue;
      const leagueId = leagueIdOf(playerId, data);
      const kills = num(data["Confirmed Kills"]);
      const status = data.Status != null && data.Status !== "" ? String(data.Status) : null;
      let { verdict, reason } = resolveOne({
        kills,
        leagueId,
        sheetUsable: teamStats.get(t).usable,
        onSheet: Boolean(leagueId) && Boolean(sheetForEvent?.has(leagueId)),
        status,
      });
      const stored = data.participation ?? null;
      const storedReason = data.participationReason ?? null;
      let locked = false;
      const fix = fixes.get(String(playerId));
      if (fix) {
        // James has looked at this player himself: his call is final.
        verdict = fix.verdict;
        reason = fix.note ? `${JAMES}: ${fix.note}` : JAMES;
        locked = true;
      } else if (isJames(storedReason) && stored) {
        // Decided by James on an earlier run. Never overwritten by the rules.
        verdict = stored;
        reason = storedReason;
        locked = true;
      }
      totals[verdict]++;
      rows.push({
        eventId,
        playerId,
        name: data.Player ?? "(unnamed)",
        team: data.Team ?? "—",
        teamId: t,
        kills,
        status,
        leagueId,
        verdict,
        reason,
        locked,
        stored,
        storedReason,
        changed: stored !== verdict || (Boolean(fix) && storedReason !== reason),
      });
    }

    // Surfaced rather than acted on: a player the league dropped who still scored is
    // either a bad league_id join or a roster the team never updated. Rule 1 keeps
    // them visible either way, but a cluster of these means the sheet needs a look.
    const scoredOffSheet = rows.filter(
      (r) => r.kills > 0 && r.leagueId && usable && !sheetForEvent?.has(r.leagueId),
    );

    byEvent.set(eventId, { rows, coverage, usable, scoredOffSheet, teams: teamStats });
  }

  return { byEvent, warnings, totals };
}

/**
 * The plan as plain JSON, for the hub's Data agent: it builds James's message from this
 * and hands the same file back to `apply-participation.mjs --plan` so the apply can
 * refuse anything that is not exactly what he approved.
 */
export function planJson({ byEvent, warnings, totals }, meta = {}) {
  const events = {};
  for (const [eventId, p] of byEvent) {
    events[eventId] = {
      coverage: p.coverage,
      usable: p.usable,
      teams: Object.fromEntries([...p.teams].map(([t, s]) => [t, s])),
      rows: p.rows,
      scoredOffSheet: p.scoredOffSheet.map((r) => r.playerId),
    };
  }
  return { ...meta, warnings, totals, events, pending: pendingOf(byEvent) };
}

/** The writes a plan implies: [{ eventId, playerId, verdict, reason }], sorted. */
export function pendingOf(byEvent) {
  const out = [];
  for (const [, p] of byEvent) {
    for (const r of p.rows) {
      if (r.changed) out.push({ eventId: r.eventId, playerId: r.playerId, verdict: r.verdict, reason: r.reason });
    }
  }
  return out.sort((a, b) => `${a.eventId}/${a.playerId}`.localeCompare(`${b.eventId}/${b.playerId}`));
}
