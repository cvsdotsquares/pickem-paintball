import fs from "fs";
import path from "path";
import { HUB } from "./library";

/**
 * The event's emails for the Social calendar (James, 3 Nov 2026: scheduled emails belong on it). Read-only: emails are
 * approved in chat with the Email agent and sent by Klaviyo, never from the panel. Source: pickem-hub
 * agents/email/events/<event>.json (copy, audience, send_at); whether each went out comes from the Email agent's run
 * reports (agents/runs/email/<date>_<job>.json, written by sends.py). Dropped emails are left off.
 */
export type EmailStatus = "scheduled" | "checking" | "sent" | "failed" | "unscheduled";
export type EmailItem = {
  id: string;
  name: string;
  subject: string;
  preview: string;
  audience: string;
  sendAt: string | null; // ISO (UTC)
  status: EmailStatus;
  note: string; // e.g. the results email moving earlier when the Final ends early
  campaignId: string;
};

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

function reports(job: string): Raw[] {
  const dir = path.join(HUB, "agents", "runs", "email");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(`_${job}.json`) || new RegExp(`_${job}_\\d+\\.json$`).test(f));
  } catch {
    return [];
  }
  const out: Raw[] = [];
  for (const f of files) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Raw;
      if (!r.test) out.push(r); // test runs never count (playbook.py real())
    } catch {
      /* a half-written report: next load */
    }
  }
  return out;
}

/** A report for this email: one job can carry several campaigns (the results email's two audiences). */
function reportFor(job: string, campaignId: string, reps: Raw[]): Raw | undefined {
  const mine = reps.filter((r) => !campaignId || (Array.isArray(r.actions) && r.actions.some((a) => String(a).includes(campaignId))));
  return mine.sort((a, b) => str(a.started).localeCompare(str(b.started))).pop();
}

export function eventEmails(event: string): EmailItem[] {
  let doc: { emails?: Record<string, Raw> };
  try {
    doc = JSON.parse(fs.readFileSync(path.join(HUB, "agents", "email", "events", `${event}.json`), "utf8"));
  } catch {
    return [];
  }
  const now = Date.now();
  const out: EmailItem[] = [];
  for (const [id, e] of Object.entries(doc.emails ?? {})) {
    if (e.dropped) continue;
    const sendAt = str(e.send_at) || str(e.sent) || null;
    const job = str(e.job);
    const campaignId = str(e.campaign_id);
    const rep = job ? reportFor(job, campaignId, reports(job)) : undefined;
    let status: EmailStatus;
    if (e.sent || rep?.result === "ok") status = "sent";
    else if (rep?.result === "failed") status = "failed";
    else if (!sendAt) status = "unscheduled";
    else status = Date.parse(sendAt) > now ? "scheduled" : "checking";
    out.push({
      id,
      name: str(e.name) || id,
      subject: str(e.subject),
      preview: str(e.preview),
      audience: str(e.audience),
      sendAt,
      status,
      note: e.send_on_event_end && status === "scheduled" ? "Goes earlier if the Final ends early (15 min after the event ends)" : "",
      campaignId,
    });
  }
  return out.sort((a, b) => (a.sendAt ?? "").localeCompare(b.sendAt ?? ""));
}
