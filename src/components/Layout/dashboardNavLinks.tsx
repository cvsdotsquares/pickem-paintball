import type { ReactNode } from "react";
import { GiCardRandom } from "react-icons/gi";
import { PiRankingThin } from "react-icons/pi";
import { FaTableList } from "react-icons/fa6";
import { ImStatsBars } from "react-icons/im";
import { FaQuestionCircle } from "react-icons/fa";
import { HiOutlineDocumentText } from "react-icons/hi";

export type DashboardNavItem = {
  label: string;
  href: string;
  icon: ReactNode;
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
  label: "T&Cs",
  href: "/dashboard/terms-and-conditions",
  icon: (
    <HiOutlineDocumentText className="h-5 w-5 shrink-0 text-gray-600 dark:text-neutral-200" />
  ),
};

/** Mobile footer: FAQ + T&Cs (desktop also shows FAQ on the second nav row). */
export const cmsDashboardLinks: DashboardNavItem[] = [
  faqDashboardLink,
  termsDashboardLink,
];
