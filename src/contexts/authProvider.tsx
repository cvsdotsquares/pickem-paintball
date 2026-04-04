// src/context/AuthContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

import {
  onAuthStateChanged,
  User,
  UserCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  sendEmailVerification,
  updateProfile,
} from "firebase/auth";
import { auth, db } from "../lib/firebaseClient";
import { devAllowUnverifiedLogin } from "../lib/firebasePublicEnv";
import { doc, getDoc } from "firebase/firestore";

interface AuthContextType {
  user: User | null;
  userId: string | null;
  /** True until Firebase `onAuthStateChanged` has fired at least once. */
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<UserCredential>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setUserId(currentUser ? currentUser.uid : null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Modified loginWithEmail to handle email verification
  const loginWithEmail = async (email: string, password: string) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (!user.emailVerified && !devAllowUnverifiedLogin()) {
      await signOut(auth); // Sign out unverified user
      throw new Error("Please verify your email before logging in.");
    }
    // After sign-in, ensure displayName is populated from Firestore firstname/lastname
    //const user = result.user;
   
    try {
      if (user && (!user.displayName || user.displayName.trim() === "")) {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
       
        if (userDoc.exists()) {
          const raw = userDoc.data();
          const fn = typeof raw?.firstName === "string" ? raw.firstName.trim() : "";
          const ln = typeof raw?.lastName === "string" ? raw.lastName.trim() : "";
          if (fn || ln) {
            const displayName = `${fn} ${ln}`.trim();
            await updateProfile(user, { displayName });
          }
        }
      }
    } catch (err) {
      console.error("Error syncing displayName from Firestore:", err);
    }
    // User is verified, setUser will be called by onAuthStateChanged
  };

  // Modified registerWithEmail to send verification email and sign out
  const registerWithEmail = async (email: string, password: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(userCredential.user); // Send verification email
    await signOut(auth); // Sign out user after registration
    // Handle any UI feedback outside this function
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    // Google users are considered verified

    // After sign-in, ensure displayName is populated from Firestore firstname/lastname
    const user = result.user;

    try {
      if (user && (!user.displayName || user.displayName.trim() === "")) {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
       
        if (userDoc.exists()) {
          const raw = userDoc.data();
          const fn = typeof raw?.firstName === "string" ? raw.firstName.trim() : "";
          const ln = typeof raw?.lastName === "string" ? raw.lastName.trim() : "";
          if (fn || ln) {
            const displayName = `${fn} ${ln}`.trim();
            await updateProfile(user, { displayName });
          }
        }
      }
    } catch (err) {
      console.error("Error syncing displayName from Firestore:", err);
    }
    return result;
  };

  const logout = async () => {
    await signOut(auth);
  };

  const value: AuthContextType = {
    user,
    userId,
    loading,
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};