/**
 * Check a user who has working profile images to see the correct structure
 */

import { initializeApp } from 'firebase/app';
import { getStorage, ref, listAll, getDownloadURL, getMetadata } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

async function listAllUserFolders() {
  console.log('📁 Listing all user folders with files...\n');

  const userRef = ref(storage, 'user');
  const result = await listAll(userRef);

  let usersWithFiles = 0;
  const sampleUsers = [];

  for (const prefixRef of result.prefixes) {
    const userId = prefixRef.name;
    const userFolder = await listAll(prefixRef);

    if (userFolder.items.length > 0) {
      usersWithFiles++;

      if (sampleUsers.length < 5) {
        const files = [];
        for (const item of userFolder.items) {
          try {
            const metadata = await getMetadata(item);
            files.push({
              name: item.name,
              path: item.fullPath,
              size: metadata.size,
              type: metadata.contentType,
            });
          } catch (e) {
            files.push({ name: item.name, error: e.message });
          }
        }
        sampleUsers.push({ userId, files });
      }
    }
  }

  console.log(`Total user folders: ${result.prefixes.length}`);
  console.log(`Users with files: ${usersWithFiles}`);
  console.log(`Users without files: ${result.prefixes.length - usersWithFiles}\n`);

  console.log('Sample users with files:');
  console.log('='.repeat(60));

  for (const user of sampleUsers) {
    console.log(`\n👤 ${user.userId}`);
    for (const file of user.files) {
      if (file.error) {
        console.log(`   ❌ ${file.name}: ${file.error}`);
      } else {
        console.log(`   ✅ ${file.name} (${file.size} bytes, ${file.type})`);
        console.log(`      Path: ${file.path}`);
      }
    }
  }
}

listAllUserFolders().catch(console.error);
