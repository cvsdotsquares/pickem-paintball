import React, { ReactNode, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { GiCardRandom } from "react-icons/gi";
import { cn } from "@/src/lib/utils";
import { PiRankingThin } from "react-icons/pi";
import {
  handleLogout,
  Logoutbtn,
  MobileSidebar,
  Sidebar,
  SidebarBody,
  SidebarLink,
} from "../Dashboard/sidebar/sidebar1";
import PageHeader from "../Dashboard/sidebar/topbar";
import { LuLogOut } from "react-icons/lu";
import { FaTableList } from "react-icons/fa6";
import { ImStatsBars } from "react-icons/im";
import { ToastContainer } from "react-toastify";

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
      className="w-[80px] relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-black"
    >
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}       
      >
      <img
                            loading="lazy"
                            src="/logo.svg"
                            alt="logo"
                            width="130"
                        />
        </motion.span>
    </Link>
  );
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "flex w-full relative overflow-hidden bg-neutral-950 md:h-screen"
      )}
    >
      <div className="z-50 border-white/30 border-r">
        <Sidebar open={open} setOpen={setOpen}>
          <SidebarBody className="justify-between gap-10">
            <div className="md:flex hidden flex-1 flex-col overflow-x-hidden overflow-y-auto">
              <Logo />
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
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-around bg-stone-950 text-white p-2 md:hidden">
          {links.map((link, index) => (
            <Link
              key={index}
              href={link.href}
              className="flex flex-col items-center justify-center text-xs hover:text-stone-300"
            >
              {link.icon}
              <span className="text-[10px] mt-1">{link.label}</span>
            </Link>
          ))}
          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="flex flex-col items-center justify-center text-xs hover:text-stone-300"
          >
            <LuLogOut className="h-5 w-5 shrink-0 text-neutral-200" />
            <span className="text-[10px] mt-1">Log out</span>
          </button>
        </div>
      </div>
      <main className="overflow-hidden flex w-full flex-col bg-stone-950">
        <PageHeader />
        <ToastContainer
          position="top-center"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
        />
        {children}
      </main>
    </div>
  );
};

export default Layout;
