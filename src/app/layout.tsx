import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../contexts/authProvider";
import NextTopLoader from "nextjs-toploader";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import ErrorBoundary from "../components/Layout/ErrorBoundary";
import "@twallpaper/react/css";

export const metadata: Metadata = {
  title: "PickEm Paintball Website",
  description: "Play Fantasy Paintball and support your player",
};

const inter = Inter({
  subsets: ["latin"], // Add additional subsets if needed
  variable: "--font-inter", // Create a CSS variable for the font
  display: "swap", // Ensures fast rendering
});

const hanson = localFont({
  src: [
    {
      path: "../../public/fonts/Hanson.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-hanson", // Create a CSS variable for the font
});

const azonix = localFont({
  src: [
    {
      path: "../../public/fonts/Azonix.otf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-azonix", // Create a CSS variable for the font
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  console.log("RootLayout rendering");
  return (
    <html
      lang="en"
      className={`${inter.variable} ${hanson.variable} ${azonix.variable}`}
    >
      <body className={` bg-gray-100`}>
        <ErrorBoundary>
          <AuthProvider>
            <NextTopLoader
              color="#BFD641"
              initialPosition={0.3}
              crawlSpeed={800}
              height={6}
              crawl={true}
              showSpinner={true}
              easing="ease"
              speed={400}
              zIndex={5000}
              showAtBottom={false}
            />

            {children}
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
