const test = require('node:test');
const assert = require('node:assert');
const { cleanCollaborators, postInstagram } = require('../postScheduler.js');

test('cleanCollaborators: strips @, lower case, no repeats, max 3, ignores blanks', () => {
  assert.deepStrictEqual(cleanCollaborators(['@SDDynasty', 'sddynasty', ' @nxlpaintball ', '', '@a', '@b']), ['sddynasty', 'nxlpaintball', 'a']);
  assert.deepStrictEqual(cleanCollaborators(undefined), []);
  assert.deepStrictEqual(cleanCollaborators('nope'), []);
});

/**
 * Fake Graph API. `refuse` = usernames Instagram won't accept as collaborators (container creation errors when any
 * is in the list). Records every /media POST's params.
 */
function fakeGraph(refuse = []) {
  const media = [];
  let n = 0;
  global.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const path = u.pathname.replace('/v26.0/', '');
    const p = opts.body ? Object.fromEntries(opts.body) : Object.fromEntries(u.searchParams);
    const json = (x) => ({ json: async () => x });
    if (path.endsWith('/media') && opts.method === 'POST') {
      media.push(p);
      const names = p.collaborators ? JSON.parse(p.collaborators) : [];
      if (names.some((x) => refuse.includes(x))) return json({ error: { message: 'Invalid collaborator' } });
      return json({ id: `c${++n}` });
    }
    if (path.endsWith('/media_publish')) return json({ id: 'm1' });
    if (p.fields === 'images') return json({ images: [{ source: `https://img/${path}.jpg` }] });
    if (p.fields === 'status_code') return json({ status_code: 'FINISHED' });
    if (p.fields === 'permalink') return json({ permalink: 'https://instagram.com/p/x' });
    throw new Error(`unexpected ${path}`);
  };
  return media;
}

const cfg = { igUserId: 'ig', token: 't' };

test('no collaborators: one container, no collaborators param (unchanged behaviour)', async () => {
  const media = fakeGraph();
  const r = await postInstagram({ fbPhotoIds: ['p1'], caption: 'hi' }, cfg);
  assert.strictEqual(media.length, 1);
  assert.strictEqual(media[0].collaborators, undefined);
  assert.deepStrictEqual(r, { id: 'm1', permalink: 'https://instagram.com/p/x' });
});

test('single image with collaborators: sent as a JSON list without @', async () => {
  const media = fakeGraph();
  const r = await postInstagram({ fbPhotoIds: ['p1'], caption: 'hi', collaborators: ['@SDDynasty', '@nxlpaintball'] }, cfg);
  assert.strictEqual(media.length, 1);
  assert.strictEqual(media[0].collaborators, '["sddynasty","nxlpaintball"]');
  assert.deepStrictEqual(r.collaborators, ['sddynasty', 'nxlpaintball']);
  assert.strictEqual(r.collaboratorsDropped, undefined);
});

test('carousel: collaborators go on the parent only, not the slides', async () => {
  const media = fakeGraph();
  await postInstagram({ fbPhotoIds: ['p1', 'p2'], caption: 'hi', collaborators: ['nxlpaintball'] }, cfg);
  const children = media.filter((m) => m.is_carousel_item);
  const parent = media.find((m) => m.media_type === 'CAROUSEL');
  assert.strictEqual(children.length, 2);
  assert.ok(children.every((c) => c.collaborators === undefined));
  assert.strictEqual(parent.collaborators, '["nxlpaintball"]');
});

test('one refused account is dropped and the post still goes out with the rest', async () => {
  const media = fakeGraph(['privateplayer']);
  const r = await postInstagram({ fbPhotoIds: ['p1'], caption: 'hi', collaborators: ['privateplayer', 'sddynasty', 'nxlpaintball'] }, cfg);
  assert.deepStrictEqual(r.collaborators, ['sddynasty', 'nxlpaintball']);
  assert.deepStrictEqual(r.collaboratorsDropped, ['privateplayer']);
  assert.strictEqual(media.at(-1).collaborators, '["sddynasty","nxlpaintball"]');
  assert.strictEqual(r.id, 'm1');
});

test('all refused: posts with no collaborators', async () => {
  const media = fakeGraph(['a', 'b']);
  const r = await postInstagram({ fbPhotoIds: ['p1'], caption: 'hi', collaborators: ['a', 'b'] }, cfg);
  assert.strictEqual(media.at(-1).collaborators, undefined);
  assert.deepStrictEqual(r.collaboratorsDropped, ['a', 'b']);
  assert.strictEqual(r.id, 'm1');
});

test('dry run: builds the container but never publishes', async () => {
  fakeGraph();
  const r = await postInstagram({ fbPhotoIds: ['p1'], caption: 'hi', collaborators: ['nxlpaintball'] }, { ...cfg, dryRun: true });
  assert.deepStrictEqual(r, { container: 'c1', collaborators: ['nxlpaintball'], collaboratorsDropped: [] });
});
