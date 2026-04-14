/**
 * Script to check if a user's profile picture is the default avatar or a real image.
 *
 * Usage: npx ts-node scripts/check-profile-image.ts <userId>
 * Example: npx ts-node scripts/check-profile-image.ts GKIdYS4cDwbLz0eJaHsBkAgfFTt2
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import * as https from 'https';
import * as http from 'http';

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  // Try to use service account from environment or default credentials
  try {
    initializeApp({
      credential: cert(require('../serviceAccountKey.json')),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'fantasy-paintball.firebasestorage.app',
    });
  } catch {
    initializeApp({
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'fantasy-paintball.firebasestorage.app',
    });
  }
}

const storage = getStorage();
const db = getFirestore();

// Known default avatar - we'll compare file sizes
const DEFAULT_AVATAR_URL = 'https://cdn-icons-png.freepik.com/256/14024/14024658.png';

async function getUrlFileSize(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      const contentLength = res.headers['content-length'];
      if (contentLength) {
        resolve(parseInt(contentLength, 10));
      } else {
        // Download and count bytes
        let size = 0;
        res.on('data', (chunk) => { size += chunk.length; });
        res.on('end', () => resolve(size));
        res.on('error', reject);
      }
    }).on('error', reject);
  });
}

async function checkUserProfileImage(userId: string) {
  console.log(`\n🔍 Checking profile image for user: ${userId}\n`);

  // 1. Get user document from Firestore
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    console.log('❌ User document not found in Firestore');
    return;
  }

  const userData = userDoc.data();
  const profilePicturePath = userData?.profilePicture;
  const username = userData?.username || userData?.displayName || 'Unknown';

  console.log(`👤 Username: ${username}`);
  console.log(`📁 Profile picture path in Firestore: ${profilePicturePath || '(empty)'}`);

  if (!profilePicturePath) {
    console.log('ℹ️  No profile picture path set - will show initials fallback');
    return;
  }

  // 2. Check if file exists in storage
  const bucket = storage.bucket();
  const file = bucket.file(profilePicturePath);

  try {
    const [exists] = await file.exists();
    if (!exists) {
      console.log('❌ File does NOT exist in storage at this path');
      console.log('ℹ️  User should see initials fallback');
      return;
    }

    console.log('✅ File EXISTS in storage');

    // 3. Get file metadata
    const [metadata] = await file.getMetadata();
    console.log(`📊 File size: ${metadata.size} bytes`);
    console.log(`📅 Created: ${metadata.timeCreated}`);
    console.log(`📝 Content type: ${metadata.contentType}`);

    // 4. Get the default avatar size for comparison
    console.log('\n📏 Comparing with default avatar...');
    const defaultSize = await getUrlFileSize(DEFAULT_AVATAR_URL);
    console.log(`   Default avatar size: ${defaultSize} bytes`);
    console.log(`   User's image size: ${metadata.size} bytes`);

    if (Math.abs(Number(metadata.size) - defaultSize) < 100) {
      console.log('\n⚠️  WARNING: File size is very similar to default avatar!');
      console.log('   This is likely the default avatar saved to storage.');
    } else {
      console.log('\n✅ File size differs from default - likely a real profile picture');
    }

    // 5. Generate a signed URL to view the image
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    });
    console.log(`\n🔗 View the image (expires in 15 min):\n   ${signedUrl}`);

  } catch (error) {
    console.log('❌ Error accessing storage:', error);
  }
}

async function findUsersWithDefaultAvatar() {
  console.log('\n🔍 Searching for users who might have default avatar saved...\n');

  const usersSnapshot = await db.collection('users').get();
  const suspiciousUsers: { id: string; username: string; path: string }[] = [];

  for (const doc of usersSnapshot.docs) {
    const data = doc.data();
    const profilePicturePath = data?.profilePicture;

    if (!profilePicturePath) continue;

    // Check if path looks like a default storage path (user/{id}/profile_200x200)
    // but we can't easily check file size for all users without downloading
    if (profilePicturePath.includes('/profile_200x200') || profilePicturePath.includes('/profile.')) {
      suspiciousUsers.push({
        id: doc.id,
        username: data?.username || data?.displayName || 'Unknown',
        path: profilePicturePath,
      });
    }
  }

  console.log(`Found ${suspiciousUsers.length} users with profile paths to check:`);
  suspiciousUsers.slice(0, 20).forEach((u) => {
    console.log(`  - ${u.username} (${u.id}): ${u.path}`);
  });

  if (suspiciousUsers.length > 20) {
    console.log(`  ... and ${suspiciousUsers.length - 20} more`);
  }
}

// Main
const userId = process.argv[2];

if (userId === '--find-all') {
  findUsersWithDefaultAvatar().catch(console.error);
} else if (userId) {
  checkUserProfileImage(userId).catch(console.error);
} else {
  console.log('Usage:');
  console.log('  npx ts-node scripts/check-profile-image.ts <userId>');
  console.log('  npx ts-node scripts/check-profile-image.ts --find-all');
}
