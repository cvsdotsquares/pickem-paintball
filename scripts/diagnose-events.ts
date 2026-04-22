import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

async function main() {
  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault(), projectId: "fantasy-paintball" });
  }
  const db = getFirestore();
  const snap = await db.collection("events").get();
  const rows: Array<{ id: string; lock: Date | null; ends: Date | null; status: string | null }> = [];
  for (const d of snap.docs) {
    const data = d.data();
    const lock = data.lockDate?.toDate?.() ?? (typeof data.lockDate === "string" ? new Date(data.lockDate) : null);
    const ends = data.eventEndsAt?.toDate?.() ?? null;
    const status = typeof data.status === "string" ? data.status : null;
    rows.push({ id: d.id, lock: lock && !isNaN(lock.getTime()) ? lock : null, ends, status });
  }
  rows.sort((a, b) => {
    const al = a.lock?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bl = b.lock?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return al - bl;
  });
  for (const r of rows) {
    console.log(`${r.id.padEnd(28)} lock=${r.lock?.toISOString() ?? "—"} ends=${r.ends?.toISOString() ?? "—"} status=${r.status}`);
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
