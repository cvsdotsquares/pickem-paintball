"use client";

import { createContext, useCallback, useContext, type UIEvent } from "react";

export type DashboardMainScrollContextValue = {
  scrollTop: number;
  /** Report scrollTop from a nested scroll region; use a stable id per scroll container on the page. */
  setNestedScrollTop: (regionId: string, top: number) => void;
};

const defaultValue: DashboardMainScrollContextValue = {
  scrollTop: 0,
  setNestedScrollTop: () => {},
};

export const DashboardMainScrollContext = createContext<DashboardMainScrollContextValue>(defaultValue);

export function useDashboardMainScrollTop() {
  return useContext(DashboardMainScrollContext).scrollTop;
}

/** Attach to `onScroll` of an inner scroll container (e.g. dashboard columns). */
export function useDashboardNestedScrollHandler(regionId: string) {
  const { setNestedScrollTop } = useContext(DashboardMainScrollContext);
  return useCallback(
    (e: UIEvent<HTMLElement>) => {
      setNestedScrollTop(regionId, e.currentTarget.scrollTop);
    },
    [regionId, setNestedScrollTop],
  );
}
