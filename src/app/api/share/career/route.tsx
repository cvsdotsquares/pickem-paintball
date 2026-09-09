/**
 * The shareable career graphic — 1080x1920 PNG, rendered on demand.
 *
 *   /api/share/career?player=100016
 *   /api/share/career?player=100016&scope=season&year=2026
 *   /api/share/career?player=100016&scope=event&key=2015%7CGreat%20Lakes%20Open
 *
 * WHAT IS ACTUALLY SHARED IS THIS IMAGE. The fantasy card set the pattern: the share
 * sheet is handed a PNG and no URL, because a link makes WhatsApp and Discord unfurl a
 * second copy of the card underneath it. So the image has to stand on its own — every
 * caveat, the branding and the call to action are baked in, because nothing travels
 * alongside it.
 *
 * ⚠️ THE LEAGUE RECORD IS THE TEAM'S, and the card says so under the block rather than
 * leaving it implied. On the site that caveat is a section away; here there is no site.
 *
 * Layout is a single column of bands so Satori never has to make a decision: a header, an
 * identity block, the headline figure beside the photo, then one band per stat family,
 * then the CTA. Heights are fixed and add to 1920 — nothing is allowed to reflow, because
 * a card that overflows silently loses its footer.
 */

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { db } from "@/src/lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";
import {
  buildShareCard,
  num,
  type ShareCard,
  type ShareScope,
  type ShareStat,
} from "@/src/lib/careerShareCard";
import { dataUriCached, loadFontsCached, toPngCached } from "@/src/lib/shareRender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const W = 1080;
const H = 1920;
const PAD = 56;
const INNER = W - PAD * 2;

const GREEN = "#00f976";
const INK = "#000";
const PANEL = "#0d0d0d";
const HAIR = "rgba(255,255,255,0.10)";
const MUTE = "rgba(255,255,255,0.42)";

/**
 * Fixed heights for the parts that must not move, and MINIMUMS for the stat bands.
 *
 * The bands grow to share whatever is left, because the number of them varies: a career
 * card carries three, a single-season card one. Fixed heights would leave a player with
 * no PickEm history staring at 400px of black above the footer, which reads as a broken
 * card rather than a sparse one.
 */
const HEADER_H = 118;
const NAME_H = 232;
const HERO_H = 380;
const BLOCK_MIN = 300;
const STRIP_MIN = 340;
const FOOTER_H = 122;
const PHOTO_W = 324;
const PHOTO_H = 344;

/**
 * The column has to ADD UP to 1920, and nothing here reflows.
 *
 * Satori lays this out once with no scrolling and no overflow handling: content past the
 * bottom edge is simply not drawn, and the first casualty is the footer — the one band
 * carrying the branding and the call to action, on an image whose whole job is to travel
 * without the site. A seven-match event card overflowed by ~190px and lost it silently.
 *
 * So the row count is BUDGETED rather than assumed. A card with a list compresses the name
 * and hero bands, and the list takes whatever is left after the stat bands have had their
 * natural height. Getting this wrong fails invisibly, which is why `assertFits` below
 * checks the arithmetic on every render rather than trusting these constants to stay true.
 */
/*
 * Measured, not estimated. The first set of these was guessed and every one was low, so
 * the budget said seven rows would fit when five did and the card overflowed anyway.
 *   band  = 24 top pad + ~70 title/caption + 26 gap + 150 tiles + 24 bottom pad = 294
 *   pickem adds the type bar: 22 gap + 22 bar + 12 gap + ~24 labels             = +80
 *   list  = 28 top pad + ~70 title/caption + 18 gap + 28 bottom pad             = 144
 */
const ROW_H = 50;
const LIST_TITLE_H = 146;
/**
 * NATURAL band heights — what a band occupies with its own content and padding.
 *
 * Bands used to carry `minHeight: 300` and centre themselves inside it, so each one padded
 * itself by a different amount and no two gaps on the card matched. They now sit at their
 * content height, which makes the gaps equal by construction and lets the space left for a
 * list be worked out instead of guessed.
 */
const BAND_PAD = 24;
/*
 * MEASURED OFF RENDERS by finding the hairline separators, not derived from the CSS.
 * Every previous attempt to add these up from font sizes and margins came out low, and a
 * low estimate hands the list rows there is no room for — which the pinned footer then
 * hides by clipping them, so the fault is invisible to the footer check.
 */
const BAND_STATS = 380;
const BAND_STATS_TYPES = 490;
const BAND_STRIP = 334;
/** Below this a list band is not worth its own title, and is dropped instead of clipped. */
const LIST_MIN_ROWS = 3;
/*
 * MEASURED FROM RENDERS, not from adding up the CSS. Satori grows a band past an explicit
 * `height` when its content is taller, so these are what the bands actually occupy — a
 * stat band lands near 380 and the PickEm band near 480 once the type bar is in. Setting
 * them to the theoretical 300/400 is what made the budget confidently wrong.
 */
const LEAGUE_BAND_H = 380;
const PICKEM_BAND_H = 490;
/**
 * A list card gives up some portrait to buy rows; it has more to say than a career card.
 *
 * The photo shrinks WITH the band. Compacting the hero to 300 while leaving a 344px photo
 * inside it put the overflow back instantly — with no flex-shrink, an oversized child does
 * not squeeze, it shoves everything below it off the canvas.
 */
const COMPACT_NAME_H = 202;
const COMPACT_HERO_H = 288;
const COMPACT_PHOTO_W = 250;
const COMPACT_PHOTO_H = 264;

const row = (extra: Record<string, unknown> = {}) => ({
  display: "flex" as const,
  ...extra,
});

/** Section rule + title, the same on every band so the card reads as one system. */
function BandTitle({ title, caption, accent }: { title: string; caption: string; accent: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: INNER }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ display: "flex", width: 10, height: 10, backgroundColor: accent, marginRight: 16 }} />
        {/*
          These are the only thing dividing one kind of number from another, and at 26px
          they sat closer in weight to the captions under them than to the headings they
          are. Bigger and wider-tracked, they read as the card's structure.
        */}
        <div
          style={{
            display: "flex",
            color: "#fff",
            fontSize: 33,
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          {title}
        </div>
      </div>
      {caption ? (
        <div style={{ display: "flex", color: MUTE, fontSize: 22, marginTop: 9, letterSpacing: 0.6 }}>
          {caption}
        </div>
      ) : null}
    </div>
  );
}

/** Four figures across, the card's basic unit. Numbers in Hitmarker, labels in Industry. */
function StatRow({ stats }: { stats: ShareStat[] }) {
  const n = Math.max(stats.length, 1);
  const colW = Math.floor((INNER - (n - 1) * 16) / n);
  return (
    <div style={{ display: "flex", width: INNER, marginTop: 26 }}>
      {stats.map((s, i) => (
        <div
          key={s.label}
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            width: colW,
            height: 150,
            marginRight: i === n - 1 ? 0 : 16,
            padding: "0 20px 20px 20px",
            backgroundColor: PANEL,
            border: `1px solid ${HAIR}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <div
              style={{
                display: "flex",
                color: "#fff",
                fontSize: n >= 5 ? 43 : 54,
                fontFamily: "Hitmarker",
                fontWeight: 300,
                whiteSpace: "nowrap",
              }}
            >
              {s.value}
            </div>
            {s.sub ? (
              <div style={{ display: "flex", color: MUTE, fontSize: n >= 5 ? 17 : 21, marginLeft: n >= 5 ? 5 : 8, whiteSpace: "nowrap" }}>
                {s.sub}
              </div>
            ) : null}
          </div>
          {/*
            One line, always. These tiles bottom-align their contents, so a label that
            wraps pushes its own value up and breaks the row's baseline — one tile sitting
            proud of the other three reads as a rendering fault. Long labels step down a
            size instead.
          */}
          <div
            style={{
              display: "flex",
              color: MUTE,
              fontSize: n >= 5 ? (s.label.length > 13 ? 14 : 16) : s.label.length > 13 ? 16 : 19,
              marginTop: 8,
              letterSpacing: s.label.length > 13 ? 1.1 : 1.6,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Season by season — the one graphic that carries both stat families at once.
 *
 * Bar height is the league match win rate; a season PickEm also scored gets a bright cap
 * on top of the bar. A career that predates 2025 still draws a full strip and simply has
 * no caps, which is the honest picture rather than an empty panel.
 */
function SeasonStrip({ seasons, accent }: { seasons: ShareCard["seasons"]; accent: string }) {
  const n = seasons.length;
  const gap = n > 10 ? 8 : 12;
  /*
   * Bars are CAPPED, not just divided.
   *
   * Dividing the full width by the number of seasons is right for a twelve-year career and
   * absurd for a three-year one: three bars 330px wide read as a different chart entirely,
   * and a low win rate turns them into wide flat slabs. Cap the width and centre the row,
   * so a short career draws a short strip instead of a stretched one.
   */
  const barW = Math.min(76, Math.floor((INNER - (n - 1) * gap) / n));
  /* Shorter bars: the number now sits above each one and needs the room. */
  const MAX = 84;
  return (
    <div
      style={{
        display: "flex",
        width: INNER,
        marginTop: 26,
        alignItems: "flex-end",
        justifyContent: n * (barW + gap) < INNER ? "flex-start" : "space-between",
        height: 176,
      }}
    >
      {seasons.map((s, i) => {
        const h = s.winPct == null ? 4 : Math.max(6, Math.round((s.winPct / 100) * MAX));
        return (
          <div
            key={s.year}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              width: barW,
              marginRight: i === n - 1 ? 0 : gap,
            }}
          >
            {/* Title marker: a diamond, not an emoji — Satori has no colour emoji font. */}
            {s.titles > 0 ? (
              <div
                style={{
                  display: "flex",
                  width: 12,
                  height: 12,
                  backgroundColor: accent,
                  transform: "rotate(45deg)",
                  marginBottom: 10,
                }}
              />
            ) : null}
            {/*
              The number, because the chart could not be read without it. Bar height alone
              gives a shape but no value, and "roughly two thirds" is not what anyone wants
              to post — the point of the strip is which seasons were good.
            */}
            <div
              style={{
                display: "flex",
                color: s.winPct == null ? MUTE : "#fff",
                fontSize: n > 10 ? 17 : 19,
                fontFamily: "Hitmarker",
                marginBottom: 6,
              }}
            >
              {s.winPct == null ? "—" : `${Math.round(s.winPct)}%`}
            </div>
            <div
              style={{
                display: "flex",
                width: barW,
                height: h,
                /*
                 * ONE COLOUR. Two shades encoded the same fact the diamond above already
                 * marks, so the strip appeared to be saying something with colour that it
                 * was not, and the reader had to work out which.
                 */
                backgroundColor: accent,
              }}
            />
            <div style={{ display: "flex", color: MUTE, fontSize: 18, marginTop: 10, fontFamily: "Hitmarker" }}>
              {s.year.slice(2)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The same data as rows rather than columns, for one to three seasons.
 *
 * Three columns in a full-width band are three lonely sticks with a lot of air around
 * them — the chart reads as one that failed to load rather than a short career, which is
 * why it used to be suppressed below four seasons. As rows it fills the width honestly at
 * any count, so nobody loses their chart for having started recently.
 *
 * It does not scale the other way: twelve rows would be 530px, so columns take over at
 * four. Same encoding either way — length is match win %, the diamond marks a win.
 */
function SeasonRows({ seasons, accent }: { seasons: ShareCard["seasons"]; accent: string }) {
  const LABEL_W = 92;
  const VALUE_W = 84;
  const TRACK = INNER - LABEL_W - VALUE_W;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: INNER, marginTop: 22 }}>
      {seasons.map((s) => (
        <div key={s.year} style={{ display: "flex", alignItems: "center", height: 44 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              width: LABEL_W,
              color: "#fff",
              fontSize: 23,
              fontFamily: "Hitmarker",
            }}
          >
            {s.year}
          </div>
          {/*
            The marker sits at the END of the bar, not beside the year. Against the year it
            read as a property of the season label; against the bar's end it reads as what
            it is — the result that season reached.
          */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              width: TRACK,
              height: 22,
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                width: s.winPct == null ? 0 : Math.max(3, Math.round((s.winPct / 100) * TRACK)),
                height: 22,
                backgroundColor: accent,
              }}
            />
            {/*
              Inside the track and immediately after the fill, so it marks WHERE THE BAR
              ENDS. Sitting outside the track it landed at 100% on every row regardless of
              the season's rate, which made it look like a row-level tick rather than a
              result pinned to that bar's value.
            */}
            {s.titles > 0 ? (
              <div
                style={{
                  display: "flex",
                  width: 11,
                  height: 11,
                  backgroundColor: accent,
                  transform: "rotate(45deg)",
                  marginLeft: 9,
                }}
              />
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              width: VALUE_W,
              color: s.winPct == null ? MUTE : "#fff",
              fontSize: 22,
              fontFamily: "Hitmarker",
            }}
          >
            {s.winPct == null ? "—" : `${Math.round(s.winPct)}%`}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A single stacked bar of kill types — the shape of how a player scores. */
function TypeBar({ types, accent }: { types: { type: string; share: number }[]; accent: string }) {
  if (!types.length) return null;
  const total = types.reduce((s, t) => s + t.share, 0) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: INNER, marginTop: 22 }}>
      <div style={{ display: "flex", width: INNER, height: 22 }}>
        {types.map((t, i) => (
          <div
            key={t.type}
            style={{
              display: "flex",
              width: Math.max(2, Math.round((t.share / total) * INNER) - 3),
              height: 22,
              marginRight: i === types.length - 1 ? 0 : 3,
              backgroundColor: accent,
              opacity: 1 - i * 0.16,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", width: INNER, marginTop: 12, flexWrap: "wrap" }}>
        {types.map((t) => (
          <div key={t.type} style={{ display: "flex", alignItems: "center", marginRight: 24 }}>
            <div style={{ display: "flex", color: "#fff", fontSize: 19 }}>{t.type}</div>
            <div style={{ display: "flex", color: MUTE, fontSize: 19, marginLeft: 7, fontFamily: "Hitmarker" }}>
              {Math.round(t.share)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A row per tournament in a season, or per match at an event. Same rhythm for both. */
function ListRow({
  left,
  sub,
  mid,
  right,
  accent,
  win,
}: {
  left: string;
  sub?: string;
  mid?: string;
  right?: string;
  accent: string;
  win?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: INNER,
        height: ROW_H,
        borderBottom: `1px solid ${HAIR}`,
      }}
    >
      {win != null ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 38,
            height: 30,
            marginRight: 20,
            backgroundColor: win ? accent : "rgba(255,255,255,0.13)",
            color: win ? "#000" : "rgba(255,255,255,0.75)",
            fontSize: 19,
            fontWeight: 800,
          }}
        >
          {win ? "W" : "L"}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
        <div style={{ display: "flex", color: "#fff", fontSize: 25 }}>{left}</div>
        {sub ? (
          <div style={{ display: "flex", color: MUTE, fontSize: 17, marginTop: 3, letterSpacing: 1.2 }}>
            {sub}
          </div>
        ) : null}
      </div>
      {mid ? (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            width: 200,
            color: "#fff",
            fontSize: 25,
            fontFamily: "Hitmarker",
          }}
        >
          {mid}
        </div>
      ) : null}
      {right ? (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            width: 150,
            color: accent,
            fontSize: 25,
            fontFamily: "Hitmarker",
          }}
        >
          {right}
        </div>
      ) : null}
    </div>
  );
}

/** Columns above this many seasons, rows at or below it. */
const STRIP_COLUMNS_FROM = 4;

/** What the season band occupies, in whichever form it takes. */
function stripHeight(card: ShareCard): number {
  const n = card.seasons.length;
  if (n === 0) return 0;
  const legend = card.seasons.some((x) => x.titles > 0) ? 35 : 0;
  if (n >= STRIP_COLUMNS_FROM) return BAND_STRIP + legend - 35;
  return BAND_PAD * 2 + 82 + 22 + n * 44 + legend;
}

/** Stat bands and the strip — what the card has to say before any list is added. */
function bandCount(card: ShareCard): number {
  return (card.league ? 1 : 0) + (card.pickem ? 1 : 0) + (card.seasons.length >= 4 ? 1 : 0);
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const playerId = sp.get("player") || "";
  const kind = (sp.get("scope") || "career") as ShareScope["kind"];
  const scope: ShareScope =
    kind === "season"
      ? { kind: "season", year: sp.get("year") || "" }
      : kind === "event"
        ? { kind: "event", key: sp.get("key") || "" }
        : { kind: "career" };

  const [logoUri, fonts] = await Promise.all([
    dataUriCached("logo-dark.svg", "image/svg+xml"),
    loadFontsCached(),
  ]);

  const snap = playerId ? await getDoc(doc(db, "playerSummaries", playerId)) : null;
  const card = snap?.exists() ? buildShareCard(snap.data(), scope) : null;

  if (!card) {
    return new Response("Not found", { status: 404 });
  }

  /**
   * Always the brand green, never the event's own colour.
   *
   * `brand_color` is derived by averaging an event logo to one pixel, so the stored values
   * are desaturated greys — #929889, #b9a0a0. As a logo backdrop that is the point; as the
   * accent on a black card it is mud, and it would make an event card look like a
   * different product from the career card beside it in a feed.
   */
  const accent = GREEN;
  const hasListEarly = card.matches.length > 0 || card.events.length > 0;
  const photoW = hasListEarly ? COMPACT_PHOTO_W : PHOTO_W;
  const photoH = hasListEarly ? COMPACT_PHOTO_H : PHOTO_H;
  const photo = card.imgUrl ? await toPngCached(card.imgUrl, 520, { w: photoW, h: photoH }) : "";

  // Surname on its own line at display size; a mononym keeps the whole name there.
  const parts = card.name.trim().split(/\s+/);
  const surname = (parts.length > 1 ? parts.slice(1).join(" ") : parts[0]).toUpperCase();
  const forename = parts.length > 1 ? parts[0].toUpperCase() : "";

  /**
   * How much room a list would actually have.
   *
   * Worked out BEFORE the bands, because the answer decides whether there is a list at
   * all. Gating on band count instead — which is what this did — put a tournament list on
   * a card that already carried two full bands, and the footer then clipped it halfway
   * through a row. A band showing one and a half tournaments looks like a fault; no band
   * looks like a decision.
   *
   * The portrait is measured at its compact size because any card that ends up with a list
   * uses that size, so the sum is self-consistent either way.
   */
  const bandsNatural =
    (card.league ? BAND_STATS : 0) +
    (card.pickem ? (card.pickem.types.length ? BAND_STATS_TYPES : BAND_STATS) : 0) +
    stripHeight(card);
  const listSpace =
    H - HEADER_H - COMPACT_NAME_H - COMPACT_HERO_H - FOOTER_H - bandsNatural;
  /* 20px of slack: these constants are measured, and measurement has a last pixel. */
  const maxRows = Math.floor((listSpace - LIST_TITLE_H - 20) / ROW_H);
  const showEvents =
    card.events.length > 0 && card.matches.length === 0 && maxRows >= LIST_MIN_ROWS;

  /**
   * Which bands this card carries.
   *
   * A season or event card has fewer stat blocks than a career card, so it earns its
   * height back with a list of what actually happened — the tournaments that year, or the
   * matches at that event. The first draft instead let two bands stretch to fill 1920 and
   * the result read as a broken card rather than a sparse one.
   */
  const bands: ("league" | "pickem" | "strip" | "events" | "matches")[] = [
    ...(card.league ? (["league"] as const) : []),
    /*
     * FOUR SEASONS MINIMUM. Two or three bars occupy a full band to say what the tiles
     * above already say, and a strip that short reads as a chart that failed to load
     * rather than a short career.
     */
    ...(card.seasons.length >= 1 ? (["strip"] as const) : []),
    ...(card.pickem ? (["pickem"] as const) : []),
    /*
     * THE LIST GOES LAST, and that is a layout requirement rather than a taste.
     *
     * It is the only band whose height is not known in advance, so it is the only one that
     * can be given flexGrow and told to clip. Put it in the middle and its overflow does
     * not clip — with no flex-shrink it shoves every band after it downward, and the last
     * band is the footer. That is exactly how a seven-match card lost its CTA while the
     * list itself looked fine.
     *
     * Reading order survives the move: the stat bands summarise, the list is the detail.
     */
    /*
     * The tournament list appears only when the card would otherwise be short. A career
     * with a full strip and both stat bands has plenty to say; one with a single band and
     * no strip has 700px of black and needs this.
     */
    ...(showEvents ? (["events"] as const) : []),
    ...(card.matches.length ? (["matches"] as const) : []),
  ];
  const showKills = card.matches.some((m) => m.kills != null);

  const hasList = showEvents || card.matches.length > 0;
  /**
   * The portrait takes what is left, rather than a size chosen up front.
   *
   * A three-band career card wants ~2130px in a 1920px canvas, and with no flex-shrink the
   * excess does not squeeze — it slides the last band under the pinned footer, where it is
   * invisible to a check that only asks whether the footer is there. So the portrait is
   * sized from the actual remainder: full when there is room, compact when there is not.
   */
  const portraitRoom =
    H - HEADER_H - FOOTER_H - bandsNatural -
    (hasList ? LIST_TITLE_H + Math.min(card.matches.length || card.events.length, Math.max(maxRows, 0)) * ROW_H : 0);
  const roomy = !hasList && portraitRoom >= NAME_H + HERO_H;
  const nameH = roomy ? NAME_H : COMPACT_NAME_H;
  const heroH = roomy ? HERO_H : COMPACT_HERO_H;
  const rowsShown = Math.min(
    card.matches.length || card.events.length,
    Math.max(maxRows, 0),
  );

  /**
   * Shout if the column cannot fit, because the image will not.
   *
   * `maxRows` has a floor of 3, so a card crowded enough to need less than that overflows
   * anyway rather than rendering a list of one. That is the right trade — three rows is
   * the point below which the band stops being worth drawing — but it must not fail
   * silently, so the arithmetic is checked here on every render.
   */
  const projected =
    HEADER_H + nameH + heroH + FOOTER_H + bandsNatural +
    (hasList ? LIST_TITLE_H + rowsShown * ROW_H : 0);
  if (projected > H) {
    console.error(
      `⚠️  Career share card for ${card.playerId} (${card.scopeLabel}) projects ${projected}px ` +
        `against a ${H}px canvas — the footer will be cut off.`,
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          /*
           * The footer is PINNED, not flowed, so nothing can push it off.
           *
           * Every attempt to make the bands add up exactly held for six card shapes and
           * broke on the seventh, because Satori's box heights do not behave the way the
           * arithmetic says they should — `height` on a flex child does not reliably clip,
           * and with no flex-shrink the excess travels downward until it runs out of
           * canvas. The CTA is the one element whose loss makes the image pointless, so it
           * is taken out of the flow entirely and the column reserves its space instead.
           */
          paddingBottom: FOOTER_H,
          backgroundColor: INK,
          fontFamily: "Industry",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: HEADER_H,
            padding: `0 ${PAD}px`,
            borderBottom: `1px solid ${HAIR}`,
          }}
        >
          {logoUri ? (
            <img src={logoUri} height={54} />
          ) : (
            <div style={{ display: "flex", color: "#fff", fontSize: 30, fontWeight: 800 }}>
              PICKEM PAINTBALL
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div
              style={{
                display: "flex",
                color: accent,
                fontSize: 25,
                fontWeight: 700,
                letterSpacing: 3.4,
                textTransform: "uppercase",
              }}
            >
              {card.scopeLabel}
            </div>
            {card.scopeRange ? (
              <div style={{ display: "flex", color: MUTE, fontSize: 20, marginTop: 5, fontFamily: "Hitmarker" }}>
                {card.scopeRange}
              </div>
            ) : null}
          </div>
        </div>

        {/* NAME */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            height: NAME_H,
            padding: `0 ${PAD}px`,
          }}
        >
          {forename ? (
            <div
              style={{
                display: "flex",
                color: MUTE,
                fontSize: 42,
                fontWeight: 700,
                letterSpacing: 5,
              }}
            >
              {forename}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              color: "#fff",
              fontSize: surname.length > 11 ? 92 : 118,
              fontWeight: 800,
              lineHeight: 1,
              marginTop: 6,
            }}
          >
            {surname}
          </div>
          {card.team ? (
            <div
              style={{
                display: "flex",
                color: accent,
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: 3.4,
                marginTop: 16,
                textTransform: "uppercase",
              }}
            >
              {card.team}
            </div>
          ) : null}
        </div>

        {/* PHOTO + HEADLINE */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: HERO_H,
            padding: `0 ${PAD}px`,
          }}
        >
          <div
            style={{
              display: "flex",
              width: photoW,
              height: photoH,
              backgroundColor: photo ? PANEL : "rgba(0,249,118,0.06)",
              borderLeft: `3px solid ${accent}`,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {photo ? (
              <img src={photo} width={photoW} height={photoH} />
            ) : (
              /* 25% white on near-black was invisible; the box looked broken rather than empty. */
              <div style={{ display: "flex", color: "rgba(255,255,255,0.45)", fontSize: 104, fontWeight: 800 }}>
                {surname.slice(0, 2)}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              marginLeft: 44,
              flexGrow: 1,
            }}
          >
            {/*
              WHITE, NOT GREEN. The house style sets large stat numbers as white on black
              and reserves #00f976 for the brand mark and for signals that carry meaning —
              a win, a title, the CTA. The first draft had green doing all of it at once:
              headline, markers, bars, W chips and footer, which left nothing for the eye
              to rank. Size carries the hierarchy here — 188px against the tiles' 54px is
              already a wide gap — so the colour does not have to.
            */}
            <div
              style={{
                display: "flex",
                color: "#fff",
                fontSize: card.headline.value.length > 5 ? 116 : 188,
                fontFamily: "Hitmarker",
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {card.headline.value}
            </div>
            <div
              style={{
                display: "flex",
                color: "#fff",
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: 3,
                marginTop: 14,
                textTransform: "uppercase",
              }}
            >
              {card.headline.label}
            </div>
            {card.headline.sub ? (
              <div style={{ display: "flex", color: MUTE, fontSize: 23, marginTop: 10 }}>
                {card.headline.sub}
              </div>
            ) : null}
          </div>
        </div>

        {/* STAT BANDS */}
        {bands.map((b) => {
          if (b === "events" || b === "matches") {
            const rows =
              b === "events"
                ? card.events.slice(0, rowsShown).map((e) => ({
                    left: e.label,
                    sub: undefined,
                    mid: e.record,
                    right: e.kills != null ? `${num(e.kills)} k` : undefined,
                    win: undefined as boolean | undefined,
                    finish: e.finish,
                  }))
                : card.matches.slice(0, rowsShown).map((m) => ({
                    left: m.opponent,
                    sub: m.round.toUpperCase(),
                    mid: `${m.f}–${m.a}`,
                    right: showKills && m.kills != null ? `${num(m.kills)} k` : undefined,
                    win: m.win,
                    finish: undefined as string | undefined,
                  }));
            return (
              <div
                key={b}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  /*
                   * The list absorbs whatever the fixed bands leave over.
                   *
                   * Explicit heights everywhere made the column sum to LESS than 1920 and
                   * the footer floated above the bottom edge with black beneath it. Giving
                   * the one variable-length band flexGrow closes the gap from either side:
                   * it fills the slack when rows are few, and `overflow: hidden` clips
                   * rather than shoves when the budget is a row optimistic.
                   */
                  flexGrow: 0,
                  overflow: "hidden",
                  padding: `${BAND_PAD}px ${PAD}px`,
                  borderTop: `1px solid ${HAIR}`,
                }}
              >
                <BandTitle
                  title={b === "events" ? "Tournaments" : "Every match"}
                  caption={
                    b === "events"
                      ? "Finish and the team's record"
                      : showKills
                        ? "Score, and this player's kills"
                        : "The team's score in each match"
                  }
                  accent={accent}
                />
                <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
                  {rows.map((r, i) => (
                    <ListRow
                      key={`${r.left}-${i}`}
                      left={r.left}
                      sub={r.sub ?? r.finish?.toUpperCase()}
                      mid={r.mid}
                      right={r.right}
                      win={r.win}
                      accent={accent}
                    />
                  ))}
                </div>
              </div>
            );
          }
          if (b === "strip") {
            return (
              <div
                key="strip"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  ...(hasList ? { flexGrow: 0 } : { flexGrow: 1 }),
                  justifyContent: "flex-start",
                  padding: `${BAND_PAD}px ${PAD}px`,
                  borderTop: `1px solid ${HAIR}`,
                }}
              >
                <BandTitle
                  title="Season stats"
                  caption="Match win % by season"
                  accent={accent}
                />
                {card.seasons.length >= STRIP_COLUMNS_FROM ? (
                  <SeasonStrip seasons={card.seasons} accent={accent} />
                ) : (
                  <SeasonRows seasons={card.seasons} accent={accent} />
                )}
                {/* Only explain the marker when there is one. A key to a symbol that does
                    not appear reads as a missing element rather than an absent one. */}
                {card.seasons.some((x) => x.titles > 0) ? (
                  <div style={{ display: "flex", alignItems: "center", marginTop: 16 }}>
                    <div
                      style={{
                        display: "flex",
                        width: 11,
                        height: 11,
                        backgroundColor: accent,
                        transform: "rotate(45deg)",
                        marginRight: 12,
                      }}
                    />
                    <div style={{ display: "flex", color: MUTE, fontSize: 19 }}>Won an event</div>
                  </div>
                ) : null}
              </div>
            );
          }
          const block = (b === "league" ? card.league : card.pickem)!;
          return (
            <div
              key={b}
              style={{
                display: "flex",
                flexDirection: "column",
                /*
                 * ⚠️ SATORI IS YOGA, AND YOGA DEFAULTS flexShrink TO 0 — unlike CSS,
                 * where it is 1. A band therefore never gives back space when the column
                 * is over budget; it simply pushes whatever follows off the bottom edge,
                 * and what follows is the footer. So a card carrying a list gets EXPLICIT
                 * heights and the list takes the remainder. Only the career card, which
                 * has no list to budget against, is allowed to let its bands share the
                 * slack — and that is why it was the one layout that never overflowed.
                 */
                /*
                 * Content sits at the TOP of the band, always.
                 *
                 * These used to centre themselves inside a 300px minimum, so a band with
                 * 200px of content padded itself by 50 top and bottom while its neighbour
                 * padded itself by 10 — and no two gaps on the card matched. Top-aligned
                 * with one padding value, the rhythm is even by construction.
                 *
                 * A card with no list then lets its bands share the leftover, which is
                 * safe now that growth collects BELOW the content rather than around it.
                 */
                ...(hasList ? { flexGrow: 0 } : { flexGrow: 1 }),
                justifyContent: "flex-start",
                padding: `${BAND_PAD}px ${PAD}px`,
                borderTop: `1px solid ${HAIR}`,
              }}
            >
              <BandTitle title={block.title} caption={block.caption} accent={accent} />
              <StatRow stats={block.stats} />
              {b === "pickem" && card.pickem ? (
                <TypeBar types={card.pickem.types} accent={accent} />
              ) : null}
            </div>
          );
        })}

        {/* Only a list card needs a tail spacer; otherwise the bands absorb the slack. */}
        {hasList ? <div style={{ display: "flex", flexGrow: 1 }} /> : null}

        {/* FOOTER CTA */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "absolute",
            bottom: 0,
            left: 0,
            width: W,
            height: FOOTER_H,
            padding: `0 ${PAD}px`,
            backgroundColor: GREEN,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", color: "rgba(0,0,0,0.7)", fontSize: 22, fontWeight: 700 }}>
              Every NXL career at
            </div>
            <div
              style={{
                display: "flex",
                color: "#000",
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: 0.5,
              }}
            >
              PICKEMPAINTBALL.COM
            </div>
          </div>
          <div style={{ display: "flex", color: "rgba(0,0,0,0.65)", fontSize: 22, fontWeight: 700 }}>
            @pickempaintball
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts,
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900",
      },
    },
  );
}
