// Migration Script: Convert league settings from isPublic/isSearchable/requiresApproval
// to the new visibility ('public'|'hidden') / access ('open'|'private') schema.
//
// Mapping:
//   visibility = isSearchable ? 'public' : 'hidden'
//   access     = requiresApproval ? 'private' : 'open'
//   (isPublic is dropped — it was cosmetic and never gated anything)
//
// Run (dry run, no writes):   node scripts/migrate-league-access-schema.mjs
// Run (apply changes):        node scripts/migrate-league-access-schema.mjs --apply

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch, deleteField } from 'firebase/firestore';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const APPLY = process.argv.includes('--apply');

async function migrate() {
  console.log(APPLY ? '🚀 Applying migration...' : '🔍 Dry run (pass --apply to write changes)');

  const snapshot = await getDocs(collection(db, 'leagues'));
  console.log(`Found ${snapshot.size} leagues`);

  let batch = writeBatch(db);
  let pending = 0;
  let migrated = 0;
  let alreadyMigrated = 0;

  for (const leagueDoc of snapshot.docs) {
    const data = leagueDoc.data();
    const settings = data.settings || {};

    if (settings.visibility !== undefined || settings.access !== undefined) {
      alreadyMigrated++;
      continue;
    }

    const visibility = settings.isSearchable === false ? 'hidden' : 'public';
    const access = settings.requiresApproval === true ? 'private' : 'open';

    console.log(
      `  ${leagueDoc.id} (${data.name}): isPublic=${settings.isPublic} isSearchable=${settings.isSearchable} requiresApproval=${settings.requiresApproval}` +
      ` -> visibility=${visibility} access=${access}`
    );

    if (APPLY) {
      batch.update(doc(db, 'leagues', leagueDoc.id), {
        'settings.visibility': visibility,
        'settings.access': access,
        'settings.isPublic': deleteField(),
        'settings.isSearchable': deleteField(),
        'settings.requiresApproval': deleteField()
      });
      pending++;

      // Firestore batches cap at 500 writes
      if (pending >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        pending = 0;
      }
    }

    migrated++;
  }

  if (APPLY && pending > 0) {
    await batch.commit();
  }

  console.log(`\nDone. ${migrated} leagues ${APPLY ? 'migrated' : 'would be migrated'}, ${alreadyMigrated} already on new schema.`);
}

migrate().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
