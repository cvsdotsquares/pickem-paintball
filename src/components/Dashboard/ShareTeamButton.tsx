"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { toast } from "react-toastify";
import { db } from "@/src/lib/firebaseClient";
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
 *
 * The cached blob is keyed on a signature of the user's `pickems` map, taken
 * from a live Firestore listener: edit your team and the stale card is dropped
 * and re-warmed. The signature also rides along as `?v=` so a CDN copy of the
 * previous card can't be served back (the route is cached for a few minutes).
 */

/** Short, stable hash (djb2) — keeps the cache-buster a few chars, not a blob. */
function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Order-independent fingerprint of every pick the user holds, across events —
 * changes whenever picks or a captain change, and is stable otherwise.
 */
function pickSignature(pickems: unknown): string {
  if (!pickems || typeof pickems !== "object") return "none";
  const parts = Object.entries(pickems as Record<string, unknown>)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? [...v].map(String).sort().join(",") : String(v)}`)
    .sort();
  return hash(parts.join("|"));
}

/** Autosave fires ~2s after the last edit; wait for it to settle before re-rendering. */
const REWARM_DEBOUNCE_MS = 1200;

/** Which screen the button sits on — recorded with every share. */
export type ShareSurface = "dashboard" | "pick-em" | "leaderboard" | "post-event";

export default function ShareTeamButton({
  uid,
  surface,
  className,
  icon,
  labelClassName,
}: {
  uid?: string | null;
  surface: ShareSurface;
  className?: string;
  /** Optional leading icon (e.g. a share glyph). */
  icon?: ReactNode;
  /** Class on the text label — pass "hidden sm:inline" for icon-only on mobile. */
  labelClassName?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  // null until the user doc's first snapshot lands; "na" if we can't read it.
  const [sig, setSig] = useState<string | null>(null);

  // Cached card, tagged with the URL it came from so a stale one is never reused.
  const blobRef = useRef<{ url: string; blob: Blob } | null>(null);
  // In-flight warm-up, so a click during pre-warm awaits it instead of racing it.
  const inflightRef = useRef<{ url: string; promise: Promise<Blob> } | null>(null);

  const cardUrl =
    shareId && sig
      ? `/api/share/og?share=${encodeURIComponent(shareId)}&v=${encodeURIComponent(sig)}`
      : null;

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

  // Track the user's picks so an edit invalidates the cached card.
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, "users", uid),
      (snap) => setSig(pickSignature(snap.get("pickems"))),
      // Can't watch (offline / rules) — fall back to a single un-versioned warm-up.
      () => setSig("na"),
    );
  }, [uid]);

  const fetchCard = useCallback(async (url: string): Promise<Blob> => {
    const cached = blobRef.current;
    if (cached?.url === url) return cached.blob;
    const inflight = inflightRef.current;
    if (inflight?.url === url) return inflight.promise;

    const promise = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`render ${res.status}`);
      const blob = await res.blob();
      blobRef.current = { url, blob };
      return blob;
    })();
    inflightRef.current = { url, promise };
    promise.catch(() => {
      if (inflightRef.current?.url === url) inflightRef.current = null;
    });
    return promise;
  }, []);

  // Pre-warm, and re-warm whenever the picks change.
  useEffect(() => {
    if (!cardUrl) return;
    // Drop the previous card straight away: from here on it is known-stale, and
    // sharing it is the bug this keying exists to prevent.
    if (blobRef.current && blobRef.current.url !== cardUrl) blobRef.current = null;
    const timer = setTimeout(() => {
      fetchCard(cardUrl).catch(() => {
        /* best-effort — the click path retries */
      });
    }, REWARM_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [cardUrl, fetchCard]);

  /**
   * Report a finished attempt. Fire-and-forget with `keepalive` so it still
   * lands when the share sheet takes the user into another app.
   */
  const report = useCallback(
    (shareIdForEvent: string, outcome: "shared" | "dismissed" | "failed",
      method: "native" | "download" | "unknown") => {
      try {
        fetch("/api/share/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shareId: shareIdForEvent, outcome, method, surface }),
          keepalive: true,
        }).catch(() => {
          /* analytics must never break a share */
        });
      } catch {
        /* ignore */
      }
    },
    [surface],
  );

  /** The share URL needs the id even if the listener never reported in. */
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
      const url =
        cardUrl ??
        `/api/share/og?share=${encodeURIComponent(id)}&v=${encodeURIComponent(sig ?? "na")}`;
      const blob = await fetchCard(url);
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
          // No `title` — some targets concatenate title + text, duplicating the
          // line. Just the caption (the CTA lives baked into the image).
          text: SHARE_COPY.text,
        });
        report(id, "shared", "native");
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
      // Downloading the card / copying the link counts as a share: the card has
      // left the app and there is nothing further we can observe.
      report(id, "shared", "download");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        // Share sheet opened, then dismissed — intent without a share.
        if (shareId) report(shareId, "dismissed", "native");
        return;
      }
      console.error("Share failed", err);
      if (shareId) report(shareId, "failed", "unknown");
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
      className={`${className ?? ""} inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      {icon ? (
        <span className="shrink-0 inline-flex" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={labelClassName}>
        {loading ? SHARE_COPY.preparingLabel : SHARE_COPY.buttonLabel}
      </span>
    </button>
  );
}
