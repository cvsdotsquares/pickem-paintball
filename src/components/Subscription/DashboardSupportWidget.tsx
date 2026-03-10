"use client";

import { useSubscription } from '@/src/contexts/SubscriptionContext';
import { FaHeart } from 'react-icons/fa';

export default function DashboardSupportWidget() {
  const { isSubscribed, showModal } = useSubscription();

  if (isSubscribed) {
    return (
      <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-6 text-center">
        <FaHeart className="text-green-400 text-4xl mx-auto mb-3" />
        <h3 className="text-xl font-bold text-white mb-2">Thank You!</h3>
        <p className="text-gray-300 text-sm">
          You&apos;re supporting Pick&apos;Em Paintball
        </p>
      </div>
    );
  }

  return (
    <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-6 text-center">
      <FaHeart className="text-blue-400 text-4xl mx-auto mb-3" />
      <h3 className="text-xl font-bold text-white mb-2">Support Pick&apos;Em Paintball</h3>
      <p className="text-gray-300 text-sm mb-4">
        Help us grow competitive paintball and unlock premium features
      </p>
      <button
        onClick={() => showModal('passive')}
        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
      >
        Learn More
      </button>
    </div>
  );
}
