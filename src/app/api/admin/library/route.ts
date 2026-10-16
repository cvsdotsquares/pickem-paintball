import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import { loadLibrary, readTags, saveItemTags } from "@/src/lib/admin/library";

export const dynamic = "force-dynamic";

/** Every past post + inspiration image, and the tag list. */
export async function GET() {
  const blocked = adminGate();
  if (blocked) return blocked;
  try {
    return NextResponse.json({ items: loadLibrary(), tags: readTags() });
  } catch (e) {
    return NextResponse.json({ error: `Could not read the kit: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Save the tags on one post: { id, postTypes, phases, style }. */
export async function PATCH(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const body = await request.json();
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
  const item = saveItemTags(String(body.id ?? ""), {
    postTypes: list(body.postTypes),
    phases: list(body.phases),
    style: list(body.style),
  });
  if (!item) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  return NextResponse.json({ item });
}
