const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, limit, orderBy, query } = require("firebase/firestore");
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
    console.log("Checking games...");
    try {
        const snap = await getDocs(query(collection(db, "games"), orderBy("createdAt", "desc"), limit(5)));
        snap.forEach(d => console.log(d.id, d.data().homeTeamId, d.data().awayTeamId));
    } catch(e) { console.error(e.message); }
}
check().then(() => process.exit(0));
