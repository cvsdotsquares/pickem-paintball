/**
 * Search for all files in a user's storage folder to find their profile images
 * Run with: node --env-file=.env.local scripts/find-user-images.mjs
 */

import { initializeApp } from 'firebase/app';
import { getStorage, ref, listAll, getDownloadURL, getMetadata } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

console.log('Storage bucket:', firebaseConfig.storageBucket);

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

const LEGACY_BUCKETS = [
  'fantasy-paintball.firebasestorage.app',
  'fantasy-paintball.appspot.com',
];

const testUsers = [
  { username: 'tdowiak', userId: 'GKIdYS4cDwbLz0eJaHsBkAgfFTt2' },
  { username: 'wblain03', userId: 'gn3GMEEALxYTMbu4oeHyZzvCVTK2' },
  { username: 'davidmack', userId: 'GKdf584RA7ZWXWkBHWJo7uo79kl1' },
];

// Different folder structures to check
function getFoldersToCheck(userId) {
  return [
    `user/${userId}`,
    `users/${userId}`,
    `profile/${userId}`,
    `profiles/${userId}`,
    `avatars/${userId}`,
    `profilePictures/${userId}`,
  ];
}

async function listFilesInFolder(storageInstance, folderPath) {
  try {
    const folderRef = ref(storageInstance, folderPath);
    const result = await listAll(folderRef);

    const files = [];
    for (const itemRef of result.items) {
      try {
        const metadata = await getMetadata(itemRef);
        const url = await getDownloadURL(itemRef);
        files.push({
          path: itemRef.fullPath,
          name: itemRef.name,
          size: metadata.size,
          contentType: metadata.contentType,
          created: metadata.timeCreated,
          url: url.substring(0, 100) + '...',
        });
      } catch (e) {
        files.push({
          path: itemRef.fullPath,
          name: itemRef.name,
          error: e.message,
        });
      }
    }

    // Also check subfolders
    for (const prefixRef of result.prefixes) {
      const subFiles = await listFilesInFolder(storageInstance, prefixRef.fullPath);
      files.push(...subFiles);
    }

    return files;
  } catch (e) {
    return [];
  }
}

async function searchUserFiles(username, userId) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔍 Searching for ${username} (${userId})`);
  console.log('='.repeat(70));

  const allBuckets = [
    { name: 'default', storage: storage },
  ];

  // Add legacy buckets
  for (const bucket of LEGACY_BUCKETS) {
    try {
      allBuckets.push({
        name: bucket,
        storage: getStorage(app, `gs://${bucket}`),
      });
    } catch (e) {
      // Skip invalid buckets
    }
  }

  let totalFound = 0;

  for (const { name: bucketName, storage: storageInstance } of allBuckets) {
    console.log(`\n📦 Bucket: ${bucketName}`);

    const folders = getFoldersToCheck(userId);

    for (const folder of folders) {
      const files = await listFilesInFolder(storageInstance, folder);

      if (files.length > 0) {
        console.log(`\n   📁 ${folder}/`);
        for (const file of files) {
          totalFound++;
          if (file.error) {
            console.log(`      ❌ ${file.name}: ${file.error}`);
          } else {
            console.log(`      ✅ ${file.name}`);
            console.log(`         Size: ${file.size} bytes`);
            console.log(`         Type: ${file.contentType}`);
            console.log(`         Path: ${file.path}`);
          }
        }
      }
    }
  }

  if (totalFound === 0) {
    console.log('\n   ⚠️  No files found in any location');
  } else {
    console.log(`\n   📊 Total files found: ${totalFound}`);
  }
}

// Also search root-level common locations
async function searchCommonLocations() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔍 Checking common storage structure`);
  console.log('='.repeat(70));

  const commonPaths = ['user', 'users', 'profile', 'profiles', 'avatars'];

  for (const path of commonPaths) {
    try {
      const folderRef = ref(storage, path);
      const result = await listAll(folderRef);
      console.log(`\n📁 /${path}/ - ${result.prefixes.length} subfolders, ${result.items.length} files`);

      // Show first few subfolders
      if (result.prefixes.length > 0) {
        console.log(`   Subfolders: ${result.prefixes.slice(0, 5).map(p => p.name).join(', ')}${result.prefixes.length > 5 ? '...' : ''}`);
      }
    } catch (e) {
      console.log(`\n📁 /${path}/ - ${e.code || e.message}`);
    }
  }
}

async function main() {
  console.log('🔍 Searching for user profile images in Firebase Storage\n');

  // First check storage structure
  await searchCommonLocations();

  // Then search for specific users
  for (const user of testUsers) {
    await searchUserFiles(user.username, user.userId);
  }

  console.log('\n' + '='.repeat(70));
  console.log('Done!');
}

main().catch(console.error);
