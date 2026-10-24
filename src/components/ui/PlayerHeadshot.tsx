"use client";

import { useState, type CSSProperties } from "react";
import { cn } from "@/src/lib/utils";
import { PLACEHOLDER_HEADSHOT, isRealHeadshot, teamLogoPath } from "@/src/lib/teamLogos";

/**
 * URLs that failed to load, kept for the whole page visit rather than per component.
 * Some cards are re-created on every re-render (scrolling re-renders the dashboard), and
 * per-card state made a broken photo retry each time — the card flickered between the
 * failing photo and the logo.
 */
const failedUrls = new Set<string>();

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
  /**
   * The area the team logo is centred in (default: the same box as the photo). Cards
   * with a name block along the bottom pass a box that stops above it.
   */
  logoBoxClassName?: string;
  /**
   * The logo's size inside that area — in % of the area's own width AND height, so it
   * scales with the card at every screen size. Never padding: CSS resolves vertical %
   * padding against the WIDTH, which crushed the logo on wide desktop cards.
   */
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
  logoBoxClassName,
  logoClassName = "h-[70%] w-[70%]",
  loading,
}: PlayerHeadshotProps) {
  const [, rerender] = useState(0);
  const markFailed = (url: string) => {
    if (failedUrls.has(url)) return;
    failedUrls.add(url);
    rerender((n) => n + 1);
  };

  // An image in server-rendered HTML can fail before React attaches onError, so also
  // check when it mounts: a finished load with no pixels is a failure.
  const failedBeforeHydration = (onFail: () => void) => (img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) onFail();
  };

  if (isRealHeadshot(src) && !failedUrls.has(src)) {
    return (
      <img key="photo" src={src} alt={alt} loading={loading} draggable={false}
        className={cn(className, photoClassName)} style={photoStyle}
        ref={failedBeforeHydration(() => markFailed(src))}
        onError={() => markFailed(src)} />
    );
  }

  const logo = teamLogoPath(teamId);
  if (logo && !failedUrls.has(logo)) {
    return (
      <div key="logo" className={cn(logoBoxClassName ?? className, "flex items-center justify-center")}>
        <img src={logo} alt={alt} loading={loading} draggable={false}
          className={cn("object-contain", logoClassName)}
          ref={failedBeforeHydration(() => markFailed(logo))}
          onError={() => markFailed(logo)} />
      </div>
    );
  }

  return (
    <img key="placeholder" src={PLACEHOLDER_HEADSHOT} alt={alt} draggable={false}
      className={cn(className, photoClassName)} style={photoStyle} />
  );
}
