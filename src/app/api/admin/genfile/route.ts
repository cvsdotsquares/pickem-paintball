import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import { GEN, genFile } from "@/src/lib/admin/generator";
import { HUB } from "@/src/lib/admin/library";

/** 480px copy for board cards, made once with macOS sips (renders are 1440×1800 PNGs). */
function thumbnail(original: string): string {
  const out = path.join(HUB, "library/.thumbs/gen", path.relative(GEN, original).replace(/[\\/]/g, "__") + ".jpg");
  if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(original).mtimeMs) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    execFileSync("sips", ["-Z", "480", "-s", "format", "jpeg", "-s", "formatOptions", "75", original, "--out", out], { stdio: "ignore" });
  }
  return out;
}

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
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
  if (q.get("thumb") && /\.(png|jpe?g)$/i.test(p)) {
    try {
      p = thumbnail(p);
    } catch {
      // fall back to the full render
    }
  }
  return new NextResponse(new Uint8Array(fs.readFileSync(p)), {
    headers: {
      "Content-Type": TYPES[path.extname(p).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
}
