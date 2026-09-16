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
 * previous card can't be served back.
 *
 * THREE THINGS HAVE TO LINE UP FOR A SHARE, and they pull against each other:
 *   1. Firestore must already hold the picks on screen — the card renders from
 *      the server, so an unsaved edit renders the OLD team. Hence `onBeforeShare`,
 *      which lets the page flush its autosave before we render.
 *   2. The card must be rendered — multi-second, and unavoidable after an edit.
 *   3. navigator.share() must be called inside the tap's user-activation window,
 *      which (1) and (2) can easily overrun.
 * When they do, the browser rejects with NotAllowedError. That is not a failure
 * worth a toast: the card is in hand, so we arm the button ("Share now") and let
 * the next tap — which carries its own activation — open the sheet instantly.
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

/** Autosave already debounces; this only lets a burst of writes settle. */
const REWARM_DEBOUNCE_MS = 250;
/** How long to wait for the listener to catch up with a flushed save. */
const SNAPSHOT_SETTLE_MS = 4000;

/** Which screen the button sits on — recorded with every share. */
export type ShareSurface = "dashboard" | "pick-em" | "leaderboard" | "post-event";

type Phase =
  /** Nothing in progress. */
  | "idle"
  /** Saving / rendering — the spinner is up. */
  | "preparing"
  /** Card is ready; the browser refused the sheet, so the next tap opens it. */
  | "armed";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function ShareTeamButton({
  uid,
  surface,
  onBeforeShare,
  className,
  icon,
  labelClassName,
}: {
  uid?: string | null;
  surface: ShareSurface;
  /**
   * Persist anything the page is still holding locally, so the card renders the
   * team on screen rather than the last autosaved one. Resolves once the write
   * is acknowledged; returns true when it actually wrote something.
   */
  onBeforeShare?: () => Promise<boolean>;
  className?: string;
  /** Optional leading icon (e.g. a share glyph). */
  icon?: ReactNode;
  /** Class on the text label — pass "hidden sm:inline" for icon-only on mobile. */
  labelClassName?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [shareId, setShareId] = useState<string | null>(null);
  // null until the user doc's first snapshot lands; "na" if we can't read it.
  const [sig, setSig] = useState<string | null>(null);
  // Read inside async flows, where the state value would be a stale closure.
  const sigRef = useRef<string | null>(null);

  // Cached card, tagged with the URL it came from so a stale one is never reused.
  const blobRef = useRef<{ url: string; blob: Blob } | null>(null);
  // In-flight warm-up, so a click during pre-warm awaits it instead of racing it.
  const inflightRef = useRef<{ url: string; promise: Promise<Blob> } | null>(null);

  const urlFor = useCallback(
    (id: string, version: string | null) =>
      `/api/share/og?share=${encodeURIComponent(id)}&v=${encodeURIComponent(version ?? "na")}`,
    [],
  );
  const cardUrl = shareId && sig ? urlFor(shareId, sig) : null;

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
      (snap) => {
        const next = pickSignature(snap.get("pickems"));
        sigRef.current = next;
        setSig(next);
      },
      // Can't watch (offline / rules) — fall back to a single un-versioned warm-up.
      () => {
        sigRef.current = "na";
        setSig("na");
      },
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
    // sharing it is the bug this keying exists to prevent. An armed button is
    // holding that same stale card, so it stands down too.
    if (blobRef.current && blobRef.current.url !== cardUrl) {
      blobRef.current = null;
      setPhase((p) => (p === "armed" ? "idle" : p));
    }
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
    (
      shareIdForEvent: string,
      outcome: "shared" | "dismissed" | "failed",
      method: "native" | "download" | "unknown",
    ) => {
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
  const ensureShareId = useCallback(async (): Promise<string | null> => {
    if (shareId) return shareId;
    if (!uid) return null;
    try {
      const r = await fetch(`/api/share/link?uid=${encodeURIComponent(uid)}`);
      const d = r.ok ? await r.json() : null;
      if (d?.shareId) {
        setShareId(d.shareId as string);
        return d.shareId as string;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, [shareId, uid]);

  /**
   * Hand the card over. MUST NOT be preceded by an `await` on the tap that is
   * paying for it — every await risks the user-activation window.
   */
  const deliver = useCallback(
    async (blob: Blob, id: string) => {
      const file = new File([blob], SHARE_COPY.fileName, { type: "image/png" });

      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
        try {
          // Image-only on purpose: no `url`, so apps don't unfurl a second copy
          // of the card. The CTA (QR + URL) is baked into the image. The link is
          // still available via the desktop "copy link" fallback below.
          await navigator.share({
            files: [file],
            // No `title` — some targets concatenate title + text, duplicating
            // the line. Just the caption (the CTA lives baked into the image).
            text: SHARE_COPY.text,
          });
          report(id, "shared", "native");
          setPhase("idle");
        } catch (err) {
          const name = (err as Error)?.name;
          if (name === "AbortError") {
            // Sheet opened, then dismissed — intent without a share.
            report(id, "dismissed", "native");
            setPhase("idle");
            return;
          }
          if (name === "NotAllowedError") {
            // Activation expired while we saved/rendered. Nothing has gone
            // wrong and the card is ready — arm the button for the next tap.
            setPhase("armed");
            return;
          }
          throw err;
        }
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
        await navigator.clipboard.writeText(`${window.location.origin}/t/${id}`);
        toast.success(SHARE_COPY.downloadedToast);
      } catch {
        toast.success(SHARE_COPY.downloadedNoCopyToast);
      }
      // Downloading the card / copying the link counts as a share: it has left
      // the app and there is nothing further we can observe.
      report(id, "shared", "download");
      setPhase("idle");
    },
    [report],
  );

  /** Wait for the listener to reflect a save we just flushed. */
  const waitForSnapshot = useCallback(async (before: string | null) => {
    const started = Date.now();
    while (sigRef.current === before && Date.now() - started < SNAPSHOT_SETTLE_MS) {
      await sleep(60);
    }
  }, []);

  function handleShare() {
    if (!uid) return;
    if (phase === "preparing") return; // already working — the spinner says so

    // Armed: the card is in hand and this tap is fresh. Synchronous up to the
    // share call on purpose — an await here would forfeit the activation again.
    if (phase === "armed" && shareId && blobRef.current) {
      void deliver(blobRef.current.blob, shareId).catch((err) => {
        console.error("Share failed", err);
        report(shareId, "failed", "unknown");
        toast.error(SHARE_COPY.errorToast);
        setPhase("idle");
      });
      return;
    }

    setPhase("preparing");
    void (async () => {
      let id: string | null = null;
      try {
        id = await ensureShareId();
        if (!id) throw new Error("no shareId");

        // 1. Get the picks on screen into Firestore — the card renders from there.
        const before = sigRef.current;
        if (await onBeforeShare?.()) await waitForSnapshot(before);

        // 2. Render (or reuse) the card for exactly those picks.
        const blob = await fetchCard(urlFor(id, sigRef.current));

        // 3. Hand it over — or arm the button if we ran out of activation.
        await deliver(blob, id);
      } catch (err) {
        console.error("Share failed", err);
        if (id) report(id, "failed", "unknown");
        toast.error(SHARE_COPY.errorToast);
        setPhase("idle");
      }
    })();
  }

  const preparing = phase === "preparing";
  const label = preparing
    ? SHARE_COPY.preparingLabel
    : phase === "armed"
      ? SHARE_COPY.readyLabel
      : SHARE_COPY.buttonLabel;

  return (
    <button
      type="button"
      onClick={handleShare}
      // Deliberately NOT disabled while preparing: a greyed-out button reads as
      // broken and invites repeat taps. The spinner says "working" instead, and
      // the handler ignores the extra taps.
      disabled={!uid}
      aria-busy={preparing}
      aria-live="polite"
      className={`${className ?? ""} inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      {preparing ? (
        <span
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
          aria-hidden="true"
        />
      ) : icon ? (
        <span className="shrink-0 inline-flex" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={labelClassName}>{label}</span>
    </button>
  );
}
