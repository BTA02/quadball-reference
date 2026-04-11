const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, doc, getDoc } = require("firebase/firestore");
const fs = require("fs");

const env = fs.readFileSync(".env.local", "utf8");
let apiKey = "", projectId = "";
env.split('\n').forEach(line => {
    if (line.includes("VITE_FIREBASE_API_KEY")) apiKey = line.split("=")[1].replace(/"/g, '').trim();
    if (line.includes("VITE_FIREBASE_PROJECT_ID")) projectId = line.split("=")[1].replace(/"/g, '').trim();
});

const app = initializeApp({ apiKey, projectId });
const db = getFirestore(app);

async function check() {
    console.log("Checking rosters root collection...");
    const snap = await getDocs(collection(db, "rosters"));
    console.log("Root collection 'rosters' size:", snap.size);
    
    console.log("Checking aggregated/rosters...");
    const agg = await getDoc(doc(db, "aggregated", "rosters"));
    console.log("Aggregated rosters length:", agg.exists() ? agg.data().data.length : 'MISSING');
}
check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
