import { ImageResponse } from "next/og";
import { db } from "@/src/lib/firebaseClient";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { getDownloadURL, getStorage, ref } from "firebase/storage";
import {
  sortUserBadges,
  BADGE_DEFINITIONS,
  type UserBadges,
} from "@/src/lib/badges";
import { getBannerPhase } from "@/src/lib/bannerPhase";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1080;
const HEIGHT = 1920;
const TOTAL_BUDGET = 1_000_000;

// Brand
const BRAND_GREEN = "#00f976";
const CAPTAIN = "#facc15";
const SHARE_URL = "https://pickempaintball.com/";

type AnyRec = Record<string, unknown>;

interface Pick {
  id: string;
  name: string;
  team: string;
  cost: number;
  kills: number;
  picture: string;
  status: string;
  isCaptain: boolean;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(v);

const num = (v: unknown): string => {
  const n = Number(v);
  if (!isFinite(n)) return "-";
  return Number.isInteger(n)
    ? String(n)
    : n.toFixed(2).replace(/\.?0+$/, "");
};

const initials = (name: string) =>
  (name.trim().slice(0, 2) || "??").toUpperCase();

async function fontBuf(file: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public/fonts", file));
  } catch {
    return null;
  }
}

// Real brand fonts: Industry (text/display) + Hitmarker Condensed (numbers).
async function loadFonts() {
  const [demi, ultra, hitReg, hitBold] = await Promise.all([
    fontBuf("Industry-Demi.ttf"),
    fontBuf("Industry-Ultra.ttf"),
    fontBuf("HitmarkerCondensed-Regular.ttf"),
    fontBuf("HitmarkerCondensed-Bold.ttf"),
  ]);
  const fonts: { name: string; data: Buffer; weight: 400 | 700 | 800; style: "normal" }[] =
    [];
  // Industry Demi covers regular + bold (single master); Ultra is the heavy display weight.
  if (demi) {
    fonts.push({ name: "Industry", data: demi, weight: 400, style: "normal" });
    fonts.push({ name: "Industry", data: demi, weight: 700, style: "normal" });
  }
  if (ultra)
    fonts.push({ name: "Industry", data: ultra, weight: 800, style: "normal" });
  if (hitReg)
    fonts.push({ name: "Hitmarker", data: hitReg, weight: 400, style: "normal" });
  if (hitBold)
    fonts.push({ name: "Hitmarker", data: hitBold, weight: 700, style: "normal" });
  return fonts;
}

async function dataUri(file: string, mime: string): Promise<string | null> {
  try {
    const buf = await readFile(path.join(process.cwd(), "public", file));
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// Satori can't decode webp and unreliably honours background-size: cover
// (it tiles instead). So transcode to PNG and, for tiles, pre-crop to the
// card aspect with sharp so the image already fills the tile exactly.
async function toPng(
  url: string,
  cover?: { w: number; h: number },
): Promise<string> {
  if (!url) return "";
  try {
    const res = await fetch(url);
    if (!res.ok) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    const pipeline = cover
      ? sharp(buf).resize(cover.w, cover.h, { fit: "cover", position: "top" })
      : sharp(buf).resize(640, null, { withoutEnlargement: true });
    const png = await pipeline.png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return "";
  }
}

// Local badge art is .webp (Satori can't render webp) — transcode to PNG.
async function badgePng(imageSrc: string): Promise<string> {
  try {
    const buf = await readFile(path.join(process.cwd(), "public", imageSrc));
    const png = await sharp(buf).resize(120, 120, { fit: "inside" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return "";
  }
}

async function resolveAvatar(userData: AnyRec): Promise<string> {
  const pp = userData.profilePicture;
  if (typeof pp === "string" && pp) {
    if (pp.startsWith("http")) return toPng(pp);
    try {
      const url = await getDownloadURL(ref(getStorage(), pp));
      return await toPng(url);
    } catch {
      /* fall through */
    }
  }
  const ph = userData.photoURL;
  if (typeof ph === "string" && ph.startsWith("http")) return toPng(ph);
  return "";
}

async function resolveEvent(eventIdParam: string | null) {
  if (eventIdParam) {
    const snap = await getDoc(doc(db, "events", eventIdParam));
    if (snap.exists()) return { id: snap.id, ...(snap.data() as AnyRec) };
  }
  const all = await getDocs(collection(db, "events"));
  const raw = all.docs.map((d) => ({ id: d.id, ...(d.data() as AnyRec) }));
  const live = raw.find((e) => (e as { status?: string }).status === "live");
  if (live) return live;
  const upcoming = raw
    .filter((e) => {
      const lock = (e as { lockDate?: { toDate?: () => Date } }).lockDate;
      return lock?.toDate && lock.toDate() > new Date();
    })
    .sort((a, b) => {
      const la = (a as { lockDate?: { toMillis?: () => number } }).lockDate;
      const lb = (b as { lockDate?: { toMillis?: () => number } }).lockDate;
      return (la?.toMillis?.() ?? 0) - (lb?.toMillis?.() ?? 0);
    });
  return upcoming[0] ?? raw[0] ?? null;
}

// Status tick (top-right of a tile) — mirrors STATUS_META tones.
const STATUS_TICK: Record<string, { bg: string; icon: string }> = {
  Confirmed: { bg: BRAND_GREEN, icon: "check" },
  Addition: { bg: BRAND_GREEN, icon: "+" },
  Out: { bg: "#ef4444", icon: "x" },
  Dropped: { bg: "#ef4444", icon: "x" },
  Injured: { bg: "#f59e0b", icon: "!" },
  Questionable: { bg: "#f59e0b", icon: "?" },
  Unconfirmed: { bg: "#9ca3af", icon: "?" },
};

function StatusTick({ status }: { status: string }) {
  const m = STATUS_TICK[status];
  if (!m) return null;
  const dark = m.bg === BRAND_GREEN || m.bg === "#f59e0b";
  const stroke = dark ? "#000" : "#fff";
  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: m.bg,
        color: stroke,
        fontSize: 22,
        fontWeight: 800,
      }}
    >
      {m.icon === "check" ? (
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path
            d="M5 13l4 4L19 7"
            fill="none"
            stroke={stroke}
            strokeWidth="3.5"
          />
        </svg>
      ) : m.icon === "x" ? (
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path
            d="M6 6l12 12M18 6L6 18"
            fill="none"
            stroke={stroke}
            strokeWidth="3.5"
          />
        </svg>
      ) : (
        m.icon
      )}
    </div>
  );
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const uidParam = sp.get("uid");
  const email = sp.get("email");
  const eventIdParam = sp.get("eventId");

  const [logoUri, placeholderUri, fonts] = await Promise.all([
    dataUri("logo-dark.svg", "image/svg+xml"),
    dataUri("placeholder.svg", "image/svg+xml"),
    loadFonts(),
  ]);

  const event = await resolveEvent(eventIdParam);
  const eventId = (event?.id as string) || "";
  const eventName = ((event?.name as string) || "EVENT").toUpperCase();
  const eventVenue =
    (typeof event?.eventLocation === "string" && (event.eventLocation as string)) ||
    (typeof event?.venue === "string" && (event.venue as string)) ||
    "";
  const eventDate =
    (typeof event?.eventDate === "string" && (event.eventDate as string)) || "";
  const eventMeta = [eventVenue, eventDate].filter(Boolean).join("  ·  ");
  const rawEventLogo =
    (typeof event?.event_logo === "string" && (event.event_logo as string)) ||
    (typeof event?.logoUrl === "string" && (event.logoUrl as string)) ||
    "";
  const brandColor =
    (typeof event?.brand_color === "string" && (event.brand_color as string)) ||
    BRAND_GREEN;

  // Resolve user by uid (share links) or email (dev convenience).
  let userData: AnyRec = {};
  let uid = "";
  if (uidParam) {
    const ds = await getDoc(doc(db, "users", uidParam));
    if (ds.exists()) {
      userData = ds.data() as AnyRec;
      uid = ds.id;
    }
  } else {
    const snap = await getDocs(
      query(
        collection(db, "users"),
        where("email", "==", email || "greenjoc3397@gmail.com"),
      ),
    );
    const d = snap.docs[0];
    if (d) {
      userData = d.data() as AnyRec;
      uid = d.id;
    }
  }

  const displayName = String(
    userData.username ||
      (userData.firstName && userData.lastName
        ? `${userData.firstName} ${userData.lastName}`
        : "") ||
      userData.name ||
      userData.displayName ||
      (email ? email.split("@")[0] : "") ||
      "PLAYER",
  ).toUpperCase();

  const pickems = (userData.pickems as AnyRec) || {};
  const ids: string[] = Array.isArray(pickems[eventId])
    ? (pickems[eventId] as string[])
    : [];
  const captainId = (pickems[`${eventId}_captain`] as string) || null;

  const playerDocs = await Promise.all(
    ids.map((id) => getDoc(doc(db, `events/${eventId}/players`, String(id)))),
  );
  const picks: Pick[] = playerDocs
    .filter((d) => d.exists())
    .map((d) => {
      const pd = d.data() as AnyRec;
      const img = typeof pd.img_url === "string" ? pd.img_url.trim() : "";
      return {
        id: d.id,
        name: String(pd.Player ?? "Unknown"),
        team: String(pd.Team ?? ""),
        cost: Number(pd.Cost ?? 0),
        kills: Number(pd["Confirmed Kills"] ?? 0),
        picture: img,
        status: typeof pd.Status === "string" ? pd.Status : "",
        isCaptain: d.id === captainId,
      };
    });

  // Transcode photos (webp -> png) + avatar in parallel.
  const [avatarUri] = await Promise.all([
    resolveAvatar(userData),
    Promise.all(
      picks.map(async (p) => {
        p.picture = await toPng(p.picture);
      }),
    ),
  ]);
  const eventLogo = await toPng(rawEventLogo);

  // Badges are a subscriber-only feature (matches ProfileBadgesSection gating).
  const isSubscribed = userData.isSubscribed === true;
  // Top 3 earned badges (rarity-ordered) for the avatar row — subscribers only.
  const earnedBadges = isSubscribed
    ? sortUserBadges((userData.badges as UserBadges) || {})
    : [];
  const topBadges = (
    await Promise.all(
      earnedBadges.slice(0, 3).map(async (b) => ({
        count: b.count,
        showCount: BADGE_DEFINITIONS[b.id].showCount,
        img: await badgePng(BADGE_DEFINITIONS[b.id].imageSrc),
      })),
    )
  ).filter((b) => b.img);

  const remainingBudget =
    TOTAL_BUDGET - picks.reduce((s, p) => s + Math.round(p.cost), 0);
  const budgetPct = Math.min(
    100,
    ((TOTAL_BUDGET - remainingBudget) / TOTAL_BUDGET) * 100,
  );

  const eventRank = userData[`${eventId}Rank`] as number | undefined;
  let eventPts = userData[`${eventId}PTS`] as number | undefined;
  const livePts = picks.reduce(
    (s, p) => s + (p.isCaptain ? p.kills * 1.5 : p.kills),
    0,
  );
  if (eventPts == null && livePts > 0) eventPts = livePts;

  let seasonRank: number | undefined;
  let seasonPts: number | undefined;
  const seasonYear = eventId.match(/(\d{4})/)?.[1];
  if (seasonYear && uid) {
    const lb = await getDoc(doc(db, "leaderboards", `season_${seasonYear}`));
    if (lb.exists()) {
      const row = ((lb.data()?.users as AnyRec[]) || []).find(
        (u) => (u as { id?: string }).id === uid,
      ) as AnyRec | undefined;
      if (row) {
        seasonRank = row.seasonRank as number | undefined;
        seasonPts = row.seasonTotalPoints as number | undefined;
      }
    }
  }

  // Site phase drives the CTA wording and whether event stats exist yet.
  const toDate = (v: unknown): Date | null => {
    const ts = v as { toDate?: () => Date };
    if (ts && typeof ts.toDate === "function") return ts.toDate();
    return v instanceof Date ? v : null;
  };
  const phase = getBannerPhase(Date.now(), {
    lockDate: toDate(event?.lockDate),
    eventEndsAt: toDate(event?.eventEndsAt),
    nextPicksOpenAt: toDate(event?.nextPicksOpenAt),
  });
  const isPicks = phase === "picks_live";
  const ctaText =
    phase === "event_live"
      ? "Follow Live"
      : phase === "event_break"
        ? "See Player Stats"
        : "Make Your Picks";

  const captain = picks.find((p) => p.isCaptain) || null;
  const others = picks.filter((p) => !p.isCaptain);

  const qrUri = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&color=000000&bgcolor=00f976&data=${encodeURIComponent(
    SHARE_URL,
  )}`;

  // Fixed banner heights so the grid can be sized to fill the rest exactly.
  const HEADER_H = 264;
  const FOOTER_H = 150;
  const BODY_PAD = 40;
  const colW = (1000 - 2 * 16) / 3;
  const summaryH = 380;
  // Available body height for row1 + 3 grid rows (gaps: row1 mb 16 + 2 inter-row 16).
  const available = HEIGHT - HEADER_H - FOOTER_H - BODY_PAD * 2;
  const tileH = Math.floor((available - summaryH - 16 - 32) / 3);

  const label = (text: string) => (
    <div
      style={{
        display: "flex",
        fontSize: 17,
        letterSpacing: 2,
        fontWeight: 700,
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.35)",
      }}
    >
      {text}
    </div>
  );

  const Tile = (p: Pick, w: number, h: number) => (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: w,
        height: h,
        borderRadius: 14,
        overflow: "hidden",
        backgroundColor: "#1a1a1a",
        border: p.isCaptain
          ? `4px solid ${CAPTAIN}`
          : "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <img
        src={p.picture || placeholderUri || ""}
        width={w}
        height={h}
        style={{
          width: w,
          height: h,
          objectFit: "cover",
          objectPosition: "top",
        }}
      />
      {p.status ? <StatusTick status={p.status} /> : null}
      {p.isCaptain ? (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            backgroundColor: CAPTAIN,
            color: "#000",
            borderRadius: 6,
            padding: "5px 9px",
            lineHeight: 1.1,
          }}
        >
          <div style={{ display: "flex", fontSize: 16, fontWeight: 800 }}>
            CPT
          </div>
          <div style={{ display: "flex", fontSize: 11, fontWeight: 700 }}>
            1.5x PTS
          </div>
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: w,
          display: "flex",
          flexDirection: "column",
          padding: "70px 16px 16px",
          backgroundImage:
            "linear-gradient(to top, rgba(0,0,0,0.95) 35%, rgba(0,0,0,0) 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            color: "#fff",
            fontWeight: 700,
            fontSize: 25,
          }}
        >
          {p.name}
        </div>
        <div
          style={{
            display: "flex",
            color: "rgba(255,255,255,0.45)",
            fontSize: 18,
          }}
        >
          {p.team}
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Hitmarker",
            color: "rgba(255,255,255,0.65)",
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          {fmt(p.cost)}
        </div>
      </div>
    </div>
  );

  const stats = [
    {
      l: "EVENT RANK",
      v: isPicks ? "-" : eventRank ? `#${eventRank}` : "#-",
      c: BRAND_GREEN,
    },
    { l: "SEASON RANK", v: seasonRank ? `#${seasonRank}` : "#-", c: "#fff" },
    {
      l: "EVENT PTS",
      v: isPicks ? "-" : eventPts != null ? num(eventPts) : "-",
      c: "#fff",
    },
    { l: "SEASON PTS", v: seasonPts != null ? num(seasonPts) : "-", c: "#fff" },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#000",
          fontFamily: "Industry",
        }}
      >
        {/* HEADER BANNER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: HEADER_H,
            padding: "0 48px",
            backgroundColor: "#0c0c0c",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {logoUri ? (
            <img src={logoUri} height={132} />
          ) : (
            <div style={{ display: "flex", color: "#fff", fontSize: 48 }}>
              PICKEM PAINTBALL
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center" }}>
            {eventLogo ? (
              <img src={eventLogo} height={196} />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                }}
              >
                <div
                  style={{ display: "flex", color: "#fff", fontSize: 44, fontWeight: 700 }}
                >
                  {eventName}
                </div>
                {eventMeta ? (
                  <div
                    style={{
                      display: "flex",
                      color: "rgba(255,255,255,0.45)",
                      fontSize: 22,
                      letterSpacing: 1,
                      marginTop: 6,
                    }}
                  >
                    {eventMeta.toUpperCase()}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* TEAM CARD BODY */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: 40,
            backgroundColor: "#1a1a1a",
          }}
        >
          {/* Row 1: summary (2 cols) + captain (1 col) */}
          <div style={{ display: "flex", marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                width: colW * 2 + 16,
                height: summaryH,
                backgroundColor: "#000",
                borderRadius: 14,
                padding: "30px 26px",
                marginRight: 16,
              }}
            >
              <div style={{ display: "flex" }}>
                {/* avatar + badges */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    marginRight: 22,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 124,
                      height: 124,
                      borderRadius: 62,
                      overflow: "hidden",
                      border: "3px solid rgba(255,255,255,0.2)",
                      backgroundColor: "#1f6f8b",
                    }}
                  >
                    {avatarUri ? (
                      <img
                        src={avatarUri}
                        width={124}
                        height={124}
                        style={{ objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          color: "#fff",
                          fontSize: 34,
                          fontWeight: 800,
                        }}
                      >
                        {initials(displayName)}
                      </div>
                    )}
                  </div>
                  {topBadges.length > 0 ? (
                    <div style={{ display: "flex", marginTop: 12 }}>
                      {topBadges.map((b, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            position: "relative",
                            marginRight: i < topBadges.length - 1 ? 8 : 0,
                          }}
                        >
                          <img
                            src={b.img}
                            width={46}
                            height={46}
                            style={{ width: 46, height: 46 }}
                          />
                          {b.showCount && b.count > 1 ? (
                            <div
                              style={{
                                position: "absolute",
                                bottom: -3,
                                right: -5,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: 22,
                                height: 22,
                                padding: "0 5px",
                                borderRadius: 11,
                                backgroundColor: BRAND_GREEN,
                                color: "#000",
                                fontFamily: "Hitmarker",
                                fontSize: 14,
                                fontWeight: 700,
                                border: "2px solid #000",
                              }}
                            >
                              {b.count}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                {/* name + stats */}
                <div
                  style={{ display: "flex", flexDirection: "column", flex: 1 }}
                >
                  {label("PLAYER")}
                  <div
                    style={{
                      display: "flex",
                      color: "#fff",
                      fontSize: 46,
                      fontWeight: 800,
                      marginBottom: 14,
                    }}
                  >
                    {displayName}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap" }}>
                    {stats.map((s) => (
                      <div
                        key={s.l}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          width: "50%",
                          marginBottom: 12,
                        }}
                      >
                        {label(s.l)}
                        <div
                          style={{
                            display: "flex",
                            fontFamily: "Hitmarker",
                            color: s.c,
                            fontSize: 44,
                            fontWeight: 700,
                          }}
                        >
                          {s.v}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* cost cap */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginTop: 30,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                    marginBottom: 8,
                  }}
                >
                  {label("COST CAP")}
                  <div
                    style={{
                      display: "flex",
                      fontFamily: "Hitmarker",
                      color: "#fff",
                      fontSize: 28,
                      fontWeight: 700,
                    }}
                  >
                    {fmt(remainingBudget)}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    height: 10,
                    backgroundColor: "rgba(255,255,255,0.1)",
                    borderRadius: 5,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: `${100 - budgetPct}%`,
                      height: 10,
                      backgroundColor: budgetPct > 85 ? "#ef4444" : BRAND_GREEN,
                      borderRadius: 5,
                    }}
                  />
                </div>
              </div>
            </div>
            {/* captain */}
            <div style={{ display: "flex", width: colW, height: summaryH }}>
              {captain ? (
                Tile(captain, colW, summaryH)
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: summaryH,
                    borderRadius: 14,
                    border: `2px dashed ${CAPTAIN}80`,
                    backgroundColor: "rgba(250,204,21,0.05)",
                    color: CAPTAIN,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      backgroundColor: CAPTAIN,
                      color: "#000",
                      fontSize: 14,
                      fontWeight: 800,
                      padding: "3px 8px",
                      borderRadius: 5,
                      marginBottom: 8,
                    }}
                  >
                    CPT
                  </div>
                  <div style={{ display: "flex", fontSize: 18, fontWeight: 700 }}>
                    Set a captain
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Remaining picks: 3 per row */}
          <div style={{ display: "flex", flexWrap: "wrap" }}>
            {others.slice(0, 9).map((p, i) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  width: colW,
                  height: tileH,
                  marginRight: i % 3 === 2 ? 0 : 16,
                  marginBottom: i < 6 ? 16 : 0,
                }}
              >
                {Tile(p, colW, tileH)}
              </div>
            ))}
          </div>
        </div>

        {/* FOOTER CTA */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: FOOTER_H,
            padding: "0 48px",
            backgroundColor: BRAND_GREEN,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", color: "#000", fontSize: 42, fontWeight: 800 }}>
              {ctaText}
            </div>
            <div
              style={{
                display: "flex",
                color: "rgba(0,0,0,0.7)",
                fontSize: 24,
                marginTop: 4,
              }}
            >
              pickempaintball.com · @pickempaintball
            </div>
          </div>
          <img src={qrUri} width={120} height={120} style={{ borderRadius: 10 }} />
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT, fonts },
  );
}
