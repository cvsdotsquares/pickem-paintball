import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import { GEN, validId } from "@/src/lib/admin/generator";

export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * A photo James adds to a comment box on the post page (pasted, dropped or chosen; James, 17 Oct).
 * FormData { event, type, file } → saved as work/<event>/<type>/feedback_photos/<time>.jpg|png (max 2000px,
 * HEIC etc. turned into JPEG with macOS sips). Returns { rel } (relative to generator/) for the comment.
 */
export async function POST(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const form = await request.formData();
  const event = String(form.get("event") ?? "");
  const type = String(form.get("type") ?? "");
  const file = form.get("file");
  if (!validId(event) || !validId(type)) return NextResponse.json({ error: "Bad post" }, { status: 400 });
  if (!(file instanceof File) || !file.type.startsWith("image/")) return NextResponse.json({ error: "That isn't a photo" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photo is too big (25 MB max)" }, { status: 400 });

  const dir = path.join(GEN, "work", event, type, "feedback_photos");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = file.type === "image/png" ? ".png" : ".jpg";
  const raw = path.join(dir, `${stamp}_upload${path.extname(file.name) || ext}`);
  const out = path.join(dir, `${stamp}_${Math.random().toString(36).slice(2, 6)}${ext}`);
  fs.writeFileSync(raw, new Uint8Array(await file.arrayBuffer()));
  try {
    execFileSync("sips", ["-Z", "2000", "-s", "format", ext === ".png" ? "png" : "jpeg", raw, "--out", out], { stdio: "ignore" });
  } catch {
    fs.rmSync(raw, { force: true });
    return NextResponse.json({ error: "Couldn't read that photo" }, { status: 400 });
  }
  fs.rmSync(raw, { force: true });
  return NextResponse.json({ rel: path.relative(GEN, out) });
}
