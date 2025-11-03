"use client";
import React, { useEffect, useState, useCallback } from "react";
import { auth, db } from "@/src/lib/firebaseClient";
import { doc, getDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import Button from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";

interface Props {}

const nameRegex = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
const usernameRegex = /^[a-zA-Z0-9_]+$/;

const ProfileCompletion: React.FC<Props> = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [originalUsername, setOriginalUsername] = useState<string>("");
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  // Fetch existing data
  useEffect(() => {
    const run = async () => {
      const user = auth.currentUser;
      if (!user) { setLoading(false); return; }
      try {
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data: any = snap.data();
          console.log("ProfileCompletion fetch data:", data); // Debugging line
          const fn = (data.firstName || "").trim();
          const ln = (data.lastName || "").trim();
          const un = (data.username || "").trim();
          if (!fn || !ln || !un) {
            setFirstName(fn);
            setLastName(ln);
            setUsername(un);
            setOriginalUsername(un.toLowerCase());
            setOpen(true);
          }
          else {
            // Store original for unchanged detection even if modal not opened (future proof if logic changes)
            setOriginalUsername(un.toLowerCase());
          }
        } else {
          // No user doc yet -> force completion
          setOpen(true);
        }
      } catch (e) {
        console.error("ProfileCompletion fetch error", e);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const checkUsernameUnique = useCallback(async (value: string) => {
    if (!value || !usernameRegex.test(value)) { setUsernameAvailable(null); return; }
    // If unchanged from original, treat as available
    if (originalUsername && value.toLowerCase() === originalUsername) {
      setUsernameAvailable(true);
      return;
    }
    setCheckingUsername(true);
    try {
      const usersRef = collection(db, "users");
      const qy = query(usersRef, where("username", "==", value.toLowerCase()));
      const snapshot = await getDocs(qy);
      if (snapshot.empty) {
        setUsernameAvailable(true);
      } else {
        const currentUid = auth.currentUser?.uid;
        // If every doc returned is actually the current user, it's effectively available
        const others = snapshot.docs.filter(d => d.id !== currentUid);
        setUsernameAvailable(others.length === 0);
      }
    } catch (e) {
      console.error("Username check error", e);
      setUsernameAvailable(null);
    } finally {
      setCheckingUsername(false);
    }
  }, [originalUsername]);

  // Debounce username checking
  useEffect(() => {
    if (!open) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!username) { setUsernameAvailable(null); return; }
    const t = setTimeout(() => { checkUsernameUnique(username); }, 500);
    setDebounceTimer(t);
    return () => clearTimeout(t);
  }, [username, open, checkUsernameUnique]);

  const handleSave = async () => {
    setError(null);
    if (!auth.currentUser) return;
    if (!firstName || !lastName || !username) { setError("All fields required"); return; }
    if (!nameRegex.test(firstName) || !nameRegex.test(lastName)) { setError("Invalid name format"); return; }
    if (!usernameRegex.test(username)) { setError("Invalid username format"); return; }
    if (originalUsername && username.toLowerCase() === originalUsername) {
      // unchanged -> fine
    } else if (usernameAvailable === false) { setError("Username already taken"); return; }
    setSaving(true);
    try {
      const uid = auth.currentUser.uid;
      await setDoc(doc(db, "users", uid), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: username.trim().toLowerCase(),
      }, { merge: true });
      const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
      if (!auth.currentUser.displayName || auth.currentUser.displayName !== displayName) {
        await updateProfile(auth.currentUser, { displayName });
      }
      setOpen(false);
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-stone-900 border border-stone-700 rounded-lg p-6 space-y-4 text-white">
        <h2 className="text-xl font-azonix">Complete Your Profile</h2>
        <p className="text-sm text-neutral-300">We need a few more details to finish setting up your account.</p>
        <div className="space-y-3">
          <Input
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <Input
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <div>
            <Input
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <div className="mt-1 text-xs min-h-[18px]">
              {checkingUsername && <span className="text-neutral-400">Checking...</span>}
              {username && usernameAvailable === true && <span className="text-green-500">✓ Available</span>}
              {username && usernameAvailable === false && <span className="text-red-500">✗ Taken</span>}
              {username && !usernameRegex.test(username) && <span className="text-red-500">Invalid characters</span>}
            </div>
          </div>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2 justify-end pt-2">
          {/* <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={saving}>Later</Button> */}
          <Button type="button" className="bg-green-600 hover:bg-green-700" onClick={handleSave} disabled={saving || checkingUsername}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProfileCompletion;
