"use client";

import { useState } from 'react';
import { LeagueNotification } from '@/src/lib/league-types';
import { FaTimes, FaTrash, FaUsers } from 'react-icons/fa';
import { useRouter } from 'next/navigation';
import { useToast } from '@/src/hooks/useToast';
import Toast from '../ui/Toast';

interface NotificationPanelProps {
  notifications: LeagueNotification[];
  onClose: () => void;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function NotificationPanel({ notifications, onClose, onMarkAsRead, onDelete }: NotificationPanelProps) {
  const router = useRouter();
  const { toasts, showToast, hideToast } = useToast();
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const handleNotificationClick = (notification: LeagueNotification) => {
    onMarkAsRead(notification.id);
    
    if (notification.type === 'league_approved') {
      router.push('/dashboard/leaderboard');
      onClose();
    }
  };

  const handleAcceptInvite = async (notification: LeagueNotification) => {
    setAcceptingId(notification.id);
    try {
      // Get league details to find invite code
      const leagueResponse = await fetch(`/api/leagues/${notification.leagueId}`);
      if (!leagueResponse.ok) {
        throw new Error('Failed to get league details');
      }
      
      const leagueData = await leagueResponse.json();
      
      const response = await fetch('/api/leagues/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode: leagueData.league.inviteCode,
          userId: notification.userId
        })
      });
      
      if (response.ok) {
        onDelete(notification.id);
        showToast('Successfully joined league!', 'success');
      } else {
        const error = await response.json();
        showToast(error.error || 'Failed to join league', 'error');
        setAcceptingId(null);
      }
    } catch (error) {
      console.error('Error accepting invite:', error);
      showToast('Failed to accept invite', 'error');
      setAcceptingId(null);
    }
  };

  const handleAcceptRequest = async (notification: LeagueNotification, requestUserId?: string) => {
    setAcceptingId(notification.id);
    try {
      let userId = requestUserId;
      
      // If requestUserId not provided, fetch from league pendingRequests
      if (!userId) {
        const leagueResponse = await fetch(`/api/leagues/${notification.leagueId}`);
        if (leagueResponse.ok) {
          const leagueData = await leagueResponse.json();
          if (leagueData.league?.pendingRequests?.length > 0) {
            userId = leagueData.league.pendingRequests[0];
          }
        }
      }
      
      if (!userId) {
        showToast('Could not find user to approve', 'error');
        setAcceptingId(null);
        return;
      }
      
      const response = await fetch(`/api/leagues/${notification.leagueId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', userId })
      });
      
      if (response.ok) {
        // Send notification to the user who requested
        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            type: 'league_approved',
            leagueId: notification.leagueId,
            leagueName: notification.leagueName,
            message: `Your request to join "${notification.leagueName}" has been approved`
          })
        });
        
        onDelete(notification.id);
        showToast('Request approved successfully', 'success');
      } else {
        showToast('Failed to approve request', 'error');
        setAcceptingId(null);
      }
    } catch (error) {
      console.error('Error accepting request:', error);
      showToast('Failed to approve request', 'error');
      setAcceptingId(null);
    }
  };

  const handleDeclineRequest = async (notification: LeagueNotification, requestUserId: string) => {
    try {
      const response = await fetch(`/api/leagues/${notification.leagueId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', userId: requestUserId })
      });
      
      if (response.ok) {
        onDelete(notification.id);
        showToast('Request declined', 'success');
      } else {
        showToast('Failed to decline request', 'error');
      }
    } catch (error) {
      console.error('Error declining request:', error);
      showToast('Failed to decline request', 'error');
    }
  };

  const handleDeclineInvite = (notificationId: string) => {
    onDelete(notificationId);
  };

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
      <div className="fixed inset-0 z-40" onClick={onClose} />
      
      <div className="absolute right-0 top-full mt-2 w-80 bg-gray-800 rounded-lg shadow-xl border border-gray-700 z-50 max-h-96 overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-white font-medium">Notifications</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <FaTimes />
          </button>
        </div>

        {notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No notifications
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 hover:bg-gray-700/50 transition-colors ${
                  !notification.read ? 'bg-blue-900/20' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => handleNotificationClick(notification)}>
                    <div className="flex items-center gap-2 mb-1">
                      <FaUsers className="text-blue-400 text-sm" />
                      <span className="text-white font-medium text-sm">
                        {notification.leagueName}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300">{notification.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {notification.createdAt?.toDate?.()?.toLocaleDateString() || 'Just now'}
                    </p>
                    
                    {notification.type === 'league_invite' && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcceptInvite(notification);
                          }}
                          disabled={acceptingId === notification.id}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded text-sm transition-colors flex items-center gap-1"
                        >
                          {acceptingId === notification.id ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                              Accepting...
                            </>
                          ) : (
                            'Accept'
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeclineInvite(notification.id);
                          }}
                          disabled={acceptingId === notification.id}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded text-sm transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                    
                    {notification.type === 'league_request' && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcceptRequest(notification, notification.requestUserId);
                          }}
                          disabled={acceptingId === notification.id}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded text-sm transition-colors flex items-center gap-1"
                        >
                          {acceptingId === notification.id ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                              Accepting...
                            </>
                          ) : (
                            'Accept'
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (notification.requestUserId) {
                              handleDeclineRequest(notification, notification.requestUserId);
                            } else {
                              onDelete(notification.id);
                            }
                          }}
                          disabled={acceptingId === notification.id}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded text-sm transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(notification.id);
                    }}
                    className="text-gray-400 hover:text-red-400 ml-2"
                  >
                    <FaTrash className="text-xs" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
