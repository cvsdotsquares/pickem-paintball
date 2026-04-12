import type { Metadata } from "next";
import LandingHome from "@/src/components/Landing/LandingHome";

const homeTitle = "PickEm Paintball Website";

/** Explicit for `/` so crawlers get the same story as the hero (and og/twitter match HTML meta). */
const homeDescription =
  "Live player stats. Free to play Pick'Em Paintball. Built by fans, for the fans.";

export const metadata: Metadata = {
  title: homeTitle,
  description: homeDescription,
  openGraph: {
    title: homeTitle,
    description: homeDescription,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: homeTitle,
    description: homeDescription,
  },
};

export default function Home() {
  return <LandingHome />;
}
