import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import {
  addBoardFeedback,
  addGraphic,
  baseOf,
  graphicName,
  graphics,
  keyInspo,
  renameGraphic,
  setKeyInspo,
  addFeedback,
  approveBoard,
  board,
  detail,
  eventPack,
  examples,
  finals,
  GEN,
  listEvents,
  openFeedbackCount,
  preview,
  readStatus,
  setStatus,
  signoff,
  validId,
  ensurePlanned,
  genFile,
} from "@/src/lib/admin/generator";
import { failedFor, lastRunFor, MAX_PARALLEL, readLog, runningAll, runningClaude, runningFor, startJob, stopJob } from "@/src/lib/admin/jobs";

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
  const all = runningAll();
  const busy = all[0];
  const full = runningClaude().length >= MAX_PARALLEL; // no room for another Claude run until one finishes
  if (!type) {
    pack.forEach((p) => ensurePlanned(event, p));
    return NextResponse.json({
      events,
      event,
      board: board(event),
      // one row per graphic: a bucket (post type) can hold several (key = <type> or <type>__2 …)
      types: pack.flatMap((p) =>
        graphics(event, p.key).map((g) => ({
          ...p,
          key: g.key,
          base: p.key,
          name: g.name,
          display: g.name || `${p.label} #${g.key.split("__")[1] ?? 1}`,
          status: readStatus(event, g.key),
          preview: preview(event, g.key),
          running: !!runningFor(event, g.key),
          runningSince: runningFor(event, g.key)?.startedAt,
          finalMade: (() => {
            const f = finals(event, g.key);
            return f.posts.length > 0 && !f.test;
          })(),
          failed: failedFor(event, g.key, readStatus(event, g.key)),
        })),
      ),
      busy: busy ? { label: busy.label, params: busy.params } : null,
      busyAll: all.map((r) => ({ label: r.label, params: r.params })),
      full,
      feedbackToReview: openFeedbackCount(),
    });
  }
  const item = pack.find((p) => p.key === baseOf(type));
  if (!item || !validId(type)) return NextResponse.json({ error: "Unknown post type" }, { status: 404 });
  const run = lastRunFor(event, type);
  return NextResponse.json({
    event,
    eventLabel: events.find((e) => e.id === event)?.label ?? event,
    item,
    board: board(event),
    ...detail(event, type),
    finals: finals(event, type),
    examples: examples(item.tags),
    graphicName: graphicName(event, type),
    graphicNumber: Number(type.split("__")[1] ?? 1),
    keyInspo: keyInspo(event, type),
    // an old failure the graphic has since moved past is shown as done, not as a red "stopped" box
    run: run
      ? run.status === "failed" && !failedFor(event, type, readStatus(event, type))
        ? { ...run, status: "done" as const, log: "" }
        : { ...run, log: run.status === "failed" ? readLog(run).slice(-1500) : "" }
      : null,
    busy: busy ? { label: busy.label, params: busy.params } : null,
    full,
  });
}

/**
 * POST { event, type?, action, option?, comment? }
 *   approve-board                  brand board approved (PROCESS step 0)
 *   change-board  {comment}        → event-setup job again with James's comment (panel-made events)
 *   write-brief   {comment}        James's own brief for this post → Claude writes the full brief from it
 *   approve-brief {model?}         → make options job (model: James's pick, else the step's default)
 *   change-brief  {comment}        → comment saved, brief job again
 *   choose        {option,comment} → review + polish job on that option
 *   feedback      {comment,model?} → apply-feedback job (model picked per round)
 *   retry         {model?}         → run the current stage's job again (after a failed run)
 *   signoff                        → template copied to the kit, then Populate --auto (one post with all its numbers
 *                                    → made now and saved to Drive; otherwise it stays Templated)
 *   back-to-options                → stage options again (no job): pick a different A/B/C
 *   add-graphic   {name}           → another graphic in this bucket (work/<event>/<type>__N/), returns its key
 *   rename-graphic {name}          → name this graphic
 *   key-inspo     {id, on}         → star / unstar a reference for this graphic
 *   stop                           → stop the Claude run on this graphic (the step can be started again)
 *   populate      {teams, set}     → step 5 (background job): every version from the latest numbers → Drive kit;
 *                                    teams = some versions only, set = {key: value} for numbers not live yet
 */
export async function POST(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const b = await request.json();
  const event = String(b.event ?? "");
  const type = String(b.type ?? "");
  if (!validId(event)) return NextResponse.json({ error: "Bad event" }, { status: 400 });
  // photos James added to the comment (saved by /api/admin/generator/photo): listed under the text with their
  // paths from pickem-hub, so the job opens them and feedback.md + the feedback log keep them
  const photos = (Array.isArray(b.photos) ? b.photos.map(String) : []).filter(
    (rel: string) => rel.startsWith(`work/${event}/${type}/feedback_photos/`) && !rel.includes("..") && genFile(rel),
  );
  const comment =
    String(b.comment ?? "").trim() +
    (photos.length
      ? `\n\nPhotos James added (open each one and look at it):\n${photos.map((r: string) => `- generator/${r}`).join("\n")}`
      : "");
  if (b.action === "approve-board") {
    if (!board(event).image) return NextResponse.json({ error: "No brand board yet" }, { status: 409 });
    approveBoard(event);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "change-board") {
    if (!comment.trim()) return NextResponse.json({ error: "Write what to change" }, { status: 400 });
    if (runningAll().some((r) => r.job === "event-setup" && r.params?.event === event))
      return NextResponse.json({ error: "The brand board is still being made — try again when it finishes" }, { status: 409 });
    if (!board(event).request) return NextResponse.json({ error: "This event wasn't set up from the panel" }, { status: 409 });
    addBoardFeedback(event, comment);
    const r = startJob("event-setup", { event });
    return "error" in r ? NextResponse.json(r, { status: 409 }) : NextResponse.json({ run: r });
  }
  if (!validId(type) || !eventPack().some((p) => p.key === baseOf(type)))
    return NextResponse.json({ error: "Unknown post type" }, { status: 404 });
  if (!board(event).approved) return NextResponse.json({ error: "Approve the brand board first" }, { status: 409 });

  const st = readStatus(event, type);
  // the model James picked on the page (options/revise only; startJob ignores it elsewhere or if unknown)
  const model = typeof b.model === "string" && b.model ? b.model : undefined;
  const job = (name: string) => {
    const r = startJob(name, { event, type, model });
    return "error" in r ? NextResponse.json(r, { status: 409 }) : NextResponse.json({ run: r });
  };
  if (["write-brief", "approve-brief", "change-brief", "choose", "feedback", "retry"].includes(b.action)) {
    if (runningFor(event, type))
      return NextResponse.json({ error: "Claude is still working on this graphic — stop it first or wait" }, { status: 409 });
    if (runningClaude().length >= MAX_PARALLEL)
      return NextResponse.json({ error: `${MAX_PARALLEL} Claude runs are going already — wait for one to finish (or stop one)` }, { status: 409 });
  }

  switch (b.action) {
    case "stop": {
      const r = stopJob(event, type);
      return "error" in r ? NextResponse.json(r, { status: 409 }) : NextResponse.json({ ok: true });
    }
    case "add-graphic": {
      const name = String(b.name ?? "").trim();
      if (!name) return NextResponse.json({ error: "Give the new graphic a name" }, { status: 400 });
      return NextResponse.json({ ok: true, key: addGraphic(event, baseOf(type), name) });
    }
    case "rename-graphic":
      renameGraphic(event, type, String(b.name ?? ""));
      return NextResponse.json({ ok: true });
    case "key-inspo":
      if (!/^(inspo|past):[^/\\]+$/.test(String(b.id ?? ""))) return NextResponse.json({ error: "Bad id" }, { status: 400 });
      return NextResponse.json({ ok: true, keyInspo: setKeyInspo(event, type, String(b.id ?? ""), !!b.on) });

    case "write-brief":
      if (!comment.trim()) return NextResponse.json({ error: "Write your brief first" }, { status: 400 });
      addFeedback(event, type, "James's brief", comment);
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
        const log = signoff(event, type);
        const r = startJob("populate", { event, type, auto: true });
        return NextResponse.json({ ok: true, log, run: "error" in r ? null : r });
      } catch (e) {
        return NextResponse.json({ error: `Sign-off failed: ${(e as Error).message}` }, { status: 500 });
      }
    case "back-to-options": {
      // James wants to pick a different rough layout: no job, the A/B/C from round 1 show again
      if (!fs.existsSync(path.join(GEN, "work", event, type, "round_1")))
        return NextResponse.json({ error: "No rough layouts to go back to" }, { status: 409 });
      addFeedback(event, type, st.stage, comment || "Went back to pick a different layout");
      setStatus(event, type, { stage: "options" }, "James went back to the options");
      return NextResponse.json({ ok: true });
    }
    case "populate": {
      if (st.stage !== "signed_off") return NextResponse.json({ error: "Sign off the template first" }, { status: 409 });
      if (runningFor(event, type)) return NextResponse.json({ error: "Already working on this graphic" }, { status: 409 });
      const teams = String(b.teams ?? "").split(",").filter(Boolean);
      const known = new Set(finals(event, type).teams.map((t) => t.key));
      if (!teams.every((t) => known.has(t))) return NextResponse.json({ error: "Unknown version" }, { status: 400 });
      const set = Object.entries((b.set ?? {}) as Record<string, unknown>)
        .filter(([k, v]) => /^[a-z_]+$/.test(k) && String(v).trim() && !/[\n\r]/.test(String(v)))
        .map(([k, v]) => `${k}=${String(v).trim()}`);
      const r = startJob("populate", { event, type, teams: teams.join(","), set });
      return "error" in r ? NextResponse.json(r, { status: 409 }) : NextResponse.json({ run: r });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
