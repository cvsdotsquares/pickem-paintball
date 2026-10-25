import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import ThemeToggle from "@/src/components/Admin/ThemeToggle";
import { adminEnabled } from "@/src/lib/admin/gate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pick'Em Admin" };

/** The admin panel only exists on James's Mac (`npm run admin`); everywhere else it is a 404. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  if (!adminEnabled()) notFound();
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#111] text-gray-900 dark:text-white">
      {/* Phone (James 25 Oct 2026): the nav scrolls sideways, "Runs on this Mac only" and the theme word hide */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white px-3 py-3 dark:border-white/5 dark:bg-[#0d0d0d] sm:gap-6 sm:px-5">
        <Link href="/admin" className="shrink-0 text-xs font-black uppercase tracking-widest">
          Pick&apos;Em<span className="hidden sm:inline"> Admin</span>
        </Link>
        <nav className="flex min-w-0 flex-1 gap-4 overflow-x-auto whitespace-nowrap text-[11px] font-bold uppercase tracking-widest text-gray-400 [scrollbar-width:none] dark:text-white/40">
          <Link href="/admin/social" className="hover:text-gray-900 dark:hover:text-white">
            Social
          </Link>
          <Link href="/admin/todo" className="hover:text-gray-900 dark:hover:text-white">
            TO DO
          </Link>
          <Link href="/admin/scheduler" className="hover:text-gray-900 dark:hover:text-white">
            Schedule
          </Link>
          <Link href="/admin/workflows" className="hover:text-gray-900 dark:hover:text-white">
            Workflows
          </Link>
        </nav>
        <span className="hidden shrink-0 text-[9px] uppercase tracking-widest text-gray-300 dark:text-white/25 lg:inline">
          Runs on this Mac only
        </span>
        <div className="shrink-0">
          <ThemeToggle />
        </div>
      </header>
      {children}
    </div>
  );
}
