"use client";

import { useState, useEffect } from 'react';
import { FaTimes, FaCheck } from 'react-icons/fa';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'passive' | 'soft-gate' | 'hard-gate';
  onContinueFree?: () => void;
}

const MODAL_CONTENT = {
  passive: {
    title: 'Support Pick\'Em Paintball',
    description: 'Help us keep Pick\'Em Paintball running and support the growth of competitive paintball. Your subscription helps us maintain the platform and add new features.',
    showContinueFree: false
  },
  'soft-gate': {
    title: 'Save Your Picks',
    description: 'Subscribe to save your picks and compete with friends! You can continue for free, but subscribing unlocks premium features and helps support the platform.',
    showContinueFree: true
  },
  'hard-gate': {
    title: 'Premium Feature',
    description: 'Creating custom leagues is a premium feature. Subscribe now to create your own leagues and compete with friends!',
    showContinueFree: false
  }
};

export default function SubscriptionModal({ isOpen, onClose, type, onContinueFree }: SubscriptionModalProps) {
  const [selectedPlan, setSelectedPlan] = useState('quarterly');
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const content = MODAL_CONTENT[type];

  useEffect(() => {
    async function fetchPlans() {
      try {
        const response = await fetch('/api/subscription/plans');
        const data = await response.json();
        setPlans(data.plans || []);
      } catch (error) {
        console.error('Error fetching plans:', error);
      }
    }
    if (isOpen) fetchPlans();
  }, [isOpen]);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan })
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
          <h2 className="text-2xl font-bold text-white text-center">{content.title}</h2>
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
            <FaTimes className="text-xl" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-gray-300 text-center mb-8">{content.description}</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {plans.map((plan) => (
              <div
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`relative p-6 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedPlan === plan.id ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 bg-gray-800'
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
                    {plan.price}<span className="text-sm text-gray-400">{plan.period}</span>
                  </div>
                  {plan.savings && <div className="text-green-400 text-sm mt-1">{plan.savings}</div>}
                </div>

                <ul className="space-y-2">
                  {plan.features.map((feature: string, i: number) => (
                    <li key={i} className="flex items-center text-sm text-gray-300">
                      <FaCheck className="text-green-400 mr-2" />
                      {feature}
                    </li>
                  ))}
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
                Continue for Free
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
