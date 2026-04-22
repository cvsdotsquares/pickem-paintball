import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

async function main() {
  const email = process.argv[2];
  const eventId = process.argv[3];
  if (!email || !eventId) {
    console.error("usage: tsx scripts/diagnose-mvp.ts <email> <eventId>");
    process.exit(1);
  }
  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault(), projectId: "fantasy-paintball" });
  }
  const db = getFirestore();
  const auth = getAuth();
  const uid = (await auth.getUserByEmail(email)).uid;

  const userSnap = await db.collection("users").doc(uid).get();
  const picks = (userSnap.get(`pickems.${eventId}`) ?? []) as string[];

  const playersSnap = await db.collection(`events/${eventId}/players`).get();
  const byId = new Map<string, { name: string; kills: number; team: string }>();
  let leaderId: string | null = null;
  let maxKills = -1;
  for (const p of playersSnap.docs) {
    const kills = Number(p.get("Confirmed Kills") ?? 0);
    const name = String(p.get("Player") ?? "");
    const team = String(p.get("Team") ?? "");
    byId.set(p.id, { name, kills, team });
    if (kills > maxKills) { maxKills = kills; leaderId = p.id; }
  }

  console.log(`\nUser ${email} picks for ${eventId}:\n`);
  const enriched = picks.map((pid) => ({ pid, ...byId.get(pid) }));
  enriched.sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0));
  for (const p of enriched) {
    console.log(`  [${p.pid}] ${p.name ?? "(unknown)"} (${p.team ?? ""}) — ${p.kills ?? "?"} kills`);
  }
  console.log(`\nKill leader: [${leaderId}] ${leaderId ? byId.get(leaderId)?.name : "—"} — ${maxKills} kills`);
  console.log(`\nLeader in picks? ${picks.includes(leaderId ?? "") ? "YES" : "no"}`);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
