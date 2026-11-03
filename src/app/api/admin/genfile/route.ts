import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import { GEN, genFile } from "@/src/lib/admin/generator";
import { HUB } from "@/src/lib/admin/library";

/**
 * A smaller JPEG copy, made once with macOS sips (renders are 1440×1800 PNGs, ~5 MB): 480px for board cards (?thumb=1),
 * 1080px for the calendar's slide viewer (?view=1; the full PNG took 4–6 s per slide over Tailscale, James 2 Nov 2026).
 */
function smaller(original: string, px: number, quality: number): string {
  const dir = px === 480 ? "library/.thumbs/gen" : `library/.thumbs/gen${px}`;
  const out = path.join(HUB, dir, path.relative(GEN, original).replace(/[\\/]/g, "__") + ".jpg");
  if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(original).mtimeMs) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    execFileSync("sips", ["-Z", String(px), "-s", "format", "jpeg", "-s", "formatOptions", String(quality), original, "--out", out], { stdio: "ignore" });
  }
  return out;
}

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/** A render, PDF or note from pickem-hub/generator/work or /boards: /api/admin/genfile?path=work/... */
export async function GET(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const q = new URL(request.url).searchParams;
  let p = genFile(q.get("path") ?? "");
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const view = !!q.get("view");
  if ((q.get("thumb") || view) && /\.(png|jpe?g)$/i.test(p)) {
    try {
      p = view ? smaller(p, 1080, 85) : smaller(p, 480, 75);
    } catch {
      // fall back to the full render
    }
  }
  const type = TYPES[path.extname(p).toLowerCase()] ?? "application/octet-stream";
  if (view) {
    // the slide viewer preloads a carousel's slides: the browser keeps them but asks every time, so a re-made post
    // shows at once (a 10-min keep showed the old cards after Populate, James 2 Nov) and an unchanged one is a quick 304
    const modified = new Date(Math.floor(fs.statSync(p).mtimeMs / 1000) * 1000);
    const since = request.headers.get("if-modified-since");
    const headers = { "Cache-Control": "private, no-cache", "Last-Modified": modified.toUTCString() };
    if (since && new Date(since).getTime() >= modified.getTime()) return new NextResponse(null, { status: 304, headers });
    return new NextResponse(new Uint8Array(fs.readFileSync(p)), { headers: { ...headers, "Content-Type": type } });
  }
  return new NextResponse(new Uint8Array(fs.readFileSync(p)), {
    headers: { "Content-Type": type, "Cache-Control": "no-store" },
  });
}
