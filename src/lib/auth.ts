// src/firebase/auth.ts

import { deleteUser, EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, updateEmail, updatePassword, updateProfile } from "firebase/auth";
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    signOut,
    sendEmailVerification
} from "firebase/auth";
import { ref, uploadBytes, getDownloadURL, StorageReference } from "firebase/storage";
import { auth, db, googleProvider, storage } from "./firebaseClient";
import { NextRouter } from "next/router";
import { doc, updateDoc } from "firebase/firestore";

// Auth operations
export const loginWithEmail = (email: string, password: string) => {
    return signInWithEmailAndPassword(auth, email, password);
};

export const registerWithEmail = async (email: string, password: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(userCredential.user);
    return userCredential;
};

export const loginWithGoogle = () => {
    return signInWithPopup(auth, googleProvider);
};

export const logout = () => {
    return signOut(auth);
};
export const updateFirestoreName = async (userId: string, newName: string) => {
    const userDocRef = doc(db, "users", userId);
    await updateDoc(userDocRef, { name: newName });
};
export const checkEmailVerification = (router: NextRouter, setError: (message: string) => void) => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (user.emailVerified) {
                router.push('/dashboard');
            } else {
                setError('Please verify your email before accessing the dashboard.');
                sendEmailVerification(user);
            }
        }
    });
};

export const reauthenticate = async (currentPassword: string) => {
    if (!auth.currentUser || !auth.currentUser.email) {
        throw new Error("No authenticated user found");
    }
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
    return reauthenticateWithCredential(auth.currentUser, credential);
};

// Update user profile details (display name)
export const updateProfileDetails = async (firstName: string, lastName: string) => {
    if (!auth.currentUser) {
        throw new Error("No authenticated user found");
    }
    const displayName = `${firstName} ${lastName}`;
    return updateProfile(auth.currentUser, { displayName });
};

// Update the user's email address (requires reauthentication)
export const updateEmailAddress = async (currentPassword: string, newEmail: string) => {
    if (!auth.currentUser) {
        throw new Error("No authenticated user found");
    }
    await reauthenticate(currentPassword);
    return updateEmail(auth.currentUser, newEmail);
};

// Update the user's password (requires reauthentication)
export const updateUserPassword = async (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
) => {
    if (newPassword !== confirmPassword) {
        throw new Error("New passwords do not match");
    }
    if (!auth.currentUser) {
        throw new Error("No authenticated user found");
    }
    await reauthenticate(currentPassword);
    return updatePassword(auth.currentUser, newPassword);
};

// Upload a new profile picture and update the user profile with the photo URL
export const uploadProfilePicture = async (file: File): Promise<string> => {
    if (!auth.currentUser) {
        throw new Error("No authenticated user found");
    }
    const filePath = `user/${auth.currentUser.uid}/profile`;
    // Explicitly type the storage reference for TypeScript
    const storageRef: StorageReference = ref(storage, filePath);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);
    await updateProfile(auth.currentUser, { photoURL: downloadURL });
    return downloadURL;
};

// Delete the user account after reauthentication
export const deleteUserAccount = async (currentPassword: string) => {
    if (!auth.currentUser) {
        throw new Error("No authenticated user found");
    }
    await reauthenticate(currentPassword);
    return deleteUser(auth.currentUser);
};
