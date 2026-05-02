import { computeExtendedStats } from '../lib/statsComputations';
import { demoData } from '../lib/demoData';

const filters = { seasonId: undefined }; // 'all seasons'
const events = demoData.events;
const players = demoData.players;
const games = demoData.games;

console.log(`Players: ${players.length}, Events: ${events.length}, Games: ${games.length}`);
const ext = computeExtendedStats(events, players, games, filters);
console.log(`Extended stats length: ${ext.length}`);
