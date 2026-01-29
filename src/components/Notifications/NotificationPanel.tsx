"use client";

import { LeagueNotification } from '@/src/lib/league-types';
import { FaTimes, FaTrash, FaUsers } from 'react-icons/fa';
import { useRouter } from 'next/navigation';

interface NotificationPanelProps {
  notifications: LeagueNotification[];
  onClose: () => void;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function NotificationPanel({ notifications, onClose, onMarkAsRead, onDelete }: NotificationPanelProps) {
  const router = useRouter();

  const handleNotificationClick = (notification: LeagueNotification) => {
    onMarkAsRead(notification.id);
    
    if (notification.type === 'league_invite' || notification.type === 'league_approved') {
      router.push('/dashboard/leaderboard');
    }
    
    onClose();
  };

  return (
    <>
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
                className={`p-4 hover:bg-gray-700/50 cursor-pointer transition-colors ${
                  !notification.read ? 'bg-blue-900/20' : ''
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
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
