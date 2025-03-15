"use client";
import React, { useState, useRef, useEffect } from "react";
import Button from "../ui/button";
import { TextField } from "../ui/TextField";
import Alert from "../ui/Alert";

// Import the auth functions
import {
    updateProfileDetails,
    updateEmailAddress,
    updateUserPassword,
    uploadProfilePicture,
    deleteUserAccount,
    updateFirestoreName,
} from "@/src/lib/auth";
import { auth } from "@/src/lib/firebaseClient";

function AccountSettings() {
    // States for profile info
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [emailPlaceholder, setEmailPlaceholder] = useState("");

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
        if (auth.currentUser) {
            const displayName = auth.currentUser.displayName || ""; // Full name, split if needed
            const email = auth.currentUser.email || "";

            // Assuming displayName is "FirstName LastName"
            const [firstName, lastName] = displayName.split(" ");

            setFirstName(firstName || ""); // Set to empty string if undefined
            setLastName(lastName || "");  // Set to empty string if undefined
            setEmailPlaceholder(email);
        }
    }, []);



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
                const downloadURL = await uploadProfilePicture(file);
                setMessage("Profile picture updated!");
                console.log("New profile picture URL:", downloadURL);
            } catch (err: any) {
                setError(err.message);
            }
        }
    };
    const nameRegex = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
    const badWords = [
        "asshole", "bastard", "bitch", "biatch", "bollocks", "cunt", "cock", "crap", "cocksucker",
        "damn", "dick", "douchebag", "dickhead", "fag", "faggot", "fuck", "fuckhead", "fuckface",
        "fucker", "motherfucker", "shit", "shitty", "ass", "bitchass", "slut", "whore", "dildo",
        "cum", "jizz", "piss", "pussy", "twat", "tits", "testicles", "ballsack", "fistfuck", "rape",
        "gangbang", "incest", "retard", "retarded", "spic", "chink", "nigger", "nigga", "gypsy", "kike",
        "cracker", "honkey", "wetback", "yellow", "paki", "sandnigger", "shemale", "tranny", "transphobic",
        "bimbo", "whore", "skank", "hooker", "prostitute", "pimp", "bastards", "asswipe", "shithead",
        "fuckwit", "assclown", "motherfucking", "shitstain", "buttfucker", "pansy", "wimp", "wanker",
        "prick", "fistfuck", "buttplug", "cockhead", "ballbag", "douche", "scumbag", "dickwad", "pussyfucker",
        "cockmonger", "cumbucket", "cumdumpster", "pissflaps", "shitmonger", "fuckhole", "spazz", "spastic",
        "wheelchairfreak", "cripple", "cancerfreak", "retardation", "mongoloid", "turd", "poop", "dung",
        "asscrack", "dirtywhore", "dirtyslut", "toilet", "gash", "fuker", "klit", "wetass", "anal", "anus",
        "smegma", "herpes", "gonorrhea", "chlamydia", "semen", "ejaculate", "creampie", "toxic", "fucktard",
        "fuckery", "clit", "twat", "bastardization", "bastardly", "clitlicker", "cocksniff", "cockslut",
        "suckmydick", "kissmyass", "shithole", "fuckme", "shag", "titfuck", "numbnuts", "butthurt", "buttfuck",
        "skankass", "filthywhore", "dirtycunt", "whorebag", "tramp", "hoes", "shagging", "ballbag", "douchefag",
        "fucktastic", "spermwhale", "beastiality", "pedo", "paedo", "pedeophile", "rapeapologist", "zoophilia",
        "necrophilia", "bestiality", "childporn", "incestuous", "childabuse", "sexualassault", "stalker", "harassment",
        "predator", "sexualpredator", "cyberbully", "incel", "domesticviolence", "abusive", "sexoffender",
        "whorehouse", "hookerhouse", "faggotry", "slutwalk", "cuntbag", "pussyhole", "masturbation", "cumfreak",
        "hotpants", "skankbitch", "cumguzzler", "fagboy", "lgbtphobic", "queerbait", "dildoqueen", "buttbitch",
        "jizzrag", "twatface", "slutface", "cockshot", "cumshot", "vulgar", "dirtyminded", "skumbag", "wankerface",
        "cuntslap", "assrat", "shitsticker", "pisswhore", "sackofshit", "fuckoff", "cuntmuffin", "cumflaps",
        "fuckstick", "whorehole", "shitfuck", "craphead", "cumfart", "fuckstorm", "dickstorm", "ballsackfucker",
        "cockjuice", "manwhore", "mangina", "slutbucket", "sextape", "fleshlight", "pussylicker", "vaginal", "cockring"
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

        try {
            // Update Firebase Auth profile (displayName)
            await updateProfileDetails(firstName, lastName);

            // Update Firestore document with the new name
            if (!auth.currentUser) {
                throw new Error("No authenticated user found");
            }
            await updateFirestoreName(auth.currentUser.uid, `${firstName} ${lastName}`);

            // If email field is filled, update the email too (requires reauthentication)
            if (email) {
                if (!currentPassword) {
                    throw new Error("Please enter your current password to update email.");
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

    // Handle account deletion
    const handleDeleteAccount = async () => {
        setMessage(null);
        setError(null);
        if (
            !window.confirm(
                "Are you sure you want to delete your account? This action is irreversible."
            )
        ) {
            return;
        }
        try {
            await deleteUserAccount(currentPassword);
            setMessage("Account deleted successfully!");
            // Optionally, redirect the user after deletion
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

            <div className="max-w-none flex flex-col items-center gap-2 self-baseline shadow-sm">
                <div className="flex w-full flex-col items-start gap-2">
                    {/* Profile Picture Upload Section */}
                    <div className="flex w-full flex-col items-start gap-2">
                        <div className="flex items-center gap-2">
                            <img
                                className="h-16 w-16 flex-none object-cover [clip-path:circle()]"
                                src="https://cdn-icons-png.freepik.com/256/14024/14024658.png?semt=ais_hybrid"
                                alt="Profile"
                            />
                            <div className="flex flex-col items-start gap-2">
                                <Button variant="secondary" onClick={handleUploadClick}>
                                    Upload
                                </Button>
                                <span className="text-caption font-caption text-subtext-color">
                                    For best results, upload an image 512x512 or larger.
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Profile Details Section */}
                    <div className="flex w-full items-center gap-2">
                        <TextField
                            className="h-auto grow"
                            label="First name"
                            helpText=""
                        >
                            <TextField.Input
                                placeholder={firstName || "Enter first name"}
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                            />
                        </TextField>
                        <TextField
                            className="h-auto grow"
                            label="Last name"
                            helpText=""
                        >
                            <TextField.Input
                                placeholder={lastName || "Enter last name"}
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                            />
                        </TextField>


                    </div>
                    <div className="flex w-full items-center gap-2">
                        <TextField className="h-auto grow" label="Email" helpText="">
                            <TextField.Input
                                placeholder={emailPlaceholder}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </TextField>

                    </div>
                    <Button variant="primary" onClick={handleProfileUpdate}>
                        Update Profile
                    </Button>
                    <div className="flex w-full flex-none flex-col items-center gap-2 bg-neutral-border" />

                    {/* Password Change Section */}
                    {isEmailPasswordAuth && (
                        <div className="flex w-full flex-col items-start gap-2">
                            <TextField className="h-auto w-full" label="Current password" helpText="">
                                <TextField.Input
                                    type="password"
                                    placeholder="Enter current password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                />
                            </TextField>
                            <TextField className="h-auto w-full" label="New password" helpText="Your password must have at least 8 characters, include one uppercase letter, and one number.">
                                <TextField.Input
                                    type="password"
                                    placeholder="Enter new password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                />
                            </TextField>
                            <TextField className="h-auto w-full" label="" helpText="">
                                <TextField.Input
                                    type="password"
                                    placeholder="Re-type new password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                />
                            </TextField>
                            <div className="flex w-full flex-col items-start justify-center gap-2">
                                <Button variant="primary" onClick={handleChangePassword}>
                                    Change password
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="flex h-px w-full flex-none flex-col items-center gap-2 bg-neutral-border" />

                    {/* Danger Zone Section */}
                    <div className="flex w-full flex-col items-start gap-2">
                        <span className="text-heading-3 font-heading-3 text-default-font">
                            Danger zone
                        </span>
                        <Alert
                            variant="error"
                            icon={null}
                            title="Delete account"
                            description="Permanently remove your account. This action is not reversible."
                            actions={
                                <Button variant="secondary" onClick={handleDeleteAccount}>
                                    Delete account
                                </Button>
                            }
                        />
                    </div>

                    {/* Display success/error messages */}
                    {message && (
                        <div className="mt-4">
                            <Alert variant="success" title="Success" description={message} />
                        </div>
                    )}
                    {error && (
                        <div className="mt-4">
                            <Alert variant="error" title="Error" description={error} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default AccountSettings;
