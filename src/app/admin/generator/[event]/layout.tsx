import type { ReactNode } from "react";
import SocialTabs from "@/src/components/Admin/SocialTabs";

/** A post type or graphic in the Post Generator sits inside the Social hub (James 25 Oct 2026). */
export default function GeneratorEventLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SocialTabs active="generator" />
      {children}
    </>
  );
}
