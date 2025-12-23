"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { auth, db, storage } from "@/src/lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";
import { getDownloadURL, ref, StorageReference } from "firebase/storage";
import { useAuth } from "@/src/contexts/authProvider";
import UserHead from "./head";
import { getFirebaseStorageUrl } from "@/src/lib/storage";

// Cache for user data to prevent refetching
const userDataCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const PageHeader: React.FC = () => {
  interface UserData {
    name: string;
    firstName: string;
    profilePicture: string;
    isPro: boolean;
    badges: string[];
    country: string;
    lastName: string;
    username: string;
  }

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

  const { user } = useAuth();

  // Initialize state from cache if available
  const [userData, setUserData] = useState<UserData | null>(() => {
    if (user?.uid) {
      const cached = userDataCache.get(user.uid);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(true);

  const getDisplayName = useCallback((userData: UserData | null): string => {
    if (!userData) return "Guest";
    const firstName = userData.firstName?.trim() || "";
    const lastName = userData.lastName?.trim() || "";
    const name = userData.name?.trim() || "";
    if (name) {
      return name;
    }
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
    if (firstName) {
      return firstName;
    }

    if (lastName) {
      return lastName;
    }

    if (userData.username?.trim()) {
      return userData.username;
    }

    return userData.name || "Guest";
  }, []);

  useEffect(() => {
    async function fetchUserData() {
      try {
        if (!user) {
          setUserData(defaultUserData);
          setLoading(false);
          return;
        }

        const currentUserId = user.uid;

        // Check cache first
        const cached = userDataCache.get(currentUserId);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
          setUserData(cached.data);
          setLoading(false);
          return;
        }

        const userDocRef = doc(db, "users", currentUserId);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
          setUserData(defaultUserData);
          setLoading(false);
          return;
        }

        const rawData = userDoc.data();
        let profilePicture = defaultUserData.profilePicture;
        
        if (rawData?.profilePicture) {
          profilePicture = getFirebaseStorageUrl(rawData.profilePicture);
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

        // Cache the data
        userDataCache.set(currentUserId, {
          data: validatedUserData,
          timestamp: Date.now(),
        });

        setUserData(validatedUserData);
      } catch (error) {
        console.error("Error fetching user data:", error);
        setUserData(defaultUserData);
      } finally {
        setLoading(false);
      }
    }

    fetchUserData();
  }, [user?.uid]); // Only depend on user.uid, not the entire user object

  // Memoize the computed values to prevent unnecessary re-renders
  const displayName = useMemo(() => getDisplayName(userData), [userData, getDisplayName]);
  const avatarUrl = useMemo(() => userData?.profilePicture, [userData?.profilePicture]);
  const userCountry = useMemo(() => userData?.country, [userData?.country]);

  return (
    <div className="relative inset-y-0 top-0 left-0 right-0 z-30 w-full h-[48px]">
      <UserHead
        username={displayName}
        avatarUrl={avatarUrl}
        points={userCountry}
      />
      <div className="bg-white relative top-0 z-50 w-full -scale-y-50 h-[0.1px]" />
    </div>
  );
};

export default PageHeader;
