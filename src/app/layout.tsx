
import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../contexts/authProvider";
import ErrorBoundary from "../components/ErrorBoundary";
import NextTopLoader from "nextjs-toploader";

export const metadata: Metadata = {
  title: "PickEm Paintball Website",
  description: "Play Fantasy Paintball and support your player",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  console.log('RootLayout rendering');
  return (
    <html lang="en">
      <body className={` bg-gray-100`}>
        <ErrorBoundary>
          <AuthProvider>
            <NextTopLoader
              color="white"
              initialPosition={0.3}
              crawlSpeed={500}
              height={6}
              crawl={true}
              showSpinner={true}
              easing="ease"
              speed={400}

              zIndex={1600}
              showAtBottom={false}
            />
            {children}
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}