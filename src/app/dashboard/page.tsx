"use client";

import UserProfile from "@/src/components/Dashboard/overlay";
import DivisionInfo from "@/src/components/ui/div-info";
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
import { memo, useEffect, useRef, useState } from "react";
import { IoMdClose } from "react-icons/io";
import { getFirebaseStorageUrl } from "@/src/lib/storage";
import Link from "next/link";

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
}

interface PlayerSlot {
  id: number;
  player: Player | null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const db = getFirestore();

  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>(
    Array.from({ length: 10 }, (_, i) => ({ id: i + 1, player: null }))
  );
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [eventRank, setEventRank] = useState<number | undefined>();
  const [seasonRank, setSeasonRank] = useState<number | undefined>();
  const [eventPoints, setEventPoints] = useState<number | undefined>();
  const [seasonPoints, setSeasonPoints] = useState<number | undefined>();
  const [liveEvent, setLiveEvent] = useState<any>(null);
  const [remainingBudget, setRemainingBudget] = useState(1000000);
  const TOTAL_BUDGET = 1000000;

  const formatCost = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(v);
  const pad = (n: number) => String(n ?? 0).padStart(2, "0");

  const budgetPct = Math.min(100, ((TOTAL_BUDGET - remainingBudget) / TOTAL_BUDGET) * 100);

  // Fetch avatar + display name + stats
  useEffect(() => {
    if (!user) return;
    const fetchAvatar = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();

          // display name priority: username > firstName+lastName > name > displayName > email
          const name =
            data.username ||
            (data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : null) ||
            data.name ||
            data.displayName ||
            user.displayName ||
            user.email?.split("@")[0] ||
            "PLAYER";
          setDisplayName(name);

          // photo — profilePicture is a Storage path
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

  // Fetch live event
  useEffect(() => {
    const fetchLiveEvent = async () => {
      try {
        const snap = await getDocs(collection(db, "events"));
        const live: any = snap.docs.map((d) => ({ id: d.id, ...d.data() })).find((e: any) => e.status === "live");
        if (live) {
          setLiveEvent({
            id: live.id,
            name: live.name || "EVENT",
            brandColor: live.brand_color || "#b91c1c",
            logoUrl: live.event_logo || null,
            eventNumber: live.eventNumber || "1",
            startDate: live.startDate || "",
            endDate: live.endDate || "",
            lockDate: live.lockDate?.toDate ? live.lockDate.toDate() : null,
          });

          // Flat fields are kept live via onSnapshot below — nothing to read here
        }
      } catch (e) { console.error(e); }
    };
    fetchLiveEvent();
  }, [user?.uid]);

  // Countdown tick
  useEffect(() => {
    if (!liveEvent?.lockDate) return;
    const tick = () => {
      const diff = new Date(liveEvent.lockDate).getTime() - Date.now();
      if (diff <= 0) {
        setLiveEvent((p: any) => ({ ...p, _days: 0, _hours: 0, _minutes: 0, _seconds: 0 }));
        return;
      }
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
  }, [liveEvent?.lockDate]);

  // Live flat-field listener: updates rank/pts the moment the Cloud Function writes them
  useEffect(() => {
    if (!user?.uid || !liveEvent?.id) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const rank = data[`${liveEvent.id}Rank`] ?? undefined;
      const pts  = data[`${liveEvent.id}PTS`]  ?? undefined;
      setEventRank(rank);
      setSeasonRank(rank);
      // Only override live-calculated points when kills exist (pts > 0)
      if (pts !== undefined && pts > 0) {
        setEventPoints(pts);
        setSeasonPoints(pts);
      }
    });
    return () => unsub();
  }, [user?.uid, liveEvent?.id]);

  // Fetch player picture helper
  const fetchPlayerPicture = async (leagueId: string): Promise<string> => {
    try {
      const fileList = await listAll(ref(getStorage(), `players/`));
      const match = fileList.items.find((item) => item.name.startsWith(`${leagueId}_`));
      return match ? await getDownloadURL(match) : "/placeholder.svg";
    } catch { return "/placeholder.svg"; }
  };

  // Fetch saved picks
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
          ids.map((id: string) => getDoc(doc(db, `events/${liveEvent.id}/players`, id.toString())))
        );
        const picks: Player[] = await Promise.all(
          docs.filter((d) => d.exists()).map(async (d) => {
            const pd = { ...d.data(), player_id: d.id } as any;
            return {
              ...pd,
              picture: pd.img_url?.trim() ? pd.img_url : await fetchPlayerPicture(pd.league_id),
            };
          })
        );

        const captainIdValue = data.pickems?.[`${liveEvent.id}_captain`] || null;
        setCaptainId(captainIdValue);
        setPlayerSlots(Array.from({ length: 10 }, (_, i) => ({ id: i + 1, player: picks[i] || null })));
        setRemainingBudget(TOTAL_BUDGET - picks.reduce((s, p) => s + Math.round(p.Cost), 0));

        // Calculate live points with captain 1.5x multiplier (overrides stale Firebase flat field)
        const livePoints = picks.reduce((sum, p) => {
          const kills = (p as any)["Confirmed Kills"] || 0;
          return sum + (p.player_id === captainIdValue ? kills * 1.5 : kills);
        }, 0);
        if (livePoints > 0) {
          setEventPoints(livePoints);
          setSeasonPoints(livePoints);
        }
      } catch (e) { console.error(e); }
    };
    fetchPicks();
  }, [user, liveEvent?.id]);

  // ── SLOT CARD (read-only, no remove/captain buttons) ────────────────────────
  const SlotCard = memo(({ player, isCaptain }: { player: Player; isCaptain: boolean }) => (
    <div className={`relative rounded-lg overflow-hidden h-full w-full ${isCaptain ? "ring-2 ring-yellow-400" : "ring-1 ring-black/10 dark:ring-white/10"}`}>
      <div className="absolute inset-0 bg-cover bg-top bg-[#1a1a1a]"
        style={{ backgroundImage: `url(${player.picture || "/placeholder.svg"})` }} />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 to-transparent" />
      <div className="absolute bottom-0 inset-x-0 p-1">
        <div className="text-white font-bold text-[8px] truncate">{player.Player}</div>
        <div className="text-white/40 text-[7px] truncate">{player.Team}</div>
        <div className="text-white/60 text-[8px] font-bold">{formatCost(player.Cost)}</div>
      </div>
      {isCaptain && (
        <div className="absolute top-1 left-1 bg-yellow-400 text-black text-[6px] font-black px-1 py-0.5 rounded uppercase tracking-widest">
          ★ CPT
        </div>
      )}
    </div>
  ));

  // ── EMPTY SLOT ───────────────────────────────────────────────────────────────
  const EmptySlot = () => (
    <Link href="/dashboard/pick-em">
      <div className="flex flex-col gap-1 justify-center items-center rounded-lg border border-dashed border-black/15 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.02] hover:border-black/30 dark:hover:border-white/30 transition-all w-full h-full min-h-[80px] cursor-pointer">
        <span className="text-black/20 dark:text-white/20 text-base">+</span>
        <span className="text-[7px] uppercase text-black/20 dark:text-white/20 font-bold tracking-widest text-center px-1 leading-tight">Add Player</span>
      </div>
    </Link>
  );

  const picks = playerSlots.map((s) => s.player).filter(Boolean) as Player[];

  return (
    <section className="relative flex md:flex-row flex-col-reverse font-azonix w-screen md:w-[calc(100vw-60px)] md:h-screen h-full overflow-hidden top-0 bg-white dark:bg-stone-950">

      {/* Left Column — Team Grid */}
      <div className="flex flex-col w-full md:w-1/2 pb-[75px] md:pb-[35px] pt-5 border-r border-white/30 dark:border-white/30 border-gray-300 md:h-full overflow-hidden md:overflow-y-auto">
        <div className="flex-1 pb-6 p-3 md:p-6 justify-center">
          <div className="flex flex-col rounded-2xl h-full bg-gray-100 dark:bg-[#1a1a1a]">

            {/* MOBILE event banner */}
            {liveEvent && (
              <div className="md:hidden rounded-t-2xl px-3 py-2.5" style={{ backgroundColor: liveEvent.brandColor }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white/70 text-[10px] uppercase tracking-widest font-bold">Event {liveEvent.eventNumber}</div>
                    <div className="text-white font-black text-lg uppercase leading-tight">NXL {liveEvent.name}</div>
                    {liveEvent.startDate && <div className="text-white/70 text-[11px] font-bold">{liveEvent.startDate} — {liveEvent.endDate}</div>}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-white/70 text-[11px] font-bold uppercase tracking-widest">Team Lock:</span>
                      <span className="text-white font-black text-[11px]">
                        {pad(liveEvent._days)}d : {pad(liveEvent._hours)}h : {pad(liveEvent._minutes)}m : {pad(liveEvent._seconds)}s
                      </span>
                    </div>
                  </div>
                  <Link href="/dashboard/pick-em"
                    className="text-white text-[10px] font-black uppercase tracking-widest py-2 px-4 rounded border border-white/30 hover:bg-white/20 transition-colors flex-shrink-0 ml-3">
                    Edit Picks →
                  </Link>
                </div>
              </div>
            )}

            {/* DESKTOP event banner */}
            {liveEvent && (
              <div className="hidden md:flex items-center justify-between px-4 py-3 rounded-t-2xl gap-4" style={{ backgroundColor: liveEvent.brandColor }}>
                <div>
                  <div className="text-white/70 text-[10px] uppercase tracking-widest font-bold">Event {liveEvent.eventNumber}</div>
                  <div className="text-white font-black text-xl uppercase leading-tight">NXL {liveEvent.name}</div>
                  {liveEvent.startDate && <div className="text-white/70 text-[11px] font-bold mt-0.5">{liveEvent.startDate} — {liveEvent.endDate}</div>}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-white/70 text-[11px] font-bold uppercase tracking-widest">Lock in:</span>
                    <span className="text-white font-black text-[11px]">
                      {pad(liveEvent._days)}d : {pad(liveEvent._hours)}h : {pad(liveEvent._minutes)}m : {pad(liveEvent._seconds)}s
                    </span>
                  </div>
                </div>
                <Link href="/dashboard/pick-em"
                  className="text-white text-[10px] font-black uppercase tracking-widest py-2 px-4 rounded border border-white/30 hover:bg-white/20 transition-colors flex-shrink-0">
                  Edit Picks →
                </Link>
              </div>
            )}

            {/* Grid content */}
            <div className="flex-1 py-4 px-2">

              {/* Team summary card */}
              <div className="grid grid-cols-3 gap-1.5 mb-1.5" style={{ gridTemplateRows: "minmax(130px, 1fr)" }}>

                {/* My Team card — 2 cols */}
                <div className="col-span-2 bg-black rounded-lg p-2 flex flex-col justify-between">
                  <div className="flex items-start gap-2">
                    {/* Avatar + badges */}
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <div className="w-11 h-11 rounded-full bg-white/10 border-2 border-white/20 overflow-hidden flex items-center justify-center">
                        {avatarUrl
                          ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                          : <span className="text-white/50 font-black text-lg">{displayName?.[0]?.toUpperCase() || "?"}</span>}
                      </div>
                      <div className="flex gap-0.5">
                        {[0, 1, 2].map((i) => <div key={i} className="w-3.5 h-3.5 rounded-full bg-white/10 border border-white/15" />)}
                      </div>
                    </div>
                    {/* Stats */}
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
                            <div className="text-white font-black text-lg leading-tight">{val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Cost bar */}
                  <div>
                    <div className="flex items-baseline justify-between mb-0.5">
                      <div className="text-white/40 text-[8px] uppercase tracking-widest font-bold">Cost Cap</div>
                      <div className="text-white font-black text-sm leading-none">{formatCost(remainingBudget)}</div>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${budgetPct > 85 ? "bg-red-500" : "bg-green-400"}`}
                        style={{ width: `${100 - budgetPct}%` }} />
                    </div>
                  </div>
                </div>

                {/* Captain slot — 1 col */}
                <div>
                  {(() => {
                    const cap = captainId ? picks.find((p) => p.player_id === captainId) : null;
                    return cap
                      ? <SlotCard player={cap} isCaptain={true} />
                      : <Link href="/dashboard/pick-em">
                          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-yellow-400/40 bg-yellow-400/5 h-full gap-1 min-h-[120px] cursor-pointer hover:border-yellow-400/60 transition-colors">
                            <span className="bg-yellow-400 text-black text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest">CPT</span>
                            <span className="text-yellow-500/60 text-[7px] uppercase font-bold tracking-widest text-center px-1 leading-tight">Set a captain</span>
                          </div>
                        </Link>;
                  })()}
                </div>
              </div>

              {/* Player slots grid — 3 cols, 3 rows */}
              <div className="grid grid-cols-3 gap-1.5" style={{ gridTemplateRows: "minmax(110px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr)" }}>
                {playerSlots
                  .filter((slot) => !slot.player || slot.player.player_id !== captainId)
                  .slice(0, 9)
                  .map((slot) => (
                    <div key={slot.id} className="h-full">
                      {slot.player
                        ? <SlotCard player={slot.player} isCaptain={false} />
                        : <EmptySlot />}
                    </div>
                  ))}
              </div>

            </div>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="flex-1 md:px-6 px-3">
          <DivisionInfo />
        </div>
      </div>

      {/* Right Column — Profile (unchanged) */}
      <div className="relative md:h-full md:h-[calc(100vh-48px)] md:w-1/2 overflow-hidden">
        <div
          className="absolute inset-0 bg-opacity-40"
          style={{
            backgroundImage: "url('/pick-em.webp')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        />
        <div className="relative bg-black/40 h-full w-full md:p-10 py-6 overflow-auto flex items-center m-auto justify-center">
          <UserProfile />
        </div>
      </div>

    </section>
  );
}
