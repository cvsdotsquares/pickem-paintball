/**
 * Fallback when JS has not yet set `--pickem-dashboard-header-bottom` (SSR / first paint).
 * Keep roughly in sync with typical mobile header height in globals.css.
 * Scroll padding also adds `--pickem-dashboard-header-content-gap` in Layout.tsx.
 * Runtime value is set from measured `getBoundingClientRect().bottom` (no artificial floor).
 */
/** Approximate SSR fallback (px) — `DashboardTopNav` overwrites after measure. */
export const MOBILE_DASHBOARD_HEADER_BODY_PX = 152;

/** Set on `document.documentElement` by DashboardTopNav; used for menu overlay `top` and main scroll padding. */
export const PICKEM_DASHBOARD_HEADER_BOTTOM_VAR = "--pickem-dashboard-header-bottom";
