"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/src/contexts/authProvider';
import { useSubscription } from '@/src/contexts/SubscriptionContext';
import { FaCrown, FaCalendar, FaCreditCard, FaTimes, FaCheck } from 'react-icons/fa';

interface BillingHistory {
  id: string;
  amount: number;
  date: string;
  status: string;
  invoiceUrl?: string;
}

export default function SubscriptionManager() {
  const { user } = useAuth();
  const { isSubscribed, subscriptionTier, refreshSubscription } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [subscriptionData, setSubscriptionData] = useState<any>(null);
  const [billingHistory, setBillingHistory] = useState<BillingHistory[]>([]);
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    if (user && isSubscribed) {
      fetchSubscriptionDetails();
    }
  }, [user, isSubscribed]);

  const fetchSubscriptionDetails = async () => {
    try {
      const response = await fetch(`/api/users/${user?.uid}/subscription`);
      const data = await response.json();
      setSubscriptionData(data);
      
      if (data.stripeCustomerId) {
        const historyResponse = await fetch(`/api/stripe/billing-history?customerId=${data.stripeCustomerId}`);
        const historyData = await historyResponse.json();
        setBillingHistory(historyData.history || []);
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
    }
  };

  const handleCancelSubscription = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.uid })
      });

      if (response.ok) {
        await refreshSubscription();
        setShowCancelModal(false);
        alert('Subscription cancelled successfully. You will have access until the end of your billing period.');
      } else {
        alert('Failed to cancel subscription');
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      alert('Failed to cancel subscription');
    } finally {
      setLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.uid })
      });

      const { url } = await response.json();
      if (url) window.location.href = url;
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to open billing portal');
    } finally {
      setLoading(false);
    }
  };

  const getPlanName = (tier: string) => {
    const plans: any = {
      monthly: 'Monthly Plan',
      quarterly: 'Quarterly Plan',
      yearly: 'Yearly Plan'
    };
    return plans[tier] || tier;
  };

  const getPlanPrice = (tier: string) => {
    const prices: any = {
      monthly: '$4.99/month',
      quarterly: '$12.99/quarter',
      yearly: '$44.99/year'
    };
    return prices[tier] || '';
  };

  if (!isSubscribed) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 text-center">
        <FaCrown className="text-gray-500 text-5xl mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">No Active Subscription</h3>
        <p className="text-gray-400 mb-4">Subscribe to unlock premium features</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <div className="bg-gradient-to-br from-blue-900 to-blue-800 rounded-lg p-6 border border-blue-500">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FaCrown className="text-yellow-400 text-2xl" />
            <div>
              <h3 className="text-xl font-bold text-white">{getPlanName(subscriptionTier || '')}</h3>
              <p className="text-blue-200 text-sm">{getPlanPrice(subscriptionTier || '')}</p>
            </div>
          </div>
          <div className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium">
            Active
          </div>
        </div>

        {subscriptionData?.currentPeriodEnd && (
          <div className="flex items-center gap-2 text-blue-200 text-sm mb-4">
            <FaCalendar />
            <span>Renews on {new Date(subscriptionData.currentPeriodEnd).toLocaleDateString()}</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleManageBilling}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-white text-blue-900 rounded-lg font-medium hover:bg-blue-50 disabled:opacity-50"
          >
            Manage Billing
          </button>
          <button
            onClick={() => setShowCancelModal(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Features */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h4 className="text-lg font-bold text-white mb-4">Your Benefits</h4>
        <ul className="space-y-3">
          {[
            'Create unlimited custom leagues',
            'Save and track your picks',
            'Advanced statistics',
            'Priority support',
            'Ad-free experience'
          ].map((feature, i) => (
            <li key={i} className="flex items-center gap-3 text-gray-300">
              <FaCheck className="text-green-400" />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {/* Billing History */}
      {billingHistory.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h4 className="text-lg font-bold text-white mb-4">Billing History</h4>
          <div className="space-y-3">
            {billingHistory.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <FaCreditCard className="text-gray-400" />
                  <div>
                    <p className="text-white font-medium">${(item.amount / 100).toFixed(2)}</p>
                    <p className="text-gray-400 text-sm">{new Date(item.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    item.status === 'paid' ? 'bg-green-500/20 text-green-400' : 'bg-gray-600 text-gray-300'
                  }`}>
                    {item.status}
                  </span>
                  {item.invoiceUrl && (
                    <a
                      href={item.invoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-sm"
                    >
                      Invoice
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Cancel Subscription?</h3>
              <button onClick={() => setShowCancelModal(false)} className="text-gray-400 hover:text-white">
                <FaTimes />
              </button>
            </div>
            <p className="text-gray-300 mb-6">
              Are you sure you want to cancel? You'll lose access to premium features at the end of your billing period.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg"
              >
                {loading ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
