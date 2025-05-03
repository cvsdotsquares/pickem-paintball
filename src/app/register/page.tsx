"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loginWithGoogle,
  registerWithEmail,
  updateFirestoreName,
  uploadProfilePicture,
} from "@/src/lib/auth";
import { signOut } from "firebase/auth";
import { app, auth } from "@/src/lib/firebaseClient";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  setDoc,
  doc,
  collection,
  where,
  query,
  getDocs,
} from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";
import Button from "@/src/components/ui/button";
import { FaGoogle } from "react-icons/fa6";

const RegisterPage: React.FC = () => {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<number>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(
    null
  );
  const [tempProfilePictureUrl, setTempProfilePictureUrl] = useState<
    string | null
  >(null);
  const DEFAULT_PROFILE_PIC = "/placeholder.png"; // Add this constant
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // Add this near your other regex declarations
  const usernameRegex = /^[a-zA-Z0-9_]+$/;
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<
    boolean | null
  >(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const nameRegex = /^[a-zA-Z\s]+$/;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const badWords = ["badword1", "badword2"]; // Add actual bad words here
  const [usernameDebounceTimer, setUsernameDebounceTimer] =
    useState<NodeJS.Timeout | null>(null);

  const handleUsernameChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    setUsername(value);

    // Clear previous timer
    if (usernameDebounceTimer) {
      clearTimeout(usernameDebounceTimer);
    }

    // Validate format first
    if (!usernameRegex.test(value)) {
      setIsUsernameAvailable(null);
      return;
    }

    // Set new timer for debounce
    setUsernameDebounceTimer(
      setTimeout(async () => {
        if (value.length >= 3) {
          // Minimum username length
          setIsCheckingUsername(true);
          const isUnique = await checkUsernameUnique(value);
          setIsUsernameAvailable(isUnique);
          setIsCheckingUsername(false);
        } else {
          setIsUsernameAvailable(null);
        }
      }, 500) // 500ms debounce
    );
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // Show temporary preview
        const reader = new FileReader();
        reader.onload = () => {
          setTempProfilePictureUrl(reader.result as string);
        };
        reader.readAsDataURL(file);

        // Upload to storage and get URL
        const downloadURL = await uploadProfilePicture(file);
        setProfilePictureUrl(downloadURL);
      } catch (err) {
        setError("Failed to upload image. Using default placeholder.");
        setTempProfilePictureUrl(DEFAULT_PROFILE_PIC);
      }
    } else {
      // If user cancels upload, revert to placeholder
      setTempProfilePictureUrl(DEFAULT_PROFILE_PIC);
    }
  };

  const evaluatePasswordStrength = (password: string) => {
    if (password.length < 6) {
      setPasswordStrength("Weak");
    } else if (password.length < 12) {
      setPasswordStrength("Moderate");
    } else {
      setPasswordStrength("Strong");
    }
  };

  const containsProfanity = (text: string) => {
    const lowercasedText = text.toLowerCase();
    return badWords.some((word) => lowercasedText.includes(word));
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  const checkUsernameUnique = async (username: string): Promise<boolean> => {
    try {
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("username", "==", username.toLowerCase())
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.empty;
    } catch (err) {
      console.error("Error checking username:", err);
      return false;
    }
  };
  const handleRegisterStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      const userCredential = await registerWithEmail(email, password);
      const user = userCredential.user;

      // Save the email in Firestore temporarily
      await setDoc(doc(db, "users", user.uid), { email }, { merge: true });

      setStep(2);
    } catch (err: any) {
      setError(getFriendlyError(err));
    }
  };

  const handleRegisterStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nameRegex.test(firstName) || !nameRegex.test(lastName)) {
      setError("Please enter a valid name (only letters and spaces allowed).");
      return;
    }
    if (!usernameRegex.test(username)) {
      setError("Username can only contain letters, numbers, and underscores");
      return;
    }

    if (isUsernameAvailable === false) {
      setError("Please choose a different username");
      return;
    }

    if (isUsernameAvailable === null && username) {
      setError("Please wait while we check username availability");
      return;
    }

    if (
      containsProfanity(firstName) ||
      containsProfanity(lastName) ||
      containsProfanity(username)
    ) {
      setError("Your input contains inappropriate language.");
      return;
    }

    if (!username.trim()) {
      setError("Username is required.");
      return;
    }

    try {
      const user = auth.currentUser;
      if (user) {
        await updateFirestoreName(user.uid, `${firstName} ${lastName}`);

        await setDoc(
          doc(db, "users", user.uid),
          {
            firstName,
            lastName,
            username: username.trim().toLowerCase(),
            email: user.email || email,
            profilePicture: profilePictureUrl,
          },
          { merge: true }
        );

        setIsDialogOpen(true);
        await signOut(auth);
      }
    } catch (err: any) {
      setError(
        err.message || "Failed to complete profile setup. Please try again."
      );
    }
  };
  const getFriendlyError = (error: any): string => {
    if (!error.code) return "An unknown error occurred. Please try again.";

    switch (error.code) {
      // Auth Errors
      case "auth/email-already-in-use":
        return "This email is already registered. Please login or use a different email.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/weak-password":
        return "Password should be at least 6 characters.";
      case "auth/wrong-password":
        return "Incorrect password. Please try again.";
      case "auth/user-not-found":
        return "No account found with this email.";
      case "auth/too-many-requests":
        return "Too many attempts. Please try again later.";
      case "auth/account-exists-with-different-credential":
        return "This email is already registered with another method.";
      case "auth/popup-closed-by-user":
        return "Google sign-in was canceled. Please try again.";

      // Firestore Errors
      case "permission-denied":
        return "You don't have permission to perform this action.";
      case "not-found":
        return "Requested data not found.";

      // Network Errors
      case "auth/network-request-failed":
        return "Network error. Please check your connection.";

      // Default
      default:
        console.warn("Unhandled error code:", error.code);
        return "Something went wrong. Please try again.";
    }
  };
  const handleGoogleLogin = async () => {
    try {
      const userCredential = await loginWithGoogle();
      const user = userCredential.user;

      // Auto-fill all fields from Google
      const googleNameParts = user.displayName?.split(" ") || [];
      const suggestedUsername =
        user.email?.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "_") || "user";

      setFirstName(googleNameParts[0] || "");
      setLastName(googleNameParts.slice(1).join(" ") || "");
      setUsername(suggestedUsername);
      setEmail(user.email || "");

      // Set Google profile picture as default
      if (user.photoURL) {
        setProfilePictureUrl(user.photoURL);
        setTempProfilePictureUrl(user.photoURL);
      }

      // Check username availability
      const isUnique = await checkUsernameUnique(suggestedUsername);
      setIsUsernameAvailable(isUnique);

      setStep(2);
    } catch (err: any) {
      setError(getFriendlyError(err));
    }
  };
  return (
    <div className="flex items-center justify-center min-h-screen">
      <img
        src="/bg.jpg"
        alt="Paintball players"
        className="object-cover absolute inset-0 brightness-[0.7] contrast-[110%] saturate-[120%] size-full"
        loading="lazy"
      />
      <Card className="w-full max-w-md bg-transparent backdrop-blur-md text-white">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center uppercase">
            {step === 1 ? "Register to play!" : "Complete Your Profile"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {step === 1 ? (
            <form onSubmit={handleRegisterStep1} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    evaluatePasswordStrength(e.target.value);
                  }}
                  required
                />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                {password && (
                  <div className="text-sm">
                    Password strength:{" "}
                    <span className="font-medium">{passwordStrength}</span>
                  </div>
                )}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="showPassword"
                    checked={showPassword}
                    onChange={() => setShowPassword(!showPassword)}
                    className="mr-2"
                  />
                  <label htmlFor="showPassword">Show passwords</label>
                </div>
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              {message && <p className="text-green-500 text-sm">{message}</p>}
              {/* In your JSX */}
              <Button
                type="submit"
                className="w-full bg-green-600 text-white hover:bg-green-700"
              >
                {auth.currentUser ? "Complete Profile" : "Create Account"}
              </Button>
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
                className="w-full bg-white text-black border border-gray-300 hover:bg-gray-100 flex items-center justify-center gap-2"
              >
                <FaGoogle />
                Register with Google
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRegisterStep2} className="space-y-4">
              <div className="mb-6">
                <div className="flex items-center mb-4">
                  <img
                    src={
                      tempProfilePictureUrl ||
                      profilePictureUrl ||
                      auth.currentUser?.photoURL ||
                      DEFAULT_PROFILE_PIC
                    }
                    alt="Profile"
                    className="w-16 h-16 rounded-full border object-cover"
                  />

                  <button
                    type="button"
                    onClick={handleUploadClick}
                    className="ml-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    {auth.currentUser?.photoURL && !tempProfilePictureUrl
                      ? "Keep Google Photo"
                      : "Change Picture"}
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    onChange={handleFileChange}
                    accept="image/*"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Input
                  type="text"
                  placeholder="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required={
                    auth.currentUser?.providerData[0]?.providerId !==
                    "google.com"
                  }
                />
                <Input
                  type="text"
                  placeholder="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required={
                    auth.currentUser?.providerData[0]?.providerId !==
                    "google.com"
                  }
                />
                <Input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={handleUsernameChange}
                  required
                />
                <div className="text-xs text-gray-400 mt-1 mb-2">
                  Only letters (A-Z, a-z), numbers (0-9), and underscores (_)
                  are allowed
                </div>

                {username && !usernameRegex.test(username) && (
                  <p className="text-red-500 text-sm">
                    ❌ Invalid characters. Only A-Z, a-z, 0-9, and _ are
                    allowed.
                  </p>
                )}
                {isCheckingUsername && (
                  <p className="text-gray-500 text-sm">
                    ⌛ Checking username availability...
                  </p>
                )}
                {isUsernameAvailable === false && (
                  <p className="text-red-500 text-sm">
                    ❌ Username is already taken
                  </p>
                )}
                {isUsernameAvailable === true && (
                  <p className="text-green-500 text-sm">
                    ✓ Username is available!
                  </p>
                )}
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              {message && <p className="text-green-500 text-sm">{message}</p>}
              <Button
                type="submit"
                className="w-full bg-green-600 text-white hover:bg-green-700"
              >
                Complete Registration
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-white text-black">
          <DialogHeader>
            <DialogTitle className="text-center text-black">
              Thank you for registering!
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center space-y-4">
            <p className="text-center text-black">
              Please confirm your email before logging in. We&apos;ve sent you a
              verification link.
            </p>
            <Button
              onClick={() => router.push("/login")}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white"
            >
              Go to Login
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RegisterPage;
