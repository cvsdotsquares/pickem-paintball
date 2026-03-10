"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './authProvider';
import { db } from '@/src/lib/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';

interface SubscriptionContextType {
  isSubscribed: boolean;
  subscriptionTier: 'monthly' | 'quarterly' | 'yearly' | null;
  loading: boolean;
  showModal: (type: 'passive' | 'soft-gate' | 'hard-gate') => void;
  hideModal: () => void;
  modalType: 'passive' | 'soft-gate' | 'hard-gate' | null;
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
  const [modalType, setModalType] = useState<'passive' | 'soft-gate' | 'hard-gate' | null>(null);

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

  const showModal = (type: 'passive' | 'soft-gate' | 'hard-gate') => {
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
        refreshSubscription
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};
