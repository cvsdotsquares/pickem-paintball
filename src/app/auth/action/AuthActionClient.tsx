"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { applyActionCode, confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "@/src/lib/firebaseClient";
import { getFirebaseAuthErrorMessage } from "@/src/lib/firebaseAuthErrors";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import Button from "@/src/components/ui/button";
import Navbar from "@/src/components/Landing/Navbar";

type View =
  | { kind: "working" }
  | { kind: "verified" }
  | { kind: "reset-form"; email: string }
  | { kind: "reset-done" }
  | { kind: "bad-link"; mode: string };

/** Handles the links in our account emails: ?mode=verifyEmail|resetPassword&oobCode=… (same codes as Firebase's page). */
export default function AuthActionClient() {
  const params = useSearchParams();
  const router = useRouter();
  const mode = params.get("mode") || "";
  const code = params.get("oobCode") || "";
  const [view, setView] = useState<View>({ kind: "working" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!code) {
      setView({ kind: "bad-link", mode });
      return;
    }
    if (mode === "verifyEmail") {
      applyActionCode(auth, code)
        .then(() => auth.currentUser?.reload().catch(() => undefined))
        .then(() => setView({ kind: "verified" }))
        .catch(() => setView({ kind: "bad-link", mode }));
    } else if (mode === "resetPassword") {
      verifyPasswordResetCode(auth, code)
        .then((email) => setView({ kind: "reset-form", email }))
        .catch(() => setView({ kind: "bad-link", mode }));
    } else {
      setView({ kind: "bad-link", mode });
    }
  }, [mode, code]);

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("Your password needs at least 6 characters.");
    if (password !== confirm) return setError("Those passwords don't match.");
    setSaving(true);
    try {
      await confirmPasswordReset(auth, code, password);
      setView({ kind: "reset-done" });
    } catch (err) {
      setError(getFirebaseAuthErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toLogin = (
    <Button type="button" onClick={() => router.push("/login")} className="w-full bg-black text-white hover:bg-gray-800">
      Log in
    </Button>
  );

  let title = "One moment…";
  let body: React.ReactNode = null;
  if (view.kind === "verified") {
    title = "You're in.";
    body = (
      <>
        <p className="text-center">Your email is confirmed. Log in and build your squad.</p>
        {toLogin}
      </>
    );
  } else if (view.kind === "reset-form") {
    title = "Let's get you back in.";
    body = (
      <form onSubmit={savePassword} className="space-y-4">
        <p className="text-center">Choose a new password for {view.email}.</p>
        <Input type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Input type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <Button type="submit" loading={saving} className="w-full bg-black text-white hover:bg-gray-800">
          Save my new password
        </Button>
      </form>
    );
  } else if (view.kind === "reset-done") {
    title = "Password updated.";
    body = (
      <>
        <p className="text-center">{"You're all set. Log in with your new password."}</p>
        {toLogin}
      </>
    );
  } else if (view.kind === "bad-link") {
    title = "This link has expired.";
    body = (
      <>
        <p className="text-center">
          {view.mode === "resetPassword"
            ? "Reset links only work once and for a short time. Head to the login page and tap Forgot Password? for a fresh one."
            : "It may have been used already. Try logging in: if your email still needs confirming, we'll tell you."}
        </p>
        {toLogin}
      </>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none fixed inset-0 z-0">
        <img
          src="/bg.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover brightness-[0.7] contrast-[110%] saturate-[120%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-pickem-navy via-pickem-navy/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-pickem-navy/50 via-pickem-navy/20 to-transparent" />
      </div>
      <div className="relative z-10 flex min-h-screen flex-col">
        <Navbar hideLogin forceLightMode />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="w-full max-w-md">
            <Card className="w-full bg-transparent backdrop-blur-md text-white">
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-center uppercase">{title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">{body}</CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
