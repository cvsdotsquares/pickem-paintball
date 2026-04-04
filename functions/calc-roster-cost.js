/**
 * Resolve player names to IDs/costs for an event and sum vs cap (default 1_000_000).
 *   GOOGLE_APPLICATION_CREDENTIALS="..." node functions/calc-roster-cost.js tampa_bay_2026
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'fantasy-paintball' });
}
const db = admin.firestore();

const TOTAL_BUDGET = 1_000_000;

const WANTED = [
  { role: 'captain', names: ['Alexander Berdnikov', 'Alexander Bernikov'] },
  { role: 'pick', names: ['Nathan Schroeder'] },
  { role: 'pick', names: ['Ryan Greenspan'] },
  { role: 'pick', names: ['Marcello Margot', 'Marcello Margott'] },
  { role: 'pick', names: ['Axel Guadin', 'Axel Gaudin'] },
  { role: 'pick', names: ['Chad George'] },
  { role: 'pick', names: ['Cyrus Garringer'] },
  { role: 'pick', names: ['Colt Roberts'] },
  { role: 'pick', names: ['Ryan Hoskinson'] },
  { role: 'pick', names: ['Grayson Gladstone'] },
];

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function bestMatchForWanted(wantedNames, players) {
  let best = null;
  let bestScore = -1;
  for (const w of wantedNames) {
    const wn = norm(w);
    for (const p of players) {
      const pn = norm(p.Player);
      let sc = 0;
      if (pn === wn) sc = 100;
      else if (pn.includes(wn) || wn.includes(pn)) sc = 85;
      else {
        const wl = wn.split(' ').filter(Boolean);
        const pl = pn.split(' ').filter(Boolean);
        if (wl.length && pl.length && wl[wl.length - 1] === pl[pl.length - 1]) {
          sc = wl[0] === pl[0] ? 75 : 60;
        }
      }
      if (sc > bestScore) {
        bestScore = sc;
        best = { player: p, score: sc, matchedAs: w };
      }
    }
  }
  return bestScore >= 55 ? best : null;
}

async function main() {
  const eventId = process.argv[2] || 'tampa_bay_2026';
  const snap = await db.collection(`events/${eventId}/players`).get();
  const players = [];
  snap.forEach((doc) => {
    const d = doc.data();
    players.push({
      id: doc.id,
      Player: d.Player || d.name || '',
      Cost: typeof d.Cost === 'number' ? d.Cost : Number(d.Cost) || 0,
      Team: d.Team || '',
    });
  });

  const usedIds = new Set();
  const results = [];

  for (const w of WANTED) {
    const pool = players.filter((p) => !usedIds.has(p.id));
    const m = bestMatchForWanted(w.names, pool);
    if (!m) {
      results.push({ wanted: w.names[0], role: w.role, error: 'NO_MATCH' });
      continue;
    }
    usedIds.add(m.player.id);
    results.push({
      wanted: w.names[0],
      role: w.role,
      matchedName: m.player.Player,
      id: m.player.id,
      cost: Math.round(m.player.Cost),
      team: m.player.Team,
      matchScore: m.score,
    });
  }

  const total = results.filter((r) => r.cost != null).reduce((s, r) => s + r.cost, 0);
  const over = total - TOTAL_BUDGET;

  console.log(JSON.stringify({ eventId, TOTAL_BUDGET, total, over, underCap: over <= 0, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
