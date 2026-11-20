import { Suspense } from "react";
import AuthActionClient from "./AuthActionClient";

export const metadata = { title: "Pick'Em Paintball" };

/** Where our branded account emails link to (verify email, reset password). See src/lib/authEmailsServer.ts. */
export default function AuthActionPage() {
  return (
    <Suspense fallback={null}>
      <AuthActionClient />
    </Suspense>
  );
}
