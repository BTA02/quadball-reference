import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';
import Papa from 'papaparse';

// 1. Make sure your firebase-applet-config.json has the credentials for your OLD database
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function exportGameEvents() {
  console.log("Fetching events from old database...");
  
  try {
    const eventsRef = collection(db, 'gameEvents');
    const snapshot = await getDocs(eventsRef);
    
    if (snapshot.empty) {
      console.log('No matching documents found.');
      return;
    }

    const events: any[] = [];
    snapshot.forEach(doc => {
      // Add the document ID in case you want to preserve the reference
      events.push({ id: doc.id, ...doc.data() });
    });

    console.log(`Found ${events.length} events. Converting to CSV...`);

    // 2. Convert raw JSON objects into CSV using PapaParse
    const csv = Papa.unparse(events);

    // 3. Write CSV to file
    fs.writeFileSync('old-events-export.csv', csv);
    console.log("Successfully exported to old-events-export.csv!");
    
    // Force exit since Firebase holds connections open
    process.exit(0);

  } catch (error) {
    console.error("Error exporting events:", error);
    process.exit(1);
  }
}

exportGameEvents();
