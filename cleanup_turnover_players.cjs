/**
 * Cleanup: Remove playerId from turnover events where the player
 * belongs to the OPPOSING team (not the team that committed the turnover).
 * 
 * These are leftover from the takeaway→turnover migration where the teamId
 * was correctly flipped but the playerId was kept, resulting in players
 * having turnovers attributed on a team they don't play for.
 *
 * Logic: For each game, build a player→team map from ALL events in that game.
 * Then for each turnover with a playerId, if that player's team !== the
 * turnover's teamId, null out the playerId.
 * 
 * Usage:
 *   DRY RUN (default):  node cleanup_turnover_players.cjs
 *   LIVE RUN:           node cleanup_turnover_players.cjs --commit
 */

const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, doc, updateDoc } = require("firebase/firestore");
const fs = require("fs");

const COMMIT = process.argv.includes("--commit");

const configRaw = fs.readFileSync("./firebase-applet-config.json", "utf8");
const firebaseConfig = JSON.parse(configRaw);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function cleanupTurnoverPlayers() {
  console.log(`\n=== Turnover Player Cleanup ===`);
  console.log(`Mode: ${COMMIT ? "🔴 LIVE — changes WILL be written" : "🟢 DRY RUN — no changes will be made"}\n`);

  // 1. Load all games for team info
  console.log("Loading games...");
  const gamesSnap = await getDocs(collection(db, "games"));
  const gameTeams = new Map();
  gamesSnap.forEach(d => {
    const data = d.data();
    gameTeams.set(d.id, { homeTeamId: data.homeTeamId, awayTeamId: data.awayTeamId });
  });
  console.log(`  Found ${gameTeams.size} games\n`);

  // 2. Scan all gameEvents
  console.log("Scanning gameEvents...");
  const gameEventsSnap = await getDocs(collection(db, "gameEvents"));

  let totalTurnoversWithPlayer = 0;
  let totalCleaned = 0;
  let totalKept = 0;
  let totalNoMap = 0;
  const docsToUpdate = [];

  gameEventsSnap.forEach(gameDoc => {
    const gameId = gameDoc.id;
    const eventsArray = gameDoc.data().events || [];
    const teams = gameTeams.get(gameId);
    if (!teams) return;

    // Build player→team map from ALL events in this game
    // A player's team is determined by the teamId on their non-turnover events
    const playerTeamMap = new Map();
    for (const evt of eventsArray) {
      if (!evt.playerId || !evt.teamId) continue;
      const evtType = (evt.type || "").toLowerCase();
      // Use non-turnover events to establish team membership
      // (goals, assists, shots, sub_in, sub_out, etc.)
      if (evtType !== "turnover") {
        playerTeamMap.set(evt.playerId, evt.teamId);
      }
    }

    let modified = false;
    const newEvents = eventsArray.map(evt => {
      const evtType = (evt.type || "").toLowerCase();
      if (evtType !== "turnover" || !evt.playerId) return evt;

      totalTurnoversWithPlayer++;

      const playerTeam = playerTeamMap.get(evt.playerId);
      if (!playerTeam) {
        // Can't determine player's team — leave as-is but log it
        totalNoMap++;
        return evt;
      }

      // If the player's actual team matches the turnover's teamId, keep it — it's correct
      if (playerTeam === evt.teamId) {
        totalKept++;
        return evt;
      }

      // Player is on the OTHER team → this was a takeaway player, remove their ID
      totalCleaned++;
      modified = true;
      console.log(`  ✓ Game ${gameId}: removing playerId "${evt.playerId}" from turnover [${evt.teamId}] — player belongs to [${playerTeam}] @ ${evt.videoTime}s`);

      return {
        ...evt,
        playerId: null,
      };
    });

    if (modified) {
      docsToUpdate.push({ docId: gameId, newEvents });
    }
  });

  console.log(`\n=== Summary ===`);
  console.log(`  Turnovers with a playerId:    ${totalTurnoversWithPlayer}`);
  console.log(`  Cleaned (wrong team):         ${totalCleaned}`);
  console.log(`  Kept (correct team):          ${totalKept}`);
  console.log(`  Skipped (no team data):       ${totalNoMap}`);
  console.log(`  Documents to update:          ${docsToUpdate.length}`);

  if (!COMMIT) {
    console.log(`\n🟢 DRY RUN complete. Run with --commit to apply changes.`);
    return;
  }

  // 3. Write
  console.log(`\n🔴 Committing ${docsToUpdate.length} document updates...`);
  for (const { docId, newEvents } of docsToUpdate) {
    const ref = doc(db, "gameEvents", docId);
    await updateDoc(ref, { events: newEvents });
    console.log(`  ✅ Updated gameEvents/${docId}`);
  }

  console.log(`\n✅ Cleanup complete! Removed playerId from ${totalCleaned} turnovers.`);
}

cleanupTurnoverPlayers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Cleanup failed:", err);
    process.exit(1);
  });
