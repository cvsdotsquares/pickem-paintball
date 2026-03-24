"use client";

import React, { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/src/lib/utils";
import PageHeader from "../Dashboard/sidebar/topbar";
import { ToastContainer } from "react-toastify";
import ProfileCompletion from "./ProfileCompletion";
import DashboardFloatingBanner from "./DashboardFloatingBanner";
import DashboardFooterBanner from "./DashboardFooterBanner";
import { DashboardMainScrollContext } from "@/src/contexts/DashboardMainScrollContext";

interface LayoutProps {
  children: ReactNode;
}

/** Used by emails / other surfaces that still link a compact logo mark */
export const Logo = () => {
  return (
    <Link
      href="/dashboard"
      className="relative z-20 flex w-[80px] items-center space-x-2 py-1 text-sm font-normal text-black"
    >
      <img
        loading="lazy"
        src="/logo.svg"
        alt="logo"
        width="130"
        className="invert dark:invert-0"
      />
    </Link>
  );
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const pathname = usePathname();
  const [mainColumnScrollTop, setMainColumnScrollTop] = useState(0);
  const [nestedScrollTops, setNestedScrollTops] = useState<Record<string, number>>({});

  useEffect(() => {
    setMainColumnScrollTop(0);
    setNestedScrollTops({});
  }, [pathname]);

  const setNestedScrollTop = useCallback((regionId: string, top: number) => {
    setNestedScrollTops((prev) => {
      if (prev[regionId] === top) return prev;
      return { ...prev, [regionId]: top };
    });
  }, []);

  const nestedScrollTop = useMemo(
    () => Math.max(0, ...Object.values(nestedScrollTops)),
    [nestedScrollTops],
  );

  const scrollCtx = useMemo(
    () => ({
      scrollTop: Math.max(mainColumnScrollTop, nestedScrollTop),
      setNestedScrollTop,
    }),
    [mainColumnScrollTop, nestedScrollTop, setNestedScrollTop],
  );

  return (
    <div
      className={cn(
        "relative flex min-h-screen w-full flex-col overflow-hidden bg-neutral-950 dark:bg-neutral-950 bg-white md:h-screen",
      )}
    >
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-white dark:bg-stone-950">
        <DashboardMainScrollContext.Provider value={scrollCtx}>
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
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain max-md:pt-[var(--pickem-dashboard-header-bottom)] md:pt-0"
            onScroll={(e) => setMainColumnScrollTop(e.currentTarget.scrollTop)}
          >
            <div className="flex min-h-full flex-col">
              <div className="flex-1">{children}</div>
              <DashboardFooterBanner />
            </div>
          </div>
        </DashboardMainScrollContext.Provider>
      </main>
      <DashboardFloatingBanner />
      <ProfileCompletion />
    </div>
  );
};

export default Layout;
