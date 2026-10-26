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
import { ErrorBoundaryWrapper } from "@/src/components/ErrorBoundaryWrapper";
import { reportClientError } from "@/src/lib/reportClientError";

interface LayoutProps {
  children: ReactNode;
}

/** Routes with fixed in-page height + inner scroll: nested regions must not control the desktop nav second row. */
const MAIN_COLUMN_SCROLL_ONLY_PATHS = new Set(["/dashboard/pick-em"]);

/**
 * Shown in place of a page that crashed. The header stays above it, so the menu still works
 * and the user can move on; the boundary resets on navigation (keyed by pathname).
 */
function PageCrashFallback() {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center text-gray-900 dark:text-white">
      <h2 className="font-azonix text-base uppercase tracking-wide">This page didn&apos;t load</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-white/60">
        Reloading usually fixes it. If you have page translation on, try turning it off.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 rounded-md bg-black px-4 py-2 font-azonix text-xs uppercase tracking-wide text-white dark:bg-white dark:text-black"
      >
        Reload page
      </button>
    </div>
  );
}

/** Used by emails / other surfaces that still link a compact logo mark */
export const Logo = () => {
  return (
    <Link
      href="/dashboard"
      className="relative z-20 flex w-[80px] items-center space-x-2 py-1 text-sm font-normal text-black"
    >
      <img loading="lazy" src="/logo.svg" alt="logo" width="130" className="dark:hidden" />
      <img loading="lazy" src="/logo-dark.svg" alt="logo" width="130" className="hidden dark:block" />
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

  /**
   * This frame is exactly one screen tall and scrolls inside itself, so the document itself
   * should never be scrolled. iOS (worst on 26) can leave it scrolled after the keyboard
   * closes, which pushes the green banner and the menu bar up under the status bar.
   * Put it back once nothing is focused. Skipped where dvh is unsupported: there the
   * frame falls back to 100vh and a small document scroll is expected.
   */
  useEffect(() => {
    if (typeof window === "undefined" || !window.CSS?.supports?.("height", "100dvh")) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let shiftReported = false;
    const resetDocumentScroll = () => {
      if (timer) clearTimeout(timer);
      // After the keyboard's own animation; never while the user is typing.
      timer = setTimeout(() => {
        const el = document.activeElement;
        const typing =
          el instanceof HTMLElement &&
          (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
        if (typing) return;
        if (window.scrollY !== 0 || window.scrollX !== 0) {
          // "instant": :root sets scroll-behavior: smooth, which would glide back visibly.
          try {
            window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
          } catch {
            window.scrollTo(0, 0);
          }
        }
        // The iOS 26 bug our reset can't undo: the visible screen itself stays shifted
        // (visualViewport.offsetTop > 0) with no keyboard up. Logged once per page load,
        // so the crash log shows whether the stronger fix (moving pinned UI by hand) is needed.
        if (!shiftReported) {
          setTimeout(() => {
            const vv = window.visualViewport;
            const el = document.activeElement;
            const stillTyping =
              el instanceof HTMLElement &&
              (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
            if (!vv || stillTyping || shiftReported) return;
            if (vv.offsetTop > 1 && vv.scale <= 1.01) {
              shiftReported = true;
              reportClientError("viewport-shift", "visualViewport stayed shifted after keyboard closed", {
                offsetTop: Math.round(vv.offsetTop),
                vvHeight: Math.round(vv.height),
                innerHeight: window.innerHeight,
                scrollY: Math.round(window.scrollY),
              });
            }
          }, 400);
        }
      }, 150);
    };
    const vv = window.visualViewport;
    document.addEventListener("focusout", resetDocumentScroll);
    vv?.addEventListener("resize", resetDocumentScroll);
    window.addEventListener("orientationchange", resetDocumentScroll);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("focusout", resetDocumentScroll);
      vv?.removeEventListener("resize", resetDocumentScroll);
      window.removeEventListener("orientationchange", resetDocumentScroll);
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
        // h-screen first: browsers without dvh (iOS < 15.4, older Android) drop the dvh rule,
        // and without a fallback the frame had no height at all.
        "relative flex h-screen supports-[height:100dvh]:h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-neutral-950 dark:bg-neutral-950 bg-white",
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
            className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain"
            onScroll={onMainColumnScroll}
          >
            <div className="flex min-h-full flex-col">
              <div className="w-full shrink-0">
                <ErrorBoundaryWrapper key={pathname} fallback={<PageCrashFallback />}>
                  {children}
                </ErrorBoundaryWrapper>
              </div>
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
