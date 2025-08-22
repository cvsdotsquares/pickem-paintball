"use client";
import { useAuth } from "@/src/contexts/authProvider";
import { auth, db, storage } from "@/src/lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";
import { MdVerified } from "react-icons/md";
import { getDownloadURL, ref, StorageReference } from "firebase/storage";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { BiEditAlt } from "react-icons/bi";
import { LuShieldPlus } from "react-icons/lu";

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
  const [dropdownVisible, setDropdownVisible] = useState(false);

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
                `user/${currentUserId}/profile_200x200`
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
    <main className="flex flex-col z-10  items-center justify-evenly gap-4 m-auto md:w-[100%] xl:w-[75%] h-full  rounded-2xl">
      <div className=" h-full w-full ">
        <header className="flex justify-end items-center w-full max-md:flex-col ">
          <div className="flex gap-2">
            <Link href={"/dashboard/profile"}>
              <ActionButton
                label="Edit"
                icon={<BiEditAlt className="text-white font-black" />}
              />
            </Link>
          </div>
        </header>

        <section className="flex flex-col mt-16 items-center gap-4">
          <img
            src={userData.profilePicture}
            alt={userData.name}
            className="w-20 h-20 rounded-full"
          />
          <h1 className="inline-flex gap-2 md:text-5xl text-3xl text-center font-bold text-white">
            {userData.name}
            {userData.isPro && <MdVerified />}
          </h1>
          <div className="flex flex-row gap-3 text-white/80 font-thin">
            <LuShieldPlus
              size={80}
              onClick={() => setDropdownVisible((prev) => !prev)}
              className="cursor-pointer"
            />
            <LuShieldPlus
              size={80}
              onClick={() => setDropdownVisible((prev) => !prev)}
              className="cursor-pointer"
            />
            <LuShieldPlus
              size={80}
              onClick={() => setDropdownVisible((prev) => !prev)}
              className="cursor-pointer"
            />
          </div>
          {dropdownVisible && (
            <div className="absolute left-0 mt-2 w-64 bg-neutral-900 text-white rounded-lg shadow-sm shadow-neutral-400 z-50 p-4">
              <p className="text-center">No badges available yet</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default UserProfile;
