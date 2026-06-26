"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { SHARE_COPY } from "@/src/lib/shareCopy";

/**
 * Image-first share: hands the rendered team-card PNG to the OS share sheet
 * (with a tap-through link as secondary text). Desktop / unsupported browsers
 * fall back to downloading the image + copying the link.
 *
 * Share links use an opaque shareId (minted via /api/share/link) so raw uids
 * never appear in URLs. We resolve the id and PRE-WARM the image on mount, then
 * reuse the cached blob on click so navigator.share() fires inside the tap's
 * user-activation window (the render is multi-second).
 * Trade-off: downloads the (~1.2MB) card on dashboard load even if unused.
 */
export default function ShareTeamButton({
  uid,
  className,
}: {
  uid?: string | null;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);

  // Mint/fetch the opaque shareId on mount.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    fetch(`/api/share/link?uid=${encodeURIComponent(uid)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.shareId) setShareId(d.shareId);
      })
      .catch(() => {
        /* best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Pre-warm the card image once the shareId is known.
  useEffect(() => {
    if (!shareId) return;
    let cancelled = false;
    fetch(`/api/share/og?share=${encodeURIComponent(shareId)}`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!cancelled && b) blobRef.current = b;
      })
      .catch(() => {
        /* best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  async function ensureShareId(): Promise<string | null> {
    if (shareId) return shareId;
    if (!uid) return null;
    try {
      const r = await fetch(`/api/share/link?uid=${encodeURIComponent(uid)}`);
      const d = r.ok ? await r.json() : null;
      if (d?.shareId) {
        setShareId(d.shareId);
        return d.shareId as string;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  async function handleShare() {
    if (!uid || loading) return;
    setLoading(true);
    try {
      const id = await ensureShareId();
      if (!id) throw new Error("no shareId");

      const shareUrl = `${window.location.origin}/t/${id}`;
      let blob = blobRef.current;
      if (!blob) {
        const res = await fetch(`/api/share/og?share=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`render ${res.status}`);
        blob = await res.blob();
        blobRef.current = blob;
      }
      const file = new File([blob], SHARE_COPY.fileName, { type: "image/png" });

      if (
        typeof navigator !== "undefined" &&
        navigator.canShare?.({ files: [file] })
      ) {
        // Image-only on purpose: no `url`, so apps don't unfurl a second copy
        // of the card. The CTA (QR + URL) is baked into the image. The link is
        // still available via the desktop "copy link" fallback below.
        await navigator.share({
          files: [file],
          title: SHARE_COPY.title,
          text: SHARE_COPY.text,
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
