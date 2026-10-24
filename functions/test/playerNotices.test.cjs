const test = require('node:test');
const assert = require('node:assert');
const { playerChangeNotices } = require('../playerNotices.js');

const base = { playerName: 'Amin Rodriguez', eventName: 'World Cup' };
const types = (n) => n.map((x) => x.type);

test('status change notifies as before', () => {
  const n = playerChangeNotices({ ...base, beforeExists: true, before: { Status: 'Unconfirmed', team_id: 'TPP' }, after: { Status: 'Out', team_id: 'TPP' } });
  assert.deepStrictEqual(types(n), ['player_status_changed']);
  assert.strictEqual(n[0].message, 'Amin Rodriguez is now Out for World Cup');
});

test('team change notifies', () => {
  const n = playerChangeNotices({ ...base, beforeExists: true, before: { Status: 'Confirmed', team_id: 'TPP', Team: 'TPP Crew' }, after: { Status: 'Confirmed', team_id: 'SDA', Team: 'Aftermath' } });
  assert.deepStrictEqual(types(n), ['player_team_changed']);
  assert.strictEqual(n[0].message, 'Amin Rodriguez has moved to Aftermath for World Cup');
  assert.strictEqual(n[0].oldTeam, 'TPP Crew');
});

test('team and status change together give both', () => {
  const n = playerChangeNotices({ ...base, beforeExists: true, before: { Status: 'Confirmed', team_id: 'TPP' }, after: { Status: 'Addition', team_id: 'SDA', Team: 'Aftermath' } });
  assert.deepStrictEqual(types(n), ['player_status_changed', 'player_team_changed']);
});

test('the first sync of a roster notifies nobody about teams', () => {
  const n = playerChangeNotices({ ...base, beforeExists: false, before: {}, after: { Status: 'Unconfirmed', team_id: 'TPP' } });
  assert.deepStrictEqual(types(n), ['player_status_changed']);   // unchanged behaviour: new doc with a Status
});

test('a team filled in for the first time, a display-name rename, or nothing changed: no team notice', () => {
  assert.deepStrictEqual(types(playerChangeNotices({ ...base, beforeExists: true, before: { Status: 'Out' }, after: { Status: 'Out', team_id: 'TPP' } })), []);
  assert.deepStrictEqual(types(playerChangeNotices({ ...base, beforeExists: true, before: { Status: 'Out', team_id: 'TPP', Team: 'tppcrew' }, after: { Status: 'Out', team_id: 'TPP', Team: 'TPP Crew' } })), []);
  assert.deepStrictEqual(types(playerChangeNotices({ ...base, beforeExists: true, before: { Status: 'Out', team_id: 'TPP' }, after: { Status: 'Out', team_id: 'TPP' } })), []);
});
