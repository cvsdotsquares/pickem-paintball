/**
 * Resolve a long-data player name to a live roster id.
 *
 * The sheets and the roster disagree on names more than you would expect: the scorer
 * types what is on the jersey or what people shout, the roster carries the registered
 * name. At Tampa Bay 2025 alone that gave "Matthew Askren" for Matt, "Sebastian Ivan
 * Lopez" for Ivan, and "Jackson Noodle Knees Frey" for Jackson Frey.
 *
 * Each unmatched name is a kill scored for nobody, so this matches on rules that cannot
 * be wrong and REPORTS anything needing a judgement call rather than guessing. A wrong
 * auto-match is worse than an unresolved one: it silently credits the wrong player.
 */

const norm = (s) =>
  String(s ?? "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

const tokens = (s) => norm(s).split(" ").filter(Boolean);

/** One is a prefix of the other, at least 3 chars — Matt/Matthew, Nick/Nicholas. */
const prefixy = (a, b) =>
  a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a));

export function buildResolver(rosterByName) {
  const exact = new Map();
  const bySurname = new Map();
  for (const [name, id] of rosterByName) {
    exact.set(norm(name), id);
    const t = tokens(name);
    if (!t.length) continue;
    const sur = t[t.length - 1];
    if (!bySurname.has(sur)) bySurname.set(sur, []);
    bySurname.get(sur).push({ id, name, given: t.slice(0, -1) });
  }

  return function resolve(raw) {
    const n = norm(raw);
    if (exact.has(n)) return { id: exact.get(n), how: "exact" };

    const t = tokens(raw);
    if (!t.length) return { id: null, how: "empty" };
    const cands = bySurname.get(t[t.length - 1]) ?? [];
    if (!cands.length) return { id: null, how: "no surname match" };

    // Surname matches. Accept only if a given name matches outright or is a clear
    // shortening — and only if exactly one candidate does, so a shared surname can
    // never silently pick the wrong brother.
    const mine = t.slice(0, -1);
    const hits = cands.filter((c) =>
      c.given.some((g) => mine.some((m) => g === m || prefixy(g, m))),
    );
    if (hits.length === 1) return { id: hits[0].id, how: `matched "${hits[0].name}"` };
    if (hits.length > 1) return { id: null, how: `ambiguous: ${hits.map((h) => h.name).join(" / ")}` };
    if (cands.length === 1) {
      // Surname is unique on the roster but no given name lines up — a real nickname
      // (Frank/Francis). Too risky to take automatically; surface it for a human.
      return { id: null, how: `surname-only candidate "${cands[0].name}" — needs confirming` };
    }
    return { id: null, how: `surname shared by ${cands.length}, no given-name match` };
  };
}
