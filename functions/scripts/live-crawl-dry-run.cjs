/**
 * Read-only readiness check for the live crawl, against real Firestore and live pbleagues.
 *
 *   cd functions && node scripts/live-crawl-dry-run.cjs 9322
 *
 * Needs Application Default Credentials for fantasy-paintball
 * (`gcloud auth application-default login`). WRITES NOTHING: it finds the Pick'Em event
 * whose pbleaguesId is the one given, checks the fields index.js schedules the crawl from,
 * maps the event's players onto clubs the way deriveAppearances does, resolves every Pro
 * team against the live vocabulary, then runs crawlLiveEvent with observeOnly.
 */
const admin = require("firebase-admin");
const { crawlLiveEvent, fetchText } = require("../liveEvent");
const { parseRankings, resolveClub } = require("../pbleagues");
const { loadHistory } = require("../nxlEventsStore");

const pbleaguesId = String(process.argv[2] || "");
if (!pbleaguesId) {
  console.error("usage: node scripts/live-crawl-dry-run.cjs <pbleagues id>");
  process.exit(1);
}

admin.initializeApp({ projectId: "fantasy-paintball" });
const db = admin.firestore();
const iso = (t) => (t && typeof t.toDate === "function" ? t.toDate().toISOString() : `UNSET (${t})`);

(async () => {
  const events = await db.collection("events").get();
  const matches = events.docs.filter(
    (d) => String(d.get("pbleaguesId") || "") === pbleaguesId || String(d.get("pbleaugesId") || "") === pbleaguesId,
  );
  if (matches.length !== 1) {
    console.error(`❌ ${matches.length} events carry pbleaguesId ${pbleaguesId}: ${matches.map((d) => d.id).join(", ")}`);
    if (!matches.length) process.exit(1);
  }
  const ev = matches[0];
  const lock = ev.get("lockDate");
  const ends = ev.get("eventEndsAt");
  console.log(`\n== Event ${ev.id}`);
  console.log(`name         ${ev.get("name")}`);
  console.log(`pbleaguesId  ${JSON.stringify(ev.get("pbleaguesId"))}${ev.get("pbleaugesId") ? `  ⚠️ also pbleaugesId=${JSON.stringify(ev.get("pbleaugesId"))}` : ""}`);
  console.log(`lockDate     ${iso(lock)}`);
  console.log(`eventEndsAt  ${iso(ends)}`);
  const start = lock && lock.toDate ? lock.toDate().toISOString().slice(0, 10) : null;
  const label = ev.get("name") || ev.id;
  console.log(`→ crawl key  ${start ? start.slice(0, 4) : "?"}|${label}   start ${start}`);
  const cfg = (await db.doc("projections/liveEvent").get()).data() || {};
  console.log(`projections/liveEvent  ${JSON.stringify(cfg)}`);

  /* Other events whose window would overlap: index.js crawls only the first to end. */
  const overlap = events.docs.filter((d) => {
    if (d.id === ev.id || !d.get("lockDate") || !d.get("eventEndsAt") || !lock || !ends) return false;
    return d.get("lockDate").toMillis() < ends.toMillis() && d.get("eventEndsAt").toMillis() > lock.toMillis();
  });
  if (overlap.length) console.log(`⚠️ overlapping windows: ${overlap.map((d) => d.id).join(", ")}`);

  const history = await loadHistory(db);
  const clubs = [...new Set(history.events.flatMap((e) => Object.keys(e.teams || {})))].sort(
    (a, b) => b.length - a.length,
  );
  const clubByTeamId = new Map(Object.entries(history.clubTeamId || {}).map(([c, id]) => [id, c]));

  console.log(`\n== Players by team_id (events/${ev.id}/players)`);
  const players = await db.collection(`events/${ev.id}/players`).get();
  const byTeam = new Map();
  for (const d of players.docs) {
    const t = d.get("team_id");
    if (!byTeam.has(t)) byTeam.set(t, { n: 0, noLeague: 0 });
    byTeam.get(t).n++;
    if (!String(d.get("league_id") || "").trim()) byTeam.get(t).noLeague++;
  }
  for (const [t, v] of [...byTeam].sort()) {
    const club = clubByTeamId.get(t);
    console.log(`${String(t).padEnd(6)} ${String(v.n).padStart(3)} players  ${club ? `→ ${club}` : "❌ no club in clubTeamId"}${v.noLeague ? `  (${v.noLeague} without league_id, skipped)` : ""}`);
  }

  console.log(`\n== Pro teams on /event/${pbleaguesId}/rankings → club (vocabulary of ${clubs.length})`);
  const rk = parseRankings(await fetchText(`/event/${pbleaguesId}/rankings`));
  for (const t of rk.tables) {
    console.log(`-- ${t.division}`);
    for (const r of t.rows) {
      const club = resolveClub(r.team, clubs);
      const id = club && history.clubTeamId[club];
      console.log(`${r.team.padEnd(24)} → ${club || "UNRESOLVED"}${club ? `  (${clubs.includes(club) ? "in history" : "NEW"}, team_id ${id || "none"})` : ""}`);
    }
  }

  console.log(`\n== crawlLiveEvent observeOnly`);
  const result = await crawlLiveEvent(db, { eventId: ev.id, pbleaguesId, label, start, observeOnly: true });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
