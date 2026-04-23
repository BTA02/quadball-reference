const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc, updateDoc } = require("firebase/firestore");
const fs = require("fs");

const configRaw = fs.readFileSync("./firebase-applet-config.json", "utf8");
const firebaseConfig = JSON.parse(configRaw);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function dedupe() {
    console.log("Fetching aggregated games data...");
    const d = await getDoc(doc(db, "aggregated", "games"));
    if (d.exists()) {
        const data = d.data().data || [];
        console.log(`Original array length: ${data.length}`);
        
        // Deduplicate: Map automatically overwrites earlier IDs, leaving the most recent version
        const map = new Map();
        data.forEach(g => {
            map.set(g.id, g);
        });
        
        const deduplicated = Array.from(map.values());
        console.log(`Deduplicated array length: ${deduplicated.length}`);
        
        if (data.length > deduplicated.length) {
            console.log("Pushing deduplicated array to Firestore...");
            await updateDoc(doc(db, "aggregated", "games"), { data: deduplicated });
            console.log("Success! Duplicates removed.");
        } else {
            console.log("No duplicates found.");
        }
    } else {
        console.log("Document not found.");
    }
}

dedupe().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
