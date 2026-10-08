/**
 * Asset loading for the share graphics — fonts, local files, remote photos.
 *
 * Split out because a second card now exists and the two must look like the same brand.
 * Fonts in particular: the numbers on these cards are Hitmarker Condensed Light, chosen
 * to match the in-app `.pickem-numeric`, and a card that quietly fell back to the default
 * would look wrong in a way nobody would think to check.
 *
 * SATORI, NOT A BROWSER. Three constraints shape everything here:
 *   - it cannot decode webp, and most of our player photos are webp, so remote images are
 *     transcoded to PNG with sharp before they are ever handed over;
 *   - `background-size: cover` is unreliable and tiles instead, so anything that must
 *     fill a box is pre-cropped to that box's exact aspect;
 *   - every element must carry `display: flex`.
 *
 * Everything is cached per server instance: a card is rendered on every share tap and the
 * fonts alone are several megabytes.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export type ShareFont = {
  name: string;
  data: Buffer;
  weight: 300 | 400 | 700 | 800;
  style: "normal";
};

async function fontBuf(file: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public/fonts", file));
  } catch {
    return null;
  }
}

async function loadFonts(): Promise<ShareFont[]> {
  const [demi, ultra, hitLight, hitReg, hitBold] = await Promise.all([
    fontBuf("Industry-Demi.ttf"),
    fontBuf("Industry-Ultra.ttf"),
    fontBuf("HitmarkerCondensed-Light.ttf"),
    fontBuf("HitmarkerCondensed-Regular.ttf"),
    fontBuf("HitmarkerCondensed-Bold.ttf"),
  ]);
  const fonts: ShareFont[] = [];
  // Industry Demi is a single master covering regular and bold; Ultra is the display weight.
  if (demi) {
    fonts.push({ name: "Industry", data: demi, weight: 400, style: "normal" });
    fonts.push({ name: "Industry", data: demi, weight: 700, style: "normal" });
  }
  if (ultra) fonts.push({ name: "Industry", data: ultra, weight: 800, style: "normal" });
  if (hitLight) fonts.push({ name: "Hitmarker", data: hitLight, weight: 300, style: "normal" });
  if (hitReg) fonts.push({ name: "Hitmarker", data: hitReg, weight: 400, style: "normal" });
  if (hitBold) fonts.push({ name: "Hitmarker", data: hitBold, weight: 700, style: "normal" });
  return fonts;
}

let _fonts: Promise<ShareFont[]> | null = null;
export const loadFontsCached = (): Promise<ShareFont[]> => (_fonts ??= loadFonts());

const _dataUri = new Map<string, Promise<string | null>>();
/** A file from `public/` as a data URI, cached forever — these never change at runtime. */
export function dataUriCached(file: string, mime: string): Promise<string | null> {
  const hit = _dataUri.get(file);
  if (hit) return hit;
  const p = readFile(path.join(process.cwd(), "public", file))
    .then((buf) => `data:${mime};base64,${buf.toString("base64")}`)
    .catch(() => null);
  _dataUri.set(file, p);
  return p;
}

const _png = new Map<string, Promise<string>>();
const PNG_CACHE_MAX = 64;

/**
 * A remote image as a PNG data URI, resized to `width`.
 *
 * Returns "" rather than throwing on any failure. A missing photo must degrade to the
 * card's own empty state — a share tap that errors because a CDN was slow is worse than
 * a card with initials on it.
 */
export function toPngCached(
  url: string,
  width = 520,
  /**
   * Crop to fill a box of exactly these dimensions, anchored at the top.
   *
   * Player photos are full-length studio shots on a dark ground, so dropping one into a
   * square box unchanged leaves the subject small and centred with his legs clipped at an
   * arbitrary line. Anchoring at the top and cropping to the box keeps head and torso —
   * the part that identifies the player — and makes the crop deliberate rather than
   * whatever the source aspect happened to give.
   */
  cover?: { w: number; h: number },
): Promise<string> {
  if (!url) return Promise.resolve("");
  const key = `${width}|${cover ? `${cover.w}x${cover.h}` : "-"}|${url}`;
  const hit = _png.get(key);
  if (hit) return hit;
  const p = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return "";
      const buf = Buffer.from(await res.arrayBuffer());
      /**
       * Find the subject before cropping to it.
       *
       * Player photos are shot at wildly different scales — some fill the frame, some sit
       * small in a wide field of flat backdrop. Cropping the CANVAS from the top therefore
       * gives a different result per player: a head-and-shoulders for one, a head floating
       * under a band of empty backdrop for the next. Trimming the uniform border first
       * makes the crop relative to the PERSON, so every card frames its subject the same
       * way whatever the source did.
       *
       * The sanity check matters more than the trim. A photo shot against a busy
       * background trims to nothing useful, and a trim that collapses the image would
       * produce a garbage close-up; anything under half the original area is rejected and
       * the untrimmed photo is used, which is exactly the old behaviour.
       */
      let src = buf;
      if (cover) {
        try {
          const t = await sharp(buf).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
          const meta = await sharp(buf).metadata();
          const areaBefore = (meta.width ?? 0) * (meta.height ?? 0);
          const areaAfter = t.info.width * t.info.height;
          if (t.info.width >= 96 && t.info.height >= 96 && areaBefore > 0 && areaAfter / areaBefore >= 0.5) {
            src = t.data;
          }
        } catch {
          /* not trimmable — the untrimmed photo is a perfectly good fallback */
        }
      }
      const pipeline = cover
        ? sharp(src).resize(cover.w, cover.h, { fit: "cover", position: "top" })
        : sharp(src).resize(width, null, { withoutEnlargement: true });
      const out = await pipeline.png().toBuffer();
      return `data:image/png;base64,${out.toString("base64")}`;
    } catch {
      return "";
    }
  })();
  if (_png.size >= PNG_CACHE_MAX) {
    const oldest = _png.keys().next().value;
    if (oldest) _png.delete(oldest);
  }
  _png.set(key, p);
  return p;
}
