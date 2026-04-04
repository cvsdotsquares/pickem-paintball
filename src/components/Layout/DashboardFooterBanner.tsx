"use client";

import Link from "next/link";
import { FaFacebookF, FaInstagram } from "react-icons/fa6";
import { cn } from "@/src/lib/utils";

/** Swap for your real profile URLs. */
const SOCIAL_LINKS = [
  {
    href: "https://www.instagram.com/pickempaintball",
    label: "Instagram",
    Icon: FaInstagram,
  },
  {
    href: "https://www.facebook.com/profile.php?id=61575900956403",
    label: "Facebook",
    Icon: FaFacebookF,
  },
] as const;

const linkClass =
  "font-azonix text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600 transition-colors hover:text-[#00f976] dark:text-white/50 dark:hover:text-[#00f976]";

const iconBtnClass =
  "flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition-colors hover:border-[#00f976]/50 hover:text-[#00f976] dark:border-white/15 dark:text-white/60 dark:hover:border-[#00f976]/40 dark:hover:text-[#00f976]";

/**
 * Slim bottom strip: legal/help links + socials. Sits at the end of the dashboard scroll column.
 */
export default function DashboardFooterBanner({ className }: { className?: string }) {
  const year = new Date().getFullYear();

  return (
    <footer
      className={cn(
        "shrink-0 border-t border-gray-200 bg-gray-50/90 px-4 py-4 dark:border-white/10 dark:bg-black/30",
        "pb-[max(1rem,env(safe-area-inset-bottom,0px))]",
        className,
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 sm:flex-row sm:justify-between sm:gap-6">
        <nav
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 sm:justify-start"
          aria-label="Footer"
        >
          <Link href="/dashboard/faq" className={linkClass}>
            FAQ
          </Link>
          <span className="hidden text-gray-300 dark:text-white/15 sm:inline" aria-hidden>
            ·
          </span>
          <Link href="/dashboard/terms-and-conditions" className={linkClass}>
            T&amp;Cs
          </Link>
        </nav>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {SOCIAL_LINKS.map(({ href, label, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={iconBtnClass}
              aria-label={label}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </a>
          ))}
        </div>
      </div>

      <p className="mt-3 text-center font-azonix text-[9px] uppercase tracking-widest text-gray-400 dark:text-white/35">
        © {year} Pick&apos;em Paintball
      </p>
    </footer>
  );
}
