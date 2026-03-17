"use client";
import Link from "next/link";
import React from "react";
import { FaBell } from "react-icons/fa6";
import { ImCog } from "react-icons/im";
import { MdLightMode, MdDarkMode } from "react-icons/md";
import NotificationBell from "../../Notifications/NotificationBell";
import SupportButton from "../../Subscription/SupportButton";
import { useTheme } from "../../../contexts/ThemeContext";

interface UserHeadProps {
  username?: string | null;
  points?: string;
  avatarUrl?: string;
}

const UserHead: React.FC<UserHeadProps> = ({
  username = "Error-_-",
  points = 0,
  avatarUrl = "https://placehold.co/36x36/ffffff/ffffff",
}) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="bg-white dark:bg-[#101010] z-20 border-b border-gray-200 dark:border-white/30">
      <nav className="flex justify-between items-center px-3 py-1 mx-auto my-0 w-full">
        {/* Left Section: Logo (Desktop) + User Profile */}
        <div className="flex items-center gap-4">
          {/* Logo - Desktop Only */}
          <Link href="/dashboard" className="hidden md:block">
            <img
              src="/logo.svg"
              alt="Pickem Logo"
              className="h-8 w-auto dark:invert-0 invert"
            />
          </Link>
          
          {/* User Profile */}
          <Link href="/dashboard/profile" className="flex flex-row">
            <div className="flex gap-2 items-center">
              <div className="overflow-hidden w-9 h-9 min-w-[36px] min-h-[36px] rounded-2xl flex-shrink-0">
                <img
                  src={avatarUrl}
                  alt="User avatar"
                  className="w-full h-full object-cover"
                  style={{ aspectRatio: "1/1" }}
                />
              </div>
              <div className="flex flex-col gap-1 max-xs:max-w-[150px]">
                <h2 className="text-md font-bold leading-2 text-white">
                  {username}
                </h2>
              </div>
            </div>
          </Link>
        </div>

        {/* Action Icons Section */}
        <div className="flex gap-2 items-center">
          <SupportButton />
          <NotificationBell />
          <button
            onClick={toggleTheme}
            className="flex justify-center items-center w-8 h-7 rounded-2xl cursor-pointer bg-white bg-opacity-20"
            aria-label="Toggle theme"
          >
            {theme === "light" ? (
              <MdDarkMode size={14} className="text-gray-700 dark:text-white" />
            ) : (
              <MdLightMode size={14} className="text-gray-700 dark:text-white" />
            )}
          </button>
          <Link
            href={"/dashboard/profile"}
            className="flex justify-center items-center w-8 h-7 rounded-2xl cursor-pointer bg-white bg-opacity-20"
            aria-label="Profile"
          >
            <ImCog size={14} className="text-gray-700 dark:text-white" />
          </Link>
        </div>
      </nav>
    </header>
  );
};

export default UserHead;
