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
          "flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-600 dark:border-white/10 dark:text-white/60",
          className,
        )}
      >
        <FaHeart className="shrink-0 text-[#00f976]" />
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
        "flex items-center rounded-lg bg-[#00f976] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-950 transition hover:opacity-90",
        className,
      )}
    >
      Subscribe
    </button>
  );
}
