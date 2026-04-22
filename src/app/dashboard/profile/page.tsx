"use client";

import React from "react";
import AccountSettings, {
  ProfileDangerZone,
} from "@/src/components/Dashboard/settings";
import SubscriptionManager from "@/src/components/Subscription/SubscriptionManager";
import ProfileBadgesSection from "@/src/components/Badges/ProfileBadgesSection";
import { handleLogout } from "@/src/components/Dashboard/sidebar/sidebar1";
import { LuLogOut } from "react-icons/lu";
import { useDashboardNestedScrollHandler } from "@/src/contexts/DashboardMainScrollContext";
import { cn } from "@/src/lib/utils";
import {
  profileSectionBody,
  profileSectionDivider,
  profileSectionTitle,
} from "@/src/components/Layout/profileSectionTokens";

function ProfilePage() {
  const reportProfileScroll = useDashboardNestedScrollHandler("dashboard-profile");

  return (
    <div
      className="flex flex-col font-inter font-medium items-start h-auto overflow-auto bg-white dark:bg-black"
      onScroll={reportProfileScroll}
    >
      <div className="relative flex w-full max-w-7xl flex-col px-5 pb-10 pt-1 font-sans text-gray-900 dark:text-white md:mx-auto md:px-3 md:pb-5 md:pt-5">
        <section className={cn("w-full", profileSectionDivider)}>
          <h1 className={profileSectionTitle}>Account settings</h1>
          <p className={profileSectionBody}>
            Update your profile, bio, and how you show up in leagues and leaderboards.
          </p>
          <div className="mt-6">
            <AccountSettings />
          </div>
        </section>

        <section className={cn("w-full", profileSectionDivider, "pt-10")}>
          <h2 className={profileSectionTitle}>Badges</h2>
          <p className={profileSectionBody}>
            Your Pick&apos;em achievements. Earned badges are in colour, unearned are greyed out.
          </p>
          <div className="mt-6">
            <ProfileBadgesSection />
          </div>
        </section>

        <section className={cn("w-full", profileSectionDivider, "pt-10")}>
          <h2 className={profileSectionTitle}>Subscription</h2>
          <p className={profileSectionBody}>
            Manage billing and your Pick&apos;em supporter status.
          </p>
          <div className="mt-6">
            <SubscriptionManager />
          </div>
        </section>

        <section className={cn("w-full", profileSectionDivider, "pt-10")}>
          <h2 className={profileSectionTitle}>Session</h2>
          <p className={profileSectionBody}>
            Sign out of Pick&apos;em on this device. You can sign back in anytime.
          </p>
          <button
            type="button"
            onClick={() => handleLogout()}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 font-azonix text-sm font-bold uppercase tracking-wide text-red-700 transition-colors hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
          >
            <LuLogOut className="h-4 w-4 shrink-0" aria-hidden />
            Log out
          </button>
        </section>

        <section className={cn("w-full", profileSectionDivider, "pt-10")}>
          <h2 className={profileSectionTitle}>Danger zone</h2>
          <div className="mt-6">
            <ProfileDangerZone />
          </div>
        </section>
      </div>
    </div>
  );
}

export default ProfilePage;
