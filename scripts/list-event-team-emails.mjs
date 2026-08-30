import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault(), projectId: "fantasy-paintball" });
}
const db = getFirestore();

function toDate(v) {
  if (v == null) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;
  return null;
}

const targetArg = process.argv[2]; // optional event id

const eventsSnap = await db.collection("events").get();
const events = eventsSnap.docs.map((d) => {
  const data = d.data();
  return {
    id: d.id,
    name: data.name || d.id,
    year: Number(data.year) || 0,
    status: data.status || "",
    lockDate: toDate(data.lockDate),
  };
});

// Sort by year then lockDate ascending; most recent = last
events.sort((a, b) => {
  if (a.year !== b.year) return a.year - b.year;
  const al = a.lockDate ? a.lockDate.getTime() : 0;
  const bl = b.lockDate ? b.lockDate.getTime() : 0;
  return al - bl;
});

console.error("All events (oldest→newest):");
for (const e of events) {
  console.error(`  ${e.id} | ${e.name} | year=${e.year} | lock=${e.lockDate ? e.lockDate.toISOString() : "unset"} | status=${e.status}`);
}

const target = targetArg
  ? events.find((e) => e.id === targetArg)
  : events[events.length - 1];

if (!target) {
  console.error("No target event found");
  process.exit(1);
}
console.error(`\n=== Most recent event: ${target.id} (${target.name}) ===\n`);

const usersSnap = await db.collection("users").get();
const rows = [];
for (const doc of usersSnap.docs) {
  const u = doc.data();
  const pickems = u.pickems || {};
  const picks = pickems[target.id];
  if (Array.isArray(picks) && picks.length > 0) {
    const email = u.email || u.emailAddress || "";
    rows.push({ email, name: u.name || u.displayName || "", uid: doc.id, count: picks.length });
  }
}

rows.sort((a, b) => (a.email || "").localeCompare(b.email || ""));
console.error(`Users with a team for ${target.id}: ${rows.length}\n`);
for (const r of rows) {
  console.log(r.email || `(no-email uid:${r.uid})`);
}
console.error(`\nTotal: ${rows.length}`);
