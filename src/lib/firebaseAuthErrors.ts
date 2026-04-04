import { FirebaseError } from "firebase/app";

/** Maps Firebase Auth errors to readable copy (avoids masking real issues as "wrong password"). */
export function getFirebaseAuthErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Email or password is incorrect.";
      case "auth/invalid-email":
        return "Invalid email address.";
      case "auth/user-disabled":
        return "This account has been disabled.";
      case "auth/too-many-requests":
        return "Too many attempts. Try again in a few minutes.";
      case "auth/network-request-failed":
        return process.env.NODE_ENV === "development"
          ? "Network error. On localhost, check Google Cloud API key HTTP referrer allowlist (localhost + LAN IP) and restart dev."
          : "Network error. Check your connection and try again.";
      case "auth/invalid-api-key":
        return process.env.NODE_ENV === "development"
          ? "Invalid Firebase API key. Check .env.local matches Vercel and restart npm run dev."
          : "Sign-in service is misconfigured. Please try again later.";
      case "auth/operation-not-allowed":
        return "Email/password sign-in is not enabled for this project. Check Firebase Console → Authentication → Sign-in method.";
      default:
        return `Sign-in failed (${err.code}).`;
    }
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Sign-in failed. Please try again.";
}
