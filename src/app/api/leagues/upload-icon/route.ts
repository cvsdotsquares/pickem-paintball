import { storage, db } from '@/src/lib/firebaseClient';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('icon') as File;
    const leagueId = formData.get('leagueId') as string;

    if (!file || !leagueId) {
      return NextResponse.json({ error: 'Missing file or leagueId' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 2MB' }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Firebase Storage
    const timestamp = Date.now();
    const fileName = `league-icons/${leagueId}_${timestamp}.${file.type.split('/')[1]}`;
    const storageRef = ref(storage, fileName);
    
    await uploadBytes(storageRef, buffer, {
      contentType: file.type
    });

    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);

    // Update league document with icon URL
    const leagueRef = doc(db, 'leagues', leagueId);
    await updateDoc(leagueRef, {
      icon: downloadURL
    });

    return NextResponse.json({ 
      success: true, 
      iconUrl: downloadURL 
    });
  } catch (error) {
    console.error('Error uploading icon:', error);
    return NextResponse.json({ error: 'Failed to upload icon' }, { status: 500 });
  }
}
