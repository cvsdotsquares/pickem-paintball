"use client";

import React, { useEffect, useState } from "react";
import { auth, db, storage } from "@/src/lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";
import { getDownloadURL, ref, StorageReference } from "firebase/storage";
import { useAuth } from "@/src/contexts/authProvider";
import UserHead from "./head";

const PageHeader: React.FC = () => {
  interface UserData {
    name: string;
    firstname: string;
    profilePicture: string;
    isPro: boolean;
    badges: string[];
    country: string;
    lastname: string;
    username: string;
  }

  const defaultUserData: UserData = {
    name: "Guest",
    firstname: "",
    lastname: "",
    profilePicture:
      "https://cdn-icons-png.freepik.com/256/14024/14024658.png?semt=ais_hybrid",
    isPro: false,
    badges: [],
    country: "",
    username: "",
  };

  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { user } = useAuth();

  function getDisplayName(userData: UserData | null): string {
    if (!userData) return "Guest";

    if (userData.username?.trim()) {
      return userData.username;
    }

    const firstName = userData.firstname?.trim() || "";
    const lastName = userData.lastname?.trim() || "";

    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
    if (firstName) {
      return firstName;
    }
    if (lastName) {
      return lastName;
    }

    return userData.name || "Guest";
  }

  useEffect(() => {
    async function fetchUserData() {
      try {
        if (!user) {
          setUserData(defaultUserData);
          return;
        }

        const currentUserId = user.uid;
        const userDocRef = doc(db, "users", currentUserId);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
          setUserData(defaultUserData);
          return;
        }

        const rawData = userDoc.data();
        let profilePicture = defaultUserData.profilePicture;

        if (currentUserId) {
          const storagePath = `user/${currentUserId}/profile_200x200`;
          try {
            const storageRef: StorageReference = ref(storage, storagePath);
            profilePicture = await getDownloadURL(storageRef);
          } catch (error) {
            console.error("Error fetching profile picture:", error);
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
          firstname: rawData?.firstname?.trim() || "",
          lastname: rawData?.lastname?.trim() || "",
        };

        setUserData(validatedUserData);
      } catch (error) {
        console.error("Error fetching user data:", error);
        setUserData(defaultUserData);
      } finally {
        setLoading(false);
      }
    }

    fetchUserData();
  }, [user]);

  return (
    <div className="relative inset-y-0 top-0 left-0 right-0 z-30 w-full h-5 md:h-8">
      <UserHead
        username={getDisplayName(userData)}
        avatarUrl={userData?.profilePicture}
        points={userData?.country}
      />
      <div className="bg-white relative top-0 z-50 w-full -scale-y-50 h-[0.1px]" />
    </div>
  );
};

export default PageHeader;
