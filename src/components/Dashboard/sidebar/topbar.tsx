"use client";

import React from "react";
import { useAuth } from "@/src/contexts/authProvider";
import UserHead from "./head";
import type { UserData } from "@/src/contexts/authProvider";

function getDisplayName(userData: UserData | null): string {
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

  return "Guest";
}

const PageHeader: React.FC = () => {
  const { userData } = useAuth();

  return (
    <div className="relative inset-y-0 top-0 left-0 right-0 z-30 w-full h-[48px]">
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
