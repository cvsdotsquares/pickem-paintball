import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import { genFile } from "@/src/lib/admin/generator";

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
  const p = genFile(new URL(request.url).searchParams.get("path") ?? "");
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(fs.readFileSync(p)), {
    headers: {
      "Content-Type": TYPES[path.extname(p).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
}
