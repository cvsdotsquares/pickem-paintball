"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { IoMdClose } from 'react-icons/io';
import { FaCheck, FaChevronDown } from 'react-icons/fa';
import { useAuth } from '../../contexts/authProvider';
import { useTheme } from '@/src/contexts/ThemeContext';
import type { SubscriptionModalType, SubscribeReason } from '@/src/contexts/SubscriptionContext';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: SubscriptionModalType;
  /** What the person was trying to do; picks the headline and which benefit leads. */
  reason?: SubscribeReason;
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

/** sessionStorage key: a logged-out "Log in to subscribe" tap, replayed by SubscriptionModalManager after login. */
export const RESUME_KEY = 'pickem_resume_subscribe';

type BenefitId = 'career' | 'leagues' | 'badges' | 'share' | 'early';
type DismissHow = 'continue' | 'close' | 'backdrop' | 'escape';

/** What a subscription gets you, in one place. The benefit matching the reason moves to the top and is highlighted. */
const BENEFITS: { id: BenefitId; text: string }[] = [
  { id: 'career', text: 'Unlock advanced stats' },
  { id: 'leagues', text: 'Create and join custom leagues' },
  { id: 'badges', text: 'Display your badges' },
  { id: 'share', text: 'Share career cards' },
  { id: 'early', text: 'Early access to new features' },
];

/** Value first: the headline says what they get, matched to what they just tried to do. */
const REASON_CONTENT: Record<SubscribeReason, { title: string; lead: string; benefit?: BenefitId }> = {
  general: {
    title: "Get more from Pick'Em",
    lead: "Advanced stats, custom leagues and badges, and you keep Pick'Em growing.",
  },
  career: {
    title: 'Unlock career stats',
    lead: 'Every match, point and season for every pro player.',
    benefit: 'career',
  },
  share: {
    title: 'Share career cards',
    lead: "Share any player's career with your team and your group chats.",
    benefit: 'share',
  },
  leagues: {
    title: 'Play in custom leagues',
    lead: 'Start a league for your team or friends, or join one with an invite code.',
    benefit: 'leagues',
  },
  badges: {
    title: 'Show off your badges',
    lead: 'The badges you have won appear next to your name on every leaderboard.',
    benefit: 'badges',
  },
  picks: {
    title: 'Picks saved. Want more?',
    lead: 'Subscribers get advanced stats, custom leagues and badges on the leaderboard.',
  },
};

/** Shown once "Read more" is tapped, so the first screen stays short on phones. */
const FANS_TEXT = [
  'The core game and basic stats will always be free. Our goal is to develop paintball stats and build a site for the fans.',
  'Even if you choose not to subscribe, just playing, sharing, and being part of the community means a huge amount to us. Thank you!',
];

const CONTINUE_TEXT: Record<SubscriptionModalType, string> = {
  passive: 'Not today',
  'soft-gate': 'Continue for free',
  'hard-gate': 'Maybe later',
};

const CURRENCY_SYMBOLS: Record<string, string> = { usd: '$', gbp: '£', eur: '€' };

/** Used only if the plans API can't be reached; the API sends the real figure (utils/eventMonths). */
const DEFAULT_EVENT_MONTHS = 5;

function regionFromTimezone(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timezone.includes('Europe/London')) return 'UK';
  if (timezone.includes('Europe/')) return 'EU';
  return '';
}

/** "£49.99" → { symbol: "£", amount: 49.99 } */
function splitPrice(price: string): { symbol: string; amount: number } {
  return { symbol: price.replace(/[0-9.,\s]/g, ''), amount: parseFloat(price.replace(/[^0-9.]/g, '')) || 0 };
}

const money = (symbol: string, amount: number) => `${symbol}${amount.toFixed(2)}`;

/** The Event plan is Stripe's "quarterly" price: billed monthly, paused outside event months. */
const isEventPlan = (plan: Plan) => plan.id === 'quarterly';

function periodLabel(plan: Plan): string {
  return isEventPlan(plan) ? '/event month' : plan.period;
}

/** One line under each price, so every plan can be compared over a year (the savings badges use the same yardstick). */
function yearLine(plan: Plan, eventMonths: number): string | null {
  const { symbol, amount } = splitPrice(plan.price);
  if (!amount) return null;
  if (isEventPlan(plan)) return `${money(symbol, amount * eventMonths)} a year · billed only in the ${eventMonths} event months`;
  if (plan.id === 'monthly') return `${money(symbol, amount * 12)} a year`;
  if (plan.id === 'yearly') return `${money(symbol, amount / 12)}/month, billed yearly`;
  return null;
}

/** Stripe product names are "Monthly Subscription" etc.; the card already says what it is. */
function shortName(name: string): string {
  return name.replace(/\s+Subscription$/i, '');
}

function newViewId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export default function SubscriptionModal({ isOpen, onClose, type, reason = 'general', onContinueFree }: SubscriptionModalProps) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState('monthly'); // Default to monthly (most popular)
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currency, setCurrency] = useState('usd');
  const [eventMonths, setEventMonths] = useState(DEFAULT_EVENT_MONTHS);
  const [showMore, setShowMore] = useState(false);
  const [moreBelow, setMoreBelow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewId] = useState(newViewId);
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fansRef = useRef<HTMLDivElement>(null);
  const content = REASON_CONTENT[reason];
  const benefits = content.benefit
    ? [...BENEFITS.filter((b) => b.id === content.benefit), ...BENEFITS.filter((b) => b.id !== content.benefit)]
    : BENEFITS;

  /** One row in the subscribe funnel (see /api/subscription/track). Fire-and-forget; `keepalive` survives the checkout redirect. */
  const track = useCallback(
    (step: string, extra: Record<string, string | undefined> = {}) => {
      try {
        void fetch('/api/subscription/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            step,
            type,
            reason,
            viewId,
            uid: user?.uid,
            path: window.location.pathname,
            ...extra,
          }),
        }).catch(() => {});
      } catch {
        // Reporting never gets in the way of subscribing.
      }
    },
    [type, reason, viewId, user?.uid],
  );

  const dismiss = useCallback(
    (how: DismissHow) => {
      track('dismissed', { how });
      onClose();
    },
    [track, onClose],
  );

  useEffect(() => {
    if (isOpen) track('opened');
    // Once per showing; viewId is fixed for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    async function fetchPlans() {
      const region = regionFromTimezone();
      try {
        const response = await fetch(`/api/subscription/plans${region ? `?region=${region}` : ''}`);
        const data = await response.json();
        setPlans(data.plans || []);
        if (data.currency) setCurrency(data.currency);
        if (typeof data.eventMonthsPerYear === 'number') setEventMonths(data.eventMonthsPerYear);
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
            features: [],
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
      if (e.key === 'Escape') dismiss('escape');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      html.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
      window.removeEventListener('keydown', onKey);
      overlay?.removeEventListener('touchmove', blockOutside);
      overlay?.removeEventListener('wheel', blockOutside);
    };
  }, [isOpen, dismiss]);

  // "More below" cue: shown whenever the middle has content past the bottom edge.
  const updateMoreBelow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, []);

  useEffect(() => {
    updateMoreBelow();
    window.addEventListener('resize', updateMoreBelow);
    return () => window.removeEventListener('resize', updateMoreBelow);
  }, [updateMoreBelow, plans, showMore]);

  // Opening "Read more" adds text below the fold: bring it up into view rather than leave it hidden.
  useEffect(() => {
    if (showMore) fansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [showMore]);

  const handleSubscribe = async () => {
    if (!user) {
      track('login_redirect', { plan: selectedPlan });
      try {
        sessionStorage.setItem(RESUME_KEY, JSON.stringify({ type, reason, at: Date.now() }));
      } catch {
        // Private mode: they just land on the dashboard after login.
      }
      onClose();
      router.push('/login');
      return;
    }

    setLoading(true);
    setError(null);
    track('checkout_started', { plan: selectedPlan, currency });
    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan, userId: user.uid, currency, reason, viewId }),
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
    track('checkout_failed', { plan: selectedPlan, currency });
    setLoading(false);
  };

  if (!isOpen) return null;

  const plansLoading = plans.length === 0;
  const chosen = plans.find((p) => p.id === selectedPlan);

  /**
   * Portal + z above `DashboardTopNav` (`z-[60]`) so the overlay is not trapped in a lower stacking context.
   * Phones (and anything short, like a phone turned sideways): bottom sheet. Desktop: centred panel. Header and
   * footer never scroll, so ✕ and Subscribe stay on screen; only the middle scrolls. `dvh` keeps the sheet clear
   * of mobile browser toolbars.
   *
   * Text is 11px at the smallest (Apple's minimum for legible text); there are no inputs, so iOS never zooms.
   */
  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 md-tall:items-center md-tall:p-4"
      onClick={() => dismiss('backdrop')}
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
            className="mt-2 text-center text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white md-tall:text-2xl"
          >
            {content.title}
          </h2>
          <button
            type="button"
            onClick={() => dismiss('close')}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-900 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <IoMdClose className="text-xl" />
          </button>
        </div>

        {/* Middle: the only part that scrolls */}
        <div
          ref={scrollRef}
          onScroll={updateMoreBelow}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 [-webkit-overflow-scrolling:touch] md-tall:px-6 md-tall:pt-5"
        >
          <p className="mx-auto mb-3 max-w-xl text-center text-[14px] leading-snug text-gray-600 dark:text-white/70">
            {content.lead}
          </p>

          <ul className="mx-auto mb-4 grid max-w-xl gap-1.5 md-tall:grid-cols-2 md-tall:gap-x-6">
            {benefits.map((b, i) => {
              const lead = !!content.benefit && i === 0;
              return (
                <li
                  key={b.id}
                  className={`flex items-center gap-2 text-[13px] ${
                    lead ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-white/75'
                  }`}
                >
                  <FaCheck className="shrink-0 text-[11px] text-green-500" />
                  {b.text}
                </li>
              );
            })}
          </ul>

          <div role="radiogroup" aria-label="Choose a plan" className="grid grid-cols-1 gap-2 md-tall:grid-cols-3 md-tall:gap-3">
            {plansLoading &&
              [0, 1, 2].map((i) => (
                <div key={i} className="h-[64px] animate-pulse rounded-xl bg-gray-100 dark:bg-white/5 md-tall:h-[150px]" />
              ))}
            {plans.map((plan) => {
              const selected = selectedPlan === plan.id;
              const line = yearLine(plan, eventMonths);
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  key={plan.id}
                  onClick={() => {
                    if (!selected) track('plan_selected', { plan: plan.id });
                    setSelectedPlan(plan.id);
                  }}
                  className={`relative rounded-xl border-2 px-4 py-3 text-left transition-colors md-tall:px-5 md-tall:py-5 md-tall:text-center ${
                    selected
                      ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-white/5'
                      : 'border-gray-200 bg-white dark:border-white/10 dark:bg-transparent'
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-2.5 right-3 rounded-full bg-[#00f976] px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-black md-tall:left-1/2 md-tall:right-auto md-tall:-translate-x-1/2">
                      Most popular
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-3 md-tall:block">
                    <div className="flex items-center gap-3 md-tall:block">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 md-tall:hidden ${
                          selected ? 'border-gray-900 dark:border-white' : 'border-gray-300 dark:border-white/30'
                        }`}
                      >
                        {selected && <span className="h-2.5 w-2.5 rounded-full bg-gray-900 dark:bg-white" />}
                      </span>
                      <div>
                        <div className="text-[12px] font-black uppercase tracking-widest text-gray-900 dark:text-white md-tall:mb-2">
                          {shortName(plan.name)}
                        </div>
                        {plan.savings && (
                          <div className="text-[11px] font-bold text-green-600 dark:text-green-400 md-tall:hidden">{plan.savings}</div>
                        )}
                      </div>
                    </div>
                    <div className="whitespace-nowrap text-right md-tall:text-center">
                      <span className="text-xl font-black tabular-nums text-gray-900 dark:text-white md-tall:text-3xl">
                        {plan.price}
                      </span>
                      <span className="text-[12px] text-gray-500 dark:text-white/50">{periodLabel(plan)}</span>
                    </div>
                  </div>
                  {plan.savings && (
                    <div className="mt-1 hidden text-[12px] font-bold text-green-600 dark:text-green-400 md-tall:block">{plan.savings}</div>
                  )}
                  {line && (
                    <div className="mt-1 pl-8 text-[11px] text-gray-500 dark:text-white/50 md-tall:mt-2 md-tall:pl-0">{line}</div>
                  )}
                </button>
              );
            })}
          </div>

          <div ref={fansRef} className="mx-auto max-w-xl pb-4 pt-4 text-center text-[12px] leading-relaxed text-gray-500 dark:text-white/50">
            <span className="font-bold text-gray-700 dark:text-white/70">Built by fans, for fans.</span>{' '}
            {showMore ? (
              FANS_TEXT.map((text) => (
                <p key={text} className="mt-1">
                  {text}
                </p>
              ))
            ) : (
              <button
                type="button"
                onClick={() => {
                  track('read_more');
                  setShowMore(true);
                }}
                className="text-[11px] font-bold uppercase tracking-wider underline-offset-2 hover:text-gray-900 hover:underline dark:hover:text-white"
              >
                Read more
              </button>
            )}
          </div>

          {/* Cue that there is more below: a fade plus a tap target that scrolls down. */}
          {moreBelow && (
            <div className="pointer-events-none sticky bottom-0 -mx-5 -mt-10 flex h-10 items-end justify-center bg-gradient-to-t from-white to-transparent pb-1 dark:from-[#0d0d0d] md-tall:-mx-6">
              <button
                type="button"
                aria-label="Scroll for more"
                onClick={() => scrollRef.current?.scrollBy({ top: scrollRef.current.clientHeight * 0.6, behavior: 'smooth' })}
                className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-gray-900/80 text-white shadow dark:bg-white/80 dark:text-black"
              >
                <FaChevronDown className="text-[11px]" />
              </button>
            </div>
          )}
        </div>

        {/* Footer: always visible */}
        <div className="shrink-0 border-t border-gray-100 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/5 md-tall:px-6 md-tall:pb-5 md-tall:pt-4">
          {error && (
            <p role="alert" className="mb-2 text-center text-[12px] font-bold text-red-500">
              {error}
            </p>
          )}
          <div className="mx-auto flex max-w-xl flex-col gap-2">
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={loading || plansLoading}
              className="w-full rounded-lg bg-[#00f976] px-6 py-3.5 text-[13px] font-black uppercase tracking-widest text-black hover:opacity-90 disabled:opacity-50"
            >
              {loading
                ? 'Opening checkout…'
                : !user
                  ? 'Log in to subscribe'
                  : chosen
                    ? `Subscribe · ${chosen.price}${periodLabel(chosen)}`
                    : 'Subscribe now'}
            </button>
            <p className="text-center text-[11px] text-gray-500 dark:text-white/40">
              Cancel anytime · Secure checkout with Stripe
            </p>
            <button
              type="button"
              onClick={() => {
                onContinueFree?.();
                dismiss('continue');
              }}
              className="w-full py-2 text-[12px] font-bold uppercase tracking-wider text-gray-500 hover:text-gray-900 dark:text-white/50 dark:hover:text-white"
            >
              {CONTINUE_TEXT[type]}
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
