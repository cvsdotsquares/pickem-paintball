"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './authProvider';
import { db } from '@/src/lib/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';

export type SubscriptionModalType = 'passive' | 'soft-gate' | 'hard-gate';
/** What the person was trying to do when the pop-up opened; it picks the headline and leads the benefits list. */
export type SubscribeReason = 'general' | 'career' | 'share' | 'leagues' | 'badges' | 'picks';

interface SubscriptionContextType {
  isSubscribed: boolean;
  subscriptionTier: 'monthly' | 'quarterly' | 'yearly' | null;
  loading: boolean;
  showModal: (type: SubscriptionModalType, reason?: SubscribeReason) => void;
  hideModal: () => void;
  modalType: SubscriptionModalType | null;
  modalReason: SubscribeReason;
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
};

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<'monthly' | 'quarterly' | 'yearly' | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState<SubscriptionModalType | null>(null);
  const [modalReason, setModalReason] = useState<SubscribeReason>('general');

  const refreshSubscription = async () => {
    if (!user) {
      setIsSubscribed(false);
      setSubscriptionTier(null);
      setLoading(false);
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setIsSubscribed(userData.isSubscribed || false);
        setSubscriptionTier(userData.subscriptionTier || null);
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSubscription();
  }, [user]);

  const showModal = (type: SubscriptionModalType, reason: SubscribeReason = 'general') => {
    setModalReason(reason);
    setModalType(type);
  };

  const hideModal = () => {
    setModalType(null);
  };

  return (
    <SubscriptionContext.Provider
      value={{
        isSubscribed,
        subscriptionTier,
        loading,
        showModal,
        hideModal,
        modalType,
        modalReason,
        refreshSubscription
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};
