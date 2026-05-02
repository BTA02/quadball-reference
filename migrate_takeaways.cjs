/**
 * Migrate TAKEAWAY events → TURNOVER with flipped teamId
 * 
 * A "takeaway" by Team A = a "turnover" by Team B.
 * So we change type to "turnover" and swap the teamId to the opposing team.
 * 
 * Usage:
 *   DRY RUN (default):  node migrate_takeaways.cjs
 *   LIVE RUN:           node migrate_takeaways.cjs --commit
 */

const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, doc, updateDoc } = require("firebase/firestore");
const fs = require("fs");

const COMMIT = process.argv.includes("--commit");

const configRaw = fs.readFileSync("./firebase-applet-config.json", "utf8");
const firebaseConfig = JSON.parse(configRaw);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function migrateTakeaways() {
  console.log(`\n=== TAKEAWAY → TURNOVER Migration ===`);
  console.log(`Mode: ${COMMIT ? "🔴 LIVE — changes WILL be written" : "🟢 DRY RUN — no changes will be made"}\n`);

  // 1. Load all games to get homeTeamId/awayTeamId mapping
  console.log("Loading games...");
  const gamesSnap = await getDocs(collection(db, "games"));
  const gameTeams = new Map(); // gameId → { homeTeamId, awayTeamId }
  gamesSnap.forEach(d => {
    const data = d.data();
    gameTeams.set(d.id, { homeTeamId: data.homeTeamId, awayTeamId: data.awayTeamId });
  });
  console.log(`  Found ${gameTeams.size} games\n`);

  // 2. Scan all gameEvents documents for takeaway events
  console.log("Scanning all gameEvents for takeaways...");
  const gameEventsSnap = await getDocs(collection(db, "gameEvents"));

  let totalTakeaways = 0;
  let totalConverted = 0;
  let totalSkipped = 0;
  const docsToUpdate = []; // { docId, newEvents[] }

  gameEventsSnap.forEach(gameDoc => {
    const gameId = gameDoc.id;
    const eventsArray = gameDoc.data().events || [];
    const teams = gameTeams.get(gameId);

    let modified = false;
    const newEvents = eventsArray.map(evt => {
      const evtType = (evt.type || "").toLowerCase();
      if (evtType !== "takeaway") return evt;

      totalTakeaways++;

      // Determine the opposing team
      let newTeamId = evt.teamId;
      if (teams) {
        if (evt.teamId === teams.homeTeamId) {
          newTeamId = teams.awayTeamId;
        } else if (evt.teamId === teams.awayTeamId) {
          newTeamId = teams.homeTeamId;
        } else if (!evt.teamId) {
          // No teamId on the takeaway — can't reliably flip it
          console.log(`  ⚠️  SKIP: Game ${gameId}, event ${evt.id} — takeaway has no teamId, cannot determine opposing team`);
          totalSkipped++;
          return evt;
        } else {
          // teamId doesn't match either game team — weird data
          console.log(`  ⚠️  SKIP: Game ${gameId}, event ${evt.id} — teamId "${evt.teamId}" doesn't match home "${teams.homeTeamId}" or away "${teams.awayTeamId}"`);
          totalSkipped++;
          return evt;
        }
      } else {
        console.log(`  ⚠️  SKIP: Game ${gameId}, event ${evt.id} — no game record found to determine teams`);
        totalSkipped++;
        return evt;
      }

      totalConverted++;
      modified = true;

      const playerName = evt.playerId || "(no player)";
      console.log(`  ✓ Game ${gameId}: takeaway by ${playerName} [${evt.teamId}] → turnover [${newTeamId}] @ ${evt.videoTime}s`);

      return {
        ...evt,
        type: "turnover",
        teamId: newTeamId,
      };
    });

    if (modified) {
      docsToUpdate.push({ docId: gameId, newEvents });
    }
  });

  console.log(`\n=== Summary ===`);
  console.log(`  Total takeaway events found: ${totalTakeaways}`);
  console.log(`  Will convert:               ${totalConverted}`);
  console.log(`  Skipped (ambiguous):         ${totalSkipped}`);
  console.log(`  Documents to update:         ${docsToUpdate.length}`);

  if (!COMMIT) {
    console.log(`\n🟢 DRY RUN complete. Run with --commit to apply changes.`);
    return;
  }

  // 3. Write changes
  console.log(`\n🔴 Committing ${docsToUpdate.length} document updates...`);
  for (const { docId, newEvents } of docsToUpdate) {
    const ref = doc(db, "gameEvents", docId);
    await updateDoc(ref, { events: newEvents });
    console.log(`  ✅ Updated gameEvents/${docId}`);
  }

  console.log(`\n✅ Migration complete! ${totalConverted} takeaways converted to turnovers.`);
}

migrateTakeaways()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
