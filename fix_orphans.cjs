const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, doc, setDoc, getDoc, updateDoc, arrayUnion } = require("firebase/firestore");
const fs = require("fs");

const configRaw = fs.readFileSync("./firebase-applet-config.json", "utf8");
const firebaseConfig = JSON.parse(configRaw);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function findAndFixOrphans() {
    console.log("Fetching databases...");
    
    const gamesSnap = await getDocs(collection(db, "games"));
    const validGameIds = new Set();
    gamesSnap.forEach(g => validGameIds.add(g.id));

    const videosSnap = await getDocs(collection(db, "videos"));
    const validVideoRefByGameId = new Map();
    videosSnap.forEach(v => {
        const data = v.data();
        if (data.gameId) {
            validVideoRefByGameId.set(data.gameId, data);
        }
    });

    const gameEventsSnap = await getDocs(collection(db, "gameEvents"));
    
    let recreatedCount = 0;
    
    for (const docSnap of gameEventsSnap.docs) {
        const gameId = docSnap.id;
        
        // Is this game actually missing from the 'games' collection?
        if (!validGameIds.has(gameId)) {
            console.log(`[ORPHAN DETECTED] gameEvents document exists for ${gameId}, but games doc is missing!`);
            
            // Reconstruct the game document using video data if possible
            const vData = validVideoRefByGameId.get(gameId);
            
            const newGame = {
                id: gameId,
                seasonId: "unknown",
                homeTeamId: "unknown",
                awayTeamId: "unknown",
                createdAt: new Date(),
                tag: vData ? vData.title : "Recovered Orphan"
            };
            
            console.log(`Recreating Game Doc: ${gameId}...`);
            await setDoc(doc(db, "games", gameId), newGame, { merge: true });
            
            // Add it to aggregated layer
            const newAgg = {
                id: gameId,
                seasonId: newGame.seasonId,
                homeTeamId: newGame.homeTeamId,
                awayTeamId: newGame.awayTeamId,
                createdAt: newGame.createdAt.toISOString(),
                tag: newGame.tag
            };
            await updateDoc(doc(db, "aggregated", "games"), {
                data: arrayUnion(newAgg)
            });
            recreatedCount++;
        }
    }
    console.log(`Successfully recovered ${recreatedCount} deleted/orphaned games.`);
}

findAndFixOrphans().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
