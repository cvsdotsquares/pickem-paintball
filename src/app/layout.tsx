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

/**
 * Variable Hitmarker — the only file with real `wght` / `wdth` axes.
 *
 * The three static faces below cannot hit the brand spec of wght 360 / wdth 25: 360
 * falls between the declared 300 and 400 so CSS snaps it to 300, and there is no width
 * axis at all. This VF exposes wght 300–900 and wdth 0–100.
 *
 * NOTE: this font's `wdth` axis is 0–100 (0 = Condensed, 30 = Normal), NOT the
 * OpenType-standard percentage. `font-stretch` therefore does nothing useful — the axis
 * must be driven through `font-variation-settings`.
 *
 * Rolling out surface by surface; see `[data-numeric="variable"]` in globals.css.
 */
const hitmarkerVariable = localFont({
  src: "../../public/fonts/HitmarkerVF-CondensedLight.ttf",
  weight: "300 900",
  variable: "--font-hitmarker-vf",
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
      className={`${industryDemi.variable} ${industryUltra.variable} ${hitmarkerCondensed.variable} ${hitmarkerVariable.variable}`}
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
