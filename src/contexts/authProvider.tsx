// src/context/AuthContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode, useMemo, useRef } from "react";

import {
  onAuthStateChanged,
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  sendEmailVerification,
  updateProfile,
} from "firebase/auth";
import { auth, db, storage } from "../lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";
import { getDownloadURL, ref, StorageReference } from "firebase/storage";

export interface UserData {
  name: string;
  firstName: string;
  profilePicture: string;
  isPro: boolean;
  badges: string[];
  country: string;
  lastName: string;
  username: string;
}

interface AuthContextType {
  user: User | null;
  userId: string | null;
  userData: UserData | null;
  refreshUserData: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
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
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const userDataCacheRef = useRef<Map<string, UserData>>(new Map());
  const authInitializedRef = useRef<boolean>(false);

  const defaultUserData: UserData = {
    name: "Guest",
    firstName: "",
    lastName: "",
    profilePicture:
      "https://cdn-icons-png.freepik.com/256/14024/14024658.png?semt=ais_hybrid",
    isPro: false,
    badges: [],
    country: "",
    username: "",
  };

  const fetchUserData = async (currentUserId: string): Promise<UserData> => {
    // Check cache first
    const cached = userDataCacheRef.current.get(currentUserId);
    if (cached) {
      return cached;
    }

    try {
      const userDocRef = doc(db, "users", currentUserId);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        return defaultUserData;
      }

      const rawData = userDoc.data();
      let profilePicture = defaultUserData.profilePicture;

      if (currentUserId) {
        const storagePath = `user/${currentUserId}/profile_200x200`;
        try {
          const storageRef: StorageReference = ref(storage, storagePath);
          profilePicture = await getDownloadURL(storageRef);
        } catch (error: unknown) {
          // Profile picture not found in Storage - fall back to default
          // This is expected for new users who haven't uploaded a profile picture yet
          if (error instanceof Error) {
            console.debug("Profile picture not found, using default:", error.message);
          }
          profilePicture = defaultUserData.profilePicture;
        }
      }

      const validatedUserData: UserData = {
        name: rawData?.name?.trim() || defaultUserData.name,
        username: rawData?.username?.trim() || "",
        profilePicture,
        isPro: rawData?.isPro ?? defaultUserData.isPro,
        badges: Array.isArray(rawData?.badges)
          ? rawData.badges
          : defaultUserData.badges,
        country: rawData?.country?.trim() || "",
        firstName: rawData?.firstName?.trim() || "",
        lastName: rawData?.lastName?.trim() || "",
      };

      // Cache the result
      userDataCacheRef.current.set(currentUserId, validatedUserData);
      return validatedUserData;
    } catch (error) {
      console.error("Error fetching user data:", error);
      return defaultUserData;
    }
  };

  const refreshUserData = async () => {
    if (user?.uid) {
      const data = await fetchUserData(user.uid);
      setUserData(data);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Only fetch user data once, when auth state is first established
      if (authInitializedRef.current) {
        // On subsequent auth state changes (login/logout), update user state
        setUser(currentUser);
        setUserId(currentUser ? currentUser.uid : null);

        if (currentUser) {
          // Clear cache and fetch fresh data on explicit login
          userDataCacheRef.current.clear();
          const data = await fetchUserData(currentUser.uid);
          setUserData(data);
        } else {
          setUserData(null);
          userDataCacheRef.current.clear();
        }
      } else {
        // Initial auth state check
        authInitializedRef.current = true;
        setUser(currentUser);
        setUserId(currentUser ? currentUser.uid : null);

        if (currentUser) {
          const data = await fetchUserData(currentUser.uid);
          setUserData(data);
        } else {
          setUserData(null);
        }

        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Modified loginWithEmail to handle email verification
  const loginWithEmail = async (email: string, password: string) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (!user.emailVerified) {
      await signOut(auth); // Sign out unverified user
      throw new Error("Please verify your email before logging in.");
    }
    // After sign-in, ensure displayName is populated from Firestore firstname/lastname
    //const user = result.user;
    console.log("Google Sign-In User:", user); // Debugging line
    try {
      if (user && (!user.displayName || user.displayName.trim() === "")) {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        console.log("email Sign-In User Document:", userDoc); // Debugging line
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
    console.log("Google Sign-In User:", user); // Debugging line
    try {
      if (user && (!user.displayName || user.displayName.trim() === "")) {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        console.log("Sign-In User Document:", userDoc); // Debugging line
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
  };

  const logout = async () => {
    await signOut(auth);
  };

  const value: AuthContextType = useMemo(() => ({
    user,
    userId,
    userData,
    refreshUserData,
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    logout,
  }), [user, userId, userData]);

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};