"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ImMenu2 } from "react-icons/im";
import { LuChevronDown, LuLogOut, LuX } from "react-icons/lu";
import { MdDarkMode, MdLightMode } from "react-icons/md";
import { createPortal } from "react-dom";
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
        className="h-[30px] w-full shrink-0 animate-pulse"
        style={barStyle}
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

/**
 * Which child route the current path is on.
 *
 * Longest match wins, because the children overlap: "Event stats" is `/dashboard/stats`
 * and "All time" is `/dashboard/stats/all-time`, so a plain prefix test would light up
 * both on the all-time page. The longest matching href is the one actually being viewed.
 */
function activeChildHref(
  pathname: string | null,
  children: NonNullable<DashboardNavItem["children"]>,
): string | null {
  let best: string | null = null;
  for (const c of children) {
    if (!isDashboardNavActive(pathname, c.href)) continue;
    if (best === null || c.href.length > best.length) best = c.href;
  }
  return best;
}

const PILL_BASE =
  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-gray-900 transition md:py-1 dark:text-neutral-200";
const PILL_ACTIVE =
  "border-l-[3px] border-[#00f976] bg-[#00f976]/10 pl-[5px] dark:bg-[#00f976]/15";
const PILL_IDLE =
  "border-l-[3px] border-transparent hover:bg-gray-100 dark:hover:bg-white/10";

/**
 * A row in the mobile panel.
 *
 * An item with `children` is a DISCLOSURE, not a link: tapping it expands its routes
 * in place and pushes everything below down, rather than opening a second layer the
 * user has to navigate back out of. In a panel this tall there is room to expand in
 * flow, and staying in flow means the rest of the menu never leaves the screen.
 *
 * It deliberately does not navigate. Its own page is offered as one of the choices
 * ("Event stats"), so a tap that both expanded AND went somewhere would move the user
 * before they had chosen — the same rule the desktop row follows.
 */
function NavLinkPill({
  item,
  onNavigate,
  active,
  pathname,
}: {
  item: DashboardNavItem;
  onNavigate?: () => void;
  active?: boolean;
  pathname?: string | null;
}) {
  const children = item.children ?? [];
  const reduceMotion = useReducedMotion();
  const onChild = children.length > 0 ? activeChildHref(pathname ?? null, children) : null;
  // Opens already expanded when you are on one of its routes, so the menu shows where
  // you are rather than making you find it again. The panel unmounts on close, so this
  // is re-evaluated every time it opens.
  const [open, setOpen] = useState(onChild !== null);
  const panelId = `nav-sub-${item.label.replace(/\s+/g, "-").toLowerCase()}`;

  if (children.length === 0) {
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(PILL_BASE, active ? PILL_ACTIVE : PILL_IDLE)}
      >
        {item.icon}
        <span className="font-azonix text-sm uppercase tracking-wide">{item.label}</span>
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(PILL_BASE, onChild ? PILL_ACTIVE : PILL_IDLE)}
      >
        {item.icon}
        <span className="font-azonix text-sm uppercase tracking-wide">{item.label}</span>
        <LuChevronDown
          className={cn(
            "ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 dark:text-white/40",
            open && "rotate-180",
            reduceMotion && "transition-none",
          )}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {/* Indented under the parent's icon, with a rule running down it — the line
                is what makes the indent read as containment rather than a stray margin. */}
            <div className="ml-[21px] flex flex-col border-l border-gray-200 pl-3 pt-1 dark:border-white/10">
              {children.map((c) => {
                const childActive = c.href === onChild;
                return (
                  <Link
                    key={c.href}
                    href={c.href}
                    onClick={onNavigate}
                    aria-current={childActive ? "page" : undefined}
                    className={cn(
                      "rounded-md px-2 py-2 font-azonix text-xs uppercase tracking-wide transition",
                      childActive
                        ? "bg-[#00f976]/10 text-gray-900 dark:bg-[#00f976]/15 dark:text-white"
                        : "text-gray-600 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-white/10",
                    )}
                  >
                    {c.label}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const NAV_LINK_CLASS =
  "inline-block border-b-2 pb-0.5 font-azonix text-xs uppercase tracking-wide transition-colors sm:text-sm";

/**
 * A top-level nav item.
 *
 * Items with `children` toggle an expansion of the header itself rather than opening a
 * floating panel. The panel is therefore NOT rendered here — it is a sibling of the
 * whole nav row, full width, so this only reports which item is open.
 *
 * A parent with children does not navigate on click: its own page is offered as one of
 * the choices ("Event stats"), so clicking the label would otherwise take you somewhere
 * before you had chosen.
 */
function NavLinkInline({
  item,
  onNavigate,
  active,
  expanded,
  onToggle,
}: {
  item: DashboardNavItem;
  onNavigate?: () => void;
  active?: boolean;
  expanded?: boolean;
  onToggle?: (label: string | null) => void;
}) {
  // The green underline means "you are here", so an expanded menu must not borrow it —
  // it would mark Stats as the current page while you are still choosing. Expanded
  // shows as full-strength ink and a turned chevron instead.
  const linkClass = cn(
    NAV_LINK_CLASS,
    active
      ? "border-[#00f976] text-gray-950 dark:text-white"
      : cn(
          "border-transparent",
          expanded
            ? "text-gray-950 dark:text-white"
            : "text-gray-800 hover:text-gray-950 dark:text-neutral-200 dark:hover:text-white",
        ),
  );

  if (!item.children?.length) {
    return (
      <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={linkClass}>
        {item.label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      data-nav-trigger={item.label}
      aria-expanded={expanded}
      aria-haspopup="true"
      onClick={() => onToggle?.(expanded ? null : item.label)}
      className={cn(linkClass, "inline-flex items-center gap-1")}
    >
      {item.label}
      <span aria-hidden className={cn("text-[8px] transition-transform", expanded && "rotate-180")}>
        ▼
      </span>
    </button>
  );
}

/**
 * The expanded row, spanning the header.
 *
 * Sits below the nav row and outside the wrapper that collapses that row on scroll —
 * anything inside it is clipped to the row height, which is what left the earlier
 * floating panel zero pixels tall.
 */
function NavExpansionRow({
  item,
  onNavigate,
}: {
  item: DashboardNavItem;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const rowRef = useRef<HTMLDivElement>(null);
  const [padLeft, setPadLeft] = useState<number | null>(null);

  /**
   * Left-aligned to the item that opened it, not centred on the page.
   *
   * Sharing a left edge with the parent is what ties the two together — in LTR the eye
   * returns to a margin to scan a list, and a midpoint gives it nothing to land on.
   * It is also stable: centring would shift the whole row as options are added or
   * renamed, while an anchor does not move.
   *
   * The nav row above is centred, so this sits deliberately off-centre. That asymmetry
   * is the only cue pointing at WHICH item is open, so it is a feature rather than a
   * blemish to be balanced away.
   */
  useEffect(() => {
    const place = () => {
      const row = rowRef.current;
      const trigger = document.querySelector<HTMLElement>(
        `[data-nav-trigger="${item.label}"]`,
      );
      if (!row || !trigger) return;
      const left = trigger.getBoundingClientRect().left - row.getBoundingClientRect().left;
      setPadLeft(Math.max(left, 0));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [item.label]);

  return (
    <div
      ref={rowRef}
      className="border-t border-gray-200 bg-white dark:border-white/10 dark:bg-[#101010]"
    >
      <nav
        className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5"
        // Until measured, fall back to centred rather than flashing hard-left.
        style={padLeft == null ? { justifyContent: "center" } : { paddingLeft: padLeft }}
      >
        {item.children?.map((c) => {
          const here = pathname === c.href;
          return (
            <Link
              key={c.href}
              href={c.href}
              onClick={onNavigate}
              aria-current={here ? "page" : undefined}
              className={cn(
                "font-azonix text-[11px] uppercase tracking-wide transition-colors",
                here
                  ? "text-gray-950 dark:text-[#00f976]"
                  : "text-gray-500 hover:text-gray-950 dark:text-neutral-400 dark:hover:text-white",
              )}
            >
              {c.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Desktop second row: primary routes + FAQ inline (Terms & Conditions stay in ☰ / mobile footer). */
function DesktopMainNavRow({
  onNavigate,
  expanded,
  onToggle,
}: {
  onNavigate?: () => void;
  /** Label of the item whose row is open, if any. Owned by the header. */
  expanded?: string | null;
  onToggle?: (label: string | null) => void;
}) {
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
          expanded={expanded === item.label}
          onToggle={onToggle}
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
  /** Which nav item has expanded the header, by label. Null when collapsed. */
  const [expandedNav, setExpandedNav] = useState<string | null>(null);
  const expandedItem = primaryDashboardLinks.find(
    (i) => i.label === expandedNav && i.children?.length,
  );

  // Collapse on navigation and on Escape — an expanded header that survives a route
  // change reads as stuck rather than open.
  const navPathname = usePathname();
  useEffect(() => setExpandedNav(null), [navPathname]);
  useEffect(() => {
    if (!expandedNav) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedNav(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expandedNav]);
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
    >
      {/* —— Mobile: promo banner + toolbar (logo + bell + theme; CTA is the banner) —— */}
      <div className="flex flex-col md:hidden">
        {/* Fills the iOS safe-area zone with brand green so status bar region matches the CTA bar */}
        <div style={{ height: "env(safe-area-inset-top, 0px)", backgroundColor: PICKEM_BRAND_GREEN }} aria-hidden />
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
            <img src="/logo.svg" alt="Pickem Paintball" className="h-auto w-auto max-h-[55px] max-w-[min(153px,40vw)] object-contain object-center dark:hidden" />
            <img src="/logo-dark.svg" alt="Pickem Paintball" className="h-auto w-auto max-h-[55px] max-w-[min(153px,40vw)] object-contain object-center hidden dark:block" />
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
            <img src="/logo.svg" alt="Pickem Paintball" className="h-[50px] w-auto max-w-[min(300px,45vw)] dark:hidden" />
            <img src="/logo-dark.svg" alt="Pickem Paintball" className="h-[50px] w-auto max-w-[min(300px,45vw)] hidden dark:block" />
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
          <DesktopMainNavRow
            expanded={expandedNav}
            onToggle={setExpandedNav}
            onNavigate={() => setExpandedNav(null)}
          />
        </div>
        {/* Outside the collapsing wrapper on purpose: that wrapper clips to the nav
            row's height, which is what made a nested panel invisible. */}
        {expandedItem && (
          <NavExpansionRow item={expandedItem} onNavigate={() => setExpandedNav(null)} />
        )}
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
                        pathname={pathname}
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
