"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/src/contexts/authProvider';
import { useLeague } from '@/src/contexts/LeagueContext';
import { League } from '@/src/lib/league-types';
import { FaTimes, FaUsers, FaCopy, FaTrash, FaCrown, FaCheck, FaTimes as FaReject, FaUserPlus, FaImage } from 'react-icons/fa';
import { db } from '@/src/lib/firebaseClient';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

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
}

export default function LeagueAdminModal({ isOpen, onClose, league }: LeagueAdminModalProps) {
  const { user } = useAuth();
  const { refreshUserLeagues } = useLeague();
  const [activeTab, setActiveTab] = useState<'members' | 'requests' | 'settings'>('members');
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [pendingRequests, setPendingRequests] = useState<LeagueMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [leagueSettings, setLeagueSettings] = useState(league.settings);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [iconFile, setIconFile] = useState<File | null>(null);

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
                isAdmin: league.admins.includes(memberId)
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
  }, [isOpen, league.members, league.admins, league.pendingRequests, league.settings]);

  // Handle member actions
  const handleMemberAction = async (userId: string, action: string) => {
    try {
      const response = await fetch(`/api/leagues/${league.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userId })
      });
      
      if (response.ok) {
        // Create notification for approved users
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
        }
        
        refreshUserLeagues();
        window.location.reload();
      }
    } catch (error) {
      console.error('Error managing member:', error);
    }
  };

  // Handle settings update
  const handleSettingsUpdate = async (newSettings: any) => {
    try {
      const response = await fetch(`/api/leagues/${league.id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: newSettings })
      });
      
      if (response.ok) {
        setLeagueSettings(newSettings);
        refreshUserLeagues();
      }
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  };

  // Transfer admin rights
  const handleTransferAdmin = async (toUserId: string) => {
    if (!confirm('Transfer admin rights to this user? You will remain an admin unless you choose to remove yourself.')) return;
    
    const removeOldAdmin = confirm('Do you want to remove yourself as admin?');
    
    try {
      const response = await fetch(`/api/leagues/${league.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromUserId: user?.uid, toUserId, removeOldAdmin })
      });
      
      if (response.ok) {
        refreshUserLeagues();
        window.location.reload();
      }
    } catch (error) {
      console.error('Error transferring admin:', error);
    }
  };

  // Invite by username
  const handleInviteByUsername = async () => {
    if (!inviteUsername.trim()) return;
    
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', inviteUsername.trim()));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const userId = userDoc.id;
        
        // Check if user is already a member
        if (league.members.includes(userId)) {
          alert('User is already a member of this league');
          return;
        }
        
        // Send invitation notification instead of direct join
        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            type: 'league_invite',
            leagueId: league.id,
            leagueName: league.name,
            message: `You have been invited to join "${league.name}" league`
          })
        });
        
        setInviteUsername('');
        alert('Invitation sent successfully!');
      } else {
        alert('User not found. Please check the username.');
      }
    } catch (error) {
      console.error('Error inviting user:', error);
      alert('Error sending invitation. Please try again.');
    }
  };

  // Handle icon upload
  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Image size must be less than 2MB');
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
        alert('Icon uploaded successfully!');
        refreshUserLeagues();
        window.location.reload();
      } else {
        alert('Failed to upload icon');
      }
    } catch (error) {
      console.error('Error uploading icon:', error);
      alert('Error uploading icon');
    } finally {
      setUploadingIcon(false);
    }
  };

  if (!isOpen || !isUserAdmin) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-white">{league.name}</h2>
            <p className="text-sm text-gray-400">League Administration</p>
          </div>
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
            onClick={() => setActiveTab('members')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'members'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <FaUsers className="inline mr-2" />
            Members ({league.memberCount})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'requests'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Requests ({pendingRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
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
                <h3 className="text-lg font-medium text-white">League Members</h3>
              </div>

              {/* Invite Code Section */}
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-4">
                <div className="text-center">
                  <p className="text-sm text-gray-400 mb-2">Invite Code</p>
                  <div className="flex items-center justify-center gap-2">
                    <div className="bg-gray-700 px-4 py-2 rounded-lg">
                      <span className="text-xl font-mono font-bold text-white tracking-wider">
                        {league.inviteCode}
                      </span>
                    </div>
                    <button
                      onClick={copyInviteCode}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1"
                    >
                      {copied ? <FaCheck /> : <FaCopy />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Share this code with friends to join your league
                  </p>
                </div>
              </div>

              {/* Invite by Username */}
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-4">
                <h4 className="text-white font-medium mb-2">Invite by Username</h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    placeholder="Enter username"
                    className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={handleInviteByUsername}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1"
                  >
                    <FaUserPlus />
                    Invite
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {loading ? (
                  <div className="text-center py-4 text-gray-400">
                    Loading members...
                  </div>
                ) : (
                  members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center mr-3">
                          {member.displayName.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center">
                            <span className="text-white font-medium">{member.displayName}</span>
                            {member.isAdmin && (
                              <FaCrown className="ml-2 text-yellow-400 text-sm" />
                            )}
                          </div>
                          <span className="text-xs text-gray-400">
                            {member.isAdmin ? 'Admin' : 'Member'}
                          </span>
                        </div>
                      </div>
                      
                      {member.id !== user?.uid && (
                        <div className="flex gap-2">
                          {!member.isAdmin && (
                            <button 
                              onClick={() => handleMemberAction(member.id, 'makeAdmin')}
                              className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-xs transition-colors"
                            >
                              Make Admin
                            </button>
                          )}
                          {member.isAdmin && league.admins.length > 1 && (
                            <button 
                              onClick={() => handleTransferAdmin(member.id)}
                              className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs transition-colors"
                            >
                              Transfer
                            </button>
                          )}
                          <button 
                            onClick={() => handleMemberAction(member.id, 'remove')}
                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors"
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
              <h3 className="text-lg font-medium text-white">Pending Requests</h3>
              
              {pendingRequests.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  No pending requests
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingRequests.map((request) => (
                    <div key={request.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center mr-3">
                          {request.displayName.charAt(0)}
                        </div>
                        <span className="text-white font-medium">{request.displayName}</span>
                      </div>
                      
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleMemberAction(request.id, 'approve')}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors flex items-center gap-1"
                        >
                          <FaCheck />
                          Accept
                        </button>
                        <button 
                          onClick={() => handleMemberAction(request.id, 'reject')}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors flex items-center gap-1"
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
              <h3 className="text-lg font-medium text-white">League Settings</h3>
              
              {/* League Icon */}
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">League Icon</div>
                    <div className="text-sm text-gray-400">Upload a custom icon for your league (max 2MB)</div>
                    {league.icon && (
                      <img src={league.icon} alt="League icon" className="mt-2 w-16 h-16 rounded-lg object-cover" />
                    )}
                  </div>
                  <label className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 cursor-pointer">
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
                    <div className="text-white font-medium">Public League</div>
                    <div className="text-sm text-gray-400">Anyone can find and join</div>
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
                    <div className="text-white font-medium">Require Approval</div>
                    <div className="text-sm text-gray-400">Admin must approve join requests</div>
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
                    <div className="text-white font-medium">Searchable</div>
                    <div className="text-sm text-gray-400">Appears in public search</div>
                  </div>
                  <button
                    onClick={() => handleSettingsUpdate({ ...leagueSettings, isSearchable: !leagueSettings.isSearchable })}
                    className={`w-12 h-6 rounded-full ${leagueSettings.isSearchable ? 'bg-blue-600' : 'bg-gray-600'} relative transition-colors`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${leagueSettings.isSearchable ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <button className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
                  Delete League
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}