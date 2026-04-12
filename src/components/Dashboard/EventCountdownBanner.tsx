"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/src/lib/utils";
import { getBannerAccentColor, getBannerPhase, type BannerPhase } from "@/src/lib/bannerPhase";

export type EventCountdownBannerModel = {
  id: string;
  name: string;
  brandColor?: string | null;
  logoUrl?: string | null;
  eventNumber?: string;
  startDate?: string;
  endDate?: string;
  lockDate: Date | null;
  /** When live competition ends; after lock — drives hide → event break. */
  eventEndsAt?: Date | null;
  /** Countdown target during Event Break until next picks window. */
  nextPicksOpenAt?: Date | null;
  /** Left art during Event Break (next event). */
  nextEventImage?: string | null;
  /** Shown in the middle column during Event Break (current doc is still the prior event). */
  nextEventName?: string | null;
  /** Firestore id of the next event (e.g. for CTAs / deep links). */
  nextEventId?: string | null;
  /** During Event Break: CTA + left panel accent when set (else `brandColor`). */
  nextBrandColor?: string | null;
  /** Display string for current event dates (e.g. "APR 30 — MAY 3, 2026"); overrides start/end when set. */
  eventDate?: string | null;
  /** Display string for next event dates during Event Break. */
  nextEventDate?: string | null;
  /** Single-line location override for current event; else venue + city. */
  eventLocation?: string | null;
  /** Single-line location for next event during Event Break. */
  nextEventLocation?: string | null;
  venue?: string;
  city?: string;
};

type Props = {
  event: EventCountdownBannerModel | null;
  /** `dashboard`: inset pill, custom layout; `default`: full-width strip (Live PickEm). */
  variant?: "default" | "dashboard";
  /** Mobile: black strip edge-to-edge; white pill inset with horizontal padding. */
  mobileBlackBarFullBleed?: boolean;
  showBudget?: boolean;
  remainingBudget?: number;
  totalBudget?: number;
  desktopCta?: ReactNode;
  ctaHref?: string;
  ctaLabel?: string;
};

const pad = (n: number) => String(n ?? 0).padStart(2, "0");

function formatCost(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(v);
}

export default function EventCountdownBanner({
  event,
  variant = "default",
  mobileBlackBarFullBleed = false,
  showBudget = true,
  remainingBudget = 1_000_000,
  totalBudget = 1_000_000,
  desktopCta,
  ctaHref = "/dashboard/pick-em",
  ctaLabel = "Edit Picks →",
}: Props) {
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [tick, setTick] = useState({ _days: 0, _hours: 0, _minutes: 0, _seconds: 0 });
  /** Dashboard: height of deadline + CTA stack — logo panel matches this (not the other way around). */
  const rightStackRef = useRef<HTMLDivElement>(null);
  const [logoPanelHeightPx, setLogoPanelHeightPx] = useState<number | undefined>(undefined);

  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    if (variant !== "dashboard" || !event?.id) {
      setLogoPanelHeightPx(undefined);
      return;
    }
    const el = rightStackRef.current;
    if (!el) return;
    const sync = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      setLogoPanelHeightPx((prev) => (prev === h ? prev : h));
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [variant, event?.id, desktopCta, ctaHref, ctaLabel]);

  const phase: BannerPhase | null = event?.id
    ? getBannerPhase(Date.now(), {
        lockDate: event.lockDate,
        eventEndsAt: event.eventEndsAt ?? null,
        nextPicksOpenAt: event.nextPicksOpenAt ?? null,
      })
    : null;

  const countdownTarget: Date | null =
    event?.id && phase && phase !== "event_live"
      ? phase === "event_break" && event.nextPicksOpenAt
        ? event.nextPicksOpenAt
        : event.lockDate
      : null;

  useEffect(() => {
    if (!countdownTarget) return;
    const run = () => {
      const diff = new Date(countdownTarget).getTime() - Date.now();
      if (diff <= 0) {
        setTick({ _days: 0, _hours: 0, _minutes: 0, _seconds: 0 });
        return;
      }
      setTick({
        _days: Math.floor(diff / 86400000),
        _hours: Math.floor((diff % 86400000) / 3600000),
        _minutes: Math.floor((diff % 3600000) / 60000),
        _seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    run();
    const id = setInterval(run, 1000);
    return () => clearInterval(id);
  }, [countdownTarget]);

  if (!event?.id) return null;

  /** While competition runs — no banner. */
  if (phase === "event_live") {
    return null;
  }

  const brand = getBannerAccentColor({
    lockDate: event.lockDate,
    eventEndsAt: event.eventEndsAt ?? null,
    nextPicksOpenAt: event.nextPicksOpenAt ?? null,
    brandColor: event.brandColor,
    nextBrandColor: event.nextBrandColor,
  });
  const budgetPct = Math.min(100, ((totalBudget - remainingBudget) / totalBudget) * 100);

  const isEventBreak = phase === "event_break";
  /** During Event Break the live doc is still the finished event; headline uses next event fields. */
  const displayName =
    isEventBreak && event.nextEventName?.trim()
      ? event.nextEventName.trim()
      : (event.name || "EVENT").trim();
  const eventSubtitleLabel = isEventBreak ? "Next event" : `Event #${event.eventNumber || "1"}`;

  const venueLine = [event.venue, event.city].filter(Boolean).join(", ");
  const currentLocationLine = event.eventLocation?.trim() || venueLine;
  const currentDateLine =
    event.eventDate?.trim() || `${event.startDate || "MAR 19"} — ${event.endDate || "22"}`;
  const breakDateLine = event.nextEventDate?.trim();
  const breakLocationLine = event.nextEventLocation?.trim();

  const leftImageUrl =
    isEventBreak && event.nextEventImage?.trim()
      ? event.nextEventImage.trim()
      : event.logoUrl ?? null;
  const deadlineLabelDashboard = isEventBreak ? "PICKS GO LIVE IN:" : "Team lock deadline:";
  const deadlineLabelCaps = isEventBreak ? "PICKS GO LIVE IN:" : "Team Lock Deadline:";

  const defaultDesktopCta =
    ctaHref != null ? (
      <Link
        href={ctaHref}
        className="pickem-industry-ultra-emphasis block w-full rounded-full py-2.5 text-center text-[10px] uppercase leading-none text-white transition-opacity hover:opacity-95 md:text-sm"
        style={{ backgroundColor: brand }}
      >
        {ctaLabel}
      </Link>
    ) : null;

  /** Dashboard home: horizontal CTA strip — same row at all breakpoints; compact height on desktop */
  if (variant === "dashboard") {
    const ctaNode = desktopCta ?? defaultDesktopCta;

    const blackBarClass = cn(
      "min-w-0 shrink-0 bg-black pb-2 pt-2 md:pb-3 md:pt-2.5",
      mobileBlackBarFullBleed
        ? // Black strip edge-to-edge; inner wrapper holds the white pill. max-md:py-* keeps top/bottom black bands equal.
          // max-md:mt-* clears the fixed dashboard header so the black strip is not flush under the white nav row.
          "relative z-0 ml-[calc(50%-50vw)] w-screen max-w-[100vw] pl-0 pr-0 max-md:mt-4 max-md:py-3"
        : "w-full pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] md:pl-[max(1.25rem,env(safe-area-inset-left))] md:pr-[max(1.25rem,env(safe-area-inset-right))]",
    );

    const fullBleedPillGutterClass =
      "pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] md:pl-[max(1.25rem,env(safe-area-inset-left))] md:pr-[max(1.25rem,env(safe-area-inset-right))]";

    const pillRow = (
      <div className="mx-auto flex min-h-0 w-full min-w-0 max-w-5xl flex-row items-stretch overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)] md:rounded-2xl md:shadow-lg">
          {/* Left: height follows measured “deadline + CTA” stack on the right */}
          <div className="flex w-[26%] min-w-[4.5rem] max-w-[8.5rem] shrink-0 flex-col justify-center border-r border-gray-100 p-1.5 md:w-[28%] md:min-w-[7rem] md:max-w-[11rem] md:p-2.5">
            <div
              className="relative flex w-full flex-col overflow-hidden rounded-lg md:rounded-xl"
              style={{
                backgroundColor: brand,
                ...(logoPanelHeightPx !== undefined && logoPanelHeightPx > 0
                  ? { height: logoPanelHeightPx, minHeight: logoPanelHeightPx }
                  : {}),
              }}
            >
              <div className="flex min-h-0 flex-1 items-center justify-center px-1 py-2 md:px-2 md:py-2">
                {leftImageUrl ? (
                  <img
                    src={leftImageUrl}
                    alt=""
                    className="h-auto max-h-full w-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className="px-0.5 text-center font-azonix text-[7px] font-black uppercase leading-tight text-white md:text-[8px]">
                    {displayName}
                  </span>
                )}
              </div>
              <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black px-1 py-px font-azonix text-[5px] font-black uppercase tracking-wide text-white md:bottom-1.5 md:right-1.5 md:px-1.5 md:text-[6px]">
                Next event
              </span>
            </div>
          </div>

          {/* Middle: event copy — vertically centered in pill, spaced for readability */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center border-r border-gray-100 px-2 py-px text-left md:px-4 md:py-0.5">
            <div className="flex min-h-0 w-full flex-col gap-0.5 md:gap-1">
              <div className="font-azonix text-[7px] font-bold uppercase leading-none tracking-widest text-gray-500 md:text-[8px]">
                {eventSubtitleLabel}
              </div>
              <div className="min-w-0 space-y-0">
                <div className="pickem-industry-ultra-emphasis text-sm uppercase leading-none text-gray-900">
                  NXL
                </div>
                <div className="pickem-industry-ultra-emphasis text-sm uppercase leading-tight text-gray-900 md:truncate">
                  {displayName}
                </div>
              </div>
              {isEventBreak ? (
                <>
                  {breakDateLine ? (
                    <div className="font-azonix text-[9px] font-black uppercase leading-none text-gray-900 md:text-xs">
                      {breakDateLine}
                    </div>
                  ) : null}
                  {breakLocationLine ? (
                    <div className="truncate font-azonix text-[7px] font-bold uppercase leading-none text-gray-700 md:text-[9px]">
                      {breakLocationLine}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  {currentLocationLine ? (
                    <div className="hidden truncate font-azonix text-[7px] font-bold uppercase leading-none text-gray-700 md:block md:text-[9px]">
                      {currentLocationLine}
                    </div>
                  ) : null}
                  <div className="font-azonix text-[9px] font-black uppercase leading-none text-gray-900 md:text-xs">
                    {currentDateLine}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right: natural height; ref measures deadline + CTA for logo panel */}
          <div className="flex w-[36%] min-w-[9.5rem] max-w-[13.5rem] shrink-0 flex-col justify-center px-1.5 py-1.5 md:w-[32%] md:min-w-[11rem] md:max-w-[17rem] md:px-3 md:py-2">
            <div ref={rightStackRef} className="flex w-full flex-col gap-1 md:gap-1.5">
              <div className="flex flex-col rounded-lg bg-neutral-950 px-1.5 pb-2 text-white md:rounded-xl md:px-2.5 md:pb-2.5">
                <div className="pickem-industry-ultra-emphasis block pt-2 text-center text-[11px] uppercase leading-none text-white md:pt-2.5 md:text-[15px]">
                  {deadlineLabelDashboard}
                </div>
                {/* Slight negative margin offsets title line-box; tuned between “too loose” (gap only) and “too tight” (-mt-1.5/-mt-2) */}
                <div className="-mt-0.5 flex min-w-0 items-center justify-center gap-0.5 pt-0.5 md:-mt-1 md:gap-1 md:pt-1">
                  {[
                    { v: pad(tick._days), l: "Days" },
                    { v: pad(tick._hours), l: "Hours" },
                    { v: pad(tick._minutes), l: "Mins" },
                    { v: pad(tick._seconds), l: "Secs" },
                  ].map(({ v, l }, i) => (
                    <div key={l} className="flex min-w-0 items-start gap-0.5 md:gap-1">
                      <div className="flex min-w-0 flex-col items-center gap-0.5 md:gap-1">
                        <span className="pickem-numeric text-sm font-black leading-none text-white md:text-base">
                          {v}
                        </span>
                        <span className="max-w-[2.5rem] text-center font-azonix text-[6px] font-bold uppercase leading-none tracking-wide text-white md:max-w-none md:text-[8px] md:tracking-wider">
                          {l}
                        </span>
                      </div>
                      {i < 3 ? (
                        <span className="shrink-0 text-sm font-black leading-none text-white md:text-base">:</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
              {ctaNode ? (
                <div className="min-w-0 shrink-0 [&_a]:block [&_a]:w-full [&_button]:block [&_button]:w-full">{ctaNode}</div>
              ) : null}
            </div>
          </div>
        </div>
    );

    return (
      <div className={blackBarClass}>
        {mobileBlackBarFullBleed ? (
          <div className={fullBleedPillGutterClass}>{pillRow}</div>
        ) : (
          pillRow
        )}
      </div>
    );
  }

  /** Default: Live PickEm layout */
  return (
    <>
      <div className="mx-0 flex-shrink-0 overflow-hidden rounded-b-2xl md:hidden" style={{ backgroundColor: brand }}>
        <div
          style={{
            backgroundColor: "rgba(0,0,0,0.35)",
            height: "32px",
            display: "flex",
            flexDirection: "column",
            paddingLeft: "12px",
            paddingRight: "12px",
            paddingBottom: "6px",
          }}
        >
          <div style={isTouchDevice ? { height: "12px", flexShrink: 0 } : { flex: 1, minHeight: 0 }} />
          <div style={{ display: "flex", gap: "8px" }}>
            <span className="whitespace-nowrap text-[11px] font-black uppercase tracking-widest text-white">
              {deadlineLabelCaps}
            </span>
            <span className="whitespace-nowrap text-[11px] font-black text-white">
              <span className="pickem-numeric">{pad(tick._days)}</span>d :{" "}
              <span className="pickem-numeric">{pad(tick._hours)}</span>h :{" "}
              <span className="pickem-numeric">{pad(tick._minutes)}</span>m :{" "}
              <span className="pickem-numeric">{pad(tick._seconds)}</span>s
            </span>
          </div>
        </div>
        <div className={cn("px-3 py-2", showBudget ? "flex items-center justify-between" : "")}>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/70">{eventSubtitleLabel}</div>
            <div className="text-lg font-black uppercase leading-tight text-white">NXL {displayName}</div>
            <div className="text-[11px] font-bold text-white/70">
              {isEventBreak
                ? [breakDateLine, breakLocationLine].filter(Boolean).join(" · ") || currentDateLine
                : currentDateLine}
            </div>
          </div>
          {showBudget ? (
            <div className="ml-4 flex-shrink-0 text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/70">Budget left</div>
              <div className="pickem-numeric text-sm font-black text-white">{formatCost(remainingBudget)}</div>
              <div className="mt-0.5 h-1.5 w-24 overflow-hidden rounded-full bg-black/30">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", budgetPct > 85 ? "bg-red-300" : "bg-[#00f976]")}
                  style={{ width: `${100 - budgetPct}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="hidden flex-shrink-0 items-center justify-center bg-black py-3 px-4 md:flex">
        <div className="flex w-full max-w-4xl items-stretch rounded-xl bg-white" style={{ height: 110, boxShadow: "0 0 0 1px rgba(0,0,0,0.08)" }}>
          <div
            style={{
              width: 180,
              borderRadius: "0.75rem 0 0 0.75rem",
              backgroundColor: brand,
              flexShrink: 0,
              overflow: "hidden",
              position: "relative",
            }}
          >
            {leftImageUrl ? (
              <img
                src={leftImageUrl}
                alt="Event Logo"
                style={{ position: "absolute", inset: 0, width: "90%", height: "90%", top: "5%", left: "5%", objectFit: "contain" }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0.75rem",
                  color: "white",
                  fontWeight: 900,
                  fontSize: "0.875rem",
                  textTransform: "uppercase",
                  textAlign: "center",
                  lineHeight: 1.2,
                }}
              >
                {displayName}
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col justify-center border-l border-gray-100 px-5">
            <div className="text-[8px] font-bold uppercase tracking-widest text-gray-400">{eventSubtitleLabel}</div>
            <div className="mt-0.5 text-base font-black uppercase leading-tight text-gray-900" style={{ fontWeight: 900, letterSpacing: "-0.02em" }}>
              NXL
              <br />
              {displayName}
            </div>
            {isEventBreak ? (
              <>
                {breakDateLine ? (
                  <div className="mt-1 text-[10px] font-bold text-gray-700">{breakDateLine}</div>
                ) : null}
                {breakLocationLine ? (
                  <div className="mt-1 text-[9px] uppercase leading-snug text-gray-500">{breakLocationLine}</div>
                ) : null}
              </>
            ) : (
              <>
                <div className="mt-1 text-[9px] uppercase leading-snug text-gray-500">
                  {event.eventLocation?.trim() ? (
                    event.eventLocation.trim()
                  ) : (
                    <>
                      {event.venue || "RAYMOND JAMES STADIUM"}
                      <br />
                      {event.city || "TAMPA , FLORIDA"}
                    </>
                  )}
                </div>
                <div className="mt-0.5 text-[10px] font-bold text-gray-700">{currentDateLine}</div>
              </>
            )}
          </div>

          <div className="flex min-w-[240px] flex-shrink-0 flex-col items-start justify-center gap-1.5 border-l border-gray-100 px-5">
            <div className="text-[8px] font-bold uppercase tracking-widest text-gray-500">{deadlineLabelCaps}</div>
            <div className="flex items-end gap-1">
              {[
                { v: pad(tick._days), l: "DAYS" },
                { v: pad(tick._hours), l: "HOURS" },
                { v: pad(tick._minutes), l: "MINS" },
                { v: pad(tick._seconds), l: "SECS" },
              ].map(({ v, l }, i) => (
                <div key={l} className="flex items-end gap-1">
                  <div className="flex flex-col items-center">
                    <div className="pickem-numeric flex h-9 w-9 items-center justify-center rounded bg-gray-900 text-base font-black text-white">{v}</div>
                    <span className="mt-0.5 text-[6px] uppercase tracking-widest text-gray-400">{l}</span>
                  </div>
                  {i < 3 && <span className="mb-4 text-base font-black leading-none text-gray-300">:</span>}
                </div>
              ))}
            </div>
            {desktopCta ?? defaultDesktopCta}
          </div>
        </div>
      </div>
    </>
  );
}
