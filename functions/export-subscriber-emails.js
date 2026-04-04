/**
 * Export email list of all subscribers with subscription type.
 * Run: GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json" node functions/export-subscriber-emails.js
 *
 * Output: CSV to stdout (email, subscriptionTier, username, displayName)
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'fantasy-paintball' });
}
const db = admin.firestore();

function escapeCsv(s) {
  if (s == null) return '';
  const str = String(s);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function main() {
  const usersSnap = await db.collection('users').get();
  const subscribers = [];

  usersSnap.docs.forEach((doc) => {
    const d = doc.data();
    if (d.isSubscribed !== true) return;
    const tier = d.subscriptionTier || 'unknown';
    const email = d.email || '';
    const username = d.username || '';
    const displayName = d.username || [d.firstName, d.lastName].filter(Boolean).join(' ') || d.displayName || d.name || '—';
    subscribers.push({
      email,
      subscriptionTier: tier,
      username,
      displayName,
    });
  });

  subscribers.sort((a, b) => (a.subscriptionTier || '').localeCompare(b.subscriptionTier || '') || (a.email || '').localeCompare(b.email || ''));

  console.log('email,subscriptionTier,username,displayName');
  subscribers.forEach((s) => {
    console.log([escapeCsv(s.email), escapeCsv(s.subscriptionTier), escapeCsv(s.username), escapeCsv(s.displayName)].join(','));
  });

  console.error(`\nExported ${subscribers.length} subscriber(s)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
