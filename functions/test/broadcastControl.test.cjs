const test = require('node:test');
const assert = require('node:assert');
const { parseControl } = require('../broadcastControl');

test('accepts each graphic and defaults game/lens/teams', () => {
  for (const show of ['none', 'board', 'bar', 'stats']) {
    assert.deepStrictEqual(parseControl({ show }).state, { show, game: 1, lens: 'event', teams: [] });
  }
});

test('keeps game 2, the season lens and two named teams', () => {
  assert.deepStrictEqual(parseControl({ show: 'stats', game: 2, lens: 'season', teams: [' DAM ', 'Red Legion'] }).state,
    { show: 'stats', game: 2, lens: 'season', teams: ['DAM', 'Red Legion'] });
});

test('refuses anything else', () => {
  assert.ok(parseControl({}).error);
  assert.ok(parseControl({ show: 'everything' }).error);
  assert.ok(parseControl({ show: 'bar', game: 3 }).error);
  assert.ok(parseControl({ show: 'stats', lens: 'career' }).error);
  assert.ok(parseControl({ show: 'bar', teams: ['DAM'] }).error);
});

test('caps long team names', () => {
  assert.strictEqual(parseControl({ show: 'bar', teams: ['x'.repeat(100), 'LEG'] }).state.teams[0].length, 40);
});
