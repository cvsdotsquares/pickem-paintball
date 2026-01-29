"use client";

import { useState } from 'react';
import { useAuth } from '@/src/contexts/authProvider';
import { useLeague } from '@/src/contexts/LeagueContext';
import { joinLeagueByCode, searchPublicLeagues } from '@/src/lib/league-utils';
import { League } from '@/src/lib/league-types';
import { FaTimes, FaSearch, FaUsers, FaLock, FaGlobe } from 'react-icons/fa';

interface JoinLeagueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function JoinLeagueModal({ isOpen, onClose }: JoinLeagueModalProps) {
  const { user } = useAuth();
  const { refreshUserLeagues } = useLeague();
  const [activeTab, setActiveTab] = useState<'code' | 'search'>('code');
  const [inviteCode, setInviteCode] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<League[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !inviteCode.trim()) return;

    setLoading(true);
    setError('');
    try {
      await joinLeagueByCode(inviteCode.trim().toUpperCase(), user.uid);
      await refreshUserLeagues();
      setInviteCode('');
      onClose();
    } catch (error: any) {
      setError(error.message || 'Failed to join league');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      const results = await searchPublicLeagues(searchTerm);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching leagues:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinLeague = async (leagueId: string) => {
    if (!user) return;
    
    setLoading(true);
    try {
      // For now, just join by finding the invite code
      // In a full implementation, this would be a separate API call
      console.log('Join league:', leagueId);
      await refreshUserLeagues();
    } catch (error) {
      console.error('Error joining league:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Join League</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <FaTimes />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('code')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'code'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Invite Code
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'search'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Search Leagues
          </button>
        </div>

        <div className="p-6">
          {/* Join by Code Tab */}
          {activeTab === 'code' && (
            <form onSubmit={handleJoinByCode} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Enter Invite Code
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg tracking-wider"
                  placeholder="ABC123"
                  maxLength={6}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Ask your league admin for the 6-character invite code
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-900/50 border border-red-500/50 rounded-lg">
                  <p className="text-red-200 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !inviteCode.trim()}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {loading ? 'Joining...' : 'Join League'}
              </button>
            </form>
          )}

          {/* Search Leagues Tab */}
          {activeTab === 'search' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Search public leagues..."
                />
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  <FaSearch />
                </button>
              </div>

              {/* Search Results */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {searchResults.map((league) => (
                  <div
                    key={league.id}
                    className="p-3 bg-gray-800 rounded-lg border border-gray-700"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center mb-1">
                          {league.settings.isPublic ? (
                            <FaGlobe className="mr-2 text-green-400 text-sm" />
                          ) : (
                            <FaLock className="mr-2 text-red-400 text-sm" />
                          )}
                          <h3 className="font-medium text-white">{league.name}</h3>
                        </div>
                        <p className="text-sm text-gray-300 mb-2">{league.description}</p>
                        <div className="flex items-center text-xs text-gray-400">
                          <FaUsers className="mr-1" />
                          {league.memberCount} members
                        </div>
                      </div>
                      <button
                        onClick={() => handleJoinLeague(league.id)}
                        disabled={loading}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded text-sm transition-colors"
                      >
                        {league.settings.requiresApproval ? 'Request' : 'Join'}
                      </button>
                    </div>
                  </div>
                ))}

                {searchResults.length === 0 && searchTerm && !loading && (
                  <div className="text-center py-4 text-gray-400">
                    No leagues found matching "{searchTerm}"
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}