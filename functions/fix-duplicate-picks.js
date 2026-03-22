/**
 * Fix doitfortheneem's duplicate picks: dedupe tampa_bay_2026 to 8 unique players.
 * Run: GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json" node functions/fix-duplicate-picks.js
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'fantasy-paintball' });
}
const db = admin.firestore();

const UID = 'oFIF4Eqd3kPb53IhvvSWqGwTP0z1';
const EVENT_ID = 'tampa_bay_2026';

async function main() {
  const userRef = db.doc(`users/${UID}`);
  const snap = await userRef.get();
  if (!snap.exists) {
    console.error('User not found');
    process.exit(1);
  }

  const data = snap.data();
  const pickems = data.pickems || {};
  const ids = Array.isArray(pickems[EVENT_ID]) ? pickems[EVENT_ID] : [];

  // Dedupe: first occurrence wins
  const seen = new Set();
  const deduped = ids.filter((id) => {
    const key = String(id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (deduped.length === ids.length) {
    console.log('No duplicates found. Nothing to fix.');
    process.exit(0);
  }

  console.log(`Before: ${ids.length} picks, ${ids.filter((id, i) => ids.indexOf(id) !== i).length} duplicates`);
  console.log(`After:  ${deduped.length} unique picks`);
  console.log(`\nDeduped IDs: ${deduped.join(', ')}\n`);

  await userRef.update({
    [`pickems.${EVENT_ID}`]: deduped,
    [`pickems.${EVENT_ID}_draft`]: deduped,
  });

  console.log('✅ Fixed. Official picks and draft updated to deduped list.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
