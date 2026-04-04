/**
 * Extract pickems (and optional player names) for a user by username or UID.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS="..." node functions/extract-user-picks.js Tester12345
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'fantasy-paintball' });
}
const db = admin.firestore();

async function resolveUserDocId(arg) {
  if (!arg) return null;
  const byId = await db.doc(`users/${arg}`).get();
  if (byId.exists) return arg;
  let q = await db.collection('users').where('username', '==', arg).limit(1).get();
  if (q.empty) {
    q = await db.collection('users').where('username', '==', arg.toLowerCase()).limit(1).get();
  }
  if (!q.empty) return q.docs[0].id;
  return null;
}

function eventIdFromPickKey(key) {
  if (key.endsWith('_draft_captain')) return key.slice(0, -'_draft_captain'.length);
  if (key.endsWith('_draft')) return key.slice(0, -'_draft'.length);
  if (key.endsWith('_captain')) return key.slice(0, -'_captain'.length);
  return key;
}

async function playerName(eventId, playerId) {
  if (!playerId || !eventId) return null;
  const snap = await db.doc(`events/${eventId}/players/${String(playerId)}`).get();
  if (!snap.exists) return `(unknown id ${playerId})`;
  const d = snap.data();
  return d.Player || d.name || d.Name || String(playerId);
}

async function enrichPickems(pickems) {
  const out = {};
  const keys = Object.keys(pickems || {}).sort();
  for (const key of keys) {
    const val = pickems[key];
    const eventId = eventIdFromPickKey(key);
    if (key.endsWith('_captain') || key.endsWith('_draft_captain')) {
      const name = await playerName(eventId, val);
      out[key] = { raw: val, playerName: name };
      continue;
    }
    if (key.endsWith('_draft')) {
      const ids = Array.isArray(val) ? val : [];
      const names = await Promise.all(ids.map((id) => playerName(eventId, id)));
      out[key] = { playerIds: ids, playerNames: names };
      continue;
    }
    if (Array.isArray(val)) {
      const names = await Promise.all(val.map((id) => playerName(eventId, id)));
      out[key] = { playerIds: val, playerNames: names };
    } else {
      out[key] = val;
    }
  }
  return out;
}

async function main() {
  const username = process.argv[2] || 'Tester12345';
  const uid = await resolveUserDocId(username);
  if (!uid) {
    console.error(`No user found for "${username}"`);
    process.exit(1);
  }
  if (uid !== username) {
    console.log(`Resolved "${username}" -> UID ${uid}\n`);
  }

  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) {
    console.error('User doc missing');
    process.exit(1);
  }

  const data = snap.data();
  const pickems = data.pickems || {};
  const display =
    data.username || data.displayName || data.name || '(no display name)';

  console.log('User:', display);
  console.log('UID:', uid);
  console.log('\n--- pickems (raw Firestore) ---\n');
  console.log(JSON.stringify(pickems, null, 2));

  console.log('\n--- pickems (with player names where possible) ---\n');
  const enriched = await enrichPickems(pickems);
  console.log(JSON.stringify(enriched, null, 2));

  if (data.pickemData && Object.keys(data.pickemData).length) {
    console.log('\n--- pickemData (if present) ---\n');
    console.log(JSON.stringify(data.pickemData, null, 2));
  }

  console.log('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
