"use client";

import { useSubscription } from "@/src/contexts/SubscriptionContext";
import { cn } from "@/src/lib/utils";

/**
 * Beta gate for the career pages: the panel is still there, just out of focus.
 *
 * A BLUR, NOT A LOCK — and deliberately so, for the length of the beta. The data is
 * already in the page when this renders and `playerSummaries` is world-readable, so
 * anyone with dev tools can read what is behind it. That is an accepted trade while this
 * is a subscriber perk rather than a product: the job here is to show non-subscribers
 * exactly what they would get, not to withhold it from someone determined. If the gate
 * outlives the beta, the fix is a split projection with a Firestore rule, not a heavier
 * blur — see the paywall note in TODO.md.
 *
 * SECTION TITLES STAY OUTSIDE THIS. "Match detail" blurred to a smudge says nothing;
 * the title legible above a blurred table is the whole pitch.
 */
/**
 * Is the beta gate down for this viewer, and how to open the subscribe modal.
 *
 * One source for every gated thing on the page — the blurred panels, the locked share
 * cell and the all-time table's depth — so they cannot disagree about who this person is.
 *
 * `?gate=preview` forces the locked view for anyone. Everyone who can approve this
 * feature is a subscriber, so without it the gate is the one state of the page its
 * authors cannot look at. It only ever ADDS the gate, so the worst a stranger can do
 * with it is hide numbers from themselves.
 *
 * While the subscription is still loading the gate stays UP-less — a flash of blur on
 * every page load for a paying subscriber is worse than a moment of visibility.
 */
export function useBetaGate() {
  const { isSubscribed, loading, showModal } = useSubscription();
  const forced =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("gate") === "preview";
  return { locked: forced || (!loading && !isSubscribed), showModal };
}

export default function SubscriberBlur({
  children,
  className,
  compact = false,
  align = "center",
  message = "Beta access to career stats available to Pick\u2019Em subscribers",
}: {
  children: React.ReactNode;
  className?: string;
  /** What the prompt says, where the panel is not a career page's own stats. */
  message?: string;
  /** Tighter prompt for a small panel, where the two-line version crowds it out. */
  compact?: boolean;
  /** "top" for a tall panel, where centred puts the prompt below the fold. */
  align?: "center" | "top";
}) {
  const { locked, showModal } = useBetaGate();

  if (!locked) return <>{children}</>;

  return (
    <div className={cn("relative", className)}>
      {/*
        `pointer-events-none` on the wrapper covers the mouse, and `aria-hidden` keeps a
        screen reader out of a panel its user cannot act on. Keyboard focus can still
        reach a link in here — acceptable for a beta, and the honest alternative (not
        rendering the content at all) would cost the tease this exists for.
      */}
      {/*
        NO TINT OVER THE PANEL. A translucent sheet drawn across the blurred area ends
        somewhere — and that edge, sitting inside the panel's own padding, read as a
        rectangle laid on top of the page rather than as a panel out of focus. The blur
        alone carries it; the prompt gets its own small backing instead, which is a
        deliberate shape rather than a seam.
      */}
      <div aria-hidden className="pointer-events-none select-none blur-[6px] saturate-[0.55] opacity-80">
        {children}
      </div>

      <div
        className={cn(
          "absolute inset-0 z-10 flex flex-col items-center gap-3 px-4 text-center",
          // Three times the old top padding: over a long table the prompt was sitting on
          // the header row, which read as a tooltip rather than as the panel's own state.
          align === "top" ? "justify-start pt-[72px]" : "justify-center",
        )}
      >
        {/*
          No panel behind the words. A backing plate is a second rectangle on a surface
          that already has one too many — the blur is what separates this from the chart,
          and a shadow carries the contrast the plate was there for.
        */}
        <p
          className={cn(
            "max-w-[46ch] font-semibold leading-snug text-gray-900 drop-shadow-[0_1px_10px_rgba(255,255,255,0.9)] dark:text-white dark:drop-shadow-[0_1px_10px_rgba(0,0,0,0.9)]",
            compact ? "text-[12px]" : "text-[13px] sm:text-[14px]",
          )}
        >
          {message}
        </p>
        <button
          type="button"
          onClick={() => showModal("soft-gate")}
          className="rounded-lg bg-[#1a3c6e] px-5 py-2.5 font-azonix text-[10px] font-black uppercase tracking-[0.16em] text-white transition-colors hover:bg-[#1a3c6e]/90 dark:bg-[#00f976] dark:text-neutral-950 dark:hover:bg-[#00f976]/90"
        >
          Subscribe
        </button>
      </div>
    </div>
  );
}
