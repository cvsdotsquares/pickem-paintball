import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY as string,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN as string,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID as string,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID as string,
  ...(process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
    ? { measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID }
    : {}),
};

if (process.env.NODE_ENV === "development") {
  const hasCore =
    Boolean(firebaseConfig.apiKey?.trim()) &&
    Boolean(firebaseConfig.projectId?.trim()) &&
    Boolean(firebaseConfig.authDomain?.trim());
  if (!hasCore) {
    console.warn(
      "[Firebase] Missing NEXT_PUBLIC_FIREBASE_* in .env.local. Copy the same values from your live site (e.g. Vercel → Project → Settings → Environment Variables), then restart `npm run dev`.",
    );
  }
}

const app: FirebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

const db: Firestore = getFirestore(app);
const auth: Auth = getAuth(app);
const storage = getStorage(app);
const googleProvider: GoogleAuthProvider = new GoogleAuthProvider();

export { app, db, auth, storage, googleProvider };
