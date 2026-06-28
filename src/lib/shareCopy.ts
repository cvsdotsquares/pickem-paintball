/** Single source of truth for share wording (button label + share payload). */
export const SHARE_COPY = {
  buttonLabel: "Share team",
  preparingLabel: "Preparing…",
  title: "My PickEm Paintball team",
  /**
   * Caption for the native (image-only) share. User-driven — it's the player
   * sharing THEIR team, not marketing for us, so no "build your own" CTA here.
   * Kept URL-free on purpose: any link/domain would make WhatsApp/Discord
   * unfurl a second copy of the card. The CTA (QR + pickempaintball.com) is
   * baked into the card image, so it travels with the picture everywhere.
   */
  text: "Check out my PickEm Paintball team 🎯",
  fileName: "pickem-team.png",
  downloadedToast: "Card downloaded & link copied",
  downloadedNoCopyToast: "Card downloaded",
  errorToast: "Couldn't prepare your card — try again.",
} as const;
