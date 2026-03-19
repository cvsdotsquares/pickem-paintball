/**
 * Export picks as long dataset: user, pick (player name), team
 * Run: GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json" node functions/export-picks-long.js [eventId]
 * If eventId omitted, uses the live event (status === "live").
 * Outputs .xlsx to project root, then copies to ~/Downloads.
 */
const admin = require('firebase-admin');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'fantasy-paintball' });
}
const db = admin.firestore();

function getUsername(data, uid) {
  return (
    data?.username?.trim() ||
    (data?.firstName && data?.lastName ? `${data.firstName} ${data.lastName}`.trim() : null) ||
    data?.name?.trim() ||
    data?.displayName?.trim() ||
    data?.email?.split('@')[0] ||
    uid
  );
}

async function main() {
  let eventId = process.argv[2];

  if (!eventId) {
    const eventsSnap = await db.collection('events').get();
    const live = eventsSnap.docs.find(d => d.data().status === 'live');
    if (!live) {
      console.error('No live event found. Pass eventId as argument, e.g. tampa_bay_2026');
      process.exit(1);
    }
    eventId = live.id;
    console.error(`Using live event: ${eventId}\n`);
  }

  // 1. Build player lookup (player_id -> { Player, Team })
  const playersSnap = await db.collection(`events/${eventId}/players`).get();
  const playerMap = {};
  playersSnap.docs.forEach(doc => {
    const d = doc.data();
    playerMap[doc.id] = {
      Player: d['Player'] || d.Player || 'Unknown',
      Team: d['Team'] || d.Team || 'Unknown',
    };
  });

  // 2. Get all users with official picks for this event (exclude draft-only)
  const usersSnap = await db.collection('users')
    .where(`pickems.${eventId}`, '!=', null)
    .get();

  const rows = [];

  usersSnap.docs.forEach(userDoc => {
    const data = userDoc.data();
    const pickems = data.pickems || {};
    const playerIds = Array.isArray(pickems[eventId]) ? pickems[eventId] : [];
    if (playerIds.length === 0) return;

    const username = getUsername(data, userDoc.id);

    playerIds.forEach(pid => {
      const pidStr = String(pid);
      const info = playerMap[pidStr] || { Player: pidStr, Team: 'Unknown' };
      rows.push({
        user: username,
        pick: info.Player,
        team: info.Team,
      });
    });
  });

  // 3. Output XLSX
  const headers = ['user', 'pick', 'team'];
  const sheetData = [headers, ...rows.map(r => [r.user, r.pick, r.team])];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(wb, ws, 'Picks');

  const outPath = path.join(process.cwd(), `picks-long-${eventId}.xlsx`);
  const downloadsPath = path.join(process.env.HOME || process.env.USERPROFILE, 'Downloads', `picks-long-${eventId}.xlsx`);

  XLSX.writeFile(wb, outPath);
  fs.copyFileSync(outPath, downloadsPath);

  console.log(`Wrote ${rows.length} rows to ${outPath}`);
  console.log(`Copied to ${downloadsPath}`);
  console.log('\nPreview (first 5 rows):');
  sheetData.slice(0, 5).forEach(r => console.log(r.join('\t')));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
