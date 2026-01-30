"use client";

import { useEffect, useState } from 'react';
import { useSubscription } from '@/src/contexts/SubscriptionContext';
import SubscriptionModal from './SubscriptionModal';

export default function SubscriptionModalManager() {
  const { modalType, hideModal } = useSubscription();
  const [localModalType, setLocalModalType] = useState<'passive' | 'soft-gate' | 'hard-gate' | null>(null);

  useEffect(() => {
    const handleShowModal = (e: CustomEvent) => {
      setLocalModalType(e.detail.type);
    };

    window.addEventListener('show-subscription-modal' as any, handleShowModal);
    return () => window.removeEventListener('show-subscription-modal' as any, handleShowModal);
  }, []);

  const currentModalType = modalType || localModalType;

  return (
    <>
      {currentModalType && (
        <SubscriptionModal
          isOpen={true}
          onClose={() => {
            hideModal();
            setLocalModalType(null);
          }}
          type={currentModalType}
        />
      )}
    </>
  );
}
