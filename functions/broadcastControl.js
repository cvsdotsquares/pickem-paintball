// ─── Broadcast control: which Pick'Em graphic is on the NXL stream ─────────
// James, 25 Oct 2026. Darren (GoSports) adds ONE browser source to his stream,
// public/broadcast/live/index.html, and the graphic on it is switched from a
// control page (public/broadcast/control/). Both are static files in the
// pickem-paintball-imgs bucket; this function is the only thing that writes the
// switch: public/broadcast/control.json, which the live page re-reads every
// second. If this function is ever down mid event the live page simply keeps
// showing what it showed (it never blanks on a failed read), and every graphic
// still has its own direct link as a fallback.
//
// POST {key, show, game, lens, teams}  →  writes control.json, returns it
//   key    the operator password (secret BROADCAST_CONTROL_KEY)
//   show   'none' | 'board' | 'bar' | 'stats'
//   game   1 | 2           (NXL plays Pro games in pairs)
//   lens   'event' | 'season'   (Team Stats)
//   teams  [] or ['A', 'B']  (team names or codes; [] = follow the live match)
// GET → the current control.json (handy for checks).
const functions = require('firebase-functions');
const admin = require('firebase-admin');

const BUCKET = 'pickem-paintball-imgs';
const PATH = 'public/broadcast/control.json';
const SHOWS = ['none', 'board', 'bar', 'stats'];

// Pure: the request body → the state to write, or {error}. Exported for the tests.
function parseControl(body) {
  const b = body || {};
  const show = String(b.show || '');
  if (!SHOWS.includes(show)) return { error: `show must be one of ${SHOWS.join(', ')}` };
  const game = Number(b.game || 1);
  if (![1, 2].includes(game)) return { error: 'game must be 1 or 2' };
  const lens = String(b.lens || 'event');
  if (!['event', 'season'].includes(lens)) return { error: 'lens must be event or season' };
  const teams = Array.isArray(b.teams) ? b.teams.map((t) => String(t).trim().slice(0, 40)).filter(Boolean) : [];
  if (teams.length !== 0 && teams.length !== 2) return { error: 'teams must be empty or two names' };
  return { state: { show, game, lens, teams } };
}

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');      // the key, not the origin, is the lock
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

const broadcastControl = functions
  .runWith({ secrets: ['BROADCAST_CONTROL_KEY'], timeoutSeconds: 30, memory: '256MB', minInstances: 0 })
  .https.onRequest(async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    const file = admin.storage().bucket(BUCKET).file(PATH);
    if (req.method === 'GET') {
      try {
        const [buf] = await file.download();
        return res.status(200).type('application/json').send(buf.toString('utf8'));
      } catch (e) {
        return res.status(200).json({ show: 'none', game: 1, lens: 'event', teams: [] });
      }
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
    const expected = process.env.BROADCAST_CONTROL_KEY || '';
    if (!expected || String((body || {}).key || '') !== expected) return res.status(403).json({ error: 'wrong password' });
    const { state, error } = parseControl(body);
    if (error) return res.status(400).json({ error });
    state.updated = new Date().toISOString();
    await file.save(JSON.stringify(state), {
      contentType: 'application/json',
      metadata: { cacheControl: 'no-cache, max-age=0' },
      resumable: false,
    });
    functions.logger.info('broadcast control', state);
    return res.status(200).json(state);
  });

module.exports = { broadcastControl, parseControl };
