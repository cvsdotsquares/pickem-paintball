/**
 * Fixture ground truth, from the Historic Results tab of the Power Rankings workbook —
 * pulled directly from the league's site, so it is the authority on whether a game
 * happened at all.
 *
 * TWO VOCABULARIES. Long Data records prelims by DAY (Thursday/Friday/Saturday) while
 * the fixture list records them by GROUP (A–E Prelims). Those cannot be mapped to each
 * other, so prelims are matched on DATE + team pair instead — which is what actually
 * disambiguates them. Playoffs do map, confirmed with James:
 *
 *   Wildcard → Ochos     Top8 → Quarters     Top4 → Semifinals     Finals → Final
 */

import XLSX from "xlsx";
import { toISODate } from "./parse.mjs";

export const PLAYOFF_ROUND = {
  Wildcard: "Ochos",
  Top8: "Quarters",
  Top4: "Semifinals",
  Finals: "Final",
};
/** True for OUR round labels (Friday, Saturday…) — anything not a playoff stage. */
export const isPrelim = (round) => !PLAYOFF_ROUND[round];

/**
 * True for the LEAGUE's round labels (A Prelims … E Prelims).
 *
 * Separate from `isPrelim` because the two vocabularies do not overlap: passing
 * "Quarters" to `isPrelim` returns true, since "Quarters" is not one of OUR playoff
 * keys — which briefly relabelled a real quarter-final as a Friday prelim.
 */
export const isLeaguePrelim = (round) => /prelim/i.test(String(round ?? ""));

/**
 * Fixture-list team names → the names our sheets use. Inferred from the 27 names in
 * the list; only these three differ, and each is unambiguous.
 */
const TEAM_ALIAS = {
  TonTons: "TonTon",
  "Lucky 15s": "Lucky15s",
  "Papeletto Team": "Papeletto",
};
export const normTeam = (n) => {
  const s = String(n ?? "").trim();
  return TEAM_ALIAS[s] ?? s;
};

/**
 * Fixture-list event labels → our event ids. The list carries a typo ("Tamp Bay Open")
 * and names Tampa Bay 2026 simply "Open", so this is matched on label + year rather
 * than trusted as a key.
 */
const EVENT_KEY = {
  "Tamp Bay Open|2025": "tampa_bay_open_2025",
  "Tampa Bay Open|2025": "tampa_bay_open_2025",
  "Atlantic City Open|2025": "atlantic_city_2025",
  "Midwest Open|2025": "midwest_open_2025",
  "Lone Star|2025": "lonestar_open_2025",
  "NXL World Cup|2025": "world_cup_2025",
  "Open|2026": "tampa_bay_2026",
  "Mid Atlantic Open|2026": "mid_atlantic_open_2026",
  "Midwest Open|2026": "mid_west_open_2026",
};

export function loadFixtures(path) {
  const wb = XLSX.readFile(path, { cellDates: true });
  const ws = wb.Sheets["5. Historic Results (Input)"];
  // Header sits on row 3; rows 1–2 are a title and a note.
  const raw = XLSX.utils.sheet_to_json(ws, { range: 2, defval: null, raw: true });

  const byEvent = new Map();
  const unmappedEvents = new Map();
  for (const r of raw) {
    const label = String(r.Event ?? "").trim();
    const year = String(r.Year ?? "").trim();
    if (!label || !year) continue;
    const eventId = EVENT_KEY[`${label}|${year}`];
    if (!eventId) {
      if (year === "2025" || year === "2026") {
        unmappedEvents.set(`${label}|${year}`, (unmappedEvents.get(`${label}|${year}`) ?? 0) + 1);
      }
      continue;
    }
    const t1 = normTeam(r["Team 1"]);
    const t2 = normTeam(r["Team 2"]);
    if (!t1 || !t2) continue;
    if (!byEvent.has(eventId)) byEvent.set(eventId, []);
    byEvent.get(eventId).push({
      date: toISODate(r.Date),
      round: String(r.Round ?? "").trim(),
      pair: [t1, t2].sort().join(" v "),
      score: `${r["Score 1"]}-${r["Score 2"]}`,
    });
  }
  return { byEvent, unmappedEvents };
}

/**
 * Index an event's fixtures for lookup two ways: playoffs by mapped round, prelims by
 * date. A game is confirmed if the team pair appears under the matching key.
 */
export function indexFixtures(list) {
  const byRound = new Map(); // "Ochos|IMP v UPR" -> count
  const byDate = new Map(); // "2025-11-14|IMP v UPR" -> count
  const pairs = new Map(); // "IMP v UPR" -> count
  for (const f of list) {
    const rk = `${f.round}|${f.pair}`;
    byRound.set(rk, (byRound.get(rk) ?? 0) + 1);
    if (f.date) {
      const dk = `${f.date}|${f.pair}`;
      byDate.set(dk, (byDate.get(dk) ?? 0) + 1);
    }
    pairs.set(f.pair, (pairs.get(f.pair) ?? 0) + 1);
  }
  return { byRound, byDate, pairs, total: list.length };
}


/**
 * What the league says about one team pair at one event: how many times they met, and
 * in which rounds.
 *
 * This is what turns a split game from a blocker into a correction. Our sheet may have
 * one match torn across "Friday" and "Top8"; the fixture list settles whether they met
 * once (so one label is wrong) or twice (so both are right and it was never a split).
 */
export function meetingsByPair(list) {
  const m = new Map();
  for (const f of list) {
    if (!m.has(f.pair)) m.set(f.pair, []);
    m.get(f.pair).push({ round: f.round, date: f.date });
  }
  return m;
}

/**
 * Our day labels mapped to calendar dates, learned from the event's own long data.
 *
 * The fixture list records prelims by group (A–E Prelims) and our sheets record them by
 * day (Friday/Saturday), so neither can be translated into the other directly. Both
 * carry a DATE though, so the date is the bridge: whatever label our rows overwhelmingly
 * use for a given date is that date's label.
 */
export function dayLabelsByDate(rows) {
  const counts = new Map(); // date -> Map(round -> n)
  for (const r of rows) {
    if (!r.date || !isPrelim(r.round)) continue;
    if (!counts.has(r.date)) counts.set(r.date, new Map());
    const m = counts.get(r.date);
    m.set(r.round, (m.get(r.round) ?? 0) + 1);
  }
  const out = new Map();
  for (const [date, m] of counts) {
    const best = [...m].sort((a, b) => b[1] - a[1])[0];
    if (best) out.set(date, best[0]);
  }
  return out;
}
