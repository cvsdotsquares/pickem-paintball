import Link from "next/link";

/**
 * The Social hub's tabs (James 25 Oct 2026): the posts' calendar, the Post Generator and the Post Library in one place.
 * The team's calendar (every agent's jobs as bullet points) is the Schedule tab.
 */
export type SocialTab = "calendar" | "generator" | "library";
const TABS: { id: SocialTab; label: string; href: string }[] = [
  { id: "calendar", label: "Calendar", href: "/admin/social" },
  { id: "generator", label: "Post Generator", href: "/admin/social?tab=generator" },
  { id: "library", label: "Post Library", href: "/admin/social?tab=library" },
];

export default function SocialTabs({ active }: { active: SocialTab }) {
  return (
    <div className="flex items-center gap-1 border-b border-gray-200 bg-white px-5 dark:border-white/5 dark:bg-[#0d0d0d]">
      <span className="mr-3 text-[11px] font-black uppercase tracking-widest">📣 Social</span>
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={`border-b-2 px-3 py-2 text-[11px] font-bold uppercase tracking-widest ${
            t.id === active ? "border-gray-900 text-gray-900 dark:border-white dark:text-white" : "border-transparent text-gray-400 hover:text-gray-900 dark:text-white/40 dark:hover:text-white"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
