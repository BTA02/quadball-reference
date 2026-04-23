const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc } = require("firebase/firestore");
const fs = require("fs");

const configRaw = fs.readFileSync("./firebase-applet-config.json", "utf8");
const firebaseConfig = JSON.parse(configRaw);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function check() {
    const d = await getDoc(doc(db, "aggregated", "games"));
    const data = d.data().data;
    const g = data.find(x => x.id === "game_29f81e62-f106-445f-a069-5e735d5ebeb7");
    console.log(g ? "YES it was recovered in aggregated!" : "NO it is missing from aggregated");
}

check().then(() => process.exit(0)).catch(console.error);
