"use client";

import { useState } from "react";
import { toast } from "react-toastify";

/**
 * Image-first share: hands the rendered team-card PNG to the OS share sheet
 * (with a tap-through link as secondary text). Desktop / unsupported browsers
 * fall back to downloading the image + copying the link.
 *
 * NOTE: navigator.share() needs transient user activation, and the OG image
 * currently takes a few seconds to render — on iOS that can outlast the
 * activation window. The fix is caching the image (task #7) so the fetch is
 * near-instant; until then mobile share is best-effort.
 */
export default function ShareTeamButton({
  uid,
  className,
}: {
  uid?: string | null;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleShare() {
    if (!uid || loading) return;
    setLoading(true);
    try {
      const shareUrl = `${window.location.origin}/t/${uid}`;
      const res = await fetch(`/api/share/og?uid=${encodeURIComponent(uid)}`);
      if (!res.ok) throw new Error(`render ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], "pickem-team.png", { type: "image/png" });
      const text = "Check out my PickEm Paintball team — build your own:";

      if (
        typeof navigator !== "undefined" &&
        navigator.canShare?.({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: "My PickEm Paintball team",
          text,
          url: shareUrl,
        });
        return;
      }

      // Fallback: download the image + copy the link.
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = "pickem-team.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Card downloaded & link copied");
      } catch {
        toast.success("Card downloaded");
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return; // share sheet dismissed
      console.error("Share failed", err);
      toast.error("Couldn't prepare your card — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={!uid || loading}
      aria-busy={loading}
      className={`${className ?? ""} disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      {loading ? "Preparing…" : "Share team"}
    </button>
  );
}
