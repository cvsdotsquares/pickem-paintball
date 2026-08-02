"use client";

import TermsAndConditionsContent from "@/src/components/Legal/TermsAndConditionsContent";
import EventCountdownBanner from "@/src/components/Dashboard/EventCountdownBanner";
import { eventRecordToBannerModel } from "@/src/lib/eventCountdownBannerModel";
import { usePromoBannerEvent } from "@/src/hooks/usePromoBannerEvent";

export default function DashboardTermsPage() {
  const { bannerEvent } = usePromoBannerEvent();

  return (
    <div className="relative left-0 flex w-full flex-col scroll-smooth font-inter bg-white dark:bg-stone-950">
      {bannerEvent ? (
        <EventCountdownBanner
          variant="dashboard"
          mobileBlackBarFullBleed
          event={eventRecordToBannerModel(
            bannerEvent as unknown as Record<string, unknown> & { id: string },
          )}
          showBudget={false}
          ctaHref="/dashboard/pick-em"
          ctaLabel="Pick your team ›"
        />
      ) : null}
      <div className="mx-auto w-full max-w-7xl px-4 md:px-6 pb-10 pt-4 text-gray-900 dark:text-white">
        <TermsAndConditionsContent variant="dashboard" />
      </div>
    </div>
  );
}
