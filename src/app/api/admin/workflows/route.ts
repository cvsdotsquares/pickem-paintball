import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import { readReport, runNow, setAgent, view } from "@/src/lib/admin/workflows";

export const dynamic = "force-dynamic";

/** GET → the Workflows page's data: team, recently completed, upcoming, the brief + inputs, one card per agent. GET ?report=agents/runs/… → one report. */
export async function GET(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const rep = new URL(request.url).searchParams.get("report");
  if (rep) {
    try {
      return NextResponse.json(readReport(rep));
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 404 });
    }
  }
  try {
    return NextResponse.json(await view());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * POST { action, ... }
 *   switch  {id, enabled}          the agent's on/off switch (agents.json)
 *   pause   {id, until}            pause until a date (YYYY-MM-DD; "" = unpause)
 *   run     {agent, job, test?, force?}   run one playbook job now (job "morning" = the Manager's whole morning run)
 */
export async function POST(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const b = await request.json();
  try {
    if (b.action === "switch") setAgent(String(b.id), { enabled: !!b.enabled });
    else if (b.action === "pause") setAgent(String(b.id), { paused_until: String(b.until ?? "") });
    else if (b.action === "run") return NextResponse.json(runNow(String(b.agent), String(b.job), { test: !!b.test, force: !!b.force }));
    else throw new Error("Unknown action");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
