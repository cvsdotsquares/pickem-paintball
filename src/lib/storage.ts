export const getFirebaseStorageUrl = (storagePath: string): string => {
  if (!storagePath) return '';

  // If already a full URL (e.g. Google photoURL, imgur), pass through
  if (storagePath.startsWith('http')) {
    const decodedUrl = storagePath.replace(/&amp;/g, '&');
    // Google profile URLs use =s96-c format; don't try to modify them
    if (decodedUrl.includes('googleusercontent.com') || decodedUrl.includes('google.com')) {
      return decodedUrl;
    }
    // Add _200x200 before file extension for other URLs if not already present
    if (!decodedUrl.includes('_200x200')) {
      const withSize = decodedUrl.replace(/(\.\w+)(\?|$)/, '_200x200$1$2');
      return withSize !== decodedUrl ? withSize : decodedUrl;
    }
    return decodedUrl;
  }

  // Convert storage path to Firebase Storage URL (bucket must match the app's default bucket)
  const bucket =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "fantasy-paintball.firebasestorage.app";
  const encodedPath = storagePath.replace(/\//g, "%2F");
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;
};