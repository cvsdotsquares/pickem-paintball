"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/contexts/authProvider";
import { signOut } from "firebase/auth";
import { auth, db } from "@/src/lib/firebaseClient";
import { loginWithEmail, loginWithGoogle } from "@/src/lib/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { doc, getDoc, setDoc } from "firebase/firestore";
import Button from "@/src/components/ui/button";
import { sendPasswordResetEmail } from "firebase/auth"; // Import reset function

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [resetEmail, setResetEmail] = useState<string>(""); // For password reset email input
  const [showResetForm, setShowResetForm] = useState<boolean>(false); // Toggle the reset form
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      if (user.emailVerified) {
        router.push("/dashboard");
      } else {
        setError("Please verify your email before logging in.");
        signOut(auth); // Sign out unverified users
      }
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const userCredential = await loginWithEmail(email, password);
      const user = userCredential.user;

      // Check if the user's email is verified
      if (user.emailVerified) {
        // Check if the user already exists in Firestore
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);

        if (!userDoc.exists()) {
          // If the user doesn't exist, create a new document
          await setDoc(userRef, {
            email: user.email,
            createdAt: new Date(),
            pickems: {}, // Initialize with empty pickems
            total_points: 0, // Initialize total points
          });
          console.log("User created in Firestore");
        }

        router.push("/dashboard");
      } else {
        setError("Please verify your email before accessing the dashboard.");
        await signOut(auth); // Sign out unverified user
      }
    } catch (err) {
      setError("Login failed. Please check your credentials.");
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const userCredential = await loginWithGoogle();
      const user = userCredential.user;

      // Check if the user already exists in Firestore
      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        // If the user doesn't exist, create a new document
        await setDoc(userRef, {
          email: user.email,
          createdAt: new Date(),
          pickems: {}, // Initialize with empty pickems
          total_points: 0, // Initialize total points
        });
        console.log("User created in Firestore");
      }

      router.push("/dashboard");
    } catch (err) {
      setError("Google login failed.");
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await sendPasswordResetEmail(auth, resetEmail); // Send reset email
      alert("Password reset email sent. Check your inbox!");
      setShowResetForm(false); // Hide the reset form
    } catch (err) {
      setError("Error sending password reset email.");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <img
        src="/bg.webp"
        alt="Paintball players"
        className="object-cover absolute inset-0 brightness-[0.7] contrast-[110%] saturate-[120%] size-full"
        loading="lazy"
      />
      <Card className="w-full max-w-md bg-transparent backdrop-blur-md text-white">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center  uppercase">
            Come Join US!
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <Button
              type="submit"
              className="w-full bg-black text-white hover:bg-gray-800"
            >
              Log in
            </Button>
            <div className="flex flex-row-reverse items-center justify-between m-auto">
              <div className="text-center text-sm text-white">
                Don&apos;t have <br className="flex md:hidden" /> an account?{" "}
                <br className="flex md:hidden" />
                <a href="/register" className="text-blue-300 underline">
                  Sign up
                </a>
              </div>

              {/* Forgot Password Link */}
              <div className="text-center text-white text-sm ">
                <button
                  type="button"
                  onClick={() => setShowResetForm(!showResetForm)}
                  className="text-blue-300 underline"
                >
                  Forgot Password?
                </button>
              </div>
            </div>
            {/* Password Reset Form */}
            {showResetForm && (
              <form onSubmit={handlePasswordReset} className="space-y-4 mt-4">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
                <Button
                  type="submit"
                  className="w-full bg-blue-500 text-white hover:bg-blue-600"
                >
                  Reset Password
                </Button>
              </form>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 rounded text-black font-inter font-extrabold text-xl">
                  OR
                </span>
              </div>
            </div>
            <Button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full bg-white text-black border border-gray-300 hover:bg-gray-100"
            >
              {/* Google Icon */}
              <svg
                className="w-5 h-5 mr-2"
                viewBox="0 0 48 48"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.28 0 6.27 1.25 8.47 3.28l6.24-6.24C34.13 3.43 29.29 1 24 1 14.4 1 6.21 6.53 2.39 14.24l7.25 5.63C11.43 14.1 17.2 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.61 24.63c0-1.45-.13-2.85-.38-4.2H24v8.16h12.74c-.55 2.99-2.23 5.52-4.8 7.23l7.25 5.63C43.99 37.73 46.61 31.65 46.61 24.63z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.25 28.8c-1.22-3.68-1.22-7.68 0-11.36l-7.25-5.63C-.63 17.54-.63 31.73 2.99 40.75l7.26-5.62z"
                />
                <path
                  fill="#34A853"
                  d="M24 46c5.29 0 10.13-1.83 13.91-4.97l-7.25-5.63C28.74 37.57 26.49 38.5 24 38.5c-6.8 0-12.57-4.6-14.36-10.86l-7.26 5.62C6.21 41.47 14.4 46 24 46z"
                />
                <path fill="none" d="M0 0h48v48H0z" />
              </svg>
              Log in with Google
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
