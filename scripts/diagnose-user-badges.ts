/* Diagnose what badges a user *should* have vs what's stored. */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("usage: tsx scripts/diagnose-user-badges.ts <email>");
    process.exit(1);
  }
  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "fantasy-paintball",
    });
  }
  const auth = getAuth();
  const db = getFirestore();
  const userRecord = await auth.getUserByEmail(email);
  const uid = userRecord.uid;
  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.data() ?? {};
  const pickems = (userData.pickems ?? {}) as Record<string, unknown>;

  console.log(`\n=== USER ${email} (${uid}) ===\n`);
  console.log("Stored badges:", JSON.stringify(userData.badges ?? {}, null, 2));
  console.log("\nPickem keys:", Object.keys(pickems));

  // Events
  const eventsSnap = await db.collection("events").get();
  const events: Array<{ id: string; end: Date | null; mvpId: string | null; mvpKills: number; mvpName: string }> = [];
  for (const ev of eventsSnap.docs) {
    const d = ev.data();
    const end = d.eventEndsAt?.toDate?.() ?? null;
    const playersSnap = await db.collection(`events/${ev.id}/players`).get();
    let mvpId: string | null = null;
    let max = -1;
    let mvpName = "";
    for (const p of playersSnap.docs) {
      const k = Number(p.get("Confirmed Kills") ?? 0);
      if (k > max) { max = k; mvpId = p.id; mvpName = String(p.get("Player") ?? ""); }
    }
    events.push({ id: ev.id, end, mvpId, mvpKills: max, mvpName });
  }
  events.sort((a, b) => (a.end?.getTime() ?? 0) - (b.end?.getTime() ?? 0));

  console.log("\n=== EVENT-BY-EVENT ===");
  for (const ev of events) {
    const picks = pickems[ev.id];
    const played = Array.isArray(picks) && picks.length > 0;
    const rankRaw = userData[`${ev.id}Rank`];
    const pts = userData[`${ev.id}PTS`];
    const mvpHit = played && ev.mvpId && (picks as string[]).includes(ev.mvpId);
    console.log(
      `  ${ev.id.padEnd(30)} played=${played ? "Y" : "n"} rank=${String(rankRaw ?? "-").padStart(5)} pts=${String(pts ?? "-").padStart(5)} mvp=${mvpHit ? "✓" : " "} (kill leader: ${ev.mvpName} ${ev.mvpKills}k)`
    );
  }

  console.log("\n=== SEASON RANKS (from leaderboards/season_YYYY) ===");
  for (const year of ["2025", "2026"]) {
    const snap = await db.collection("leaderboards").doc(`season_${year}`).get();
    if (!snap.exists) { console.log(`  ${year}: (no doc)`); continue; }
    const users = (snap.get("users") ?? []) as Array<Record<string, unknown>>;
    const me = users.find((u) => u.id === uid);
    console.log(`  ${year}: ${me ? `rank=${me.seasonRank}` : "(not in list)"}`);
  }

  console.log("\n=== USER DOC seasonRank field ===");
  console.log("  seasonRank:", userData.seasonRank);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
