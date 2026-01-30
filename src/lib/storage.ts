export const getFirebaseStorageUrl = (storagePath: string): string => {
  if (!storagePath) return '';
  
  // If already a full URL, return as is
  if (storagePath.startsWith('http')) return storagePath;
  
  // Convert storage path to Firebase Storage URL
  // Replace forward slashes with %2F for Firebase Storage URL format
  const encodedPath = storagePath.replace(/\//g, '%2F');
  return `https://firebasestorage.googleapis.com/v0/b/fantasy-paintball.firebasestorage.app/o/${encodedPath}?alt=media`;
};