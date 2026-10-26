'use client';

import React, { ErrorInfo, ReactNode } from 'react';
import { reportClientError } from '@/src/lib/reportClientError';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // You can log the error here if needed
    console.error("Error caught by ErrorBoundary:", error);
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // You can log the error info here if needed
    console.error("Uncaught error:", error, errorInfo);
    reportClientError("site-crash", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-white p-6 text-center text-gray-900">
          <div>
            <h1 className="text-xl font-bold">Sorry, something went wrong.</h1>
            <p className="mt-2 text-sm text-gray-600">
              Reloading usually fixes it. If you have page translation on, try turning it off.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md bg-black px-4 py-2 text-sm text-white"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;