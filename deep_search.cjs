const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc } = require("firebase/firestore");
const fs = require("fs");

const configRaw = fs.readFileSync("./firebase-applet-config.json", "utf8");
const firebaseConfig = JSON.parse(configRaw);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function checkIds(gameId) {
    console.log(`\nChecking GAME ID: ${gameId}`);
    
    const gameDoc = await getDoc(doc(db, "games", gameId));
    console.log(`- Exists in 'games' collection: ${gameDoc.exists()}`);
    if (gameDoc.exists()) console.log(gameDoc.data());

    const eventDoc = await getDoc(doc(db, "gameEvents", gameId));
    console.log(`- Exists in 'gameEvents' collection: ${eventDoc.exists()}`);
    if (eventDoc.exists()) {
        const data = eventDoc.data();
        console.log(`   Event array length: ${data.events ? data.events.length : 0}`);
    }
}

async function run() {
    await checkIds("game_41b04747-0d82-42f1-9bd6-e7635cb2cd54");
    await checkIds("game_29f81e62-f106-445f-a069-5e735d5ebeb7");
}

run().then(() => process.exit(0)).catch(console.error);
