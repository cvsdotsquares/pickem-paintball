/**
 * Quick script to check if a storage file exists and get its metadata
 * Run with: node scripts/check-storage-file.mjs "user/GKIdYS4cDwbLz0eJaHsBkAgfFTt2/profile_200x200"
 */

import { initializeApp } from 'firebase/app';
import { getStorage, ref, getMetadata, getDownloadURL } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'fantasy-paintball.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

const path = process.argv[2] || 'user/GKIdYS4cDwbLz0eJaHsBkAgfFTt2/profile_200x200';

console.log(`\nChecking storage path: ${path}\n`);

const fileRef = ref(storage, path);

try {
  const metadata = await getMetadata(fileRef);
  console.log('✅ File EXISTS');
  console.log(`   Size: ${metadata.size} bytes`);
  console.log(`   Type: ${metadata.contentType}`);
  console.log(`   Created: ${metadata.timeCreated}`);
  console.log(`   Updated: ${metadata.updated}`);

  const url = await getDownloadURL(fileRef);
  console.log(`\n🔗 Download URL:\n   ${url}\n`);

  // Known default avatar sizes (approximate)
  // The freepik default is usually around 5-10KB
  if (metadata.size < 15000) {
    console.log('⚠️  WARNING: Small file size - might be a default/placeholder image');
  }
} catch (error) {
  console.log('❌ File does NOT exist or is not accessible');
  console.log(`   Error: ${error.message}`);
}
