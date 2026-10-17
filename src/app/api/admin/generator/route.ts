import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import {
  addBoardFeedback,
  addFeedback,
  approveBoard,
  board,
  detail,
  eventPack,
  examples,
  listEvents,
  readStatus,
  setStatus,
  signoff,
  validId,
} from "@/src/lib/admin/generator";
import { lastRunFor, readLog, running, startJob } from "@/src/lib/admin/jobs";

export const dynamic = "force-dynamic";

/**
 * GET ?event=                → events, the event's brand board and every post type's status
 * GET ?event=&type=          → one post type: status, brief, rounds, feedback, examples, its last job run
 */
export async function GET(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const q = new URL(request.url).searchParams;
  const events = listEvents();
  const event = q.get("event") || events.find((e) => e.id === "world_cup_2026")?.id || events[0]?.id || "";
  if (!validId(event)) return NextResponse.json({ error: "Bad event" }, { status: 400 });
  const pack = eventPack();
  const type = q.get("type");
  const busy = running();
  if (!type) {
    return NextResponse.json({
      events,
      event,
      board: board(event),
      types: pack.map((p) => ({ ...p, status: readStatus(event, p.key), running: busy?.params?.type === p.key && busy.params.event === event })),
      busy: busy ? { label: busy.label, params: busy.params } : null,
    });
  }
  const item = pack.find((p) => p.key === type);
  if (!item || !validId(type)) return NextResponse.json({ error: "Unknown post type" }, { status: 404 });
  const run = lastRunFor(event, type);
  return NextResponse.json({
    event,
    eventLabel: events.find((e) => e.id === event)?.label ?? event,
    item,
    board: board(event),
    ...detail(event, type),
    examples: examples(item.tags),
    run: run ? { ...run, log: run.status === "failed" ? readLog(run).slice(-1500) : "" } : null,
    busy: busy ? { label: busy.label, params: busy.params } : null,
  });
}

/**
 * POST { event, type?, action, option?, comment? }
 *   approve-board                  brand board approved (PROCESS step 0)
 *   change-board  {comment}        → event-setup job again with James's comment (panel-made events)
 *   write-brief                    start the brief job
 *   approve-brief                  → make options job
 *   change-brief  {comment}        → comment saved, brief job again
 *   choose        {option,comment} → review + polish job on that option
 *   feedback      {comment}        → apply-feedback job
 *   retry                          → run the current stage's job again (after a failed run)
 *   signoff                        → template + post copied to the kit (no job)
 */
export async function POST(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const b = await request.json();
  const event = String(b.event ?? "");
  const type = String(b.type ?? "");
  const comment = String(b.comment ?? "");
  if (!validId(event)) return NextResponse.json({ error: "Bad event" }, { status: 400 });
  if (b.action === "approve-board") {
    if (!board(event).image) return NextResponse.json({ error: "No brand board yet" }, { status: 409 });
    approveBoard(event);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "change-board") {
    if (!comment.trim()) return NextResponse.json({ error: "Write what to change" }, { status: 400 });
    if (running()) return NextResponse.json({ error: "Another job is still running — try again when it finishes" }, { status: 409 });
    if (!board(event).request) return NextResponse.json({ error: "This event wasn't set up from the panel" }, { status: 409 });
    addBoardFeedback(event, comment);
    const r = startJob("event-setup", { event });
    return "error" in r ? NextResponse.json(r, { status: 409 }) : NextResponse.json({ run: r });
  }
  if (!validId(type) || !eventPack().some((p) => p.key === type))
    return NextResponse.json({ error: "Unknown post type" }, { status: 404 });
  if (!board(event).approved) return NextResponse.json({ error: "Approve the brand board first" }, { status: 409 });

  const st = readStatus(event, type);
  const job = (name: string) => {
    const r = startJob(name, { event, type });
    return "error" in r ? NextResponse.json(r, { status: 409 }) : NextResponse.json({ run: r });
  };
  if (["write-brief", "approve-brief", "change-brief", "choose", "feedback", "retry"].includes(b.action) && running())
    return NextResponse.json({ error: "Another job is still running — try again when it finishes" }, { status: 409 });

  switch (b.action) {
    case "write-brief":
      return job("post-brief");
    case "retry": {
      // a job failed or was stopped: run the step for the current stage again
      const next: Record<string, string> = {
        not_started: "post-brief",
        brief_approved: "post-options",
        chosen: "post-review",
        feedback: "post-revise",
      };
      return next[st.stage] ? job(next[st.stage]) : NextResponse.json({ error: "Nothing to retry" }, { status: 409 });
    }
    case "change-brief":
      addFeedback(event, type, st.stage, comment);
      setStatus(event, type, { stage: "not_started" }, "James asked for brief changes");
      return job("post-brief");
    case "approve-brief":
      addFeedback(event, type, st.stage, comment);
      setStatus(event, type, { stage: "brief_approved" }, "Brief approved");
      return job("post-options");
    case "choose": {
      const option = String(b.option ?? "");
      if (!["A", "B", "C"].includes(option)) return NextResponse.json({ error: "Pick A, B or C" }, { status: 400 });
      addFeedback(event, type, st.stage, `Chose ${option}. ${comment}`);
      setStatus(event, type, { stage: "chosen", chosen: option }, `Chose option ${option}`);
      return job("post-review");
    }
    case "feedback":
      if (!comment.trim()) return NextResponse.json({ error: "Write what to change" }, { status: 400 });
      addFeedback(event, type, st.stage, comment);
      setStatus(event, type, { stage: "feedback" }, "Feedback given");
      return job("post-revise");
    case "signoff":
      if (st.stage !== "ready") return NextResponse.json({ error: "Nothing ready to sign off" }, { status: 409 });
      try {
        return NextResponse.json({ ok: true, log: signoff(event, type) });
      } catch (e) {
        return NextResponse.json({ error: `Sign-off failed: ${(e as Error).message}` }, { status: 500 });
      }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
