"use client";

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FaCheck } from 'react-icons/fa';
import { useSubscription } from '@/src/contexts/SubscriptionContext';
import { CHECKOUT_VIEW_KEY } from './SubscriptionModal';

/** How long to wait for the Stripe webhook to mark the account subscribed before saying so plainly. */
const WAIT_MS = 60 * 1000;
const POLL_MS = 2000;

/**
 * Stripe sends buyers back to `/dashboard?subscription=success|cancelled`.
 *
 * success: thank them straight away, then keep re-reading their subscription until the webhook has
 * landed, so nothing they just paid for is still blurred behind a "Subscribe" prompt.
 * cancelled: no message (they chose to leave); just file `checkout_cancelled` in the funnel.
 */
export default function CheckoutReturn() {
  const { isSubscribed, refreshSubscription } = useSubscription();
  const [state, setState] = useState<'hidden' | 'waiting' | 'unlocked' | 'slow'>('hidden');
  const startedAt = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('subscription');
    if (result !== 'success' && result !== 'cancelled') return;

    // Tidy the address bar so a refresh or a shared link doesn't replay this.
    params.delete('subscription');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);

    let view: { viewId: string; type: string; reason: string } | null = null;
    try {
      const raw = sessionStorage.getItem(CHECKOUT_VIEW_KEY);
      if (raw) view = JSON.parse(raw);
      sessionStorage.removeItem(CHECKOUT_VIEW_KEY);
    } catch {
      // Storage blocked: the funnel just misses this row.
    }

    if (result === 'cancelled') {
      if (view) {
        void fetch('/api/subscription/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({ step: 'checkout_cancelled', ...view, path: window.location.pathname }),
        }).catch(() => {});
      }
      return;
    }

    startedAt.current = Date.now();
    setState('waiting');
  }, []);

  // Poll until the webhook has flipped the account, or give up politely after a minute.
  useEffect(() => {
    if (state !== 'waiting') return;
    if (isSubscribed) {
      setState('unlocked');
      return;
    }
    const timer = setTimeout(() => {
      if (Date.now() - startedAt.current > WAIT_MS) setState('slow');
      else void refreshSubscription();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [state, isSubscribed, refreshSubscription]);

  // A late webhook still turns "slow" into "unlocked" if they leave the message open.
  useEffect(() => {
    if (state === 'slow' && isSubscribed) setState('unlocked');
  }, [state, isSubscribed]);

  if (state === 'hidden') return null;

  const close = () => setState('hidden');

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 md-tall:items-center md-tall:p-4"
      onClick={close}
      role="presentation"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-return-title"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%', opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full max-w-lg rounded-t-2xl border border-gray-200 bg-white px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center shadow-2xl dark:border-white/10 dark:bg-[#0d0d0d] md-tall:rounded-2xl md-tall:pb-6"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#00f976]">
          {state === 'waiting' ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
          ) : (
            <FaCheck className="text-lg text-black" />
          )}
        </div>
        <h2
          id="checkout-return-title"
          className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white"
        >
          Thank you for subscribing
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-snug text-gray-600 dark:text-white/70">
          {state === 'waiting' && 'Unlocking your account…'}
          {state === 'unlocked' && 'Everything is unlocked: advanced stats, custom leagues, badges and career cards.'}
          {state === 'slow' &&
            "Your payment went through. Your account is taking a little longer than usual to update; refresh the page in a minute and everything will be unlocked."}
        </p>
        <div className="mx-auto mt-5 flex max-w-sm flex-col gap-2">
          {state === 'unlocked' && (
            <Link
              href="/dashboard/stats/all-time"
              onClick={close}
              className="w-full rounded-lg bg-[#00f976] px-6 py-3.5 text-[13px] font-black uppercase tracking-widest text-black hover:opacity-90"
            >
              Explore career stats
            </Link>
          )}
          <button
            type="button"
            onClick={close}
            className="w-full py-2 text-[12px] font-bold uppercase tracking-wider text-gray-500 hover:text-gray-900 dark:text-white/50 dark:hover:text-white"
          >
            {state === 'unlocked' ? 'Done' : 'Close'}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
