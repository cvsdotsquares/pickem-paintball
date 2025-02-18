import { UserProvider } from '../contexts/UserContext'
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ErrorBoundary from '../components/ErrorBoundary';
import { LoadingProvider } from '../contexts/LoadingContext';

import Auth from '../components/Auth';

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Next.js Firebase Template",
  description: "A template for creating web applications using Next.js and Firebase",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  console.log('RootLayout rendering');
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-100`}>
        <ErrorBoundary>
          <LoadingProvider>
            <UserProvider>
              <Auth />
              {children}
            </UserProvider>
          </LoadingProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}