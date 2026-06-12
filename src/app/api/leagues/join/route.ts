import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/lib/firebaseClient';
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';

export async function POST(request: NextRequest) {
  try {
    const { inviteCode, userId } = await request.json();

    if (!inviteCode || !userId) {
      return NextResponse.json({ error: 'Invite code and user ID are required' }, { status: 400 });
    }

    // Find league by invite code
    const leaguesQuery = query(
      collection(db, 'leagues'),
      where('inviteCode', '==', inviteCode.toUpperCase()),
      where('isActive', '==', true)
    );
    
    const querySnapshot = await getDocs(leaguesQuery);
    
    if (querySnapshot.empty) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });
    }

    const leagueDoc = querySnapshot.docs[0];
    const leagueData = leagueDoc.data();
    
    // Check if user is already a member
    if (leagueData.members.includes(userId)) {
      return NextResponse.json({ error: 'Already a member of this league' }, { status: 400 });
    }

    // Check member limit (dynamic from DB)
    const maxMembers = leagueData.maxMembers || 20;
    if (leagueData.memberCount >= maxMembers) {
      return NextResponse.json({ 
        error: `League is full (${maxMembers} members max). Contact admin to increase limit.`,
        isFull: true,
        leagueName: leagueData.name,
        maxMembers,
        adminEmail: 'admin@pickempaintball.com'
      }, { status: 400 });
    }

    // Add user to league
    const leagueRef = doc(db, 'leagues', leagueDoc.id);
    await updateDoc(leagueRef, {
      members: arrayUnion(userId),
      memberCount: leagueData.memberCount + 1
    });

    // Update user document
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      leagues: arrayUnion(leagueDoc.id)
    });

    return NextResponse.json({ 
      success: true, 
      leagueId: leagueDoc.id,
      leagueName: leagueData.name
    });

  } catch (error) {
    console.error('Error joining league:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}