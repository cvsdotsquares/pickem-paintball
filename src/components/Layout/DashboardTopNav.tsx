"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ImMenu2 } from "react-icons/im";
import { LuLogOut, LuX } from "react-icons/lu";
import { MdDarkMode, MdLightMode } from "react-icons/md";
import { cn } from "@/src/lib/utils";
import { useTheme } from "@/src/contexts/ThemeContext";
import NotificationBell from "@/src/components/Notifications/NotificationBell";
import SupportButton from "@/src/components/Subscription/SupportButton";
import { useSubscription } from "@/src/contexts/SubscriptionContext";
import { handleLogout } from "@/src/components/Dashboard/sidebar/sidebar1";
import { useDashboardMainScrollTop } from "@/src/contexts/DashboardMainScrollContext";
import {
  cmsDashboardLinks,
  faqDashboardLink,
  primaryDashboardLinks,
  type DashboardNavItem,
} from "./dashboardNavLinks";
import { PICKEM_DASHBOARD_HEADER_BOTTOM_VAR } from "./dashboardMobileHeader";

/** Sensible color palette for avatar backgrounds. */
const AVATAR_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-fuchsia-500",
  "bg-pink-500",
  "bg-rose-500",
];

/** Generate a consistent color for a username using a simple hash. */
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** Get first two letters of a name for avatar initials. */
function getInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "??";
  return cleaned.slice(0, 2).toUpperCase();
}

/** Check if avatar URL is valid (not placeholder/default). */
function isValidAvatarUrl(url?: string): boolean {
  if (!url) return false;
  // Check for common placeholder patterns
  if (url.includes("placehold.co")) return false;
  if (url.includes("14024658.png")) return false; // default icon
  return true;
}

/** Avatar with colored initials fallback. */
function TopNavAvatar({
  avatarUrl,
  username,
  size = "sm",
}: {
  avatarUrl?: string;
  username: string;
  size?: "sm" | "md";
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const hasValidUrl = isValidAvatarUrl(avatarUrl) && !imgFailed;
  const sizeClasses = size === "sm" ? "h-9 w-9" : "h-11 w-11";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  // Reset imgFailed when avatarUrl changes
  useEffect(() => {
    setImgFailed(false);
  }, [avatarUrl]);

  return (
    <div className={cn(sizeClasses, "overflow-hidden rounded-2xl ring-1 ring-black/5 dark:ring-white/10")}>
      {hasValidUrl ? (
        <img
          src={avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div
          className={cn(
            "h-full w-full flex items-center justify-center text-white font-bold select-none",
            textSize,
            getAvatarColor(username)
          )}
        >
          {getInitials(username)}
        </div>
      )}
    </div>
  );
}

/** Strip search/hash and trailing slash so active nav matches reliably (e.g. `/dashboard/faq`). */
function normalizePathname(pathname: string | null): string {
  if (!pathname) return "/";
  const noQuery = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return noQuery.replace(/\/$/, "") || "/";
}

/** True when `pathname` matches this nav target (exact `/dashboard` for home; prefix for nested routes). */
function isDashboardNavActive(pathname: string | null, href: string): boolean {
  const n = normalizePathname(pathname);
  const h = href.replace(/\/$/, "") || "/";
  if (h === "/dashboard") {
    return n === "/dashboard";
  }
  return n === h || n.startsWith(`${h}/`);
}

/** When true, desktop second row collapses as you scroll the main column (☰ reveals links). */
const DESKTOP_NAV_HIDE_ON_SCROLL = false;

/** Over this many px of main scroll, the inline nav row fully tucks away (☰ opens it). */
const DESKTOP_NAV_HIDE_SCROLL_RANGE = 52;
/** Upper bound for one wrapped row of links + padding (scroll-linked clip; generous for md wrap). */
const DESKTOP_NAV_ROW_MAX_PX = 72;

export type DashboardTopNavProps = {
  username: string;
  avatarUrl?: string;
  points?: string;
};

function HeaderNotificationsAndTheme({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className={cn("flex items-center gap-1 sm:gap-2", className)}>
      <NotificationBell />
      <button
        type="button"
        onClick={toggleTheme}
        className="flex h-7 w-8 items-center justify-center rounded-2xl bg-gray-100 dark:bg-white/10"
        aria-label="Toggle theme"
      >
        {theme === "light" ? (
          <MdDarkMode size={14} className="text-gray-700 dark:text-white" />
        ) : (
          <MdLightMode size={14} className="text-gray-700 dark:text-white" />
        )}
      </button>
    </div>
  );
}

function HeaderUtilities({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1 sm:gap-2", className)}>
      <SupportButton />
      <HeaderNotificationsAndTheme />
    </div>
  );
}

const MOBILE_PROMO_CTA_LINE =
  "CLICK TO SUPPORT PICK'EM - BY THE FANS FOR THE FANS";

const MOBILE_PROMO_SUBSCRIBED_LINE = "THANK YOU FOR SUPPORTING PICK'EM PAINTBALL";

const PICKEM_BRAND_GREEN = "#00f976";

/** Brand-green support strip (mobile). Status bar tint is handled via `theme-color` in ThemeContext. */
function MobileSubscriptionBanner() {
  const { isSubscribed, loading, showModal } = useSubscription();

  const barStyle = { backgroundColor: PICKEM_BRAND_GREEN } as const;
  const textClass =
    "font-azonix text-[10px] font-bold uppercase leading-snug tracking-wide text-neutral-950";

  if (loading) {
    return (
      <div
        className="h-[30px] w-full shrink-0 overflow-hidden animate-pulse bg-[#00f976]/35"
        aria-hidden
      />
    );
  }

  if (isSubscribed) {
    return (
      <div
        className="flex h-[30px] w-full shrink-0 items-center justify-center overflow-hidden px-3"
        style={barStyle}
      >
        <p className={`${textClass} text-center truncate`}>
          {MOBILE_PROMO_SUBSCRIBED_LINE}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => showModal("passive")}
      className="m-0 flex h-[30px] w-full shrink-0 items-center justify-center overflow-hidden px-3 text-center transition hover:brightness-[0.97] active:brightness-[0.93]"
      style={barStyle}
    >
      <span className="sr-only">
        {MOBILE_PROMO_CTA_LINE}. Opens subscription options.
      </span>
      <span className={`${textClass} truncate`}>
        {MOBILE_PROMO_CTA_LINE}
      </span>
    </button>
  );
}

function NavLinkPill({
  item,
  onNavigate,
  active,
}: {
  item: DashboardNavItem;
  onNavigate?: () => void;
  active?: boolean;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-2 text-gray-900 transition md:py-1 dark:text-neutral-200",
        active
          ? "border-l-[3px] border-[#00f976] bg-[#00f976]/10 pl-[5px] dark:bg-[#00f976]/15"
          : "border-l-[3px] border-transparent hover:bg-gray-100 dark:hover:bg-white/10",
      )}
    >
      {item.icon}
      <span className="font-azonix text-sm uppercase tracking-wide">{item.label}</span>
    </Link>
  );
}

function NavLinkInline({
  item,
  onNavigate,
  active,
}: {
  item: DashboardNavItem;
  onNavigate?: () => void;
  active?: boolean;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-block border-b-2 pb-0.5 font-azonix text-xs uppercase tracking-wide transition-colors sm:text-sm",
        active
          ? "border-[#00f976] text-gray-950 dark:text-white"
          : "border-transparent text-gray-800 hover:text-gray-950 dark:text-neutral-200 dark:hover:text-white",
      )}
    >
      {item.label}
    </Link>
  );
}

/** Desktop second row: primary routes + FAQ inline (Terms & Conditions stay in ☰ / mobile footer). */
function DesktopMainNavRow({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 pb-3 pt-2"
      aria-label="Main"
    >
      {primaryDashboardLinks.map((item) => (
        <NavLinkInline
          key={item.href}
          item={item}
          onNavigate={onNavigate}
          active={isDashboardNavActive(pathname, item.href)}
        />
      ))}
      <NavLinkInline
        item={faqDashboardLink}
        onNavigate={onNavigate}
        active={isDashboardNavActive(pathname, faqDashboardLink.href)}
      />
    </nav>
  );
}

export default function DashboardTopNav({
  username,
  avatarUrl = "https://placehold.co/36x36/ffffff/ffffff",
}: DashboardTopNavProps) {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { loading: subscriptionLoading } = useSubscription();
  const mainScrollTop = useDashboardMainScrollTop();
  const reduceMotion = useReducedMotion();
  /** Slight shadow once the main column scrolls */
  const scrolled = mainScrollTop > 4;
  /** 0 = nav fully visible, 1 = fully tucked (same scroll source as page content). */
  const desktopNavHideProgress = !DESKTOP_NAV_HIDE_ON_SCROLL
    ? 0
    : reduceMotion
      ? mainScrollTop >= DESKTOP_NAV_HIDE_SCROLL_RANGE
        ? 1
        : 0
      : Math.min(1, Math.max(0, mainScrollTop / DESKTOP_NAV_HIDE_SCROLL_RANGE));
  /** Fully hidden — ☰ panel only; also dismiss overlay when crossing this threshold. */
  const desktopNavCollapsed =
    DESKTOP_NAV_HIDE_ON_SCROLL &&
    mainScrollTop >= DESKTOP_NAV_HIDE_SCROLL_RANGE;

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const syncHeaderBottomVar = () => {
      const raw = header.getBoundingClientRect().bottom;
      if (!Number.isFinite(raw) || raw <= 0) return;
      /** Match measured header bottom only — a px floor was forcing ~152px and leaving a white band under the nav. */
      const px = Math.max(1, Math.ceil(raw));
      document.documentElement.style.setProperty(
        PICKEM_DASHBOARD_HEADER_BOTTOM_VAR,
        `${px}px`,
      );
    };

    syncHeaderBottomVar();
    requestAnimationFrame(() => syncHeaderBottomVar());
    const ro = new ResizeObserver(syncHeaderBottomVar);
    ro.observe(header);
    window.addEventListener("resize", syncHeaderBottomVar);
    window.addEventListener("orientationchange", syncHeaderBottomVar);
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    vv?.addEventListener("resize", syncHeaderBottomVar);
    vv?.addEventListener("scroll", syncHeaderBottomVar);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncHeaderBottomVar);
      window.removeEventListener("orientationchange", syncHeaderBottomVar);
      vv?.removeEventListener("resize", syncHeaderBottomVar);
      vv?.removeEventListener("scroll", syncHeaderBottomVar);
      document.documentElement.style.removeProperty(PICKEM_DASHBOARD_HEADER_BOTTOM_VAR);
    };
  }, []);

  /** Re-measure after subscription strip swaps loading → subscribed (height can change). */
  useLayoutEffect(() => {
    if (subscriptionLoading) return;
    const header = headerRef.current;
    if (!header) return;
    const syncHeaderBottomVar = () => {
      const raw = header.getBoundingClientRect().bottom;
      if (!Number.isFinite(raw) || raw <= 0) return;
      const px = Math.max(1, Math.ceil(raw));
      document.documentElement.style.setProperty(
        PICKEM_DASHBOARD_HEADER_BOTTOM_VAR,
        `${px}px`,
      );
    };
    syncHeaderBottomVar();
    requestAnimationFrame(() => syncHeaderBottomVar());
  }, [subscriptionLoading]);

  useLayoutEffect(() => {
    if (!mobileOpen) return;
    const header = headerRef.current;
    if (!header) return;
    const id = requestAnimationFrame(() => {
      const raw = header.getBoundingClientRect().bottom;
      if (!Number.isFinite(raw) || raw <= 0) return;
      const px = Math.max(1, Math.ceil(raw));
      document.documentElement.style.setProperty(
        PICKEM_DASHBOARD_HEADER_BOTTOM_VAR,
        `${px}px`,
      );
    });
    return () => cancelAnimationFrame(id);
  }, [mobileOpen]);

  const closeAll = () => {
    setMobileOpen(false);
  };

  const mobileOverlayTop = `var(${PICKEM_DASHBOARD_HEADER_BOTTOM_VAR})`;
  const mobileMenuSlideTransition = reduceMotion
    ? { duration: 0 }
    : { type: "tween" as const, ease: [0.22, 1, 0.36, 1] as const, duration: 0.35 };

  return (
    <header
      ref={headerRef}
      className={cn(
        "z-[60] w-full border-b-0 bg-white dark:bg-[#101010]",
        "md:border-b md:border-gray-200 dark:md:border-white/30",
        "relative md:sticky md:top-0",
        scrolled && "shadow-sm dark:shadow-black/40",
      )}
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* —— Mobile: promo banner + toolbar (logo + bell + theme; CTA is the banner) —— */}
      <div className="flex flex-col md:hidden">
        <div className="relative z-0 shrink-0">
          <MobileSubscriptionBanner />
        </div>
        {/*
          z-10 keeps the toolbar above the green strip in the stacking order so promo text/anti-aliasing
          cannot paint over the menu row (Safari compositing).
        */}
        <div className="relative z-10 flex items-center gap-x-2 border-t border-[#00f976] bg-white px-3 py-3 dark:bg-[#101010]">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-white/10"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <LuX className="h-6 w-6" /> : <ImMenu2 className="h-6 w-6" />}
          </button>

          <Link
            href="/dashboard"
            className="flex min-w-0 flex-1 items-center justify-center px-1"
          >
            <img
              src="/landing/logo.png"
              alt="Pickem Paintball"
              className="h-auto w-auto max-h-[55px] max-w-[min(153px,40vw)] object-contain object-center"
            />
          </Link>

          <HeaderNotificationsAndTheme className="shrink-0" />
        </div>
      </div>

      {/* —— Desktop: profile | logo | utilities + main nav row —— */}
      <div className="hidden md:block">
        <div className="grid min-h-[56px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2">
          <div className="flex items-center justify-start">
            <Link
              href="/dashboard/profile"
              className="shrink-0 rounded-lg p-0.5 hover:bg-gray-50 dark:hover:bg-white/5"
              aria-label={`Profile (${username})`}
            >
              <TopNavAvatar avatarUrl={avatarUrl} username={username} size="sm" />
            </Link>
          </div>
          <Link href="/dashboard" className="justify-self-center">
            <img
              src="/landing/logo.png"
              alt="Pickem Paintball"
              className="h-[50px] w-auto max-w-[min(300px,45vw)]"
            />
          </Link>
          <div className="flex justify-end">
            <HeaderUtilities />
          </div>
        </div>
        <div
          className="overflow-hidden"
          style={{
            maxHeight: `${(1 - desktopNavHideProgress) * DESKTOP_NAV_ROW_MAX_PX}px`,
            opacity: 1 - desktopNavHideProgress * 0.35,
            pointerEvents: desktopNavHideProgress >= 1 ? "none" : undefined,
          }}
          aria-hidden={desktopNavHideProgress >= 1}
        >
          <DesktopMainNavRow />
        </div>
      </div>

      {/* —— Mobile: full-height panel under fixed header; slides in from the left —— */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              className="fixed bottom-0 left-0 right-0 z-40 bg-black/40 md:hidden"
              style={{ top: mobileOverlayTop }}
              aria-label="Close menu backdrop"
              onClick={closeAll}
            />
            <motion.div
              initial={reduceMotion ? { x: 0 } : { x: "-100%" }}
              animate={{ x: 0 }}
              exit={reduceMotion ? { x: 0 } : { x: "-100%" }}
              transition={mobileMenuSlideTransition}
              className="fixed bottom-0 left-0 right-0 z-50 flex max-w-full flex-col border-t border-gray-200 bg-white dark:border-white/10 dark:bg-[#101010] md:hidden"
              style={{
                top: mobileOverlayTop,
                paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
              }}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
            >
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-2">
                  <Link
                    href="/dashboard/profile"
                    onClick={closeAll}
                    aria-label={`Profile (${username?.trim() || "account"})`}
                    className="mb-4 flex min-w-0 items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-white/10"
                  >
                    <div className="shrink-0">
                      <TopNavAvatar avatarUrl={avatarUrl} username={username} size="md" />
                    </div>
                    <span
                      className="min-w-0 flex-1 truncate font-azonix text-sm uppercase tracking-wide text-gray-900 dark:text-white"
                      title={username?.trim() || undefined}
                    >
                      {username?.trim() || "Profile"}
                    </span>
                  </Link>
                  <nav className="flex flex-col" aria-label="Main navigation">
                    {primaryDashboardLinks.map((item) => (
                      <NavLinkPill
                        key={item.href}
                        item={item}
                        onNavigate={closeAll}
                        active={isDashboardNavActive(pathname, item.href)}
                      />
                    ))}
                  </nav>
                </div>

                <div
                  className="shrink-0 border-t border-gray-200 bg-gray-50/80 px-2 pb-1 pt-4 dark:border-white/10 dark:bg-black/20"
                  aria-label="Legal and account"
                >
                  <nav className="flex flex-col">
                    {cmsDashboardLinks.map((item) => (
                      <NavLinkPill
                        key={item.href}
                        item={item}
                        onNavigate={closeAll}
                        active={isDashboardNavActive(pathname, item.href)}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        closeAll();
                        handleLogout();
                      }}
                      className="flex items-center gap-2 rounded-md px-2 py-3 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <LuLogOut className="h-5 w-5 shrink-0" />
                      <span className="font-azonix text-sm uppercase tracking-wide">Log out</span>
                    </button>
                  </nav>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
