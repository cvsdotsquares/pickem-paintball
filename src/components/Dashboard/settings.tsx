"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import Button from "../ui/button";
import { TextField } from "../ui/TextField";
import Alert from "../ui/Alert";
import { auth, db } from "@/src/lib/firebaseClient";
import { doc, setDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import {
  forceRefreshAllProfileImages,
  resolveProfilePictureToUrl,
  subscribeProfileImagesRefresh,
} from "@/src/lib/resolveProfilePictureUrl";

// Import the auth functions
import {
  updateProfileDetails,
  updateEmailAddress,
  updateUserPassword,
  uploadProfilePicture,
  deleteUserAccount,
  updateFirestoreName,
} from "@/src/lib/auth";
import {
  profileSectionBody,
  profileSectionTitle,
} from "@/src/components/Layout/profileSectionTokens";

const usernameRegex = /^[a-zA-Z0-9_]+$/;

/** Same fallback as profile page / top bar when no photo is set. */
const DEFAULT_PROFILE_PLACEHOLDER =
  "https://cdn-icons-png.freepik.com/256/14024/14024658.png?semt=ais_hybrid";

function AccountSettings() {
  const [profilePictureUrl, setProfilePictureUrl] =
    useState<string>(DEFAULT_PROFILE_PLACEHOLDER);
  const [profileImageRefreshEpoch, setProfileImageRefreshEpoch] = useState(0);

  // States for profile info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [emailPlaceholder, setEmailPlaceholder] = useState("");
  const [username, setUsername] = useState("");
  const [originalUsername, setOriginalUsername] = useState("");
  const [hasChangedUsername, setHasChangedUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  // States for password update
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // States for alerts/messages
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEmailPasswordAuth, setIsEmailPasswordAuth] = useState(false);

  // Check user's auth provider on mount
  useEffect(() => {
    if (auth.currentUser) {
      const providerId = auth.currentUser.providerData[0]?.providerId;
      setIsEmailPasswordAuth(providerId === "password");
    }
  }, []);

  useEffect(() => {
    return subscribeProfileImagesRefresh(() =>
      setProfileImageRefreshEpoch((n) => n + 1),
    );
  }, []);

  /** Resolved display URL for the avatar (matches profile sidebar + top nav). */
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    let cancelled = false;
    (async () => {
      const userDocRef = doc(db, "users", uid);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists() || cancelled) {
        setProfilePictureUrl(DEFAULT_PROFILE_PLACEHOLDER);
        return;
      }
      const raw = userDoc.data()?.profilePicture ?? null;
      let url = DEFAULT_PROFILE_PLACEHOLDER;
      const resolved = await resolveProfilePictureToUrl(raw, { userId: uid });
      if (resolved) url = resolved;
      if (!cancelled) setProfilePictureUrl(url);
    })();

    return () => {
      cancelled = true;
    };
  }, [profileImageRefreshEpoch]);

  useEffect(() => {
    if (auth.currentUser) {
      const fetchUserData = async () => {
      if (auth.currentUser) {
        const userDocRef = doc(db, "users", auth.currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        const email = auth.currentUser.email || "";

        // Assuming displayName is "FirstName LastName"
        let first = userDoc.data()?.firstName;
        let last = userDoc.data()?.lastName;
        if (!first && !last) {
          const displayName = auth.currentUser.displayName || ""; // Full name, split if needed
          const [f, l] = displayName.split(" ");
          first = f || "";
          last = l || "";
        }
        setFirstName(first || ""); // Set to empty string if undefined
        setLastName(last || ""); // Set to empty string if undefined
        setEmailPlaceholder(email);
        const un = (userDoc.data()?.username || "").trim();
        setUsername(un);
        setOriginalUsername(un.toLowerCase());
        setHasChangedUsername(!!userDoc.data()?.hasChangedUsername);
      }
    };
    fetchUserData();
    }
  }, []);

  const checkUsernameUnique = useCallback(async (value: string) => {
    if (!value || !usernameRegex.test(value)) {
      setUsernameAvailable(null);
      return;
    }
    if (originalUsername && value.toLowerCase() === originalUsername) {
      setUsernameAvailable(true);
      return;
    }
    setCheckingUsername(true);
    try {
      const usersRef = collection(db, "users");
      const qy = query(usersRef, where("username", "==", value.toLowerCase()));
      const snapshot = await getDocs(qy);
      const others = snapshot.docs.filter((d) => d.id !== auth.currentUser?.uid);
      setUsernameAvailable(others.length === 0);
    } catch {
      setUsernameAvailable(null);
    } finally {
      setCheckingUsername(false);
    }
  }, [originalUsername]);

  useEffect(() => {
    if (!username) {
      setUsernameAvailable(null);
      return;
    }
    const t = setTimeout(() => checkUsernameUnique(username), 500);
    return () => clearTimeout(t);
  }, [username, checkUsernameUnique]);

  // File input ref for profile picture upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle profile picture upload
  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const storagePath = await uploadProfilePicture(file);
        // Update Firestore with the storage path
        if (auth.currentUser) {
          const uid = auth.currentUser.uid;
          await setDoc(
            doc(db, "users", uid),
            { profilePicture: storagePath },
            { merge: true }
          );
          const resolved = await resolveProfilePictureToUrl(storagePath, {
            userId: uid,
          });
          if (resolved) setProfilePictureUrl(resolved);
          forceRefreshAllProfileImages();
        }
        setMessage("Profile picture updated!");
    
      } catch (err: any) {
        setError(err.message);
      }
    }
  };
  const nameRegex = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
  const badWords = [
    "asshole",
    "bastard",
    "bitch",
    "biatch",
    "bollocks",
    "cunt",
    "cock",
    "crap",
    "cocksucker",
    "damn",
    "dick",
    "douchebag",
    "dickhead",
    "fag",
    "faggot",
    "fuck",
    "fuckhead",
    "fuckface",
    "fucker",
    "motherfucker",
    "shit",
    "shitty",
    "ass",
    "bitchass",
    "slut",
    "whore",
    "dildo",
    "cum",
    "jizz",
    "piss",
    "pussy",
    "twat",
    "tits",
    "testicles",
    "ballsack",
    "fistfuck",
    "rape",
    "gangbang",
    "incest",
    "retard",
    "retarded",
    "spic",
    "chink",
    "nigger",
    "nigga",
    "gypsy",
    "kike",
    "cracker",
    "honkey",
    "wetback",
    "yellow",
    "paki",
    "sandnigger",
    "shemale",
    "tranny",
    "transphobic",
    "bimbo",
    "whore",
    "skank",
    "hooker",
    "prostitute",
    "pimp",
    "bastards",
    "asswipe",
    "shithead",
    "fuckwit",
    "assclown",
    "motherfucking",
    "shitstain",
    "buttfucker",
    "pansy",
    "wimp",
    "wanker",
    "prick",
    "fistfuck",
    "buttplug",
    "cockhead",
    "ballbag",
    "douche",
    "scumbag",
    "dickwad",
    "pussyfucker",
    "cockmonger",
    "cumbucket",
    "cumdumpster",
    "pissflaps",
    "shitmonger",
    "fuckhole",
    "spazz",
    "spastic",
    "wheelchairfreak",
    "cripple",
    "cancerfreak",
    "retardation",
    "mongoloid",
    "turd",
    "poop",
    "dung",
    "asscrack",
    "dirtywhore",
    "dirtyslut",
    "toilet",
    "gash",
    "fuker",
    "klit",
    "wetass",
    "anal",
    "anus",
    "smegma",
    "herpes",
    "gonorrhea",
    "chlamydia",
    "semen",
    "ejaculate",
    "creampie",
    "toxic",
    "fucktard",
    "fuckery",
    "clit",
    "twat",
    "bastardization",
    "bastardly",
    "clitlicker",
    "cocksniff",
    "cockslut",
    "suckmydick",
    "kissmyass",
    "shithole",
    "fuckme",
    "shag",
    "titfuck",
    "numbnuts",
    "butthurt",
    "buttfuck",
    "skankass",
    "filthywhore",
    "dirtycunt",
    "whorebag",
    "tramp",
    "hoes",
    "shagging",
    "ballbag",
    "douchefag",
    "fucktastic",
    "spermwhale",
    "beastiality",
    "pedo",
    "paedo",
    "pedeophile",
    "rapeapologist",
    "zoophilia",
    "necrophilia",
    "bestiality",
    "childporn",
    "incestuous",
    "childabuse",
    "sexualassault",
    "stalker",
    "harassment",
    "predator",
    "sexualpredator",
    "cyberbully",
    "incel",
    "domesticviolence",
    "abusive",
    "sexoffender",
    "whorehouse",
    "hookerhouse",
    "faggotry",
    "slutwalk",
    "cuntbag",
    "pussyhole",
    "masturbation",
    "cumfreak",
    "hotpants",
    "skankbitch",
    "cumguzzler",
    "fagboy",
    "lgbtphobic",
    "queerbait",
    "dildoqueen",
    "buttbitch",
    "jizzrag",
    "twatface",
    "slutface",
    "cockshot",
    "cumshot",
    "vulgar",
    "dirtyminded",
    "skumbag",
    "wankerface",
    "cuntslap",
    "assrat",
    "shitsticker",
    "pisswhore",
    "sackofshit",
    "fuckoff",
    "cuntmuffin",
    "cumflaps",
    "fuckstick",
    "whorehole",
    "shitfuck",
    "craphead",
    "cumfart",
    "fuckstorm",
    "dickstorm",
    "ballsackfucker",
    "cockjuice",
    "manwhore",
    "mangina",
    "slutbucket",
    "sextape",
    "fleshlight",
    "pussylicker",
    "vaginal",
    "cockring",
  ];

  const containsProfanity = (name: string) => {
    const lowercasedName = name.toLowerCase();
    return badWords.some((word) => lowercasedName.includes(word));
  };

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  const handleProfileUpdate = async () => {
    setMessage(null);
    setError(null);

    // Validate first name and last name
    if (!nameRegex.test(firstName) || !nameRegex.test(lastName)) {
      setError("Please enter a valid name (only letters and spaces allowed).");
      return;
    }

    // Check for profanity in first and last names
    if (containsProfanity(firstName) || containsProfanity(lastName)) {
      setError("Your name contains inappropriate language.");
      return;
    }

    // Validate email
    if (email && !emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    // Validate username if changed
    if (username && hasChangedUsername === false) {
      if (!usernameRegex.test(username)) {
        setError("Username can only contain letters, numbers, and underscores.");
        return;
      }
      if (username.length < 3) {
        setError("Username must be at least 3 characters.");
        return;
      }
      if (username.toLowerCase() !== originalUsername) {
        if (usernameAvailable === false) {
          setError("Username is already taken.");
          return;
        }
        if (usernameAvailable === null && checkingUsername) {
          setError("Please wait for the availability check to complete.");
          return;
        }
        if (usernameAvailable !== true) {
          setError("Please choose an available username.");
          return;
        }
      }
      if (containsProfanity(username)) {
        setError("Username contains inappropriate language.");
        return;
      }
    }

    try {
      // Update Firebase Auth profile (displayName)
      await updateProfileDetails(firstName, lastName);

      // Update Firestore document with the new name
      if (!auth.currentUser) {
        throw new Error("No authenticated user found");
      }
      await updateFirestoreName(
        auth.currentUser.uid,
        `${firstName} ${lastName}`.trim(),
        firstName.trim(),
        lastName.trim()
      );

      // Update username if allowed (one-time change)
      if (username && hasChangedUsername === false && username.trim().toLowerCase() !== originalUsername) {
        await setDoc(
          doc(db, "users", auth.currentUser.uid),
          {
            username: username.trim().toLowerCase(),
            hasChangedUsername: true,
          },
          { merge: true }
        );
        setOriginalUsername(username.trim().toLowerCase());
        setHasChangedUsername(true);
      }

      // If email field is filled, update the email too (requires reauthentication)
      if (email) {
        if (!currentPassword) {
          throw new Error(
            "Please enter your current password to update email."
          );
        }
        await updateEmailAddress(currentPassword, email);
      }
      setMessage("Profile updated successfully!");
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Handle password change
  const handleChangePassword = async () => {
    setMessage(null);
    setError(null);
    try {
      await updateUserPassword(currentPassword, newPassword, confirmPassword);
      setMessage("Password changed successfully!");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-none flex w-full items-start mobile:flex-col mobile:gap-0">
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      <div className="max-w-none w-full md:w-auto flex flex-col pb-6 md:pb-0 items-center gap-4 self-baseline">
        <div className="flex w-full flex-col items-start gap-4">
          {/* Profile Picture Upload Section */}
          <div className="flex w-full flex-col items-start gap-4">
            <div className="flex items-center gap-4">
              <img
                className="h-16 w-16 flex-none object-cover [clip-path:circle()]"
                src={profilePictureUrl}
                alt="Profile"
                referrerPolicy="no-referrer"
              />
              <div className="flex flex-col items-start gap-4">
                <Button variant="secondary" onClick={handleUploadClick}>
                  Upload
                </Button>
              </div>
            </div>
          </div>

          {/* Profile Details Section */}
          <div className="flex w-full items-center font-azonix text-gray-900 dark:text-white gap-4">
            <TextField
              className="h-auto grow text-gray-900 dark:text-white"
              label="First name"
              helpText=""
            >
              <TextField.Input
                className="font-sans text-gray-900 dark:text-neutral-200 bg-white dark:bg-gray-800"
                placeholder={firstName || "Enter first name"}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </TextField>
            <TextField
              className="h-auto grow text-gray-900 dark:text-white"
              label="Last name"
              helpText=""
            >
              <TextField.Input
                className="font-sans text-gray-900 dark:text-neutral-200 bg-white dark:bg-gray-800"
                placeholder={lastName || "Enter last name"}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </TextField>
          </div>
          <div className="flex w-full items-center font-azonix gap-4">
            <TextField
              className="h-auto grow text-gray-900 dark:text-white"
              label="Email"
              helpText=""
            >
              <TextField.Input
                className="font-sans text-gray-900 dark:text-neutral-200 bg-white dark:bg-gray-800"
                placeholder={emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </TextField>
          </div>
          <div className="flex w-full flex-col items-start gap-1">
            <TextField
              className="h-auto grow text-gray-900 dark:text-white w-full"
              label="Username"
              helpText={hasChangedUsername ? "Username cannot be changed again." : "Usernames can only be changed once."}
            >
              <TextField.Input
                className="font-sans text-gray-900 dark:text-neutral-200 bg-white dark:bg-gray-800"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={hasChangedUsername}
              />
            </TextField>
            {!hasChangedUsername && username && (
              <span className="text-sm text-amber-600 dark:text-amber-400">
                {checkingUsername && "Checking availability..."}
                {!checkingUsername && usernameAvailable === true && "✓ Available"}
                {!checkingUsername && usernameAvailable === false && "✗ Username taken"}
                {!checkingUsername && !usernameRegex.test(username) && "Invalid: use only letters, numbers, underscores"}
              </span>
            )}
          </div>
          <Button variant="primary" onClick={handleProfileUpdate}>
            Update Profile
          </Button>

          {/* Password Change Section */}
          {isEmailPasswordAuth && (
            <div className="flex w-full flex-col items-start gap-4">
              <TextField
                className="h-auto w-full text-gray-900 dark:text-white"
                label="Current password"
                helpText=""
              >
                <TextField.Input
                  type="password"
                  className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </TextField>
              <TextField
                className="h-auto w-full text-gray-900 dark:text-white"
                label="New password"
                helpText="Your password must have at least 8 characters, include one uppercase letter, and one number."
              >
                <TextField.Input
                  type="password"
                  className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </TextField>
              <TextField
                className="h-auto w-full text-gray-900 dark:text-white"
                label=""
                helpText=""
              >
                <TextField.Input
                  type="password"
                  className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  placeholder="Re-type new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </TextField>
              <div className="flex w-full flex-col items-start justify-center gap-4">
                <Button variant="primary" onClick={handleChangePassword}>
                  Change password
                </Button>
              </div>
            </div>
          )}

          {/* Display success/error messages */}
          {message && (
            <div className="mt-4 flex flex-col gap-1 w-72 fixed top-2 right-2 z-50 pointer-events-none">
              <Alert variant="success" title="Success" description={message} />
            </div>
          )}
          {error && (
            <div className="mt-4 flex flex-col gap-1 w-72 fixed top-2 right-2 z-50 pointer-events-none">
              <Alert variant="error" title="Error" description={error} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Renders at the bottom of the profile page (after Session). Own password field for delete reauth. */
export function ProfileDangerZone() {
  const [deletePassword, setDeletePassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEmailPasswordAuth, setIsEmailPasswordAuth] = useState(false);

  useEffect(() => {
    if (auth.currentUser) {
      const providerId = auth.currentUser.providerData[0]?.providerId;
      setIsEmailPasswordAuth(providerId === "password");
    }
  }, []);

  const handleDeleteAccount = async () => {
    setMessage(null);
    setError(null);
    if (isEmailPasswordAuth && !deletePassword.trim()) {
      setError("Enter your current password to delete your account.");
      return;
    }
    if (
      !window.confirm(
        "Are you sure you want to delete your account? This action is irreversible."
      )
    ) {
      return;
    }
    try {
      await deleteUserAccount(deletePassword);
      setMessage("Account deleted successfully!");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="flex w-full flex-col items-start gap-4">
      <p className={profileSectionBody}>
        Actions here permanently affect your account. Only continue if you intend to delete it.
      </p>
      {isEmailPasswordAuth && (
        <TextField className="h-auto w-full max-w-md text-gray-900 dark:text-white" label="Current password" helpText="">
          <TextField.Input
            type="password"
            className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            placeholder="Enter your password to confirm deletion"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
          />
        </TextField>
      )}
      <Alert
        variant="error"
        className="font-sans text-gray-900 dark:text-neutral-200"
        icon={null}
        title="Delete account"
        description="Permanently remove your account. This action is not reversible."
        actions={
          <Button className="h-auto" variant="destructive" onClick={handleDeleteAccount}>
            Delete account
          </Button>
        }
      />
      {message && (
        <div className="mt-4 flex flex-col gap-1 w-72 fixed top-2 right-2 z-50 pointer-events-none">
          <Alert variant="success" title="Success" description={message} />
        </div>
      )}
      {error && (
        <div className="mt-4 flex flex-col gap-1 w-72 fixed top-2 right-2 z-50 pointer-events-none">
          <Alert variant="error" title="Error" description={error} />
        </div>
      )}
    </div>
  );
}

export default AccountSettings;
