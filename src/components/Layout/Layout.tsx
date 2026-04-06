"use client";

import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** Routes with fixed in-page height + inner scroll: nested regions must not control the desktop nav second row. */
const MAIN_COLUMN_SCROLL_ONLY_PATHS = new Set(["/dashboard/pick-em"]);

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
  const mainScrollPendingRef = useRef(0);
  const mainScrollRafRef = useRef<number | null>(null);

  /** Batch scroll position into React state once per frame so scroll feels smooth (avoids setState per raw scroll event). */
  const flushMainColumnScrollTop = useCallback(() => {
    mainScrollRafRef.current = null;
    setMainColumnScrollTop(mainScrollPendingRef.current);
  }, []);

  const onMainColumnScroll = useCallback(
    (e: React.UIEvent<HTMLElement>) => {
      mainScrollPendingRef.current = e.currentTarget.scrollTop;
      if (mainScrollRafRef.current == null) {
        mainScrollRafRef.current = requestAnimationFrame(flushMainColumnScrollTop);
      }
    },
    [flushMainColumnScrollTop],
  );

  useEffect(() => {
    if (mainScrollRafRef.current != null) {
      cancelAnimationFrame(mainScrollRafRef.current);
      mainScrollRafRef.current = null;
    }
    setMainColumnScrollTop(0);
    setNestedScrollTops({});
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (mainScrollRafRef.current != null) {
        cancelAnimationFrame(mainScrollRafRef.current);
      }
    };
  }, []);

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

  const scrollCtx = useMemo(() => {
    const pathKey = pathname?.replace(/\/$/, "") ?? "";
    const mainOnly = MAIN_COLUMN_SCROLL_ONLY_PATHS.has(pathKey);
    return {
      scrollTop: mainOnly
        ? mainColumnScrollTop
        : Math.max(mainColumnScrollTop, nestedScrollTop),
      setNestedScrollTop,
    };
  }, [mainColumnScrollTop, nestedScrollTop, pathname, setNestedScrollTop]);

  return (
    <div
      className={cn(
        // h-[100dvh] on all breakpoints (not only md:h-screen) so the flex main column gets a
        // definite height; otherwise max-md flex-1 overflow-y-auto often won't scroll with wheel
        // on a narrow desktop window, while touch still works on real phones.
        "relative flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-neutral-950 dark:bg-neutral-950 bg-white",
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
            className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain max-md:pt-[calc(var(--pickem-dashboard-header-bottom)+var(--pickem-dashboard-header-content-gap))] md:pt-0"
            onScroll={onMainColumnScroll}
          >
            <div className="flex min-h-full flex-col">
              <div className="w-full shrink-0">{children}</div>
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
