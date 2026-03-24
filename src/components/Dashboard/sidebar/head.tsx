"use client";
import Link from "next/link";
import React from "react";
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
      <nav className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-1 mx-auto my-0 w-full min-h-[44px]">
        {/* Left: user only */}
        <div className="flex items-center min-w-0 justify-self-start">
          <Link href="/dashboard/profile" className="flex flex-row min-w-0 shrink">
            <div className="flex gap-2 items-center">
              <div className="overflow-hidden w-9 h-9 min-w-[36px] min-h-[36px] rounded-2xl flex-shrink-0">
                <img
                  src={avatarUrl}
                  alt="User avatar"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  style={{ aspectRatio: "1/1" }}
                />
              </div>
              <div className="flex flex-col gap-1 max-w-[min(140px,28vw)] sm:max-w-[200px]">
                <h2 className="text-md font-bold leading-2 text-gray-900 dark:text-white truncate">
                  {username}
                </h2>
              </div>
            </div>
          </Link>
        </div>

        {/* Centered logo */}
        <Link href="/dashboard" className="justify-self-center shrink-0">
          <img
            src="/logo.svg"
            alt="Pickem Paintball"
            className="h-8 w-auto dark:invert-0 invert max-w-[min(220px,42vw)]"
          />
        </Link>

        {/* Right: subscriber, notifications, theme, settings */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 justify-self-end justify-end">
          <SupportButton />
          <NotificationBell />
          <button
            onClick={toggleTheme}
            className="flex justify-center items-center w-8 h-7 rounded-2xl cursor-pointer bg-gray-100 dark:bg-white/10"
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
            className="flex justify-center items-center w-8 h-7 rounded-2xl cursor-pointer bg-gray-100 dark:bg-white/10"
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
