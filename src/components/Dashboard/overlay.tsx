"use client";
import React from "react";

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
    className="flex gap-2 items-center px-4 py-1.5 h-8 bg-white bg-opacity-10 rounded-[32px]"
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

interface ProfileInfoProps {
  username: string;
  followers: number;
  following: number;
  joinedDate: string;
  avatarUrl: string;
}

const ProfileInfo: React.FC<ProfileInfoProps> = ({
  username,
  followers,
  following,
  joinedDate,
  avatarUrl,
}) => (
  <section className="flex flex-col items-center gap-4">
    <img src={avatarUrl} alt={username} className="w-20 h-20 rounded-full" />
    <h1 className="text-5xl font-bold text-white">{username}</h1>
    <div className="flex gap-4 text-sm text-zinc-400">
      <span className="text-white">{followers}</span> Followers
      <span className="text-white">{following}</span> Following
      <span className="text-white">{joinedDate}</span> Joined
    </div>
  </section>
);

const ProfileHeader: React.FC = () => (
  <header className="flex justify-between items-center w-full max-md:flex-col max-md:gap-6">
    <div className="flex items-center gap-2">
      <img
        src="https://placehold.co/24x24/333333/333333"
        className="w-6 h-6 rounded-lg"
      />
      <p className="text-sm text-white">taran.exe</p>
    </div>
    <div className="flex gap-2">
      <ActionButton
        label="Share"
        icon={<svg width="14" height="16" className="text-white" />}
      />
      <ActionButton
        label="Edit"
        icon={<svg width="16" height="16" className="text-white" />}
      />
    </div>
  </header>
);

const UserProfile: React.FC = () => (
  <main className="flex flex-col inset-4 items-center justify-evenly gap-4 m-auto w-full h-full bg-transparent rounded-2xl">
    <ProfileHeader />
    <ProfileInfo
      username="taran.exe"
      followers={0}
      following={0}
      joinedDate="03/26/2025"
      avatarUrl="https://placehold.co/80x80/333333/333333"
    />
    <div className="flex gap-20 justify-center max-md:flex-col max-md:gap-4">
      <StatCard value={0} label="Pro tourny Won" />
      <StatCard value={30} label="Coll. Score" />
      <StatCard value={1} label="Points Collected" />
    </div>
    <button className="px-3 py-2.5 h-10 text-base font-bold text-white bg-black bg-opacity-50 rounded-[32px]">
      See History
    </button>
  </main>
);

export default UserProfile;
