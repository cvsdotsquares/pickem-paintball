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

async function checkEvents() {
  console.log('🔍 Checking events in Firestore...\n');
  
  try {
    const eventsSnapshot = await getDocs(collection(db, 'events'));
    
    console.log(`📊 Found ${eventsSnapshot.size} events:\n`);
    
    for (const eventDoc of eventsSnapshot.docs) {
      const eventData = eventDoc.data();
      console.log(`Event ID: ${eventDoc.id}`);
      console.log(`  Name: ${eventData.name || 'N/A'}`);
      console.log(`  Year: ${eventData.year || 'N/A'}`);
      console.log(`  Status: ${eventData.status || 'N/A'}`);
      
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
