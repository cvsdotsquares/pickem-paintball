/** Single source of truth for share wording (button label + share payload). */
export const SHARE_COPY = {
  buttonLabel: "Share team",
  preparingLabel: "Preparing…",
  title: "My PickEm Paintball team",
  /**
   * Caption for the native (image-only) share. Kept URL-free on purpose: any
   * link/domain here would make WhatsApp/Discord unfurl a second copy of the
   * card. The call-to-action (QR + pickempaintball.com) is baked into the
   * card image itself, so it travels with the picture everywhere.
   */
  text: "Check out my PickEm Paintball team 🎯 Build your own — free to play.",
  fileName: "pickem-team.png",
  downloadedToast: "Card downloaded & link copied",
  downloadedNoCopyToast: "Card downloaded",
  errorToast: "Couldn't prepare your card — try again.",
} as const;
