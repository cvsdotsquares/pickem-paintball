"use client";

import { useSubscription } from '@/src/contexts/SubscriptionContext';
import { FaHeart } from 'react-icons/fa';

export default function SupportButton() {
  const { isSubscribed, showModal } = useSubscription();

  if (isSubscribed) {
    return (
      <div className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm flex items-center gap-2">
        <FaHeart />
        <span className="hidden sm:inline">Subscriber - Thank You!</span>
        <span className="sm:hidden">Subscribed</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => showModal('passive')}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2 transition-colors"
    >
      <FaHeart />
      <span className="hidden sm:inline">Support Pick&apos;Em</span>
      <span className="sm:hidden">Support</span>
    </button>
  );
}
