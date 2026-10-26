"use client";

// Side effect: keep browser page translation from crashing React (see the file).
import "@/src/lib/translationGuard";
import { Analytics } from "@vercel/analytics/react";
import { AuthProvider } from "@/src/contexts/authProvider";
import { SubscriptionProvider } from "@/src/contexts/SubscriptionContext";
import { ThemeProvider } from "@/src/contexts/ThemeContext";
import SubscriptionModalManager from "@/src/components/Subscription/SubscriptionModalManager";
import CheckoutReturn from "@/src/components/Subscription/CheckoutReturn";
import NextTopLoader from "nextjs-toploader";
import ErrorBoundary from "@/src/components/Layout/ErrorBoundary";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <SubscriptionProvider>
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
            <SubscriptionModalManager />
            <CheckoutReturn />
            <Analytics />
          </SubscriptionProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
