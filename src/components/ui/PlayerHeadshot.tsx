"use client";

import { useState, type CSSProperties } from "react";
import { cn } from "@/src/lib/utils";
import { PLACEHOLDER_HEADSHOT, isRealHeadshot, teamLogoPath } from "@/src/lib/teamLogos";

/**
 * Photo URLs that failed to load, kept for the whole page visit rather than per card, so
 * a card that gets re-created doesn't retry a broken photo and flicker to the logo again.
 */
const failedPhotos = new Set<string>();

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
   * The logo's maximum size inside that area — in % of the area's own width AND height, so it
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
  logoClassName = "max-h-[70%] max-w-[70%]",
  loading,
}: PlayerHeadshotProps) {
  const [, rerender] = useState(0);
  const markPhotoFailed = (url: string) => {
    if (failedPhotos.has(url)) return;
    failedPhotos.add(url);
    rerender((n) => n + 1);
  };
  // Logos are our own static files: a failure only affects this one image and is never
  // remembered page-wide, so a spurious error can't take a team's logo off every card.
  const [logoFailed, setLogoFailed] = useState<string | null>(null);

  /**
   * An image can fail before React attaches onError (server-rendered HTML, or a 404
   * that comes back fast). If it looks failed when it mounts, confirm with a real load
   * before believing it — some browsers report a lazy image that hasn't started yet as
   * "complete" with no pixels.
   */
  const confirmIfFailedOnMount = (url: string) => (img: HTMLImageElement | null) => {
    if (!img || !img.complete || img.naturalWidth > 0) return;
    const probe = new Image();
    probe.onerror = () => markPhotoFailed(url);
    probe.src = url;
  };

  if (isRealHeadshot(src) && !failedPhotos.has(src)) {
    return (
      <img key="photo" src={src} alt={alt} loading={loading} draggable={false}
        className={cn(className, photoClassName)} style={photoStyle}
        ref={confirmIfFailedOnMount(src)}
        onError={() => markPhotoFailed(src)} />
    );
  }

  const logo = teamLogoPath(teamId);
  if (logo && logoFailed !== logo) {
    return (
      // Flex column with spacers 3:2, so the space above the logo is 1.5x the space below.
      <div key="logo" className={cn(logoBoxClassName ?? className, "flex flex-col items-center")}>
        <div className="min-h-0 flex-[3]" />
        <img src={logo} alt={alt} loading={loading} draggable={false}
          // h/w auto + max-h/max-w: the box is exactly the logo, so the 3:2 spacers
          // measure the visible gap (object-contain would add its own equal margins).
          className={cn("h-auto w-auto min-h-0 shrink-0 object-contain", logoClassName)}
          onError={() => setLogoFailed(logo)} />
        <div className="min-h-0 flex-[2]" />
      </div>
    );
  }

  return (
    <img key="placeholder" src={PLACEHOLDER_HEADSHOT} alt={alt} draggable={false}
      className={cn(className, photoClassName)} style={photoStyle} />
  );
}
