import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

// Import our advanced stats computer directly
import { computeAdvancedStats } from '../src/lib/statsComputations';

const firebaseConfig = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf-8'));

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId || undefined);

async function run() {
  console.log("Loading all raw collection documents...");
  
  const playersSnap = await getDocs(collection(db, 'players'));
  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const gamesSnap = await getDocs(collection(db, 'games'));
  const games = gamesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const gameEventsSnap = await getDocs(collection(db, 'gameEvents'));
  const events: any[] = [];
  gameEventsSnap.forEach(d => {
    const evs = d.data().events || [];
    events.push(...evs.map((e: any) => ({ ...e, gameId: d.id })));
  });

  console.log(`Loaded ${players.length} players, ${games.length} games, and ${events.length} events.`);

  // Compute advanced stats using the standard verified system computations
  // We specify position = 'chaser'
  console.log("\nExecuting advanced chaser computations...");
  const advancedStats = computeAdvancedStats(events, players, games, {
    position: 'chaser',
    outlierFilter: 'include',
    controlFilter: 'all',
    flagFilter: 'all'
  });

  // Filter for players with at least 20 minutes played to avoid small-sample size noise
  const filteredChasers = advancedStats.filter(p => p.minutesPlayed >= 10 && p.gamesPlayed >= 2);

  console.log("\n=== TOP CHASERS: PLUS/MINUS (+/-) ===");
  console.log("Evaluates the net point differential when the player is on the pitch.");
  [...filteredChasers]
    .sort((a, b) => b.plusMinus - a.plusMinus)
    .slice(0, 5)
    .forEach(p => console.log(`  ${p.playerName}: +/- is ${p.plusMinus} in ${p.minutesPlayed} mins (${p.gamesPlayed} games)`));

  console.log("\n=== TOP CHASERS: PLUS/MINUS RATIO (Goals Scored / Goals Conceded) ===");
  console.log("Measures the ratio of goals scored vs conceded on their shifts. A ratio of 2.0 means their team scores twice as often as they concede.");
  [...filteredChasers]
    .filter(p => p.plusMinusRatio !== Infinity)
    .sort((a, b) => b.plusMinusRatio - a.plusMinusRatio)
    .slice(0, 5)
    .forEach(p => console.log(`  ${p.playerName}: Ratio of ${p.plusMinusRatio} (Scored: ${p.plus}, Conceded: ${p.minus})`));

  console.log("\n=== TOP CHASERS: CHASER VALUE ADDED (CVA) ===");
  console.log("Chaser Value Added (CVA) measures a player's net goal impact per 20 minutes played, adjusted dynamically against situational baseline averages (With Bludger Control vs Without Bludger Control).");
  [...filteredChasers]
    .sort((a, b) => b.cva - a.cva)
    .slice(0, 5)
    .forEach(p => console.log(`  ${p.playerName}: CVA is ${p.cva} goals/20m (Verified Mins: ${p.minutesPlayed})`));

  console.log("\n=== TOP CHASERS: ASSIST-TO-TURNOVER RATIO (A/TO) ===");
  console.log("Measures distribution safety and playmaking efficiency.");
  [...filteredChasers]
    .filter(p => p.assistToTurnover !== Infinity)
    .sort((a, b) => b.assistToTurnover - a.assistToTurnover)
    .slice(0, 5)
    .forEach(p => console.log(`  ${p.playerName}: A/TO is ${p.assistToTurnover} (${p.assists} assists, ${p.turnovers} turnovers)`));
}

run()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
