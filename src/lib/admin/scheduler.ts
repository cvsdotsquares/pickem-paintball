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
 */

export type SlotStatus = "draft" | "approved" | "sending" | "posted" | "failed";
export type Slot = {
  id: string;
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
  preview: string[]; // slides, or the generator's current preview for a placeholder
  data: { source: string; madeAt: string; test: boolean; typed: Record<string, string>; waiting: { label: string; hint: string }[] };
  variants: { key: string; name: string; png: string; caption: string }[]; // made posts of this graphic to pick from
  checks: Check[];
  link: string; // the graphic's Post Generator page
};
export type TrayItem = {
  type: string;
  variant: string;
  title: string;
  label: string;
  phase: string;
  priority: string;
  png: string; // "" for a placeholder
  placeholder: boolean;
};

const COLLECTION = "scheduledPosts";
const GRAPH = "https://graph.facebook.com/v26.0/";
const EVENTS_JSON = path.join(HUB, "scheduler", "events.json");
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
  if (stage !== "signed_off") block("Template not signed off yet (Post Generator)");
  if (!s.slides.length) block("Final post not made yet (Populate in the Post Generator)");
  for (const sl of s.slides) if (!fs.existsSync(path.join(GEN, sl))) block(`Slide missing on disk: ${path.basename(path.dirname(sl))}`);
  if (s.slides.length > 10) block("Instagram carousels take at most 10 slides");
  if (data.test) block("Made with stand-in (test) data");
  for (const w of data.waiting) block(`Waiting on ${w.label}${w.hint ? ` (${w.hint})` : ""}`);
  if (s.slides.length && !s.caption.trim()) block("No caption");
  if (s.caption.length > 2200) block(`Caption too long for Instagram (${s.caption.length}/2,200)`);
  if ((s.caption.match(/#\w+/g) ?? []).length > 30) block("More than 30 hashtags (Instagram limit)");
  if (!s.publishAt) block("No time set");
  else if (s.status === "draft" && new Date(s.publishAt).getTime() < Date.now()) block("The time has passed: pick a new one");
  const typed = Object.entries(data.typed).filter(([, v]) => v);
  if (typed.length) warn(`Uses typed-in numbers (${typed.map(([k, v]) => `${k.replace(/_/g, " ")}: ${showTyped(v)}`).join(", ")}). Populate again once Pick'Em has the real ones`);
  if (s.status === "approved" && s.slidesStamp && s.slidesStamp !== stamp(s.slides))
    warn("The graphic was re-made after you approved it. Un-approve and approve again to send the new version");
  if (s.status === "draft" && !out.some((c) => c.level === "block")) warn("Ready: approve to schedule");
  return out;
}

function view(s: Slot): SlotView {
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
  };
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
  const taken = new Set(slots.map((s) => `${s.type}|${s.variant}`));
  for (const p of eventPack()) {
    for (const g of graphics(event, p.key)) {
      const made = madePosts(event, g.key);
      const base = { type: g.key, label: p.label, phase: p.phase, priority: p.priority };
      if (made.length) {
        for (const m of made) {
          if (taken.has(`${g.key}|${m.key}`)) continue;
          // (A placeholder already on the calendar for this graphic picks its made post in its own panel.)
          out.push({ ...base, variant: m.key, title: titleFor(event, g.key, m.key), png: m.png, placeholder: false });
        }
      } else if (!taken.has(`${g.key}|`)) {
        out.push({ ...base, variant: "", title: titleFor(event, g.key, ""), png: "", placeholder: true });
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
  patch: { at?: string; caption?: string; notes?: string; slides?: string[]; variant?: string },
): Promise<void> {
  const s = await getSlot(id);
  const onlyNotes = Object.keys(patch).every((k) => k === "notes");
  if (s.status !== "draft" && s.status !== "failed" && !onlyNotes) throw new Error("Un-approve it first to change it");
  const up: Record<string, unknown> = {};
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
  if (s.status === "failed" && !onlyNotes) up.status = "draft";
  await db().collection(COLLECTION).doc(id).update(up);
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
  if (s.status === "sending" || s.status === "posted") throw new Error("It has gone out (or is going out), so it stays on the calendar");
  if (s.status === "approved") await unapprove(id);
  await db().collection(COLLECTION).doc(id).delete();
}

/** Every made post of the event, for adding carousel slides. */
export function eventPosts(event: string): { png: string; title: string }[] {
  const out: { png: string; title: string }[] = [];
  for (const p of eventPack())
    for (const g of graphics(event, p.key)) for (const m of madePosts(event, g.key)) out.push({ png: m.png, title: titleFor(event, g.key, m.key) });
  return out;
}
