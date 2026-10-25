import GeneratorBoard from "@/src/components/Admin/GeneratorBoard";
import PostLibrary from "@/src/components/Admin/PostLibrary";
import SocialCalendar from "@/src/components/Admin/SocialCalendar";
import SocialTabs, { type SocialTab } from "@/src/components/Admin/SocialTabs";

/** The Social hub (James 25 Oct 2026): ?tab=calendar (default) | generator | library. ?slot=<id> opens a post on the calendar. */
export default async function SocialPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const active: SocialTab = tab === "generator" || tab === "library" ? tab : "calendar";
  return (
    <>
      <SocialTabs active={active} />
      {active === "calendar" && <SocialCalendar />}
      {active === "generator" && <GeneratorBoard />}
      {active === "library" && <PostLibrary />}
    </>
  );
}
