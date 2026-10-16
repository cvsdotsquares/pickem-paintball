import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import { HUB, mediaPath } from "@/src/lib/admin/library";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
};

/**
 * Grid thumbnails: a 480px copy made once with macOS `sips` and kept in pickem-hub/library/.thumbs
 * (the originals are ~2.5 MB each and stream from Google Drive).
 */
function thumbnail(source: string, file: string, original: string): string {
  const out = path.join(HUB, "library/.thumbs", source, `${file}.jpg`);
  if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(original).mtimeMs) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    execFileSync("sips", ["-Z", "480", "-s", "format", "jpeg", "-s", "formatOptions", "75", original, "--out", out], {
      stdio: "ignore",
    });
  }
  return out;
}

/** A post image straight from the Drive kit: /api/admin/image?source=past&file=...[&thumb=1] */
export async function GET(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const url = new URL(request.url);
  let p = mediaPath(url.searchParams.get("source") ?? "", url.searchParams.get("file") ?? "");
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (url.searchParams.get("thumb") && TYPES[path.extname(p).toLowerCase()]?.startsWith("image/")) {
    try {
      p = thumbnail(url.searchParams.get("source")!, path.basename(p), p);
    } catch {
      // fall back to the original
    }
  }
  return new NextResponse(new Uint8Array(fs.readFileSync(p)), {
    headers: {
      "Content-Type": TYPES[path.extname(p).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
