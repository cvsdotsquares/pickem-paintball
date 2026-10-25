import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { applicationDefault, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { HUB } from "./library";
import { baseOf, eventPack, finals, GEN, graphicName, graphics, listEvents, readStatus } from "./generator";

/**
 * Post Scheduler (admin panel page 4). Plan: pickem-hub/ideas/2026-10-17-scheduler-plan.md.
 *
 * Every calendar slot is a `scheduledPosts/{id}` doc in Pick'Em's Firestore, because the cloud job
 * (functions/postScheduler.js, every 5 min) reads the same docs and sends the approved ones that are due.
 * A slot points at one generator post: event + graphic (type) + variant (team / bracket key, "" for one
 * post per event). A slot with no made post yet is a placeholder: it holds the date and shows what's missing.
 *
 * Approve uploads the slides to the Pick'Em Facebook Page as hidden photos (the cloud job posts those to
 * Instagram + Facebook at the time). Nothing un-approved is ever sent.
 *
 * The same collection also holds the other things on the Schedule (James, 18 Oct): an agent's **work**
 * (kind "work": the general manager populating a post, a data job) and **actions** only James can do (kind
 * "action"). Those use status "planned" / "done", so the cloud job's `status == approved` query never sees
 * them. Who does what: pickem-hub/scheduler/agents.json (icon + colour per agent).
 */

export type SlotStatus = "draft" | "approved" | "sending" | "posted" | "failed" | "planned" | "done";
export type Kind = "post" | "work" | "action";
export type Agent = { id: string; name: string; icon: string; colour: string; blurb: string };
export type PathStep = { label: string; agent: string; state: "done" | "now" | "next" | "blocked"; when: string };
export type Slot = {
  id: string;
  kind: Kind;
  agent: string; // agents.json id ("posts" for a post)
  duration: number; // minutes, work items
  event: string;
  type: string;
  variant: string;
  title: string;
  status: SlotStatus;
  publishAt: string | null; // ISO, UTC
  caption: string;
  slides: string[]; // generator-relative PNGs, in order (2+ = carousel)
  notes: string;
  fbPhotoIds: string[];
  approvedAt: string | null;
  slidesStamp: string; // the slides' modified times when approved, to spot a re-made graphic
  result: { instagram?: { permalink: string }; facebook?: { permalink: string } } | null;
  error: string;
};
export type Check = { level: "block" | "warn"; text: string };
export type SlotView = Slot & {
  label: string; // post type label from the event pack
  graphic: string; // graphic name ("" when the type has only one)
  phase: string;
  priority: string;
  stage: string; // generator stage of the graphic
  placeholder: boolean;
  templated: boolean; // template signed off, final post not made yet (waiting on data): the general manager's cue
  preview: string[]; // slides, or the generator's current preview for a placeholder
  data: { source: string; madeAt: string; test: boolean; typed: Record<string, string>; waiting: { label: string; hint: string }[] };
  variants: { key: string; name: string; png: string; caption: string }[]; // made posts of this graphic to pick from
  checks: Check[];
  link: string; // the graphic's Post Generator page
  path: PathStep[]; // data → populate → approve → post, with who and when
};
export type NeedsYou = { id: string; text: string; due: string | null; tone: "orange" | "red" };
export type TrayItem = {
  type: string;
  variant: string;
  title: string;
  label: string;
  phase: string;
  priority: string;
  png: string; // "" for a placeholder
  placeholder: boolean;
  templated: boolean;
};

const COLLECTION = "scheduledPosts";
const GRAPH = "https://graph.facebook.com/v26.0/";
const EVENTS_JSON = path.join(HUB, "scheduler", "events.json");
const AGENTS_JSON = path.join(HUB, "scheduler", "agents.json");

export function agents(): Agent[] {
  try {
    return JSON.parse(fs.readFileSync(AGENTS_JSON, "utf8")).agents ?? [];
  } catch {
    return [];
  }
}
const META_ENV = path.join(os.homedir(), ".config", "pickem-scheduler", "meta.env");

/** Its own named app: the Mac's gcloud login (application default credentials), never the site's keys. */
function db() {
  const name = "scheduler";
  const app: App = getApps().find((a) => a.name === name) ?? initializeApp({ credential: applicationDefault(), projectId: "fantasy-paintball" }, name);
  return getFirestore(app);
}

function metaEnv(): Record<string, string> {
  return Object.fromEntries(
    fs
      .readFileSync(META_ENV, "utf8")
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

const iso = (v: unknown): string | null => (v instanceof Timestamp ? v.toDate().toISOString() : null);

function toSlot(id: string, d: FirebaseFirestore.DocumentData): Slot {
  return {
    id,
    kind: d.kind ?? "post",
    agent: d.agent ?? "posts",
    duration: d.duration ?? 0,
    event: d.event ?? "",
    type: d.type ?? "",
    variant: d.variant ?? "",
    title: d.title ?? "",
    status: d.status ?? "draft",
    publishAt: iso(d.publishAt),
    caption: d.caption ?? "",
    slides: d.slides ?? [],
    notes: d.notes ?? "",
    fbPhotoIds: d.fbPhotoIds ?? [],
    approvedAt: iso(d.approvedAt),
    slidesStamp: d.slidesStamp ?? "",
    result: d.result ?? null,
    error: d.error ?? "",
  };
}

const packItem = (type: string) => eventPack().find((p) => p.key === baseOf(type));
const readText = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");

/** The made posts of a graphic (finals/<variant>/post.png + caption.txt), test runs left out. */
function madePosts(event: string, type: string) {
  const f = finals(event, type);
  if (f.test) return [];
  return f.posts.map((p) => ({
    key: p.team,
    name: p.name,
    png: p.png,
    caption: readText(path.join(GEN, path.dirname(p.png), "caption.txt")).trim(),
  }));
}

function titleFor(event: string, type: string, variant: string): string {
  const p = packItem(type);
  const g = graphicName(event, type);
  // One post for the whole event is saved as finals/event/: no version name needed.
  const v = variant && variant !== "event" ? madePosts(event, type).find((x) => x.key === variant)?.name ?? variant : "";
  return [g || p?.label || type, v].filter(Boolean).join(" · ");
}

const stamp = (slides: string[]) =>
  slides.map((s) => (fs.existsSync(path.join(GEN, s)) ? String(Math.round(fs.statSync(path.join(GEN, s)).mtimeMs)) : "missing")).join(",");

/** A typed-in value for people: ISO times as US Eastern ("Thu 12 Nov, 8:00 AM ET"), anything else as is. */
export function showTyped(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(v) || Number.isNaN(new Date(v).getTime())) return v;
  return `${new Date(v).toLocaleString("en-GB", { timeZone: "America/New_York", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })} ET`;
}

/** Blockers stop Approve; warnings are shown but don't. */
function checks(s: Slot, stage: string, data: SlotView["data"]): Check[] {
  const out: Check[] = [];
  const block = (text: string) => out.push({ level: "block", text });
  const warn = (text: string) => out.push({ level: "warn", text });
  if (s.kind !== "post") {
    if (!s.publishAt) block("No time set");
    return out;
  }
  if (stage !== "signed_off") block("Template not signed off yet (Post Generator)");
  if (!s.slides.length) block(stage === "signed_off" ? "Templated: final post not made yet (Populate once the data is in)" : "Final post not made yet");
  for (const sl of s.slides) if (!fs.existsSync(path.join(GEN, sl))) block(`Slide missing on disk: ${path.basename(path.dirname(sl))}`);
  if (s.slides.length > 10) block("Instagram carousels take at most 10 slides");
  if (data.test) block("Made with stand-in (test) data");
  for (const w of data.waiting) block(`Waiting on ${w.label}${w.hint ? ` (${w.hint})` : ""}`);
  if (s.slides.length && !s.caption.trim()) block("No caption");
  if (s.caption.length > 2200) block(`Caption too long for Instagram (${s.caption.length}/2,200)`);
  if ((s.caption.match(/#\w+/g) ?? []).length > 30) block("More than 30 hashtags (Instagram limit)");
  if (!s.publishAt) block("No time set");
  else if (s.status === "draft" && new Date(s.publishAt).getTime() < Date.now() - 10 * 60_000) block("The time has passed: pick a new one");
  const typed = Object.entries(data.typed).filter(([, v]) => v);
  if (typed.length) warn(`Uses typed-in numbers (${typed.map(([k, v]) => `${k.replace(/_/g, " ")}: ${showTyped(v)}`).join(", ")}). Populate again once Pick'Em has the real ones`);
  if (s.status === "approved" && s.slidesStamp && s.slidesStamp !== stamp(s.slides))
    warn("The graphic was re-made after you approved it. Un-approve and approve again to send the new version");
  if (s.status === "draft" && !out.some((c) => c.level === "block")) warn("Ready: approve to schedule");
  return out;
}

/** The chain behind a post: data → populate (general manager) → approve (James) → post. */
function pathFor(s: Slot, stage: string, data: SlotView["data"], placeholder: boolean): PathStep[] {
  if (s.kind !== "post") return [];
  const posted = s.status === "posted";
  const approved = s.status === "approved" || s.status === "sending" || posted;
  const made = !placeholder;
  const waiting = data.waiting.length > 0;
  const at = s.publishAt ?? "";
  const steps: PathStep[] = [];
  if (stage !== "signed_off") steps.push({ label: "Template signed off", agent: "james", state: "now", when: "" });
  steps.push({
    label: waiting ? `Data: waiting on ${data.waiting.map((w) => w.label).join(", ")}` : made ? `Data in (${data.source || "source"})` : "Data in",
    agent: "data",
    state: made ? "done" : waiting ? "blocked" : stage === "signed_off" ? "now" : "next",
    when: "",
  });
  steps.push({ label: "Populate the final post", agent: "gm", state: made ? "done" : waiting ? "next" : stage === "signed_off" ? "now" : "next", when: "" });
  steps.push({ label: approved ? "Approved" : "You approve", agent: "james", state: approved ? "done" : made && !waiting ? "now" : "next", when: approved ? s.approvedAt ?? "" : at });
  steps.push({ label: posted ? "Posted" : s.status === "failed" ? "Post failed" : "Posts to Instagram + Facebook", agent: "posts", state: posted ? "done" : s.status === "failed" ? "blocked" : approved ? "now" : "next", when: at });
  return steps;
}

function view(s: Slot): SlotView {
  if (s.kind !== "post") {
    const data = { source: "", madeAt: "", test: false, typed: {}, waiting: [] };
    return {
      ...s,
      templated: false,
      label: s.kind === "work" ? "Agent work" : "Your action",
      graphic: "",
      phase: "",
      priority: "",
      stage: "",
      placeholder: false,
      preview: [],
      data,
      variants: [],
      checks: checks(s, "", data),
      link: "",
      path: [],
    };
  }
  const p = packItem(s.type);
  const f = finals(s.event, s.type);
  const st = readStatus(s.event, s.type);
  const data = {
    source: f.source,
    madeAt: f.madeAt,
    test: f.test,
    typed: Object.fromEntries(Object.entries(f.typed).map(([k, v]) => [k.replace(/_/g, " "), showTyped(String(v))])),
    waiting: f.waiting.map((w) => ({ label: w.label, hint: w.hint })),
  };
  const variants = madePosts(s.event, s.type);
  const placeholder = !s.slides.length;
  return {
    ...s,
    templated: placeholder && st.stage === "signed_off",
    label: p?.label ?? s.type,
    graphic: graphicName(s.event, s.type),
    phase: p?.phase ?? "",
    priority: p?.priority ?? "",
    stage: st.stage,
    placeholder,
    preview: placeholder ? (variants[0] ? [variants[0].png] : []) : s.slides,
    data,
    variants,
    checks: checks(s, st.stage, data),
    link: `/admin/generator/${s.event}/${baseOf(s.type)}/${s.type}`,
    path: pathFor(s, st.stage, data, placeholder),
  };
}

/**
 * The "needs you" strip: everything only James can move, oldest deadline first. Derived from the slots,
 * so there is nothing to keep up to date by hand.
 */
export function needsYou(slots: SlotView[]): NeedsYou[] {
  const out: NeedsYou[] = [];
  for (const s of slots) {
    if (s.kind === "action" && s.agent === "james" && s.status !== "done") out.push({ id: s.id, text: s.title, due: s.publishAt, tone: "orange" });
    if (s.kind !== "post") continue;
    const blocks = s.checks.filter((c) => c.level === "block");
    if (s.status === "failed") out.push({ id: s.id, text: `Failed: ${s.title} (${s.error || "see the panel"})`, due: s.publishAt, tone: "red" });
    else if (s.status === "draft" && !blocks.length) out.push({ id: s.id, text: `Approve ${s.title}`, due: s.publishAt, tone: "orange" });
    else if (s.status === "draft" && s.placeholder && !s.templated && s.variants.length) out.push({ id: s.id, text: `Pick the version for ${s.title}`, due: s.publishAt, tone: "orange" });
    else if (s.status === "draft" && s.data.waiting.some((w) => /tab|xlsx|databook|add /i.test(w.hint)))
      for (const w of s.data.waiting.filter((w) => /tab|xlsx|databook|add /i.test(w.hint))) out.push({ id: s.id, text: `${w.hint.split(" (")[0]} (for ${s.title})`, due: s.publishAt, tone: "orange" });
    if (s.status === "approved" && s.checks.some((c) => c.text.startsWith("The graphic was re-made"))) out.push({ id: s.id, text: `Re-approve ${s.title} (graphic re-made)`, due: s.publishAt, tone: "orange" });
  }
  return out.sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9"));
}

export async function listSlots(event: string): Promise<SlotView[]> {
  const snap = await db().collection(COLLECTION).where("event", "==", event).get();
  return snap.docs.map((d) => view(toSlot(d.id, d.data()))).sort((a, b) => (a.publishAt ?? "").localeCompare(b.publishAt ?? ""));
}

/**
 * What isn't on the calendar yet: each made post (one per variant) and a placeholder for every graphic of the
 * event pack that has no made posts. Something already on the calendar (same graphic + variant, or a
 * placeholder for the graphic) is left out.
 */
export function tray(event: string, slots: Slot[]): TrayItem[] {
  const out: TrayItem[] = [];
  const taken = new Set(slots.filter((s) => s.kind === "post").map((s) => `${s.type}|${s.variant}`));
  for (const p of eventPack()) {
    for (const g of graphics(event, p.key)) {
      const made = madePosts(event, g.key);
      const base = { type: g.key, label: p.label, phase: p.phase, priority: p.priority };
      if (made.length) {
        for (const m of made) {
          if (taken.has(`${g.key}|${m.key}`)) continue;
          // (A placeholder already on the calendar for this graphic picks its made post in its own panel.)
          out.push({ ...base, variant: m.key, title: titleFor(event, g.key, m.key), png: m.png, placeholder: false, templated: false });
        }
      } else if (!taken.has(`${g.key}|`)) {
        out.push({
          ...base,
          variant: "",
          title: titleFor(event, g.key, ""),
          png: "",
          placeholder: true,
          templated: readStatus(event, g.key).stage === "signed_off",
        });
      }
    }
  }
  return out;
}

export function keyDates(event: string): { date: string; label: string }[] {
  try {
    return JSON.parse(fs.readFileSync(EVENTS_JSON, "utf8"))[event]?.dates ?? [];
  } catch {
    return [];
  }
}

export const events = () => listEvents().filter((e) => !e.settingUp);

/** US Eastern wall time ("2026-11-12T08:00") → the real moment (EDT/EST picked by the date). */
export function eastern(local: string): Date {
  for (const off of ["-04:00", "-05:00"]) {
    const d = new Date(`${local.slice(0, 16)}:00${off}`);
    if (Number.isNaN(d.getTime())) break;
    const tz = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
      .formatToParts(d)
      .find((x) => x.type === "timeZoneName")?.value;
    if (tz === `GMT${off.slice(0, 3).replace("-0", "-")}`) return d;
  }
  throw new Error(`Can't read the time ${local}`);
}

async function getSlot(id: string): Promise<Slot> {
  const d = await db().collection(COLLECTION).doc(id).get();
  if (!d.exists) throw new Error("That post isn't on the calendar any more");
  return toSlot(d.id, d.data()!);
}

/** Put something from the tray on the calendar (as a draft). A made post brings its PNG and caption. */
export async function addSlot(event: string, type: string, variant: string, at: string): Promise<string> {
  const made = variant ? madePosts(event, type).find((m) => m.key === variant) : undefined;
  if (variant && !made) throw new Error("That post isn't made any more");
  const ref = await db()
    .collection(COLLECTION)
    .add({
      kind: "post",
      agent: "posts",
      event,
      type,
      variant,
      title: titleFor(event, type, variant),
      status: "draft",
      publishAt: Timestamp.fromDate(eastern(at)),
      caption: made?.caption ?? "",
      slides: made ? [made.png] : [],
      notes: "",
      createdAt: FieldValue.serverTimestamp(),
    });
  return ref.id;
}

/** Edit a draft: time (ET), caption, notes, slides, or pick the made post a placeholder becomes. */
export async function saveSlot(
  id: string,
  patch: { at?: string; caption?: string; notes?: string; slides?: string[]; variant?: string; title?: string; duration?: number },
): Promise<void> {
  const s = await getSlot(id);
  const onlyNotes = Object.keys(patch).every((k) => k === "notes");
  if (s.kind === "post" && s.status !== "draft" && s.status !== "failed" && !onlyNotes) throw new Error("Un-approve it first to change it");
  const up: Record<string, unknown> = {};
  if (patch.title !== undefined && s.kind !== "post") up.title = patch.title.trim() || s.title;
  if (patch.duration !== undefined && s.kind === "work") up.duration = Math.max(0, Math.round(patch.duration));
  if (patch.at !== undefined) up.publishAt = Timestamp.fromDate(eastern(patch.at));
  if (patch.caption !== undefined) up.caption = patch.caption;
  if (patch.notes !== undefined) up.notes = patch.notes;
  if (patch.slides !== undefined) {
    if (patch.slides.some((x) => !/^work\/[\w./ -]+\.png$/.test(x) || !fs.existsSync(path.join(GEN, x)))) throw new Error("Unknown slide");
    up.slides = patch.slides;
  }
  if (patch.variant !== undefined) {
    const m = madePosts(s.event, s.type).find((x) => x.key === patch.variant);
    if (!m) throw new Error("That post isn't made");
    up.variant = m.key;
    up.title = titleFor(s.event, s.type, m.key);
    up.slides = [m.png];
    if (!s.caption.trim()) up.caption = m.caption;
  }
  if (s.kind === "post" && s.status === "failed" && !onlyNotes) up.status = "draft";
  await db().collection(COLLECTION).doc(id).update(up);
}

/**
 * "Spread these": lay a group of made posts over a date range as drafts, `times` per day (ET, e.g.
 * ["12:00", "18:00"]), in the order given, evenly across the days. Returns how many were added.
 */
export async function spread(event: string, type: string, variants: string[], from: string, to: string, times: string[]): Promise<number> {
  const made = madePosts(event, type);
  const picked = variants.map((v) => made.find((m) => m.key === v)).filter((m): m is NonNullable<typeof m> => !!m);
  if (!picked.length) throw new Error("Nothing to spread");
  if (!times.length) throw new Error("Pick at least one time a day");
  const days: string[] = [];
  for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  if (!days.length) throw new Error("The date range is empty");
  const slotsAvail = days.length * times.length;
  if (picked.length > slotsAvail) throw new Error(`${picked.length} posts won't fit in ${slotsAvail} slots: add days or times`);
  // Even spacing: pick `picked.length` of the available slots, spread across the range.
  const all = days.flatMap((day) => times.map((t) => `${day}T${t}`));
  const chosen = picked.map((_, i) => all[Math.floor(((i + 0.5) * all.length) / picked.length)]);
  const batch = db().batch();
  picked.forEach((m, i) =>
    batch.set(db().collection(COLLECTION).doc(), {
      kind: "post",
      agent: "posts",
      event,
      type,
      variant: m.key,
      title: titleFor(event, type, m.key),
      status: "draft",
      publishAt: Timestamp.fromDate(eastern(chosen[i])),
      caption: m.caption,
      slides: [m.png],
      notes: "",
      createdAt: FieldValue.serverTimestamp(),
    }),
  );
  await batch.commit();
  return picked.length;
}

/** A task on the Schedule: an agent's work or something James must do. Agents add theirs through this too. */
export async function addTask(event: string, kind: "work" | "action", agent: string, title: string, at: string, duration: number, notes: string): Promise<string> {
  if (!agents().some((a) => a.id === agent)) throw new Error("Unknown agent");
  if (!title.trim()) throw new Error("Give the task a name");
  const ref = await db()
    .collection(COLLECTION)
    .add({
      kind,
      agent,
      event,
      type: "",
      variant: "",
      title: title.trim(),
      status: "planned",
      publishAt: Timestamp.fromDate(eastern(at)),
      duration: Math.max(0, Math.round(duration || 0)),
      caption: "",
      slides: [],
      notes,
      createdAt: FieldValue.serverTimestamp(),
    });
  return ref.id;
}

export async function setDone(id: string, done: boolean): Promise<void> {
  const s = await getSlot(id);
  if (s.kind === "post") throw new Error("Posts are approved, not ticked");
  await db().collection(COLLECTION).doc(id).update({ status: done ? "done" : "planned", doneAt: done ? FieldValue.serverTimestamp() : FieldValue.delete() });
}

async function uploadHidden(slide: string, env: Record<string, string>): Promise<string> {
  const src = path.join(GEN, slide);
  const jpg = path.join(os.tmpdir(), `pickem-sched-${process.pid}-${Date.now()}.jpg`);
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "92", src, "--out", jpg], { stdio: "ignore" });
  const form = new FormData();
  form.set("published", "false");
  form.set("access_token", env.META_PAGE_TOKEN);
  form.set("source", new Blob([fs.readFileSync(jpg)], { type: "image/jpeg" }), path.basename(jpg));
  fs.rmSync(jpg, { force: true });
  const r = await (await fetch(`${GRAPH}${env.META_PAGE_ID}/photos`, { method: "POST", body: form })).json();
  if (r.error) throw new Error(`Facebook upload: ${r.error.message}`);
  return r.id as string;
}

async function deleteHidden(ids: string[]) {
  if (!ids.length) return;
  const env = metaEnv();
  await Promise.all(ids.map((id) => fetch(`${GRAPH}${id}?access_token=${env.META_PAGE_TOKEN}`, { method: "DELETE" }).catch(() => null)));
}

/** Approve: refuse while anything blocks, then upload the slides as hidden Page photos and mark it approved. */
export async function approve(id: string): Promise<void> {
  const s = await getSlot(id);
  if (s.status !== "draft") throw new Error("Only a draft can be approved");
  const v = view(s);
  const blocks = v.checks.filter((c) => c.level === "block");
  if (blocks.length) throw new Error(`Can't approve yet: ${blocks.map((b) => b.text).join("; ")}`);
  const env = metaEnv();
  const fbPhotoIds: string[] = [];
  try {
    for (const slide of s.slides) fbPhotoIds.push(await uploadHidden(slide, env));
  } catch (e) {
    await deleteHidden(fbPhotoIds);
    throw e;
  }
  await db()
    .collection(COLLECTION)
    .doc(id)
    .update({
      status: "approved",
      fbPhotoIds,
      slidesStamp: stamp(s.slides),
      approvedBy: "James",
      approvedAt: FieldValue.serverTimestamp(),
      error: FieldValue.delete(),
    });
}

/** Back to draft (only while it hasn't started sending); its hidden photos are removed from the Page. */
/**
 * Move an approved post to a new time without un-approving it (James 25 Oct 2026: drag it on the calendar, confirm).
 * Safe because the posting job (pickem-paintball-scheduler/functions/postScheduler.js) reads publishAt on every pass.
 * Only while it's still "approved" (not sending / posted), and never to a time under 10 minutes away, so a drag can't
 * make a post go out by accident.
 */
export async function moveApproved(id: string, at: string): Promise<void> {
  const when = eastern(at);
  if (when.getTime() < Date.now() + 10 * 60 * 1000) throw new Error("That time has passed (or is under 10 minutes away): pick a later day");
  const ref = db().collection(COLLECTION).doc(id);
  await db().runTransaction(async (tx) => {
    const d = await tx.get(ref);
    if ((d.get("kind") ?? "post") !== "post" || d.get("status") !== "approved") throw new Error("Only an approved post that hasn't gone out can be moved this way");
    tx.update(ref, { publishAt: Timestamp.fromDate(when), movedAt: FieldValue.serverTimestamp() });
  });
}

/**
 * Change an approved post's caption without un-approving it (James 25 Oct 2026: edit captions on every post in the
 * calendar). Safe because the posting job reads the caption when it sends. Only while it's still "approved".
 */
export async function captionApproved(id: string, caption: string): Promise<void> {
  if (caption.length > 2200) throw new Error("Instagram allows 2,200 characters at most");
  const ref = db().collection(COLLECTION).doc(id);
  await db().runTransaction(async (tx) => {
    const d = await tx.get(ref);
    if ((d.get("kind") ?? "post") !== "post" || d.get("status") !== "approved") throw new Error("Only an approved post that hasn't gone out can be changed this way");
    tx.update(ref, { caption, captionEditedAt: FieldValue.serverTimestamp() });
  });
}

export async function unapprove(id: string): Promise<void> {
  const ref = db().collection(COLLECTION).doc(id);
  const ids = await db().runTransaction(async (tx) => {
    const d = await tx.get(ref);
    if (d.get("status") !== "approved") throw new Error("Only an approved post that hasn't gone out can be un-approved");
    tx.update(ref, { status: "draft", fbPhotoIds: [], approvedAt: FieldValue.delete(), slidesStamp: "" });
    return (d.get("fbPhotoIds") as string[]) ?? [];
  });
  await deleteHidden(ids);
}

/** Send at the cloud job's next pass (within 5 minutes). */
export async function postNow(id: string): Promise<void> {
  const s = await getSlot(id);
  if (s.status !== "approved") throw new Error("Approve it first");
  await db().collection(COLLECTION).doc(id).update({ publishAt: Timestamp.now() });
}

export async function removeSlot(id: string): Promise<void> {
  const s = await getSlot(id);
  if (s.kind === "post" && (s.status === "sending" || s.status === "posted")) throw new Error("It has gone out (or is going out), so it stays on the calendar");
  if (s.status === "approved") await unapprove(id);
  await db().collection(COLLECTION).doc(id).delete();
}

/**
 * Generator step 5 (James, 18 Oct): approve the caption + time there, so a finished post never becomes a
 * "needs you" item on the Schedule. What step 5 shows for one graphic: its made posts with captions, which are
 * already on the Schedule, and a recommended time.
 */
export async function forGraphic(event: string, type: string) {
  const posts = madePosts(event, type);
  const snap = await db().collection(COLLECTION).where("event", "==", event).where("type", "==", type).get();
  const scheduled: Record<string, { id: string; status: SlotStatus; publishAt: string | null }> = {};
  for (const d of snap.docs) {
    const s = toSlot(d.id, d.data());
    if (s.kind === "post" && s.variant) scheduled[s.variant] = { id: s.id, status: s.status, publishAt: s.publishAt };
  }
  const all = (await db().collection(COLLECTION).where("event", "==", event).get()).docs.map((d) => toSlot(d.id, d.data()));
  const rec = recommend(event, type, all, Math.max(1, posts.length));
  return { posts, scheduled, recommend: rec.slots, why: rec.why };
}

const toET = (iso: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};

/**
 * A recommended time (ET "YYYY-MM-DDTHH:MM") for the next n posts of a graphic. Until the social media agent
 * plans the event's content calendar, a plain rule: the next free noon / 6 PM slots, at most two posts a day,
 * kept in the graphic's window (pre-event posts before the picks lock, live posts on event days, post-event
 * posts after the last day). The agent's plan will replace this; the buttons stay the same.
 */
export function recommend(event: string, type: string, slots: Slot[], n = 1): { slots: string[]; why: string } {
  const phase = packItem(type)?.phase ?? "";
  const dates = keyDates(event);
  const lock = dates.find((d) => /lock/i.test(d.label))?.date;
  const eventDays = dates.filter((d) => /event day|finals day/i.test(d.label)).map((d) => d.date).sort();
  const first = eventDays[0], last = eventDays[eventDays.length - 1];
  const today = toET(new Date().toISOString()).slice(0, 10);
  let from = today, to = "";
  let why = "next free noon / 6 PM slot";
  if (/pre/i.test(phase) && lock) {
    to = lock;
    why += ` before the picks lock (${lock})`;
    // Picks CTAs (countdown) only make sense once picks are open.
    const open = dates.find((d) => /picks open/i.test(d.label))?.date;
    if (baseOf(type) === "countdown" && open && open > from) {
      from = open;
      why += `, from picks open (${open})`;
    }
  } else if (/live/i.test(phase) && first && last) {
    from = first > today ? first : today;
    to = last;
    why += ` on an event day (${first} – ${last})`;
  } else if (/post/i.test(phase) && last) {
    const d = new Date(`${last}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    from = d.toISOString().slice(0, 10) > today ? d.toISOString().slice(0, 10) : today;
    why += ` after the event (from ${from})`;
  }
  const taken = new Set(slots.filter((s) => s.kind === "post" && s.publishAt).map((s) => toET(s.publishAt!)));
  const perDay: Record<string, number> = {};
  taken.forEach((t) => (perDay[t.slice(0, 10)] = (perDay[t.slice(0, 10)] ?? 0) + 1));
  const nowET = toET(new Date().toISOString());
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  for (let i = 0; i < 120 && out.length < n; i++) {
    const day = d.toISOString().slice(0, 10);
    if (to && day > to) break;
    for (const t of ["12:00", "18:00"]) {
      const at = `${day}T${t}`;
      if (at <= nowET || taken.has(at) || (perDay[day] ?? 0) >= 2) continue;
      out.push(at);
      taken.add(at);
      perDay[day] = (perDay[day] ?? 0) + 1;
      if (out.length >= n) break;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  if (!out.length) why = "no free slot in the window: pick a time";
  return { slots: out, why: `${why} (the social media agent's plan will replace this rule)` };
}

/**
 * Generator step 5: approve a finished post with its caption and time in one go. Reuses a draft already on the
 * Schedule for the same post (so nothing doubles up). `at` null = post now (the cloud job's next pass).
 */
export async function scheduleApproved(event: string, type: string, variant: string, at: string | null, caption: string): Promise<string> {
  const made = madePosts(event, type).find((m) => m.key === variant);
  if (!made) throw new Error("That post isn't made");
  const existing = (await db().collection(COLLECTION).where("event", "==", event).where("type", "==", type).get()).docs
    .map((d) => toSlot(d.id, d.data()))
    .find((s) => s.kind === "post" && s.variant === variant);
  if (existing && existing.status !== "draft" && existing.status !== "failed") throw new Error(`Already on the Schedule (${existing.status}); change it there`);
  const publishAt = at ? Timestamp.fromDate(eastern(at)) : Timestamp.now();
  let id: string;
  if (existing) {
    id = existing.id;
    await db().collection(COLLECTION).doc(id).update({ publishAt, caption, slides: [made.png], status: "draft", error: FieldValue.delete() });
  } else {
    id = (
      await db().collection(COLLECTION).add({
        kind: "post",
        agent: "posts",
        event,
        type,
        variant,
        title: titleFor(event, type, variant),
        status: "draft",
        publishAt,
        caption,
        slides: [made.png],
        notes: "",
        createdAt: FieldValue.serverTimestamp(),
      })
    ).id;
  }
  await approve(id);
  return id;
}

/** Generator step 5: "Approve all + spread": lay the posts out, then approve each (uploads its hidden photo). */
export async function spreadApproved(event: string, type: string, variants: string[], from: string, to: string, times: string[]): Promise<number> {
  const before = new Set((await db().collection(COLLECTION).where("event", "==", event).where("type", "==", type).get()).docs.map((d) => d.id));
  const n = await spread(event, type, variants, from, to, times);
  const after = (await db().collection(COLLECTION).where("event", "==", event).where("type", "==", type).get()).docs.filter((d) => !before.has(d.id));
  const failed: string[] = [];
  for (const d of after) {
    try {
      await approve(d.id);
    } catch (e) {
      failed.push(`${d.get("title")}: ${(e as Error).message}`);
    }
  }
  if (failed.length) throw new Error(`${n - failed.length} approved; ${failed.length} left as drafts on the Schedule: ${failed.join("; ")}`);
  return n;
}

/** Every made post of the event, for adding carousel slides. */
export function eventPosts(event: string): { png: string; title: string }[] {
  const out: { png: string; title: string }[] = [];
  for (const p of eventPack())
    for (const g of graphics(event, p.key)) for (const m of madePosts(event, g.key)) out.push({ png: m.png, title: titleFor(event, g.key, m.key) });
  return out;
}
