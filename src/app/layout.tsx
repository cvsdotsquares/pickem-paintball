
import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../contexts/authProvider";
import ErrorBoundary from "../components/ErrorBoundary";
import NextTopLoader from "nextjs-toploader";
import { Inter } from 'next/font/google';

export const metadata: Metadata = {
  title: "PickEm Paintball Website",
  description: "Play Fantasy Paintball and support your player",
};

const inter = Inter({
  subsets: ['latin'], // Add additional subsets if needed
  variable: '--font-inter', // Create a CSS variable for the font
  display: 'swap', // Ensures fast rendering
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  console.log('RootLayout rendering');
  return (
    <html lang="en" className={inter.variable}>
      <body className={` bg-gray-100`}>
        <ErrorBoundary>
          <AuthProvider>
            <NextTopLoader
              color="white"
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