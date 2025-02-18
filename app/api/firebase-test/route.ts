import { NextResponse } from 'next/server';
import { db } from '../../../utils/firebase';
import { collection, getDocs } from 'firebase/firestore';

export async function GET() {
  try {
    const querySnapshot = await getDocs(collection(db, 'test-collection'));
    const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Firebase error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}