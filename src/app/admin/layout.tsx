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
      <header className="sticky top-0 z-30 flex items-center gap-6 border-b border-gray-200 dark:border-white/5 bg-white dark:bg-[#0d0d0d] px-5 py-3">
        <Link href="/admin" className="text-xs font-black uppercase tracking-widest">
          Pick&apos;Em Admin
        </Link>
        <nav className="flex gap-4 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-white/40">
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
        <span className="ml-auto text-[9px] uppercase tracking-widest text-gray-300 dark:text-white/25">
          Runs on this Mac only
        </span>
        <ThemeToggle />
      </header>
      {children}
    </div>
  );
}
