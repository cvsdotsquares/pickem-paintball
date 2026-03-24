"use client";

import { useSubscription } from "@/src/contexts/SubscriptionContext";
import { cn } from "@/src/lib/utils";
import { FaHeart } from "react-icons/fa";

export default function SupportButton({ className }: { className?: string }) {
  const { isSubscribed, showModal } = useSubscription();

  if (isSubscribed) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg bg-[#00f976] px-4 py-2 text-sm font-semibold text-neutral-950",
          className,
        )}
      >
        <FaHeart className="shrink-0" />
        <span className="hidden sm:inline">Subscriber - Thank You!</span>
        <span className="sm:hidden">Subscribed</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => showModal("passive")}
      className={cn(
        "flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700",
        className,
      )}
    >
      <FaHeart className="shrink-0" />
      <span className="hidden sm:inline">Support Pick&apos;Em</span>
      <span className="sm:hidden">Support</span>
    </button>
  );
}
