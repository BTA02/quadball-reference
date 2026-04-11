import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
let apiKey = "", projectId = "";
env.split('\n').forEach(line => {
    if (line.includes("VITE_FIREBASE_API_KEY")) apiKey = line.split("=")[1].replace(/"/g, '').trim();
    if (line.includes("VITE_FIREBASE_PROJECT_ID")) projectId = line.split("=")[1].replace(/"/g, '').trim();
});

const app = initializeApp({ apiKey, projectId });
const db = getFirestore(app);

async function check() {
    console.log("Checking rosters...");
    const snap = await getDocs(collection(db, "rosters"));
    console.log("Found:", snap.size);
}
check().then(() => process.exit(0));
