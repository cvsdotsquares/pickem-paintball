/**
 * Shared typography + rules for dashboard profile / account settings.
 * Keeps section titles, body copy, and dividers aligned across the page and nested components.
 */
export const profileSectionTitle =
  "font-azonix text-xl font-bold tracking-tight text-gray-900 dark:text-white md:text-2xl";

export const profileSectionBody =
  "mt-2 max-w-xl text-sm leading-relaxed text-gray-600 dark:text-white/55";

/** Full-width rule below a section (consistent weight with theme). */
export const profileSectionDivider =
  "border-b border-gray-200 pb-10 dark:border-white/10";

/** Nested blocks inside a section (e.g. Danger zone, subscription cards). */
export const profileSubsectionTitle =
  "font-azonix text-base font-bold text-gray-900 dark:text-white";

export const profileInSectionDivider =
  "mt-10 border-t border-gray-200 pt-10 dark:border-white/10";
