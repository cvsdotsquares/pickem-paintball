"use client";

import React from "react";

interface SidebarItemProps {
  iconSrc: string;
  label: string;
  className?: string;
}

const SidebarItem: React.FC<SidebarItemProps> = ({
  iconSrc,
  label,
  className = "",
}) => {
  return (
    <button
      className={`flex flex-col items-center py-4 px-5 w-full text-xs leading-none text-center text-white ${className}`}
    >
      <img
        src={iconSrc}
        className="object-contain w-6 aspect-square"
        alt={`${label} icon`}
      />
      <span className="mt-1">{label}</span>
    </button>
  );
};

export default SidebarItem;
