/**
 * Test script to check if profile pictures can be resolved
 * Run with: node --env-file=.env.local scripts/test-profile-resolve.mjs
 */

import { initializeApp } from 'firebase/app';
import { getStorage, ref, getDownloadURL, getMetadata } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

console.log('Firebase config:', {
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
});

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

// Also try legacy bucket
const LEGACY_BUCKETS = [
  'fantasy-paintball.firebasestorage.app',
  'fantasy-paintball.appspot.com',
];

const testPaths = [
  'user/GKIdYS4cDwbLz0eJaHsBkAgfFTt2/profile_200x200',
  'user/gn3GMEEALxYTMbu4oeHyZzvCVTK2/profile_200x200',
  'user/GKdf584RA7ZWXWkBHWJo7uo79kl1/profile_200x200',
];

// Extensions to try
const extensions = ['', '.jpg', '.jpeg', '.png', '.webp'];

// Also try the resize extension naming pattern
function getPathVariants(basePath) {
  const variants = [];
  for (const ext of extensions) {
    variants.push(basePath + ext);
  }
  // Try resize extension pattern: profile_200x200_200x200
  if (basePath.endsWith('/profile_200x200')) {
    const resized = basePath.replace('/profile_200x200', '/profile_200x200_200x200');
    for (const ext of extensions) {
      variants.push(resized + ext);
    }
  }
  return variants;
}

async function tryPath(storageBucket, path) {
  try {
    const storageInstance = storageBucket
      ? getStorage(app, `gs://${storageBucket}`)
      : storage;
    const fileRef = ref(storageInstance, path);
    const url = await getDownloadURL(fileRef);
    return { success: true, url };
  } catch (error) {
    return { success: false, error: error.code || error.message };
  }
}

async function testProfilePath(basePath) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${basePath}`);
  console.log('='.repeat(60));

  const variants = getPathVariants(basePath);
  const buckets = [null, ...LEGACY_BUCKETS]; // null = default bucket

  for (const bucket of buckets) {
    const bucketName = bucket || 'default';
    console.log(`\n📦 Bucket: ${bucketName}`);

    for (const variant of variants) {
      const result = await tryPath(bucket, variant);
      if (result.success) {
        console.log(`   ✅ ${variant}`);
        console.log(`      URL: ${result.url.substring(0, 80)}...`);
        return; // Found it!
      } else {
        console.log(`   ❌ ${variant} (${result.error})`);
      }
    }
  }

  console.log(`\n⚠️  Could not find file in any bucket/variant`);
}

async function main() {
  console.log('🔍 Testing profile picture resolution\n');

  for (const path of testPaths) {
    await testProfilePath(path);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Done!');
}

main().catch(console.error);
