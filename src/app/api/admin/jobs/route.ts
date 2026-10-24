import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import { listRuns, readLog, startJob } from "@/src/lib/admin/jobs";

export const dynamic = "force-dynamic";

/** Recent job runs (newest first), with the newest run's output so far. */
export async function GET() {
  const blocked = adminGate();
  if (blocked) return blocked;
  const runs = listRuns();
  return NextResponse.json({ runs, latestLog: runs[0] ? readLog(runs[0]).slice(-4000) : "" });
}

/** Start a job on this Mac: { job: "check-inspo" }. */
export async function POST(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const { job } = await request.json();
  const run = startJob(String(job ?? ""));
  if ("error" in run) return NextResponse.json(run, { status: 409 });
  return NextResponse.json({ run });
}
