// The counting rule for pick % (pickPct.js), checked against the cases real user documents
// contain. Run: node --test functions/pickPct.check.js   (named .check so jest leaves it alone)
const test = require("node:test");
const assert = require("node:assert");
const { countEvent, snapshotFor, refreshLive } = require("./pickPct");

const E = "world_cup_2026";

test("an entry is a non-empty roster; drafts and other events never count", () => {
  const c = countEvent(
    [
      { [E]: ["1", "2"], [`${E}_captain`]: "1" },
      { [E]: [] },                                                   // saved nothing
      { [`${E}_draft`]: ["1"], [`${E}_draft_captain`]: "1" },        // draft only
      { lone_star_open_2026: ["1"], lone_star_open_2026_captain: "1" },
      {},
    ],
    E,
  );
  assert.strictEqual(c.entries, 1);
  assert.strictEqual(c.picks.get("1"), 1);
  assert.strictEqual(c.captains.get("1"), 1);
});

test("a player listed twice in one roster counts once; numbers and strings are the same id", () => {
  const c = countEvent([{ [E]: [100013, "100013", "100005"], [`${E}_captain`]: 100013 }], E);
  assert.strictEqual(c.picks.get("100013"), 1);
  assert.strictEqual(c.captains.get("100013"), 1);
});

test("an entry without a captain is counted as such, not as a captain", () => {
  const c = countEvent([{ [E]: ["1"] }, { [E]: ["1"], [`${E}_captain`]: null }, { [E]: ["1"], [`${E}_captain`]: "" }], E);
  assert.strictEqual(c.entries, 3);
  assert.strictEqual(c.noCaptain, 3);
  assert.strictEqual(c.captains.size, 0);
});

test("the snapshot lists every roster player (zeros too), percentages of entries, unknown ids apart", () => {
  const counted = countEvent(
    [
      { [E]: ["a", "b"], [`${E}_captain`]: "a" },
      { [E]: ["a", "x"], [`${E}_captain`]: "x" },
      { [E]: ["a", "b"], [`${E}_captain`]: "b" },
    ],
    E,
  );
  const s = snapshotFor(E, ["a", "b", "c"], counted);
  assert.strictEqual(s.entries, 3);
  assert.deepStrictEqual(s.players.a, { picks: 3, pickPct: 100, captains: 1, captainPct: 33.33 });
  assert.deepStrictEqual(s.players.b, { picks: 2, pickPct: 66.67, captains: 1, captainPct: 33.33 });
  assert.deepStrictEqual(s.players.c, { picks: 0, pickPct: 0, captains: 0, captainPct: 0 });
  assert.deepStrictEqual(s.unknown, ["x"]);
});

test("no entries: zeros, not a division by zero", () => {
  const s = snapshotFor(E, ["a"], countEvent([], E));
  assert.deepStrictEqual(s.players.a, { picks: 0, pickPct: 0, captains: 0, captainPct: 0 });
});

// A tiny in-memory stand-in for the Firestore calls refreshLive makes.
function fakeDb(docs) {
  const ts = (d) => ({ toDate: () => d });
  const snap = (path) => ({ id: path.split("/").pop(), exists: path in docs, get: (k) => docs[path]?.[k] });
  const coll = (path) => {
    const kids = Object.keys(docs).filter((p) => p.startsWith(path + "/") && p.split("/").length === path.split("/").length + 1);
    const q = { docs: kids.map(snap) };
    return { where: (f, op, v) => ({ get: async () => ({ docs: q.docs.filter((d) => d.get(f) === v) }) }), select: () => ({ get: async () => q }), get: async () => q };
  };
  return {
    ts,
    collection: coll,
    doc: (path) => ({
      get: async () => snap(path),
      set: async (v) => { docs[path] = v; },
      update: async (v) => { docs[path] = { ...docs[path], ...v }; },
    }),
  };
}
const fakeAdmin = { firestore: { FieldValue: { serverTimestamp: () => "SERVER_TIME" } } };

test("refreshLive: counts the event with picks open, closes the one whose lock passed, leaves the rest", async () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const docs = {};
  const db = fakeDb(docs);
  Object.assign(docs, {
    "events/world_cup_2026": { status: "live", lockDate: db.ts(new Date("2026-11-12T12:25:00Z")) },
    "events/world_cup_2026/players/a": {},
    "events/world_cup_2026/players/b": {},
    "events/lone_star_open_2026": { status: "live", lockDate: db.ts(new Date("2026-09-18T12:55:00Z")) },
    "events/lone_star_open_2026/summaries/pickPctLive": { open: true, entries: 392 },
    "events/mid_west_open_2026": { status: "archived", lockDate: db.ts(new Date("2026-06-26T11:55:00Z")) },
    "users/u1": { pickems: { world_cup_2026: ["a"], world_cup_2026_captain: "a" } },
    "users/u2": { pickems: { world_cup_2026: ["a", "b"], world_cup_2026_captain: "b" } },
  });
  const done = await refreshLive(db, fakeAdmin, now);
  const live = docs["events/world_cup_2026/summaries/pickPctLive"];
  assert.strictEqual(live.entries, 2);
  assert.strictEqual(live.open, true);
  assert.deepStrictEqual(live.players.a, { picks: 2, pickPct: 100, captains: 1, captainPct: 50 });
  assert.strictEqual(docs["events/lone_star_open_2026/summaries/pickPctLive"].open, false);
  assert.ok(!("events/mid_west_open_2026/summaries/pickPctLive" in docs));
  assert.strictEqual(done.length, 2);
});
