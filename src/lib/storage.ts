export const getFirebaseStorageUrl = (storagePath: string): string => {
  if (!storagePath) return '';
  
  // If already a full URL, decode HTML entities and add _200x200 before extension
  if (storagePath.startsWith('http')) {
    const decodedUrl = storagePath.replace(/&amp;/g, '&');
    // Add _200x200 before file extension if not already present
    if (!decodedUrl.includes('_200x200')) {
      return decodedUrl.replace(/(\.\w+)(\?|$)/, '_200x200$1$2');
    }
    return decodedUrl;
  }
  
  // Convert storage path to Firebase Storage URL
  const encodedPath = storagePath.replace(/\//g, '%2F');
  return `https://firebasestorage.googleapis.com/v0/b/fantasy-paintball.firebasestorage.app/o/${encodedPath}?alt=media`;
};