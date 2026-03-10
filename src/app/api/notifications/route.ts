import { db } from '@/src/lib/firebaseClient';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, type, leagueId, leagueName, fromUser, fromUserName, message } = body;

    if (!userId || !type || !leagueId || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const notification = {
      userId,
      type,
      leagueId,
      leagueName,
      fromUser: fromUser || null,
      fromUserName: fromUserName || null,
      message,
      read: false,
      createdAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, 'notifications'), notification);

    return NextResponse.json({ id: docRef.id, ...notification });
  } catch (error) {
    console.error('Error creating notification:', error);
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 });
  }
}
