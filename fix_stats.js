const fs = require('fs');
let code = fs.readFileSync('src/lib/statsComputations.ts', 'utf-8');

// Remove rapmScores from wherever it was put
code = code.replace('  const rapmScores = computeRAPM(events, players, games, filters);\n', '');

// Put it specifically in computeExtendedStats
code = code.replace(
  'export function computeExtendedStats(\n  events: GameEvent[],\n  players: Player[],\n  games: Game[],\n  filters: { seasonId?: string; teamId?: string; position?: \'chaser\' | \'keeper\'; controlFilter?: \'all\' | \'with\' | \'without\'; flagFilter?: \'all\' | \'on\' | \'off\'; outlierFilter?: \'include\' | \'exclude\' }\n): ExtendedPlayerStats[] {\n  // Reuse advanced stats computation for the heavy lifting\n  const advanced = computeAdvancedStats(events, players, games, filters);',
  `export function computeExtendedStats(
  events: GameEvent[],
  players: Player[],
  games: Game[],
  filters: { seasonId?: string; teamId?: string; position?: 'chaser' | 'keeper'; controlFilter?: 'all' | 'with' | 'without'; flagFilter?: 'all' | 'on' | 'off'; outlierFilter?: 'include' | 'exclude' }
): ExtendedPlayerStats[] {
  // Reuse advanced stats computation for the heavy lifting
  const advanced = computeAdvancedStats(events, players, games, filters);
  const rapmScores = computeRAPM(events, players, games, filters);`
);

// Also apply the user's feedback: "only calculate this on the verified and complete stats"
// Inside computeRAPM:
code = code.replace(
  'const { relevantGames, eventsByGame } = groupEventsByGame(events, games, filters);',
  'const { relevantGames: allRelevant, eventsByGame } = groupEventsByGame(events, games, filters);\n  const relevantGames = allRelevant.filter(g => g.isVerified);'
);

fs.writeFileSync('src/lib/statsComputations.ts', code);
console.log('Fixed rapmScores location and added isVerified check.');
