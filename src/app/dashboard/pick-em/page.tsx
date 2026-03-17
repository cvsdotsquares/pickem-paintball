"use client";
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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IoMdClose } from "react-icons/io";
import { getDownloadURL, getStorage, listAll, ref } from "firebase/storage";
import { PiPlusBold } from "react-icons/pi";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

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
  totalElims?: number;
  lonestarElims?: number;
  midwestElims?: number;
}

interface PlayerSlot {
  id: number;
  position: string;
  isSelected: boolean;
  player: Player | null;
}

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
  const [visiblePlayersCount, setVisiblePlayersCount] = useState(20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [costRange, setCostRange] = useState<[number, number]>([0, 1000000]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [teams, setTeams] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sortOption, setSortOption] = useState<{ field: string; direction: "asc" | "desc" }>({ field: "name", direction: "asc" });
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({});

  const db = getFirestore();
  const { user } = useAuth();
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
    result.sort((a, b) => {
      let cmp = 0;
      if (sortOption.field === "name") cmp = a.Player.localeCompare(b.Player);
      else if (sortOption.field === "team") cmp = a.Team.localeCompare(b.Team);
      else if (sortOption.field === "cost") cmp = a.Cost - b.Cost;
      else if (sortOption.field === "elim") cmp = (a.totalElims ?? 0) - (b.totalElims ?? 0);
      else if (sortOption.field === "lonestar") cmp = (a.lonestarElims ?? 0) - (b.lonestarElims ?? 0);
      else if (sortOption.field === "midwest") cmp = (a.midwestElims ?? 0) - (b.midwestElims ?? 0);
      return sortOption.direction === "asc" ? cmp : -cmp;
    });
    return result;
  }, [rowData, searchTerm, costRange, selectedTeams, sortOption]);

  const { selectedPlayers, availablePlayers } = useMemo(() => ({
    selected: filteredPlayers.filter((p) => temporaryPicks.some((tp) => tp.player_id === p.player_id)),
    available: filteredPlayers.filter((p) => !temporaryPicks.some((tp) => tp.player_id === p.player_id)),
  } as any), [filteredPlayers, temporaryPicks]);

  const visiblePlayers = useMemo(() => {
    const sel = filteredPlayers.filter((p) => temporaryPicks.some((tp) => tp.player_id === p.player_id));
    const avail = filteredPlayers.filter((p) => !temporaryPicks.some((tp) => tp.player_id === p.player_id));
    return [...sel, ...avail.slice(0, Math.max(0, visiblePlayersCount - sel.length))];
  }, [filteredPlayers, temporaryPicks, visiblePlayersCount]);

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
          const logoUrl = live.event_logo || live.logoUrl || null;
          console.log("[PickEm] live event:", live.id, "logo:", logoUrl);
          setLiveEvent({
            id: live.id,
            lockDate: live.lockDate?.toDate ? live.lockDate.toDate() : null,
            timeLeft: "",
            name: live.name || "TAMPA BAY OPEN",
            venue: live.venue || "RAYMOND JAMES STADIUM",
            city: live.city || "TAMPA, FLORIDA",
            startDate: live.startDate || "MAR 19",
            endDate: live.endDate || "22",
            eventNumber: live.eventNumber || "1",
            logoUrl,
            brandColor: live.brand_color || null,
          });
        }
      } catch (e) { console.error(e); }
    };
    fetchLiveEvent();
  }, []);

  useEffect(() => {
    if (!liveEvent.lockDate) return;
    const tick = () => {
      const diff = new Date(liveEvent.lockDate).getTime() - Date.now();
      if (diff <= 0) { setLiveEvent((p: any) => ({ ...p, _days: 0, _hours: 0, _minutes: 0, _seconds: 0 })); return; }
      setLiveEvent((p: any) => ({
        ...p,
        _days: Math.floor(diff / 86400000),
        _hours: Math.floor((diff % 86400000) / 3600000),
        _minutes: Math.floor((diff % 3600000) / 60000),
        _seconds: Math.floor((diff % 60000) / 1000),
      }));
    };
    const interval = setInterval(tick, 1000);
    tick();
    return () => clearInterval(interval);
  }, [liveEvent.lockDate]);

  const [seasonElims, setSeasonElims] = useState<Record<string, number>>({});
  const seasonElimsRef = useRef<Record<string, number>>({});
  const lonestarElimsRef = useRef<Record<string, number>>({});
  const midwestElimsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const fetchSeasonElims = async () => {
      try {
        const snap = await getDocs(collection(db, "events/world_cup_2025/players"));
        const map: Record<string, number> = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          map[d.id] = data["Confirmed Kills"] ?? undefined;
        });
        console.log("[SeasonElims] sample keys:", Object.keys(map).slice(0, 5));
        console.log("[SeasonElims] sample values:", Object.entries(map).slice(0, 5));
        setSeasonElims(map);
        seasonElimsRef.current = map;
      } catch (e) { console.error("Failed to fetch season elims:", e); }
    };
    fetchSeasonElims();

    const fetchEventElims = async (eventId: string, ref: React.MutableRefObject<Record<string, number>>) => {
      try {
        const snap = await getDocs(collection(db, `events/${eventId}/players`));
        const map: Record<string, number> = {};
        snap.docs.forEach((d) => { map[d.id] = d.data()["Confirmed Kills"] ?? undefined; });
        ref.current = map;
      } catch (e) { console.error(`Failed to fetch elims for ${eventId}:`, e); }
    };
    fetchEventElims("lonestar_open_2025", lonestarElimsRef);
    fetchEventElims("midwest_open_2025", midwestElimsRef);
  }, []);

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
          totalElims: seasonElimsRef.current[String(r.player_id)] ?? undefined,
          lonestarElims: lonestarElimsRef.current[String(r.player_id)] ?? undefined,
          midwestElims: midwestElimsRef.current[String(r.player_id)] ?? undefined,
        }));
        const uniqueTeams = Array.from(new Set(raw.map((p: any) => p.Team).filter(Boolean))) as string[];
        if (mounted) { setRowData(players); setTeams(uniqueTeams); setIsLoadingMore(false); }
      } catch (e) { if (mounted) { console.error(e); setIsLoadingMore(false); } }
    };
    fetchPlayers();
    return () => { mounted = false; };
  }, [liveEvent.id]);

  // Merge season elims into player rows whenever either dataset updates
  useEffect(() => {
    if (!Object.keys(seasonElims).length || !rowData.length) return;
    console.log("[Merge] first player:", { player_id: rowData[0]?.player_id, typeof_pid: typeof rowData[0]?.player_id });
    console.log("[Merge] first seasonElims key:", Object.keys(seasonElims)[0], "typeof:", typeof Object.keys(seasonElims)[0]);
    console.log("[Merge] direct lookup test:", seasonElims[String(rowData[0]?.player_id)]);
    setRowData((prev) => prev.map((p) => ({
      ...p,
      totalElims: seasonElimsRef.current[String(p.player_id)] ?? p.totalElims,
      lonestarElims: lonestarElimsRef.current[String(p.player_id)] ?? p.lonestarElims,
      midwestElims: midwestElimsRef.current[String(p.player_id)] ?? p.midwestElims,
    })));
  }, [seasonElims]);

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

        setUserProfile({
          displayName: resolvedName,
          photoURL: resolvedPhoto,
          eventRank: data[`${liveEvent.id}Rank`] ?? undefined,
          seasonRank: data[`${liveEvent.id}Rank`] ?? undefined,  // season = event for first event
          eventElims: data[`${liveEvent.id}PTS`] ?? undefined,
          seasonElims: data[`${liveEvent.id}PTS`] ?? undefined,  // season = event for first event
        });

        // Use official picks if present, otherwise fall back to saved draft
        const officialIds = data.pickems?.[liveEvent.id];
        const draftIds = data.pickems?.[`${liveEvent.id}_draft`];
        const ids = (Array.isArray(officialIds) && officialIds.length > 0)
          ? officialIds
          : (Array.isArray(draftIds) && draftIds.length > 0 ? draftIds : null);
        if (!ids) return;

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
          setUserProfile(prev => ({ ...prev, eventElims: livePoints, seasonElims: livePoints }));
        }
      } catch (e) { console.error(e); }
    };
    fetchPicks();
  }, [user, liveEvent.id]);

  useEffect(() => {
    setRemainingBudget(TOTAL_BUDGET - temporaryPicks.reduce((s, p) => s + Math.round(p.Cost), 0));
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

  const isBeforeLockDate = (lockDate: any) => lockDate && Date.now() < new Date(lockDate).getTime();

  const handlePlayerAction = (player: Player) => {
    if (!isBeforeLockDate(liveEvent.lockDate)) {
      toast.error("Picks are locked!"); return;
    }
    const isSelected = temporaryPicks.some((p) => p.player_id === player.player_id);
    if (isSelected) {
      setTemporaryPicks(temporaryPicks.filter((p) => p.player_id !== player.player_id));
      if (captainId === player.player_id) setCaptainId(null);
      setPlayerSlots((prev) => prev.map((s) => s.player?.player_id === player.player_id ? { ...s, player: null } : s));
      toast.success(`${player.Player} removed`);
    } else {
      if (remainingBudget - player.Cost < 0) { toast.error("Budget exceeded!"); return; }
      if (temporaryPicks.length >= 10) { toast.error("Team is full — remove a player first."); return; }
      const newPicks = [...temporaryPicks, player];
      setTemporaryPicks(newPicks);
      const emptyIdx = playerSlots.findIndex((s) => !s.player);
      if (emptyIdx !== -1) setPlayerSlots((prev) => prev.map((s, i) => i === emptyIdx ? { ...s, player, isSelected: false } : s));
      // Auto-set as captain if no captain selected yet
      if (!captainId) setCaptainId(player.player_id);
      toast.success(`${player.Player} added`);
    }
  };

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
      await updateDoc(doc(db, "users", user.uid), {
        [`pickems.${liveEvent.id}`]: temporaryPicks.map((p) => String(p.player_id)),
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
        await updateDoc(doc(db, "users", user.uid), {
          [`pickems.${liveEvent.id}`]: temporaryPicks.map((p) => String(p.player_id)),
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
        await updateDoc(doc(db, "users", user.uid), {
          [`pickems.${liveEvent.id}_draft`]: temporaryPicks.map((p) => String(p.player_id)),
          [`pickems.${liveEvent.id}_draft_captain`]: captainId ? String(captainId) : null,
        });
      } catch { /* draft save failure is silent */ }
    }, 3000);
    return () => clearTimeout(timer);
  }, [temporaryPicks, captainId, user, liveEvent?.id]);

  // Live rank/pts: updates the moment the Cloud Function writes flat fields
  useEffect(() => {
    if (!user?.uid || !liveEvent?.id) return;
    const db = getFirestore();
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const rank = data[`${liveEvent.id}Rank`] ?? undefined;
      const pts  = data[`${liveEvent.id}PTS`]  ?? undefined;
      setUserProfile(prev => ({
        ...prev,
        eventRank: rank,
        seasonRank: rank,
        ...(pts !== undefined && pts > 0 ? { eventElims: pts, seasonElims: pts } : {}),
      }));
    });
    return () => unsub();
  }, [user?.uid, liveEvent?.id]);

  const formatCost = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(v);
  const pad = (n: number) => String(n ?? 0).padStart(2, "0");
  const budgetPct = Math.min(100, ((TOTAL_BUDGET - remainingBudget) / TOTAL_BUDGET) * 100);

  // ── SLOT CARD ────────────────────────────────────────────────────────────────
  const SlotCard = memo(({ player, isCaptain, isLocked, onRemove, onSetCaptain }: {
    player: Player; isCaptain: boolean; isLocked?: boolean; onRemove: () => void; onSetCaptain: () => void;
  }) => (
    <div className={`relative rounded-lg overflow-hidden group cursor-pointer h-full w-full ${isCaptain ? "ring-2 ring-yellow-400" : "ring-1 ring-black/10 dark:ring-white/10"}`}>
      <div className="absolute inset-0 bg-cover bg-top bg-[#1a1a1a]" style={{ backgroundImage: `url(${player.picture || "/placeholder.svg"})` }} />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 to-transparent" />
      {/* Remove button top-right — hidden when locked */}
      {!isLocked && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="absolute top-1 right-1 z-10 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <IoMdClose className="text-white text-[8px]" />
        </button>
      )}
      {/* Player info bottom-left */}
      <div className="absolute bottom-0 inset-x-0 p-1">
        <div className="text-white font-bold text-[8px] truncate">{player.Player}</div>
        <div className="text-white/40 text-[7px] truncate">{player.Team}</div>
        <div className="text-white/60 text-[8px] font-bold">{formatCost(player.Cost)}</div>
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

  const formatCostShort = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
  const MOBILE_GRID_COLS = "32px minmax(80px,1fr) 40px 26px 26px 26px 28px";

  const MobilePlayerRow = memo(({ player, isSelected }: { player: Player; isSelected: boolean }) => (
    <div onClick={() => handlePlayerAction(player)}
      className={`border-b border-black/5 dark:border-white/5 cursor-pointer transition-colors ${isSelected ? "bg-black/5 dark:bg-white/10" : ""}`}
      style={{ display: "grid", gridTemplateColumns: MOBILE_GRID_COLS, alignItems: "center", gap: "8px", padding: "8px 12px" }}>
      <div className="relative w-8 h-8 rounded overflow-hidden bg-[#1a1a1a]">
        <div className="absolute inset-0 bg-cover bg-top" style={{ backgroundImage: `url(${player.picture || "/placeholder.svg"})` }} />
      </div>
      <div className="min-w-0">
        <div className="text-gray-900 dark:text-white font-bold text-[11px] truncate">{player.Player}</div>
        <div className="text-gray-400 dark:text-white/40 text-[9px] truncate">{player.Team}</div>
      </div>
      <div className="text-gray-600 dark:text-white/60 text-[10px] font-bold text-center">{formatCostShort(player.Cost)}</div>
      <div className="text-gray-600 dark:text-white/60 text-[10px] font-bold text-center">
        {player.totalElims != null ? player.totalElims : <span className="text-gray-300 dark:text-white/25">—</span>}
      </div>
      <div className="text-gray-600 dark:text-white/60 text-[10px] font-bold text-center">
        {player.lonestarElims != null ? player.lonestarElims : <span className="text-gray-300 dark:text-white/25">—</span>}
      </div>
      <div className="text-gray-600 dark:text-white/60 text-[10px] font-bold text-center">
        {player.midwestElims != null ? player.midwestElims : <span className="text-gray-300 dark:text-white/25">—</span>}
      </div>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors justify-self-center
        ${isSelected ? "bg-gray-900 dark:bg-white border-gray-900 dark:border-white" : "border-gray-300 dark:border-white/20 bg-transparent"}`}>
        {isSelected ? <IoMdClose className="text-white dark:text-black text-[10px]" /> : <PiPlusBold className="text-gray-500 dark:text-white/60 text-[10px]" />}
      </div>
    </div>
  ));
  const GRID_COLS = "36px minmax(120px,1fr) 64px 60px 60px 60px 28px";

  const PlayerRow = memo(({ player, isSelected }: { player: Player; isSelected: boolean }) => (
    <div onClick={() => handlePlayerAction(player)}
      className={`border-b border-black/5 dark:border-white/5 cursor-pointer transition-colors ${isSelected ? "bg-black/5 dark:bg-white/10" : "hover:bg-black/3 dark:hover:bg-white/5"}`}
      style={{ display: "grid", gridTemplateColumns: GRID_COLS, alignItems: "center", gap: "12px", padding: "8px 12px" }}>
      <div className="relative w-9 h-9 rounded overflow-hidden bg-[#1a1a1a] flex-shrink-0">
        <div className="absolute inset-0 bg-cover bg-top" style={{ backgroundImage: `url(${player.picture || "/placeholder.svg"})` }} />
      </div>
      <div className="min-w-0">
        <div className="text-gray-900 dark:text-white font-bold text-[11px] truncate">{player.Player}</div>
        <div className="text-gray-400 dark:text-white/40 text-[10px] truncate">{player.Team}</div>
      </div>
      <div className="text-gray-600 dark:text-white/60 text-[11px] font-bold text-center">{formatCost(player.Cost)}</div>
      <div className="text-gray-600 dark:text-white/60 text-[11px] font-bold text-center">
        {player.totalElims != null ? player.totalElims : <span className="text-gray-300 dark:text-white/25">—</span>}
      </div>
      <div className="text-gray-600 dark:text-white/60 text-[11px] font-bold text-center">
        {player.lonestarElims != null ? player.lonestarElims : <span className="text-gray-300 dark:text-white/25">—</span>}
      </div>
      <div className="text-gray-600 dark:text-white/60 text-[11px] font-bold text-center">
        {player.midwestElims != null ? player.midwestElims : <span className="text-gray-300 dark:text-white/25">—</span>}
      </div>
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
    </div>
  ));

  return (
    <div className="flex flex-col w-full overflow-hidden bg-[#f0f0f0] dark:bg-[#111] h-[calc(100dvh-106px)] md:h-[calc(100dvh-48px)]">

      {/* ── EVENT BANNER ──────────────────────────────────────────────────────── */}

      {/* MOBILE banner */}
      <div className="md:hidden flex-shrink-0 rounded-b-2xl mx-0" style={{ backgroundColor: liveEvent.brandColor || "#b91c1c" }}>
        {/* Top strip — countdown */}
        <div style={{ backgroundColor: "rgba(0,0,0,0.35)", height: "32px", display: "flex", flexDirection: "column", paddingLeft: "12px", paddingRight: "12px", paddingBottom: "6px" }}>
          <div style={isTouchDevice ? { height: "12px", flexShrink: 0 } : { flex: 1, minHeight: 0 }} />
          <div style={{ display: "flex", gap: "8px" }}>
            <span className="text-white text-[11px] font-black uppercase tracking-widest whitespace-nowrap">Team Lock Deadline:</span>
            <span className="text-white font-black text-[11px] whitespace-nowrap">
              {pad(liveEvent._days)}d : {pad(liveEvent._hours)}h : {pad(liveEvent._minutes)}m : {pad(liveEvent._seconds)}s
            </span>
          </div>
        </div>
        {/* Bottom strip — event name + cost cap */}
        <div className="flex items-center justify-between px-3 py-2">
          <div>
            <div className="text-white/70 text-[10px] uppercase tracking-widest font-bold">Event {liveEvent.eventNumber || "1"}</div>
            <div className="text-white font-black text-lg uppercase leading-tight">NXL {liveEvent.name || "TAMPA BAY OPEN"}</div>
            <div className="text-white/70 text-[11px] font-bold">{liveEvent.startDate || "MAR 19"} — {liveEvent.endDate || "22"}</div>
          </div>
          <div className="text-right flex-shrink-0 ml-4">
            <div className="text-white/70 text-[10px] uppercase tracking-widest font-bold">Cost Cap</div>
            <div className="text-white font-black text-sm">{formatCost(remainingBudget)}</div>
            <div className="w-24 h-1.5 bg-black/30 rounded-full overflow-hidden mt-0.5">
              <div className={`h-full rounded-full transition-all duration-500 ${budgetPct > 85 ? "bg-red-300" : "bg-green-400"}`} style={{ width: `${100 - budgetPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* DESKTOP banner */}
      <div className="hidden md:flex flex-shrink-0 bg-black py-3 px-4 items-center justify-center">
        <div className="flex items-stretch rounded-xl w-full max-w-4xl bg-white" style={{ height: 110, boxShadow: "0 0 0 1px rgba(0,0,0,0.08)" }}>

          {/* Logo panel */}
          <div style={{ width: 180, borderRadius: "0.75rem 0 0 0.75rem", backgroundColor: liveEvent.brandColor || "#b91c1c", flexShrink: 0, overflow: "hidden", position: "relative" }}>
            {liveEvent.logoUrl && (
              <img
                src={liveEvent.logoUrl}
                alt="Event Logo"
                style={{ position: "absolute", inset: 0, width: "90%", height: "90%", top: "5%", left: "5%", objectFit: "contain" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            {!liveEvent.logoUrl && (
              <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0.75rem", color: "white", fontWeight: 900, fontSize: "0.875rem", textTransform: "uppercase", textAlign: "center", lineHeight: 1.2 }}>{liveEvent.name || "NXL EVENT"}</span>
            )}
          </div>

          {/* Event details */}
          <div className="flex-1 px-5 flex flex-col justify-center border-l border-gray-100">
            <div className="text-gray-400 text-[8px] uppercase tracking-widest font-bold">Event #{liveEvent.eventNumber || "1"}</div>
            <div className="text-gray-900 font-black text-base uppercase leading-tight mt-0.5" style={{ fontWeight: 900, letterSpacing: "-0.02em" }}>NXL<br />{liveEvent.name || "TAMPA BAY OPEN"}</div>
            <div className="text-gray-500 text-[9px] mt-1 uppercase leading-snug">{liveEvent.venue || "RAYMOND JAMES STADIUM"}<br />{liveEvent.city || "TAMPA , FLORIDA"}</div>
            <div className="text-gray-700 text-[10px] font-bold mt-0.5">{liveEvent.startDate || "MAR 19"} — {liveEvent.endDate || "22"}</div>
          </div>

          {/* Countdown + CTA */}
          <div className="flex-shrink-0 flex flex-col justify-center items-start px-5 border-l border-gray-100 gap-1.5 min-w-[240px]">
            <div className="text-gray-500 text-[8px] uppercase tracking-widest font-bold">Team Lock Deadline:</div>
            <div className="flex gap-1 items-end">
              {[
                { v: pad(liveEvent._days), l: "DAYS" },
                { v: pad(liveEvent._hours), l: "HOURS" },
                { v: pad(liveEvent._minutes), l: "MINS" },
                { v: pad(liveEvent._seconds), l: "SECS" },
              ].map(({ v, l }, i) => (
                <div key={l} className="flex items-end gap-1">
                  <div className="flex flex-col items-center">
                    <div className="bg-gray-900 text-white font-black text-base w-9 h-9 flex items-center justify-center rounded font-mono">{v}</div>
                    <span className="text-gray-400 text-[6px] uppercase tracking-widest mt-0.5">{l}</span>
                  </div>
                  {i < 3 && <span className="text-gray-300 font-black text-base mb-4 leading-none">:</span>}
                </div>
              ))}
            </div>
            <button onClick={confirmPicks} className="text-white text-[8px] font-black uppercase tracking-widest py-1.5 px-4 rounded transition-colors w-full text-center"
              style={{ backgroundColor: liveEvent.brandColor || "#dc2626" }}>
              Pick Your Team →
            </button>
          </div>

        </div>
      </div>

      {/* ── MAIN SPLIT ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

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
                            <div className="text-white font-black text-lg leading-tight">{val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="hidden md:block">
                    <div className="flex items-baseline justify-between mb-0.5">
                      <div className="text-white/40 text-[8px] uppercase tracking-widest font-bold">Cost Cap</div>
                      <div className="text-white font-black text-sm leading-none">{formatCost(remainingBudget)}</div>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${budgetPct > 85 ? "bg-red-500" : "bg-green-400"}`} style={{ width: `${100 - budgetPct}%` }} />
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
            const confirmLabel = isLocked ? "Picks Locked"
              : saveStatus === "saving" ? "Saving..."
              : saveStatus === "saved" ? "✓ Picks Confirmed!"
              : isReady ? "Confirm My Picks"
              : needsCaptain ? "Set a Captain to Confirm"
              : `Pick ${picksLeft} more to confirm`;
            return (
              <div className="flex-shrink-0 flex gap-2 px-3 pb-2 pt-1">
                {/* Confirm — 75% */}
                <button
                  onClick={confirmPicks}
                  disabled={!isReady || saveStatus === "saving" || isLocked}
                  style={{ flex: 3 }}
                  className={`py-2 rounded-xl font-black uppercase tracking-widest text-sm transition-all
                    ${isLocked ? "bg-white/10 text-white/30 cursor-not-allowed"
                    : saveStatus === "saved" ? "bg-green-500 text-white shadow-lg shadow-green-500/30"
                    : isReady ? "bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/30 active:scale-95"
                    : needsCaptain ? "bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 cursor-not-allowed"
                    : "bg-white/5 border border-white/10 text-white/30 cursor-not-allowed"}`}>
                  {confirmLabel}
                </button>
                {/* Reset — 25% */}
                <button
                  onClick={() => { setTemporaryPicks([]); setCaptainId(null); setSaveStatus("idle"); setPlayerSlots((p) => p.map((s) => ({ ...s, player: null }))); }}
                  disabled={isLocked}
                  style={{ flex: 1 }}
                  className="py-2 rounded-xl font-black uppercase tracking-widest text-sm border border-black/20 text-black/50 hover:text-black/80 hover:border-black/40 dark:border-white/15 dark:text-white/50 dark:hover:text-white/70 dark:hover:border-white/30 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed">
                  Reset
                </button>
              </div>
            );
          })()}
        </div>

        {/* RIGHT: Player Table */}
        <div className="hidden md:flex flex-col flex-1 overflow-hidden bg-white dark:bg-[#0d0d0d]">
          {/* Search */}
          <div className="flex-shrink-0 px-3 py-3 border-b border-gray-100 dark:border-white/5">
            <div className="flex gap-2">
              <input type="text" placeholder="Search Players" value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setVisiblePlayersCount(20); }}
                className="flex-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full px-4 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 outline-none focus:border-gray-400 dark:focus:border-white/30" />
              <button
                onClick={() => setIsFilterOpen((v) => !v)}
                className={`px-4 py-2 border rounded-full text-xs font-bold transition-colors ${isFilterOpen ? "border-gray-800 dark:border-white/60 text-gray-900 dark:text-white bg-gray-100 dark:bg-white/10" : "border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/50 hover:border-gray-400"}`}>
                Filter {(selectedTeams.length > 0) && <span className="ml-1 bg-black dark:bg-white text-white dark:text-black rounded-full px-1.5 py-0.5 text-[8px]">{selectedTeams.length}</span>}
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
              { label: "ELIMS", sub: "Worldcup 25", field: "elim" },
              { label: "ELIMS", sub: "Lonestar 25", field: "lonestar" },
              { label: "ELIMS", sub: "Midwest 25", field: "midwest" },
            ].map(({ label, sub, field }) => (
              <div key={field} className="text-center cursor-pointer select-none"
                onClick={() => setSortOption((prev) => ({ field, direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc" }))}>
                <div className={`text-[8px] uppercase tracking-widest font-bold ${sortOption.field === field ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60"}`}>
                  {label}{sortOption.field === field && <span className="ml-0.5 text-[6px]">{sortOption.direction === "asc" ? "↑" : "↓"}</span>}
                </div>
                {sub && <div className={`text-[8px] font-bold opacity-70 ${sortOption.field === field ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-white/30"}`}>{sub}</div>}
              </div>
            ))}
            <div />
          </div>
          {/* Rows */}
          <div className="flex-1 overflow-y-auto" ref={desktopScrollRef} style={{ scrollbarGutter: "stable" }}>
            {isLoadingMore && rowData.length === 0
              ? <div className="flex flex-col items-center justify-center py-12"><div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-gray-300 dark:border-white/30 mb-2" /><span className="text-gray-400 dark:text-white/30 text-[10px] uppercase tracking-widest">Loading players...</span></div>
              : visiblePlayers.length === 0
                ? <div className="text-center py-12 text-gray-400 dark:text-white/30 text-[10px] uppercase tracking-widest">No players match</div>
                : <>
                  {visiblePlayers.map((player) => (
                    <PlayerRow key={player.player_id} player={player} isSelected={temporaryPicks.some((p) => String(p.player_id) === String(player.player_id))} />
                  ))}
                  {isLoadingMore && <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-gray-300 dark:border-white/30" /></div>}
                </>
            }
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
                    <span className={`text-[10px] font-bold ${10 - temporaryPicks.length === 0 ? "text-green-500" : "text-gray-400 dark:text-white/40"}`}>
                      {10 - temporaryPicks.length === 0 ? "✓ Team full" : `${10 - temporaryPicks.length} pick${10 - temporaryPicks.length !== 1 ? "s" : ""} remaining`}
                    </span>
                    <span className={`text-[10px] font-bold ${remainingBudget < 0 ? "text-red-500" : "text-gray-400 dark:text-white/40"}`}>
                      {formatCost(remainingBudget)} left
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
                  <button onClick={() => setIsFilterOpen((p) => !p)}
                    className={`flex-shrink-0 px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest transition-colors relative
                      ${isFilterOpen ? "bg-gray-900 dark:bg-white text-white dark:text-black border-transparent" : "border-gray-200 dark:border-white/15 text-gray-600 dark:text-white/60"}`}>
                    Filter
                    {selectedTeams.length > 0 && (
                      <span className="absolute -top-1 -right-1 bg-gray-900 dark:bg-white text-white dark:text-black text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center">{selectedTeams.length}</span>
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
                <div className="cursor-pointer select-none" onClick={() => setSortOption((prev) => ({ field: "name", direction: prev.field === "name" && prev.direction === "asc" ? "desc" : "asc" }))}>
                  <span className={`text-[7px] uppercase tracking-widest font-bold leading-none ${sortOption.field === "name" ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-white/30"}`}>
                    Player{sortOption.field === "name" && <span className="ml-0.5 text-[6px]">{sortOption.direction === "asc" ? "↑" : "↓"}</span>}
                  </span>
                </div>
                {[
                  { label: "Cost", sub: null, field: "cost" },
                  { label: "Elims", sub: "WC", field: "elim" },
                  { label: "Elims", sub: "LS", field: "lonestar" },
                  { label: "Elims", sub: "MW", field: "midwest" },
                ].map(({ label, sub, field }) => (
                  <div key={field} className="text-center cursor-pointer select-none"
                    onClick={() => setSortOption((prev) => ({ field, direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc" }))}>
                    <div className={`text-[7px] uppercase tracking-widest font-bold leading-none ${sortOption.field === field ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-white/30"}`}>
                      {label}{sortOption.field === field && <span className="ml-0.5 text-[6px]">{sortOption.direction === "asc" ? "↑" : "↓"}</span>}
                    </div>
                    {sub && <div className={`text-[7px] font-bold opacity-70 ${sortOption.field === field ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-white/30"}`}>{sub}</div>}
                  </div>
                ))}
                <div />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto touch-pan-y" ref={mobileScrollRef} style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", scrollbarGutter: "stable" }}>
                {visiblePlayers.map((player) => (
                  <MobilePlayerRow key={`m-${player.player_id}`} player={player} isSelected={temporaryPicks.some((p) => String(p.player_id) === String(player.player_id))} />
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
