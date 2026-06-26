"use client";

import EventCountdownBanner, {
  type EventCountdownBannerModel,
} from "@/src/components/Dashboard/EventCountdownBanner";
import { fetchFeaturedEvent, getCachedFeaturedEvent } from "@/src/lib/featuredEvent";
import { useAuth } from "@/src/contexts/authProvider";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
} from "firebase/firestore";
import { getDownloadURL, getStorage, listAll, ref } from "firebase/storage";
import { memo, useEffect, useState } from "react";
import { useDashboardNestedScrollHandler } from "@/src/contexts/DashboardMainScrollContext";
import Link from "next/link";
import { MonochromePillTabs } from "@/src/components/ui/monochrome-pill-tabs";
import {
  PlayerStatus,
  STATUS_META,
  STATUS_BUTTON_BASE_CLASS,
  STATUSES_FOR_DASHBOARD_TABLE,
  isPlayerStatus,
} from "@/src/lib/player-status";

/** Sensible color palette for avatar backgrounds. */
const AVATAR_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-fuchsia-500",
  "bg-pink-500",
  "bg-rose-500",
];

/** Generate a consistent color for a username using a simple hash. */
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** Get first two letters of a name for avatar initials. */
function getInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "??";
  return cleaned.slice(0, 2).toUpperCase();
}

export interface Player {
  player_id: string;
  Player: string;
  Team: string;
  Rank: string;
  team_id: string;
  Cost: number;
  league_id: string;
  picture?: string;
  img_url?: string;
  Status?: PlayerStatus;
}

const STATUS_TICK_BASE =
  "inline-flex items-center justify-center rounded-full font-black leading-none shadow-sm pt-[1px]";

interface PlayerSlot {
  id: number;
  player: Player | null;
}

type MobileHomeTab = "all" | "stats" | "pickem";

type KillRow = { id: string; player: string; team: string; kills: number };

type StatusRow = { id: string; player: string; team: string; status: PlayerStatus; updatedAt: Date | null };

export default function Dashboard() {
  const { user } = useAuth();
  const db = getFirestore();
  const reportStatsScroll = useDashboardNestedScrollHandler("dashboard-home-stats");
  const reportPickemScroll = useDashboardNestedScrollHandler("dashboard-home-pickem");

  const [mobileTab, setMobileTab] = useState<MobileHomeTab>("all");

  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>(
    Array.from({ length: 10 }, (_, i) => ({ id: i + 1, player: null })),
  );
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [eventRank, setEventRank] = useState<number | undefined>();
  const [seasonRank, setSeasonRank] = useState<number | undefined>();
  const [eventPoints, setEventPoints] = useState<number | undefined>();
  const [seasonPoints, setSeasonPoints] = useState<number | undefined>();
  const [liveEvent, setLiveEvent] = useState<EventCountdownBannerModel | null>(
    () => getCachedFeaturedEvent(),
  );
  const [topKills, setTopKills] = useState<KillRow[]>([]);
  const [statusRows, setStatusRows] = useState<StatusRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<PlayerStatus | "All">("All");
  const [remainingBudget, setRemainingBudget] = useState(1000000);
  const TOTAL_BUDGET = 1000000;

  const formatCost = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(v);

  const budgetPct = Math.min(100, ((TOTAL_BUDGET - remainingBudget) / TOTAL_BUDGET) * 100);

  useEffect(() => {
    if (!user) return;
    const fetchAvatar = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const name =
            data.username ||
            (data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : null) ||
            data.name ||
            data.displayName ||
            user.displayName ||
            user.email?.split("@")[0] ||
            "PLAYER";
          setDisplayName(name);

          if (data.profilePicture) {
            try {
              const url = await getDownloadURL(ref(getStorage(), data.profilePicture));
              setAvatarUrl(url);
            } catch {
              setAvatarUrl(user.photoURL || null);
            }
          } else {
            setAvatarUrl(user.photoURL || null);
          }
        } else {
          setAvatarUrl(user.photoURL || null);
        }
      } catch {
        setAvatarUrl(user.photoURL || null);
      }
    };
    fetchAvatar();
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Returns the last-known event on transient failure, so we never blank an
      // already-visible banner; only overwrite state when we actually have data.
      const event = await fetchFeaturedEvent();
      if (!cancelled && event) setLiveEvent(event);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!liveEvent?.id) {
      setTopKills([]);
      setStatusRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, `events/${liveEvent.id}/players`));
        if (cancelled) return;
        const killRows: KillRow[] = [];
        const statusList: StatusRow[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          killRows.push({
            id: d.id,
            player: String(data.Player ?? "—"),
            team: String(data.Team ?? "—"),
            kills: Number(data["Confirmed Kills"]) || 0,
          });
          if (
            isPlayerStatus(data.Status) &&
            STATUSES_FOR_DASHBOARD_TABLE.includes(data.Status)
          ) {
            const ts = data.StatusUpdatedAt;
            const updatedAt: Date | null =
              ts?.toDate?.() instanceof Date ? ts.toDate() : null;
            statusList.push({
              id: d.id,
              player: String(data.Player ?? "—"),
              team: String(data.Team ?? "—"),
              status: data.Status,
              updatedAt,
            });
          }
        });
        killRows.sort((a, b) => b.kills - a.kills);
        statusList.sort((a, b) => {
          const aTime = a.updatedAt?.getTime() ?? 0;
          const bTime = b.updatedAt?.getTime() ?? 0;
          return bTime - aTime;
        });
        setTopKills(killRows.slice(0, 10));
        setStatusRows(statusList);
      } catch (e) {
        console.error(e);
        setTopKills([]);
        setStatusRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liveEvent?.id]);

  useEffect(() => {
    if (!user?.uid || !liveEvent?.id) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const rank = data[`${liveEvent.id}Rank`] ?? undefined;
      const pts = data[`${liveEvent.id}PTS`] ?? undefined;
      setEventRank(rank);
      if (pts !== undefined && pts > 0) {
        setEventPoints(pts);
      }
    });
    return () => unsub();
  }, [user?.uid, liveEvent?.id]);

  useEffect(() => {
    if (!user?.uid || !liveEvent?.id) return;
    const seasonYear = typeof liveEvent.id === "string" ? liveEvent.id.match(/(\d{4})/)?.[1] : null;
    if (!seasonYear) return;
    const unsub = onSnapshot(doc(db, "leaderboards", `season_${seasonYear}`), (snap) => {
      if (!snap.exists()) return;
      const usersArr = snap.data()?.users || [];
      const row = usersArr.find((u: { id: string }) => u.id === user.uid);
      if (!row) return;
      setSeasonRank(row.seasonRank ?? undefined);
      if (row.seasonTotalPoints != null) setSeasonPoints(row.seasonTotalPoints);
    });
    return () => unsub();
  }, [user?.uid, liveEvent?.id]);

  const fetchPlayerPicture = async (leagueId: string): Promise<string> => {
    try {
      const fileList = await listAll(ref(getStorage(), `players/`));
      const match = fileList.items.find((item) => item.name.startsWith(`${leagueId}_`));
      return match ? await getDownloadURL(match) : "/placeholder.svg";
    } catch {
      return "/placeholder.svg";
    }
  };

  useEffect(() => {
    if (!user || !liveEvent?.id) return;
    const fetchPicks = async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) return;
        const data = snap.data();
        const ids = data.pickems?.[liveEvent.id];
        if (!Array.isArray(ids)) return;

        const docs = await Promise.all(
          ids.map((id: string) => getDoc(doc(db, `events/${liveEvent.id}/players`, id.toString()))),
        );
        const picks: Player[] = await Promise.all(
          docs.filter((d) => d.exists()).map(async (d) => {
            const pd = { ...d.data(), player_id: d.id } as Record<string, unknown>;
            return {
              ...(pd as unknown as Player),
              player_id: String(pd.player_id ?? d.id),
              picture: (pd.img_url as string)?.trim()
                ? (pd.img_url as string)
                : await fetchPlayerPicture(String(pd.league_id)),
            };
          }),
        );

        const captainIdValue = data.pickems?.[`${liveEvent.id}_captain`] || null;
        setCaptainId(captainIdValue);
        setPlayerSlots(Array.from({ length: 10 }, (_, i) => ({ id: i + 1, player: picks[i] || null })));
        setRemainingBudget(TOTAL_BUDGET - picks.reduce((s, p) => s + Math.round(p.Cost), 0));

        const livePoints = picks.reduce((sum, p) => {
          const kills = (p as unknown as { ["Confirmed Kills"]?: number })["Confirmed Kills"] || 0;
          return sum + (p.player_id === captainIdValue ? kills * 1.5 : kills);
        }, 0);
        if (livePoints > 0) {
          setEventPoints(livePoints);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchPicks();
  }, [user, liveEvent?.id]);

  const SlotCard = memo(({ player, isCaptain }: { player: Player; isCaptain: boolean }) => (
    <div
      className={`relative rounded-lg overflow-hidden h-full w-full ${isCaptain ? "ring-2 ring-yellow-400" : "ring-1 ring-black/10 dark:ring-white/10"}`}
    >
      <div
        className="absolute inset-0 bg-cover bg-top bg-[#1a1a1a]"
        style={{ backgroundImage: `url(${player.picture || "/placeholder.svg"})` }}
      />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 to-transparent" />
      {isPlayerStatus(player.Status) && (() => {
        const meta = STATUS_META[player.Status];
        return (
          <span
            className={`absolute top-1.5 right-1.5 z-10 leading-none align-top ${STATUS_TICK_BASE} ${meta.tickClass}`}
            style={{ width: 14, height: 14, fontSize: 10 }}
            title={meta.label}
          >
            {meta.tickGlyph}
          </span>
        );
      })()}
      <div className="absolute bottom-0 inset-x-0 p-1">
        <div className="text-white font-bold text-[8px] truncate">{player.Player}</div>
        <div className="text-white/40 text-[7px] truncate">{player.Team}</div>
        <div className="pickem-numeric text-white/60 text-[8px] font-bold">{formatCost(player.Cost)}</div>
      </div>
      {isCaptain && (
        <div className="absolute top-1 left-1 bg-yellow-400 text-black font-black px-1 py-0.5 rounded uppercase tracking-widest flex flex-col items-center leading-none gap-[1px]">
          <span className="text-[6px]">★ CPT</span>
          <span className="text-[5px] opacity-80">1.5× PTS</span>
        </div>
      )}
    </div>
  ));

  const EmptySlot = () => (
    <Link href="/dashboard/pick-em">
      <div className="flex flex-col gap-1 justify-center items-center rounded-lg border border-dashed border-black/15 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.02] hover:border-black/30 dark:hover:border-white/30 transition-all w-full h-full min-h-[80px] cursor-pointer">
        <span className="text-black/20 dark:text-white/20 text-base">+</span>
        <span className="text-[7px] uppercase text-black/20 dark:text-white/20 font-bold tracking-widest text-center px-1 leading-tight">
          Add Player
        </span>
      </div>
    </Link>
  );

  const picks = playerSlots.map((s) => s.player).filter(Boolean) as Player[];

  /** Sub-section titles beside action buttons — green guidance bar + standard light/dark body text (no filled background). */
  const sectionRowHeadingClass =
    "relative min-w-0 flex-1 pl-3 font-azonix text-xs font-black uppercase leading-snug tracking-[0.14em] text-gray-900 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[#00f976] before:content-[''] dark:text-white sm:text-sm sm:tracking-[0.16em]";

  /** Actions stay visible but visually secondary to `sectionRowHeadingClass` */
  const sectionActionLinkClass =
    "inline-flex shrink-0 items-center justify-center rounded-full border border-[#00f976] bg-[#00f976]/10 px-3 py-1.5 font-azonix text-[10px] font-bold uppercase tracking-wide text-neutral-800 shadow-sm transition hover:bg-[#00f976]/18 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f976] focus-visible:ring-offset-2 dark:text-[#00e689] dark:ring-offset-stone-950 dark:hover:bg-[#00f976]/22";

  const confirmedKillsBlock = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className={sectionRowHeadingClass}>Live stats - confirmed kills</h3>
        <Link href="/dashboard/stats" className={sectionActionLinkClass}>
          See all stats →
        </Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-white/10">
        <table className="w-full text-left text-sm font-azonix">
          <thead className="bg-gray-100 dark:bg-white/5 text-[10px] uppercase tracking-widest text-gray-600 dark:text-gray-400">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2 text-right">Kills</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10 text-gray-900 dark:text-white">
            {topKills.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400 text-xs">
                  No kill data for this event yet.
                </td>
              </tr>
            ) : (
              topKills.map((row, i) => (
                <tr key={row.id}>
                  <td className="pickem-numeric px-3 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-3 py-2 font-bold">{row.player}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.team}</td>
                  <td className="pickem-numeric px-3 py-2 text-right font-black">{row.kills}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const rosterUpdatesBlock = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className={sectionRowHeadingClass}>Roster updates</h3>
        <Link href="/dashboard/pick-em" className={`${sectionActionLinkClass} md:hidden`}>
          Edit picks →
        </Link>
      </div>
      {statusRows.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(["All", ...STATUSES_FOR_DASHBOARD_TABLE] as const).map((opt) => {
            const isActive = statusFilter === opt;
            const count = opt === "All" ? statusRows.length : statusRows.filter((r) => r.status === opt).length;
            if (opt !== "All" && count === 0) return null;
            return (
              <button
                key={opt}
                onClick={() => setStatusFilter(opt)}
                className={`font-azonix text-[10px] uppercase tracking-wide rounded-full px-2.5 py-1 border transition-colors ${
                  isActive
                    ? "border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-black"
                    : "border-gray-300 dark:border-white/15 text-gray-700 dark:text-gray-300 hover:border-gray-500 dark:hover:border-white/40"
                }`}
              >
                {opt} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-white/10">
        <table className="w-full text-left text-sm font-azonix">
          <thead className="bg-gray-100 dark:bg-white/5 text-[10px] uppercase tracking-widest text-gray-600 dark:text-gray-400">
            <tr>
              <th className="px-3 py-2 w-6"></th>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2 w-28">Status</th>
              <th className="px-3 py-2 text-right w-20">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10 text-gray-900 dark:text-white">
            {(() => {
              const visible = statusFilter === "All" ? statusRows : statusRows.filter((r) => r.status === statusFilter);
              if (visible.length === 0) {
                return (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400 text-xs">
                      No player status changes for this event.
                    </td>
                  </tr>
                );
              }
              return visible.map((row) => {
                const meta = STATUS_META[row.status];
                const updatedLabel = row.updatedAt
                  ? row.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : null;
                return (
                  <tr key={row.id}>
                    <td className="pl-3 pr-0 py-2 align-middle">
                      <span
                        className={`inline-flex leading-none align-top ${STATUS_TICK_BASE} ${meta.tickClass}`}
                        style={{ width: 14, height: 14, fontSize: 10 }}
                        title={meta.label}
                      >
                        {meta.tickGlyph}
                      </span>
                    </td>
                    <td className="px-3 py-2 min-w-0">
                      <div className="text-[11px] font-bold truncate">{row.player}</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{row.team}</div>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <span className={`${STATUS_BUTTON_BASE_CLASS} ${meta.buttonClass}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="pickem-numeric px-3 py-2 text-right text-gray-600 dark:text-gray-300 align-middle">
                      {updatedLabel ?? "—"}
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );

  const sectionColumnTitleClass =
    "hidden md:block font-azonix text-sm font-black uppercase tracking-widest text-gray-900 dark:text-white";

  const statsSection = (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h2 className={sectionColumnTitleClass}>Live stats</h2>
      {confirmedKillsBlock}
    </div>
  );

  const livePicksBlock = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className={sectionRowHeadingClass}>Live picks</h3>
        <Link href="/dashboard/pick-em" className={sectionActionLinkClass}>
          Edit picks →
        </Link>
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl bg-gray-100 dark:bg-[#1a1a1a]">
        <div className="flex-1 py-4 px-2">
          <div className="grid grid-cols-3 gap-1.5 mb-1.5" style={{ gridTemplateRows: "minmax(130px, 1fr)" }}>
            <div className="col-span-2 bg-black rounded-lg p-2 flex flex-col justify-between">
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <div className="w-11 h-11 rounded-full border-2 border-white/20 overflow-hidden flex items-center justify-center">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center ${getAvatarColor(displayName || "User")}`}>
                        <span className="text-white font-bold text-sm">
                          {getInitials(displayName || "User")}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-3.5 h-3.5 rounded-full bg-white/10 border border-white/15" />
                    ))}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white/40 text-[8px] uppercase tracking-widest font-bold leading-none">Player</div>
                  <div className="text-white font-black text-sm uppercase leading-tight truncate mb-1">
                    {displayName?.toUpperCase() || user?.email?.split("@")[0]?.toUpperCase() || "PLAYER"}
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0">
                    {[
                      { label: "Event Rank:", val: eventRank ? `#${eventRank}` : "#—" },
                      { label: "Season Rank:", val: seasonRank ? `#${seasonRank}` : "#—" },
                      { label: "Event Pts:", val: eventPoints ?? "—" },
                      { label: "Season Pts:", val: seasonPoints ?? "—" },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <div className="text-white/30 text-[8px] uppercase tracking-widest font-bold leading-none">{label}</div>
                        <div className="pickem-numeric text-white font-black text-lg leading-tight">{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between mb-0.5">
                  <div className="text-white/40 text-[8px] uppercase tracking-widest font-bold">Cost Cap</div>
                  <div className="pickem-numeric text-white font-black text-sm leading-none">{formatCost(remainingBudget)}</div>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${budgetPct > 85 ? "bg-red-500" : "bg-[#00f976]"}`}
                    style={{ width: `${100 - budgetPct}%` }}
                  />
                </div>
              </div>
            </div>

            <div>
              {(() => {
                const cap = captainId ? picks.find((p) => p.player_id === captainId) : null;
                return cap ? (
                  <SlotCard player={cap} isCaptain={true} />
                ) : (
                  <Link href="/dashboard/pick-em">
                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-yellow-400/50 bg-yellow-400/5 h-full gap-1.5 min-h-[120px] cursor-pointer hover:border-yellow-400/80 hover:bg-yellow-400/10 transition-all">
                      <span className="bg-yellow-400 text-black text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest">
                        CPT
                      </span>
                      <span className="text-yellow-600 dark:text-yellow-400 text-[8px] uppercase font-black tracking-widest text-center px-1 leading-tight">
                        Set a captain
                      </span>
                      <span className="text-yellow-600 dark:text-yellow-400/70 text-[7px] font-bold tracking-widest text-center px-1 leading-tight">
                        1.5× Points
                      </span>
                    </div>
                  </Link>
                );
              })()}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5" style={{ gridTemplateRows: "repeat(3, minmax(110px, 1fr))" }}>
            {playerSlots
              .filter((slot) => !slot.player || slot.player.player_id !== captainId)
              .slice(0, 9)
              .map((slot) => (
                <div key={slot.id} className="h-full">
                  {slot.player ? <SlotCard player={slot.player} isCaptain={false} /> : <EmptySlot />}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );

  const pickemSection = (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h2 className={sectionColumnTitleClass}>Pick&apos;Em paintball</h2>
      {livePicksBlock}
      {rosterUpdatesBlock}
    </div>
  );

  return (
    <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden bg-white dark:bg-stone-950">
      {liveEvent ? (
        <EventCountdownBanner
          event={liveEvent}
          variant="dashboard"
          mobileBlackBarFullBleed
          showBudget={false}
          ctaHref="/dashboard/pick-em"
          ctaLabel="Pick your team ›"
        />
      ) : null}

      <div className="mx-auto w-full max-w-7xl flex min-h-0 flex-1 flex-col">
        <MonochromePillTabs
          value={mobileTab}
          onChange={setMobileTab}
          tabs={[
            { value: "all", label: "All" },
            { value: "pickem", label: "Pick'Em" },
            { value: "stats", label: "Stats" },
          ]}
        />

        {/* Desktop: stats | pickem */}
        <div className="hidden md:grid md:grid-cols-2 md:flex-1 md:min-h-0 md:gap-0">
          <div
            className="min-h-0 overflow-y-auto border-r border-gray-200 dark:border-white/10"
            onScroll={reportStatsScroll}
          >
            {statsSection}
          </div>
          <div className="min-h-0 overflow-y-auto" onScroll={reportPickemScroll}>
            {pickemSection}
          </div>
        </div>

        {/* Mobile: tab panels */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain md:hidden">
          {mobileTab === "all" && (
            <div className="flex flex-col gap-4 p-4 md:p-6">
              {livePicksBlock}
              {confirmedKillsBlock}
              {rosterUpdatesBlock}
            </div>
          )}
          {mobileTab === "stats" && statsSection}
          {mobileTab === "pickem" && pickemSection}
        </div>
      </div>
    </div>
  );
}
