"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './authProvider';
import { League } from '@/src/lib/league-types';
import { getUserLeagues } from '@/src/lib/league-utils';

interface LeagueContextType {
  selectedLeague: League | null;
  userLeagues: League[];
  loading: boolean;
  setSelectedLeague: (league: League | null) => void;
  refreshUserLeagues: () => Promise<void>;
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

export const useLeague = () => {
  const context = useContext(LeagueContext);
  if (!context) {
    throw new Error('useLeague must be used within a LeagueProvider');
  }
  return context;
};

interface LeagueProviderProps {
  children: ReactNode;
}

export const LeagueProvider: React.FC<LeagueProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [userLeagues, setUserLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshUserLeagues = async () => {
    if (!user) {
      setUserLeagues([]);
      return;
    }

    setLoading(true);
    try {
      const leagues = await getUserLeagues(user.uid);
      setUserLeagues(leagues);
    } catch (error) {
      console.error('Error fetching user leagues:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUserLeagues();
  }, [user]);

  const value: LeagueContextType = {
    selectedLeague,
    userLeagues,
    loading,
    setSelectedLeague,
    refreshUserLeagues
  };

  return (
    <LeagueContext.Provider value={value}>
      {children}
    </LeagueContext.Provider>
  );
};