"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebaseClient";
import { useAuth } from "@/src/contexts/authProvider";
import { useSubscription } from "@/src/contexts/SubscriptionContext";
import { BADGES_LAUNCH_DATE, type UserBadges } from "@/src/lib/badges";
import BadgesAnnouncementModal from "./BadgesAnnouncementModal";

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null) {
    const maybe = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybe.toDate === "function") return maybe.toDate();
    if (typeof maybe.seconds === "number") return new Date(maybe.seconds * 1000);
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export default function BadgesAnnouncementController() {
  const { userId } = useAuth();
  const { isSubscribed, showModal } = useSubscription();
  const [userData, setUserData] = useState<Record<string, unknown> | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!userId) {
      setUserData(null);
      return;
    }
    const unsub = onSnapshot(doc(db, "users", userId), (snap) => {
      setUserData(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
    });
    return () => unsub();
  }, [userId]);

  useEffect(() => {
    if (!userData) return;
    const seen = userData.badgesAnnouncementSeen === true;
    if (seen) {
      setShow(false);
      return;
    }
    const createdAt = toDate(userData.createdAt);
    const isReturningUser = createdAt
      ? createdAt.getTime() < BADGES_LAUNCH_DATE.getTime()
      : true;
    if (isReturningUser) setShow(true);
  }, [userData]);

  const close = async () => {
    setShow(false);
    if (userId) {
      try {
        await updateDoc(doc(db, "users", userId), {
          badgesAnnouncementSeen: true,
        });
      } catch (err) {
        console.error("[badges] failed to mark announcement seen", err);
      }
    }
  };

  if (!userId) return null;

  return (
    <BadgesAnnouncementModal
      isOpen={show}
      onClose={close}
      badges={(userData?.badges ?? null) as UserBadges | null}
      isSubscribed={isSubscribed}
      onSubscribeClick={() => showModal("soft-gate")}
    />
  );
}
