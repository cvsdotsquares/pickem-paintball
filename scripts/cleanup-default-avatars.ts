/**
 * Cleanup script to find and fix users who have the default avatar saved to storage.
 *
 * What this does:
 * 1. Finds all users with a profilePicture path like "user/{id}/profile_200x200"
 * 2. Checks if the file exists and is the default avatar (256x256 or small file)
 * 3. Optionally clears the profilePicture field for those users
 *
 * Usage:
 *   DRY RUN (just report): npx ts-node scripts/cleanup-default-avatars.ts
 *   APPLY FIXES:           npx ts-node scripts/cleanup-default-avatars.ts --fix
 */

import * as admin from 'firebase-admin';
import * as path from 'path';

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'fantasy-paintball.firebasestorage.app',
  });
} catch (e) {
  console.error('❌ Could not load serviceAccountKey.json');
  console.error('   Please download it from Firebase Console > Project Settings > Service Accounts');
  process.exit(1);
}

const db = admin.firestore();
const storage = admin.storage();

const DRY_RUN = !process.argv.includes('--fix');

interface UserToFix {
  id: string;
  username: string;
  profilePicture: string;
  reason: string;
}

async function checkStorageFile(filePath: string): Promise<{ exists: boolean; isDefault: boolean; size?: number }> {
  const bucket = storage.bucket();
  const file = bucket.file(filePath);

  try {
    const [exists] = await file.exists();
    if (!exists) {
      return { exists: false, isDefault: false };
    }

    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size);

    // The default avatar PNG is typically around 5-15KB
    // Real profile photos are usually larger
    const isSmallFile = size < 20000;

    return { exists: true, isDefault: isSmallFile, size };
  } catch {
    return { exists: false, isDefault: false };
  }
}

async function findUsersWithDefaultAvatars(): Promise<UserToFix[]> {
  console.log('🔍 Scanning users for default avatars...\n');

  const usersSnapshot = await db.collection('users').get();
  const usersToFix: UserToFix[] = [];
  let checked = 0;

  for (const doc of usersSnapshot.docs) {
    const data = doc.data();
    const profilePicture = data?.profilePicture;
    const username = data?.username || data?.displayName || data?.name || 'Unknown';

    checked++;
    if (checked % 100 === 0) {
      console.log(`   Checked ${checked}/${usersSnapshot.size} users...`);
    }

    if (!profilePicture) continue;

    // Check for known default URL patterns
    if (
      profilePicture.includes('14024658.png') ||
      profilePicture.includes('freepik.com') ||
      profilePicture.includes('cdn-icons-png') ||
      profilePicture.includes('placehold')
    ) {
      usersToFix.push({
        id: doc.id,
        username,
        profilePicture,
        reason: 'URL contains default avatar pattern',
      });
      continue;
    }

    // Check storage paths
    if (profilePicture.startsWith('user/') || profilePicture.includes('/profile')) {
      const result = await checkStorageFile(profilePicture);

      if (!result.exists) {
        usersToFix.push({
          id: doc.id,
          username,
          profilePicture,
          reason: 'Storage file does not exist',
        });
      } else if (result.isDefault) {
        usersToFix.push({
          id: doc.id,
          username,
          profilePicture,
          reason: `Small file size (${result.size} bytes) - likely default avatar`,
        });
      }
    }
  }

  return usersToFix;
}

async function fixUsers(users: UserToFix[]): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);

  if (DRY_RUN) {
    console.log('🔒 DRY RUN MODE - No changes will be made');
    console.log('   Run with --fix to apply changes\n');
  } else {
    console.log('🔧 APPLYING FIXES...\n');
  }

  for (const user of users) {
    console.log(`   ${user.username} (${user.id})`);
    console.log(`      Path: ${user.profilePicture}`);
    console.log(`      Reason: ${user.reason}`);

    if (!DRY_RUN) {
      try {
        await db.collection('users').doc(user.id).update({
          profilePicture: admin.firestore.FieldValue.delete(),
        });
        console.log(`      ✅ Cleared profilePicture field`);
      } catch (e) {
        console.log(`      ❌ Error: ${e}`);
      }
    }
    console.log('');
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       Default Avatar Cleanup Script                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const usersToFix = await findUsersWithDefaultAvatars();

  console.log(`\n📊 Found ${usersToFix.length} users with default/missing avatars\n`);

  if (usersToFix.length === 0) {
    console.log('✅ No users need fixing!');
    return;
  }

  await fixUsers(usersToFix);

  console.log('═'.repeat(60));
  console.log(`\n📋 Summary: ${usersToFix.length} users ${DRY_RUN ? 'would be' : 'were'} fixed`);

  if (DRY_RUN) {
    console.log('\n💡 Run with --fix to apply these changes');
  }
}

main().catch(console.error);
