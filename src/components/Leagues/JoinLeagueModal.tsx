"use client";

import { useState } from 'react';
import { useAuth } from '@/src/contexts/authProvider';
import { useLeague } from '@/src/contexts/LeagueContext';
import { joinLeagueByCode, searchPublicLeagues } from '@/src/lib/league-utils';
import { League } from '@/src/lib/league-types';
import { FaTimes, FaSearch, FaUsers, FaLock, FaGlobe } from 'react-icons/fa';
import { useToast } from '@/src/hooks/useToast';
import Toast from '../ui/Toast';

interface JoinLeagueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function JoinLeagueModal({ isOpen, onClose }: JoinLeagueModalProps) {
  const { user } = useAuth();
  const { refreshUserLeagues } = useLeague();
  const { toasts, showToast, hideToast } = useToast();
  const [activeTab, setActiveTab] = useState<'search'>('search');
  const [inviteCode, setInviteCode] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<League[]>([]);
  const [loading, setLoading] = useState(false);

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !inviteCode.trim()) return;

    // Check subscription before joining
    try {
      const response = await fetch(`/api/users/${user.uid}/subscription`);
      if (!response.ok) {
        throw new Error(`Subscription check failed: ${response.status}`);
      }
      const subscriptionData = await response.json();
      console.log('Join by code subscription check:', subscriptionData);
      
      if (!subscriptionData.isSubscribed) {
        console.log('Non-subscriber trying to join by code, showing modal');
        onClose();
        // Trigger subscription modal
        window.dispatchEvent(new CustomEvent('show-subscription-modal', { detail: { type: 'hard-gate' } }));
        return;
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
      // Block joining on subscription check failure
      showToast('Unable to verify subscription. Please try again.', 'error');
      return;
    }

    setLoading(true);
    try {
      await joinLeagueByCode(inviteCode.trim().toUpperCase(), user.uid);
      await refreshUserLeagues();
      showToast('Successfully joined league!', 'success');
      setInviteCode('');
      onClose();
    } catch (error: any) {
      // Check if league is full
      if (error.isFull) {
        const subject = encodeURIComponent(`Increase Member Limit - ${error.leagueName}`);
        const body = encodeURIComponent(
          `Hi Admin,\n\nI would like to request an increase in the member limit for the league "${error.leagueName}".\n\nCurrent limit: 20 members\nRequested action: Please increase the member limit\n\nThank you!`
        );
        const mailtoLink = `mailto:${error.adminEmail}?subject=${subject}&body=${body}`;
        
        // Show error with mailto link
        const errorDiv = document.createElement('div');
        errorDiv.innerHTML = `
          <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 9999; background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); max-width: 400px; width: 90%;">
            <h3 style="color: #1f2937; font-size: 18px; font-weight: bold; margin-bottom: 12px;">League Full</h3>
            <p style="color: #4b5563; margin-bottom: 16px;">${error.error}</p>
            <a href="${mailtoLink}" style="display: inline-block; background: #3b82f6; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 500; margin-right: 8px;">Contact Admin</a>
            <button onclick="this.parentElement.remove()" style="background: #6b7280; color: white; padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-weight: 500;">Close</button>
          </div>
        `;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 10000);
      } else {
        showToast(error.message || 'Failed to join league', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    
    setLoading(true);
    try {
      const results = await searchPublicLeagues(searchTerm);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching leagues:', error);
      showToast('Failed to search leagues', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinLeague = async (league: League) => {
    if (!user) return;
    
    // Check subscription before joining
    try {
      const response = await fetch(`/api/users/${user.uid}/subscription`);
      if (!response.ok) {
        throw new Error(`Subscription check failed: ${response.status}`);
      }
      const subscriptionData = await response.json();
      console.log('Join league subscription check:', subscriptionData);
      
      if (!subscriptionData.isSubscribed) {
        console.log('Non-subscriber trying to join league, showing modal');
        onClose();
        // Trigger subscription modal
        window.dispatchEvent(new CustomEvent('show-subscription-modal', { detail: { type: 'hard-gate' } }));
        return;
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
      // Block joining on subscription check failure
      showToast('Unable to verify subscription. Please try again.', 'error');
      return;
    }
    
    setLoading(true);
    try {
      if (league.settings.access === 'private') {
        const response = await fetch(`/api/leagues/${league.id}/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.uid })
        });
        
        if (response.ok) {
          showToast('Join request sent!', 'success');
          onClose();
        } else {
          throw new Error('Failed to send request');
        }
      } else {
        await joinLeagueByCode(league.inviteCode, user.uid);
        await refreshUserLeagues();
        showToast('Successfully joined league!', 'success');
        onClose();
      }
    } catch (error: any) {
      console.error('Error joining league:', error);
      showToast(error.message || 'Failed to join league', 'error');
    } finally {
      setLoading(false);
    }
  };

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
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-300 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Join League</h2>
          <button
            onClick={onClose}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white transition-colors"
          >
            <FaTimes />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-300 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'search'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white'
            }`}
          >
            Public Leagues
          </button>
        </div>

        <div className="p-6">
          {/* Search Leagues Tab */}
          <div className="space-y-4">
            <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search public leagues..."
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-gray-900 dark:text-white rounded-lg transition-colors"
              >
                <FaSearch />
              </button>
            </form>

              {/* Search Results */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {searchResults.map((league) => {
                  const isMember = user && league.members.includes(user.uid);
                  return (
                    <div
                      key={league.id}
                      className="p-3 bg-gray-200 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center mb-1">
                            {league.settings.access === 'open' ? (
                              <FaGlobe className="mr-2 text-green-400 text-sm" />
                            ) : (
                              <FaLock className="mr-2 text-red-400 text-sm" />
                            )}
                            <h3 className="font-medium text-gray-900 dark:text-white">{league.name}</h3>
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{league.description}</p>
                          <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                            <FaUsers className="mr-1" />
                            {league.memberCount} members
                          </div>
                        </div>
                        {isMember ? (
                          <button
                            disabled
                            className="px-3 py-1 bg-gray-600 text-gray-600 dark:text-gray-400 rounded text-sm cursor-not-allowed"
                          >
                            Joined
                          </button>
                        ) : (
                          <button
                            onClick={() => handleJoinLeague(league)}
                            disabled={loading}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-gray-900 dark:text-white rounded text-sm transition-colors"
                          >
                            {league.settings.access === 'private' ? 'Request' : 'Join'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {searchResults.length === 0 && searchTerm && !loading && (
                  <div className="text-center py-4 text-gray-600 dark:text-gray-400">
                    No leagues found matching "{searchTerm}"
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}