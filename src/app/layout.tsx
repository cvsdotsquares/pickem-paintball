import type { Metadata, Viewport } from "next";
import "./globals.css";
import localFont from "next/font/local";
import AppProviders from "@/src/components/Layout/AppProviders";
import "@twallpaper/react/css";

export const metadata: Metadata = {
  title: "PickEm Paintball Website",
  description:
    "Live player stats. Free to play Pick'Em Paintball. Built by fans, for the fans.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

const industryDemi = localFont({
  src: [
    {
      path: "../../public/fonts/Industry-Demi.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-industry",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const industryUltra = localFont({
  src: [
    {
      path: "../../public/fonts/Industry-Ultra.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-industry-ultra",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

/** Standalone numerals (countdown, currency, stats) — not mixed into body copy. */
const hitmarkerCondensed = localFont({
  src: [
    {
      path: "../../public/fonts/HitmarkerCondensed-Light.ttf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../public/fonts/HitmarkerCondensed-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/HitmarkerCondensed-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-hitmarker-condensed",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${industryDemi.variable} ${industryUltra.variable} ${hitmarkerCondensed.variable}`}
    >
      <body
        className="min-h-screen bg-background antialiased"
        suppressHydrationWarning
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
