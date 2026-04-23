const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, query } = require("firebase/firestore");
const fs = require("fs");

// Load Firebase configuration correctly
const configRaw = fs.readFileSync("./firebase-applet-config.json", "utf8");
const firebaseConfig = JSON.parse(configRaw);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function findOrphanedStats() {
    console.log("Fetching all Valid Videos...");

    // Equivalent to: SELECT id, videoId FROM videos
    const videosSnap = await getDocs(collection(db, "videos"));
    const validVideoMap = new Set();

    // Save both the Document ID and the Youtube ID just to be safe
    videosSnap.forEach(doc => {
        validVideoMap.add(doc.id);
        if (doc.data().videoId) validVideoMap.add(doc.data().videoId);
        if (doc.data().youtubeId) validVideoMap.add(doc.data().youtubeId);
    });

    console.log("Fetching all Game Events...");
    // Equivalent to: SELECT * FROM gameEvents
    const gameEventsSnap = await getDocs(collection(db, "gameEvents"));

    let gameEventCount = gameEventsSnap.size;
    console.log(`Checking against... ${gameEventCount} gameevents documents, so that many games' worth of stats`);

    let orphanedCount = 0;

    console.log("Fetching all Games...");

    // Equivalent to: SELECT id, gameId FROM games
    const gamesSnap = await getDocs(collection(db, "games"));
    const validGameMap = new Set();

    // Save both the Document ID and the Game ID just to be safe
    gamesSnap.forEach(doc => {
        validGameMap.add(doc.id);
        if (doc.data().gameId) validGameMap.add(doc.data().gameId);
    });

    console.log(`Found ${validGameMap.size} valid games`);

    let eventsArrayCount = 0;

    // We do the SQL "JOIN / WHERE NOT IN" manually here in memory
    const uniqueGameIdsInEvents = new Set();
    const uniqueVideoIdsInEvents = new Set();

    gameEventsSnap.forEach(gameDoc => {
        // Because of how your database is structured, the Document ID *is* the Game ID!
        uniqueGameIdsInEvents.add(gameDoc.id);

        const eventsArray = gameDoc.data().events || [];
        eventsArrayCount += eventsArray.length;
        eventsArray.forEach(evt => {
            if (evt.gameId) uniqueGameIdsInEvents.add(evt.gameId);
            if (evt.videoId) uniqueVideoIdsInEvents.add(evt.videoId);

            // "Let's just assume the event has the required IDs"
            const hasRequiredIds = true

            // "...but there is no corresponding video in the database"
            const isMissingFromDB = !validVideoMap.has(evt.videoId);
            const isMissingGameFromDb = !validGameMap.has(evt.gameId);

            if (isMissingFromDB || isMissingGameFromDb) {
                orphanedCount++;
                console.log(`Orphaned Event Found: ID ${evt.id} | Type: ${evt.type} | Points to dead Video ID: ${evt.videoId}`);
            }
        });
    });

    console.log(`\nThere are ${eventsArrayCount} INDIVIDUAL events housed inside those ${gameEventCount} documents!`);
    console.log(`Finished check! Total Orphaned Events: ${orphanedCount}`);

    // If you want to see exactly which gameIds have events but are missing from the 'games' Database:
    console.log("\n--- Validating Game IDs ---");
    const missingGames = Array.from(uniqueGameIdsInEvents).filter(id => !validGameMap.has(id));
    if (missingGames.length > 0) {
        console.log(`Found ${missingGames.length} Game IDs in GameEvents that don't exist in the Games table:`, missingGames);
    } else {
        console.log("All active Game IDs in GameEvents correctly map to a known Game document!");
    }
}

// Additional Cheatsheet for simple WHERE queries:
// const q = query(collection(db, "events"), where("type", "==", "goal"), limit(5));

findOrphanedStats().then(() => process.exit(0));

