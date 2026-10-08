/**
 * Shared plan for the player identity fix (defects 1 and 2).
 *
 * Both `dry-run-identity-fix.mjs` and `apply-identity-fix.mjs` import this, so the
 * plan that gets reviewed is byte-for-byte the plan that gets written. Do not
 * duplicate any of these tables into either script.
 *
 * Defect 1 — `atlantic_city_2025` renumbered a block of 11 slots, so 10 ids each
 *            hold two different people. Confirmed by three independent sources:
 *            surrounding events, player photos, and the NXL league-id export.
 * Defect 2 — one person holding two ids: 5 name merges, plus 3 duplicate ids that
 *            have no NXL record at all.
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

export const AC = "atlantic_city_2025";

/** Defect 1: applies to `atlantic_city_2025` ONLY. from -> to. */
export const AC_MOVES = {
  "100304": "100311", // Austin Woodward
  "100305": "100316", // Charlie Givens
  "100306": "100308", // Connor Nelson
  "100307": "100312", // Conor Smith
  "100308": "100309", // Ilia Pankov
  "100309": "100314", // James Whittington
  "100311": "100315", // Jordan Rhodes
  "100312": "100313", // Nathan Combs
  "100313": "100207", // Carter Donaldson == William Donaldson
  "100314": "100307", // Leonid Smotrov
};

/**
 * Defect 2. `keep` is the NEWEST id — the live 2026 sheets already carry it, so no
 * Google Sheet surgery is needed on an event whose pipeline is still active, and
 * only 2025-side picks need rewriting. Applies in every event where `retire` exists.
 */
export const MERGES = [
  { who: "Askren",     retire: "100052", keep: "100389", leagueId: "10117" },
  { who: "Antetomaso", retire: "100145", keep: "100381", leagueId: "59302" },
  { who: "Lopez",      retire: "100149", keep: "100403", leagueId: "143019" },
  { who: "Wojnicz",    retire: "100305", keep: "100321", leagueId: "34834" },
  { who: "Cort",       retire: "100193", keep: "100358", leagueId: "18088" },
  // No NXL record exists for these ids — provably spurious roster entries.
  { who: "Botsolas",   retire: "100873", keep: "100197", leagueId: "11657" },
  { who: "Patino",     retire: "100879", keep: "100199", leagueId: "84167" },
  { who: "Zuppa",      retire: "100918", keep: "100200", leagueId: "46532" },
];

/**
 * Display name for each merged person, chosen by James. Not simply "most recent" —
 * Donaldson keeps "Carter" and Cort keeps "Dustin" — so these are explicit, never
 * derived. Without them the season aggregation takes whichever event it reads first.
 */
export const CANONICAL_NAMES = {
  "100207": "Carter Donaldson",
  "100321": "Steve Wojnicz",
  "100200": "Mike Zuppa",
  "100389": "Matt Askren",
  "100381": "Frank Antetomaso",
  "100403": "Ivan Lopez",
  "100358": "Dustin Cort",
};

/** Fields the recompute owns — compared when deciding a duplicate is safe to drop. */
export const STAT_FIELDS = [
  "Confirmed Kills", "Gunfights", "Breakshooting", "Movement",
  "Zone Coverage", "Pressure", "Trades", "Unclassified",
];

export const num = (v) => Number(v ?? 0) || 0;

/** rosters: eventId -> Map(playerId -> data) */
export async function loadRosters(db, { collection, getDocs }) {
  const rosters = new Map();
  for (const ev of EVENTS) {
    const snap = await getDocs(collection(db, "events", ev, "players"));
    rosters.set(ev, new Map(snap.docs.map((d) => [d.id, d.data()])));
  }
  return rosters;
}

/**
 * Build the operation plan.
 * @returns {{ops: Map, remap: Map, warnings: string[]}}
 *   ops   — eventId -> [{kind: MOVE|DELETE|DELETE-CONFLICT, from, to, who, kills, defect}]
 *   remap — eventId -> Map(oldId -> newId), drives the pick rewrites
 */
export function buildPlan(rosters) {
  const warnings = [];
  const ops = new Map(EVENTS.map((e) => [e, []]));
  const remap = new Map(EVENTS.map((e) => [e, new Map()]));
  const nameOf = (ev, id) => rosters.get(ev)?.get(id)?.Player ?? null;
  const killsOf = (ev, id) => num(rosters.get(ev)?.get(id)?.["Confirmed Kills"]);

  // Defect 1 — Atlantic City only.
  for (const [from, to] of Object.entries(AC_MOVES)) {
    if (!rosters.get(AC).has(from)) {
      warnings.push(`AC move source ${from} no longer exists — already applied?`);
      continue;
    }
    ops.get(AC).push({
      kind: "MOVE", from, to, who: nameOf(AC, from), kills: killsOf(AC, from), defect: 1,
    });
    remap.get(AC).set(from, to);
  }

  // Defect 2 — every event where the retired id appears.
  for (const m of MERGES) {
    const seen = EVENTS.filter((ev) => rosters.get(ev).has(m.retire));
    if (!seen.length) {
      warnings.push(`merge ${m.who}: retire id ${m.retire} not found in any event`);
      continue;
    }
    for (const ev of seen) {
      // A defect-1 move already claims this doc in this event — different person.
      // (100305 is Charlie Givens at AC but Steve Pablo Wojnicz at MW25.)
      if (ev === AC && Object.hasOwn(AC_MOVES, m.retire)) continue;

      if (rosters.get(ev).has(m.keep)) {
        // Both ids on the same roster: a true duplicate. Drop the spare, but only
        // after confirming it carries no stats the survivor lacks.
        const diffs = STAT_FIELDS.filter(
          (f) => num(rosters.get(ev).get(m.retire)[f]) !== num(rosters.get(ev).get(m.keep)[f]),
        );
        ops.get(ev).push({
          kind: diffs.length ? "DELETE-CONFLICT" : "DELETE",
          from: m.retire, to: m.keep, who: nameOf(ev, m.retire),
          kills: killsOf(ev, m.retire), defect: 2, diffs,
        });
        if (diffs.length) {
          warnings.push(
            `${m.who} @ ${SHORT[ev]}: duplicate ${m.retire} differs from ${m.keep} on ` +
            `${diffs.join(", ")} — needs a decision before dropping`,
          );
        }
      } else {
        ops.get(ev).push({
          kind: "MOVE", from: m.retire, to: m.keep,
          who: nameOf(ev, m.retire), kills: killsOf(ev, m.retire), defect: 2,
        });
      }
      remap.get(ev).set(m.retire, m.keep);
    }
  }

  // Pre-flight: would the final state collide anywhere?
  for (const ev of EVENTS) {
    const evOps = ops.get(ev);
    if (!evOps.length) continue;
    const vacated = new Set(evOps.map((o) => o.from));
    const landing = new Map();
    for (const o of evOps.filter((o) => o.kind === "MOVE")) {
      if (landing.has(o.to)) {
        warnings.push(`${SHORT[ev]}: ${o.from} and ${landing.get(o.to)} both target ${o.to}`);
      }
      landing.set(o.to, o.from);
      if (rosters.get(ev).has(o.to) && !vacated.has(o.to)) {
        warnings.push(
          `${SHORT[ev]}: target ${o.to} is occupied by "${nameOf(ev, o.to)}" and is not being vacated`,
        );
      }
    }
  }

  return { ops, remap, warnings };
}

/** Slots a MOVE empties that nothing lands in — these get deleted. */
export function vacatedSlots(evOps) {
  const landing = new Set(evOps.filter((o) => o.kind === "MOVE").map((o) => o.to));
  return evOps.filter((o) => o.kind === "MOVE" && !landing.has(o.from)).map((o) => o.from);
}

/** The rosters as they will be once the plan is applied. */
export function projectAfter(rosters, ops) {
  const after = new Map();
  for (const ev of EVENTS) {
    const next = new Map(rosters.get(ev));
    const evOps = ops.get(ev);
    for (const o of evOps) {
      if (o.kind === "MOVE") {
        const data = { ...rosters.get(ev).get(o.from) };
        if (CANONICAL_NAMES[o.to]) data.Player = CANONICAL_NAMES[o.to];
        next.set(o.to, data);
        if (!evOps.some((x) => x.kind === "MOVE" && x.to === o.from)) next.delete(o.from);
      } else {
        next.delete(o.from); // duplicate dropped; survivor already present
      }
    }
    // Name corrections on docs that don't move.
    for (const [id, canonical] of Object.entries(CANONICAL_NAMES)) {
      const d = next.get(id);
      if (d && d.Player !== canonical) next.set(id, { ...d, Player: canonical });
    }
    after.set(ev, next);
  }
  return after;
}

/**
 * Every user pick that the plan rewrites.
 * Preserves each element's original type — some events store pick ids as numbers
 * and others as strings, and coercing them would be an unrelated change.
 * @returns Array<{userId, updates: Record<fieldPath, value>, events: Set}>
 */
export function buildPickRewrites(userDocs, remap) {
  const out = [];
  for (const doc of userDocs) {
    const pk = doc.get("pickems") || {};
    const updates = {};
    const events = new Set();
    for (const [key, val] of Object.entries(pk)) {
      const base = key.replace(/_draft_captain$|_captain$|_draft$/, "");
      const map = remap.get(base);
      if (!map || !map.size) continue;

      if (key.endsWith("_captain")) {
        if (val == null) continue;
        const id = String(val);
        if (!map.has(id)) continue;
        updates[`pickems.${key}`] = typeof val === "number" ? Number(map.get(id)) : map.get(id);
        events.add(base);
      } else if (Array.isArray(val)) {
        if (!val.some((r) => map.has(String(r)))) continue;
        updates[`pickems.${key}`] = val.map((raw) => {
          const id = String(raw);
          if (!map.has(id)) return raw;
          return typeof raw === "number" ? Number(map.get(id)) : map.get(id);
        });
        events.add(base);
      }
    }
    if (Object.keys(updates).length) out.push({ userId: doc.id, updates, events });
  }
  return out;
}
