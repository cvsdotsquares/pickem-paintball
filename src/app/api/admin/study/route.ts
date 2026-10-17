import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import { readStudy } from "@/src/lib/admin/library";

export const dynamic = "force-dynamic";

/** A reel's study folder: /api/admin/study?study=studies/<name> → { videos, strips, breakdown }. */
export async function GET(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const study = readStudy(new URL(request.url).searchParams.get("study") ?? "");
  if (!study) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(study);
}
