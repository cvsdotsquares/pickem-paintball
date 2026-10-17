import Link from "next/link";

/** Admin home: one card per page. New pages (event setup, metrics) get added here as they're built. */
const PAGES = [
  {
    href: "/admin/library",
    title: "Post Library",
    blurb: "Every past post and Slack inspiration image. Filter by tags, fix tags, sign off the tag list, check inspo.",
  },
  {
    href: "/admin/generator",
    title: "Post Generator",
    blurb: "Make an event's posts the agreed way — brief, options A/B/C, review, sign off — and save them as templates for the event.",
  },
  {
    href: "/admin/todo",
    title: "TODO",
    blurb: "All outstanding work on one Trello-style board. Pivot by progress or by work stream; click a card for the detail.",
  },
  { title: "Event setup", blurb: "Later." },
  { title: "Site + subscription metrics", blurb: "Later." },
];

export default function AdminHome() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <h1 className="mb-6 text-[8px] font-black uppercase tracking-widest text-gray-400 dark:text-white/40">Pages</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {PAGES.map((p) => {
          const card = (
            <div
              className={`h-full rounded-xl border border-gray-100 dark:border-white/5 bg-white dark:bg-[#0d0d0d] p-5 ${
                p.href ? "hover:border-gray-400 dark:hover:border-white/30" : "opacity-50"
              }`}
            >
              <div className="mb-2 text-xs font-black uppercase tracking-widest">{p.title}</div>
              <p className="text-[11px] text-gray-500 dark:text-white/50">{p.blurb}</p>
            </div>
          );
          return p.href ? (
            <Link key={p.title} href={p.href}>
              {card}
            </Link>
          ) : (
            <div key={p.title}>{card}</div>
          );
        })}
      </div>
    </main>
  );
}
