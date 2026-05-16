const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, writeBatch } = require("firebase/firestore");
const fs = require("fs");

// Usage: node merge_players.cjs <playerX> <playerY> [--run]
// <playerX> is the OLD ID to be replaced.
// <playerY> is the NEW ID to keep.
// If --run is not provided, it defaults to DRY RUN.

const args = process.argv.slice(2);
const playerX = args[0];
const playerY = args[1];
const isDryRun = !args.includes("--run");

if (!playerX || !playerY) {
    console.error("Usage: node merge_players.cjs <old_player_id> <new_player_id> [--run]");
    process.exit(1);
}

// Load Firebase configuration correctly
const configRaw = fs.readFileSync("./firebase-applet-config.json", "utf8");
const firebaseConfig = JSON.parse(configRaw);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function mergeEvents() {
    console.log(`Starting merge: replacing '${playerX}' with '${playerY}'`);
    if (isDryRun) {
        console.log("=== DRY RUN MODE: No changes will be written ===");
    } else {
        console.log("=== LIVE RUN MODE: Writing changes to database ===");
    }

    let gameEventsUpdated = 0;
    let individualEventsModifiedCount = 0;

    console.log("\nFetching 'gameEvents' collection...");
    const gameEventsSnap = await getDocs(collection(db, "gameEvents"));
    
    const batches = [];
    let currentBatch = writeBatch(db);
    let batchOperationCount = 0;

    const commitBatch = async () => {
        if (batchOperationCount > 0) {
            if (!isDryRun) await currentBatch.commit();
            batches.push(currentBatch);
            currentBatch = writeBatch(db);
            batchOperationCount = 0;
        }
    };

    gameEventsSnap.forEach(gameDoc => {
        const eventsArray = gameDoc.data().events || [];
        let modified = false;
        
        const newEventsArray = eventsArray.map(evt => {
            let changedThisEvent = false;
            let updatedEvt = { ...evt };

            if (updatedEvt.playerId === playerX) {
                updatedEvt.playerId = playerY;
                changedThisEvent = true;
            }
            if (updatedEvt.subPlayerId === playerX) {
                updatedEvt.subPlayerId = playerY;
                changedThisEvent = true;
            }

            if (changedThisEvent) {
                modified = true;
                individualEventsModifiedCount++;
                console.log(`[gameEvents] Found event ${updatedEvt.id} (Type: ${updatedEvt.type}) in Game: ${gameDoc.id}`);
            }
            return updatedEvt;
        });

        if (modified) {
            gameEventsUpdated++;
            currentBatch.update(gameDoc.ref, { events: newEventsArray });
            batchOperationCount++;
            if (batchOperationCount >= 400) {
                // Must flush, writes max out at 500
            }
        }
    });

    console.log("\nFetching legacy 'events' collection...");
    const legacyEventsSnap = await getDocs(collection(db, "events"));
    let legacyEventsUpdated = 0;

    legacyEventsSnap.forEach(evtDoc => {
        const data = evtDoc.data();
        let modified = false;
        const updates = {};

        if (data.playerId === playerX) {
            updates.playerId = playerY;
            modified = true;
        }
        if (data.subPlayerId === playerX) {
            updates.subPlayerId = playerY;
            modified = true;
        }

        if (modified) {
            legacyEventsUpdated++;
            individualEventsModifiedCount++;
            console.log(`[events] Found legacy event ${evtDoc.id} (Type: ${data.type})`);
            currentBatch.update(evtDoc.ref, updates);
            batchOperationCount++;
        }
    });

    await commitBatch(); // commit any remaining operations

    console.log("\n=== MERGE SUMMARY ===");
    console.log(`Target Old ID: ${playerX}`);
    console.log(`Target New ID: ${playerY}`);
    console.log(`Total Individual Events Modified: ${individualEventsModifiedCount}`);
    console.log(`Total 'gameEvents' Arrays Updated: ${gameEventsUpdated}`);
    console.log(`Total Legacy 'events' Updated: ${legacyEventsUpdated}`);
    
    if (isDryRun) {
        console.log("\nThis was a DRY RUN. Run with '--run' flag to apply these changes.");
        console.log(`Example: node merge_players.cjs ${playerX} ${playerY} --run`);
    } else {
        console.log("\nChanges successfully applied to database.");
    }
}

mergeEvents().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
