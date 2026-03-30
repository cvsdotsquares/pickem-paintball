import { Suspense } from "react";
import RegisterPageClient from "./RegisterPageClient";

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
          Loading…
        </div>
      }
    >
      <RegisterPageClient />
    </Suspense>
  );
}
