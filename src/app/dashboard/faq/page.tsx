"use client";

import Link from "next/link";
import CmsPageFromFirestore from "@/src/components/Cms/CmsPageFromFirestore";
import EventCountdownBanner from "@/src/components/Dashboard/EventCountdownBanner";
import { DASHBOARD_BANNER_PICK_CTA_CLASS } from "@/src/components/Dashboard/dashboardEventBannerShared";
import { eventRecordToBannerModel, getBannerAccentFromRecord } from "@/src/lib/eventCountdownBannerModel";
import { usePromoBannerEvent } from "@/src/hooks/usePromoBannerEvent";

export default function DashboardFaqPage() {
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
          desktopCta={
            <Link
              href="/dashboard/pick-em"
              className={DASHBOARD_BANNER_PICK_CTA_CLASS}
              style={{
                backgroundColor: getBannerAccentFromRecord(
                  bannerEvent as unknown as Record<string, unknown> & { id: string },
                ),
              }}
            >
              Pick your team &gt;
            </Link>
          }
        />
      ) : null}
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6 pb-10 pt-1 text-gray-900 dark:text-white [&_h2:first-of-type]:!mt-2 [&_h3:first-of-type]:!mt-2">
        <CmsPageFromFirestore slug="faq" variant="dashboard" />
      </div>
    </div>
  );
}
