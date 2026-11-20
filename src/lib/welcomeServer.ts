import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Timestamp } from "firebase-admin/firestore";
import { selectCurrentEvent, type EventRecord } from "@/src/lib/currentEvent";
import { currencyForRegion } from "@/src/lib/regionCurrency";

/**
 * The welcome series' instant start (James, 4 Nov 2026). On a confirmed player's first logged-in visit the site sends
 * Klaviyo "Confirmed Sign-up" with what the emails fill in; that metric starts the welcome flow. The email agent's
 * sync (agents/email/welcome.py) is the safety net: anyone not welcomed 10 minutes after signing up gets the same
 * event from there. Both claim users/{uid}.welcomedAt first, so nobody is welcomed twice (and the flow allows no re-entry).
 *
 * Switch: WELCOME_EMAILS = off (default) | seeds (only AUTH_EMAILS_SEEDS) | on; WELCOME_LAUNCH_AT = ISO time: accounts
 * created before it never get the series. Keep these in step with agents/email/flows/welcome.json (mode, launch_at).
 */

export const WELCOME_METRIC = "Confirmed Sign-up";
const ET = "America/New_York";

export type WelcomeResult = { welcomed: boolean; final: boolean; why?: string };

function seeds(): string[] {
  return (process.env.AUTH_EMAILS_SEEDS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
}

/** 'james' / 'JAMES' → 'James'; mixed case left as typed. Same rule as the sync's tidy_name. */
export function tidyName(name: string): string {
  const n = name.split(/\s+/).filter(Boolean).join(" ");
  if (!n || (n !== n.toLowerCase() && n !== n.toUpperCase())) return n;
  return n.toLowerCase().replace(/(^|[\s'\-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

const day = (t?: Timestamp | null) =>
  t ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: ET }).format(t.toDate()) : "";

/** open (picks being made) / locked (event being played) / off, and the names and dates the emails show. */
export async function picksWindow(now = Date.now()) {
  const snap = await getFirestore().collection("events").get();
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EventRecord);
  const ev = selectCurrentEvent(all) as (EventRecord & Record<string, Timestamp | string | undefined>) | null;
  const ts = (k: string) => (ev?.[k] as Timestamp | undefined) ?? null;
  const prev = all.find((e) => (e as { next_event_id?: string }).next_event_id === ev?.id) as Record<string, unknown> | undefined;
  const opened = (prev?.nextPicksOpenAt as Timestamp | undefined) ?? null;
  const lock = ts("lockDate")?.toMillis() ?? null;
  const end = ts("eventEndsAt")?.toMillis() ?? null;
  const info = {
    event_name: String(ev?.name ?? ""),
    lock: day(ts("lockDate")),
    next_event_name: String(ev?.nextEventName ?? ""),
    next_picks_open: day(ts("nextPicksOpenAt")),
  };
  if (lock && now < lock && (!opened || now >= opened.toMillis())) return { phase: "open", ...info };
  if (lock && end && lock <= now && now < end) return { phase: "locked", ...info };
  if (lock && now < lock) return { phase: "off", ...info, next_event_name: info.event_name, next_picks_open: day(opened) };
  return { phase: "off", ...info };
}

export async function sendWelcome(uid: string, signInProvider?: string): Promise<WelcomeResult> {
  const mode = process.env.WELCOME_EMAILS || "off";
  if (mode === "off" || !process.env.KLAVIYO_PRIVATE_KEY) return { welcomed: false, final: false, why: "off" };
  const user = await getAuth().getUser(uid);
  const email = (user.email || "").toLowerCase();
  const launch = process.env.WELCOME_LAUNCH_AT ? Date.parse(process.env.WELCOME_LAUNCH_AT) : Infinity;
  if (Date.parse(user.metadata.creationTime) < launch) return { welcomed: false, final: true, why: "signed up before launch" };
  if (!user.emailVerified && signInProvider !== "google.com") return { welcomed: false, final: false, why: "email not confirmed" };
  if (mode === "seeds" && !seeds().includes(email)) return { welcomed: false, final: false, why: "seeds only" };

  const db = getFirestore();
  const ref = db.collection("users").doc(uid);
  const claimed = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const d = doc.data() || {};
    if (d.welcomedAt) return { ok: false, why: "already welcomed", final: true };
    if (!d.email) return { ok: false, why: "sign-up not finished", final: false };
    tx.set(ref, { welcomedAt: Date.now(), welcomedBy: "site" }, { merge: true });
    return { ok: true, data: d, final: true };
  });
  if (!claimed.ok) return { welcomed: false, final: claimed.final, why: claimed.why };

  const d = claimed.data as Record<string, unknown>;
  try {
    const w = await picksWindow();
    const cur = String(d.lastCurrency || "") || (d.lastCountry ? currencyForRegion(String(d.lastCountry)) : "");
    const first = tidyName(String(d.firstName || ""));
    const res = await fetch("https://a.klaviyo.com/api/events", {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
        revision: "2024-10-15",
        accept: "application/vnd.api+json",
        "content-type": "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "event",
          attributes: {
            properties: { picks_phase: w.phase, source: "site" },
            metric: { data: { type: "metric", attributes: { name: WELCOME_METRIC } } },
            profile: {
              data: {
                type: "profile",
                attributes: {
                  email,
                  ...(first ? { first_name: first } : {}),
                  properties: {
                    pickem_user_id: uid,
                    signed_up_at: new Date(user.metadata.creationTime).toISOString(),
                    picks_phase: w.phase,
                    event_name: w.event_name,
                    lock: w.lock,
                    next_event_name: w.next_event_name,
                    next_picks_open: w.next_picks_open,
                    welcome_entered_at: new Date().toISOString(),
                    ...(cur ? { currency: cur } : {}),
                  },
                },
              },
            },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`Klaviyo ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return { welcomed: true, final: true };
  } catch (err) {
    // release the claim so the sync's safety net welcomes them instead; log for the daily health check
    await ref.set({ welcomedAt: null, welcomedBy: null }, { merge: true }).catch(() => undefined);
    console.error("[welcome] failed", err);
    await db.collection("welcomeErrors").add({
      uid,
      message: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      createdAt: Date.now(),
    }).catch(() => undefined);
    return { welcomed: false, final: false, why: "send failed" };
  }
}
