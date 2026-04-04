"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { auth, db } from "@/src/lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/src/contexts/authProvider";
import DashboardTopNav from "@/src/components/Layout/DashboardTopNav";
import {
  resolveProfilePictureToUrl,
  subscribeProfileImagesRefresh,
} from "@/src/lib/resolveProfilePictureUrl";

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
  const [profileImageRefreshEpoch, setProfileImageRefreshEpoch] = useState(0);

  useEffect(() => {
    return subscribeProfileImagesRefresh(() => {
      userDataCache.clear();
      setProfileImageRefreshEpoch((n) => n + 1);
    });
  }, []);

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
        const resolved = await resolveProfilePictureToUrl(
          rawData?.profilePicture ?? null,
          { userId: currentUserId },
        );
        if (resolved) {
          profilePicture = resolved;
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
  }, [user?.uid, profileImageRefreshEpoch]);

  // Memoize the computed values to prevent unnecessary re-renders
  const displayName = useMemo(() => getDisplayName(userData), [userData, getDisplayName]);
  const avatarUrl = useMemo(() => userData?.profilePicture, [userData?.profilePicture]);
  const userCountry = useMemo(() => userData?.country, [userData?.country]);

  return (
    <div className="relative z-[60] w-full">
      <DashboardTopNav
        username={displayName}
        avatarUrl={avatarUrl}
        points={userCountry}
      />
    </div>
  );
};

export default PageHeader;
