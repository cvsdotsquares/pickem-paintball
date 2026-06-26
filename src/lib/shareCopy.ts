/** Single source of truth for share wording (button label + share payload). */
export const SHARE_COPY = {
  buttonLabel: "Share team",
  preparingLabel: "Preparing…",
  title: "My PickEm Paintball team",
  /**
   * Sits alongside the link in the share sheet. Because apps like WhatsApp
   * both attach the image AND unfurl the link (whose OG image is the same
   * card), this text frames the link as a "build your own" call-to-action so
   * the second appearance reads as intentional rather than a duplicate.
   */
  text: "Check out my PickEm Paintball team 🎯  Build your own free team:",
  fileName: "pickem-team.png",
  downloadedToast: "Card downloaded & link copied",
  downloadedNoCopyToast: "Card downloaded",
  errorToast: "Couldn't prepare your card — try again.",
} as const;
