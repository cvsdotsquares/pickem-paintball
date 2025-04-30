"use client";
import { cn } from "@/src/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import Link, { LinkProps } from "next/link";
import React, { useState, createContext, useContext } from "react";
import { ImMenu2, ImStatsBars } from "react-icons/im";
import { LuX } from "react-icons/lu";
import Button from "../../ui/button";
import { logout } from "@/src/lib/auth";
import { FaTableList } from "react-icons/fa6";
import { GiCardRandom } from "react-icons/gi";
import { PiRankingThin } from "react-icons/pi";

interface Links {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined
);
export const handleLogout = async () => {
  try {
    await logout();
    window.location.href = "/";
  } catch (error: any) {
    console.error("Error logging out:", error);
    alert(error.message);
  }
};
export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate: animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
  return (
    <>
      <DesktopSidebar {...props} />
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();
  return (
    <>
      <motion.div
        className={cn(
          "h-full px-4 py-4 md:flex hidden flex-col bg-stone-950 w-[20vw] shrink-0",
          className
        )}
        animate={{
          width: animate ? (open ? "300px" : "60px") : "300px",
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        {...props}
      >
        {children}
      </motion.div>
    </>
  );
};

export const MobileSidebar = ({
  className,
  ...props
}: React.ComponentProps<"div">) => {
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

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 flex justify-around bg-stone-950 text-white p-2 md:hidden",
        className
      )}
      {...props}
    >
      {links.map((link, index) =>
        link.label === "Logout" ? (
          <button
            key={index}
            onClick={handleLogout}
            className="flex flex-col items-center justify-center text-xs hover:text-stone-300"
          >
            {link.icon}
            <span className="text-[10px] mt-1">{link.label}</span>
          </button>
        ) : (
          <Link
            key={index}
            href={link.href}
            className="flex flex-col items-center justify-center text-xs hover:text-stone-300"
          >
            {link.icon}
            <span className="text-[10px] mt-1">{link.label}</span>
          </Link>
        )
      )}
    </div>
  );
};

export const SidebarLink = ({
  link,
  className,
  ...props
}: {
  link: Links;
  className?: string;
  props?: LinkProps;
}) => {
  const { open, animate } = useSidebar();
  return (
    <Link
      href={link.href}
      className={cn(
        "flex items-center justify-start gap-2 group/sidebar py-2 ",
        className
      )}
      {...props}
    >
      {link.icon}

      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="text-neutral-200 text-sm group-hover/sidebar:translate-x-1 transition duration-150 whitespace-pre inline-block !p-0 !m-0"
      >
        {link.label}
      </motion.span>
    </Link>
  );
};
export const Logoutbtn = ({
  text,
  icon,
  className,
}: {
  text: string;
  icon: React.JSX.Element | React.ReactNode;
  className?: string;
}) => {
  const { open, animate } = useSidebar();
  return (
    <button
      onClick={handleLogout}
      className={cn(
        "flex items-center justify-start gap-2  group/sidebar py-2",
        className
      )}
    >
      {icon}

      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="text-neutral-200 text-sm group-hover/sidebar:translate-x-1 transition duration-150 whitespace-pre inline-block !p-0 !m-0"
      >
        {text}
      </motion.span>
    </button>
  );
};
