/**
 * Audit pickems for corrupt data: duplicate picks, wrong counts, captain issues.
 * Run: GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json" node functions/audit-pickems.js
 * Optional: node functions/audit-pickems.js doitfortheneem  (inspect specific user)
 */
const admin = require('firebase-admin');

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
  const targetUsername = process.argv[2] ? process.argv[2].toLowerCase() : null;

  // Get live event (or use first event with picks)
  const eventsSnap = await db.collection('events').get();
  const liveEvent = eventsSnap.docs.find((d) => d.data().status === 'live');
  const eventId = liveEvent?.id || eventsSnap.docs[0]?.id;
  if (!eventId) {
    console.error('No events found');
    process.exit(1);
  }
  console.log(`\nAuditing pickems for event: ${eventId}\n`);

  // Fetch all users with any pickems (we'll filter by event)
  const usersSnap = await db.collection('users').get();

  const issues = [];
  let doitfortheneemData = null;

  usersSnap.docs.forEach((userDoc) => {
    const data = userDoc.data();
    const pickems = data.pickems || {};
    const username = getUsername(data, userDoc.id);

    if (targetUsername && username.toLowerCase() !== targetUsername) return;

    // Check all events, not just the live one
    const eventIds = Object.keys(pickems).filter((k) => !k.includes('_captain') && !k.includes('_draft'));
    for (const eid of eventIds) {
      const playerIds = Array.isArray(pickems[eid]) ? pickems[eid] : [];
      if (playerIds.length === 0) continue;

      const captainId = pickems[`${eid}_captain`];

    // Check for duplicate picks
      const counts = {};
      playerIds.forEach((pid) => {
        const key = String(pid);
        counts[key] = (counts[key] || 0) + 1;
      });
      const duplicates = Object.entries(counts).filter(([, c]) => c > 1);

      // Check captain: is it an array? (draft_captain + official captain is normal)
      let captainIssue = null;
      if (Array.isArray(captainId)) {
        captainIssue = `Captain is an array (length ${captainId.length})`;
      }

      if (duplicates.length > 0 || captainIssue) {
        issues.push({
          uid: userDoc.id,
          username,
          eventId: eid,
          pickCount: playerIds.length,
          duplicates: duplicates.map(([pid, c]) => `${pid}×${c}`),
          captainId: captainId,
          captainIssue,
        });
      }
    }

    if (username.toLowerCase() === 'doitfortheneem') {
      const tampaPicks = Array.isArray(pickems[eventId]) ? pickems[eventId] : [];
      const tampaCounts = {};
      tampaPicks.forEach((pid) => {
        const key = String(pid);
        tampaCounts[key] = (tampaCounts[key] || 0) + 1;
      });
      doitfortheneemData = {
        uid: userDoc.id,
        username,
        pickems: JSON.stringify(pickems, null, 2),
        eventPicks: tampaPicks,
        captainId: pickems[`${eventId}_captain`],
        counts: tampaCounts,
        duplicates: Object.entries(tampaCounts).filter(([, c]) => c > 1),
      };
    }
  });

  if (targetUsername === 'doitfortheneem' || doitfortheneemData) {
    console.log('═══ doitfortheneem DATA ═══\n');
    if (!doitfortheneemData) {
      console.log('User doitfortheneem not found (or has no picks for this event).');
    } else {
      console.log(JSON.stringify(doitfortheneemData, null, 2));
    }
    console.log('');
  }

  console.log('═══ USERS WITH PICKEM ISSUES ═══\n');
  if (issues.length === 0) {
    console.log('No issues found.');
  } else {
    console.log(`${issues.length} user(s) with issues:\n`);
    issues.forEach((i) => {
      console.log(`  ${i.username} (${i.uid})`);
      console.log(`    Event: ${i.eventId}`);
      console.log(`    Pick count: ${i.pickCount}`);
      if (i.duplicates.length) console.log(`    Duplicates: ${i.duplicates.join(', ')}`);
      if (i.captainIssue) console.log(`    Captain: ${i.captainIssue}`);
      console.log('');
    });
  }

  console.log('\n═══ FULL LIST TO MANUAL REVIEW ═══\n');
  issues.forEach((i) => console.log(i.username));
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
