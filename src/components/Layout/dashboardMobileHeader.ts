/**
 * Fallback when JS has not yet set `--pickem-dashboard-header-bottom` (SSR / first paint).
 * Actual offset is measured from the fixed `<header>` in DashboardTopNav (banner + toolbar vary).
 */
export const MOBILE_DASHBOARD_HEADER_BODY_PX = 96;

/** Set on `document.documentElement` by DashboardTopNav; used for menu overlay `top` and main scroll padding. */
export const PICKEM_DASHBOARD_HEADER_BOTTOM_VAR = "--pickem-dashboard-header-bottom";
