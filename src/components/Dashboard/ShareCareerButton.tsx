"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

/**
 * Share a player's career, season or event as a graphic.
 *
 * WHAT TRAVELS IS THE IMAGE, not a link — the same decision the team card made. A URL in
 * the share payload makes WhatsApp and Discord unfurl a second copy of the card beneath
 * it, so the branding and the call to action are baked into the PNG instead.
 *
 * GENERATE, THEN PREVIEW, THEN SHARE — deliberately three steps rather than two.
 * `navigator.share()` has to be called inside the user activation from a tap, and a card
 * takes a couple of seconds to render; awaiting that fetch inside the click handler
 * spends the activation and iOS then refuses the share. The team card avoids this by
 * pre-warming its single card on mount, which cannot work here: there are as many cards
 * as the player has seasons and events, and rendering them all on page load would be
 * absurd. So the picker renders the chosen card, shows it, and the share tap that follows
 * has the blob already in hand.
 *
 * It is also the better of the two designs: the player sees exactly what they are about
 * to post.
 */

export interface ShareScopeOption {
  id: string;
  label: string;
  /** Query string for /api/share/career, minus the player. */
  query: string;
  group: "Career" | "Seasons" | "Events";
}

export default function ShareCareerButton({
  playerId,
  playerName,
  scopes,
  className,
  labelClassName,
}: {
  playerId: string;
  playerName: string;
  scopes: ShareScopeOption[];
  className?: string;
  labelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const urlRef = useRef<string | null>(null);

  // Revoke the object URL when the preview closes or the component unmounts; a 240KB
  // blob per generated card adds up over a browsing session.
  const clearPreview = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    blobRef.current = null;
    setPreview(null);
  }, []);
  useEffect(() => clearPreview, [clearPreview]);

  async function generate(scope: ShareScopeOption) {
    if (busy) return;
    setBusy(scope.id);
    try {
      const res = await fetch(
        `/api/share/career?player=${encodeURIComponent(playerId)}&${scope.query}`,
      );
      if (!res.ok) throw new Error(`render ${res.status}`);
      const blob = await res.blob();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      blobRef.current = blob;
      urlRef.current = URL.createObjectURL(blob);
      setPreview({ url: urlRef.current, label: scope.label });
      setOpen(false);
    } catch (err) {
      console.error("Career card render failed", err);
      toast.error("Couldn't build that card — try again.");
    } finally {
      setBusy(null);
    }
  }

  const fileName = `${playerName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-nxl.png`;

  function download() {
    if (!urlRef.current) return;
    const a = document.createElement("a");
    a.href = urlRef.current;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success("Card downloaded");
  }

  async function share() {
    const blob = blobRef.current;
    if (!blob) return;
    const file = new File([blob], fileName, { type: "image/png" });
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      try {
        // Image only, no `url` — see the note at the top of this file.
        await navigator.share({ files: [file], text: `${playerName} — NXL career 🎯` });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return; // sheet dismissed
        console.error("Share failed", err);
      }
    }
    download();
  }

  const groups: ShareScopeOption["group"][] = ["Career", "Seasons", "Events"];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${className ?? ""} inline-flex items-center justify-center gap-2`}
      >
        <span className="shrink-0 inline-flex" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
          </svg>
        </span>
        <span className={labelClassName}>Share</span>
      </button>

      {/* SCOPE PICKER */}
      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full sm:max-w-md max-h-[80vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0d0d0d] border border-white/10 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-white text-sm font-bold uppercase tracking-[0.18em] mb-1">
              Share a card
            </div>
            <div className="text-white/40 text-xs mb-4">{playerName}</div>
            {groups.map((g) => {
              const items = scopes.filter((s) => s.group === g);
              if (!items.length) return null;
              return (
                <div key={g} className="mb-4">
                  {g !== "Career" ? (
                    <div className="text-white/35 text-[10px] font-bold uppercase tracking-[0.2em] mb-2">
                      {g}
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-1.5">
                    {items.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        disabled={!!busy}
                        onClick={() => generate(s)}
                        className="flex items-center justify-between text-left rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] disabled:opacity-50 px-4 py-3 text-white text-sm"
                      >
                        <span>{s.label}</span>
                        {busy === s.id ? (
                          <span className="text-[#00f976] text-xs">Building…</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* PREVIEW + SHARE */}
      {preview ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4"
          onClick={clearPreview}
        >
          <div
            className="flex flex-col items-center gap-4 max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt={`${playerName} — ${preview.label}`}
              className="max-h-[68vh] w-auto rounded-xl border border-white/10"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={share}
                className="bg-[#00f976] text-black font-black text-xs uppercase tracking-[0.18em] rounded-lg px-7 py-3.5"
              >
                Share
              </button>
              <button
                type="button"
                onClick={download}
                className="border border-white/20 text-white font-bold text-xs uppercase tracking-[0.18em] rounded-lg px-6 py-3.5"
              >
                Download
              </button>
              <button
                type="button"
                onClick={clearPreview}
                className="text-white/50 text-xs uppercase tracking-[0.18em] px-3 py-3.5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
