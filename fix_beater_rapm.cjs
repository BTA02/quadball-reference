const fs = require('fs');
let code = fs.readFileSync('src/lib/statsComputations.ts', 'utf-8');

// 1. Parameterize computeRAPM
code = code.replace(
  'function computeRAPM(\n  events: GameEvent[],\n  players: Player[],\n  games: Game[],\n  filters: any\n): Map<string, number> {',
  'function computeRAPM(\n  events: GameEvent[],\n  players: Player[],\n  games: Game[],\n  filters: any,\n  mode: \'quadball\' | \'beater\' = \'quadball\'\n): Map<string, number> {'
);

// 2. Adjust stint filtering in computeRAPM
code = code.replace(
  'const homeStints = computePlayerStints(sorted, resolvedHomeId, homePlayerIds, gameEndTime).filter(s => s.position !== \'beater\' && s.position !== \'seeker\');\n    const awayStints = computePlayerStints(sorted, resolvedAwayId, awayPlayerIds, gameEndTime).filter(s => s.position !== \'beater\' && s.position !== \'seeker\');',
  `const homeStintsFull = computePlayerStints(sorted, resolvedHomeId, homePlayerIds, gameEndTime);
    const awayStintsFull = computePlayerStints(sorted, resolvedAwayId, awayPlayerIds, gameEndTime);
    const homeStints = homeStintsFull.filter(s => mode === 'beater' ? s.position === 'beater' : (s.position !== 'beater' && s.position !== 'seeker'));
    const awayStints = awayStintsFull.filter(s => mode === 'beater' ? s.position === 'beater' : (s.position !== 'beater' && s.position !== 'seeker'));`
);

// 3. Update computeExtendedStats call
code = code.replace(
  'const rapmScores = computeRAPM(events, players, games, filters);',
  'const rapmScores = computeRAPM(events, players, games, filters, \'quadball\');'
);

// 4. Update BeaterSoloStats interface
code = code.replace(
  '  eOff: number;\n  eDef: number;\n  epr: number;',
  '  rapm: number;\n  epr: number;'
);

// 5. Inject computeRAPM in computeBeaterSoloStats
code = code.replace(
  'const { eventsByGame, relevantGames } = groupEventsByGame(events, games, filters);',
  `const { eventsByGame, relevantGames } = groupEventsByGame(events, games, filters);\n  const rapmScores = computeRAPM(events, players, games, filters, 'beater');`
);

// 6. Update mapping in computeBeaterSoloStats
code = code.replace(
  'eOff: teamPoss > 0 ? Math.round((a.plus / teamPoss) * 100 * 10) / 10 : 0,\n      eDef: oppPoss > 0 ? Math.round((a.minus / oppPoss) * 100 * 10) / 10 : 0,\n      epr:',
  'rapm: rapmScores.get(a.playerId) || 0,\n      epr:'
);

fs.writeFileSync('src/lib/statsComputations.ts', code);
console.log('Beater RAPM added.');
