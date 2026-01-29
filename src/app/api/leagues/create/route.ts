import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/lib/firebaseClient';
import { collection, addDoc, doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';

export async function POST(request: NextRequest) {
  try {
    const { name, description, settings, userId } = await request.json();

    // Validate input
    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'League name is required' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Generate invite code
    const generateInviteCode = () => {
      return Math.random().toString(36).substring(2, 8).toUpperCase();
    };

    // Create league document
    const leagueData = {
      name: name.trim(),
      description: description?.trim() || '',
      createdBy: userId,
      createdAt: serverTimestamp(),
      settings: {
        isPublic: settings?.isPublic ?? true,
        requiresApproval: settings?.requiresApproval ?? false,
        isSearchable: settings?.isSearchable ?? true,
        seasonSpecific: settings?.seasonSpecific ?? false,
        resetFrequency: settings?.resetFrequency ?? 'never'
      },
      admins: [userId],
      members: [userId],
      memberCount: 1,
      pendingRequests: [],
      inviteCode: generateInviteCode(),
      inviteCodeExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      isActive: true
    };

    const leagueRef = await addDoc(collection(db, 'leagues'), leagueData);

    // Update user document
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      leagues: arrayUnion(leagueRef.id),
      adminLeagues: arrayUnion(leagueRef.id)
    });

    return NextResponse.json({ 
      success: true, 
      leagueId: leagueRef.id,
      inviteCode: leagueData.inviteCode,
      leagueName: leagueData.name
    });

  } catch (error) {
    console.error('Error creating league:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}