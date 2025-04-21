// components/Layout/Layout.tsx
"use client";
// import Sidebar from "../Dashboard/Sidebar";
import React, { ReactNode, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { GiCardRandom, GiSettingsKnobs } from "react-icons/gi";
import { cn } from "@/src/lib/utils";
import { PiRankingThin } from "react-icons/pi";
import {
  Logoutbtn,
  Sidebar,
  SidebarBody,
  SidebarLink,
} from "../Dashboard/sidebar/sidebar1";
import PageHeader from "../Dashboard/sidebar/topbar";
import { LuLogOut } from "react-icons/lu";
import { FaRankingStar, FaTableList } from "react-icons/fa6";
import { BiUser } from "react-icons/bi";
import { Pointer } from "../ui/cursor";
import { ImStatsBars } from "react-icons/im";

interface LayoutProps {
  children: ReactNode;
}

const links = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <FaTableList className="h-5 w-5 shrink-0 text-neutral-200" />,
  },
  {
    label: "Statistics",
    href: "/dashboard/stats",
    icon: <ImStatsBars className="h-5 w-5 shrink-0 text-neutral-200" />,
  },
  {
    label: "Live PickEm",
    href: "/dashboard/pick-em",
    icon: <GiCardRandom className="h-5 w-5 shrink-0 text-neutral-200" />,
  },
  {
    label: "Leaderboards",
    href: "/dashboard/leaderboard",
    icon: <PiRankingThin className="h-5 w-5 shrink-0 text-neutral-200" />,
  },
];

export const Logo = () => {
  return (
    <Link
      href="/"
      className="relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-black"
    >
      <div className="h-5 w-6 shrink-0 rounded-tl-lg rounded-tr-sm rounded-br-lg rounded-bl-sm bg-white" />
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="font-medium whitespace-pre text-white"
      >
        Pickem Paintball
      </motion.span>
    </Link>
  );
};
export const LogoIcon = () => {
  return (
    <Link
      href="/"
      className="relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-black"
    >
      <div className="h-5 w-6 shrink-0 rounded-tl-lg rounded-tr-sm rounded-br-lg rounded-bl-sm bg-white" />
    </Link>
  );
};
const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [open, setOpen] = useState(false);

  return (
    // <div className="flex flex-row w-auto">
    //   <Sidebar />
    //   <main className="flex-1 overflow-hidden w-auto">
    //     <MantineProvider defaultColorScheme="light">{children}</MantineProvider>
    //   </main>
    // </div>
    <div
      className={cn(
        " flex w-full relative  overflow-hidden  bg-neutral-950  md:h-screen" // for your use case, use `h-screen` instead of `h-[60vh]`
      )}
    >
      <div className="z-50 border-white/30 border-r">
        <Sidebar open={open} setOpen={setOpen}>
          <SidebarBody className="justify-between gap-10">
            <div className="md:flex hidden flex-1 flex-col overflow-x-hidden overflow-y-auto">
              {open ? <Logo /> : <LogoIcon />}
              <div className="md:mt-8 flex md:flex-col flex-row gap-2">
                {links.map((link, idx) => (
                  <SidebarLink key={idx} link={link} />
                ))}
              </div>
            </div>
            <div>
              <Logoutbtn
                text="Log out"
                icon={
                  <LuLogOut className="h-5 w-5 shrink-0 text-neutral-200" />
                }
              />
            </div>
          </SidebarBody>
        </Sidebar>
      </div>
      <main className=" overflow-x-hidden flex w-full flex-col  bg-stone-950">
        <PageHeader />
        {children}
      </main>
    </div>
  );
};

export default Layout;
