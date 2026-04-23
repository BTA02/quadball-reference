const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs } = require("firebase/firestore");
const fs = require("fs");

const configRaw = fs.readFileSync("./firebase-applet-config.json", "utf8");
const firebaseConfig = JSON.parse(configRaw);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const SEARCH_TERM = "Ybx9trv6IhE".toLowerCase();

async function searchDB() {
    console.log(`Searching for "${SEARCH_TERM}"...`);
    const collections = ['games', 'videos', 'gameEvents', 'events', 'aggregated'];
    
    for (const collName of collections) {
        console.log(`Scanning /${collName}...`);
        const snap = await getDocs(collection(db, collName));
        snap.forEach(doc => {
            const id = doc.id;
            const dataStr = JSON.stringify(doc.data(), null, 2).toLowerCase();
            
            if (id.toLowerCase().includes(SEARCH_TERM) || dataStr.includes(SEARCH_TERM)) {
                console.log(`\n\n--- MATCH FOUND IN ${collName} -> DOC ID: ${id} ---`);
                
                // Show a preview (max 500 chars) to prevent massive console spam
                const fullStr = JSON.stringify(doc.data(), null, 2);
                console.log(fullStr.length > 800 ? fullStr.substring(0, 800) + '... (truncated)' : fullStr);
            }
        });
    }
    console.log("\nSearch complete.");
}

searchDB().then(() => process.exit(0)).catch(console.error);
