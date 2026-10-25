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
  const n = playerChangeNotices({ ...base, beforeExists: true, before: { Status: 'Confirmed', team_id: 'TPP', Team: 'TPP Crew' }, after: { Status: 'Confirmed', team_id: 'AFM', Team: 'Aftermath' } });
  assert.deepStrictEqual(types(n), ['player_team_changed']);
  assert.strictEqual(n[0].message, 'Amin Rodriguez has moved to Aftermath for World Cup');
  assert.strictEqual(n[0].oldTeam, 'TPP Crew');
});

test('team and status change together give both', () => {
  const n = playerChangeNotices({ ...base, beforeExists: true, before: { Status: 'Confirmed', team_id: 'TPP' }, after: { Status: 'Out', team_id: 'AFM', Team: 'Aftermath' } });
  assert.deepStrictEqual(types(n), ['player_status_changed', 'player_team_changed']);
});

test('the first sync of a roster notifies nobody about teams', () => {
  const n = playerChangeNotices({ ...base, beforeExists: false, before: {}, after: { Status: 'Unconfirmed', team_id: 'TPP' } });
  assert.deepStrictEqual(types(n), []);   // Unconfirmed never notifies (and nobody has picked a new doc yet)
});

test('a team filled in for the first time, a display-name rename, or nothing changed: no team notice', () => {
  assert.deepStrictEqual(types(playerChangeNotices({ ...base, beforeExists: true, before: { Status: 'Out' }, after: { Status: 'Out', team_id: 'TPP' } })), []);
  assert.deepStrictEqual(types(playerChangeNotices({ ...base, beforeExists: true, before: { Status: 'Out', team_id: 'TPP', Team: 'tppcrew' }, after: { Status: 'Out', team_id: 'TPP', Team: 'TPP Crew' } })), []);
  assert.deepStrictEqual(types(playerChangeNotices({ ...base, beforeExists: true, before: { Status: 'Out', team_id: 'TPP' }, after: { Status: 'Out', team_id: 'TPP' } })), []);
});

test('becoming Confirmed, Unconfirmed or Addition notifies nobody (James, 24 Oct 2026)', () => {
  for (const [from, to] of [['Unconfirmed', 'Confirmed'], ['Out', 'Confirmed'], ['Questionable', 'confirmed '], ['Confirmed', 'Unconfirmed'], ['Unconfirmed', 'Addition']]) {
    assert.deepStrictEqual(types(playerChangeNotices({ ...base, beforeExists: true, before: { Status: from, team_id: 'TPP' }, after: { Status: to, team_id: 'TPP' } })), [], `${from} → ${to}`);
  }
});

test('Questionable, Injured, Out, Dropped still notify', () => {
  for (const to of ['Questionable', 'Injured', 'Out', 'Dropped']) {
    assert.deepStrictEqual(types(playerChangeNotices({ ...base, beforeExists: true, before: { Status: 'Confirmed', team_id: 'TPP' }, after: { Status: to, team_id: 'TPP' } })), ['player_status_changed'], to);
  }
});

test('a team move to Confirmed still gives the team notice', () => {
  const n = playerChangeNotices({ ...base, beforeExists: true, before: { Status: 'Unconfirmed', team_id: 'TPP' }, after: { Status: 'Confirmed', team_id: 'AFM', Team: 'Aftermath' } });
  assert.deepStrictEqual(types(n), ['player_team_changed']);
});

test('a new code under the same team name is a rename, not a move (James, 25 Oct 2026)', () => {
  for (const [from, to, name] of [['SDA', 'AFM', 'Aftermath'], ['AFT', 'SHK', 'Aftershock']]) {
    const n = playerChangeNotices({ ...base, beforeExists: true, before: { Status: 'Confirmed', team_id: from, Team: name }, after: { Status: 'Confirmed', team_id: to, Team: ` ${name.toUpperCase()} ` } });
    assert.deepStrictEqual(types(n), [], `${from} → ${to}`);
  }
});

test('a code change with a different team name still notifies', () => {
  const n = playerChangeNotices({ ...base, beforeExists: true, before: { Status: 'Confirmed', team_id: 'AFT', Team: 'Aftershock' }, after: { Status: 'Confirmed', team_id: 'AFM', Team: 'Aftermath' } });
  assert.deepStrictEqual(types(n), ['player_team_changed']);
});
