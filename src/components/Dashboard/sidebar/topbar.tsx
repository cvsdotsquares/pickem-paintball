"use client";

import React, { useEffect, useState } from "react";
import { auth, db } from "@/src/lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";
import DashboardTopNav from "@/src/components/Layout/DashboardTopNav";
import {
  resolveProfilePictureToUrl,
  subscribeProfileImagesRefresh,
} from "@/src/lib/resolveProfilePictureUrl";

const DEFAULT_PROFILE_PICTURE =
  "https://cdn-icons-png.freepik.com/256/14024/14024658.png?semt=ais_hybrid";

const PageHeader: React.FC = () => {
  const [username, setUsername] = useState("");
  const [profilePicture, setProfilePicture] = useState(DEFAULT_PROFILE_PICTURE);
  const [country, setCountry] = useState("");
  const [refreshEpoch, setRefreshEpoch] = useState(0);

  useEffect(() => {
    return subscribeProfileImagesRefresh(() => setRefreshEpoch((n) => n + 1));
  }, []);

  // Fetch user data - same pattern as settings.tsx
  useEffect(() => {
    if (auth.currentUser) {
      const fetchUserData = async () => {
        if (auth.currentUser) {
          const uid = auth.currentUser.uid;
          const userDocRef = doc(db, "users", uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const data = userDoc.data();
            setUsername(data?.username?.trim() || "");
            setCountry(data?.country?.trim() || "");

            // Resolve profile picture
            const resolved = await resolveProfilePictureToUrl(
              data?.profilePicture ?? null,
              { userId: uid }
            );
            if (resolved) {
              setProfilePicture(resolved);
            }
          }
        }
      };
      fetchUserData();
    }
  }, [refreshEpoch]);

  return (
    <div className="relative z-[60] w-full">
      <DashboardTopNav
        username={username}
        avatarUrl={profilePicture}
        points={country}
      />
    </div>
  );
};

export default PageHeader;
