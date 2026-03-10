"use client";

import { useState, useEffect } from 'react';
import { FaTimes, FaCheck } from 'react-icons/fa';
import { useAuth } from '../../contexts/authProvider';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'passive' | 'soft-gate' | 'hard-gate';
  onContinueFree?: () => void;
}

const MODAL_CONTENT = {
  passive: {
    title: 'SUPPORT PICK\'EM PAINTBALL',
    description: (
      <>
        <h2 className="font-bold text-white">Pick'Em Paintball is built by fans, for fans.</h2>
        <p>Our goal is to develop paintball stats and build a site for the fans.</p>
        <p>The core game and basic stats will always be free. Subscriptions simply helps support the extra work that makes Pick'Em better for everyone.</p>
        <p>Even if you choose not subscribe, just playing, sharing, and being part of the community means a huge amount to us. Thank you!</p>
      </>
    ),
    showContinueFree: true,
    continueButtonText: 'Not today'
  },
  'soft-gate': {
    title: 'SUPPORT PICK\'EM PAINTBALL',
    description: (
      <>
        <h2 className="font-bold text-white">Pick'Em Paintball is built by fans, for fans.</h2>

        <p>Our goal is to develop paintball stats and build a site for the fans. To reward those who support us, some features are currently subscriber only.
        </p>
        <p>
          The core game and basic stats will always be free. Subscriptions simply helps support the extra work that makes Pick'Em better for everyone.
        </p>
        <p>
          Even if you choose not subscribe, just playing, sharing, and being part of the community means a huge amount to us. Thank you!
        </p>
      </>
    ),
    showContinueFree: true,
    continueButtonText: 'Continue for Free'
  },
  'hard-gate': {
    title: 'Premium Feature',
    description: (
      <>
        <h2 className="font-bold text-white">Pick'Em Paintball is built by fans, for fans.</h2>
        <br />
        Our goal is to develop paintball stats and build a site for the fans. To reward those who support us, some features are currently subscriber only.
        <br />
        The core game and basic stats will always be free. Subscriptions simply helps support the extra work that makes Pick'Em better for everyone.
        <br />
        Even if you choose not subscribe, just playing, sharing, and being part of the community means a huge amount to us. Thank you!
      </>
    ),
    showContinueFree: false,
    continueButtonText: ''
  }
};

export default function SubscriptionModal({ isOpen, onClose, type, onContinueFree }: SubscriptionModalProps) {
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState('monthly'); // Default to monthly (most popular)
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const content = MODAL_CONTENT[type];

  useEffect(() => {
    async function fetchPlans() {
      try {
        // Try to get user's timezone to determine region as fallback
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        let regionParam = '';

        // Simple timezone-based region detection as fallback
        if (timezone.includes('Europe/London')) {
          regionParam = '?region=UK';
        } else if (timezone.includes('Europe/')) {
          regionParam = '?region=EU';
        }

        const response = await fetch(`/api/subscription/plans${regionParam}`);
        const data = await response.json();
        setPlans(data.plans || []);
      } catch (error) {
        console.error('Error fetching plans:', error);
        // Fallback to default US pricing
        setPlans([
          {
            id: 'monthly',
            name: 'Monthly',
            price: '$4.99',
            period: '/month',
            popular: true,
            savings: null,
            features: [
              'Custom Leagues',
              'Advanced Statistics',
              'Priority Support',
              'Early Access to Features'
            ]
          }
        ]);
      }
    }
    if (isOpen) fetchPlans();
  }, [isOpen]);

  const handleSubscribe = async () => {
    if (!user) {
      alert('Please login to subscribe');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan, userId: user.uid })
      });

      const { url } = await response.json();
      if (url) window.location.href = url;
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to start checkout');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="relative p-6 border-b border-gray-700">
          {/* Brand Logo */}
          <div className="flex justify-center mb-4">
            <img
              src="/logo.svg"
              alt="Pick'Em Paintball Logo"
              className="h-12 w-auto"
            />
          </div>
          <h2 className="text-2xl font-bold text-white text-center">{content.title}</h2>
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
            <FaTimes className="text-xl" />
          </button>
        </div>

        <div className="p-6">
          <div className="text-gray-300 mb-8 leading-relaxed text-center">{content.description}</div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {plans.map((plan) => (
              <div
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`relative p-6 rounded-lg border-2 cursor-pointer transition-all ${selectedPlan === plan.id ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 bg-gray-800'
                  }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}

                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold text-white mb-2">{plan.name}</h3>
                  <div className="text-3xl font-bold text-white">
                    {plan.price}<span className="text-sm text-gray-400">{plan.name === 'Event Subscription' ? '/event' : plan.period}</span>
                  </div>
                  {plan.savings && <div className="text-green-400 text-sm mt-1">{plan.savings}</div>}
                </div>
                {console.log(plan)}
                <ul className="space-y-2">
                  {plan.features.map((feature: any, i: number) => {
                    const text = typeof feature === 'string' ? feature : (feature?.name || feature?.toString() || '');
                    return (
                      <li key={i} className="flex items-center text-sm text-gray-300">
                        <FaCheck className="text-green-400 mr-2 flex-shrink-0" />
                        <span dangerouslySetInnerHTML={{ __html: text }} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              {loading ? 'Processing...' : 'Subscribe Now'}
            </button>

            {content.showContinueFree && (
              <button
                onClick={() => { onContinueFree?.(); onClose(); }}
                className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium"
              >
                {content.continueButtonText}
              </button>
            )}

            {!content.showContinueFree && type !== 'hard-gate' && (
              <button onClick={onClose} className="w-full px-6 py-3 text-gray-400 hover:text-white">
                Maybe Later
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
