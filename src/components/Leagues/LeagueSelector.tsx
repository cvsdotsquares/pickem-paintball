"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/src/contexts/authProvider';
import { useLeague } from '@/src/contexts/LeagueContext';
import { FaChevronDown, FaUsers, FaPlus, FaCog, FaCopy, FaSearch } from 'react-icons/fa';
import { db } from '@/src/lib/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';
import LeagueAdminModal from './LeagueAdminModal';
import LeagueBrowser from './LeagueBrowser';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast } from '@/src/hooks/useToast';
import Toast from '../ui/Toast';
import { getFirebaseStorageUrl } from '@/src/lib/storage';

interface LeagueSelectorProps {
  onCreateLeague: () => void;
  onJoinLeague: () => void;
}

export default function LeagueSelector({ onCreateLeague, onJoinLeague }: LeagueSelectorProps) {
  const { user } = useAuth();
  const { selectedLeague, userLeagues, setSelectedLeague } = useLeague();
  const { toasts, showToast, hideToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [actualMemberCount, setActualMemberCount] = useState<number | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);

  const handleLeagueSelect = (league: any) => {
    setSelectedLeague(league);
    setIsOpen(false);
  };

  const isSelectedLeagueAdmin = selectedLeague && user && selectedLeague.admins?.includes(user.uid);


  // Leave league handler
  const handleLeaveLeague = async () => {
    if (!selectedLeague || !user) return;
    
    setShowLeaveConfirm(false);
    setLeaveLoading(true);
    
    try {
      const response = await fetch(`/api/leagues/${selectedLeague.id}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        showToast(data.error || 'Failed to leave league', 'error');
        setLeaveLoading(false);
        return;
      }
      
      showToast('Successfully left the league', 'success');
      setSelectedLeague(null);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Error leaving league:', error);
      showToast('Failed to leave league', 'error');
      setLeaveLoading(false);
    }
  };

  // Fetch actual member count when league is selected
  useEffect(() => {
    const fetchActualMemberCount = async () => {
      if (!selectedLeague?.members) {
        setActualMemberCount(null);
        return;
      }

      try {
        // Count actual existing users
        let actualCount = 0;
        for (const memberId of selectedLeague.members) {
          const userDoc = await getDoc(doc(db, 'users', memberId));
          if (userDoc.exists()) {
            actualCount++;
          }
        }
        setActualMemberCount(actualCount);
      } catch (error) {
        console.error('Error fetching member count:', error);
        setActualMemberCount(selectedLeague.memberCount || 0);
      }
    };

    fetchActualMemberCount();
  }, [selectedLeague]);

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
    <div className="relative ">
      <div className="flex gap-2 items-center mb-4">
         <div className="relative flex-1">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center gap-2">
              {selectedLeague?.icon ? (
                <img src={getFirebaseStorageUrl(selectedLeague.icon)} alt={selectedLeague.name} className="w-5 h-5 rounded object-cover" />
              ) : selectedLeague ? (
                <div className="w-5 h-5 rounded bg-gray-600 flex items-center justify-center text-xs">
                  {selectedLeague.name.charAt(0)}
                </div>
              ) : (
                <FaUsers className="text-sm" />
              )}
              <span className="text-sm">
                {selectedLeague ? selectedLeague.name : 'All Players'}
              </span>
            </div>
            <FaChevronDown className={`text-sm transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 rounded-lg shadow-lg border border-gray-700 z-50">
              {/* All Players Option */}
              <button
                onClick={() => handleLeagueSelect(null)}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors ${
                  !selectedLeague ? 'bg-gray-700' : ''
                }`}
              >
                All Players
              </button>

              {/* User's Leagues */}
              {userLeagues.map((league) => (
                <button
                  key={league.id}
                  onClick={() => handleLeagueSelect(league)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors ${
                    selectedLeague?.id === league.id ? 'bg-gray-700' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {league.icon ? (
                        <img src={getFirebaseStorageUrl(league.icon)} alt={league.name} className="w-6 h-6 rounded object-cover" />
                      ) : (
                        <div className="w-6 h-6 rounded bg-gray-600 flex items-center justify-center text-xs">
                          {league.name.charAt(0)}
                        </div>
                      )}
                      <span>{league.name}</span>
                    </div>
                    <span className="text-xs text-gray-400">{league.memberCount} members</span>
                  </div>
                </button>
              ))}

              {userLeagues.length === 0 && (
                <div className="px-4 py-2 text-sm text-gray-400">
                  No leagues joined yet
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* League Selector Dropdown */}
      <div className="flex flex-wrap gap-2 items-center mb-4">

        {/* Action Buttons */}
        <button
          onClick={() => setShowBrowser(true)}
          className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm transition-colors flex items-center"
        >
          <FaSearch className="mr-1 text-xs" />
          Browse
        </button>

        <button
          onClick={onCreateLeague}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors flex items-center"
        >
          <FaPlus className="mr-1 text-xs" />
          Create
        </button>

        <button
          onClick={onJoinLeague}
          className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors"
        >
          Join
        </button>

        {/* Admin Button - only show if user is admin of selected league */}
        {isSelectedLeagueAdmin && (
          <button
            onClick={() => setShowAdminModal(true)}
            className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm transition-colors flex items-center"
          >
            <FaCog className="mr-1 text-xs" />
            Admin
          </button>
        )}
      </div>
      {/* Selected League Info */}
      {selectedLeague && (
        <div className="mb-4 p-4 bg-blue-900/30 border border-blue-500/30 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {selectedLeague.icon ? (
                <img src={getFirebaseStorageUrl(selectedLeague.icon)} alt={selectedLeague.name} className="w-12 h-12 rounded-lg object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-blue-600 flex items-center justify-center text-xl font-bold">
                  {selectedLeague.name.charAt(0)}
                </div>
              )}
              <div>
                <h3 className="font-medium text-white">{selectedLeague.name}</h3>
                <p className="text-sm text-gray-300">{selectedLeague.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-sm font-medium text-blue-400">
                  {actualMemberCount !== null ? actualMemberCount : selectedLeague.memberCount}
                </div>
                <div className="text-xs text-gray-400">Members</div>
              </div>
              <button
                onClick={() => setShowLeaveConfirm(true)}
                disabled={leaveLoading}
                className="px-2 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded text-xs transition-colors flex items-center gap-1"
              >
                {leaveLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                    Leaving...
                  </>
                ) : (
                  'Leave'
                )}
              </button>
            </div>
          </div>
          
          {/* Invite Code Display - Only for Admins */}
          {isSelectedLeagueAdmin && (
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-600">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Invite Code</p>
                  <span className="font-mono font-bold text-white tracking-wider">
                    {selectedLeague.inviteCode}
                  </span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedLeague.inviteCode);
                    // Could add toast notification here
                  }}
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition-colors flex items-center gap-1"
                >
                  <FaCopy className="text-xs" />
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* League Browser Modal */}
      <LeagueBrowser
        isOpen={showBrowser}
        onClose={() => setShowBrowser(false)}
      />

      {/* League Admin Modal */}
      {selectedLeague && (
        <LeagueAdminModal
          isOpen={showAdminModal}
          onClose={() => setShowAdminModal(false)}
          league={selectedLeague}
        />
      )}

      {/* Leave League Confirmation */}
      <ConfirmDialog
        isOpen={showLeaveConfirm}
        title="Leave League"
        message={`Are you sure you want to leave "${selectedLeague?.name}"? You will need an invite code to rejoin.`}
        confirmText="Leave"
        cancelText="Cancel"
        type="danger"
        onConfirm={handleLeaveLeague}
        onCancel={() => setShowLeaveConfirm(false)}
      />
    </div>
    </>
  );
}