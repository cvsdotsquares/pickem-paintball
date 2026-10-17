import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import { createEventRequest, eventId, listEvents } from "@/src/lib/admin/generator";
import { running, startJob } from "@/src/lib/admin/jobs";

export const dynamic = "force-dynamic";

const MAX_FILE = 25 * 1024 * 1024;

/**
 * New event (multipart form): name, dates, brief, inspo (JSON list of Post Library ids), files[].
 * Saves everything to generator/work/<event>/ and starts the event-setup job (theme + brand board).
 */
export async function POST(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  if (!name || !eventId(name)) return NextResponse.json({ error: "Give the event a name" }, { status: 400 });
  if (listEvents().some((e) => e.id === eventId(name) && !e.settingUp))
    return NextResponse.json({ error: "That event already exists" }, { status: 409 });
  if (running()) return NextResponse.json({ error: "Another job is still running — try again when it finishes" }, { status: 409 });

  const uploads: { name: string; data: Buffer }[] = [];
  for (const f of form.getAll("files")) {
    if (typeof f === "string" || !f.size) continue;
    if (f.size > MAX_FILE) return NextResponse.json({ error: `${f.name} is over 25 MB` }, { status: 400 });
    uploads.push({ name: f.name, data: Buffer.from(await f.arrayBuffer()) });
  }
  let inspo: string[] = [];
  try {
    inspo = JSON.parse(String(form.get("inspo") ?? "[]")).map(String);
  } catch {
    inspo = [];
  }
  const req = createEventRequest(name, String(form.get("dates") ?? ""), String(form.get("brief") ?? ""), inspo, uploads);
  const run = startJob("event-setup", { event: req.id });
  if ("error" in run) return NextResponse.json(run, { status: 409 });
  return NextResponse.json({ event: req.id, run });
}
