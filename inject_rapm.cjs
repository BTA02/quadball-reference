const fs = require('fs');
let code = fs.readFileSync('src/lib/statsComputations.ts', 'utf-8');

// 1. Add RAPM to interface ExtendedPlayerStats
code = code.replace(
  '  fEpr: number;          // Forced Empty Possession Rate',
  '  fEpr: number;          // Forced Empty Possession Rate\n  rapm: number;          // Regularized Adjusted Plus Minus'
);

// 2. Add RAPM mapping to return object in computeExtendedStats
code = code.replace(
  '      fEpr,\n      turnoversPer20:',
  '      fEpr,\n      rapm: rapmScores.get(a.playerId) || 0,\n      turnoversPer20:'
);

// 3. Inject computeRAPM helper and modify computeExtendedStats to call it
const computeRAPM_code = `
// ─── RAPM Solver ───────────────────────────────────────────────────────
function computeRAPM(
  events: GameEvent[],
  players: Player[],
  games: Game[],
  filters: any
): Map<string, number> {
  const { relevantGames, eventsByGame } = groupEventsByGame(events, games, filters);
  const matchups = new Map<string, { offPlayers: string[], defPlayers: string[], poss: number, goals: number }>();

  for (const [gameId, gameEvents] of eventsByGame) {
    const game = relevantGames.find(g => g.id === gameId);
    if (!game) continue;
    
    const sorted = [...gameEvents].sort((a, b) => a.videoTime - b.videoTime);
    const { homeTeamId: discHome, awayTeamId: discAway } = discoverGameTeams(sorted, game.homeTeamId, game.awayTeamId);
    const resolvedHomeId = (discHome === null && discAway) ? 'home_inferred' : (discHome || game.homeTeamId);
    const resolvedAwayId = discAway || game.awayTeamId;

    const playerTeamMap = buildPlayerTeamMap(sorted);
    const homePlayerIds = new Set<string>();
    const awayPlayerIds = new Set<string>();
    for (const [pid, team] of playerTeamMap.entries()) {
      if (team === resolvedHomeId) homePlayerIds.add(pid);
      else if (team === resolvedAwayId) awayPlayerIds.add(pid);
    }
    if (discHome === null && discAway) {
      for (const e of sorted) {
        if (isValidPlayerId(e.playerId) && !playerTeamMap.has(e.playerId!)) homePlayerIds.add(e.playerId!);
        if (isValidPlayerId(e.subPlayerId) && !playerTeamMap.has(e.subPlayerId!)) homePlayerIds.add(e.subPlayerId!);
      }
    } else if (playerTeamMap.size === 0) {
      for (const e of sorted) {
        if (isValidPlayerId(e.playerId)) homePlayerIds.add(e.playerId!);
        if (isValidPlayerId(e.subPlayerId)) homePlayerIds.add(e.subPlayerId!);
      }
    }

    const gameEndEvent = sorted.find(e => e.type === 'gameEnd' || e.type === 'gameend');
    const gameEndTime = gameEndEvent?.videoTime ?? sorted[sorted.length - 1]?.videoTime ?? 0;
    const homeStints = computePlayerStints(sorted, resolvedHomeId, homePlayerIds, gameEndTime).filter(s => s.position !== 'beater' && s.position !== 'seeker');
    const awayStints = computePlayerStints(sorted, resolvedAwayId, awayPlayerIds, gameEndTime).filter(s => s.position !== 'beater' && s.position !== 'seeker');
    const controlPeriods = computeControlPeriodsFromEvents(sorted);
    const flagReleaseTime = sorted.find(ev => ev.type === 'flag_released')?.videoTime ?? Infinity;

    const hasExplicitPossessions = sorted.some(e => {
      const t = (e.type || '').toUpperCase();
      return t === 'OFFENSE' || t === 'DEFENSE';
    });

    let currentInferredPossTeam: string | null = null;
    let didCurrentPossShoot = false;

    for (const e of sorted) {
      const t = (e.type || '').toUpperCase();
      const isGoal = t === 'GOAL';
      const isShot = t === 'SHOT';
      const isAttempt = t === 'ATTEMPT';
      const isTurnover = t === 'TURNOVER';
      const isExplicitOffense = t === 'OFFENSE';
      const isExplicitDefense = t === 'DEFENSE';
      const isStartEvent = t === 'CONTROL_START' || t === 'QUADBALL_START';

      if (!isGoal && !isShot && !isAttempt && !isTurnover && !isExplicitOffense && !isExplicitDefense && !isStartEvent) continue;

      let eventTeamId = e.teamId || playerTeamMap.get(e.playerId);
      if (!eventTeamId && (playerTeamMap.size === 0 || (discHome === null && discAway))) eventTeamId = resolvedHomeId;
      if (!eventTeamId) continue;

      let isNewPossessionForEventTeam = false;

      if (!hasExplicitPossessions) {
        if (isGoal || isShot || isAttempt || isTurnover) {
           isNewPossessionForEventTeam = (currentInferredPossTeam !== eventTeamId);
           if (isNewPossessionForEventTeam) {
             currentInferredPossTeam = eventTeamId;
             didCurrentPossShoot = (isShot || isAttempt);
           } else {
             if (isShot || isAttempt) didCurrentPossShoot = true;
           }
        } else if (isStartEvent) {
           isNewPossessionForEventTeam = false;
           currentInferredPossTeam = eventTeamId;
           didCurrentPossShoot = false;
        }
      }

      if (isNewPossessionForEventTeam || isGoal || (hasExplicitPossessions && (isExplicitOffense || isExplicitDefense))) {
        const homeActive = isStateActiveForTeam(resolvedHomeId, e.videoTime, controlPeriods, flagReleaseTime, filters);
        const awayActive = isStateActiveForTeam(resolvedAwayId, e.videoTime, controlPeriods, flagReleaseTime, filters);
        
        const activeHome = homeActive ? Array.from(getActivePlayersAtTime(homeStints, e.videoTime, filters.position)) : [];
        const activeAway = awayActive ? Array.from(getActivePlayersAtTime(awayStints, e.videoTime, filters.position)) : [];

        // Determine who is offense and defense
        let offPlayers: string[] = [];
        let defPlayers: string[] = [];
        
        let offenseTeam = eventTeamId;
        if (hasExplicitPossessions && isExplicitDefense) {
           offenseTeam = (eventTeamId === resolvedHomeId) ? resolvedAwayId : resolvedHomeId;
        }

        if (offenseTeam === resolvedHomeId) {
          offPlayers = activeHome;
          defPlayers = activeAway;
        } else if (offenseTeam === resolvedAwayId) {
          offPlayers = activeAway;
          defPlayers = activeHome;
        }

        if (offPlayers.length === 0 && defPlayers.length === 0) continue;
        
        offPlayers.sort();
        defPlayers.sort();
        const matchupKey = offPlayers.join(',') + '|' + defPlayers.join(',');
        if (!matchups.has(matchupKey)) matchups.set(matchupKey, { offPlayers, defPlayers, poss: 0, goals: 0 });
        
        const m = matchups.get(matchupKey)!;
        if (isGoal) m.goals++;
        if (isNewPossessionForEventTeam || (hasExplicitPossessions && (isExplicitOffense || isExplicitDefense))) {
           m.poss++;
        }
      }
    }
  }

  // SGD Ridge Regression Solver
  const rapmScores = new Map<string, number>();
  let intercept = 40; // baseline 40 points per 100 poss
  const lr = 0.0005;
  const lambda = 0.05;

  for (let epoch = 0; epoch < 100; epoch++) {
    for (const m of matchups.values()) {
      if (m.poss === 0) continue; // Skip if just isolated goals with no possessions counted

      let pred = intercept;
      for (const p of m.offPlayers) pred += rapmScores.get(p) || 0;
      for (const p of m.defPlayers) pred -= rapmScores.get(p) || 0;
      
      const target = (m.goals / m.poss) * 100;
      const err = pred - target;
      
      const weight = m.poss; // Weight updates by sample size
      intercept -= lr * err * weight;
      
      for (const p of m.offPlayers) {
        const val = rapmScores.get(p) || 0;
        rapmScores.set(p, val - lr * (err + lambda * val) * weight);
      }
      for (const p of m.defPlayers) {
        const val = rapmScores.get(p) || 0;
        rapmScores.set(p, val - lr * (-err + lambda * val) * weight);
      }
    }
  }
  
  // Clean up: scale down slightly or just return raw MAP
  for (const [p, val] of rapmScores.entries()) {
     rapmScores.set(p, Math.round(val * 10) / 10);
  }

  return rapmScores;
}
`;

// Insert the helper function before export function computeExtendedStats
code = code.replace(
  'export function computeExtendedStats(',
  computeRAPM_code + '\nexport function computeExtendedStats('
);

// Call computeRAPM inside computeExtendedStats
code = code.replace(
  '  const playerMap = new Map<string, Player>();',
  '  const rapmScores = computeRAPM(events, players, games, filters);\n  const playerMap = new Map<string, Player>();'
);

fs.writeFileSync('src/lib/statsComputations.ts', code);
console.log('RAPM Engine injected successfully.');
