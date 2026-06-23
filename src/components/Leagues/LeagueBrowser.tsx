"use client";

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/src/contexts/authProvider';
import { useLeague } from '@/src/contexts/LeagueContext';
import { League } from '@/src/lib/league-types';
import { FaSearch, FaUsers, FaLock, FaGlobe, FaUserPlus, FaTimes } from 'react-icons/fa';
import { getFirebaseStorageUrl } from '@/src/lib/storage';
import { joinLeagueByCode } from '@/src/lib/league-utils';
import { useToast } from '@/src/hooks/useToast';
import Toast from '../ui/Toast';

interface LeagueBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fill search when opening (e.g. leaderboard carousel tile) */
  initialSearch?: string;
}

export default function LeagueBrowser({
  isOpen,
  onClose,
  initialSearch,
}: LeagueBrowserProps) {
  const { user } = useAuth();
  const { refreshUserLeagues } = useLeague();
  const { toasts, showToast, hideToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [requestingLeagueId, setRequestingLeagueId] = useState<string | null>(null);
  const [joiningLeagueId, setJoiningLeagueId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "my-leagues">("all");
  const [codeEntryLeagueId, setCodeEntryLeagueId] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');

  const getLeagueIconUrl = (league: League): string | null => {
    if (!league.icon) return null;
    return getFirebaseStorageUrl(league.icon);
  };

  useEffect(() => {
    if (isOpen) {
      fetchLeagues();
    }
  }, [isOpen, filter]);

  useEffect(() => {
    if (isOpen && initialSearch !== undefined && initialSearch !== "") {
      setSearchTerm(initialSearch);
    }
    if (!isOpen) {
      setSearchTerm("");
    }
  }, [isOpen, initialSearch]);

  const fetchLeagues = async () => {
    setLoading(true);
    try {
      const endpoint = filter === 'my-leagues' 
        ? `/api/leagues/user/${user?.uid}`
        : '/api/leagues/search';
      
      const response = await fetch(endpoint);
      const data = await response.json();
  
      const filteredLeagues = data.leagues || [];
      setLeagues(filteredLeagues);
    } catch (error) {
      console.error('Error fetching leagues:', error);
      showToast('Failed to load leagues', 'error');
    } finally {
      setLoading(false);
    }
  };

  const joinLeague = async (league: League, code: string = league.inviteCode) => {
    // Check subscription before joining
    try {
      const response = await fetch(`/api/users/${user?.uid}/subscription`);
      if (!response.ok) {
        throw new Error(`Subscription check failed: ${response.status}`);
      }
      const subscriptionData = await response.json();

      if (!subscriptionData.isSubscribed) {
        onClose();
        window.dispatchEvent(new CustomEvent('show-subscription-modal', { detail: { type: 'hard-gate' } }));
        return;
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
      showToast('Unable to verify subscription. Please try again.', 'error');
      return;
    }

    if (!user) return;

    setJoiningLeagueId(league.id);
    try {
      await joinLeagueByCode(code, user.uid);
      await refreshUserLeagues();
      showToast('Successfully joined league!', 'success');
      setCodeEntryLeagueId(null);
      setCodeInput('');
      fetchLeagues();
    } catch (error: any) {
      showToast(error.message || 'Failed to join league', 'error');
    } finally {
      setJoiningLeagueId(null);
    }
  };

  const requestToJoin = async (leagueId: string) => {
    // Check subscription before joining
    try {
      const response = await fetch(`/api/users/${user?.uid}/subscription`);
      if (!response.ok) {
        throw new Error(`Subscription check failed: ${response.status}`);
      }
      const subscriptionData = await response.json();
      console.log('League browser subscription check:', subscriptionData);
      
      if (!subscriptionData.isSubscribed) {
        console.log('Non-subscriber trying to join league from browser, showing modal');
        onClose();
        // Trigger subscription modal
        window.dispatchEvent(new CustomEvent('show-subscription-modal', { detail: { type: 'hard-gate' } }));
        return;
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
      showToast('Unable to verify subscription. Please try again.', 'error');
      return;
    }

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
      {/* Portal + top inset: align below measured header on mobile */}
      {createPortal(
        <div
          className="fixed inset-0 z-[100] flex bg-black/50 max-md:items-start max-md:justify-center max-md:overflow-y-auto max-md:p-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] max-md:pt-[var(--pickem-dashboard-header-bottom)] md:items-center md:justify-center md:overflow-visible md:p-4"
          role="presentation"
        >
          <div className="bg-white dark:bg-gray-900 rounded-xl max-w-2xl w-full max-h-[min(80vh,calc(100dvh-var(--pickem-dashboard-header-bottom)-2rem))] overflow-y-auto shadow-xl md:max-h-[80vh]">
        <div className="p-4 border-b border-gray-300 dark:border-gray-700 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Browse Leagues</h2>
            <button
              onClick={onClose}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white transition-colors"
            >
              <FaTimes className="text-xl" />
            </button>
          </div>
          
          {/* Filter Tabs — wrap on narrow screens */}
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors sm:px-4 sm:py-2 ${
                filter === "all" ? "bg-blue-600 text-white" : "bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              All Leagues
            </button>
            <button
              onClick={() => setFilter("my-leagues")}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors sm:px-4 sm:py-2 ${
                filter === 'my-leagues' ? 'bg-blue-600 text-white' : 'bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              My Leagues
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 dark:text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search leagues..."
              className="w-full pl-10 pr-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading leagues...</div>
          ) : (
            <div className="space-y-3">
              {filteredLeagues.map((league) => {
                const uid = user?.uid ?? "";
                const isMember = uid ? league.members.includes(uid) : false;
                const hasPendingRequest =
                  Boolean(uid) &&
                  Array.isArray(league.pendingRequests) &&
                  league.pendingRequests.includes(uid);

                return (
                <div key={league.id} className="rounded-lg border border-gray-300 bg-gray-200 p-3 dark:border-gray-700 dark:bg-gray-800 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {getLeagueIconUrl(league) ? (
                        <img
                          src={getLeagueIconUrl(league) as string}
                          alt={league.name}
                          className="h-12 w-12 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-300 font-bold text-gray-900 dark:bg-gray-700 dark:text-white">
                          {league.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h3 className="font-medium text-gray-900 dark:text-white">{league.name}</h3>
                          {league.settings.access === 'open' ? (
                            <FaGlobe className="shrink-0 text-sm text-green-400" />
                          ) : (
                            <FaLock className="shrink-0 text-sm text-yellow-400" />
                          )}
                        </div>
                        <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">{league.description}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-500">
                          <span className="flex items-center gap-1">
                            <FaUsers className="shrink-0" />
                            {league.memberCount} members
                          </span>
                          <span>{league.settings.access === 'open' ? 'Open Access' : 'Private Access'}</span>
                        </div>
                      </div>
                    </div>

                    {filter === "all" && !isMember && (
                      hasPendingRequest ? (
                        <span
                          className="inline-flex h-9 shrink-0 items-center justify-center self-end rounded-lg border border-emerald-600/40 bg-emerald-100 px-3 text-xs font-medium text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-950/60 dark:text-emerald-200 sm:self-center sm:text-sm"
                          role="status"
                        >
                          Request sent
                        </span>
                      ) : league.settings.access === 'open' ? (
                        <button
                          type="button"
                          onClick={() => joinLeague(league)}
                          disabled={joiningLeagueId === league.id}
                          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-end rounded-lg bg-green-600 px-3 py-0 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 sm:self-center sm:text-sm"
                        >
                          {joiningLeagueId === league.id ? (
                            <>
                              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-b-transparent" />
                              Joining...
                            </>
                          ) : (
                            <>
                              <FaUserPlus className="shrink-0 text-sm" />
                              Join
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="flex shrink-0 gap-2 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => requestToJoin(league.id)}
                            disabled={requestingLeagueId === league.id}
                            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-0 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:text-sm"
                          >
                            {requestingLeagueId === league.id ? (
                              <>
                                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-b-transparent" />
                                Requesting...
                              </>
                            ) : (
                              <>
                                <FaUserPlus className="shrink-0 text-sm" />
                                Request Join
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCodeEntryLeagueId(codeEntryLeagueId === league.id ? null : league.id);
                              setCodeInput('');
                            }}
                            className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-gray-400 px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 sm:text-sm"
                          >
                            Use Code
                          </button>
                        </div>
                      )
                    )}
                  </div>

                  {codeEntryLeagueId === league.id && (
                    <form
                      onSubmit={(e) => { e.preventDefault(); joinLeague(league, codeInput.trim().toUpperCase()); }}
                      className="mt-3 flex gap-2"
                    >
                      <input
                        type="text"
                        value={codeInput}
                        onChange={(e) => setCodeInput(e.target.value)}
                        autoFocus
                        placeholder="Enter access code"
                        maxLength={10}
                        className="pickem-numeric flex-1 rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm tracking-wider text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                      <button
                        type="submit"
                        disabled={joiningLeagueId === league.id || !codeInput.trim()}
                        className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                      >
                        {joiningLeagueId === league.id ? 'Joining...' : 'Join'}
                      </button>
                    </form>
                  )}
                </div>
                );
              })}
              
              {filteredLeagues.length === 0 && (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                  {filter === 'my-leagues' ? 'You are not in any leagues yet' : 'No leagues found'}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-300 p-4 dark:border-gray-700 sm:p-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-gray-300 px-4 py-2 text-gray-900 transition-colors hover:bg-gray-400 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}