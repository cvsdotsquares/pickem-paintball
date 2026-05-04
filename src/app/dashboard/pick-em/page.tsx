"use client";
import Link from "next/link";
import { useAuth } from "@/src/contexts/authProvider";
import { useSubscription } from "@/src/contexts/SubscriptionContext";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IoMdClose } from "react-icons/io";
import { getDownloadURL, getStorage, listAll, ref } from "firebase/storage";
import { PiPlusBold } from "react-icons/pi";
import { MdShuffle, MdFavorite, MdFavoriteBorder, MdTune } from "react-icons/md";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useDashboardNestedScrollHandler } from "@/src/contexts/DashboardMainScrollContext";
import EventCountdownBanner from "@/src/components/Dashboard/EventCountdownBanner";
import { DASHBOARD_BANNER_PICK_CTA_CLASS } from "@/src/components/Dashboard/dashboardEventBannerShared";
import { eventRecordToBannerModel } from "@/src/lib/eventCountdownBannerModel";
import { getBannerAccentColor } from "@/src/lib/bannerPhase";
import { individualEventDisplayName } from "@/src/lib/eventDisplayName";
import {
  PlayerStatus,
  STATUS_META,
  STATUS_BUTTON_BASE_CLASS,
  STATUS_TICK_BASE_CLASS,
  isPlayerStatus,
  shouldShowStatusPill,
} from "@/src/lib/player-status";

export interface Player {
  player_id: string;
  Player: string;
  Team: string;
  Rank: string;
  team_id: string;
  Cost: number;
  league_id: string;
  picture?: string;
  pictureLoading?: boolean;
  img_url?: string;
  elimsByEvent?: Record<string, number>;
  Status?: PlayerStatus;
  StatusUpdatedAt?: any;
}

const PlayerStatusPill = ({ status }: { status?: PlayerStatus }) => {
  if (!shouldShowStatusPill(status)) return null;
  const meta = STATUS_META[status];
  return (
    <span className={`${STATUS_BUTTON_BASE_CLASS} ${meta.buttonClass}`}>
      {meta.label}
    </span>
  );
};

const PlayerStatusTick = ({ status, size = 16 }: { status?: PlayerStatus; size?: number }) => {
  const meta = status ? STATUS_META[status] : null;
  if (!meta) return null;
  return (
    <span
      className={`${STATUS_TICK_BASE_CLASS} ${meta.tickClass}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.7) }}
      aria-label={meta.label}
      title={meta.label}
    >
      {meta.tickGlyph}
    </span>
  );
};

interface PlayerSlot {
  id: number;
  position: string;
  isSelected: boolean;
  player: Player | null;
}

const formatCost = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(v);
const formatCostShort = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
const GRID_COLS = "48px minmax(120px,1fr) 64px 60px 60px 60px 28px 28px";
const MOBILE_GRID_COLS = "40px minmax(80px,1fr) 40px 26px 26px 26px 28px 28px";

type RecentEvent = { id: string; label: string; abbrev: string };

interface PlayerRowProps {
  player: Player;
  isSelected: boolean;
  isFavourite: boolean;
  onToggleFavourite: (id: string) => void;
  onPlayerAction: (player: Player) => void;
  recentEvents: RecentEvent[];
}

const PlayerRow = memo(({ player, isSelected, isFavourite, onToggleFavourite, onPlayerAction, recentEvents }: PlayerRowProps) => (
  <div onClick={() => onPlayerAction(player)}
    className={`border-b border-black/5 dark:border-white/5 cursor-pointer transition-colors ${isSelected ? "bg-black/5 dark:bg-white/10" : "hover:bg-black/3 dark:hover:bg-white/5"}`}
    style={{ display: "grid", gridTemplateColumns: GRID_COLS, alignItems: "center", gap: "12px", padding: "8px 12px" }}>
    <div className="relative w-12 h-12 rounded overflow-hidden bg-[#1a1a1a] flex-shrink-0">
      <div className="absolute inset-0 bg-cover bg-top" style={{ backgroundImage: `url(${player.picture || "/placeholder.svg"})` }} />
    </div>
    <div className="min-w-0 flex flex-col items-start leading-none gap-[2px]">
      <div className="text-gray-900 dark:text-white font-bold text-[11px] truncate max-w-full">{player.Player}</div>
      <div className="text-gray-400 dark:text-white/40 text-[10px] truncate max-w-full">{player.Team}</div>
      <PlayerStatusPill status={player.Status} />
    </div>
    <div className="pickem-numeric text-gray-600 dark:text-white/60 text-[11px] font-bold text-center">{formatCost(player.Cost)}</div>
    {Array.from({ length: 3 }).map((_, i) => {
      const e = recentEvents[i];
      const elims = e ? player.elimsByEvent?.[e.id] : undefined;
      return (
        <div key={i} className="text-gray-600 dark:text-white/60 text-[11px] font-bold text-center">
          {elims != null ? <span className="pickem-numeric">{elims}</span> : <span className="text-gray-300 dark:text-white/25">—</span>}
        </div>
      );
    })}
    <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors justify-self-center
      ${isSelected
        ? "bg-gray-900 dark:bg-white border-gray-900 dark:border-white"
        : "border-gray-300 dark:border-white/20 hover:border-gray-500 dark:hover:border-white/50 bg-transparent"
      }`}>
      {isSelected
        ? <IoMdClose className="text-white dark:text-black text-[10px]" />
        : <PiPlusBold className="text-gray-500 dark:text-white/60 text-[10px]" />
      }
    </div>
    <button onClick={(e) => { e.stopPropagation(); onToggleFavourite(player.player_id); }}
      className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors justify-self-center
        ${isFavourite ? "border-red-400 bg-red-400/10" : "border-gray-300 dark:border-white/20 bg-transparent hover:border-red-400/50"}`}>
      {isFavourite
        ? <MdFavorite className="text-red-400 text-[10px]" />
        : <MdFavoriteBorder className="text-gray-400 dark:text-white/40 text-[10px]" />}
    </button>
  </div>
));

const MobilePlayerRow = memo(({ player, isSelected, isFavourite, onToggleFavourite, onPlayerAction, recentEvents }: PlayerRowProps) => (
  <div onClick={() => onPlayerAction(player)}
    className={`border-b border-black/5 dark:border-white/5 cursor-pointer transition-colors ${isSelected ? "bg-black/5 dark:bg-white/10" : ""}`}
    style={{ display: "grid", gridTemplateColumns: MOBILE_GRID_COLS, alignItems: "center", gap: "8px", padding: "8px 12px" }}>
    <div className="relative w-10 h-10 rounded overflow-hidden bg-[#1a1a1a] flex-shrink-0">
      <div className="absolute inset-0 bg-cover bg-top" style={{ backgroundImage: `url(${player.picture || "/placeholder.svg"})` }} />
    </div>
    <div className="min-w-0 flex flex-col items-start leading-none gap-[2px]">
      <div className="text-gray-900 dark:text-white font-bold text-[11px] truncate max-w-full">{player.Player}</div>
      <div className="text-gray-400 dark:text-white/40 text-[9px] truncate max-w-full">{player.Team}</div>
      <PlayerStatusPill status={player.Status} />
    </div>
    <div className="pickem-numeric text-gray-600 dark:text-white/60 text-[10px] font-bold text-center">{formatCostShort(player.Cost)}</div>
    {Array.from({ length: 3 }).map((_, i) => {
      const e = recentEvents[i];
      const elims = e ? player.elimsByEvent?.[e.id] : undefined;
      return (
        <div key={i} className="text-gray-600 dark:text-white/60 text-[10px] font-bold text-center">
          {elims != null ? <span className="pickem-numeric">{elims}</span> : <span className="text-gray-300 dark:text-white/25">—</span>}
        </div>
      );
    })}
    <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors justify-self-center
      ${isSelected ? "bg-gray-900 dark:bg-white border-gray-900 dark:border-white" : "border-gray-300 dark:border-white/20 bg-transparent"}`}>
      {isSelected ? <IoMdClose className="text-white dark:text-black text-[10px]" /> : <PiPlusBold className="text-gray-500 dark:text-white/60 text-[10px]" />}
    </div>
    <button onClick={(e) => { e.stopPropagation(); onToggleFavourite(player.player_id); }}
      className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors justify-self-center
        ${isFavourite ? "border-red-400 bg-red-400/10" : "border-gray-300 dark:border-white/20 bg-transparent hover:border-red-400/50"}`}>
      {isFavourite
        ? <MdFavorite className="text-red-400 text-[10px]" />
        : <MdFavoriteBorder className="text-gray-400 dark:text-white/40 text-[10px]" />}
    </button>
  </div>
));

export default function Pickems() {
  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>(
    Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      position: `p${i + 1}`,
      isSelected: i === 0,
      player: null as Player | null,
    }))
  );
  const [temporaryPicks, setTemporaryPicks] = useState<Player[]>([]);
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [liveEvent, setLiveEvent] = useState<any>({ id: null, lockDate: null, timeLeft: "" });
  const TOTAL_BUDGET = 1000000;
  const [remainingBudget, setRemainingBudget] = useState(TOTAL_BUDGET);
  const remainingBudgetRef = useRef(TOTAL_BUDGET);
  const [visiblePlayersCount, setVisiblePlayersCount] = useState(20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [costRange, setCostRange] = useState<[number, number]>([0, 1000000]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [teams, setTeams] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sortOption, setSortOption] = useState<{ field: string; direction: "asc" | "desc" }>({ field: "name", direction: "asc" });
  const [shuffledIds, setShuffledIds] = useState<string[] | null>(null);
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(new Set());
  const [showFavourites, setShowFavourites] = useState(false);
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({});
  const reportPickEmDesktopListScroll = useDashboardNestedScrollHandler("pick-em-desktop-rows");

  const db = getFirestore();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      try {
        const stored = localStorage.getItem("pickem_favourites");
        if (stored) setFavouriteIds(new Set(JSON.parse(stored)));
      } catch {}
      return;
    }
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (!snap.exists()) return;
      const ids: string[] = snap.data().pickem_favourites ?? [];
      if (ids.length > 0) setFavouriteIds(new Set(ids));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);
  const { isSubscribed, showModal } = useSubscription();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [userProfile, setUserProfile] = useState<{
    displayName?: string;
    photoURL?: string;
    eventRank?: number;
    seasonRank?: number;
    eventElims?: number;
    seasonElims?: number;
  }>({});

  function useThrottledState<T>(initialState: T, delay = 300): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [state, setState] = useState(initialState);
    const lastUpdate = useRef(Date.now());
    const throttledSetState = useCallback((newState: React.SetStateAction<T>) => {
      if (Date.now() - lastUpdate.current >= delay) { setState(newState); lastUpdate.current = Date.now(); }
    }, [delay]);
    return [state, throttledSetState];
  }

  const [rowData, setRowData] = useThrottledState<any[]>([]);
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);

  const [recentEvents, setRecentEvents] = useState<{id: string, label: string, abbrev: string}[]>([]);
  const recentEventsRef = useRef<{id: string, label: string, abbrev: string}[]>([]);
  const eventElimsRef = useRef<Record<string, Record<string, number>>>({});
  const [elimsVersion, setElimsVersion] = useState(0);

  const filteredPlayers = useMemo(() => {
    if (rowData.length === 0) return [];
    let result = [...rowData];
    if (searchTerm.trim()) {
      const cleanSearch = searchTerm.toLowerCase().replace(/\s+/g, "");
      result = result.filter((player) => {
        const np = player.Player.toLowerCase().replace(/\s+/g, "");
        const nt = player.Team.toLowerCase().replace(/\s+/g, "");
        return np.includes(cleanSearch) || nt.includes(cleanSearch);
      });
    }
    result = result.filter((p) => p.Cost >= costRange[0] && p.Cost <= costRange[1]);
    if (selectedTeams.length > 0) result = result.filter((p) => selectedTeams.includes(p.Team));
    if (showFavourites) result = result.filter((p) => favouriteIds.has(p.player_id));
    if (shuffledIds) {
      const idToIdx = Object.fromEntries(shuffledIds.map((id, i) => [id, i]));
      result.sort((a, b) => (idToIdx[a.player_id] ?? Infinity) - (idToIdx[b.player_id] ?? Infinity));
    } else {
      result.sort((a, b) => {
        let cmp = 0;
        if (sortOption.field === "name") cmp = a.Player.localeCompare(b.Player);
        else if (sortOption.field === "team") cmp = a.Team.localeCompare(b.Team);
        else if (sortOption.field === "cost") cmp = a.Cost - b.Cost;
        else if (sortOption.field.startsWith("event_")) {
          const idx = parseInt(sortOption.field.slice(6), 10);
          const eventId = recentEvents[idx]?.id ?? "";
          cmp = (a.elimsByEvent?.[eventId] ?? 0) - (b.elimsByEvent?.[eventId] ?? 0);
        }
        return sortOption.direction === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [rowData, searchTerm, costRange, selectedTeams, sortOption, shuffledIds, showFavourites, favouriteIds, recentEvents]);

  const visiblePlayers = useMemo(() => {
    return filteredPlayers.slice(0, visiblePlayersCount);
  }, [filteredPlayers, visiblePlayersCount]);

  const handleScroll = useCallback(() => {
    if (isLoadingMore || visiblePlayers.length >= filteredPlayers.length) return;
    const container = isMobile ? mobileScrollRef.current : desktopScrollRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - (scrollTop + clientHeight) < 300) {
      setIsLoadingMore(true);
      setTimeout(() => { setVisiblePlayersCount((p) => Math.min(p + 20, filteredPlayers.length)); setIsLoadingMore(false); }, 300);
    }
  }, [isLoadingMore, visiblePlayers.length, filteredPlayers.length, isMobile]);

  useEffect(() => {
    const container = isMobile ? mobileScrollRef.current : desktopScrollRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll, { passive: true });
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [visiblePlayers, handleScroll, isMobile, isDrawerOpen]);

  const fetchFromFirestore = async (path: string): Promise<any[]> => {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  };

  const fetchPlayerPicture = async (leagueId: string): Promise<string> => {
    try {
      const fileList = await listAll(ref(getStorage(), `players/`));
      const match = fileList.items.find((item) => item.name.startsWith(`${leagueId}_`));
      return match ? await getDownloadURL(match) : "/placeholder.svg";
    } catch { return "/placeholder.svg"; }
  };

  useEffect(() => {
    const fetchLiveEvent = async () => {
      try {
        const events = await fetchFromFirestore("events");
        const live = events.find((e: any) => e.status === "live") as any;
        if (live) {
          const yearFromId = typeof live.id === "string" ? live.id.match(/(\d{4})/)?.[1] : undefined;
          const year = live.year != null ? String(live.year) : yearFromId || undefined;
          const banner = eventRecordToBannerModel({ id: live.id, ...live });
          setLiveEvent({ ...banner, year, timeLeft: "" });
        }
        // Compute 3 most recent past events (sorted by lockDate descending)
        const past = events
          .filter((e: any) => e.id !== live?.id && e.lockDate != null)
          .sort((a: any, b: any) => {
            const aTime = a.lockDate?.toDate?.()?.getTime() ?? 0;
            const bTime = b.lockDate?.toDate?.()?.getTime() ?? 0;
            return bTime - aTime;
          })
          .slice(0, 3)
          .map((e: any) => {
            const yearFromId = typeof e.id === "string" ? e.id.match(/(\d{4})/)?.[1] : undefined;
            const year = e.year != null ? String(e.year) : yearFromId;
            const label = individualEventDisplayName({ id: e.id, name: e.name, year });
            const location = label.split(" - ")[0];
            const abbrev = location.split(/\s+/).map((w: string) => w[0]).join("").toUpperCase();
            return { id: e.id, label, abbrev };
          });
        setRecentEvents(past);
        recentEventsRef.current = past;
      } catch (e) { console.error(e); }
    };
    fetchLiveEvent();
  }, []);

  useEffect(() => {
    if (recentEvents.length === 0) return;
    const fetchAll = async () => {
      await Promise.all(recentEvents.map(async ({ id }) => {
        try {
          const snap = await getDocs(collection(db, `events/${id}/players`));
          const map: Record<string, number> = {};
          snap.docs.forEach((d) => {
            const v = d.data()["Confirmed Kills"];
            if (v != null) map[d.id] = v;
          });
          eventElimsRef.current = { ...eventElimsRef.current, [id]: map };
        } catch (e) { console.error(`Failed to fetch elims for ${id}:`, e); }
      }));
      setElimsVersion((v) => v + 1);
    };
    fetchAll();
  }, [recentEvents]);

  useEffect(() => {
    let mounted = true;
    const fetchPlayers = async () => {
      if (!liveEvent.id) return;
      setIsLoadingMore(true);
      try {
        const raw = await fetchFromFirestore(`events/${liveEvent.id}/players`);
        const players: Player[] = raw.map((r: any) => ({
          player_id: r.player_id != null ? String(r.player_id) : r.id, league_id: r.league_id, Player: r.Player, Team: r.Team,
          Rank: r.Rank, team_id: r.team_id, Cost: r.Cost, img_url: r.img_url,
          picture: r.img_url?.trim() ? r.img_url : undefined,
          pictureLoading: !r.img_url?.trim(),
          Status: isPlayerStatus(r.Status) ? r.Status : undefined,
          StatusUpdatedAt: r.StatusUpdatedAt,
          elimsByEvent: Object.fromEntries(
            Object.entries(eventElimsRef.current)
              .map(([eventId, elims]) => [eventId, elims[String(r.player_id)]] as [string, number])
              .filter(([, v]) => v != null)
          ),
        }));
        const uniqueTeams = Array.from(new Set(raw.map((p: any) => p.Team).filter(Boolean))) as string[];
        if (mounted) { setRowData(players); setTeams(uniqueTeams); setIsLoadingMore(false); }
      } catch (e) { if (mounted) { console.error(e); setIsLoadingMore(false); } }
    };
    fetchPlayers();
    return () => { mounted = false; };
  }, [liveEvent.id]);

  useEffect(() => {
    if (!elimsVersion || !rowData.length) return;
    setRowData((prev) => prev.map((p) => ({
      ...p,
      elimsByEvent: Object.fromEntries(
        Object.entries(eventElimsRef.current)
          .map(([eventId, elims]) => [eventId, elims[String(p.player_id)]] as [string, number])
          .filter(([, v]) => v != null)
      ),
    })));
  }, [elimsVersion]);

  useEffect(() => {
    const fetchPics = async () => {
      if (!visiblePlayers.length) return;
      const updates = await Promise.all(visiblePlayers.map(async (p) => {
        if (p.picture) return null;
        const picture = p.img_url?.trim() ? p.img_url : await fetchPlayerPicture(p.league_id).catch(() => "/placeholder.svg");
        return { player_id: p.player_id, picture };
      }));
      setRowData((prev) => prev.map((p) => {
        const u = updates.find((u) => u?.player_id === p.player_id);
        return u ? { ...p, picture: u.picture, pictureLoading: false } : p;
      }));
    };
    const t = setTimeout(fetchPics, 200);
    return () => clearTimeout(t);
  }, [visiblePlayers]);

  useEffect(() => {
    if (!user || !liveEvent.id) return;
    const fetchPicks = async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) return;
        const data = snap.data();

        // FIX: resolve display name with priority: username > firstName+lastName > name > displayName > email
        const resolvedName =
          data.username ||
          (data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : null) ||
          data.name ||
          data.displayName ||
          user?.displayName ||
          user?.email?.split("@")[0] ||
          "PLAYER";

        // Resolve profile photo — profilePicture is a Storage path, needs getDownloadURL
        let resolvedPhoto: string | undefined = undefined;
        if (data.profilePicture) {
          try {
            resolvedPhoto = await getDownloadURL(ref(getStorage(), data.profilePicture));
          } catch (e) {
            resolvedPhoto = user?.photoURL || undefined;
          }
        } else {
          resolvedPhoto = user?.photoURL || undefined;
        }

        setUserProfile((prev) => ({
          ...prev,
          displayName: resolvedName,
          photoURL: resolvedPhoto,
          eventRank: data[`${liveEvent.id}Rank`] ?? undefined,
          eventElims: data[`${liveEvent.id}PTS`] ?? undefined,
        }));

        // Use official picks if present, otherwise fall back to saved draft
        const officialIds = data.pickems?.[liveEvent.id];
        const draftIds = data.pickems?.[`${liveEvent.id}_draft`];
        let ids = (Array.isArray(officialIds) && officialIds.length > 0)
          ? officialIds
          : (Array.isArray(draftIds) && draftIds.length > 0 ? draftIds : null);
        if (!ids) return;
        // Dedupe on load — corrupt data can have duplicate player IDs
        const seen = new Set<string>();
        ids = ids.filter((id: string | number) => {
          const key = String(id);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const isDraft = !(Array.isArray(officialIds) && officialIds.length > 0);
        const rawCaptainId = isDraft
          ? data.pickems?.[`${liveEvent.id}_draft_captain`]
          : data.pickems?.[`${liveEvent.id}_captain`];

        const docs = await Promise.all(ids.map((id: string) => getDoc(doc(db, `events/${liveEvent.id}/players`, id.toString()))));
        const picks = await Promise.all(docs.filter((d) => d.exists()).map(async (d) => {
          const pd = { ...d.data(), player_id: d.id } as any;
          return { ...pd, picture: pd.img_url?.trim() ? pd.img_url : await fetchPlayerPicture(pd.league_id) };
        }));
        const captainIdValue = rawCaptainId != null ? String(rawCaptainId) : null;
        if (isDraft && picks.length > 0) {
          toast.info(`Restored ${picks.length} draft pick${picks.length !== 1 ? 's' : ''} — confirm when you're ready!`, { autoClose: 4000 });
        }
        setCaptainId(captainIdValue);
        setTemporaryPicks(picks);
        setPlayerSlots((prev) => prev.map((slot, i) => ({ ...slot, player: picks[i] || null })));

        // Calculate live points with captain 1.5x multiplier (overrides stale Firebase flat field)
        const livePoints = picks.reduce((sum, p) => {
          const kills = p["Confirmed Kills"] || 0;
          return sum + (p.player_id === captainIdValue ? kills * 1.5 : kills);
        }, 0);
        if (livePoints > 0) {
          setUserProfile((prev) => ({ ...prev, eventElims: livePoints }));
        }
      } catch (e) { console.error(e); }
    };
    fetchPicks();
  }, [user, liveEvent.id]);

  useEffect(() => {
    const budget = TOTAL_BUDGET - temporaryPicks.reduce((s, p) => s + Math.round(p.Cost), 0);
    setRemainingBudget(budget);
    remainingBudgetRef.current = budget;
  }, [temporaryPicks]);

  useEffect(() => {
    const fetchLogos = async () => {
      try {
        const fileList = await listAll(ref(getStorage(), "t-logo/"));
        const logos = await Promise.all(fileList.items.map(async (item) => ({ teamId: item.name.split("_")[0], url: await getDownloadURL(item) })));
        setTeamLogos(logos.reduce((acc, { teamId, url }) => { acc[teamId] = url; return acc; }, {} as Record<string, string>));
      } catch (e) { console.error(e); }
    };
    fetchLogos();
  }, []);

  const toggleFavourite = useCallback((playerId: string) => {
    setFavouriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      const arr = Array.from(next);
      try { localStorage.setItem("pickem_favourites", JSON.stringify(arr)); } catch {}
      if (user?.uid) {
        updateDoc(doc(db, "users", user.uid), { pickem_favourites: arr }).catch(() => {});
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const handleShuffle = useCallback(() => {
    const ids = filteredPlayers.map((p) => p.player_id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setShuffledIds(ids);
  }, [filteredPlayers]);

  const isBeforeLockDate = (lockDate: any) => lockDate && Date.now() < new Date(lockDate).getTime();

  const handlePlayerAction = useCallback((player: Player) => {
    if (!isBeforeLockDate(liveEvent.lockDate)) {
      toast.error("Picks are locked!"); return;
    }
    setTemporaryPicks((prev) => {
      const isSelected = prev.some((p) => p.player_id === player.player_id);
      if (isSelected) {
        setCaptainId((c) => c === player.player_id ? null : c);
        setPlayerSlots((slots) => slots.map((s) => s.player?.player_id === player.player_id ? { ...s, player: null } : s));
        toast.success(`${player.Player} removed`);
        return prev.filter((p) => p.player_id !== player.player_id);
      } else {
        if (remainingBudgetRef.current - player.Cost < 0) { toast.error("Budget exceeded!"); return prev; }
        if (prev.length >= 10) { toast.error("Team is full — remove a player first."); return prev; }
        setPlayerSlots((slots) => {
          const emptyIdx = slots.findIndex((s) => !s.player);
          if (emptyIdx !== -1) return slots.map((s, i) => i === emptyIdx ? { ...s, player, isSelected: false } : s);
          return slots;
        });
        setCaptainId((c) => c ?? player.player_id);
        toast.success(`${player.Player} added`);
        return [...prev, player];
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEvent.lockDate]);

  const handleCaptainSelection = (playerId: string) => {
    if (!isBeforeLockDate(liveEvent.lockDate)) { toast.error("Picks are locked!"); return; }
    if (!temporaryPicks.find((p) => p.player_id === playerId)) { toast.error("Captain must be one of your picks!"); return; }
    setCaptainId(playerId);
    toast.success(`${temporaryPicks.find((p) => p.player_id === playerId)?.Player} is now captain (1.5× pts)`);
  };

  const handleCaptainUnset = () => {
    if (!isBeforeLockDate(liveEvent.lockDate)) { toast.error("Picks are locked!"); return; }
    setCaptainId(null);
  };

  const confirmPicks = async () => {
    if (!user) { toast.error("Must be logged in"); return; }
    if (!isBeforeLockDate(liveEvent.lockDate)) { toast.error("Picks locked!"); return; }
    if (temporaryPicks.length < 10) { toast.warning("Select all 10 players first!"); return; }
    if (!captainId) { toast.warning("Select a captain first!"); return; }
    try {
      const picksIds = Array.from(new Map(temporaryPicks.map((p) => [String(p.player_id), p])).values()).map((p) => String(p.player_id));
      await updateDoc(doc(db, "users", user.uid), {
        [`pickems.${liveEvent.id}`]: picksIds,
        [`pickems.${liveEvent.id}_captain`]: captainId ? String(captainId) : null,
      });
      setSaveStatus("saved");
      toast.success("Picks saved!");
      maybeShowSupportModal();
    } catch { toast.error("Failed to save picks."); }
  };

  const MODAL_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes, persisted in localStorage
  const MODAL_COOLDOWN_KEY = 'pickem_modal_last_shown';

  // Keep isSubscribed in a ref so autosave's setTimeout always reads the latest value
  const isSubscribedRef = useRef(isSubscribed);
  useEffect(() => { isSubscribedRef.current = isSubscribed; }, [isSubscribed]);

  const maybeShowSupportModal = useCallback(() => {
    if (isSubscribedRef.current) return;
    const lastShown = parseInt(localStorage.getItem(MODAL_COOLDOWN_KEY) || '0', 10);
    const now = Date.now();
    if (now - lastShown > MODAL_COOLDOWN_MS) {
      localStorage.setItem(MODAL_COOLDOWN_KEY, String(now));
      showModal('soft-gate');
    }
  }, [showModal]);

  // Auto-save with 2s debounce when team is complete (official picks — drives scoring)
  useEffect(() => {
    if (temporaryPicks.length < 10 || !captainId || !user) return;
    if (!isBeforeLockDate(liveEvent?.lockDate)) return;
    setSaveStatus("saving");
    const timer = setTimeout(async () => {
      try {
        const picksIds = Array.from(new Map(temporaryPicks.map((p) => [String(p.player_id), p])).values()).map((p) => String(p.player_id));
        await updateDoc(doc(db, "users", user.uid), {
          [`pickems.${liveEvent.id}`]: picksIds,
          [`pickems.${liveEvent.id}_captain`]: captainId ? String(captainId) : null,
        });
        setSaveStatus("saved");
        maybeShowSupportModal();
      } catch {
        setSaveStatus("error");
        toast.error("Failed to save picks.");
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [temporaryPicks, captainId, maybeShowSupportModal]);

  // Draft save with 3s debounce — saves partial picks so users don't lose
  // progress on refresh. Stored separately from official picks so it never
  // affects scoring until all 10 are confirmed.
  useEffect(() => {
    if (!user || !liveEvent?.id || temporaryPicks.length === 0) return;
    if (!isBeforeLockDate(liveEvent?.lockDate)) return;
    const timer = setTimeout(async () => {
      try {
        const picksIds = Array.from(new Map(temporaryPicks.map((p) => [String(p.player_id), p])).values()).map((p) => String(p.player_id));
        await updateDoc(doc(db, "users", user.uid), {
          [`pickems.${liveEvent.id}_draft`]: picksIds,
          [`pickems.${liveEvent.id}_draft_captain`]: captainId ? String(captainId) : null,
        });
      } catch { /* draft save failure is silent */ }
    }, 3000);
    return () => clearTimeout(timer);
  }, [temporaryPicks, captainId, user, liveEvent?.id]);

  const seasonLeaderboardYear = useMemo(() => {
    if (!liveEvent?.id) return null;
    const y = (liveEvent as { year?: string }).year;
    if (y) return String(y);
    return typeof liveEvent.id === "string" ? liveEvent.id.match(/(\d{4})/)?.[1] ?? null : null;
  }, [liveEvent?.id, (liveEvent as { year?: string }).year]);

  // Event rank/pts from flat fields on users/{uid} (written by leaderboard CF)
  useEffect(() => {
    if (!user?.uid || !liveEvent?.id) return;
    const db = getFirestore();
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const rank = data[`${liveEvent.id}Rank`] ?? undefined;
      const pts = data[`${liveEvent.id}PTS`] ?? undefined;
      setUserProfile((prev) => ({
        ...prev,
        eventRank: rank,
        ...(pts !== undefined && pts > 0 ? { eventElims: pts } : {}),
      }));
    });
    return () => unsub();
  }, [user?.uid, liveEvent?.id]);

  // Season rank & points from leaderboards/season_{year} (not duplicated event fields)
  useEffect(() => {
    if (!user?.uid || !seasonLeaderboardYear) return;
    const db = getFirestore();
    const unsub = onSnapshot(doc(db, "leaderboards", `season_${seasonLeaderboardYear}`), (snap) => {
      if (!snap.exists()) return;
      const usersArr = snap.data()?.users || [];
      const row = usersArr.find((u: { id: string }) => u.id === user.uid);
      if (!row) return;
      setUserProfile((prev) => ({
        ...prev,
        seasonRank: row.seasonRank ?? prev.seasonRank,
        seasonElims:
          row.seasonTotalPoints !== undefined && row.seasonTotalPoints !== null
            ? row.seasonTotalPoints
            : prev.seasonElims,
      }));
    });
    return () => unsub();
  }, [user?.uid, seasonLeaderboardYear]);

  const budgetPct = Math.min(100, ((TOTAL_BUDGET - remainingBudget) / TOTAL_BUDGET) * 100);

  // ── SLOT CARD ────────────────────────────────────────────────────────────────
  const SlotCard = memo(({ player, isCaptain, isLocked, onRemove, onSetCaptain }: {
    player: Player; isCaptain: boolean; isLocked?: boolean; onRemove: () => void; onSetCaptain: () => void;
  }) => (
    <div className={`relative rounded-lg overflow-hidden group cursor-pointer h-full w-full ${isCaptain ? "ring-2 ring-yellow-400" : "ring-1 ring-black/10 dark:ring-white/10"}`}>
      <div className="absolute inset-0 bg-cover bg-top bg-[#1a1a1a]" style={{ backgroundImage: `url(${player.picture || "/placeholder.svg"})` }} />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 to-transparent" />
      {/* Status tick top-right — always visible when player has a status */}
      {player.Status && (
        <div className="absolute top-1.5 right-1.5 z-10 flex leading-none">
          <PlayerStatusTick status={player.Status} size={14} />
        </div>
      )}
      {/* Remove button top-left — hidden when locked */}
      {!isLocked && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="absolute top-1 left-1 z-20 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <IoMdClose className="text-white text-[8px]" />
        </button>
      )}
      {/* Player info bottom-left */}
      <div className="absolute bottom-0 inset-x-0 p-1">
        <div className="text-white font-bold text-[8px] truncate">{player.Player}</div>
        <div className="text-white/40 text-[7px] truncate">{player.Team}</div>
        <div className="pickem-numeric text-white/60 text-[8px] font-bold">{formatCost(player.Cost)}</div>
      </div>
      {/* CPT button bottom-right — disabled after lock */}
      <button
        onClick={(e) => { e.stopPropagation(); if (!isLocked) onSetCaptain(); }}
        className={`absolute bottom-1 right-1 z-10 font-black uppercase tracking-widest px-1 py-0.5 rounded transition-all flex flex-col items-center leading-none gap-[1px]
          ${isCaptain ? "bg-yellow-400 text-black" : "bg-black/50 text-white/30 border border-white/20"}
          ${isLocked ? "opacity-50 cursor-not-allowed" : ""}`}>
        <span className="text-[6px]">{isCaptain ? "★ CPT" : "CPT"}</span>
        {isCaptain && <span className="text-[5px] opacity-80">1.5× PTS</span>}
      </button>
    </div>
  ));

  // ── EMPTY SLOT ───────────────────────────────────────────────────────────────
  const EmptySlot = ({ slot }: { slot: PlayerSlot }) => (
    <button onClick={() => { setPlayerSlots((p) => p.map((s) => ({ ...s, isSelected: s.id === slot.id }))); setIsDrawerOpen(true); }}
      className="flex flex-col gap-1 justify-center items-center rounded-lg border border-dashed border-black/15 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.02] hover:border-black/30 dark:hover:border-white/30 transition-all w-full h-full">
      <span className="text-black/20 dark:text-white/20 text-base">+</span>
      <span className="text-[7px] uppercase text-black/20 dark:text-white/20 font-bold tracking-widest text-center px-1 leading-tight">Add Player</span>
    </button>
  );


  const pickEmBannerModel = useMemo(() => {
    if (!liveEvent?.id) return null;
    return eventRecordToBannerModel({ id: liveEvent.id, ...liveEvent } as Record<string, unknown> & { id: string });
  }, [liveEvent]);

  return (
    <div className="flex flex-col w-full overflow-hidden bg-[#f0f0f0] dark:bg-[#111] h-[calc(100dvh-106px)] md:h-[calc(100dvh-48px)]">

      {/* ── EVENT BANNER (shared component) ───────────────────────────────────── */}
      {pickEmBannerModel ? (
        <EventCountdownBanner
          variant="dashboard"
          mobileBlackBarFullBleed
          event={pickEmBannerModel}
          showBudget={false}
          desktopCta={
            pickEmBannerModel.eventEndsAt != null &&
            pickEmBannerModel.eventEndsAt.getTime() <= Date.now() ? (
              <Link
                href="/dashboard/leaderboard"
                className={DASHBOARD_BANNER_PICK_CTA_CLASS}
                style={{
                  backgroundColor: getBannerAccentColor({
                    lockDate: pickEmBannerModel.lockDate,
                    eventEndsAt: pickEmBannerModel.eventEndsAt ?? null,
                    nextPicksOpenAt: pickEmBannerModel.nextPicksOpenAt ?? null,
                    brandColor: pickEmBannerModel.brandColor,
                    nextBrandColor: pickEmBannerModel.nextBrandColor,
                  }),
                }}
              >
                View Past Results
              </Link>
            ) : (
              <button
                type="button"
                onClick={confirmPicks}
                className={DASHBOARD_BANNER_PICK_CTA_CLASS}
                style={{
                  backgroundColor: getBannerAccentColor({
                    lockDate: pickEmBannerModel.lockDate,
                    eventEndsAt: pickEmBannerModel.eventEndsAt ?? null,
                    nextPicksOpenAt: pickEmBannerModel.nextPicksOpenAt ?? null,
                    brandColor: pickEmBannerModel.brandColor,
                    nextBrandColor: pickEmBannerModel.nextBrandColor,
                  }),
                }}
              >
                Pick your team &gt;
              </button>
            )
          }
        />
      ) : null}

      {/* ── MAIN SPLIT ────────────────────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-7xl flex flex-1 overflow-hidden">

        {/* LEFT: Unified Grid */}
        <div className="flex flex-col w-full md:w-[45%] border-r border-gray-200 dark:border-white/10 overflow-hidden bg-[#f0f0f0] dark:bg-[#111]">

          {/* Grid fills all remaining height — confirm bar is always visible below */}
          <div className="relative flex-1 overflow-hidden min-h-0">
            <div className="h-full px-2 pt-2 pb-1">
              <div className="grid grid-cols-3 gap-1.5 h-full" style={{
                gridTemplateRows: "auto 1fr 1fr 1fr"
              }}>

                {/* ── ROW 1: My Team + Cost Cap (2 cols) + Captain slot (1 col) ── */}
                <div className="col-span-2 bg-black rounded-lg p-2 flex flex-col justify-between">
                  <div className="flex items-start gap-2">
                    {/* Avatar — forced square so it never squishes */}
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <div className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/10 border-2 border-white/20 overflow-hidden flex items-center justify-center">
                        {userProfile.photoURL
                          ? <img src={userProfile.photoURL} alt="" className="w-full h-full object-cover rounded-full" style={{ aspectRatio: "1/1" }} />
                          : <span className="text-white/50 font-black text-lg">{(userProfile.displayName || user?.email || "?")[0].toUpperCase()}</span>}
                      </div>
                      <div className="flex gap-0.5">{[0, 1, 2].map((i) => <div key={i} className="w-3.5 h-3.5 rounded-full bg-white/10 border border-white/15" />)}</div>
                    </div>
                    {/* Player name + stats */}
                    <div className="flex-1 min-w-0">
                      <div className="text-white/40 text-[8px] uppercase tracking-widest font-bold leading-none">Player</div>
                      <div className="text-white font-black text-sm uppercase leading-tight truncate mb-1">{userProfile.displayName?.toUpperCase() || user?.email?.split("@")[0]?.toUpperCase() || "PLAYER"}</div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0">
                        {[
                          { label: "Event Rank:", val: userProfile.eventRank ? `#${userProfile.eventRank}` : "#—" },
                          { label: "Season Rank:", val: userProfile.seasonRank ? `#${userProfile.seasonRank}` : "#—" },
                          { label: "Event Points:", val: userProfile.eventElims ?? "—" },
                          { label: "Season Points:", val: userProfile.seasonElims ?? "—" },
                        ].map(({ label, val }) => (
                          <div key={label}>
                            <div className="text-white/30 text-[8px] uppercase tracking-widest font-bold leading-none whitespace-nowrap">{label}</div>
                            <div className="pickem-numeric text-white font-black text-lg leading-tight">{val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="hidden md:block">
                    <div className="flex items-baseline justify-between mb-0.5">
                      <div className="text-white/40 text-[8px] uppercase tracking-widest font-bold">Budget left</div>
                      <div className="pickem-numeric text-white font-black text-sm leading-none">{formatCost(remainingBudget)}</div>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${budgetPct > 85 ? "bg-red-500" : "bg-[#00f976]"}`} style={{ width: `${100 - budgetPct}%` }} />
                    </div>
                  </div>

                </div>

                {/* Captain slot */}
                <div>
                  {(() => {
                    const cap = captainId ? temporaryPicks.find((p) => String(p.player_id) === String(captainId)) : null;
                    return cap
                      ? <SlotCard player={cap} isCaptain={true} isLocked={!isBeforeLockDate(liveEvent.lockDate)} onRemove={() => handlePlayerAction(cap)} onSetCaptain={handleCaptainUnset} />
                      : <div onClick={() => setIsDrawerOpen(true)} className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-yellow-400/50 bg-yellow-400/5 h-full gap-1.5 cursor-pointer hover:border-yellow-400/80 hover:bg-yellow-400/10 transition-all">
                        <span className="bg-yellow-400 text-black text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest">CPT</span>
                        <span className="text-yellow-600 dark:text-yellow-400 text-[8px] uppercase font-black tracking-widest text-center px-1 leading-tight">Set a captain</span>
                        <span className="text-yellow-600 dark:text-yellow-400/70 text-[7px] font-bold tracking-widest text-center px-1 leading-tight">1.5× Points</span>
                      </div>;
                  })()}
                </div>

                {/* ── ROWS 2–4: 9 player slots. Filter out the captain so they only appear in the captain slot above ── */}
                {[
                  ...playerSlots.filter((slot) => slot.player && String(slot.player.player_id) !== String(captainId)),
                  ...playerSlots.filter((slot) => !slot.player),
                ].slice(0, 9).map((slot) => (
                  <div key={slot.id}>
                    {slot.player
                      ? <SlotCard player={slot.player} isCaptain={captainId === slot.player.player_id} isLocked={!isBeforeLockDate(liveEvent.lockDate)} onRemove={() => handlePlayerAction(slot.player!)} onSetCaptain={() => handleCaptainSelection(slot.player!.player_id)} />
                      : <EmptySlot slot={slot} />}
                  </div>
                ))}

              </div>
            </div>
          </div>

          {/* ── CONFIRM BAR (all screen sizes) ── flex-shrink-0 so it never pushes the grid */}
          {(() => {
            const picksLeft = 10 - temporaryPicks.length;
            const isReady = temporaryPicks.length >= 10 && !!captainId;
            const needsCaptain = temporaryPicks.length >= 10 && !captainId;
            const isLocked = !isBeforeLockDate(liveEvent.lockDate);
            const confirmLabel: ReactNode = isLocked ? "Picks Locked"
              : saveStatus === "saving" ? "Saving..."
              : saveStatus === "saved" ? "✓ Picks Confirmed!"
              : isReady ? "Confirm My Picks"
              : needsCaptain ? "Set a Captain to Confirm"
              : (
                <>
                  Pick <span className="pickem-numeric">{picksLeft}</span> more to confirm
                </>
              );
            return (
              <div className="flex-shrink-0 flex gap-2 px-3 pb-2 pt-1">
                {/* Confirm — 75% */}
                <button
                  onClick={confirmPicks}
                  disabled={!isReady || saveStatus === "saving" || isLocked}
                  style={{ flex: 3 }}
                  className={`py-2 rounded-xl font-black uppercase tracking-widest text-sm transition-all
                    ${isLocked ? "bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-400 dark:text-white/30 cursor-not-allowed"
                    : saveStatus === "saved" ? "bg-[#00f976] text-neutral-950 shadow-lg shadow-[#00f976]/35"
                    : isReady ? "bg-[#00f976] hover:brightness-[0.95] text-neutral-950 shadow-lg shadow-[#00f976]/35 active:scale-95"
                    : needsCaptain ? "bg-yellow-500/20 border border-yellow-500/40 text-yellow-600 dark:text-yellow-400 cursor-not-allowed"
                    : "bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/25 text-gray-600 dark:text-white/75 cursor-not-allowed"}`}>
                  {confirmLabel}
                </button>
                {/* Reset — 25% */}
                <button
                  onClick={() => { setTemporaryPicks([]); setCaptainId(null); setSaveStatus("idle"); setPlayerSlots((p) => p.map((s) => ({ ...s, player: null }))); }}
                  disabled={isLocked}
                  style={{ flex: 1 }}
                  className="py-2 rounded-xl font-black uppercase tracking-widest text-sm border border-gray-300 dark:border-white/25 text-gray-600 dark:text-white/75 hover:text-gray-800 dark:hover:text-white hover:border-gray-400 dark:hover:border-white/40 bg-gray-100 dark:bg-white/10 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed">
                  Reset
                </button>
              </div>
            );
          })()}
        </div>

        {/* RIGHT: Player Table */}
        <div className="hidden md:flex flex-col flex-1 overflow-hidden p-2">
          <div className="flex flex-col flex-1 overflow-hidden rounded-xl bg-white dark:bg-[#0d0d0d] ring-1 ring-black/10 dark:ring-white/10">
          {/* Search */}
          <div className="flex-shrink-0 px-3 py-3 border-b border-gray-100 dark:border-white/5">
            <div className="flex gap-2">
              <input type="text" placeholder="Search Players" value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setVisiblePlayersCount(20); }}
                className="flex-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full px-4 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 outline-none focus:border-gray-400 dark:focus:border-white/30" />
              <button
                onClick={() => setShowFavourites((v) => !v)}
                className={`px-3 py-2 border rounded-full text-xs font-bold transition-colors flex items-center gap-1 ${showFavourites ? "border-red-400 text-red-400 bg-red-50 dark:bg-red-400/10" : "border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/50 hover:border-gray-400"}`}>
                <MdFavorite className="text-sm" />
                {favouriteIds.size > 0 && <span className="pickem-numeric text-[8px]">{favouriteIds.size}</span>}
              </button>
              <button
                onClick={handleShuffle}
                className={`px-3 py-2 border rounded-full text-xs font-bold transition-colors flex items-center gap-1 ${shuffledIds ? "border-gray-800 dark:border-white/60 text-gray-900 dark:text-white bg-gray-100 dark:bg-white/10" : "border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/50 hover:border-gray-400"}`}>
                <MdShuffle className="text-sm" />
              </button>
              <button
                onClick={() => setIsFilterOpen((v) => !v)}
                className={`px-4 py-2 border rounded-full text-xs font-bold transition-colors ${isFilterOpen ? "border-gray-800 dark:border-white/60 text-gray-900 dark:text-white bg-gray-100 dark:bg-white/10" : "border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/50 hover:border-gray-400"}`}>
                Filter {(selectedTeams.length > 0) && <span className="ml-1 bg-black dark:bg-white text-white dark:text-black rounded-full px-1.5 py-0.5 text-[8px]"><span className="pickem-numeric">{selectedTeams.length}</span></span>}
              </button>
            </div>

            {/* Filter panel */}
            {isFilterOpen && (
              <div className="mt-2 p-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[8px] uppercase tracking-widest font-black text-gray-500 dark:text-white/40">Filter by Team</span>
                  {selectedTeams.length > 0 && (
                    <button onClick={() => setSelectedTeams([])} className="text-[8px] uppercase tracking-widest font-black text-gray-400 dark:text-white/30 hover:text-gray-700 dark:hover:text-white transition-colors">Clear</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                  {teams.sort().map((team) => (
                    <button key={team} onClick={() => setSelectedTeams((prev) => prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team])}
                      className={`text-[8px] font-bold px-2 py-0.5 rounded-full border transition-colors ${selectedTeams.includes(team) ? "bg-gray-900 dark:bg-white text-white dark:text-black border-transparent" : "border-gray-200 dark:border-white/15 text-gray-600 dark:text-white/50 hover:border-gray-400"}`}>
                      {team}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Table header — outside search container, same level as rows */}
          <div className="flex-shrink-0 border-b border-gray-100 dark:border-white/5"
            style={{ display: "grid", gridTemplateColumns: GRID_COLS, alignItems: "center", gap: "12px", padding: "6px 12px" }}>
            <div />
            <div />
            {[
              { label: "Cost", sub: null, field: "cost" },
              ...Array.from({ length: 3 }).map((_, i) => ({
                label: "ELIMS",
                sub: recentEvents[i]?.label ?? null,
                field: `event_${i}`,
              })),
            ].map(({ label, sub, field }) => (
              <div key={field} className="text-center cursor-pointer select-none"
                onClick={() => { setShuffledIds(null); setSortOption((prev) => ({ field, direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc" })); }}>
                <div className={`text-[8px] uppercase tracking-widest font-bold ${sortOption.field === field ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60"}`}>
                  {label}{sortOption.field === field && <span className="ml-0.5 text-[6px]">{sortOption.direction === "asc" ? "↑" : "↓"}</span>}
                </div>
                {sub && <div className={`text-[8px] font-bold opacity-70 ${sortOption.field === field ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-white/30"}`}>{sub}</div>}
              </div>
            ))}
            <div />
            <div />
          </div>
          {/* Rows */}
          <div
            className="flex-1 overflow-y-auto"
            ref={desktopScrollRef}
            style={{ scrollbarGutter: "stable" }}
            onScroll={reportPickEmDesktopListScroll}
          >
            {isLoadingMore && rowData.length === 0
              ? <div className="flex flex-col items-center justify-center py-12"><div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-gray-300 dark:border-white/30 mb-2" /><span className="text-gray-400 dark:text-white/30 text-[10px] uppercase tracking-widest">Loading players...</span></div>
              : visiblePlayers.length === 0
                ? <div className="text-center py-12 text-gray-400 dark:text-white/30 text-[10px] uppercase tracking-widest">No players match</div>
                : <>
                  {visiblePlayers.map((player) => (
                    <PlayerRow key={player.player_id} player={player} isSelected={temporaryPicks.some((p) => String(p.player_id) === String(player.player_id))} isFavourite={favouriteIds.has(player.player_id)} onToggleFavourite={toggleFavourite} onPlayerAction={handlePlayerAction} recentEvents={recentEvents} />
                  ))}
                  {isLoadingMore && <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-gray-300 dark:border-white/30" /></div>}
                </>
            }
          </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE DRAWER ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isDrawerOpen && (
          <motion.div className="fixed md:hidden top-28 left-0 right-0 z-30 bg-white dark:bg-[#0d0d0d] shadow-xl border-t border-gray-200 dark:border-white/10"
            style={{ height: "80vh" }} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 400 }}>
            <div className="flex flex-col h-full">
              <div className="flex justify-between items-center px-4 pt-4 pb-3 border-b border-gray-100 dark:border-white/10">
                <div>
                  <span className="text-xs font-black uppercase tracking-widest text-gray-900 dark:text-white">Select Players</span>
                  <div className="flex gap-3 mt-1">
                    <span className={`text-[10px] font-bold ${10 - temporaryPicks.length === 0 ? "text-[#00f976]" : "text-gray-400 dark:text-white/40"}`}>
                      {10 - temporaryPicks.length === 0
                        ? "✓ Team full"
                        : (
                          <>
                            <span className="pickem-numeric">{10 - temporaryPicks.length}</span>
                            {` pick${10 - temporaryPicks.length !== 1 ? "s" : ""} remaining`}
                          </>
                        )}
                    </span>
                    <span className={`text-[10px] font-bold ${remainingBudget < 0 ? "text-red-500" : "text-gray-400 dark:text-white/40"}`}>
                      <span className="pickem-numeric">{formatCost(remainingBudget)}</span> left
                    </span>
                  </div>
                </div>
                <button onClick={() => setIsDrawerOpen(false)} className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"><IoMdClose size={18} /></button>
              </div>
              <div className="flex flex-col gap-2 px-3 py-2 border-b border-gray-100 dark:border-white/5">
                <div className="flex gap-2">
                  <input type="text" placeholder="Search Players" value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setVisiblePlayersCount(20); }}
                    className="flex-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full px-4 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 outline-none" />
                  <button onClick={() => setShowFavourites((v) => !v)}
                    className={`flex-shrink-0 px-3 py-2 rounded-full border transition-colors flex items-center gap-1 relative
                      ${showFavourites ? "border-red-400 text-red-400 bg-red-50 dark:bg-red-400/10" : "border-gray-200 dark:border-white/15 text-gray-600 dark:text-white/60"}`}>
                    <MdFavorite className="text-base" />
                    {favouriteIds.size > 0 && <span className="pickem-numeric text-[8px]">{favouriteIds.size}</span>}
                  </button>
                  <button onClick={handleShuffle}
                    className={`flex-shrink-0 px-3 py-2 rounded-full border transition-colors flex items-center justify-center
                      ${shuffledIds ? "bg-gray-900 dark:bg-white text-white dark:text-black border-transparent" : "border-gray-200 dark:border-white/15 text-gray-600 dark:text-white/60"}`}>
                    <MdShuffle className="text-base" />
                  </button>
                  <button onClick={() => setIsFilterOpen((p) => !p)}
                    className={`flex-shrink-0 px-3 py-2 rounded-full border transition-colors flex items-center justify-center relative
                      ${isFilterOpen ? "bg-gray-900 dark:bg-white text-white dark:text-black border-transparent" : "border-gray-200 dark:border-white/15 text-gray-600 dark:text-white/60"}`}>
                    <MdTune className="text-base" />
                    {selectedTeams.length > 0 && (
                      <span className="absolute -top-1 -right-1 bg-gray-900 dark:bg-white text-white dark:text-black text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center"><span className="pickem-numeric">{selectedTeams.length}</span></span>
                    )}
                  </button>
                </div>
                {isFilterOpen && (
                  <div className="pt-1 pb-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[8px] uppercase tracking-widest font-black text-gray-500 dark:text-white/40">Filter by Team</span>
                      {selectedTeams.length > 0 && (
                        <button onClick={() => setSelectedTeams([])} className="text-[8px] uppercase tracking-widest font-black text-gray-400 dark:text-white/30 hover:text-gray-700 dark:hover:text-white transition-colors">Clear</button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                      {teams.sort().map((team) => (
                        <button key={team} onClick={() => setSelectedTeams((prev) => prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team])}
                          className={`text-[8px] font-bold px-2 py-0.5 rounded-full border transition-colors ${selectedTeams.includes(team) ? "bg-gray-900 dark:bg-white text-white dark:text-black border-transparent" : "border-gray-200 dark:border-white/15 text-gray-600 dark:text-white/50 hover:border-gray-400"}`}>
                          {team}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile table header — outside padded container, same level as rows */}
              <div className="flex-shrink-0 border-b border-gray-100 dark:border-white/5"
                style={{ display: "grid", gridTemplateColumns: MOBILE_GRID_COLS, alignItems: "center", gap: "8px", padding: "6px 12px" }}>
                <div />
                {/* Player name — sortable */}
                <div className="cursor-pointer select-none" onClick={() => { setShuffledIds(null); setSortOption((prev) => ({ field: "name", direction: prev.field === "name" && prev.direction === "asc" ? "desc" : "asc" })); }}>
                  <span className={`text-[7px] uppercase tracking-widest font-bold leading-none ${sortOption.field === "name" ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-white/30"}`}>
                    Player{sortOption.field === "name" && <span className="ml-0.5 text-[6px]">{sortOption.direction === "asc" ? "↑" : "↓"}</span>}
                  </span>
                </div>
                {[
                  { label: "Cost", sub: null, field: "cost" },
                  ...Array.from({ length: 3 }).map((_, i) => ({
                    label: "Elims",
                    sub: recentEvents[i]?.abbrev ?? null,
                    field: `event_${i}`,
                  })),
                ].map(({ label, sub, field }) => (
                  <div key={field} className="text-center cursor-pointer select-none"
                    onClick={() => { setShuffledIds(null); setSortOption((prev) => ({ field, direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc" })); }}>
                    <div className={`text-[7px] uppercase tracking-widest font-bold leading-none ${sortOption.field === field ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-white/30"}`}>
                      {label}{sortOption.field === field && <span className="ml-0.5 text-[6px]">{sortOption.direction === "asc" ? "↑" : "↓"}</span>}
                    </div>
                    {sub && <div className={`text-[7px] font-bold opacity-70 ${sortOption.field === field ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-white/30"}`}>{sub}</div>}
                  </div>
                ))}
                <div />
                <div />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto touch-pan-y" ref={mobileScrollRef} style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", scrollbarGutter: "stable" }}>
                {visiblePlayers.map((player) => (
                  <MobilePlayerRow key={`m-${player.player_id}`} player={player} isSelected={temporaryPicks.some((p) => String(p.player_id) === String(player.player_id))} isFavourite={favouriteIds.has(player.player_id)} onToggleFavourite={toggleFavourite} onPlayerAction={handlePlayerAction} recentEvents={recentEvents} />
                ))}
                {isLoadingMore && <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white/30" /></div>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
