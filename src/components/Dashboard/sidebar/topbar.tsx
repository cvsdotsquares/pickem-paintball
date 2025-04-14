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
    bio: string;
    profilePicture: string;
    isPro: boolean;
    badges: string[];
    country: string;
    team: string;
    player: string;
  }

  // Default data to use when fields are missing or invalid
  const defaultUserData: UserData = {
    name: "Your Name",
    bio: "Your stats From previous performances will be displayed here.",
    profilePicture:
      "https://cdn-icons-png.freepik.com/256/14024/14024658.png?semt=ais_hybrid",
    isPro: false,
    badges: ["Badge 1", "Badge 2", "Badge 3"],
    country: "N/A",
    team: "N/A",
    player: "N/A",
  };

  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { user } = useAuth();
  // Fetch user details on component mount
  useEffect(() => {
    async function fetchUserData() {
      console.log("Starting fetchUserData...");

      try {
        if (!user) {
          throw new Error("User is not authenticated.");
        }

        const currentUserId: any = user.uid;
        console.log("Current user ID:", currentUserId);

        // Construct the Firestore document reference
        const userDocRef = doc(db, "users", currentUserId);
        console.log("Fetching document from path: users/", currentUserId);

        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const rawData = userDoc.data();
          console.log("Raw user data:", rawData);

          // Check if the profile picture is available and valid in Firestore
          let profilePicture = defaultUserData.profilePicture;

          // Generate the storage path using the current user's UID
          const currentUserId: string = auth.currentUser?.uid || ""; // Ensure the user is logged in and UID is available

          if (currentUserId) {
            const storagePath = `user/${currentUserId}/profile`; // Adjust the file name/extension if needed
            console.log("Generated Firebase Storage path:", storagePath);

            try {
              const storageRef: StorageReference = ref(storage, storagePath);
              console.log("Storage reference created for path:", storagePath);

              // Fetch the profile picture from Firebase Storage
              const validProfilePicture = await getDownloadURL(storageRef);
              console.log(
                "Profile picture found in Firebase Storage, URL:",
                validProfilePicture
              );
              profilePicture = validProfilePicture;
            } catch (error) {
              console.error(
                "Error fetching profile picture from Firebase Storage:",
                error
              );
              // Use default if not found or invalid
              profilePicture = defaultUserData.profilePicture;
            }
          } else {
            console.log(
              "No authenticated user found, using default profile picture."
            );
          }

          // Validate and set defaults for other fields
          const validatedUserData: UserData = {
            name:
              typeof rawData?.name === "string" && rawData.name.trim() !== ""
                ? rawData.name
                : defaultUserData.name,
            bio:
              typeof rawData?.bio === "string" && rawData.bio.trim() !== ""
                ? rawData.bio
                : defaultUserData.bio,
            profilePicture, // Set validated profile picture URL
            isPro:
              typeof rawData?.isPro === "boolean"
                ? rawData.isPro
                : defaultUserData.isPro,
            badges: Array.isArray(rawData?.badges)
              ? rawData.badges
              : defaultUserData.badges,
            country:
              typeof rawData?.country === "string" &&
              rawData.country.trim() !== ""
                ? rawData.country
                : defaultUserData.country,
            team:
              typeof rawData?.team === "string" && rawData.team.trim() !== ""
                ? rawData.team
                : defaultUserData.team,
            player:
              typeof rawData?.player === "string" &&
              rawData.player.trim() !== ""
                ? rawData.player
                : defaultUserData.player,
          };

          console.log("Validated user data:", validatedUserData);
          setUserData(validatedUserData);
        } else {
          console.log("User document not found, using default data.");
          setUserData(defaultUserData);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        setUserData(defaultUserData);
      } finally {
        setLoading(false);
        console.log("Finished fetchUserData.");
      }
    }

    fetchUserData();
  }, [user]);

  return (
    <div className="relative inset-y-0 top-0 left-0 right-0 z-30 w-full h-8">
      <UserHead
        username={user?.displayName}
        avatarUrl={userData?.profilePicture}
        points={userData?.country}
      />
      <div className="bg-white relative top-0 z-50 w-full -scale-y-50 h-[0.1px]" />
    </div>
  );
};

export default PageHeader;
