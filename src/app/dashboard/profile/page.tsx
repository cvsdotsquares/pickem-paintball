"use client";

import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import AccountSettings from "@/src/components/Dashboard/settings";
import Badge from "@/src/components/ui/Badge";
import { Tabs } from "@/src/components/ui/Tabs";
import Link from "next/link";
import { BiMapPin, BiPlusCircle } from "react-icons/bi";
import { FaPersonRunning } from "react-icons/fa6";
import { TiTick } from "react-icons/ti";
import { RiTeamLine } from "react-icons/ri";
import { auth, db, storage } from "@/src/lib/firebaseClient";
import { useAuth } from "@/src/contexts/authProvider";
import { getDownloadURL, ref, StorageReference } from "firebase/storage";

// Define a TypeScript interface for the user data
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

function ProfilePage() {
    const [activeTab, setActiveTab] = useState<string>("Stats");
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
                    const currentUserId: string = auth.currentUser?.uid || '';  // Ensure the user is logged in and UID is available

                    if (currentUserId) {
                        const storagePath = `user/${currentUserId}/profile`;  // Adjust the file name/extension if needed
                        console.log("Generated Firebase Storage path:", storagePath);

                        try {
                            const storageRef: StorageReference = ref(storage, storagePath);
                            console.log("Storage reference created for path:", storagePath);

                            // Fetch the profile picture from Firebase Storage
                            const validProfilePicture = await getDownloadURL(storageRef);
                            console.log("Profile picture found in Firebase Storage, URL:", validProfilePicture);
                            profilePicture = validProfilePicture;
                        } catch (error) {
                            console.error("Error fetching profile picture from Firebase Storage:", error);
                            // Use default if not found or invalid
                            profilePicture = defaultUserData.profilePicture;
                        }
                    } else {
                        console.log("No authenticated user found, using default profile picture.");
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
                            typeof rawData?.country === "string" && rawData.country.trim() !== ""
                                ? rawData.country
                                : defaultUserData.country,
                        team:
                            typeof rawData?.team === "string" && rawData.team.trim() !== ""
                                ? rawData.team
                                : defaultUserData.team,
                        player:
                            typeof rawData?.player === "string" && rawData.player.trim() !== ""
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

    // Render content based on the selected tab
    const renderTabContent = () => {
        switch (activeTab) {
            case "Stats":
                return (
                    <div className="flex w-full flex-wrap items-start gap-6 rounded-md bg-neutral-200 px-6 py-6">
                        <BiPlusCircle />
                        <div className="flex grow shrink-0 basis-0 flex-col items-start gap-6">
                            <div className="flex flex-col items-start gap-2">
                                <span className="text-lg font-inter">
                                    {userData?.name || defaultUserData.name}
                                </span>
                                <span className="text-body font-body text-subtext-color">
                                    {userData?.bio || defaultUserData.bio}
                                </span>
                            </div>

                        </div>
                    </div>
                );

            case "Settings":
                return <AccountSettings />;
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col font-inter font-medium items-start h-auto">
            {loading ? (
                <div className="w-full flex justify-center items-center min-h-screen">
                    <p>Loading your profile...</p>
                </div>
            ) : (
                <div className="flex w-full flex-col items-center gap-4">
                    <div className="flex w-full flex-wrap items-start gap-8">
                        {/* Sidebar with user details */}
                        <div className="flex sticky min-w-[240px] max-w-[300px] grow shrink-0 basis-0 flex-col items-center gap-6 rounded-md border border-solid border-neutral-border px-8 pb-8 shadow-sm pt-6">
                            <div className="flex w-full flex-col items-center gap-6">
                                <div className="flex flex-col items-center gap-6 relative">
                                    <div className="flex h-36 w-36 flex-none flex-col items-center justify-center gap-2 overflow-hidden rounded-full relative">
                                        <img
                                            className="h-36 w-36 flex-none object-cover absolute"
                                            src={userData?.profilePicture || defaultUserData.profilePicture}
                                            alt="Profile Picture"
                                        />
                                    </div>
                                    <Badge
                                        className="absolute top-4 -right-4"
                                        variant="success"
                                        iconRight={<TiTick />}
                                    >
                                        {userData?.isPro ? "Pro" : "verified"}
                                    </Badge>
                                </div>
                            </div>
                            <div className="flex w-full flex-col items-center gap-10">
                                <span className="w-full text-center">
                                    {userData?.name || defaultUserData.name}
                                </span>
                                {/* Display badges */}
                                <div className="flex w-full flex-col items-start gap-4">
                                    <span className="w-full">Badges</span>
                                    <div className="flex w-full flex-wrap items-start gap-2">
                                        {(userData?.badges || defaultUserData.badges).map((badge, index) => (
                                            <Badge key={index} variant="brand">
                                                {badge}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                                {/* Support Information */}
                                <div className="flex w-full flex-col items-start gap-4">
                                    <span className="w-full">Support</span>
                                    <div className="flex w-full flex-wrap items-start gap-2">
                                        <div className="flex flex-col items-start gap-4">
                                            <div className="flex w-full items-center gap-2">
                                                <BiMapPin />
                                                <span className="grow shrink-0 basis-0">Country:</span>
                                                <span className="grow shrink-0 basis-0">
                                                    {userData?.country || defaultUserData.country}
                                                </span>
                                            </div>
                                            <div className="flex w-full items-center gap-2">
                                                <RiTeamLine />
                                                <span className="grow shrink-0 basis-0">Team:</span>
                                                <span className="grow shrink-0 basis-0">
                                                    {userData?.team || defaultUserData.team}
                                                </span>
                                            </div>
                                            <div className="flex w-full items-center gap-2">
                                                <FaPersonRunning />
                                                <span className="grow shrink-0 basis-0 text-body font-body text-default-font">
                                                    Player:
                                                </span>
                                                <span className="grow shrink-0 basis-0">
                                                    {userData?.player || defaultUserData.player}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Main content area with tabs */}
                        <div className="flex flex-col gap-6 pt-6">
                            <h1 className="text-2xl font-bold">Welcome to Pickem Paintball!</h1>
                            <Tabs>
                                <Tabs.Item
                                    active={activeTab === "Stats"}
                                    onClick={() => setActiveTab("Stats")}
                                >
                                    Stats
                                </Tabs.Item>

                                <Tabs.Item
                                    active={activeTab === "Settings"}
                                    onClick={() => setActiveTab("Settings")}
                                >
                                    Settings
                                </Tabs.Item>
                            </Tabs>
                            <div className="flex w-full flex-col items-start gap-8 pb-8">
                                {renderTabContent()}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ProfilePage;
