/**
 * The pbleagues parsers against saved pages: run with `npm test` in functions/.
 * (.cjs so the site's root jest run does not pick it up: this is node:test, no deps.)
 *
 * Fixtures are the real /rankings and /schedule pages (gzipped), saved 24 Oct 2026:
 *   9322  World Cup 2026 — Pro split over TWO ranking tables (4 Champions + 20)
 *   9321  Lone Star Major 2026 — one Pro table
 *   8928  World Cup 2025 — one Pro table, plus the international Pro bracket on the schedule
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const { parseRankings, parseSchedule, CRAWLER_TEAM_ALIAS, resolveClub } = require("../pbleagues");

const page = (id, kind) =>
  zlib.gunzipSync(fs.readFileSync(path.join(__dirname, "fixtures/pbleagues", `${id}_${kind}.html.gz`))).toString();

const EVENTS = [
  { id: "9322", teams: 24, games: 46, tables: 2 },
  { id: "9321", teams: 20, games: 49, tables: 1 },
  { id: "8928", teams: 24, games: 57, tables: 1 },
];

/* The parser as it was before multi-table support (origin/main e478b5d), verbatim. */
const isPro = (h) =>
  /Pro X-Ball/i.test(h) && !/Semi-?Pro/i.test(h) && !/3v3/i.test(h) && !/WNXL|Women|Female/i.test(h);
const text = (h) =>
  String(h)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
function legacyParseRankings(html) {
  const divisions = [
    ...html.matchAll(
      /<div class="ranking"[^>]*data-division="([^"]*)"([\s\S]*?)(?=<div class="ranking"|<\/body>)/g,
    ),
  ];
  for (const [, division, body] of divisions) {
    if (!isPro(text(division))) continue;
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .map(([, tr]) => [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(([, c]) => text(c)))
      .filter((c) => c.length >= 3 && /^\d{1,2}$/.test(c[0]) && /[A-Za-z]/.test(c[1]))
      .map(([rank, team, points]) => ({
        rank: Number(rank),
        team,
        points: Number(String(points).replace(/\D/g, "")) || 0,
      }));
    if (rows.length) return { division: text(division), rows };
  }
  return { division: null, rows: [] };
}

const crawl = (parse, id) => {
  const rk = parse(page(id, "rankings"));
  const allow = rk.rows.length ? new Set(rk.rows.map((r) => r.team)) : null;
  return { rk, games: parseSchedule(page(id, "schedule"), { teams: allow }) };
};

for (const e of EVENTS) {
  test(`functions/pbleagues ${e.id}: ${e.teams} teams, ${e.games} games`, () => {
    const { rk, games } = crawl(parseRankings, e.id);
    assert.equal(rk.rows.length, e.teams);
    assert.equal(new Set(rk.rows.map((r) => r.team)).size, e.teams);
    assert.equal(rk.tables.length, e.tables);
    assert.equal(games.length, e.games);
  });
}

test("single table: division and rows identical to the old parser", () => {
  for (const id of ["9321", "8928"]) {
    const html = page(id, "rankings");
    const now = parseRankings(html);
    const old = legacyParseRankings(html);
    assert.deepEqual({ division: now.division, rows: now.rows }, old);
    assert.deepEqual(now.tables, [old]);
    assert.deepEqual(
      parseSchedule(page(id, "schedule"), { teams: new Set(now.rows.map((r) => r.team)) }),
      parseSchedule(page(id, "schedule"), { teams: new Set(old.rows.map((r) => r.team)) }),
    );
  }
});

test("9322: both Pro tables kept, ranks restart in each, old parser saw 4 / 6", () => {
  const rk = parseRankings(page("9322", "rankings"));
  assert.equal(rk.division, "Championship - Pro X-Ball (Thu-Sun) + Pro X-Ball (Thu-Sun)");
  assert.deepEqual(rk.tables.map((t) => t.rows.length), [4, 20]);
  assert.deepEqual(
    rk.tables[0].rows.map((r) => r.team).sort(),
    ["Edmonton Impact", "Ranger Warsaw", "Red Legion", "Tampa Bay Damage"],
  );
  for (const t of rk.tables) assert.equal(t.rows[0].rank, 1);

  const before = crawl(legacyParseRankings, "9322");
  assert.equal(before.rk.rows.length, 4);
  assert.equal(before.games.length, 6);
});

test("no Pro table: empty result, same as before", () => {
  const html = "<html><body><div class=\"ranking\" data-division=\"Semi-Pro X-Ball\"><table><tr><td>1</td><td>Team</td><td>10</td></tr></table></div></body></html>";
  assert.deepEqual(parseRankings(html), { division: null, rows: [], tables: [] });
  assert.deepEqual(legacyParseRankings(html), { division: null, rows: [] });
});

test("scripts/nxl-history/crawl-results.mjs stays in step", async () => {
  const mjs = await import(path.join(__dirname, "../../scripts/nxl-history/crawl-results.mjs"));
  for (const e of EVENTS) {
    const rk = mjs.parseRankings(page(e.id, "rankings"));
    assert.equal(rk.rows.length, e.teams, e.id);
    assert.equal(rk.tables.length, e.tables, e.id);
    const allow = new Set(rk.rows.map((r) => r.team));
    assert.equal(mjs.parseSchedule(page(e.id, "schedule"), { teams: allow }).length, e.games, e.id);
  }
});

/* lockNxlEvent against a fake Firestore and the saved rankings page. */
async function lock(id, teams, champion, meta = null) {
  const { lockNxlEvent } = require("../liveEvent");
  const realFetch = global.fetch;
  const realError = console.error;
  const errors = [];
  const updates = [];
  global.fetch = async () => ({ ok: true, status: 200, text: async () => page(id, "rankings") });
  console.error = (...a) => errors.push(a.join(" "));
  const doc = {
    id: `2026_${id}`,
    data: () => ({ key: `2026|${id}`, pbleaguesId: id, teams, champion }),
    ref: { update: async (u) => updates.push(u) },
  };
  const q = { where: () => q, get: async () => ({ docs: [doc] }) };
  try {
    const metaDoc = { exists: !!meta, data: () => meta, get: (f) => meta && meta[f] };
    await lockNxlEvent({ collection: () => q, doc: () => ({ get: async () => metaDoc }) }, "evt");
  } finally {
    global.fetch = realFetch;
    console.error = realError;
  }
  return { update: updates[0], errors };
}

test("lock, two tables: positions left blank, champion keeps 1, says why", async () => {
  const rk = parseRankings(page("9322", "rankings"));
  const teams = Object.fromEntries(rk.rows.map((r) => [r.team, { finishRank: null }]));
  teams["Red Legion"] = { finishRank: 1 };
  const { update, errors } = await lock("9322", teams, "Red Legion");
  assert.equal(update.live, false);
  assert.equal(update.teams, undefined);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^❌ .*2 tables .*finish positions left blank\.$/);
});

test("lock, one table: finishRank from the table as before", async () => {
  const rk = parseRankings(page("9321", "rankings"));
  const club = (t) => CRAWLER_TEAM_ALIAS[t] || t;
  const teams = Object.fromEntries(rk.rows.map((r) => [club(r.team), { finishRank: null }]));
  const champion = club(rk.rows.find((r) => r.rank === 1).team);
  const { update, errors } = await lock("9321", teams, champion);
  assert.deepEqual(errors, []);
  for (const r of rk.rows) assert.equal(update.teams[club(r.team)].finishRank, r.rank);
});

/* The club vocabulary as of the Midwest Open 2026, the last event in data/nxlHistory.json. */
const HISTORY = require("../data/nxlHistory.json");
const VOCAB = [...new Set(HISTORY.events.flatMap((e) => Object.keys(e.teams || {})))].sort(
  (a, b) => b.length - a.length,
);

test("World Cup 2026: all 24 Pro teams resolve, each to the right club", () => {
  const rk = parseRankings(page("9322", "rankings"));
  const got = Object.fromEntries(rk.rows.map((r) => [r.team, resolveClub(r.team, VOCAB)]));
  assert.deepEqual(got, {
    "Edmonton Impact": "Impact",
    "Ranger Warsaw": "Ranger",
    "Red Legion": "Red Legion",
    "Tampa Bay Damage": "Damage",
    "ALA Warsaw": "ALA",
    "Atlanta Jungle Cats": "Jungle Cats",
    "Chicago Aftershock": "Aftershock",
    "Chicago Distortion": "Distortion",
    "CK Hurricanes": "Hurricanes",
    "Detroit Infamous": "Infamous",
    "Houston Heat": "Heat",
    "Los Angeles Collision": "Collision",
    "Los Angeles Ironmen": "Ironmen",
    LTF: "LTF",
    "New Jersey Leverage": "Leverage",
    "New York Xtreme": "Xtreme",
    PaintballFIT: "PaintballFIT",
    "Perris ASG Aftermath": "Aftermath",
    "Puerto Rico tppcrew": "TPP Crew",
    "Royal City Seadogs": "Seadogs",
    "San Antonio X-Factor": "X-Factor",
    "San Diego Dynasty": "Dynasty",
    "Seattle Uprising": "Uprising",
    "TonTon Arsenal": "TonTons", // the alias, not the "Arsenal" suffix match
  });
});

test("World Cup 2026: every club has a team_id, so its players get appearances", () => {
  const rk = parseRankings(page("9322", "rankings"));
  const missing = rk.rows.map((r) => resolveClub(r.team, VOCAB)).filter((c) => !HISTORY.clubTeamId[c]);
  assert.deepEqual(missing, []);
  const ids = Object.values(HISTORY.clubTeamId);
  assert.equal(new Set(ids).size, ids.length, "one team_id per club");
});

test("resolveClub: an unlisted unknown name is still null, never passed through", () => {
  assert.equal(resolveClub("Somewhere Nobody", VOCAB), null);
});

/* crawlerAliases: team-name matches James approves in Slack, read from Firestore meta. */

test("resolveClub: a Firestore alias places a name the code has never seen", () => {
  assert.equal(resolveClub("Somewhere Nobody", VOCAB, { "Somewhere Nobody": "Nobodies" }), "Nobodies");
  assert.equal(resolveClub("Somewhere Nobody", VOCAB, { "Someone Else": "Else" }), null);
});

test("resolveClub: Firestore wins over a code alias on a clash", () => {
  assert.equal(resolveClub("TonTon Arsenal", VOCAB), "TonTons");
  assert.equal(resolveClub("TonTon Arsenal", VOCAB, { "TonTon Arsenal": "Arsenal" }), "Arsenal");
});

test("resolveClub: names with spaces and dots, as the backtick-quoted field paths allow", () => {
  const extra = { "St. Louis Ironmen Jr.": "Ironmen Jr", "A.B.C. Paintball Club": "ABC" };
  assert.equal(resolveClub("St. Louis Ironmen Jr.", VOCAB, extra), "Ironmen Jr");
  assert.equal(resolveClub("A.B.C. Paintball Club", VOCAB, extra), "ABC");
});

test("resolveClub: no extra aliases, or junk in them, changes nothing", () => {
  for (const name of ["TonTon Arsenal", "Ranger Warsaw", "Somewhere Nobody", "constructor"]) {
    const want = resolveClub(name, VOCAB);
    assert.equal(resolveClub(name, VOCAB, {}), want, name);
    assert.equal(resolveClub(name, VOCAB, { [name]: 42 }), want, name);
  }
  assert.equal(resolveClub("constructor", VOCAB), null);
});

/* A Firestore stand-in: the nxlEvents collection plus the meta document. */
function fakeDb(eventDocs, meta) {
  const { META_DOC } = require("../nxlEventsStore");
  return {
    collection: () => ({ get: async () => ({ docs: eventDocs.map((e) => ({ data: () => e })) }) }),
    doc: (p) => {
      assert.equal(p, META_DOC);
      return { get: async () => ({ exists: !!meta, data: () => meta, get: (f) => meta && meta[f] }) };
    },
  };
}

test("loadHistory: returns crawlerAliases from meta, {} when meta has none", async () => {
  const { loadHistory, loadCrawlerAliases } = require("../nxlEventsStore");
  const aliases = { "St. Louis Ironmen Jr.": "Ironmen Jr", "TonTon Arsenal": "TonTons" };
  const meta = { clubTeamId: { TonTons: "t1" }, names: {}, crawlerAliases: aliases };
  const h = await loadHistory(fakeDb([], meta));
  assert.deepEqual(h.crawlerAliases, aliases);
  assert.deepEqual(h.clubTeamId, { TonTons: "t1" });
  assert.deepEqual(await loadCrawlerAliases(fakeDb([], meta)), aliases);
  assert.deepEqual((await loadHistory(fakeDb([], { clubTeamId: {} }))).crawlerAliases, {});
  assert.deepEqual((await loadHistory(fakeDb([], null))).crawlerAliases, {});
  assert.deepEqual(await loadCrawlerAliases(fakeDb([], null)), {});
});

test("lock: a Firestore alias places a team the code cannot", async () => {
  const rk = parseRankings(page("9321", "rankings"));
  const club = (t) => CRAWLER_TEAM_ALIAS[t] || t;
  const renamed = rk.rows.find((r) => !CRAWLER_TEAM_ALIAS[r.team]);
  const teams = Object.fromEntries(rk.rows.map((r) => [club(r.team), { finishRank: null }]));
  teams["Renamed Club"] = teams[renamed.team];
  delete teams[renamed.team];
  const champion = club(rk.rows.find((r) => r.rank === 1).team);
  const champ = champion === renamed.team ? "Renamed Club" : champion;

  const without = await lock("9321", teams, champ);
  assert.equal(without.update.teams, undefined);
  assert.match(without.errors.join("\n"), /missing Renamed Club/);

  const withAlias = await lock("9321", teams, champ, { crawlerAliases: { [renamed.team]: "Renamed Club" } });
  assert.deepEqual(withAlias.errors, []);
  assert.equal(withAlias.update.teams["Renamed Club"].finishRank, renamed.rank);
});
