import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import { validId } from "@/src/lib/admin/generator";
import {
  addSlot,
  addTask,
  agents,
  approve,
  needsYou,
  setDone,
  spread,
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
      agents: agents(),
      needsYou: needsYou(slots),
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
 *   spread    {event, type, variants[], from, to, times[]}   lay a group of made posts over a date range as drafts
 *   task      {event, kind: work|action, agent, title, at, duration?, notes?}   a task on the Schedule
 *   done      {id, done}   tick / untick a task
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
    if (b.action === "spread") {
      if (!validId(String(b.event)) || !/^[a-z0-9_]+$/.test(String(b.type))) throw new Error("Unknown post");
      const n = await spread(b.event, b.type, (b.variants ?? []).map(String), String(b.from), String(b.to), (b.times ?? []).map(String));
      return NextResponse.json({ ok: true, added: n });
    }
    if (b.action === "task") {
      if (!validId(String(b.event))) throw new Error("Unknown event");
      if (b.kind !== "work" && b.kind !== "action") throw new Error("A task is work or an action");
      return NextResponse.json({ ok: true, id: await addTask(b.event, b.kind, String(b.agent), String(b.title ?? ""), String(b.at), Number(b.duration ?? 0), String(b.notes ?? "")) });
    }
    if (!/^[A-Za-z0-9]{10,40}$/.test(id)) throw new Error("Unknown slot");
    if (b.action === "done") {
      await setDone(id, !!b.done);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "save") {
      await saveSlot(id, {
        at: b.at === undefined ? undefined : String(b.at),
        caption: b.caption === undefined ? undefined : String(b.caption),
        notes: b.notes === undefined ? undefined : String(b.notes),
        slides: Array.isArray(b.slides) ? b.slides.map(String) : undefined,
        variant: b.variant === undefined ? undefined : String(b.variant),
        title: b.title === undefined ? undefined : String(b.title),
        duration: b.duration === undefined ? undefined : Number(b.duration),
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
