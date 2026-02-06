import { db } from './firebaseClient';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  arrayUnion,
  arrayRemove,
  serverTimestamp 
} from 'firebase/firestore';
import { League } from './league-types';

// Generate random invite code
export const generateInviteCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Create new league
export const createLeague = async (
  name: string,
  description: string,
  settings: League['settings'],
  createdBy: string
): Promise<{leagueId: string, inviteCode: string}> => {
  const response = await fetch('/api/leagues/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      description,
      settings,
      userId: createdBy
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create league');
  }

  const data = await response.json();
  return {
    leagueId: data.leagueId,
    inviteCode: data.inviteCode
  };
};

// Join league by invite code
export const joinLeagueByCode = async (inviteCode: string, userId: string): Promise<boolean> => {
  const response = await fetch('/api/leagues/join', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inviteCode,
      userId
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to join league');
  }

  return true;
};

// Search public leagues
export const searchPublicLeagues = async (searchTerm: string = ''): Promise<League[]> => {
  const params = new URLSearchParams();
  if (searchTerm) {
    params.append('q', searchTerm);
  }

  const response = await fetch(`/api/leagues/search?${params}`);
  
  if (!response.ok) {
    throw new Error('Failed to search leagues');
  }

  const data = await response.json();
  return data.leagues;
};

// Get user's leagues
export const getUserLeagues = async (userId: string): Promise<League[]> => {
  const response = await fetch(`/api/leagues/user/${userId}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch user leagues');
  }

  const data = await response.json();
  return data.leagues;
};