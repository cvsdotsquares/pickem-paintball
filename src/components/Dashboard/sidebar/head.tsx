"use client";
import Link from "next/link";
import React from "react";
import { FaBell } from "react-icons/fa6";
import { ImCog } from "react-icons/im";

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
  return (
    <header className="bg-[#101010] z-20">
      <nav className="flex justify-between items-center px-8 py-3 mx-auto  my-0 w-full border-white/30 border-b">
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
        <div className="flex gap-1 items-center">
          <button
            className="flex justify-center items-center w-10 h-10 cursor-pointer rounded-[32px]"
            aria-label="Notifications"
          >
            <FaBell size={14} className="text-white" />
          </button>
          <Link
            href={"/dashboard/profile"}
            className="flex justify-center items-center w-8 h-7 rounded-2xl cursor-pointer bg-white bg-opacity-20"
            aria-label="Profile"
          >
            <ImCog size={14} className="text-white" />
          </Link>
        </div>
      </nav>
    </header>
  );
};

export default UserHead;
