"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/src/contexts/authProvider';
import { League } from '@/src/lib/league-types';
import { FaSearch, FaUsers, FaLock, FaGlobe, FaUserPlus, FaTimes } from 'react-icons/fa';
import { getFirebaseStorageUrl } from '@/src/lib/storage';
import { useToast } from '@/src/hooks/useToast';
import Toast from '../ui/Toast';

interface LeagueBrowserProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LeagueBrowser({ isOpen, onClose }: LeagueBrowserProps) {
  const { user } = useAuth();
  const { toasts, showToast, hideToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [requestingLeagueId, setRequestingLeagueId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'my-leagues'>('all');

  const getLeagueIconUrl = (league: League): string | null => {
    if (!league.icon) return null;
    return getFirebaseStorageUrl(league.icon);
  };

  useEffect(() => {
    if (isOpen) {
      fetchLeagues();
    }
  }, [isOpen, filter]);

  const fetchLeagues = async () => {
    setLoading(true);
    try {
      const endpoint = filter === 'my-leagues' 
        ? `/api/leagues/user/${user?.uid}`
        : '/api/leagues/search';
      
      const response = await fetch(endpoint);
      const data = await response.json();
  
      data.leagues?.forEach((league: League) => {
   
      });
      setLeagues(data.leagues || []);
    } catch (error) {
      console.error('Error fetching leagues:', error);
      showToast('Failed to load leagues', 'error');
    } finally {
      setLoading(false);
    }
  };

  const requestToJoin = async (leagueId: string) => {
    setRequestingLeagueId(leagueId);
    try {
      const response = await fetch(`/api/leagues/${leagueId}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.uid })
      });
      
      if (response.ok) {
        const league = leagues.find(l => l.id === leagueId);
        if (league) {
          for (const adminId of league.admins) {
            await fetch('/api/notifications', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: adminId,
                type: 'league_request',
                leagueId,
                leagueName: league.name,
                requestUserId: user?.uid,
                message: `${user?.displayName || 'Someone'} requested to join "${league.name}"`
              })
            });
          }
        }
        
        showToast('Join request sent successfully!', 'success');
        fetchLeagues();
      } else {
        showToast('Failed to send request', 'error');
      }
    } catch (error) {
      console.error('Error requesting to join:', error);
      showToast('Error sending request', 'error');
    } finally {
      setRequestingLeagueId(null);
    }
  };

  const filteredLeagues = leagues.filter(league =>
    league.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <>
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => hideToast(toast.id)}
        />
      ))}
      {/* Remove global loader - only show button loader */}
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Browse Leagues</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <FaTimes className="text-xl" />
            </button>
          </div>
          
          {/* Filter Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
              }`}
            >
              All Leagues
            </button>
            <button
              onClick={() => setFilter('my-leagues')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'my-leagues' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
              }`}
            >
              My Leagues
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search leagues..."
              className="w-full pl-10 pr-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-400">Loading leagues...</div>
          ) : (
            <div className="space-y-3">
              {filteredLeagues.map((league) => (
                <div key={league.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1">
                      {getLeagueIconUrl(league) ? (
                        <img
                          src={getLeagueIconUrl(league) as string}
                          alt={league.name}
                          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-700 flex items-center justify-center text-white font-bold">
                          {league.name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-white font-medium">{league.name}</h3>
                          {league.settings.isPublic ? (
                            <FaGlobe className="text-green-400 text-sm" />
                          ) : (
                            <FaLock className="text-yellow-400 text-sm" />
                          )}
                        </div>
                        <p className="text-gray-400 text-sm mb-2">{league.description}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <FaUsers />
                            {league.memberCount} members
                          </span>
                          <span>{league.settings.isPublic ? 'Public' : 'Private'}</span>
                          {league.settings.requiresApproval && <span>Requires Approval</span>}
                        </div>
                      </div>
                    </div>
                    
                    {filter === 'all' && !league.members.includes(user?.uid || '') && (
                      <button
                        onClick={() => requestToJoin(league.id)}
                        disabled={requestingLeagueId === league.id}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-1"
                      >
                        {requestingLeagueId === league.id ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Requesting...
                          </>
                        ) : (
                          <>
                            <FaUserPlus />
                            Request Join
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              
              {filteredLeagues.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  {filter === 'my-leagues' ? 'You are not in any leagues yet' : 'No leagues found'}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
      </div>
    </>
  );
}