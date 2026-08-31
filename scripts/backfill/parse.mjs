/**
 * Parse an archived event workbook into the rows the long-data pipeline expects.
 *
 * Reads by HEADER NAME, never by position: the eight archives carry five different
 * Live Data column layouts (Atlantic City and Midwest have no `league_id`, Tampa Bay
 * 2025 has no `team_id`, the 2026 files add `Status`). Position-based reading would
 * silently scramble player ids.
 */

import XLSX from "xlsx";

/** file → Firestore event id. */
export const EVENT_FILES = {
  "Archived PickEm Paintball - Tampa Bay 2025 Data.xlsx": "tampa_bay_open_2025",
  "Archived PickEm Paintball - Atlantic City 2025 Data.xlsx": "atlantic_city_2025",
  "Archived PickEm Paintball - Midwest Open 2025 Data.xlsx": "midwest_open_2025",
  "Archived PickEm Paintball - Lone Star Open 2025 Data.xlsx": "lonestar_open_2025",
  "Archived PickEm Paintball - WorldCup 2025.xlsx": "world_cup_2025",
  "PickEm Paintball - MAO 2026 Archived.xlsx": "mid_atlantic_open_2026",
};

/**
 * Deliberately excluded.
 *   tampa_bay_2026     — the "Broken" file: 5 long rows, all Finals. Nothing to load.
 *   mid_west_open_2026 — already loaded. The archive carries no row_id column, so a
 *                        re-upload would mint fresh ids and duplicate all 2,940 rows,
 *                        and restore the three voided rows deleted on 31 Aug.
 */
export const EXCLUDED = {
  tampa_bay_2026: "archive has only 5 long rows (file is named Broken)",
  mid_west_open_2026: "already loaded; archive has no row_ids so re-upload would duplicate",
};

const SENTINELS = new Set(["Missed", "Penalty"]);
export const isSentinel = (p) => SENTINELS.has(p);

const clean = (v) => (v == null ? "" : String(v).trim());

/** Sheet → array of objects keyed by the header row. */
function sheetRows(wb, tab) {
  const ws = wb.Sheets[tab];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
}

/**
 * → YYYY-MM-DD, the granularity fixtures match on.
 *
 * The archives are inconsistent: the 2026 files and World Cup carry real dates, while
 * the 2025 ones carry text in DAY/MONTH/YEAR. Confirmed against the fixture list —
 * Tampa Bay 2025 reads "7/3/2025" where the league says 2025-03-07, so a US reading
 * would have put every prelim four months out and failed every fixture match.
 * Anything that is neither (a stray team name in the date column, and there is one)
 * returns null rather than a guess.
 */
export function toISODate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    if (+m > 12) return null; // unambiguously not D/M — refuse rather than swap
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

export function parseEvent(path) {
  const wb = XLSX.readFile(path, { cellDates: true });

  // ── Live Data: the per-event identity source ──────────────────────────────
  // Resolving names against THIS event's roster, not today's, is what keeps a
  // historic upload correct after the August identity fix renumbered ids.
  const live = sheetRows(wb, "Live Data");
  const playerIdByName = new Map();
  const teamIdByName = new Map();
  const dupNames = new Set();
  for (const r of live) {
    const pid = clean(r.player_id).replace(/\.0$/, "");
    const name = clean(r.Player);
    const team = clean(r.Team);
    const tid = clean(r.team_id);
    if (name && pid) {
      if (playerIdByName.has(name) && playerIdByName.get(name) !== pid) dupNames.add(name);
      playerIdByName.set(name, pid);
    }
    if (team && tid) teamIdByName.set(team, tid);
  }

  // ── Long Data: one row per kill ───────────────────────────────────────────
  const long = sheetRows(wb, "Long Data");
  const rows = [];
  const dropped = [];
  long.forEach((r, i) => {
    const round = clean(r.Round);
    const player = clean(r.Player);
    const team = clean(r.Team);
    const opponent = clean(r.Opponent);
    const point = r.Point;
    const type = clean(r.Type);
    const weight = r.Weight;
    const date = toISODate(r.Date);
    const sheetRow = i + 2; // header is row 1

    if (!round && !player && !team) return; // trailing blank

    // A round that is an Excel error mints a phantom game — the failure that put
    // 35 false match rows on 25 players at Mid West. Never upload one.
    if (!round || round.startsWith("#")) {
      dropped.push({ sheetRow, why: `bad round "${round || "(blank)"}"`, team, opponent, player, point });
      return;
    }
    if (!player) {
      dropped.push({ sheetRow, why: "no player", round, team, opponent, point });
      return;
    }
    if (!team || !opponent) {
      dropped.push({ sheetRow, why: "missing team or opponent", round, player, point });
      return;
    }

    rows.push({ sheetRow, round, date, team, opponent, point: Number(point) || 0, player, type, weight: Number(weight) || 0 });
  });

  return { rows, dropped, playerIdByName, teamIdByName, dupNames: [...dupNames], liveCount: live.length };
}

/** gameId = {eventId}_{round}_{sorted team ids} — must match buildGameId_ exactly. */
export function buildGameId(eventId, round, team, opponent, teamIdByName) {
  const a = teamIdByName.get(team) || team;
  const b = teamIdByName.get(opponent) || opponent;
  return `${eventId}_${round}_${[a, b].sort().join("-")}`;
}
