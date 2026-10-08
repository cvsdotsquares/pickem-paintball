/**
 * Export per-player pick % and captain % for an event.
 * For each player: how many rosters picked them, % of all rosters that picked them,
 * how many rosters made them captain, and % of all rosters that captained them.
 *
 * Run: GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json" node functions/extract-pick-percentages.js [eventId]
 * If eventId omitted, uses the live event (status === "live").
 * Outputs .xlsx to project root and ~/Downloads with timestamp.
 */
const admin = require('firebase-admin');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'fantasy-paintball' });
}
const db = admin.firestore();

async function main() {
  let eventId = process.argv[2];

  if (!eventId) {
    const eventsSnap = await db.collection('events').get();
    const live = eventsSnap.docs.find(d => (d.data().status || '').toLowerCase() === 'live');
    if (!live) {
      console.error('No live event found. Pass eventId as argument, e.g. mid_west_open_2026');
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
      Cost: typeof d.Cost === 'number' ? d.Cost : Number(d.Cost) || 0,
    };
  });

  // 2. Walk all users with official picks for this event (exclude draft-only)
  const usersSnap = await db.collection('users')
    .where(`pickems.${eventId}`, '!=', null)
    .get();

  const pickCounts = {};      // player_id -> # rosters that picked
  const captainCounts = {};   // player_id -> # rosters that captained
  let totalRosters = 0;

  usersSnap.docs.forEach(userDoc => {
    const data = userDoc.data();
    const pickems = data.pickems || {};
    const playerIds = Array.isArray(pickems[eventId]) ? pickems[eventId] : [];
    if (playerIds.length === 0) return;

    totalRosters += 1;

    // de-dupe within a single roster so one team counts once per player
    const unique = new Set(playerIds.map(String));
    unique.forEach(pid => {
      pickCounts[pid] = (pickCounts[pid] || 0) + 1;
    });

    const captainId = pickems[`${eventId}_captain`];
    if (captainId != null) {
      const cid = String(captainId);
      captainCounts[cid] = (captainCounts[cid] || 0) + 1;
    }
  });

  // 3. Assemble rows for every player in the event (including those never picked),
  //    plus any picked ids not found in the player roster.
  const allIds = new Set([...Object.keys(playerMap), ...Object.keys(pickCounts), ...Object.keys(captainCounts)]);
  const rows = [...allIds].map(pid => {
    const info = playerMap[pid] || { Player: pid, Team: 'Unknown', Cost: 0 };
    const picks = pickCounts[pid] || 0;
    const captains = captainCounts[pid] || 0;
    return {
      Player: info.Player,
      Team: info.Team,
      Cost: info.Cost,
      'Pick %': totalRosters ? +((picks / totalRosters) * 100).toFixed(1) : 0,
      'Captain %': totalRosters ? +((captains / totalRosters) * 100).toFixed(1) : 0,
    };
  });

  // Sort by Pick % desc, then Captain % desc, and assign Rank
  rows.sort((a, b) => b['Pick %'] - a['Pick %'] || b['Captain %'] - a['Captain %']);
  rows.forEach((r, i) => { r.Rank = i + 1; });

  // 4. Output XLSX
  const headers = ['Rank', 'Player', 'Team', 'Cost', 'Pick %', 'Captain %'];
  const sheetData = [
    headers,
    ...rows.map(r => headers.map(h => r[h])),
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(wb, ws, 'Pick Percentages');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const baseName = `pick-percentages-${eventId}-${timestamp}.xlsx`;
  const outPath = path.join(process.cwd(), baseName);
  const downloadsPath = path.join(process.env.HOME || process.env.USERPROFILE, 'Downloads', baseName);

  XLSX.writeFile(wb, outPath);
  fs.copyFileSync(outPath, downloadsPath);

  console.log(`Total rosters: ${totalRosters}`);
  console.log(`Players: ${rows.length}`);
  console.log(`Wrote ${downloadsPath}`);
  console.log('\nTop 10 by pick %:');
  console.log(['Rank', 'Player', 'Team', 'Cost', 'Pick %', 'Captain %'].join('\t'));
  rows.slice(0, 10).forEach(r =>
    console.log([r.Rank, r.Player, r.Team, r.Cost, r['Pick %'], r['Captain %']].join('\t'))
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
