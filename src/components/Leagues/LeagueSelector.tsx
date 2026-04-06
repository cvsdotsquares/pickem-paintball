"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useAuth } from "@/src/contexts/authProvider";
import { useLeague } from "@/src/contexts/LeagueContext";
import { useSubscription } from "@/src/contexts/SubscriptionContext";
import {
  FaPlus,
  FaCog,
  FaCopy,
  FaSearch,
  FaChevronDown,
  FaChevronUp,
} from "react-icons/fa";
import { db } from "@/src/lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";
import type { League } from "@/src/lib/league-types";
import LeagueAdminModal from "./LeagueAdminModal";
import LeagueBrowser from "./LeagueBrowser";
import {
  LEAGUE_TILE_STRIP_SCROLL,
  LeagueTileButton,
  LeagueTileThumb,
} from "./PublicLeaguesCarousel";
import ConfirmDialog from "../ui/ConfirmDialog";
import { useToast } from "@/src/hooks/useToast";
import Toast from "../ui/Toast";
import { getFirebaseStorageUrl } from "@/src/lib/storage";
import { cn } from "@/src/lib/utils";

interface LeagueSelectorProps {
  onCreateLeague: () => void;
  onJoinLeague: () => void;
}

/** Mint pill style aligned with stats “See all” CTAs (light + dark) */
const LEAGUE_PILL_CTA =
  "inline-flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-full border border-emerald-400/90 bg-emerald-50/95 px-4 py-2 font-azonix text-[10px] font-bold uppercase tracking-wide text-neutral-900 shadow-sm transition hover:bg-emerald-100 active:scale-[0.99] dark:border-emerald-500/45 dark:bg-emerald-950/55 dark:text-emerald-50 dark:hover:bg-emerald-900/70";

const LEAGUE_PILL_ADMIN =
  "inline-flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-full border border-amber-500/80 bg-amber-100/90 px-4 py-2 font-azonix text-[10px] font-bold uppercase tracking-wide text-amber-950 shadow-sm transition hover:bg-amber-200 dark:border-amber-600/60 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/50";

/** Matches dashboard `sectionRowHeadingClass` — lime bar + bold title (see dashboard home). */
const DASHBOARD_LEAGUE_SUBHEADING =
  "relative min-w-0 pl-3 font-azonix text-xs font-black uppercase leading-snug tracking-[0.14em] text-gray-900 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[#00f976] before:content-[''] dark:text-white sm:text-sm sm:tracking-[0.16em]";

/** Global leaderboard tile — flat globe asset in /public */
const GLOBAL_LEAGUE_GLOBE_SRC = "/images/global-league-globe.png";

/** Dashed “add league” tile — aligns with league squares */
const CREATE_LEAGUE_TILE_CLASS =
  "flex h-16 w-16 shrink-0 snap-start items-center justify-center rounded-2xl border-2 border-dashed border-emerald-400/80 bg-emerald-50/50 text-emerald-700 shadow-sm transition hover:border-emerald-500 hover:bg-emerald-100/70 focus:outline-none focus:ring-2 focus:ring-emerald-500 active:scale-[0.99] dark:border-emerald-600/55 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:border-emerald-400 dark:hover:bg-emerald-900/45";

function ArrowEnd() {
  return <span aria-hidden className="text-[0.85em] font-bold">→</span>;
}

/** Square tile + truncated caption under (matches w-16 tiles). */
function LeagueTileColumn({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-0.5">
      {children}
      <span
        className="line-clamp-2 w-full max-w-[4.5rem] break-words text-center text-[9px] font-medium leading-snug text-gray-600 dark:text-gray-400"
        title={label}
      >
        {label}
      </span>
    </div>
  );
}

export default function LeagueSelector({
  onCreateLeague,
  onJoinLeague,
}: LeagueSelectorProps) {
  const { user } = useAuth();
  const { selectedLeague, userLeagues, setSelectedLeague } = useLeague();
  const { loading: subscriptionLoading } = useSubscription();
  const { toasts, showToast, hideToast } = useToast();
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserInitialSearch, setBrowserInitialSearch] = useState<
    string | undefined
  >(undefined);
  const [publicLeagues, setPublicLeagues] = useState<League[]>([]);
  const [publicLeaguesLoading, setPublicLeaguesLoading] = useState(true);
  const [actualMemberCount, setActualMemberCount] = useState<number | null>(
    null,
  );
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const isSelectedLeagueAdmin =
    selectedLeague && user && selectedLeague.admins?.includes(user.uid);

  const handleLeaveLeague = async () => {
    if (!selectedLeague || !user) return;

    setShowLeaveConfirm(false);
    setLeaveLoading(true);

    try {
      const response = await fetch(`/api/leagues/${selectedLeague.id}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.uid }),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.error || "Failed to leave league", "error");
        setLeaveLoading(false);
        return;
      }

      showToast("Successfully left the league", "success");
      setSelectedLeague(null);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error("Error leaving league:", error);
      showToast("Failed to leave league", "error");
      setLeaveLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPublicLeaguesLoading(true);
      try {
        const response = await fetch("/api/leagues/search");
        const data = await response.json();
        const list = (data.leagues || []) as League[];
        const joinedIds = new Set(userLeagues.map((l) => l.id));
        const filtered = list.filter((l) => !joinedIds.has(l.id));
        if (!cancelled) setPublicLeagues(filtered);
      } catch {
        if (!cancelled) setPublicLeagues([]);
      } finally {
        if (!cancelled) setPublicLeaguesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userLeagues]);

  useEffect(() => {
    const fetchActualMemberCount = async () => {
      if (!selectedLeague?.members) {
        setActualMemberCount(null);
        return;
      }

      try {
        let actualCount = 0;
        for (const memberId of selectedLeague.members) {
          const userDoc = await getDoc(doc(db, "users", memberId));
          if (userDoc.exists()) {
            actualCount++;
          }
        }
        setActualMemberCount(actualCount);
      } catch (error) {
        console.error("Error fetching member count:", error);
        setActualMemberCount(selectedLeague.memberCount || 0);
      }
    };

    fetchActualMemberCount();
  }, [selectedLeague]);

  useEffect(() => {
    if (!selectedLeague) setDetailsExpanded(false);
  }, [selectedLeague]);

  const openBrowse = (search?: string) => {
    setBrowserInitialSearch(search);
    setShowBrowser(true);
  };

  return (
    <>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => hideToast(toast.id)}
        />
      ))}
      <section
        className="relative z-20 mx-auto mt-2 w-full max-w-5xl px-0"
        aria-labelledby="custom-leagues-heading"
      >
        <div className="overflow-hidden rounded-2xl border border-emerald-500/35 bg-gradient-to-br from-emerald-50/95 via-white to-neutral-50 shadow-md ring-1 ring-black/[0.04] dark:border-emerald-500/25 dark:from-stone-900 dark:via-stone-900 dark:to-stone-950 dark:ring-white/10">
          <div className="p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-azonix text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
                  Custom leagues
                </p>
                <h2
                  id="custom-leagues-heading"
                  className="mt-0.5 text-lg font-bold tracking-tight text-gray-900 dark:text-white sm:text-xl"
                >
                  Play with friends
                </h2>
                <p className="mt-0.5 max-w-xl text-xs leading-snug text-gray-600 dark:text-gray-400 sm:text-sm">
                  Compete with your crew - Browse, Join and Create custom leagues.
                </p>
                {userLeagues.length === 0 && !subscriptionLoading && (
                  <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-500">
                    No league yet — create or join below.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onCreateLeague}
                className={cn(LEAGUE_PILL_CTA, "flex-1 min-w-[9rem] sm:flex-initial")}
              >
                <FaPlus className="text-[11px]" aria-hidden />
                Create league
                <ArrowEnd />
              </button>
              <button
                type="button"
                onClick={onJoinLeague}
                className={cn(LEAGUE_PILL_CTA, "flex-1 min-w-[9rem] sm:flex-initial")}
              >
                Join with code
                <ArrowEnd />
              </button>
              <button
                type="button"
                onClick={() => openBrowse()}
                className={cn(LEAGUE_PILL_CTA, "flex-1 min-w-[9rem] sm:flex-initial")}
              >
                <FaSearch className="text-[11px]" aria-hidden />
                Browse leagues
                <ArrowEnd />
              </button>
              {isSelectedLeagueAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAdminModal(true)}
                  className={cn(LEAGUE_PILL_ADMIN, "flex-1 min-w-[7rem] sm:flex-initial")}
                >
                  <FaCog className="text-[11px]" aria-hidden />
                  Admin
                  <ArrowEnd />
                </button>
              )}
            </div>

            <div
              className="mt-3 border-t border-gray-200/80 pt-2.5 dark:border-stone-700"
              role="region"
              aria-labelledby="leagues-section-heading"
            >
              <p
                id="leagues-section-heading"
                className="mb-1 font-azonix text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-500"
              >
                Leagues
              </p>
              <p className="mb-2 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                Tap to view leagues you&apos;re in, or view leagues you can join.
              </p>

              <div
                className={LEAGUE_TILE_STRIP_SCROLL}
                role="group"
                aria-label="Your leagues, public leagues, and create a league"
              >
                {/* Grid: headings align with tile columns; green bars only in tile row (row 2) */}
                <div className="inline-grid w-max min-w-0 [grid-template-columns:auto_auto_auto_auto_auto] gap-x-2 gap-y-1.5">
                  <h3
                    className={`col-start-1 row-start-1 ${DASHBOARD_LEAGUE_SUBHEADING}`}
                  >
                    Your leagues
                  </h3>
                  <h3
                    className={`col-start-3 row-start-1 ${DASHBOARD_LEAGUE_SUBHEADING}`}
                  >
                    Public leagues
                  </h3>
                  <h3
                    className={`col-start-5 row-start-1 ${DASHBOARD_LEAGUE_SUBHEADING}`}
                  >
                    Create
                  </h3>

                  <div
                    className="col-start-1 row-start-2 flex min-w-0 flex-nowrap items-start gap-2"
                    role="group"
                    aria-label="Your leagues"
                  >
                    <LeagueTileColumn label="Global">
                      <LeagueTileButton
                        isActive={!selectedLeague}
                        onClick={() => setSelectedLeague(null)}
                        title="Global leaderboard"
                      >
                        <img
                          src={GLOBAL_LEAGUE_GLOBE_SRC}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </LeagueTileButton>
                    </LeagueTileColumn>
                    {userLeagues.map((league) => (
                      <LeagueTileColumn key={league.id} label={league.name}>
                        <LeagueTileButton
                          isActive={selectedLeague?.id === league.id}
                          onClick={() => setSelectedLeague(league)}
                          title={league.name}
                        >
                          <LeagueTileThumb league={league} />
                        </LeagueTileButton>
                      </LeagueTileColumn>
                    ))}
                  </div>

                  <div
                    className="col-start-2 row-start-2 flex h-16 items-start justify-center self-start"
                    aria-hidden
                  >
                    <div className="h-16 w-[3px] shrink-0 rounded-sm bg-[#00f976]" />
                  </div>

                  <div
                    className="col-start-3 row-start-2 flex min-w-0 flex-nowrap items-start gap-2"
                    role="group"
                    aria-label="Public leagues"
                  >
                    {publicLeaguesLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex w-16 shrink-0 flex-col gap-0.5"
                        >
                          <div className="h-16 w-16 shrink-0 snap-start animate-pulse rounded-2xl bg-gray-200 dark:bg-stone-700" />
                          <div className="mx-auto h-2 w-10 animate-pulse rounded bg-gray-200 dark:bg-stone-700" />
                        </div>
                      ))
                    ) : publicLeagues.length === 0 ? (
                      <span className="flex h-16 max-w-[9rem] shrink-0 items-center justify-center rounded-2xl border border-dashed border-emerald-300/80 bg-white/60 px-2 text-center text-[10px] font-medium leading-tight text-gray-500 dark:border-emerald-700 dark:bg-stone-800/50 dark:text-gray-400">
                        None to join yet
                      </span>
                    ) : (
                      publicLeagues.map((league) => (
                        <LeagueTileColumn key={league.id} label={league.name}>
                          <LeagueTileButton
                            onClick={() => openBrowse(league.name)}
                            title={`${league.name} — open in browse`}
                          >
                            <LeagueTileThumb league={league} />
                          </LeagueTileButton>
                        </LeagueTileColumn>
                      ))
                    )}
                    <LeagueTileColumn label="Find private leagues">
                      <button
                        type="button"
                        onClick={onJoinLeague}
                        className={CREATE_LEAGUE_TILE_CLASS}
                        title="Find private leagues — join with a code"
                      >
                        <FaSearch className="h-7 w-7" aria-hidden />
                        <span className="sr-only">Find private leagues</span>
                      </button>
                    </LeagueTileColumn>
                  </div>

                  <div
                    className="col-start-4 row-start-2 flex h-16 items-start justify-center self-start"
                    aria-hidden
                  >
                    <div className="h-16 w-[3px] shrink-0 rounded-sm bg-[#00f976]" />
                  </div>

                  <div className="col-start-5 row-start-2 flex w-max min-w-0 shrink-0 flex-col items-start gap-0.5">
                    <button
                      type="button"
                      onClick={onCreateLeague}
                      className={CREATE_LEAGUE_TILE_CLASS}
                      title="Create your own league"
                    >
                      <FaPlus className="h-7 w-7" aria-hidden />
                      <span className="sr-only">Create your own league</span>
                    </button>
                    <span className="line-clamp-2 w-16 text-center text-[9px] font-medium leading-snug text-gray-600 dark:text-gray-400">
                      Create your own league
                    </span>
                  </div>
                </div>
              </div>

              {userLeagues.length === 0 &&
                publicLeagues.length === 0 &&
                !publicLeaguesLoading && (
                  <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-500">
                    Join a league to filter here.
                  </p>
                )}
            </div>
          </div>

          {selectedLeague && (
            <div className="border-t border-emerald-200/50 bg-emerald-50/35 px-3 py-2.5 dark:border-stone-700 dark:bg-stone-900/45 sm:px-4">
              <div className="flex w-full items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setDetailsExpanded((e) => !e)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {selectedLeague.icon ? (
                    <img
                      src={getFirebaseStorageUrl(selectedLeague.icon)}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white">
                      {selectedLeague.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                      {selectedLeague.name}
                    </h3>
                    <p className="text-[11px] text-gray-600 dark:text-gray-400">
                      {actualMemberCount !== null
                        ? actualMemberCount
                        : selectedLeague.memberCount}{" "}
                      members
                    </p>
                  </div>
                  {detailsExpanded ? (
                    <FaChevronUp className="shrink-0 text-gray-500" aria-hidden />
                  ) : (
                    <FaChevronDown className="shrink-0 text-gray-500" aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLeaveConfirm(true)}
                  disabled={leaveLoading}
                  className="shrink-0 rounded-full border border-red-300 bg-red-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                >
                  {leaveLoading ? "…" : "Leave"}
                </button>
              </div>

              {detailsExpanded && (
                <div className="mt-2 space-y-2 border-t border-emerald-200/40 pt-2 dark:border-stone-600">
                  {selectedLeague.description ? (
                    <p className="text-xs text-gray-700 dark:text-gray-300">
                      {selectedLeague.description}
                    </p>
                  ) : null}
                  {isSelectedLeagueAdmin && (
                    <div className="rounded-lg border border-gray-300/80 bg-white/70 p-2.5 dark:border-stone-600 dark:bg-stone-800/60">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-600 dark:text-gray-400">
                            Invite code
                          </p>
                          <span className="pickem-numeric text-base font-bold tracking-wider text-gray-900 dark:text-white">
                            {selectedLeague.inviteCode}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              selectedLeague.inviteCode,
                            );
                            showToast("Invite code copied", "success");
                          }}
                          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-blue-700"
                        >
                          <FaCopy className="text-[10px]" />
                          Copy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <LeagueBrowser
          isOpen={showBrowser}
          onClose={() => {
            setShowBrowser(false);
            setBrowserInitialSearch(undefined);
          }}
          initialSearch={browserInitialSearch}
        />

        {selectedLeague && (
          <LeagueAdminModal
            isOpen={showAdminModal}
            onClose={() => setShowAdminModal(false)}
            league={selectedLeague}
          />
        )}

        <ConfirmDialog
          isOpen={showLeaveConfirm}
          title="Leave League"
          message={`Are you sure you want to leave "${selectedLeague?.name}"? You will need an invite code to rejoin.`}
          confirmText="Leave"
          cancelText="Cancel"
          type="danger"
          onConfirm={handleLeaveLeague}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      </section>
    </>
  );
}
