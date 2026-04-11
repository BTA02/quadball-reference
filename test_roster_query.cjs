const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs } = require("firebase/firestore");
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
    try {
        const snap = await getDocs(collection(db, "rosters"));
        console.log("Root collection 'rosters' size:", snap.size);
        snap.forEach(d => console.log(d.id, d.data()));
    } catch(e) {
        console.error("error fetching", e.message);
    }
}
check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
