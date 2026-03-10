"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/src/contexts/authProvider';
import { useLeague } from '@/src/contexts/LeagueContext';
import { League } from '@/src/lib/league-types';
import { FaTimes, FaUsers, FaCopy, FaTrash, FaCrown, FaCheck, FaTimes as FaReject, FaUserPlus, FaImage } from 'react-icons/fa';
import { db } from '@/src/lib/firebaseClient';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast } from '@/src/hooks/useToast';
import Toast from '../ui/Toast';

interface LeagueAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  league: League;
}

interface LeagueMember {
  id: string;
  displayName: string;
  profilePicture?: string;
  isAdmin: boolean;
  isOwner: boolean;
}

export default function LeagueAdminModal({ isOpen, onClose, league }: LeagueAdminModalProps) {
  const { user } = useAuth();
  const { refreshUserLeagues, setSelectedLeague } = useLeague();
  const { toasts, showToast, hideToast } = useToast();
  const [activeTab, setActiveTab] = useState<'members' | 'requests' | 'settings'>('members');
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [pendingRequests, setPendingRequests] = useState<LeagueMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [userSuggestions, setUserSuggestions] = useState<LeagueMember[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [leagueSettings, setLeagueSettings] = useState(league.settings);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [transferUserId, setTransferUserId] = useState<string | null>(null);
  const [removeOldAdmin, setRemoveOldAdmin] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({ name: league.name, description: league.description });
  const [editLoading, setEditLoading] = useState(false);

  const isUserAdmin = user && league.admins.includes(user.uid);

  // Copy invite code
  const copyInviteCode = () => {
    navigator.clipboard.writeText(league.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Fetch league members and pending requests
  useEffect(() => {
    const fetchLeagueData = async () => {
      if (!isOpen) return;

      setLoading(true);
      try {
        // Fetch members
        if (league.members) {
          const memberPromises = league.members.map(async (memberId) => {
            const userDoc = await getDoc(doc(db, 'users', memberId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              return {
                id: memberId,
                displayName: userData.name || userData.username || 'Unknown User',
                profilePicture: userData.profilePicture,
                isAdmin: league.admins.includes(memberId),
                isOwner: league.createdBy === memberId
              };
            }
            return null;
          });

          const resolvedMembers = (await Promise.all(memberPromises)).filter(Boolean) as LeagueMember[];

          setMembers(resolvedMembers);
        }

        // Fetch pending requests
        if (league.pendingRequests) {
          const requestPromises = league.pendingRequests.map(async (userId) => {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              return {
                id: userId,
                displayName: userData.name || userData.username || 'Unknown User',
                profilePicture: userData.profilePicture,
                isAdmin: false
              };
            }
            return null;
          });

          const resolvedRequests = (await Promise.all(requestPromises)).filter(Boolean) as LeagueMember[];
          setPendingRequests(resolvedRequests);
        }

      } catch (error) {
        console.error('Error fetching league data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeagueData();
    setLeagueSettings(league.settings);
    setEditData({ name: league.name, description: league.description });
  }, [isOpen, league.members, league.admins, league.pendingRequests, league.settings, league.name, league.description]);

  // Handle member actions
  const handleMemberAction = async (userId: string, action: string) => {
    setProcessingRequestId(userId);
    try {
      const response = await fetch(`/api/leagues/${league.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userId })
      });

      const data = await response.json();

      if (response.ok) {
        if (action === 'approve') {
          await fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              type: 'league_approved',
              leagueId: league.id,
              leagueName: league.name,
              message: `You have been accepted to join "${league.name}"`
            })
          });
          showToast('Member approved successfully', 'success');
          setPendingRequests(prev => prev.filter(r => r.id !== userId));
        } else if (action === 'reject') {
          showToast('Request rejected', 'success');
          setPendingRequests(prev => prev.filter(r => r.id !== userId));
        } else if (action === 'remove') {
          showToast('Member removed successfully', 'success');
          setMembers(prev => prev.filter(m => m.id !== userId));
        } else if (action === 'makeAdmin') {
          showToast('Admin rights granted', 'success');
          await refreshUserLeagues();
          setMembers(prev => prev.map(m =>
            m.id === userId ? { ...m, isAdmin: true } : m
          ));
        } else if (action === 'removeAdmin') {
          showToast('Admin rights removed', 'success');
          await refreshUserLeagues();
          setMembers(prev => prev.map(m =>
            m.id === userId ? { ...m, isAdmin: false } : m
          ));
        }

        await refreshUserLeagues();
      } else {
        showToast(data.error || 'Action failed. Please try again', 'error');
      }
    } catch (error) {
      console.error('Error managing member:', error);
      showToast('Error performing action', 'error');
    } finally {
      setProcessingRequestId(null);
    }
  };

  // Handle league edit
  const handleEditLeague = async () => {
    if (!editData.name.trim()) {
      showToast('League name is required', 'error');
      return;
    }

    setEditLoading(true);
    try {
      const response = await fetch(`/api/leagues/${league.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editData.name, description: editData.description })
      });

      if (response.ok) {
        showToast('League updated successfully', 'success');
        await refreshUserLeagues();
        setEditMode(false);
      } else {
        showToast('Failed to update league', 'error');
      }
    } catch (error) {
      console.error('Error updating league:', error);
      showToast('Error updating league', 'error');
    } finally {
      setEditLoading(false);
    }
  };

  // Handle settings update
  const handleSettingsUpdate = async (newSettings: any) => {
    setActionLoading(true);
    try {
      const response = await fetch(`/api/leagues/${league.id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: newSettings })
      });

      if (response.ok) {
        setLeagueSettings(newSettings);
        showToast('Settings updated successfully', 'success');
        await refreshUserLeagues();
      } else {
        showToast('Failed to update settings', 'error');
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      showToast('Error updating settings', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Transfer admin rights
  const handleTransferAdmin = async () => {
    if (!transferUserId) return;

    setTransferLoading(true);
    try {
      const response = await fetch(`/api/leagues/${league.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromUserId: user?.uid, toUserId: transferUserId, removeOldAdmin })
      });

      if (response.ok) {
        showToast('Admin rights transferred successfully', 'success');
        await refreshUserLeagues();
        setShowTransferConfirm(false);
        setTransferUserId(null);
        setRemoveOldAdmin(false);
        onClose();
      } else {
        showToast('Failed to transfer admin rights', 'error');
      }
    } catch (error) {
      console.error('Error transferring admin:', error);
      showToast('Error transferring admin rights', 'error');
    } finally {
      setTransferLoading(false);
    }
  };

  // Search users by username
  const searchUsers = async (searchTerm: string) => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setUserSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const usersRef = collection(db, 'users');
      const querySnapshot = await getDocs(usersRef);

      const matchingUsers: LeagueMember[] = [];
      querySnapshot.forEach((doc) => {
        const userData = doc.data();
        const username = userData.username || '';
        const name = userData.name || '';

        if (username.toLowerCase().includes(searchTerm.toLowerCase()) ||
          name.toLowerCase().includes(searchTerm.toLowerCase())) {
          if (!league.members.includes(doc.id)) {
            matchingUsers.push({
              id: doc.id,
              displayName: name || username || 'Unknown User',
              profilePicture: userData.profilePicture,
              isAdmin: false
            });
          }
        }
      });

      setUserSuggestions(matchingUsers.slice(0, 5));
      setShowSuggestions(matchingUsers.length > 0);
    } catch (error) {
      console.error('Error searching users:', error);
    }
  };

  // Invite by username
  const handleInviteByUsername = async (userId?: string, displayName?: string) => {
    const targetUserId = userId;

    if (!targetUserId) {
      if (!inviteUsername.trim()) return;

      setInviteLoading(true);
      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', inviteUsername.trim()));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          const foundUserId = userDoc.id;

          if (league.members.includes(foundUserId)) {
            showToast('User is already a member of this league', 'error');
            setInviteLoading(false);
            return;
          }

          await fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: foundUserId,
              type: 'league_invite',
              leagueId: league.id,
              leagueName: league.name,
              message: `You have been invited to join "${league.name}" league`
            })
          });

          setInviteUsername('');
          setShowSuggestions(false);
          showToast('Invitation sent successfully!', 'success');
        } else {
          showToast('User not found. Please check the username', 'error');
        }
      } catch (error) {
        console.error('Error inviting user:', error);
        showToast('Error sending invitation. Please try again', 'error');
      } finally {
        setInviteLoading(false);
      }
      return;
    }

    setInviteLoading(true);
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetUserId,
          type: 'league_invite',
          leagueId: league.id,
          leagueName: league.name,
          message: `You have been invited to join "${league.name}" league`
        })
      });

      setInviteUsername('');
      setShowSuggestions(false);
      setUserSuggestions([]);
      showToast('Invitation sent successfully!', 'success');
    } catch (error) {
      console.error('Error inviting user:', error);
      showToast('Error sending invitation. Please try again', 'error');
    } finally {
      setInviteLoading(false);
    }
  };

  // Handle icon upload
  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showToast('Image size must be less than 2MB', 'error');
      return;
    }

    setUploadingIcon(true);
    try {
      const formData = new FormData();
      formData.append('icon', file);
      formData.append('leagueId', league.id);

      const response = await fetch('/api/leagues/upload-icon', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        showToast('Icon uploaded successfully!', 'success');
        refreshUserLeagues();
        window.location.reload();
      } else {
        showToast('Failed to upload icon', 'error');
      }
    } catch (error) {
      console.error('Error uploading icon:', error);
      showToast('Error uploading icon', 'error');
    } finally {
      setUploadingIcon(false);
    }
  };

  // Handle league deletion
  const handleDeleteLeague = async () => {
    setShowDeleteConfirm(false);
    setDeleteLoading(true);

    try {
      const response = await fetch(`/api/leagues/${league.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.uid })
      });

      if (response.ok) {
        showToast('League deleted successfully', 'success');
        setSelectedLeague(null);
        await refreshUserLeagues();
        setDeleteLoading(false);
        onClose();
      } else {
        const error = await response.json();
        showToast(error.error || 'Failed to delete league', 'error');
        setDeleteLoading(false);
      }
    } catch (error) {
      console.error('Error deleting league:', error);
      showToast('Error deleting league', 'error');
      setDeleteLoading(false);
    }
  };

  if (!isOpen || !isUserAdmin) return null;

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
      {actionLoading && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
          <div className="bg-gray-200 dark:bg-gray-800 rounded-lg p-6 flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            <p className="text-gray-900 dark:text-white">Processing...</p>
          </div>
        </div>
      )}
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-300 dark:border-gray-700">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{league.name}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">League Administration</p>
            </div>
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
              onClick={() => setActiveTab('members')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'members'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white'
                }`}
            >
              <FaUsers className="inline mr-2" />
              Members ({league.memberCount})
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'requests'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white'
                }`}
            >
              Requests ({pendingRequests.length})
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'settings'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white'
                }`}
            >
              Settings
            </button>
          </div>

          <div className="p-6">
            {/* Members Tab */}
            {activeTab === 'members' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">League Members</h3>
                </div>

                {/* Invite Code Section */}
                <div className="bg-gray-200 dark:bg-gray-800 rounded-lg p-4 border border-gray-300 dark:border-gray-700 mb-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Invite Code</p>
                    <div className="flex items-center justify-center gap-2">
                      <div className="bg-gray-300 dark:bg-gray-700 px-4 py-2 rounded-lg">
                        <span className="text-xl font-mono font-bold text-gray-900 dark:text-white tracking-wider">
                          {league.inviteCode}
                        </span>
                      </div>
                      <button
                        onClick={copyInviteCode}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-gray-900 dark:text-white rounded-lg transition-colors flex items-center gap-1"
                      >
                        {copied ? <FaCheck /> : <FaCopy />}
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                      Share this code with friends to join your league
                    </p>
                  </div>
                </div>

                {/* Invite by Username */}
                <div className="bg-gray-200 dark:bg-gray-800 rounded-lg p-4 border border-gray-300 dark:border-gray-700 mb-4">
                  <h4 className="text-gray-900 dark:text-white font-medium mb-2">Invite by Username</h4>
                  <div className="relative">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={inviteUsername}
                        onChange={(e) => {
                          setInviteUsername(e.target.value);
                          searchUsers(e.target.value);
                        }}
                        onFocus={() => inviteUsername.length >= 2 && setShowSuggestions(true)}
                        placeholder="Enter username"
                        className="flex-1 px-3 py-2 bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                      />
                      <button
                        onClick={() => handleInviteByUsername()}
                        disabled={inviteLoading}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-gray-900 dark:text-white rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        {inviteLoading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Inviting...
                          </>
                        ) : (
                          <>
                            <FaUserPlus />
                            Invite
                          </>
                        )}
                      </button>
                    </div>

                    {/* User Suggestions Dropdown */}
                    {showSuggestions && userSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-gray-300 dark:bg-gray-700 rounded-lg border border-gray-600 shadow-lg z-10 max-h-48 overflow-y-auto">
                        {userSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            onClick={() => handleInviteByUsername(suggestion.id, suggestion.displayName)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-600 transition-colors flex items-center gap-2"
                          >
                            <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-sm">
                              {suggestion.displayName.charAt(0)}
                            </div>
                            <span className="text-gray-900 dark:text-white text-sm">{suggestion.displayName}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {loading ? (
                    <div className="text-center py-4 text-gray-600 dark:text-gray-400">
                      Loading members...
                    </div>
                  ) : (
                    members.map((member) => (
                      <div key={member.id} className="flex items-center justify-between p-3 bg-gray-200 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center">
                          <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center mr-3">
                            {member.displayName.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center">
                              <span className="text-gray-900 dark:text-white font-medium">{member.displayName}</span>
                              {member.isOwner && (
                                <FaCrown className="ml-2 text-yellow-400 text-sm" />
                              )}
                            </div>
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              {member.isAdmin ? 'Admin' : 'Member'}
                            </span>
                          </div>
                        </div>

                        {member.id !== user?.uid && (
                          <div className="flex gap-2">
                            {!member.isAdmin ? (
                              <button
                                onClick={() => handleMemberAction(member.id, 'makeAdmin')}
                                disabled={processingRequestId === member.id}
                                className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-gray-900 dark:text-white rounded text-xs transition-colors"
                              >
                                {processingRequestId === member.id ? 'Processing...' : 'Make Admin'}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleMemberAction(member.id, 'removeAdmin')}
                                disabled={processingRequestId === member.id || league.admins.length <= 1}
                                className="px-2 py-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-gray-900 dark:text-white rounded text-xs transition-colors"
                                title={league.admins.length <= 1 ? 'Cannot remove last admin' : 'Remove admin rights'}
                              >
                                {processingRequestId === member.id ? 'Processing...' : 'Remove Admin'}
                              </button>
                            )}
                            {member.isAdmin && league.admins.length > 1 && (
                              <button
                                onClick={() => {
                                  setTransferUserId(member.id);
                                  setShowTransferConfirm(true);
                                }}
                                disabled={processingRequestId === member.id}
                                className="px-2 py-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-gray-900 dark:text-white rounded text-xs transition-colors"
                              >
                                Transfer
                              </button>
                            )}
                            <button
                              onClick={() => handleMemberAction(member.id, 'remove')}
                              disabled={processingRequestId === member.id}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-gray-900 dark:text-white rounded text-xs transition-colors"
                            >
                              <FaTrash />
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Requests Tab */}
            {activeTab === 'requests' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Pending Requests</h3>

                {pendingRequests.length === 0 ? (
                  <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                    No pending requests
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pendingRequests.map((request) => (
                      <div key={request.id} className="flex items-center justify-between p-3 bg-gray-200 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center">
                          <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center mr-3">
                            {request.displayName.charAt(0)}
                          </div>
                          <span className="text-gray-900 dark:text-white font-medium">{request.displayName}</span>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleMemberAction(request.id, 'approve')}
                            disabled={processingRequestId === request.id}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-gray-900 dark:text-white rounded text-sm transition-colors flex items-center gap-1"
                          >
                            {processingRequestId === request.id ? (
                              <>
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                Accepting...
                              </>
                            ) : (
                              <>
                                <FaCheck />
                                Accept
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleMemberAction(request.id, 'reject')}
                            disabled={processingRequestId === request.id}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-gray-900 dark:text-white rounded text-sm transition-colors flex items-center gap-1"
                          >
                            <FaReject />
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">League Settings</h3>

                {/* Edit League Info */}
                <div className="bg-gray-200 dark:bg-gray-800 rounded-lg p-4 border border-gray-300 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-gray-900 dark:text-white font-medium">League Information</h4>
                    {!editMode && (
                      <button
                        onClick={() => setEditMode(true)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </div>

                  {editMode ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          League Name
                        </label>
                        <input
                          type="text"
                          value={editData.name}
                          onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                          maxLength={50}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Description
                        </label>
                        <textarea
                          value={editData.description}
                          onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                          rows={3}
                          maxLength={200}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditMode(false);
                            setEditData({ name: league.name, description: league.description });
                          }}
                          disabled={editLoading}
                          className="flex-1 px-3 py-2 bg-gray-600 hover:bg-gray-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleEditLeague}
                          disabled={editLoading || !editData.name.trim()}
                          className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          {editLoading ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              Saving...
                            </>
                          ) : (
                            'Save'
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm text-gray-600 dark:text-gray-400">Name:</span>
                        <p className="text-gray-900 dark:text-white">{league.name}</p>
                      </div>
                      <div>
                        <span className="text-sm text-gray-600 dark:text-gray-400">Description:</span>
                        <p className="text-gray-900 dark:text-white">{league.description || 'No description'}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* League Icon */}
                <div className="bg-gray-200 dark:bg-gray-800 rounded-lg p-4 border border-gray-300 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-gray-900 dark:text-white font-medium">League Icon</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Upload a custom icon for your league (max 2MB)</div>
                      {league.icon && (
                        <img
                          src={league.icon.startsWith('http') ? league.icon : `https://firebasestorage.googleapis.com/v0/b/${league.icon}`}
                          alt="League icon"
                          className="mt-2 w-16 h-16 rounded-lg object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                    <label className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-gray-900 dark:text-white rounded-lg transition-colors flex items-center gap-2 cursor-pointer">
                      <FaImage />
                      {uploadingIcon ? 'Uploading...' : 'Upload Icon'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleIconUpload}
                        disabled={uploadingIcon}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-gray-900 dark:text-white font-medium">Public League</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Anyone can find and join</div>
                    </div>
                    <button
                      onClick={() => handleSettingsUpdate({ ...leagueSettings, isPublic: !leagueSettings.isPublic })}
                      className={`w-12 h-6 rounded-full ${leagueSettings.isPublic ? 'bg-green-600' : 'bg-gray-600'} relative transition-colors`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${leagueSettings.isPublic ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-gray-900 dark:text-white font-medium">Require Approval</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Admin must approve join requests</div>
                    </div>
                    <button
                      onClick={() => handleSettingsUpdate({ ...leagueSettings, requiresApproval: !leagueSettings.requiresApproval })}
                      className={`w-12 h-6 rounded-full ${leagueSettings.requiresApproval ? 'bg-yellow-600' : 'bg-gray-600'} relative transition-colors`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${leagueSettings.requiresApproval ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-gray-900 dark:text-white font-medium">Searchable</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Appears in public search</div>
                    </div>
                    <button
                      onClick={() => handleSettingsUpdate({ ...leagueSettings, isSearchable: !leagueSettings.isSearchable })}
                      className={`w-12 h-6 rounded-full ${leagueSettings.isSearchable ? 'bg-blue-600' : 'bg-gray-600'} relative transition-colors`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${leagueSettings.isSearchable ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>

                <div className="border-t border-gray-300 dark:border-gray-700 pt-4">
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={deleteLoading}
                    className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-gray-900 dark:text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {deleteLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Deleting...
                      </>
                    ) : (
                      <>
                        <FaTrash />
                        Delete League
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete League"
        message={`Are you sure you want to delete "${league.name}"? This action cannot be undone and will permanently delete all league data.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={handleDeleteLeague}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Transfer Admin Confirmation */}
      {showTransferConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full p-6 border border-gray-300 dark:border-gray-700">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Transfer Admin Rights</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Transfer admin rights to this user? You will remain an admin unless you choose to remove yourself.
            </p>

            <div className="mb-6">
              <label className="flex items-center gap-2 text-gray-900 dark:text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeOldAdmin}
                  onChange={(e) => setRemoveOldAdmin(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-300 dark:bg-gray-700 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm">Remove myself as admin</span>
              </label>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowTransferConfirm(false);
                  setTransferUserId(null);
                  setRemoveOldAdmin(false);
                }}
                disabled={transferLoading}
                className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-300 hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-900 dark:text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTransferAdmin}
                disabled={transferLoading}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-gray-900 dark:text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {transferLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Transferring...
                  </>
                ) : (
                  'Transfer'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}