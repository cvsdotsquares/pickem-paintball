"use client";

import { useEffect, useState } from 'react';
import { useSubscription, type SubscriptionModalType, type SubscribeReason } from '@/src/contexts/SubscriptionContext';
import { useAuth } from '@/src/contexts/authProvider';
import SubscriptionModal, { RESUME_KEY } from './SubscriptionModal';

/** How long a "log in to subscribe" tap is remembered: long enough to sign up, short enough not to ambush later. */
const RESUME_MAX_AGE_MS = 30 * 60 * 1000;

export default function SubscriptionModalManager() {
  const { modalType, modalReason, hideModal, showModal, isSubscribed, loading } = useSubscription();
  const { user } = useAuth();
  const [local, setLocal] = useState<{ type: SubscriptionModalType; reason: SubscribeReason } | null>(null);

  useEffect(() => {
    const handleShowModal = (e: CustomEvent) => {
      setLocal({ type: e.detail.type, reason: e.detail.reason ?? 'general' });
    };

    window.addEventListener('show-subscription-modal' as any, handleShowModal);
    return () => window.removeEventListener('show-subscription-modal' as any, handleShowModal);
  }, []);

  // An email's "Support Pick'Em" button lands on ?subscribe=monthly: queue the offer like a "Log in to subscribe" tap, so
  // the effect below shows it now, or straight after login if they were signed out. The query is then removed from the URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('subscribe')) return;
    try {
      sessionStorage.setItem(RESUME_KEY, JSON.stringify({ type: 'passive', reason: 'email', at: Date.now() }));
    } catch {
      /* no storage: they can still subscribe from the menu */
    }
    url.searchParams.delete('subscribe');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, []);

  // Someone tapped "Log in to subscribe": once they're back and logged in, put the offer they chose in front of them again.
  useEffect(() => {
    if (!user || loading) return;
    let saved: { type: SubscriptionModalType; reason: SubscribeReason; at: number } | null = null;
    try {
      const raw = sessionStorage.getItem(RESUME_KEY);
      if (raw) saved = JSON.parse(raw);
      sessionStorage.removeItem(RESUME_KEY);
    } catch {
      return;
    }
    if (saved && !isSubscribed && Date.now() - saved.at < RESUME_MAX_AGE_MS) {
      showModal(saved.type, saved.reason);
    }
  }, [user, loading, isSubscribed, showModal]);

  const current = modalType ? { type: modalType, reason: modalReason } : local;

  return (
    <>
      {current && (
        <SubscriptionModal
          isOpen={true}
          onClose={() => {
            hideModal();
            setLocal(null);
          }}
          type={current.type}
          reason={current.reason}
        />
      )}
    </>
  );
}
