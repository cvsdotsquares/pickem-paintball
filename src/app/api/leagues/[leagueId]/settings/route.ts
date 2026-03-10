import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/lib/firebaseClient';
import { doc, updateDoc } from 'firebase/firestore';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  try {
    const { settings } = await request.json();
    const { leagueId } = await params;

    const leagueRef = doc(db, 'leagues', leagueId);
    await updateDoc(leagueRef, { settings });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating league settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}