const test = require('node:test');
const assert = require('node:assert');
const { holdState, runDue } = require('../postScheduler.js');

const NOW = Date.parse('2026-10-28T16:00:00Z');   // Wed 28 Oct, 12:00 PM ET
const ts = (iso) => ({ toMillis: () => Date.parse(iso) });
const post = { waitFor: ['picks_live'] };

test('no waitFor: nothing to wait for', () => {
  assert.deepStrictEqual(holdState({}, {}, NOW).waiting, []);
  assert.deepStrictEqual(holdState({ waitFor: [] }, {}, NOW).waiting, []);
});

test('missing job doc: not passed', () => {
  assert.deepStrictEqual(holdState(post, { picks_live: null }, NOW).waiting, ['picks_live']);
});

test('failed run: not passed, even for a once job', () => {
  const j = { result: 'failed', repeat: 'once', finishedAt: ts('2026-10-28T15:00:00Z') };
  assert.deepStrictEqual(holdState(post, { picks_live: j }, NOW).waiting, ['picks_live']);
});

test('once job ok: passes whenever it ran', () => {
  const j = { result: 'ok', repeat: 'once', finishedAt: ts('2026-09-01T12:00:00Z') };
  assert.deepStrictEqual(holdState(post, { picks_live: j }, NOW).waiting, []);
});

test('daily job ok today (ET): passes', () => {
  const j = { result: 'ok', repeat: 'daily', finishedAt: ts('2026-10-28T13:05:00Z') };
  assert.deepStrictEqual(holdState(post, { picks_live: j }, NOW).waiting, []);
});

test('daily job ok at 11:30 PM ET yesterday (03:30 UTC today): not passed', () => {
  const j = { result: 'ok', repeat: 'daily', finishedAt: ts('2026-10-28T03:30:00Z') };
  assert.deepStrictEqual(holdState(post, { picks_live: j }, NOW).waiting, ['picks_live']);
});

test('daily job ok just after midnight ET (04:30 UTC): passes', () => {
  const j = { result: 'ok', repeat: 'daily', finishedAt: ts('2026-10-28T04:30:00Z') };
  assert.deepStrictEqual(holdState(post, { picks_live: j }, NOW).waiting, []);
});

test('several jobs: only the ones not passed are listed', () => {
  const docs = {
    a: { result: 'ok', repeat: 'once', finishedAt: ts('2026-10-01T00:00:00Z') },
    b: null,
    c: { result: 'ok', repeat: 'own_timer', finishedAt: ts('2026-10-27T12:00:00Z') },
  };
  assert.deepStrictEqual(holdState({ waitFor: ['a', 'b', 'c'] }, docs, NOW).waiting, ['b', 'c']);
});

// ---- runDue with a small in-memory Firestore -------------------------------------------------

const DELETE = Symbol('delete');
const SERVER_TS = Symbol('serverTimestamp');
const FieldValue = { delete: () => DELETE, serverTimestamp: () => SERVER_TS };
const Timestamp = { now: () => ({ toMillis: () => NOW }) };

function fakeDb(store) {
  function ref(coll, id) {
    return {
      coll, id,
      get: async () => mkSnap(coll, id),
      update: async (patch) => apply(coll, id, patch),
    };
  }
  function mkSnap(coll, id) {
    const data = (store[coll] || {})[id];
    return { id, exists: data !== undefined, data: () => (data ? { ...data } : undefined), get: (f) => (data ? data[f] : undefined), ref: ref(coll, id) };
  }
  function apply(coll, id, patch) {
    const doc = store[coll][id];
    for (const [k, v] of Object.entries(patch)) { if (v === DELETE) delete doc[k]; else doc[k] = v; }
  }
  return {
    collection: (coll) => ({
      doc: (id) => ref(coll, id),
      where: (field, op, value) => ({
        get: async () => ({ docs: Object.keys(store[coll] || {}).filter((id) => store[coll][id][field] === value).map((id) => mkSnap(coll, id)) }),
      }),
    }),
    runTransaction: async (fn) => fn({ get: (r) => r.get(), update: (r, patch) => apply(r.coll, r.id, patch) }),
  };
}

function due(extra) {
  return { kind: 'post', status: 'approved', event: 'world_cup_2026', title: 'Picks are Live', caption: 'x', fbPhotoIds: ['1'], publishAt: ts('2026-10-28T15:00:00Z'), ...extra };
}

test('runDue holds a post whose job has not passed, and keeps the first waitingSince', async () => {
  const store = { scheduledPosts: { p1: due({ waitFor: ['picks_live'] }) }, agentJobs: {} };
  const db = fakeDb(store);
  await runDue({ db, Timestamp, FieldValue });
  assert.strictEqual(store.scheduledPosts.p1.status, 'approved');
  assert.strictEqual(store.scheduledPosts.p1.waiting, 'picks_live');
  assert.strictEqual(store.scheduledPosts.p1.waitingSince, SERVER_TS);

  store.scheduledPosts.p1.waitingSince = 'first';
  await runDue({ db, Timestamp, FieldValue });
  assert.strictEqual(store.scheduledPosts.p1.waitingSince, 'first');
});

test('runDue claims a post once its job passed and clears waiting/waitingSince', async () => {
  const store = {
    scheduledPosts: { p1: due({ waitFor: ['picks_live'], waiting: 'picks_live', waitingSince: 'first' }) },
    agentJobs: { world_cup_2026__picks_live: { result: 'ok', repeat: 'once', finishedAt: ts('2026-10-28T15:30:00Z') } },
  };
  // No network in tests: the send fails, which still shows the post was claimed.
  const realFetch = global.fetch;
  global.fetch = async () => { throw new Error('no network in tests'); };
  const realError = console.error;
  console.error = () => {};
  try {
    await runDue({ db: fakeDb(store), Timestamp, FieldValue });
  } finally {
    global.fetch = realFetch;
    console.error = realError;
  }
  const p = store.scheduledPosts.p1;
  assert.strictEqual(p.status, 'failed');
  assert.strictEqual(p.sendingAt, SERVER_TS);
  assert.ok(!('waiting' in p));
  assert.ok(!('waitingSince' in p));
});
