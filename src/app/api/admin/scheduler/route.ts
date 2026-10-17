import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import { validId } from "@/src/lib/admin/generator";
import {
  addSlot,
  approve,
  eventPosts,
  events,
  keyDates,
  listSlots,
  postNow,
  removeSlot,
  saveSlot,
  tray,
  unapprove,
} from "@/src/lib/admin/scheduler";

export const dynamic = "force-dynamic";

/** GET ?event= → the event's calendar: slots, what's not on it yet (tray), key dates, made posts for carousels. */
export async function GET(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const list = events();
  const q = new URL(request.url).searchParams.get("event");
  const event = q && list.some((e) => e.id === q) ? q : list.find((e) => e.id === "world_cup_2026")?.id ?? list[0]?.id ?? "";
  try {
    const slots = event ? await listSlots(event) : [];
    return NextResponse.json({
      event,
      events: list,
      slots,
      tray: event ? tray(event, slots) : [],
      dates: keyDates(event),
      posts: event ? eventPosts(event) : [],
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * POST { action, ... } → { ok, id? }
 *   add       {event, type, variant, at}   put a tray item on the calendar as a draft (at = ET "YYYY-MM-DDTHH:MM")
 *   save      {id, at?, caption?, notes?, slides?, variant?}
 *   approve   {id}    uploads the slides as hidden Page photos; refused while anything blocks
 *   unapprove {id}
 *   postnow   {id}    goes out at the cloud job's next pass (≤ 5 min)
 *   remove    {id}
 */
export async function POST(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const b = await request.json();
  const id = String(b.id ?? "");
  try {
    if (b.action === "add") {
      if (!validId(String(b.event)) || !/^[a-z0-9_]+$/.test(String(b.type))) throw new Error("Unknown post");
      return NextResponse.json({ ok: true, id: await addSlot(b.event, b.type, String(b.variant ?? ""), String(b.at)) });
    }
    if (!/^[A-Za-z0-9]{10,40}$/.test(id)) throw new Error("Unknown slot");
    if (b.action === "save") {
      await saveSlot(id, {
        at: b.at === undefined ? undefined : String(b.at),
        caption: b.caption === undefined ? undefined : String(b.caption),
        notes: b.notes === undefined ? undefined : String(b.notes),
        slides: Array.isArray(b.slides) ? b.slides.map(String) : undefined,
        variant: b.variant === undefined ? undefined : String(b.variant),
      });
    } else if (b.action === "approve") await approve(id);
    else if (b.action === "unapprove") await unapprove(id);
    else if (b.action === "postnow") await postNow(id);
    else if (b.action === "remove") await removeSlot(id);
    else throw new Error("Unknown action");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
