"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { SHARE_COPY } from "@/src/lib/shareCopy";

/**
 * Image-first share: hands the rendered team-card PNG to the OS share sheet
 * (with a tap-through link as secondary text). Desktop / unsupported browsers
 * fall back to downloading the image + copying the link.
 *
 * The card render takes a few seconds, and navigator.share() must fire within
 * a tap's user-activation window — so we PRE-WARM the image on mount and reuse
 * the cached blob on click, making the share open instantly.
 * Trade-off: this downloads the (~1.2MB) card on dashboard load even if the
 * user never shares. Acceptable for now; revisit if bandwidth matters.
 */
export default function ShareTeamButton({
  uid,
  className,
}: {
  uid?: string | null;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const blobRef = useRef<Blob | null>(null);

  const imageUrl = uid
    ? `/api/share/og?uid=${encodeURIComponent(uid)}`
    : null;

  useEffect(() => {
    if (!imageUrl) return;
    let cancelled = false;
    fetch(imageUrl)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!cancelled && b) blobRef.current = b;
      })
      .catch(() => {
        /* best-effort pre-warm */
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  async function handleShare() {
    if (!uid || !imageUrl || loading) return;
    setLoading(true);
    try {
      const shareUrl = `${window.location.origin}/t/${uid}`;
      let blob = blobRef.current;
      if (!blob) {
        const res = await fetch(imageUrl);
        if (!res.ok) throw new Error(`render ${res.status}`);
        blob = await res.blob();
        blobRef.current = blob;
      }
      const file = new File([blob], SHARE_COPY.fileName, { type: "image/png" });

      if (
        typeof navigator !== "undefined" &&
        navigator.canShare?.({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: SHARE_COPY.title,
          text: SHARE_COPY.text,
          url: shareUrl,
        });
        return;
      }

      // Fallback: download the image + copy the link.
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = SHARE_COPY.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success(SHARE_COPY.downloadedToast);
      } catch {
        toast.success(SHARE_COPY.downloadedNoCopyToast);
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return; // share sheet dismissed
      console.error("Share failed", err);
      toast.error(SHARE_COPY.errorToast);
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
      {loading ? SHARE_COPY.preparingLabel : SHARE_COPY.buttonLabel}
    </button>
  );
}
