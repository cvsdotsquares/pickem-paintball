/**
 * Post holds ("waits for", James 25 Oct 2026): a post can wait for one or more Data jobs (playbook job ids in its
 * `waitFor`); the posting job never sends it until each job's latest run passed. Contract:
 * side-session-notes/…/post-holds-contract.md. This file is the pure part (no Firestore, no files) so it can be
 * tested on its own: the chip's words and the calendar block. scheduler.ts reads the playbook and the slots.
 */

export type HoldJob = { id: string; name: string; short?: string; agent?: string; repeat?: string };
export type HoldChip = { text: string; waiting: boolean };
/** A Schedule slot as far as the calendar block cares. */
export type WorkSlot = { kind: string; notes: string; publishAt: string | null };

const TZ = "America/New_York";

/** A job's short name: the playbook's `short`, else its `name`; an id the playbook doesn't know stays as is. */
export function jobShort(id: string, jobs: HoldJob[]): string {
  const j = jobs.find((x) => x.id === id);
  return j ? j.short || j.name : id;
}

/**
 * The ⏳ chip on a post: "waiting for <short>…" while the posting job is holding it (`waiting` set, orange),
 * "waits for <short>" when it has a hold, null when it has none.
 */
export function holdChip(waitFor: string[], waiting: string, jobs: HoldJob[]): HoldChip | null {
  const held = waiting.split(",").map((x) => x.trim()).filter(Boolean);
  if (held.length) return { text: `waiting for ${held.map((id) => jobShort(id, jobs)).join(", ")}…`, waiting: true };
  if (waitFor.length) return { text: `waits for ${waitFor.map((id) => jobShort(id, jobs)).join(", ")}`, waiting: false };
  return null;
}

/** ISO → ET wall time "YYYY-MM-DDTHH:MM". */
export function etWall(iso: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** ET wall time "YYYY-MM-DDTHH:MM" → ISO, right across the clock change. */
function wallToISO(wall: string): string {
  const guess = Date.parse(`${wall}:00Z`);
  const w = etWall(new Date(guess).toISOString());
  return new Date(guess - (Date.parse(`${w}:00Z`) - guess)).toISOString();
}

const hasJob = (notes: string, job: string) => new RegExp(`(^|\\s)job:${job}(\\s|$)`).test(notes ?? "");

/**
 * When a work slot's job runs on or nearest to the post's day. A repeating job has one slot on its first day with
 * `to:YYYY-MM-DD` in its notes (the calendar draws it again every day up to then, same ET time), so for a post on a
 * day inside that window the job's run that day counts; before the window, its first run.
 */
function runFor(slot: WorkSlot, postWall: string): string | null {
  if (!slot.publishAt) return null;
  const first = etWall(slot.publishAt);
  const to = (slot.notes ?? "").match(/\bto:(\d{4}-\d{2}-\d{2})/)?.[1];
  const day = postWall.slice(0, 10);
  if (!to || day <= first.slice(0, 10)) return slot.publishAt;
  const onDay = `${day > to ? to : day}T${first.slice(11)}`;
  return wallToISO(onDay);
}

/**
 * The calendar block: a post can't be placed before a job it waits for. For each job in `waitFor`, the event's work
 * slots for it (kind "work", notes carry `job:<id>`): if every planned run is after the post's time, refuse with
 * "This post waits for <short> (<time ET>). Put it after that." No work slot (own-timer jobs) = no block.
 * Returns the refusal, or null when the time is fine. `fmt` formats an ISO time as ET (scheduler.ts's showTyped).
 */
export function holdBlock(postAt: string, waitFor: string[], slots: WorkSlot[], jobs: HoldJob[], fmt: (iso: string) => string): string | null {
  const post = new Date(postAt).getTime();
  const postWall = etWall(postAt);
  for (const job of waitFor) {
    const runs = slots
      .filter((s) => s.kind === "work" && hasJob(s.notes, job))
      .map((s) => runFor(s, postWall))
      .filter((r): r is string => !!r)
      .sort();
    if (!runs.length || runs.some((r) => new Date(r).getTime() <= post)) continue;
    return `This post waits for ${jobShort(job, jobs)} (${fmt(runs[0])}). Put it after that.`;
  }
  return null;
}
