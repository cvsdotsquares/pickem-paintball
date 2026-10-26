/**
 * Crash log: sends one row to `clientErrors` (via /api/client-error) when something breaks
 * in a visitor's browser, so "the menu disappeared on my phone" arrives with the phone,
 * browser and error attached instead of guesswork. Read with scripts/client-errors-report.mjs.
 *
 * Nothing personal is sent: no uid, email or query string, only the page path and what the
 * browser says about itself. Capped per page load so a looping error can't flood the table.
 */

export type ClientErrorKind =
  /** A dashboard page crashed; the header stayed up (Layout's error boundary). */
  | "page-crash"
  /** The whole site fell back to "Sorry, something went wrong" (root error boundary). */
  | "site-crash"
  /** An uncaught error in our own scripts that no boundary saw (e.g. in a tap handler). */
  | "script-error"
  /** iOS left the visible screen shifted after the keyboard closed, even after our reset. */
  | "viewport-shift";

const MAX_REPORTS_PER_LOAD = 5;
let sent = 0;
const seen = new Set<string>();

const cut = (v: unknown, max: number): string | null =>
  typeof v === "string" && v ? v.slice(0, max) : null;

function describeBrowser() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  return {
    ua: cut(navigator.userAgent, 400),
    vw: window.innerWidth,
    vh: window.innerHeight,
    // Opened from a home-screen icon (iOS sets navigator.standalone; others use display-mode).
    standalone:
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia?.("(display-mode: standalone)").matches === true,
    // Chrome / Google Translate mark the page with `translated-ltr` / `translated-rtl`.
    translated: /\btranslated-(ltr|rtl)\b/.test(root.className),
    dark: root.classList.contains("dark"),
    dvh: window.CSS?.supports?.("height", "100dvh") === true,
    vvOffsetTop: vv ? Math.round(vv.offsetTop) : null,
    vvHeight: vv ? Math.round(vv.height) : null,
  };
}

export function reportClientError(
  kind: ClientErrorKind,
  error?: unknown,
  extra?: Record<string, string | number | boolean | null>,
): void {
  try {
    if (typeof window === "undefined" || sent >= MAX_REPORTS_PER_LOAD) return;
    const err = error instanceof Error ? error : null;
    const message = cut(err?.message ?? (typeof error === "string" ? error : ""), 300);
    const key = `${kind}|${message ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    sent += 1;

    const body = JSON.stringify({
      kind,
      message,
      name: cut(err?.name, 60),
      stack: cut(err?.stack, 2000),
      path: cut(window.location.pathname, 200),
      ...describeBrowser(),
      extra: extra ?? null,
    });

    // sendBeacon survives the page being closed or reloaded straight after the error.
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/client-error", blob)) return;
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* Reporting must never cause the problem it is reporting. */
  }
}

let listening = false;

/**
 * Uncaught errors outside React's error boundaries. Only our own bundles (`/_next/` on this
 * origin) count; browser extensions and third-party scripts are ignored as noise.
 */
export function listenForScriptErrors(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("error", (e) => {
    const file = e.filename || "";
    if (!file.startsWith(`${window.location.origin}/_next/`)) return;
    reportClientError("script-error", e.error ?? e.message, {
      at: `${file.replace(window.location.origin, "")}:${e.lineno}:${e.colno}`,
    });
  });
}
