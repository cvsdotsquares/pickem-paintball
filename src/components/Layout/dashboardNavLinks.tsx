import type { ReactNode } from "react";
import { GiCardRandom } from "react-icons/gi";
import { PiRankingThin } from "react-icons/pi";
import { FaTableList } from "react-icons/fa6";
import { ImStatsBars } from "react-icons/im";
import { FaQuestionCircle } from "react-icons/fa";
import { HiOutlineDocumentText, HiOutlineShieldCheck } from "react-icons/hi";

export type DashboardNavItem = {
  label: string;
  href: string;
  icon: ReactNode;
  /**
   * Sub-routes shown as a dropdown. `href` stays the item's own destination, so the
   * link still works if the menu never opens — keyboard, touch and no-JS all land
   * somewhere sensible rather than on a dead parent.
   */
  children?: { label: string; href: string; description?: string }[];
};

export const primaryDashboardLinks: DashboardNavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: (
      <FaTableList className="h-5 w-5 shrink-0 text-gray-600 dark:text-neutral-200" />
    ),
  },
  {
    label: "Stats",
    href: "/dashboard/stats",
    icon: (
      <ImStatsBars className="h-5 w-5 shrink-0 text-gray-600 dark:text-neutral-200" />
    ),
    children: [
      {
        label: "All time",
        href: "/dashboard/stats/all-time",
        description: "Every player, every event",
      },
      {
        label: "Event stats",
        href: "/dashboard/stats",
        description: "One event at a time",
      },
      {
        label: "Career stats",
        href: "/dashboard/players",
        description: "Browse players and their careers",
      },
    ],
  },
  {
    label: "Live PickEm",
    href: "/dashboard/pick-em",
    icon: (
      <GiCardRandom className="h-5 w-5 shrink-0 text-gray-600 dark:text-neutral-200" />
    ),
  },
  {
    label: "Leaderboards",
    href: "/dashboard/leaderboard",
    icon: (
      <PiRankingThin className="h-5 w-5 shrink-0 text-gray-600 dark:text-neutral-200" />
    ),
  },
];

export const faqDashboardLink: DashboardNavItem = {
  label: "FAQ",
  href: "/dashboard/faq",
  icon: (
    <FaQuestionCircle className="h-5 w-5 shrink-0 text-gray-600 dark:text-neutral-200" />
  ),
};

export const termsDashboardLink: DashboardNavItem = {
  label: "Terms & Conditions",
  href: "/dashboard/terms-and-conditions",
  icon: (
    <HiOutlineDocumentText className="h-5 w-5 shrink-0 text-gray-600 dark:text-neutral-200" />
  ),
};

export const privacyDashboardLink: DashboardNavItem = {
  label: "Privacy Policy",
  href: "/dashboard/privacy-policy",
  icon: (
    <HiOutlineShieldCheck className="h-5 w-5 shrink-0 text-gray-600 dark:text-neutral-200" />
  ),
};

/** Mobile footer: FAQ + Terms & Conditions + Privacy Policy (desktop also shows FAQ on the second nav row). */
export const cmsDashboardLinks: DashboardNavItem[] = [
  faqDashboardLink,
  termsDashboardLink,
  privacyDashboardLink,
];
