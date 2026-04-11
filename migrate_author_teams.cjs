const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const fs = require("fs");

const env = fs.readFileSync(".env.local", "utf8");
let apiKey = "", projectId = "";
env.split('\n').forEach(line => {
    if (line.includes("VITE_FIREBASE_API_KEY")) apiKey = line.split("=")[1].replace(/"/g, '').trim();
    if (line.includes("VITE_FIREBASE_PROJECT_ID")) projectId = line.split("=")[1].replace(/"/g, '').trim();
});

const serviceAccountData = fs.existsSync("./service-account.json") ? require("./service-account.json") : null;

if (!serviceAccountData) {
  console.log("No service-account.json found. Skipping migration via Node.");
  process.exit(0);
}

const appAdmin = initializeApp({ credential: cert(serviceAccountData), projectId });
const dbAdmin = getFirestore(appAdmin);

async function migrate() {
    console.log("Fetching games...");
    const snap = await dbAdmin.collection("games").get();
    let batch = dbAdmin.batch();
    let count = 0;
    
    for (const doc of snap.docs) {
        const d = doc.data();
        if (!d.authorTeamId && d.homeTeamId) {
            batch.update(doc.ref, { authorTeamId: d.homeTeamId });
            count++;
            
            if (count % 400 === 0) {
               await batch.commit();
               batch = dbAdmin.batch();
               console.log("Committed batch");
            }
        }
    }
    
    if (count % 400 !== 0) {
        await batch.commit();
    }
    
    console.log(`Migrated ${count} games in root collection! Update aggregated...`);
    
    const aggSnap = await dbAdmin.collection("aggregated").doc("games").get();
    if (aggSnap.exists) {
        const aggData = aggSnap.data().data || [];
        const newAggData = aggData.map(g => {
            if (!g.authorTeamId && g.homeTeamId) {
                return { ...g, authorTeamId: g.homeTeamId };
            }
            return g;
        });
        await dbAdmin.collection("aggregated").doc("games").update({ data: newAggData });
        console.log("Aggregated games migration complete.");
    }
}

migrate()
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
