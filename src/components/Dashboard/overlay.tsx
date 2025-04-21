"use client";
import { useAuth } from "@/src/contexts/authProvider";
import { auth, db, storage } from "@/src/lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";
import { getDownloadURL, ref, StorageReference } from "firebase/storage";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { BiEditAlt } from "react-icons/bi";

interface ActionButtonProps {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  icon,
  onClick,
}) => (
  <button
    className="flex gap-2 items-center px-4 py-1.5 h-8 bg-black bg-opacity-10 rounded-[32px]"
    onClick={onClick}
  >
    {icon}
    <span className="text-base font-bold text-white">{label}</span>
  </button>
);

interface StatCardProps {
  value: number;
  label: string;
}

const StatCard: React.FC<StatCardProps> = ({ value, label }) => (
  <article className="flex flex-col items-center gap-2">
    <div className="text-4xl text-white">{value}</div>
    <p className="text-sm text-white">{label}</p>
  </article>
);

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

const UserProfile = () => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { user } = useAuth();

  useEffect(() => {
    async function fetchUserData() {
      console.log("Starting fetchUserData...");

      try {
        if (!user) {
          throw new Error("User is not authenticated.");
        }

        const currentUserId = user.uid;
        const userDocRef = doc(db, "users", currentUserId);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const rawData = userDoc.data();
          let profilePicture = defaultUserData.profilePicture;

          if (currentUserId) {
            try {
              const storageRef: StorageReference = ref(
                storage,
                `user/${currentUserId}/profile`
              );
              profilePicture = await getDownloadURL(storageRef);
            } catch {
              profilePicture = defaultUserData.profilePicture;
            }
          }

          const validatedUserData: UserData = {
            name: rawData?.name || defaultUserData.name,
            bio: rawData?.bio || defaultUserData.bio,
            profilePicture,
            isPro: rawData?.isPro || defaultUserData.isPro,
            badges: rawData?.badges || defaultUserData.badges,
            country: rawData?.country || defaultUserData.country,
            team: rawData?.team || defaultUserData.team,
            player: rawData?.player || defaultUserData.player,
          };

          setUserData(validatedUserData);
        } else {
          setUserData(defaultUserData);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        setUserData(defaultUserData);
      } finally {
        setLoading(false);
      }
    }

    fetchUserData();
  }, [user]);

  if (loading) {
    return <div className="text-white">Loading...</div>;
  }

  if (!userData) {
    return <div className="text-white">No user data found.</div>;
  }

  return (
    <main className="flex flex-col inset-4 z-50 items-center justify-evenly gap-4 m-auto w-full h-full bg-transparent rounded-2xl">
      <header className="flex justify-end items-center w-full max-md:flex-col max-md:gap-6">
        <div className="flex gap-2">
          <Link href={"/dashboard/profile"}>
            <ActionButton
              label="Edit"
              icon={<BiEditAlt className="text-white font-black" />}
            />
          </Link>
        </div>
      </header>

      <section className="flex flex-col items-center gap-4">
        <img
          src={userData.profilePicture}
          alt={userData.name}
          className="w-20 h-20 rounded-full"
        />
        <h1 className="text-5xl font-bold text-white">{userData.name}</h1>
        <div className="flex gap-4 text-sm text-zinc-400">
          <span className="text-white">{userData.team}</span> Team
          <span className="text-white">{userData.country}</span> Country
          <span className="text-white">{userData.player}</span> Player
        </div>
      </section>

      <div className="flex gap-20 justify-center max-md:flex-col max-md:gap-4">
        <StatCard value={userData.badges.length} label="Badges" />
        <StatCard value={userData.isPro ? 1 : 0} label="Pro Status" />
      </div>

      <button className="px-3 py-2.5 h-10 text-base font-bold text-white bg-black bg-opacity-50 rounded-[32px]">
        See History
      </button>
    </main>
  );
};

export default UserProfile;
