import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/lib/firebaseClient';
import { collection, query, where, getDocs } from 'firebase/firestore';

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;

    const leaguesRef = collection(db, 'leagues');
    const q = query(leaguesRef, where('members', 'array-contains', userId));
    const querySnapshot = await getDocs(q);

    const leagues = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ leagues });
  } catch (error) {
    console.error('Error fetching user leagues:', error);
    return NextResponse.json({ error: 'Failed to fetch leagues' }, { status: 500 });
  }
}