// Slack on posted / failed (James, 24 Nov 2026): @James on every message, posted → slackChannel,
// failed → slackFailChannel, and a Slack problem never changes what happened to the post.
const test = require('node:test');
const assert = require('node:assert');
const { notifySlack, runDue } = require('../postScheduler.js');

const NOW = Date.parse('2026-10-28T16:00:00Z');
const ts = (iso) => ({ toMillis: () => Date.parse(iso) });
const DELETE = Symbol('delete');
const SERVER_TS = Symbol('serverTimestamp');
const FieldValue = { delete: () => DELETE, serverTimestamp: () => SERVER_TS };
const Timestamp = { now: () => ({ toMillis: () => NOW }) };

function fakeDb(store) {
  const ref = (coll, id) => ({ coll, id, get: async () => snap(coll, id), update: async (p) => apply(coll, id, p) });
  const snap = (coll, id) => {
    const data = (store[coll] || {})[id];
    return { id, exists: data !== undefined, data: () => (data ? { ...data } : undefined), get: (f) => (data ? data[f] : undefined), ref: ref(coll, id) };
  };
  const apply = (coll, id, patch) => {
    for (const [k, v] of Object.entries(patch)) { if (v === DELETE) delete store[coll][id][k]; else store[coll][id][k] = v; }
  };
  return {
    collection: (coll) => ({
      doc: (id) => ref(coll, id),
      where: (field, op, value) => ({ get: async () => ({ docs: Object.keys(store[coll] || {}).filter((id) => store[coll][id][field] === value).map((id) => snap(coll, id)) }) }),
    }),
    runTransaction: async (fn) => fn({ get: (r) => r.get(), update: (r, p) => apply(r.coll, r.id, p) }),
  };
}

/** A fake fetch that records Slack calls and answers `reply`. */
function slackSpy(reply = { ok: true }) {
  const calls = [];
  const fn = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body), auth: opts.headers.Authorization }); return { json: async () => reply }; };
  return { fn, calls };
}

const quiet = (fn) => async () => {
  const w = console.warn, e = console.error, l = console.log;
  console.warn = console.error = console.log = () => {};
  try { await fn(); } finally { console.warn = w; console.error = e; console.log = l; }
};

test('notifySlack @mentions James once, with the token and channel', async () => {
  const s = slackSpy();
  await notifySlack('✅ Posted *X*', 'xoxb-test', 'C123', s.fn);
  await notifySlack('<@U0C9U476CMQ> already there', 'xoxb-test', 'C123', s.fn);
  assert.strictEqual(s.calls[0].body.text, '<@U0C9U476CMQ> ✅ Posted *X*');
  assert.strictEqual(s.calls[0].body.channel, 'C123');
  assert.strictEqual(s.calls[0].auth, 'Bearer xoxb-test');
  assert.strictEqual(s.calls[1].body.text, '<@U0C9U476CMQ> already there');
});

test('notifySlack does nothing without a token or channel', async () => {
  const s = slackSpy();
  assert.strictEqual(await notifySlack('x', '', 'C123', s.fn), null);
  assert.strictEqual(await notifySlack('x', 'xoxb-test', '', s.fn), null);
  assert.strictEqual(s.calls.length, 0);
});

test('notifySlack never throws: refused or network error', quiet(async () => {
  assert.deepStrictEqual(await notifySlack('x', 't', 'C1', slackSpy({ ok: false, error: 'not_in_channel' }).fn), { ok: false, error: 'not_in_channel' });
  assert.strictEqual(await notifySlack('x', 't', 'C1', async () => { throw new Error('offline'); }), null);
}));

test('runDue: a failed post goes to the fail channel, says nothing went out, and stays failed', quiet(async () => {
  const store = { scheduledPosts: { p1: { kind: 'post', status: 'approved', title: 'Picks are Live', caption: 'x', fbPhotoIds: ['1'], publishAt: ts('2026-10-28T15:00:00Z') } } };
  const s = slackSpy();
  const realFetch = global.fetch;
  global.fetch = async () => { throw new Error('Meta is down'); };   // Instagram / Facebook calls
  try {
    await runDue({ db: fakeDb(store), Timestamp, FieldValue, slackToken: 't', slackChannel: 'C_POSTED', slackFailChannel: 'C_FAILED', fetch: s.fn });
  } finally { global.fetch = realFetch; }
  assert.strictEqual(store.scheduledPosts.p1.status, 'failed');
  assert.strictEqual(s.calls.length, 1);
  assert.strictEqual(s.calls[0].body.channel, 'C_FAILED');
  assert.match(s.calls[0].body.text, /^<@U0C9U476CMQ> ❌ Failed to post \*Picks are Live\*: Meta is down\nNothing went out\./);
}));

test('runDue: no fail channel → failures fall back to the posted channel', quiet(async () => {
  const store = { scheduledPosts: { p1: { kind: 'post', status: 'approved', title: 'T', caption: 'x', fbPhotoIds: ['1'], publishAt: ts('2026-10-28T15:00:00Z') } } };
  const s = slackSpy();
  const realFetch = global.fetch;
  global.fetch = async () => { throw new Error('down'); };
  try {
    await runDue({ db: fakeDb(store), Timestamp, FieldValue, slackToken: 't', slackChannel: 'C_POSTED', fetch: s.fn });
  } finally { global.fetch = realFetch; }
  assert.strictEqual(s.calls[0].body.channel, 'C_POSTED');
}));
