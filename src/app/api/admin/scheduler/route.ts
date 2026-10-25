import { spawn } from "child_process";
import path from "path";
import { NextResponse } from "next/server";
import { HUB } from "@/src/lib/admin/library";
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
  forGraphic,
  keyDates,
  scheduleApproved,
  spreadApproved,
  listSlots,
  postNow,
  captionApproved,
  moveApproved,
  recordJobResult,
  removeSlot,
  saveSlot,
  tray,
  unapprove,
} from "@/src/lib/admin/scheduler";

export const dynamic = "force-dynamic";

/** The Manager's day planner (pickem-hub agents/manager/dayplan.py, James 24 Oct 2026): a slot added, moved, ticked or
 * removed re-plans today's wake-ups, so a job fires at its slot's new time. Detached; never blocks or fails the save. */
function replan(why: string) {
  try {
    const py = process.env.PICKEM_PYTHON || path.join(process.env.HOME || "", "anaconda3/bin/python3");
    const child = spawn(py, [path.join(HUB, "agents/manager/dayplan.py"), "plan", "--reason", `schedule: ${why}`], {
      cwd: HUB, detached: true, stdio: "ignore",
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* the 7 AM run catches up anything missed */
  }
}

/**
 * GET ?event= → the event's calendar: slots, what's not on it yet (tray), key dates, made posts for carousels.
 * GET ?event=&type= → what Generator step 5 needs for one graphic (made posts + captions, what's scheduled, a recommended time).
 */
export async function GET(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const list = events();
  const sp = new URL(request.url).searchParams;
  const q = sp.get("event");
  const type = sp.get("type");
  if (q && type) {
    if (!validId(q) || !/^[a-z0-9_]+$/.test(type)) return NextResponse.json({ error: "Unknown graphic" }, { status: 400 });
    try {
      return NextResponse.json(await forGraphic(q, type));
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }
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
 *   save      {id, at?, caption?, notes?, slides?, variant?, waitFor?, collaborators?}   waitFor = playbook data job ids ([] clears);
 *             collaborators = Instagram usernames, max 3 ("@" optional; [] = none); both ok on an approved post
 *   approve   {id}    uploads the slides as hidden Page photos; refused while anything blocks
 *   unapprove {id}
 *   postnow   {id}    goes out at the cloud job's next pass (≤ 5 min)
 *   remove    {id}
 *   spread    {event, type, variants[], from, to, times[]}   lay a group of made posts over a date range as drafts
 *   task      {event, kind: work|action, agent, title, at, duration?, notes?}   a task on the Schedule
 *   done      {id, done}   tick / untick a task
 *   approve-now   {event, type, variant, at|null, caption, collaborators?}   Generator step 5: approve + schedule (at = ET) or post now (at null)
 *   spread-approved {event, type, variants[], from, to, times[]}   Generator step 5: lay out + approve each
 *   jobResult {event, job, result: ok|failed, finishedAt: ISO}   a Data job's latest run → agentJobs/{event}__{job} (post holds)
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
    if (b.action === "approve-now") {
      if (!validId(String(b.event)) || !/^[a-z0-9_]+$/.test(String(b.type))) throw new Error("Unknown post");
      return NextResponse.json({ ok: true, id: await scheduleApproved(b.event, b.type, String(b.variant ?? ""), b.at ? String(b.at) : null, String(b.caption ?? ""), Array.isArray(b.collaborators) ? b.collaborators.map(String) : undefined) });
    }
    if (b.action === "spread-approved") {
      if (!validId(String(b.event)) || !/^[a-z0-9_]+$/.test(String(b.type))) throw new Error("Unknown post");
      const n = await spreadApproved(b.event, b.type, (b.variants ?? []).map(String), String(b.from), String(b.to), (b.times ?? []).map(String));
      return NextResponse.json({ ok: true, added: n });
    }
    if (b.action === "jobResult") {
      if (!validId(String(b.event))) throw new Error("Unknown event");
      await recordJobResult(String(b.event), String(b.job ?? ""), String(b.result ?? ""), String(b.finishedAt ?? ""));
      return NextResponse.json({ ok: true });
    }
    if (b.action === "task") {
      if (!validId(String(b.event))) throw new Error("Unknown event");
      if (b.kind !== "work" && b.kind !== "action") throw new Error("A task is work or an action");
      const taskId = await addTask(b.event, b.kind, String(b.agent), String(b.title ?? ""), String(b.at), Number(b.duration ?? 0), String(b.notes ?? ""));
      replan("task added");
      return NextResponse.json({ ok: true, id: taskId });
    }
    if (!/^[A-Za-z0-9]{10,40}$/.test(id)) throw new Error("Unknown slot");
    if (b.action === "done") {
      await setDone(id, !!b.done);
      replan("slot ticked");
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
        waitFor: Array.isArray(b.waitFor) ? b.waitFor.map(String) : undefined,
        collaborators: Array.isArray(b.collaborators) ? b.collaborators.map(String) : undefined,
      });
    } else if (b.action === "approve") await approve(id);
    else if (b.action === "unapprove") await unapprove(id);
    else if (b.action === "postnow") await postNow(id);
    else if (b.action === "remove") await removeSlot(id);
    else if (b.action === "move") await moveApproved(id, String(b.at));
    else if (b.action === "caption") await captionApproved(id, String(b.caption ?? ""));
    else throw new Error("Unknown action");
    if (b.action === "save" || b.action === "remove" || b.action === "move") replan(b.action === "remove" ? "slot removed" : "slot saved");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
