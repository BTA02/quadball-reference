const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc } = require("firebase/firestore");
const fs = require("fs");

const configRaw = fs.readFileSync("./firebase-applet-config.json", "utf8");
const firebaseConfig = JSON.parse(configRaw);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function check() {
    const d = await getDoc(doc(db, "aggregated", "games"));
    if (d.exists()) {
        const data = d.data().data || [];
        console.log("Total aggregated games array length:", data.length);
        const map = new Map();
        data.forEach(g => {
            if (!map.has(g.id)) map.set(g.id, []);
            map.get(g.id).push(g);
        });
        let dupes = 0;
        map.forEach((arr, id) => {
            if (arr.length > 1) {
                dupes++;
                console.log(`ID ${id} has ${arr.length} entries`);
            }
        });
        console.log(`Found ${dupes} IDs with duplicates.`);
    }
}

check().then(() => process.exit(0));
