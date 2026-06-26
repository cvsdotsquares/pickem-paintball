// Check what events exist in Firestore
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "fantasy-paintball.firebaseapp.com",
  projectId: "fantasy-paintball",
  storageBucket: "fantasy-paintball.firebasestorage.app",
  messagingSenderId: "608553503135",
  appId: "1:608553503135:web:14f937951c06703dab95aa"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Firestore Timestamp -> Date (or null), tolerant of plain values.
function toDate(v) {
  if (v == null) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  return null;
}

function fmt(d) {
  return d ? d.toISOString() : 'unset';
}

// Mirror of src/lib/bannerPhase.ts getBannerPhase — the banner hides during "event_live".
function getBannerPhase(nowMs, { lockDate, eventEndsAt, nextPicksOpenAt }) {
  if (!lockDate) return 'picks_live';
  if (nowMs < lockDate.getTime()) return 'picks_live';
  if (!eventEndsAt) return 'picks_live';
  if (nowMs < eventEndsAt.getTime()) return 'event_live'; // <-- banner is HIDDEN
  if (nextPicksOpenAt && nowMs < nextPicksOpenAt.getTime()) return 'event_break';
  return 'picks_live';
}

async function checkEvents() {
  console.log('🔍 Checking events in Firestore...\n');
  
  try {
    const eventsSnapshot = await getDocs(collection(db, 'events'));
    
    console.log(`📊 Found ${eventsSnapshot.size} events:\n`);

    const nowMs = Date.now();
    console.log(`🕒 Now: ${new Date(nowMs).toISOString()}\n`);

    for (const eventDoc of eventsSnapshot.docs) {
      const eventData = eventDoc.data();
      const lockDate = toDate(eventData.lockDate);
      const eventEndsAt = toDate(eventData.eventEndsAt);
      const nextPicksOpenAt = toDate(eventData.nextPicksOpenAt);
      const phase = getBannerPhase(nowMs, { lockDate, eventEndsAt, nextPicksOpenAt });

      console.log(`Event ID: ${eventDoc.id}`);
      console.log(`  Name: ${eventData.name || 'N/A'}`);
      console.log(`  Year: ${eventData.year || 'N/A'}`);
      console.log(`  Status: ${eventData.status || 'N/A'}`);
      console.log(`  lockDate:        ${fmt(lockDate)}`);
      console.log(`  eventEndsAt:     ${fmt(eventEndsAt)}`);
      console.log(`  nextPicksOpenAt: ${fmt(nextPicksOpenAt)}`);
      console.log(`  → banner phase:  ${phase}${phase === 'event_live' ? '  (BANNER HIDDEN)' : ''}`);

      // Check if players subcollection exists
      const playersSnapshot = await getDocs(collection(db, `events/${eventDoc.id}/players`));
      console.log(`  Players: ${playersSnapshot.size}`);
      console.log('');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkEvents();
