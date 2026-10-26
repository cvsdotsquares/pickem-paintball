"use client";

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { IoMdClose } from 'react-icons/io';
import { FaCheck } from 'react-icons/fa';
import { useAuth } from '../../contexts/authProvider';
import { useTheme } from '@/src/contexts/ThemeContext';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'passive' | 'soft-gate' | 'hard-gate';
  onContinueFree?: () => void;
}

interface Plan {
  id: string;
  name: string;
  price: string;
  period: string;
  popular: boolean;
  savings: string | null;
  features: (string | { name?: string })[];
}

/** Shown under the lead line once "Read more" is tapped, so the first screen stays short on phones. */
const MORE_TEXT = [
  'Our goal is to develop paintball stats and build a site for the fans.',
  'Even if you choose not to subscribe, just playing, sharing, and being part of the community means a huge amount to us. Thank you!',
];

const MODAL_CONTENT = {
  passive: {
    title: "Support Pick'Em Paintball",
    lead: "The core game and basic stats will always be free. Subscriptions help support the extra work that makes Pick'Em better for everyone.",
    continueButtonText: 'Not today',
  },
  'soft-gate': {
    title: "Support Pick'Em Paintball",
    lead: 'To reward those who support us, some features are subscriber only. The core game and basic stats will always be free.',
    continueButtonText: 'Continue for free',
  },
  'hard-gate': {
    title: 'Premium Feature',
    lead: 'To reward those who support us, some features are subscriber only. The core game and basic stats will always be free.',
    continueButtonText: 'Maybe later',
  },
};

const CURRENCY_SYMBOLS: Record<string, string> = { usd: '$', gbp: '£', eur: '€' };

function regionFromTimezone(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timezone.includes('Europe/London')) return 'UK';
  if (timezone.includes('Europe/')) return 'EU';
  return '';
}

function featureText(feature: string | { name?: string }): string {
  return typeof feature === 'string' ? feature : feature?.name || '';
}

/** "£49.99" → "£4.17": the yearly price as a monthly figure, so it compares directly with Monthly. */
function perMonth(price: string): string | null {
  const amount = parseFloat(price.replace(/[^0-9.]/g, ''));
  if (!amount) return null;
  return `${price.replace(/[0-9.,\s]/g, '')}${(amount / 12).toFixed(2)}`;
}

function periodLabel(plan: Plan): string {
  return plan.name === 'Event Subscription' ? '/event' : plan.period;
}

/** Stripe product names are "Monthly Subscription" etc.; the card already says what it is. */
function shortName(name: string): string {
  return name.replace(/\s+Subscription$/i, '');
}

export default function SubscriptionModal({ isOpen, onClose, type, onContinueFree }: SubscriptionModalProps) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState('monthly'); // Default to monthly (most popular)
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currency, setCurrency] = useState('usd');
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const content = MODAL_CONTENT[type];

  useEffect(() => {
    async function fetchPlans() {
      const region = regionFromTimezone();
      try {
        const response = await fetch(`/api/subscription/plans${region ? `?region=${region}` : ''}`);
        const data = await response.json();
        setPlans(data.plans || []);
        if (data.currency) setCurrency(data.currency);
      } catch (err) {
        console.error('Error fetching plans:', err);
        const fallbackCurrency = region === 'UK' ? 'gbp' : region === 'EU' ? 'eur' : 'usd';
        setCurrency(fallbackCurrency);
        setPlans([
          {
            id: 'monthly',
            name: 'Monthly',
            price: `${CURRENCY_SYMBOLS[fallbackCurrency]}4.99`,
            period: '/month',
            popular: true,
            savings: null,
            features: ['Join and Create custom leagues', 'Early access to new features'],
          },
        ]);
      }
    }
    if (isOpen) fetchPlans();
  }, [isOpen]);

  // Lock the page behind and close on Escape. Swipes or wheel turns outside the plan list are cancelled so
  // they never move the page underneath (iOS ignores `overflow: hidden` on body for touch scrolling).
  useEffect(() => {
    if (!isOpen) return;
    const overlay = overlayRef.current;
    const blockOutside = (e: Event) => {
      if (!scrollRef.current?.contains(e.target as Node)) e.preventDefault();
    };
    overlay?.addEventListener('touchmove', blockOutside, { passive: false });
    overlay?.addEventListener('wheel', blockOutside, { passive: false });
    const html = document.documentElement;
    const prevHtml = html.style.overflow;
    const prevBody = document.body.style.overflow;
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      html.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
      window.removeEventListener('keydown', onKey);
      overlay?.removeEventListener('touchmove', blockOutside);
      overlay?.removeEventListener('wheel', blockOutside);
    };
  }, [isOpen, onClose]);

  const handleSubscribe = async () => {
    if (!user) {
      onClose();
      router.push('/login');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan, userId: user.uid, currency }),
      });

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
        return;
      }
      setError("We couldn't open checkout. Please try again in a moment.");
    } catch (err) {
      console.error('Error:', err);
      setError("We couldn't open checkout. Please check your connection and try again.");
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  const plansLoading = plans.length === 0;
  const chosen = plans.find((p) => p.id === selectedPlan);

  /**
   * Portal + z above `DashboardTopNav` (`z-[60]`) so the overlay is not trapped in a lower stacking context.
   * Phones (and anything short, like a phone turned sideways): bottom sheet. Desktop: centred panel. Header and footer never scroll, so ✕ and Subscribe stay
   * on screen; only the middle scrolls. `dvh` keeps the sheet clear of mobile browser toolbars.
   */
  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 md-tall:items-center md-tall:p-4"
      onClick={onClose}
      role="presentation"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-modal-title"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%', opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0d0d0d] max-h-[92vh] supports-[height:100dvh]:max-h-[92dvh] md-tall:max-w-3xl md-tall:rounded-2xl md-tall:max-h-[90vh] md-tall:supports-[height:100dvh]:max-h-[90dvh]"
      >
        {/* Header: always visible */}
        <div className="relative shrink-0 border-b border-gray-100 px-5 pb-3 pt-2 dark:border-white/5 md-tall:px-6 md-tall:pt-5">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 dark:bg-white/20 md-tall:hidden" />
          <div className="flex justify-center">
            <img
              src={theme === 'light' ? '/logo.svg' : '/logo-dark.svg'}
              alt="Pick'Em Paintball"
              className="h-7 w-auto md-tall:h-8 [@media(max-height:500px)]:hidden"
            />
          </div>
          <h2
            id="subscription-modal-title"
            className="mt-2 text-center text-lg font-black uppercase tracking-tight text-gray-900 dark:text-white md-tall:text-2xl"
          >
            {content.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-900 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <IoMdClose className="text-xl" />
          </button>
        </div>

        {/* Middle: the only part that scrolls */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 [-webkit-overflow-scrolling:touch] md-tall:px-6 md-tall:py-5">
          <div className="mx-auto mb-4 max-w-xl text-center">
            <p className="text-[13px] font-bold text-gray-900 dark:text-white">Built by fans, for fans.</p>
            <p className="mt-1 text-[12px] leading-relaxed text-gray-500 dark:text-white/60">{content.lead}</p>
            {showMore ? (
              MORE_TEXT.map((line) => (
                <p key={line} className="mt-2 text-[12px] leading-relaxed text-gray-500 dark:text-white/60">
                  {line}
                </p>
              ))
            ) : (
              <button
                type="button"
                onClick={() => setShowMore(true)}
                className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-900 dark:text-white/40 dark:hover:text-white"
              >
                Read more
              </button>
            )}
          </div>

          <div role="radiogroup" aria-label="Choose a plan" className="grid grid-cols-1 gap-2 md-tall:grid-cols-3 md-tall:gap-3">
            {plansLoading &&
              [0, 1, 2].map((i) => (
                <div key={i} className="h-[58px] animate-pulse rounded-xl bg-gray-100 dark:bg-white/5 md-tall:h-[180px]" />
              ))}
            {plans.map((plan) => {
              const selected = selectedPlan === plan.id;
              const period = periodLabel(plan);
              const monthly = plan.id === 'yearly' ? perMonth(plan.price) : null;
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`relative rounded-xl border-2 px-4 py-3 text-left transition-colors md-tall:px-5 md-tall:py-5 md-tall:text-center ${
                    selected
                      ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-white/5'
                      : 'border-gray-200 bg-white dark:border-white/10 dark:bg-transparent'
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-2 right-3 rounded-full bg-[#00f976] px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-black md-tall:left-1/2 md-tall:right-auto md-tall:-translate-x-1/2">
                      Most popular
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-3 md-tall:block">
                    <div className="flex items-center gap-3 md-tall:block">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 md-tall:hidden ${
                          selected ? 'border-gray-900 dark:border-white' : 'border-gray-300 dark:border-white/30'
                        }`}
                      >
                        {selected && <span className="h-2 w-2 rounded-full bg-gray-900 dark:bg-white" />}
                      </span>
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-widest text-gray-900 dark:text-white md-tall:mb-2">
                          {shortName(plan.name)}
                        </div>
                        {plan.savings && (
                          <div className="text-[10px] font-bold text-green-500 md-tall:hidden">{plan.savings}</div>
                        )}
                      </div>
                    </div>
                    <div className="whitespace-nowrap text-right md-tall:text-center">
                      <span className="text-xl font-black tabular-nums text-gray-900 dark:text-white md-tall:text-3xl">
                        {plan.price}
                      </span>
                      <span className="text-[11px] text-gray-400 dark:text-white/40">{period}</span>
                      {monthly && (
                        <div className="text-[10px] text-gray-400 dark:text-white/40">{monthly}/month, billed yearly</div>
                      )}
                    </div>
                  </div>
                  {plan.savings && (
                    <div className="mt-1 hidden text-[11px] font-bold text-green-500 md-tall:block">{plan.savings}</div>
                  )}
                  <ul className={`mt-3 space-y-1.5 md-tall:mt-4 md-tall:block ${selected ? 'block' : 'hidden'}`}>
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-gray-600 dark:text-white/70 md-tall:justify-center">
                        <FaCheck className="mt-0.5 shrink-0 text-[10px] text-green-500" />
                        <span dangerouslySetInnerHTML={{ __html: featureText(feature) }} />
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer: always visible */}
        <div className="shrink-0 border-t border-gray-100 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/5 md-tall:px-6 md-tall:pb-5 md-tall:pt-4">
          {error && (
            <p role="alert" className="mb-2 text-center text-[11px] font-bold text-red-400">
              {error}
            </p>
          )}
          <div className="mx-auto flex max-w-xl flex-col gap-2">
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={loading || plansLoading}
              className="w-full rounded-lg bg-[#00f976] px-6 py-3 text-xs font-black uppercase tracking-widest text-black hover:opacity-90 disabled:opacity-50"
            >
              {loading
                ? 'Opening checkout…'
                : !user
                  ? 'Log in to subscribe'
                  : chosen
                    ? `Subscribe · ${chosen.price}${periodLabel(chosen)}`
                    : 'Subscribe now'}
            </button>
            <p className="text-center text-[9px] uppercase tracking-widest text-gray-400 dark:text-white/30">
              Cancel anytime · Secure checkout with Stripe
            </p>
            <button
              type="button"
              onClick={() => {
                onContinueFree?.();
                onClose();
              }}
              className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-gray-900 dark:text-white/50 dark:hover:text-white"
            >
              {content.continueButtonText}
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
