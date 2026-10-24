"use client";

import { useState, type CSSProperties } from "react";
import { cn } from "@/src/lib/utils";
import { PLACEHOLDER_HEADSHOT, isRealHeadshot, teamLogoPath } from "@/src/lib/teamLogos";

interface PlayerHeadshotProps {
  /** The player's `img_url` (or the page's resolved `picture`). */
  src?: string | null;
  /** The player's `team_id` — whose logo stands in when there is no headshot. */
  teamId?: string | number | null;
  alt?: string;
  /** Size and position of the image box — shared by photo, logo and placeholder. */
  className?: string;
  /** How a real photo (and the grey placeholder) fills the box. */
  photoClassName?: string;
  photoStyle?: CSSProperties;
  /** How the team logo sits in the box: contained and centred, never cropped. */
  logoClassName?: string;
  loading?: "lazy" | "eager";
}

/**
 * A player's headshot, with one fallback order everywhere on the site:
 * the photo → his team's logo → the grey placeholder.
 *
 * "No headshot" is an empty `img_url`, the placeholder URL, or a photo that fails to load.
 */
export default function PlayerHeadshot({
  src,
  teamId,
  alt = "",
  className = "absolute inset-0 h-full w-full",
  photoClassName = "object-cover object-top",
  photoStyle,
  logoClassName = "object-contain object-center p-[15%]",
  loading,
}: PlayerHeadshotProps) {
  // The URLs that failed to load — keyed by URL so a new src gets a fresh try.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const markFailed = (url: string) =>
    setFailed((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));

  // An image in server-rendered HTML can fail before React attaches onError, so also
  // check when it mounts: a finished load with no pixels is a failure.
  const failedBeforeHydration = (onFail: () => void) => (img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) onFail();
  };

  if (isRealHeadshot(src) && !failed.has(src)) {
    return (
      <img key="photo" src={src} alt={alt} loading={loading} draggable={false}
        className={cn(className, photoClassName)} style={photoStyle}
        ref={failedBeforeHydration(() => markFailed(src))}
        onError={() => markFailed(src)} />
    );
  }

  const logo = teamLogoPath(teamId);
  if (logo && !failed.has(logo)) {
    return (
      <img key="logo" src={logo} alt={alt} loading={loading} draggable={false}
        className={cn(className, logoClassName)}
        ref={failedBeforeHydration(() => markFailed(logo))}
        onError={() => markFailed(logo)} />
    );
  }

  return (
    <img key="placeholder" src={PLACEHOLDER_HEADSHOT} alt={alt} draggable={false}
      className={cn(className, photoClassName)} style={photoStyle} />
  );
}
