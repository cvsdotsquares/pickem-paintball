/**
 * Corrections to the Power Rankings workbook, each one signed off by James.
 *
 * The workbook is the source for match results and it carries mistakes that a reconciliation
 * against pbleagues surfaced — two games that were never played, and two scores that are
 * wrong. Fixing them here rather than in the spreadsheet keeps the repo reproducible: the
 * workbook is re-exported by hand, so a fix made there can be lost on the next export and
 * nobody would know. This file is reviewed like code and applied on every build.
 *
 * ⚠️ FIX THE WORKBOOK TOO. This layer stops the error reaching the site; it does not stop
 * the error existing. If the workbook is corrected, delete the matching entry here — an
 * entry that no longer matches anything is reported by `build.mjs` rather than ignored,
 * precisely so the two cannot drift apart silently.
 *
 * Reconciliation of 13-15 Sep 2026 compared all 2,393 workbook matches against the league's
 * own schedules: 2,374 agreed outright and every difference was reviewed row by row.
 */

/** A match the workbook holds that was never played. Matched on round + teams + score. */
export const DROP_MATCHES = [
  {
    key: "2017|NXL World Cup",
    round: "A Prelims",
    a: "Red Legion",
    b: "Uprising",
    sa: 4,
    sb: 2,
    why:
      "This game does not exist. pbleagues has no Red Legion v Uprising at the 2017 World " +
      "Cup, and neither side's four prelim games involve the other. Red Legion and Uprising " +
      "were the only teams in the event with five prelim games where the field played four.",
  },
  {
    key: "2017|NXL World Cup",
    round: "A Prelims",
    a: "Infamous",
    b: "Boom",
    sa: 5,
    sb: 2,
    once: true,
    why:
      "Held twice, identical in round, date, teams and score. pbleagues has it once. This " +
      "drops the second copy only, taking Boom to 0-4 and Infamous to 4-2.",
  },
];

/** A score the workbook has wrong. Matched on round + teams; the score is replaced. */
export const FIX_SCORES = [
  {
    key: "2015|Great Lakes Open",
    round: "Quarters",
    a: "Damage",
    b: "Impact",
    sa: 3,
    sb: 6,
    why: "Impact won 6-3. The workbook has 3-5; pbleagues has 3-6, and James confirmed 6-3.",
  },
  {
    key: "2017|NXL World Cup",
    round: "Semifinals",
    a: "Dynasty",
    b: "Infamous",
    sa: 9,
    sb: 3,
    why: "Dynasty won 9-3. The workbook has 6-3; pbleagues has 9-3, and James confirmed it.",
  },
];

/**
 * A round the workbook records under the wrong name. Matched on the raw round string.
 *
 * The 2022 World Cup has two rounds whose Round cell is a corrupted Excel date serial. They
 * are NOT the same thing, which is the trap: 11689 is six games among exactly four teams who
 * play nobody else, a group stage, and stays as prelims. 42370 is two games sitting after A
 * Prelims and before Ochos, whose winners went on and whose losers went out — a knockout.
 * Leaving it as prelims denies DMG and Red Legion a Sunday they earned.
 */
export const FIX_ROUNDS = [
  {
    key: "2022|World Cup",
    from: "42370",
    to: "Wildcard",
    why:
      "A knockout round the workbook lost to a corrupted Round cell. pbleagues calls it 1/16; " +
      "'Wildcard' is the league's own name for this round and the one the 2026 events use, so " +
      "it needs no new vocabulary anywhere. Confirmed by James 15 Sep 2026.",
  },
];

const pair = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Apply every correction to one event's match list.
 *
 * Returns the new list plus which corrections actually fired, so the build can shout about
 * one that matched nothing — that means the workbook changed under it and the entry is
 * either already fixed or now wrong.
 */
export function applyCorrections(eventKey, matches) {
  const used = new Set();
  let out = matches;

  for (const [i, d] of DROP_MATCHES.entries()) {
    if (d.key !== eventKey) continue;
    let seen = 0;
    out = out.filter((m) => {
      const hit =
        m.round === d.round &&
        pair(m.a, m.b) === pair(d.a, d.b) &&
        ((m.a === d.a && m.sa === d.sa && m.sb === d.sb) ||
          (m.a === d.b && m.sa === d.sb && m.sb === d.sa));
      if (!hit) return true;
      seen++;
      /* `once` keeps the first copy and removes the rest; otherwise every copy goes. */
      if (d.once && seen === 1) return true;
      used.add(`drop:${i}`);
      return false;
    });
  }

  for (const [i, r] of FIX_ROUNDS.entries()) {
    if (r.key !== eventKey) continue;
    out = out.map((m) => {
      if (String(m.round) !== r.from) return m;
      used.add(`round:${i}`);
      return { ...m, round: r.to };
    });
  }

  for (const [i, f] of FIX_SCORES.entries()) {
    if (f.key !== eventKey) continue;
    out = out.map((m) => {
      if (m.round !== f.round || pair(m.a, m.b) !== pair(f.a, f.b)) return m;
      used.add(`fix:${i}`);
      return m.a === f.a ? { ...m, sa: f.sa, sb: f.sb } : { ...m, sa: f.sb, sb: f.sa };
    });
  }

  return { matches: out, used };
}

/** Every correction's id, so the build can name the ones that matched nothing. */
export const ALL_CORRECTION_IDS = [
  ...DROP_MATCHES.map((d, i) => [`drop:${i}`, `${d.key} ${d.a} v ${d.b}`]),
  ...FIX_ROUNDS.map((r, i) => [`round:${i}`, `${r.key} round ${r.from} -> ${r.to}`]),
  ...FIX_SCORES.map((f, i) => [`fix:${i}`, `${f.key} ${f.a} v ${f.b}`]),
];

export const TOTAL_CORRECTIONS = DROP_MATCHES.length + FIX_ROUNDS.length + FIX_SCORES.length;
