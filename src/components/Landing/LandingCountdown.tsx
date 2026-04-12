"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { db } from "@/src/lib/firebaseClient";
import { collection, getDocs } from "firebase/firestore";
import { getBannerPhase, type BannerPhase } from "@/src/lib/bannerPhase";
import { eventRecordToBannerModel } from "@/src/lib/eventCountdownBannerModel";
import type { EventCountdownBannerModel } from "@/src/components/Dashboard/EventCountdownBanner";

const pad = (n: number) => String(n ?? 0).padStart(2, "0");

export default function LandingCountdown() {
  const [event, setEvent] = useState<EventCountdownBannerModel | null>(null);
  const [phase, setPhase] = useState<BannerPhase | null>(null);
  const [tick, setTick] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [loading, setLoading] = useState(true);

  // Fetch live event on mount
  useEffect(() => {
    async function fetchLiveEvent() {
      try {
        const eventsCollection = collection(db, "events");
        const snapshot = await getDocs(eventsCollection);

        const events = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        const liveEvent = events.find((e: any) => e.status === "live") || events[0];

        if (liveEvent) {
          const model = eventRecordToBannerModel(liveEvent as Record<string, unknown> & { id: string });
          setEvent(model);
        }
      } catch (error) {
        console.error("Error fetching live event:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchLiveEvent();
  }, []);

  // Calculate phase and countdown
  useEffect(() => {
    if (!event?.id) return;

    const currentPhase = getBannerPhase(Date.now(), {
      lockDate: event.lockDate,
      eventEndsAt: event.eventEndsAt ?? null,
      nextPicksOpenAt: event.nextPicksOpenAt ?? null,
    });
    setPhase(currentPhase);

    const countdownTarget: Date | null =
      currentPhase === "event_live"
        ? null
        : currentPhase === "event_break" && event.nextPicksOpenAt
          ? event.nextPicksOpenAt
          : event.lockDate;

    if (!countdownTarget) {
      setTick({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      return;
    }

    const run = () => {
      const diff = new Date(countdownTarget).getTime() - Date.now();
      if (diff <= 0) {
        setTick({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      setTick({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };

    run();
    const id = setInterval(run, 1000);
    return () => clearInterval(id);
  }, [event]);

  if (loading) return null;
  if (!event?.id) return null;
  if (phase === "event_live") return null;

  const isEventBreak = phase === "event_break";
  const displayName = isEventBreak && event.nextEventName?.trim()
    ? event.nextEventName.trim()
    : (event.name || "EVENT").trim();

  const logoUrl = isEventBreak && event.nextEventImage?.trim()
    ? event.nextEventImage.trim()
    : event.logoUrl ?? null;

  const countdownLabel = isEventBreak ? "PICKS GO LIVE IN" : "PICKS LOCK IN";

  const eventDate = isEventBreak && event.nextEventDate?.trim()
    ? event.nextEventDate.trim()
    : event.eventDate?.trim() || `${event.startDate || ""} — ${event.endDate || ""}`.trim();
  const eventLocation = isEventBreak && event.nextEventLocation?.trim()
    ? event.nextEventLocation.trim()
    : event.eventLocation?.trim() || [event.venue, event.city].filter(Boolean).join(", ");

  return (
    <section className="relative overflow-hidden">
      {/* Full-width background image */}
      <div className="absolute inset-0">
        <img
          src="/landing/hero-image.png"
          alt=""
          className="h-full w-full object-cover"
        />
        {/* Dark overlay with gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-pickem-navy/95 via-pickem-navy/90 to-pickem-navy/95" />
      </div>

      {/* Content */}
      <div className="relative z-10 py-12 md:py-20">
        <div className="container mx-auto px-4 md:px-6">
          {/* Section heading */}
          <div className="mb-8 text-center md:mb-12">
            <h2 className="font-heading text-3xl font-bold uppercase tracking-wide text-white md:text-5xl">
              {isEventBreak ? "Next Event" : "Upcoming Event"}
            </h2>
            <div className="mx-auto mt-5 h-1 w-28 rounded-full bg-pickem-green" />
          </div>

          {/* Main content card with glow */}
          <div className="mx-auto max-w-4xl">
            <div
              className="relative rounded-2xl border border-pickem-green/30 bg-pickem-navy-light/80 p-5 shadow-2xl backdrop-blur-sm md:p-8"
              style={{
                boxShadow: "0 0 40px rgba(0, 249, 118, 0.15), 0 0 80px rgba(0, 249, 118, 0.1), 0 25px 50px rgba(0, 0, 0, 0.4)",
              }}
            >
              {/* Inner glow border effect */}
              <div className="pointer-events-none absolute inset-0 rounded-2xl border border-pickem-green/20" />

              <div className="flex flex-col items-center gap-5 md:flex-row md:items-center md:gap-8">
                {/* Logo with glow ring */}
                {logoUrl && (
                  <div className="relative flex-shrink-0">
                    <div
                      className="flex h-44 w-44 items-center justify-center rounded-2xl bg-pickem-navy p-4 md:h-52 md:w-52 md:p-5"
                      style={{
                        boxShadow: "0 0 30px rgba(0, 249, 118, 0.25), inset 0 0 30px rgba(0, 249, 118, 0.05)",
                        border: "2px solid rgba(0, 249, 118, 0.3)",
                      }}
                    >
                      <img
                        src={logoUrl}
                        alt=""
                        className="h-full w-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Event info and countdown - compressed to match logo height */}
                <div className="flex-1 text-center md:text-left">
                  {/* Event name */}
                  <div>
                    <span className="font-heading text-xs font-bold uppercase tracking-widest text-pickem-green md:text-sm">
                      NXL
                    </span>
                  </div>
                  <h3
                    className="font-heading text-2xl font-bold uppercase tracking-wide text-white md:text-4xl"
                    style={{ textShadow: "0 2px 10px rgba(0, 249, 118, 0.2)" }}
                  >
                    {displayName}
                  </h3>

                  {/* Date and location */}
                  {(eventDate || eventLocation) && (
                    <div className="mt-1 flex flex-col items-center gap-0.5 md:flex-row md:items-center md:gap-3">
                      {eventDate && (
                        <span className="font-body text-xs font-semibold text-white/80 md:text-sm">
                          {eventDate}
                        </span>
                      )}
                      {eventDate && eventLocation && (
                        <span className="hidden text-pickem-green md:inline">•</span>
                      )}
                      {eventLocation && (
                        <span className="font-body text-xs text-white/60 md:text-sm">
                          {eventLocation}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Countdown */}
                  <div className="mt-3 md:mt-4">
                    <div className="mb-2 font-heading text-[10px] font-bold uppercase tracking-widest text-pickem-green md:text-xs">
                      {countdownLabel}
                    </div>
                    <div className="flex items-center justify-center gap-1.5 md:justify-start md:gap-2">
                      {[
                        { v: pad(tick.days), l: "Days" },
                        { v: pad(tick.hours), l: "Hrs" },
                        { v: pad(tick.minutes), l: "Min" },
                        { v: pad(tick.seconds), l: "Sec" },
                      ].map(({ v, l }, i) => (
                        <div key={l} className="flex items-center gap-1 md:gap-2">
                          <div className="flex flex-col items-center">
                            <div
                              className="pickem-numeric flex h-10 w-10 items-center justify-center rounded-lg bg-pickem-navy text-lg font-black text-pickem-green md:h-14 md:w-14 md:text-2xl"
                              style={{
                                border: "1px solid rgba(0, 249, 118, 0.3)",
                                boxShadow: "inset 0 0 15px rgba(0, 249, 118, 0.1)",
                              }}
                            >
                              {v}
                            </div>
                            <span className="mt-1 font-body text-[8px] font-medium uppercase tracking-widest text-white/50 md:text-[9px]">
                              {l}
                            </span>
                          </div>
                          {i < 3 && (
                            <span className="mb-4 text-lg font-bold text-pickem-green/50 md:text-xl">:</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* CTA Button - outside card for prominence */}
            <div className="mt-6 text-center md:mt-8">
              <Link
                href="/dashboard/pick-em"
                className="group relative inline-block overflow-hidden rounded-full bg-pickem-green px-10 py-4 font-heading text-base font-bold uppercase tracking-wider text-pickem-navy transition-all hover:scale-105 md:px-14 md:py-5 md:text-lg"
                style={{
                  boxShadow: "0 0 30px rgba(0, 249, 118, 0.4), 0 4px 20px rgba(0, 0, 0, 0.3)",
                }}
              >
                <span className="relative z-10">Make Your Picks →</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
