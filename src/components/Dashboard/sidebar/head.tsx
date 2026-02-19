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
        {/* User Profile Section */}
        <Link href="/dashboard/profile" className="flex flex-row">
          <div className="flex gap-2 items-center">
            <div className="overflow-hidden w-9 h-9 rounded-2xl ">
              <img
                src={avatarUrl}
                alt="User avatar"
                className="object-cover size-full"
              />
            </div>
            <div className="flex flex-col gap-1 max-xs:max-w-[150px]">
              <h2 className="text-md font-bold leading-2 text-white">
                {username}
              </h2>
            </div>
          </div>
        </Link>

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
