/**
 * Stats Computation Layer
 *
 * Pure functions that compute quadball statistics from raw events.
 * Designed to be used with useMemo for zero-cost re-renders.
 */

// Re-declare minimal types to avoid circular imports
interface GameEvent {
  id: string;
  videoId: string;
  gameId: string;
  type: string;
  videoTime: number;
  playerId?: string;
  subPlayerId?: string;
  teamId?: string;
  status: string;
  [key: string]: any;
}

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  nickname?: string;
  [key: string]: any;
}

interface Game {
  id: string;
  seasonId: string;
  homeTeamId: string;
  awayTeamId: string;
  [key: string]: any;
}

// Placeholder IDs that should never appear in stats tables (case-insensitive)
const PLACEHOLDER_ID_LOWER = new Set([
  'chasera', 'chaserb', 'chaserc', 'keeper', 'beatera', 'beaterb', 'seeker',
  'null', 'undefined', 'no_player', 'no-player', '',
]);

function isPlaceholderId(pid: string): boolean {
  return PLACEHOLDER_ID_LOWER.has(pid.trim().toLowerCase());
}

function isValidPlayerId(pid: string | undefined | null): boolean {
  if (!pid) return false;
  const trimmed = pid.trim();
  return trimmed.length > 0 && !isPlaceholderId(trimmed);
}

// ─── Basic Counting Stats ────────────────────────────────────────────

export interface BasicPlayerStats {
  playerId: string;
  playerName: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  nickname?: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  shots: number;
  turnovers: number;
  fouls: number;
  cards: number;
  points: number;      // goals × 10
  shotPct: number;     // goals / shots × 100
}

export function computeBasicStats(
  events: GameEvent[],
  players: Player[],
  games: Game[],
  filters: { seasonId?: string; teamId?: string }
): BasicPlayerStats[] {
  // Build a player lookup by ID
  const playerMap = new Map<string, Player>();
  players.forEach(p => playerMap.set(p.id, p));

  // Filter games by season if needed
  const gameIdSet = new Set<string>();
  if (filters.seasonId) {
    games
      .filter(g => g.seasonId === filters.seasonId)
      .forEach(g => gameIdSet.add(g.id));
  }

  // Filter events
  let filtered = events;
  if (filters.seasonId) {
    filtered = filtered.filter(e => gameIdSet.has(e.gameId));
  }
  if (filters.teamId) {
    filtered = filtered.filter(e => e.teamId === filters.teamId);
  }

  // Accumulate per player
  const statsMap = new Map<string, BasicPlayerStats>();

  const getOrCreate = (playerId: string): BasicPlayerStats => {
    if (statsMap.has(playerId)) return statsMap.get(playerId)!;
    const p = playerMap.get(playerId);
    const stats: BasicPlayerStats = {
      playerId,
      playerName: p ? `${p.firstName} ${p.lastName}` : playerId,
      firstName: p?.firstName || playerId,
      lastName: p?.lastName || '',
      preferredName: p?.preferredName,
      nickname: p?.nickname,
      gamesPlayed: 0,
      goals: 0,
      assists: 0,
      shots: 0,
      turnovers: 0,
      fouls: 0,
      cards: 0,
      points: 0,
      shotPct: 0,
    };
    statsMap.set(playerId, stats);
    return stats;
  };

  // Track unique games per player
  const playerGameSets = new Map<string, Set<string>>();

  for (const e of filtered) {
    if (!isValidPlayerId(e.playerId)) continue;
    const pid = e.playerId!;
    if (!playerMap.has(pid)) continue;
    const stats = getOrCreate(pid);
    const t = (e.type || '').toLowerCase();

    // Track games played
    if (!playerGameSets.has(pid)) playerGameSets.set(pid, new Set());
    playerGameSets.get(pid)!.add(e.gameId);

    if (t === 'goal') stats.goals++;
    else if (t === 'assist') stats.assists++;
    else if (t === 'shot') stats.shots++;
    else if (t === 'turnover') stats.turnovers++;
    else if (t === 'foul') stats.fouls++;
    else if (t === 'card') stats.cards++;
  }

  // Finalize derived stats
  for (const [nid, stats] of statsMap) {
    stats.gamesPlayed = playerGameSets.get(nid)?.size || 0;
    stats.points = stats.goals + stats.assists;
    stats.shotPct = (stats.goals + stats.shots) > 0 ? Math.round((stats.goals / (stats.goals + stats.shots)) * 1000) / 10 : 0;
  }

  return Array.from(statsMap.values());
}
// ─── Advanced Computed Stats ─────────────────────────────────────────

/**
 * Discovers the actual team IDs for a game by scanning the events.
 * Returns { homeTeamId, awayTeamId, awayTeamIds } where homeTeamId may be null
 * if the data was recorded from a single perspective (all plain GOALs are "home").
 *
 * Logic: events tagged with a teamId (AWAY_GOAL, control_change, etc.) give us
 * real team IDs. The "home team" is the perspective team — the one whose events
 * are recorded without a teamId prefix. We discover it from roster lookups or
 * infer it as "not any of the away-tagged teams".
 */
export function discoverGameTeams(
  gameEvents: GameEvent[],
  gameHomeTeamId: string,
  gameAwayTeamId: string
): { homeTeamId: string | null; awayTeamId: string | null; allTeamIds: Set<string> } {
  const allTeamIds = new Set<string>();
  for (const e of gameEvents) {
    if (e.teamId && e.teamId !== 'unknown' && e.teamId !== 'null' && e.teamId !== '') {
      allTeamIds.add(e.teamId);
    }
  }

  // If Game record has real team IDs, use them
  const hasRealHome = gameHomeTeamId && gameHomeTeamId !== 'unknown';
  const hasRealAway = gameAwayTeamId && gameAwayTeamId !== 'unknown';

  if (hasRealHome && hasRealAway) {
    return { homeTeamId: gameHomeTeamId, awayTeamId: gameAwayTeamId, allTeamIds };
  }

  // Otherwise discover from events: any teamId on events is the "away" team
  // (because AWAY_GOAL, LOSE_CONTROL etc. are the ones that get the tag)
  // The home team won't have a teamId on its events in this dataset format.
  // If there's only 1 discoverable team ID, it's the away team.
  const discoveredIds = [...allTeamIds];
  if (discoveredIds.length === 1) {
    return { homeTeamId: null, awayTeamId: discoveredIds[0], allTeamIds };
  }
  if (discoveredIds.length >= 2) {
    // Can't reliably tell which one is home vs away with >1 team showing up
    // Both appear as tagged teams. Return both and let the caller handle it.
    return { homeTeamId: discoveredIds[0], awayTeamId: discoveredIds[1], allTeamIds };
  }
  // No team IDs at all
  return { homeTeamId: null, awayTeamId: null, allTeamIds };
}

/**
 * Infers player team assignments via explicit events and substitution chains.
 * Accepts ALL teamId values from events as valid (no homeTeamId/awayTeamId filter),
 * since Game records may have 'unknown' team IDs.
 */
export function buildPlayerTeamMap(gameEvents: GameEvent[]): Map<string, string> {
  const playerTeamMap = new Map<string, string>();

  for (const e of gameEvents) {
    const pid = e.playerId;

    // Accept ANY non-empty teamId as a valid seed
    if (e.teamId && e.teamId !== 'unknown' && e.teamId !== 'null' && e.teamId !== '') {
      if (isValidPlayerId(pid)) playerTeamMap.set(pid!, e.teamId);
    }
  }

  return playerTeamMap;
}

// ─── Advanced Computed Stats ─────────────────────────────────────────

export interface AdvancedPlayerStats {
  playerId: string;
  playerName: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  nickname?: string;
  gamesPlayed: number;
  plus: number;
  minus: number;
  plusMinus: number;
  plusMinusRatio: number;
  offPlusMinusRatio: number;
  offPlusMinus: number;
  onOffDt: number;
  minutesPlayed: number;
  teamPossessions: number;
  oppPossessions: number;
  teamTurnoversOn: number;
  oppTurnoversOn: number;
  goalsPerTwenty: number;
  assistsPerTwenty: number;
  pointsPerTwenty: number;
  shotPct: number;
  assistToTurnover: number;
  // Raw counts for ratio computation
  goals: number;
  assists: number;
  shots: number;
  turnovers: number;
  points: number;
}

interface StintRecord {
  playerId: string;
  teamId: string;
  startTime: number;
  endTime: number;
  position?: string;
}

/**
 * Compute game-clock intervals from game state events.
 * Returns array of [startTime, endTime] pairs representing when the
 * game clock was running (in video-time seconds).
 */
function computeGameClockIntervals(gameEvents: GameEvent[]): [number, number][] {
  const intervals: [number, number][] = [];
  let lastStart = -1;

  for (const e of gameEvents) {
    const t = (e.type || '').toLowerCase();
    if (t === 'gamestart' || t === 'start_clock') {
      lastStart = e.videoTime;
    } else if (t === 'gamepause' || t === 'gameend' || t === 'pause_clock') {
      if (lastStart >= 0) {
        intervals.push([lastStart, e.videoTime]);
        lastStart = -1;
      }
    }
  }

  // If game is still "running" at the end of events, close with last event time
  if (lastStart >= 0) {
    const lastEvent = gameEvents[gameEvents.length - 1];
    if (lastEvent) {
      intervals.push([lastStart, lastEvent.videoTime]);
    }
  }

  return intervals;
}

/**
 * Get total game-clock seconds within a [start, end] video-time window,
 * accounting for pauses.
 */
function getGameMinutesInWindow(
  clockIntervals: [number, number][],
  windowStart: number,
  windowEnd: number
): number {
  let total = 0;
  for (const [s, e] of clockIntervals) {
    const overlapStart = Math.max(s, windowStart);
    const overlapEnd = Math.min(e, windowEnd);
    if (overlapEnd > overlapStart) {
      total += overlapEnd - overlapStart;
    }
  }
  return total / 60; // convert to minutes
}

/**
 * Determine which players are "on field" at a given video time,
 * by checking the computed stint records.
 */
function getActivePlayersAtTime(
  stints: StintRecord[],
  videoTime: number,
  positionFilter?: string
): Set<string> {
  const active = new Set<string>();
  for (const stint of stints) {
    if (positionFilter && stint.position !== positionFilter) continue;
    if (videoTime >= stint.startTime && videoTime <= stint.endTime) {
      active.add(stint.playerId);
    }
  }
  return active;
}

/**
 * Build stint records for each player in a game — periods when they were on field.
 * Each stint has a start and end video time. Infers game starters from events.
 */
function computePlayerStints(
  gameEvents: GameEvent[],
  teamId: string,
  allTeamPlayerIds: Set<string>,
  gameEndTime: number
): StintRecord[] {
  const stints: StintRecord[] = [];
  const currentStart = new Map<string, { time: number; pos?: string }>();

  const gameStartEvent = gameEvents.find(e =>
    e.type === 'gamestart' || e.type === 'gameStart'
  );
  const gameStartTime = gameStartEvent?.videoTime ?? gameEvents[0]?.videoTime ?? 0;

  // Infer starters: A player started if their first sub is OUT, 
  // or they record stats before any sub IN, or they record stats and have NO subs.
  const inferredStarters = new Set<string>();
  const seenSubIn = new Set<string>();

  for (const e of gameEvents) {
    // Don't filter by teamId — CSV data has empty teamIds on subs
    const pid = e.playerId;

    if (e.type === 'sub_out') {
      if (pid && !seenSubIn.has(pid)) inferredStarters.add(pid);
    } else if (e.type === 'sub_in') {
      if (pid) seenSubIn.add(pid);
    } else if (pid) {
      // It's a game event (goal, shot, etc.)
      if (!seenSubIn.has(pid)) inferredStarters.add(pid);
    }
  }

  // Initialize inferred starters
  for (const pid of inferredStarters) {
    if (allTeamPlayerIds.has(pid)) {
      const firstOutSub = gameEvents.find(e => e.type === 'sub_out' && e.playerId === pid);
      currentStart.set(pid, { time: gameStartTime, pos: firstOutSub?.position });
    }
  }

  for (const e of gameEvents) {
    // Don't filter subs by teamId — CSV data has empty teamIds on subs
    if (e.type === 'sub_out') {
      if (e.playerId && currentStart.has(e.playerId)) {
        const startData = currentStart.get(e.playerId)!;
        stints.push({
          playerId: e.playerId,
          teamId,
          startTime: startData.time,
          endTime: e.videoTime,
          position: startData.pos || e.position,
        });
        currentStart.delete(e.playerId);
      }
    } else if (e.type === 'sub_in') {
      if (e.playerId && allTeamPlayerIds.has(e.playerId)) {
        currentStart.set(e.playerId, { time: e.videoTime, pos: e.position });
      }
    }
  }

  // Close all remaining stints at game end
  for (const [pid, startData] of currentStart) {
    stints.push({
      playerId: pid,
      teamId,
      startTime: startData.time,
      endTime: gameEndTime,
      position: startData.pos,
    });
  }

  return stints;
}

export function computeAdvancedStats(
  events: GameEvent[],
  players: Player[],
  games: Game[],
  filters: { seasonId?: string; teamId?: string; position?: 'chaser' | 'keeper' }
): AdvancedPlayerStats[] {
  // Build player lookup by ID
  const playerMap = new Map<string, Player>();
  players.forEach(p => playerMap.set(p.id, p));

  // Filter games by season
  let relevantGames = games;
  if (filters.seasonId) {
    relevantGames = games.filter(g => g.seasonId === filters.seasonId);
  }
  const relevantGameIds = new Set(relevantGames.map(g => g.id));

  // Group events by game
  const eventsByGame = new Map<string, GameEvent[]>();
  for (const e of events) {
    if (!relevantGameIds.has(e.gameId)) continue;
    if (!eventsByGame.has(e.gameId)) eventsByGame.set(e.gameId, []);
    eventsByGame.get(e.gameId)!.push(e);
  }

  // Accumulators
  const statsAccum = new Map<string, {
    plus: number;
    minus: number;
    plusMinus: number;
    minutesPlayed: number;
    goals: number;
    assists: number;
    shots: number;
    turnovers: number;
    teamPossessions: number;
    oppPossessions: number;
    teamTurnoversOn: number;
    oppTurnoversOn: number;
    teamGoalsInGames: number;
    oppGoalsInGames: number;
    gameIds: Set<string>;
  }>();

  const getAccum = (pid: string) => {
    if (!statsAccum.has(pid)) {
      statsAccum.set(pid, {
        plus: 0,
        minus: 0,
        plusMinus: 0,
        minutesPlayed: 0,
        goals: 0,
        assists: 0,
        shots: 0,
        turnovers: 0,
        teamPossessions: 0,
        oppPossessions: 0,
        teamTurnoversOn: 0,
        oppTurnoversOn: 0,
        teamGoalsInGames: 0,
        oppGoalsInGames: 0,
        gameIds: new Set(),
      });
    }
    return statsAccum.get(pid)!;
  };

  // Process each game
  for (const [gameId, gameEvents] of eventsByGame) {
    const game = relevantGames.find(g => g.id === gameId);
    if (!game) continue;

    const sorted = [...gameEvents].sort((a, b) => a.videoTime - b.videoTime);
    const clockIntervals = computeGameClockIntervals(sorted);

    // Infer teams from events since game records may have 'unknown'
    const { homeTeamId: discHome, awayTeamId: discAway } = discoverGameTeams(sorted, game.homeTeamId, game.awayTeamId);
    
    // If we only discovered an away team, the unidentified players belong to an inferred home team
    const resolvedHomeId = (discHome === null && discAway) ? 'home_inferred' : (discHome || game.homeTeamId);
    const resolvedAwayId = discAway || game.awayTeamId;

    // Infer player team assignments via explicit events and substitution chains
    const playerTeamMap = buildPlayerTeamMap(sorted);

    const homePlayerIds = new Set<string>();
    const awayPlayerIds = new Set<string>();
    
    for (const [pid, team] of playerTeamMap.entries()) {
      if (team === resolvedHomeId) homePlayerIds.add(pid);
      else if (team === resolvedAwayId) awayPlayerIds.add(pid);
    }

    // Unmapped players belong to the inferred home team, or if single-team game
    if (discHome === null && discAway) {
      for (const e of sorted) {
        if (isValidPlayerId(e.playerId) && !playerTeamMap.has(e.playerId!)) homePlayerIds.add(e.playerId!);
        if (isValidPlayerId(e.subPlayerId) && !playerTeamMap.has(e.subPlayerId!)) homePlayerIds.add(e.subPlayerId!);
      }
    } else if (playerTeamMap.size === 0) {
      // Legacy fallback for totally untagged single-team CSV
      for (const e of sorted) {
        if (isValidPlayerId(e.playerId)) homePlayerIds.add(e.playerId!);
        if (isValidPlayerId(e.subPlayerId)) homePlayerIds.add(e.subPlayerId!);
      }
    }

    // If filtering by team, only process that team's stats
    // Note: fallback to game.homeTeamId/awayTeamId to match the dropdown value 'unknown' if selected
    const processHome = !filters.teamId || filters.teamId === resolvedHomeId || filters.teamId === game.homeTeamId;
    const processAway = !filters.teamId || filters.teamId === resolvedAwayId || filters.teamId === game.awayTeamId;

    const gameEndEvent = sorted.find(e => e.type === 'gameEnd' || e.type === 'gameend');
    const gameEndTime = gameEndEvent?.videoTime ?? sorted[sorted.length - 1]?.videoTime ?? 0;

    // Compute stints for minutes
    let homeStints: StintRecord[] = [];
    let awayStints: StintRecord[] = [];

    if (processHome) {
      homeStints = computePlayerStints(sorted, resolvedHomeId, homePlayerIds, gameEndTime);
      for (const stint of homeStints) {
        const accum = getAccum(stint.playerId);
        accum.minutesPlayed += getGameMinutesInWindow(clockIntervals, stint.startTime, stint.endTime);
      }
    }
    if (processAway) {
      awayStints = computePlayerStints(sorted, resolvedAwayId, awayPlayerIds, gameEndTime);
      for (const stint of awayStints) {
        const accum = getAccum(stint.playerId);
        accum.minutesPlayed += getGameMinutesInWindow(clockIntervals, stint.startTime, stint.endTime);
      }
    }

    const hasExplicitPossessions = sorted.some(e => {
      const t = (e.type || '').toUpperCase();
      return t === 'OFFENSE' || t === 'DEFENSE';
    });

    let currentInferredPossTeam: string | null = null;
    let didCurrentPossShoot = false;

    // +/- and possession computation: for each goal, shot, turnover OR possession event, find who's on field
    for (const e of sorted) {
      const t = (e.type || '').toUpperCase();
      const isGoal = t === 'GOAL';
      const isShot = t === 'SHOT';
      const isTurnover = t === 'TURNOVER';
      const isExplicitOffense = t === 'OFFENSE';
      const isExplicitDefense = t === 'DEFENSE';
      const isStartEvent = t === 'CONTROL_START' || t === 'QUADBALL_START';

      if (!isGoal && !isShot && !isTurnover && !isExplicitOffense && !isExplicitDefense && !isStartEvent) continue;

      let eventTeamId = e.teamId;
      if (!eventTeamId && e.playerId) {
        eventTeamId = playerTeamMap.get(e.playerId);
      }
      // Fallback for single-team dataset or inferred home team
      if (!eventTeamId && (playerTeamMap.size === 0 || (discHome === null && discAway))) {
        eventTeamId = resolvedHomeId;
      }
      if (!eventTeamId) continue;

      let isNewPossessionForEventTeam = false;

      if (!hasExplicitPossessions) {
        if (isGoal || isTurnover) {
           isNewPossessionForEventTeam = (currentInferredPossTeam !== eventTeamId);
           currentInferredPossTeam = null;
           didCurrentPossShoot = false;
        } else if (isShot) {
           isNewPossessionForEventTeam = (currentInferredPossTeam !== eventTeamId);
           currentInferredPossTeam = eventTeamId;
           didCurrentPossShoot = true;
        } else if (isStartEvent) {
           isNewPossessionForEventTeam = false;
           currentInferredPossTeam = eventTeamId;
           didCurrentPossShoot = false;
        }
      }

      const activeHome = processHome ? getActivePlayersAtTime(homeStints, e.videoTime, filters.position) : new Set<string>();
      const activeAway = processAway ? getActivePlayersAtTime(awayStints, e.videoTime, filters.position) : new Set<string>();

      for (const pid of activeHome) {
        const accum = getAccum(pid);
        if (isGoal) {
          if (eventTeamId === resolvedHomeId) { accum.plus++; accum.plusMinus++; }
          else if (eventTeamId === resolvedAwayId) { accum.minus++; accum.plusMinus--; }
        }
        if (isTurnover) {
          if (eventTeamId === resolvedHomeId) { accum.teamTurnoversOn++; }
          else if (eventTeamId === resolvedAwayId) { accum.oppTurnoversOn++; }
        }
        if (hasExplicitPossessions) {
          if ((isExplicitOffense && eventTeamId === resolvedHomeId) || (isExplicitDefense && eventTeamId === resolvedAwayId)) {
            accum.teamPossessions++;
          } else if ((isExplicitOffense && eventTeamId === resolvedAwayId) || (isExplicitDefense && eventTeamId === resolvedHomeId)) {
            accum.oppPossessions++;
          }
        } else {
          if (isNewPossessionForEventTeam) {
            if (eventTeamId === resolvedHomeId) { accum.teamPossessions++; } 
            else if (eventTeamId === resolvedAwayId) { accum.oppPossessions++; }
          }
        }
      }

      for (const pid of activeAway) {
        const accum = getAccum(pid);
        if (isGoal) {
          if (eventTeamId === resolvedAwayId) { accum.plus++; accum.plusMinus++; }
          else if (eventTeamId === resolvedHomeId) { accum.minus++; accum.plusMinus--; }
        }
        if (isTurnover) {
          if (eventTeamId === resolvedAwayId) { accum.teamTurnoversOn++; }
          else if (eventTeamId === resolvedHomeId) { accum.oppTurnoversOn++; }
        }
        if (hasExplicitPossessions) {
          if ((isExplicitOffense && eventTeamId === resolvedAwayId) || (isExplicitDefense && eventTeamId === resolvedHomeId)) {
            accum.teamPossessions++;
          } else if ((isExplicitOffense && eventTeamId === resolvedHomeId) || (isExplicitDefense && eventTeamId === resolvedAwayId)) {
            accum.oppPossessions++;
          }
        } else {
          if (isNewPossessionForEventTeam) {
            if (eventTeamId === resolvedAwayId) { accum.teamPossessions++; } 
            else if (eventTeamId === resolvedHomeId) { accum.oppPossessions++; }
          }
        }
      }
    }

    let homeGoalsThisGame = 0;
    let awayGoalsThisGame = 0;
    for (const e of sorted) {
      if ((e.type || '').toUpperCase() === 'GOAL') {
        let eTeam = e.teamId;
        if (!eTeam && e.playerId) eTeam = playerTeamMap.get(e.playerId);
        if (!eTeam && (playerTeamMap.size === 0 || (discHome === null && discAway))) eTeam = resolvedHomeId;

        if (eTeam === resolvedHomeId) homeGoalsThisGame++;
        else if (eTeam === resolvedAwayId) awayGoalsThisGame++;
      }
    }

    const homePlayersInGame = new Set<string>();
    const awayPlayersInGame = new Set<string>();

    if (processHome) {
      for (const stint of homeStints) {
        if (filters.position && stint.position !== filters.position) continue;
        homePlayersInGame.add(stint.playerId);
      }
    }
    if (processAway) {
      for (const stint of awayStints) {
        if (filters.position && stint.position !== filters.position) continue;
        awayPlayersInGame.add(stint.playerId);
      }
    }

    // Count basic stats for rate calculations
    for (const e of sorted) {
      if (!isValidPlayerId(e.playerId)) continue;
      const pid = e.playerId!;
      
      if (filters.position) {
         if (e.position && e.position !== filters.position) continue;
         if (!e.position) {
            const isHome = homePlayerIds.has(pid);
            const activeFilterPlayers = getActivePlayersAtTime(isHome ? homeStints : awayStints, e.videoTime, filters.position);
            if (!activeFilterPlayers.has(pid)) continue;
         }
      }

      let eTeam = e.teamId;
      if (!eTeam && e.playerId) eTeam = playerTeamMap.get(e.playerId);
      if (!eTeam && (playerTeamMap.size === 0 || (discHome === null && discAway))) eTeam = resolvedHomeId;
      if (filters.teamId && eTeam !== filters.teamId && filters.teamId !== game.homeTeamId && filters.teamId !== game.awayTeamId) continue;

      const isP_Home = homePlayerIds.has(pid);
      if (isP_Home && processHome) homePlayersInGame.add(pid);
      if (!isP_Home && processAway) awayPlayersInGame.add(pid);

      const accum = getAccum(pid);
      const t = (e.type || '').toLowerCase();
      if (t === 'goal') accum.goals++;
      else if (t === 'assist') accum.assists++;
      else if (t === 'shot') accum.shots++;
      else if (t === 'turnover') accum.turnovers++;
    }

    // Apply Games Played & Off-Pitch Goals correctly exactly once per game
    for (const pid of homePlayersInGame) {
      const accum = getAccum(pid);
      accum.gameIds.add(gameId);
      accum.teamGoalsInGames += homeGoalsThisGame;
      accum.oppGoalsInGames += awayGoalsThisGame;
    }
    for (const pid of awayPlayersInGame) {
      const accum = getAccum(pid);
      accum.gameIds.add(gameId);
      accum.teamGoalsInGames += awayGoalsThisGame;
      accum.oppGoalsInGames += homeGoalsThisGame;
    }
  }

  // Build final stats — only include players in the players collection
  const results: AdvancedPlayerStats[] = [];
  for (const [pid, accum] of statsAccum) {
    if (!playerMap.has(pid)) continue;
    const p = playerMap.get(pid)!;
    const minutes = accum.minutesPlayed;
    const points = accum.goals + accum.assists;

    const offPlus = accum.teamGoalsInGames - accum.plus;
    const offMinus = accum.oppGoalsInGames - accum.minus;
    const offPlusMinus = offPlus - offMinus;
    const onOffDt = accum.plusMinus - offPlusMinus;

    results.push({
      playerId: pid,
      playerName: `${p.firstName} ${p.lastName}`,
      firstName: p.firstName || pid,
      lastName: p.lastName || '',
      preferredName: p.preferredName,
      nickname: p.nickname,
      gamesPlayed: accum.gameIds.size,
      plus: accum.plus,
      minus: accum.minus,
      plusMinus: accum.plusMinus,
      plusMinusRatio: accum.minus > 0
        ? Math.round((accum.plus / accum.minus) * 100) / 100
        : accum.plus > 0 ? Infinity : 0,
      offPlusMinusRatio: offMinus > 0
        ? Math.round((offPlus / offMinus) * 100) / 100
        : offPlus > 0 ? Infinity : 0,
      offPlusMinus,
      onOffDt,
      minutesPlayed: Math.round(minutes * 10) / 10,
      teamPossessions: accum.teamPossessions,
      oppPossessions: accum.oppPossessions,
      goalsPerTwenty: minutes > 0 ? Math.round((accum.goals / minutes) * 20 * 100) / 100 : 0,
      assistsPerTwenty: minutes > 0 ? Math.round((accum.assists / minutes) * 20 * 100) / 100 : 0,
      pointsPerTwenty: minutes > 0 ? Math.round((points / minutes) * 20 * 100) / 100 : 0,
      shotPct: (accum.goals + accum.shots) > 0 ? Math.round((accum.goals / (accum.goals + accum.shots)) * 1000) / 10 : 0,
      assistToTurnover: accum.turnovers > 0
        ? Math.round((accum.assists / accum.turnovers) * 100) / 100
        : accum.assists > 0 ? Infinity : 0,
      goals: accum.goals,
      assists: accum.assists,
      shots: accum.shots,
      turnovers: accum.turnovers,
      teamTurnoversOn: accum.teamTurnoversOn,
      oppTurnoversOn: accum.oppTurnoversOn,
      points,
    });
  }

  return results;
}

// ─── Extended / Experimental Stats ───────────────────────────────────

export interface ExtendedPlayerStats {
  playerId: string;
  playerName: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  nickname?: string;
  gamesPlayed: number;
  // Core advanced
  minutesPlayed: number;
  plus: number;
  minus: number;
  plusMinus: number;
  plusMinusRatio: number;
  offPlusMinusRatio: number;
  // Basketball-inspired
  usgPct: number;        // Usage Rate — % of team events player is involved in while on-field
  eFGPct: number;        // Effective Goal % — weighted shooting efficiency
  gameScore: number;     // Game Score — Normalized Performance Rating per 20 min (includes +/- and individual stats)
  oRtg: number;          // Offensive Rating — Team goals scored per 100 possessions while on pitch
  dRtg: number;          // Defensive Rating — Opponent goals conceded per 100 possessions while on pitch
  netRtg: number;        // Net Rating — oRtg - dRtg
  tovPct: number;        // Turnover Rate — team turnovers per team possession while on field
  fTovPct: number;       // Forced Turnover Rate — opponent turnovers per opponent possession while on field
  // Per-20 rates
  turnoversPer20: number;
  shotsPer20: number;
  foulsPer20: number;
  // Totals
  goals: number;
  assists: number;
  shots: number;
  turnovers: number;
  fouls: number;
  points: number;
}

export function computeExtendedStats(
  events: GameEvent[],
  players: Player[],
  games: Game[],
  filters: { seasonId?: string; teamId?: string }
): ExtendedPlayerStats[] {
  // Reuse advanced stats computation for the heavy lifting
  const advanced = computeAdvancedStats(events, players, games, filters);
  const playerMap = new Map<string, Player>();
  players.forEach(p => playerMap.set(p.id, p));

  // Count additional stats (fouls) not in advanced
  const extraCounts = new Map<string, { fouls: number; totalTeamEvents: number }>();
  
  // Count total team events per game for usage rate
  const filtered = filters.seasonId
    ? events.filter(e => {
        const game = games.find(g => g.id === e.gameId);
        return game && game.seasonId === filters.seasonId;
      })
    : events;

  for (const e of filtered) {
    if (!isValidPlayerId(e.playerId)) continue;
    const pid = e.playerId!;
    if (!playerMap.has(pid)) continue;
    const eTeam = e.teamId || '';
    if (filters.teamId && eTeam && eTeam !== filters.teamId) continue;

    if (!extraCounts.has(pid)) {
      extraCounts.set(pid, { fouls: 0, totalTeamEvents: 0 });
    }
    const ec = extraCounts.get(pid)!;
    const t = (e.type || '').toLowerCase();
    if (t === 'foul') ec.fouls++;
    // Count play involvements (goals, assists, shots, turnovers)
    if (['goal', 'assist', 'shot', 'turnover'].includes(t)) {
      ec.totalTeamEvents++;
    }
  }

  return advanced.map(a => {
    const ec = extraCounts.get(a.playerId) || { fouls: 0, totalTeamEvents: 0 };
    const mins = a.minutesPlayed;
    const per20 = mins > 0 ? 20 / mins : 0;
    const teamPoss = a.teamPossessions;
    const oppPoss = a.oppPossessions;

    // Usage Rate: play involvements / team possessions
    const involvements = a.goals + a.assists + a.shots + a.turnovers;
    const usgPct = teamPoss > 0 ? Math.round((involvements / teamPoss) * 1000) / 10 : 0;

    // Effective Goal %: goals / (goals + shots), weight assists as half-goals
    const totalAttempts = a.goals + a.shots;
    const eFGPct = totalAttempts > 0
      ? Math.round(((a.goals + 0.5 * a.assists) / totalAttempts) * 1000) / 10
      : 0;

    // Offensive Rating: team goals generated per 100 offensive possessions
    const oRtg = teamPoss > 0 ? Math.round((a.plus / teamPoss) * 100 * 10) / 10 : 0;

    // Defensive Rating: opponent goals allowed per 100 defensive possessions
    const dRtg = oppPoss > 0 ? Math.round((a.minus / oppPoss) * 100 * 10) / 10 : 0;

    // Net Rating
    const netRtg = Math.round((oRtg - dRtg) * 10) / 10;

    // Game Score (GS/20): Normalized to impact per 20 minutes
    const points = a.goals + a.assists;
    const rawGameScore = (
      a.plusMinus +             // Core scoreboard impact
      (a.goals * 0.5) +         // Individual goal weight
      (a.assists * 0.4) +       // Individual assist weight
      (- a.shots * 0.2) +       // Missed shot penalty
      (- a.turnovers * 0.7) +   // Turnover penalty
      (- ec.fouls * 0.5)        // Foul penalty
    );
    const gameScore = mins > 0 ? Math.round((rawGameScore / mins) * 20 * 10) / 10 : 0;

    // Turnover Rate: Team Turnovers per Team Possession while on pitch
    const tovPct = teamPoss > 0
      ? Math.round((a.teamTurnoversOn / teamPoss) * 1000) / 10
      : 0;

    // Forced Turnover Rate: Opponent Turnovers per Opponent Possession while on pitch
    const fTovPct = oppPoss > 0
      ? Math.round((a.oppTurnoversOn / oppPoss) * 1000) / 10
      : 0;

    return {
      playerId: a.playerId,
      playerName: a.playerName,
      firstName: a.firstName,
      lastName: a.lastName,
      preferredName: a.preferredName,
      nickname: a.nickname,
      gamesPlayed: a.gamesPlayed,
      minutesPlayed: a.minutesPlayed,
      plus: a.plus,
      minus: a.minus,
      plusMinus: a.plusMinus,
      plusMinusRatio: a.minus > 0
        ? Math.round((a.plus / a.minus) * 100) / 100
        : a.plus > 0 ? Infinity : 0,
      offPlusMinusRatio: a.offPlusMinusRatio,
      offPlusMinus: a.offPlusMinus,
      onOffDt: a.onOffDt,
      usgPct,
      eFGPct,
      gameScore,
      oRtg,
      dRtg,
      netRtg,
      tovPct,
      fTovPct,
      turnoversPer20: Math.round(a.turnovers * per20 * 100) / 100,
      shotsPer20: Math.round(a.shots * per20 * 100) / 100,
      foulsPer20: Math.round(ec.fouls * per20 * 100) / 100,
      goals: a.goals,
      assists: a.assists,
      shots: a.shots,
      turnovers: a.turnovers,
      fouls: ec.fouls,
      points,
    };
  });
}
// ─── Beater Stats ────────────────────────────────────────────────────

type PositionType = 'chaser' | 'keeper' | 'beater' | 'seeker';

const PLACEHOLDER_TO_POSITION: Record<string, PositionType> = {
  chasera: 'chaser', chaserb: 'chaser', chaserc: 'chaser',
  keeper: 'keeper',
  beatera: 'beater', beaterb: 'beater',
  seeker: 'seeker',
  // Also support capitalized variants (IDs are no longer normalized)
  ChaserA: 'chaser', ChaserB: 'chaser', ChaserC: 'chaser',
  Keeper: 'keeper',
  BeaterA: 'beater', BeaterB: 'beater',
  Seeker: 'seeker',
};

function getPlaceholderPosition(pid: string): PositionType | undefined {
  return PLACEHOLDER_TO_POSITION[pid] || PLACEHOLDER_TO_POSITION[pid.toLowerCase()];
}

export interface BeaterStint {
  playerId: string;
  teamId: string;
  gameId: string;
  startTime: number;
  endTime: number;
}

/**
 * Build beater-specific stints by tracking position through substitution events.
 * Enforces a strict 2-slot limit and handles placeholder IDs.
 *
 * IMPORTANT: Does NOT filter by teamId on the event itself, because the CSV
 * data almost never has a teamId on substitution rows. Instead, we accept ALL
 * substitution events that are beater-related (position === 'beater', or
 * placeholder beater IDs, or outgoing player already tracked in a slot).
 * The caller's `teamId` is used only to tag the returned stints.
 */
function computeBeaterStints(
  gameEvents: GameEvent[],
  teamId: string,
  gameId: string,
  gameEndTime: number,
  playerTeamMap: Map<string, string>
): BeaterStint[] {
  const stints: BeaterStint[] = [];

  // Slot 0 and Slot 1. Maps slot index to { playerId, startTime }
  const slots: ({ playerId: string, startTime: number } | null)[] = [null, null];

  const gameStartEvent = gameEvents.find(e => (e.type || '').toLowerCase() === 'gamestart');
  const gameStartTime = gameStartEvent?.videoTime ?? gameEvents[0]?.videoTime ?? 0;

  // Only look at substitution events, sorted by time
  const subs = gameEvents
    .filter(e => {
       if (e.type !== 'sub_in' && e.type !== 'sub_out') return false;
       let eTeam = e.teamId;
       const pid = e.playerId?.trim();
       if (!eTeam && pid) eTeam = playerTeamMap.get(pid);
       if (!eTeam && playerTeamMap.size === 0) eTeam = teamId; // fallback logic if 1-team
       return eTeam === teamId;
    })
    .sort((a, b) => a.videoTime - b.videoTime);

  for (const e of subs) {
    const pid = e.playerId?.trim() || null;

    // Is this a beater sub?
    let isBeaterSub = false;
    if (e.position === 'beater') isBeaterSub = true;
    if (pid && getPlaceholderPosition(pid) === 'beater') isBeaterSub = true;

    // Check if the player is already in one of our tracked slots
    let slotIdx = -1;
    if (pid) {
      if (slots[0]?.playerId === pid) { slotIdx = 0; isBeaterSub = true; }
      else if (slots[1]?.playerId === pid) { slotIdx = 1; isBeaterSub = true; }
    }

    if (!isBeaterSub) continue;

    if (e.type === 'sub_out') {
      if (slotIdx >= 0 && pid) {
        stints.push({
          playerId: slots[slotIdx]!.playerId,
          teamId, gameId,
          startTime: slots[slotIdx]!.startTime,
          endTime: e.videoTime
        });
        slots[slotIdx] = null;
      }
    } else if (e.type === 'sub_in') {
      if (slotIdx === -1 && pid) {
        // Find an open slot
        const openIdx = slots[0] === null ? 0 : (slots[1] === null ? 1 : -1);
        if (openIdx >= 0) {
          slots[openIdx] = { playerId: pid, startTime: e.videoTime };
        } else {
          // FIFO replacement (eject the player who has been playing longest)
          const targetSlot = slots[0]!.startTime <= slots[1]!.startTime ? 0 : 1;
          stints.push({
            playerId: slots[targetSlot]!.playerId,
            teamId, gameId,
            startTime: slots[targetSlot]!.startTime,
            endTime: e.videoTime
          });
          slots[targetSlot] = { playerId: pid, startTime: e.videoTime };
        }
      }
    }
  }

  // Close remaining stints
  for (const slot of slots) {
    if (slot) {
      stints.push({
        playerId: slot.playerId,
        teamId, gameId,
        startTime: slot.startTime,
        endTime: gameEndTime
      });
    }
  }

  return stints.filter(s => !isPlaceholderId(s.playerId));
}

/**
 * Compute control periods for a game. Returns array of { teamId, startTime, endTime }.
 */
function computeControlPeriodsFromEvents(
  gameEvents: GameEvent[]
): { teamId: string; startTime: number; endTime: number }[] {
  const periods: { teamId: string; startTime: number; endTime: number }[] = [];
  let currentTeam: string | null = null;
  let currentStart = 0;

  for (const e of gameEvents) {
    if (e.type === 'control_change') {
      if (currentTeam && e.videoTime > currentStart) {
        periods.push({ teamId: currentTeam, startTime: currentStart, endTime: e.videoTime });
      }
      currentTeam = e.teamId || null;
      currentStart = e.videoTime;
    }
  }

  // Close final period at last event time
  if (currentTeam) {
    const lastEvent = gameEvents[gameEvents.length - 1];
    if (lastEvent && lastEvent.videoTime > currentStart) {
      periods.push({ teamId: currentTeam, startTime: currentStart, endTime: lastEvent.videoTime });
    }
  }
  return periods;
}

/**
 * Get total control seconds for a team within a [start, end] window.
 */
function getControlSecondsInWindow(
  controlPeriods: { teamId: string; startTime: number; endTime: number }[],
  teamId: string,
  windowStart: number,
  windowEnd: number,
  clockIntervals: [number, number][]
): number {
  let total = 0;
  for (const cp of controlPeriods) {
    if (cp.teamId !== teamId) continue;
    const overlapStart = Math.max(cp.startTime, windowStart);
    const overlapEnd = Math.min(cp.endTime, windowEnd);
    if (overlapEnd > overlapStart) {
      total += getGameSecondsInWindow(clockIntervals, overlapStart, overlapEnd);
    }
  }
  return total;
}

/**
 * Get total game-clock seconds in a window (reusing the existing function but returning seconds).
 */
function getGameSecondsInWindow(
  clockIntervals: [number, number][],
  windowStart: number,
  windowEnd: number
): number {
  let total = 0;
  for (const [s, e] of clockIntervals) {
    const overlapStart = Math.max(s, windowStart);
    const overlapEnd = Math.min(e, windowEnd);
    if (overlapEnd > overlapStart) {
      total += overlapEnd - overlapStart;
    }
  }
  return total;
}

// ── Solo Beater Stats ──

export interface BeaterSoloStats {
  playerId: string;
  playerName: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  nickname?: string;
  gamesPlayed: number;
  plus: number;
  minus: number;
  plusMinus: number;
  plusMinusRatio: number;
  offPlusMinusRatio: number;
  offPlusMinus: number;
  onOffDt: number;
  controlMinutes: number;      // minutes their team had control while on field
  totalMinutes: number;        // total game-clock minutes on field
  controlPct: number;          // controlMinutes / totalMinutes × 100
}

export function computeBeaterSoloStats(
  events: GameEvent[],
  players: Player[],
  games: Game[],
  filters: { seasonId?: string; teamId?: string }
): BeaterSoloStats[] {
  const playerMap = buildPlayerMap(events, players);
  const { eventsByGame, relevantGames } = groupEventsByGame(events, games, filters);

  const accum = new Map<string, {
    plus: number; minus: number;
    teamGoalsTotal: number; oppGoalsTotal: number;
    controlSeconds: number; totalSeconds: number;
    gameIds: Set<string>;
  }>();

  const getAcc = (pid: string) => {
    if (!accum.has(pid)) {
      accum.set(pid, { plus: 0, minus: 0, teamGoalsTotal: 0, oppGoalsTotal: 0, controlSeconds: 0, totalSeconds: 0, gameIds: new Set() });
    }
    return accum.get(pid)!;
  };

  for (const [gameId, gameEvents] of eventsByGame) {
    const game = relevantGames.find(g => g.id === gameId);
    if (!game) continue;
    const sorted = [...gameEvents].sort((a, b) => a.videoTime - b.videoTime);
    const clockIntervals = computeGameClockIntervals(sorted);
    const controlPeriods = computeControlPeriodsFromEvents(sorted);
    const gameEndEvent = sorted.find(e => (e.type || '').toLowerCase() === 'gameend');
    const gameEndTime = gameEndEvent?.videoTime ?? sorted[sorted.length - 1]?.videoTime ?? 0;

    const { homeTeamId: discHome, awayTeamId: discAway } = discoverGameTeams(sorted, game.homeTeamId, game.awayTeamId);
    const resolvedHomeId = (discHome === null && discAway) ? 'home_inferred' : (discHome || game.homeTeamId);
    const resolvedAwayId = discAway || game.awayTeamId;

    // Filters check original OR resolved
    if (filters.teamId && filters.teamId !== resolvedHomeId && filters.teamId !== resolvedAwayId && filters.teamId !== game.homeTeamId && filters.teamId !== game.awayTeamId) continue;

    const playerTeamMap = buildPlayerTeamMap(sorted);
    const homeStints = computeBeaterStints(sorted, resolvedHomeId, gameId, gameEndTime, playerTeamMap);
    const awayStints = computeBeaterStints(sorted, resolvedAwayId, gameId, gameEndTime, playerTeamMap);
    const beaterStints = [...homeStints, ...awayStints];

    for (const stint of beaterStints) {
      if (filters.teamId && stint.teamId !== filters.teamId && filters.teamId !== game.homeTeamId && filters.teamId !== game.awayTeamId) continue;
      const acc = getAcc(stint.playerId);
      acc.gameIds.add(gameId);
      acc.controlSeconds += getControlSecondsInWindow(controlPeriods, stint.teamId, stint.startTime, stint.endTime, clockIntervals);
      acc.totalSeconds += getGameSecondsInWindow(clockIntervals, stint.startTime, stint.endTime);
    }

    let homeGoalsThisGame = 0;
    let awayGoalsThisGame = 0;

    // +/- for beaters during their stints
    for (const e of sorted) {
      if (e.type !== 'goal') continue;
      
      let eventTeamId = e.teamId;
      if (!eventTeamId && e.playerId) eventTeamId = playerTeamMap.get(e.playerId);
      if (!eventTeamId && (playerTeamMap.size === 0 || (discHome === null && discAway))) eventTeamId = resolvedHomeId;

      if (eventTeamId === resolvedHomeId) homeGoalsThisGame++;
      else if (eventTeamId === resolvedAwayId) awayGoalsThisGame++;

      for (const stint of beaterStints) {
        if (e.videoTime >= stint.startTime && e.videoTime <= stint.endTime) {
          const acc = getAcc(stint.playerId);
          acc.gameIds.add(gameId);
          if (eventTeamId === stint.teamId) { acc.plus++; }
          else if (eventTeamId) { acc.minus++; }
        }
      }
    }

    const homePlayersWithStints = new Set<string>();
    for (const stint of homeStints) homePlayersWithStints.add(stint.playerId);
    for (const pid of homePlayersWithStints) {
      if (filters.teamId && filters.teamId !== resolvedHomeId && filters.teamId !== game.homeTeamId && filters.teamId !== game.awayTeamId) continue;
      const acc = getAcc(pid);
      acc.teamGoalsTotal += homeGoalsThisGame;
      acc.oppGoalsTotal += awayGoalsThisGame;
    }

    const awayPlayersWithStints = new Set<string>();
    for (const stint of awayStints) awayPlayersWithStints.add(stint.playerId);
    for (const pid of awayPlayersWithStints) {
      if (filters.teamId && filters.teamId !== resolvedAwayId && filters.teamId !== game.homeTeamId && filters.teamId !== game.awayTeamId) continue;
      const acc = getAcc(pid);
      acc.teamGoalsTotal += awayGoalsThisGame;
      acc.oppGoalsTotal += homeGoalsThisGame;
    }
  }

  const results: BeaterSoloStats[] = [];
  for (const [pid, a] of accum) {
    const p = playerMap.get(pid);
    const controlMin = a.controlSeconds / 60;
    const totalMin = a.totalSeconds / 60;

    const offPlus = a.teamGoalsTotal - a.plus;
    const offMinus = a.oppGoalsTotal - a.minus;
    const offPlusMinus = offPlus - offMinus;
    const onOffDt = (a.plus - a.minus) - offPlusMinus;

    const plusMinusRatio = a.minus > 0 ? Math.round((a.plus / a.minus) * 100) / 100 : (a.plus > 0 ? Infinity : 0);
    const offPlusMinusRatio = offMinus > 0 ? Math.round((offPlus / offMinus) * 100) / 100 : (offPlus > 0 ? Infinity : 0);

    results.push({
      playerId: pid,
      playerName: p ? `${p.firstName} ${p.lastName}`.trim() : pid,
      firstName: p?.firstName || pid,
      lastName: p?.lastName || '',
      gamesPlayed: a.gameIds.size,
      plus: a.plus,
      minus: a.minus,
      plusMinus: a.plus - a.minus,
      plusMinusRatio,
      offPlusMinusRatio,
      offPlusMinus,
      onOffDt,
      controlMinutes: Math.round(controlMin * 10) / 10,
      totalMinutes: Math.round(totalMin * 10) / 10,
      controlPct: totalMin > 0 ? Math.round((controlMin / totalMin) * 1000) / 10 : 0,
    });
  }

  return results;
}

// ── Beater Pair Stats ──

export interface BeaterPairStats {
  pairKey: string;          // sorted "playerA|playerB"
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  gamesPlayed: number;
  plus: number;
  minus: number;
  plusMinus: number;
  plusMinusRatio: number;
  offPlusMinusRatio: number;
  offPlusMinus: number;
  onOffDt: number;
  controlMinutes: number;
  totalMinutes: number;
  controlPct: number;
}

/**
 * Find overlapping time windows where two beater stints from the same team overlap.
 */
function computePairOverlaps(
  stints: BeaterStint[]
): { player1: string; player2: string; teamId: string; gameId: string; start: number; end: number }[] {
  const overlaps: { player1: string; player2: string; teamId: string; gameId: string; start: number; end: number }[] = [];

  for (let i = 0; i < stints.length; i++) {
    for (let j = i + 1; j < stints.length; j++) {
      const a = stints[i];
      const b = stints[j];
      if (a.teamId !== b.teamId || a.gameId !== b.gameId) continue;
      if (a.playerId === b.playerId) continue;

      const overlapStart = Math.max(a.startTime, b.startTime);
      const overlapEnd = Math.min(a.endTime, b.endTime);

      if (overlapEnd > overlapStart) {
        const [p1, p2] = [a.playerId, b.playerId].sort();
        overlaps.push({
          player1: p1,
          player2: p2,
          teamId: a.teamId,
          gameId: a.gameId,
          start: overlapStart,
          end: overlapEnd,
        });
      }
    }
  }

  return overlaps;
}

export function computeBeaterPairStats(
  events: GameEvent[],
  players: Player[],
  games: Game[],
  filters: { seasonId?: string; teamId?: string }
): BeaterPairStats[] {
  const playerMap = buildPlayerMap(events, players);
  const { eventsByGame, relevantGames } = groupEventsByGame(events, games, filters);

  const accum = new Map<string, {
    player1Id: string; player2Id: string;
    plus: number; minus: number;
    teamGoalsTotal: number; oppGoalsTotal: number;
    controlSeconds: number; totalSeconds: number;
    gameIds: Set<string>;
  }>();

  const getPairAcc = (p1: string, p2: string) => {
    const [a, b] = [p1, p2].sort();
    const key = `${a}|${b}`;
    if (!accum.has(key)) {
      accum.set(key, {
        player1Id: a, player2Id: b,
        plus: 0, minus: 0,
        teamGoalsTotal: 0, oppGoalsTotal: 0,
        controlSeconds: 0, totalSeconds: 0,
        gameIds: new Set(),
      });
    }
    return accum.get(key)!;
  };

  for (const [gameId, gameEvents] of eventsByGame) {
    const game = relevantGames.find(g => g.id === gameId);
    if (!game) continue;
    const sorted = [...gameEvents].sort((a, b) => a.videoTime - b.videoTime);
    const clockIntervals = computeGameClockIntervals(sorted);
    const controlPeriods = computeControlPeriodsFromEvents(sorted);
    const gameEndEvent = sorted.find(e => (e.type || '').toLowerCase() === 'gameend');
    const gameEndTime = gameEndEvent?.videoTime ?? sorted[sorted.length - 1]?.videoTime ?? 0;

    const { homeTeamId: discHome, awayTeamId: discAway } = discoverGameTeams(sorted, game.homeTeamId, game.awayTeamId);
    const resolvedHomeId = (discHome === null && discAway) ? 'home_inferred' : (discHome || game.homeTeamId);
    const resolvedAwayId = discAway || game.awayTeamId;

    if (filters.teamId && filters.teamId !== resolvedHomeId && filters.teamId !== resolvedAwayId && filters.teamId !== game.homeTeamId && filters.teamId !== game.awayTeamId) continue;

    const playerTeamMap = buildPlayerTeamMap(sorted);
    const homeStints = computeBeaterStints(sorted, resolvedHomeId, gameId, gameEndTime, playerTeamMap);
    const awayStints = computeBeaterStints(sorted, resolvedAwayId, gameId, gameEndTime, playerTeamMap);
    const beaterStints = [...homeStints, ...awayStints];

    const pairOverlaps = computePairOverlaps(beaterStints);

    for (const overlap of pairOverlaps) {
      if (filters.teamId && overlap.teamId !== filters.teamId && filters.teamId !== game.homeTeamId && filters.teamId !== game.awayTeamId) continue;
      const acc = getPairAcc(overlap.player1, overlap.player2);
      acc.gameIds.add(gameId);
      acc.controlSeconds += getControlSecondsInWindow(controlPeriods, overlap.teamId, overlap.start, overlap.end, clockIntervals);
      acc.totalSeconds += getGameSecondsInWindow(clockIntervals, overlap.start, overlap.end);
    }

    let homeGoalsThisGame = 0;
    let awayGoalsThisGame = 0;

    // +/- during pair overlaps
    for (const e of sorted) {
      if (e.type !== 'goal') continue;
      
      let eventTeamId = e.teamId;
      if (!eventTeamId && e.playerId) eventTeamId = playerTeamMap.get(e.playerId);
      if (!eventTeamId && (playerTeamMap.size === 0 || (discHome === null && discAway))) eventTeamId = resolvedHomeId;

      if (eventTeamId === resolvedHomeId) homeGoalsThisGame++;
      else if (eventTeamId === resolvedAwayId) awayGoalsThisGame++;

      for (const overlap of pairOverlaps) {
        if (e.videoTime >= overlap.start && e.videoTime <= overlap.end) {
          const acc = getPairAcc(overlap.player1, overlap.player2);
          acc.gameIds.add(gameId);
          if (eventTeamId === overlap.teamId) { acc.plus++; }
          else if (eventTeamId) { acc.minus++; }
        }
      }
    }

    const homePairsWithStints = new Set<string>();
    for (const overlap of pairOverlaps) {
      if (overlap.teamId === resolvedHomeId) homePairsWithStints.add(`${overlap.player1}|${overlap.player2}`);
    }
    for (const pairKey of homePairsWithStints) {
      if (filters.teamId && filters.teamId !== resolvedHomeId && filters.teamId !== game.homeTeamId && filters.teamId !== game.awayTeamId) continue;
      const [p1, p2] = pairKey.split('|');
      const acc = getPairAcc(p1, p2);
      acc.teamGoalsTotal += homeGoalsThisGame;
      acc.oppGoalsTotal += awayGoalsThisGame;
    }

    const awayPairsWithStints = new Set<string>();
    for (const overlap of pairOverlaps) {
      if (overlap.teamId === resolvedAwayId) awayPairsWithStints.add(`${overlap.player1}|${overlap.player2}`);
    }
    for (const pairKey of awayPairsWithStints) {
      if (filters.teamId && filters.teamId !== resolvedAwayId && filters.teamId !== game.homeTeamId && filters.teamId !== game.awayTeamId) continue;
      const [p1, p2] = pairKey.split('|');
      const acc = getPairAcc(p1, p2);
      acc.teamGoalsTotal += awayGoalsThisGame;
      acc.oppGoalsTotal += homeGoalsThisGame;
    }
  }

  const results: BeaterPairStats[] = [];
  for (const [key, a] of accum) {
    const p1 = playerMap.get(a.player1Id);
    const p2 = playerMap.get(a.player2Id);
    const controlMin = a.controlSeconds / 60;
    const totalMin = a.totalSeconds / 60;

    const offPlus = a.teamGoalsTotal - a.plus;
    const offMinus = a.oppGoalsTotal - a.minus;
    const offPlusMinus = offPlus - offMinus;
    const onOffDt = (a.plus - a.minus) - offPlusMinus;

    const plusMinusRatio = a.minus > 0 ? Math.round((a.plus / a.minus) * 100) / 100 : (a.plus > 0 ? Infinity : 0);
    const offPlusMinusRatio = offMinus > 0 ? Math.round((offPlus / offMinus) * 100) / 100 : (offPlus > 0 ? Infinity : 0);

    results.push({
      pairKey: key,
      player1Id: a.player1Id,
      player1Name: p1 ? `${p1.firstName} ${p1.lastName}`.trim() : a.player1Id,
      player2Id: a.player2Id,
      player2Name: p2 ? `${p2.firstName} ${p2.lastName}`.trim() : a.player2Id,
      gamesPlayed: a.gameIds.size,
      plus: a.plus,
      minus: a.minus,
      plusMinus: a.plus - a.minus,
      plusMinusRatio,
      offPlusMinusRatio,
      offPlusMinus,
      onOffDt,
      controlMinutes: Math.round(controlMin * 10) / 10,
      totalMinutes: Math.round(totalMin * 10) / 10,
      controlPct: totalMin > 0 ? Math.round((controlMin / totalMin) * 1000) / 10 : 0,
    });
  }

  return results;
}

// ─── Shared helpers ──────────────────────────────────────────────────

function buildPlayerMap(events: GameEvent[], players: Player[]): Map<string, Player> {
  const m = new Map<string, Player>();
  players.forEach(p => {
    m.set(p.id.trim(), p);
  });
  events.forEach(e => {
    if (e.playerId) {
      const nid = e.playerId.trim();
      if (!m.has(nid)) {
        const parts = e.playerId.trim().split(/[\s_]+/);
        m.set(nid, { id: nid, firstName: parts[0] || nid, lastName: parts.slice(1).join(' ') || '' });
      }
    }
  });
  return m;
}

function groupEventsByGame(
  events: GameEvent[],
  games: Game[],
  filters: { seasonId?: string; teamId?: string }
): { eventsByGame: Map<string, GameEvent[]>; relevantGames: Game[] } {
  let relevantGames = games;
  if (filters.seasonId) {
    relevantGames = games.filter(g => g.seasonId === filters.seasonId);
  }
  const relevantGameIds = new Set(relevantGames.map(g => g.id));

  const eventsByGame = new Map<string, GameEvent[]>();
  for (const e of events) {
    if (!relevantGameIds.has(e.gameId)) continue;
    if (!eventsByGame.has(e.gameId)) eventsByGame.set(e.gameId, []);
    eventsByGame.get(e.gameId)!.push(e);
  }

  return { eventsByGame, relevantGames };
}

// ─── Seeker Stats ────────────────────────────────────────────────────

const GOAL_PTS = 10;
const FLAG_CATCH_PTS = 35;

export interface SeekerStats {
  playerId: string;
  playerName: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  nickname?: string;
  gamesPlayed: number;        // games where this player subbed in as seeker
  catches: number;            // total flag_catch events by this player
  opponentCatches: number;    // flag_catch by opponent while this seeker was on pitch
  opportunities: number;      // flag opportunities (games with flag_released while on field)
  catchPct: number;           // catches / opportunities × 100
  minutesPlayed: number;      // total game-clock minutes on pitch as seeker
  avgMinPerGame: number;       // avg game-clock minutes per game as seeker
  controlPct: number;         // team's bludger control % while this seeker is on pitch
  avgTimeToCatch: number;     // avg seconds from flag_released to flag_catch (only catching games)
  avgPointDiff: number;       // avg point differential (own team - opponent) at moment of catch
  gameWinningCatches: number; // catches that put team over the score cap
  catchPctWhileWinning: number;
  catchPctWhilelosing: number;
  catchesWhileWinning: number;
  oppsWhileWinning: number;
  catchesWhileLosing: number;
  oppsWhileLosing: number;
}

interface SeekerGameResult {
  playerId: string;
  teamId: string;
  gameId: string;
  caught: boolean;
  opponentCaught: boolean;
  timeToCatch: number | null;
  pointDiffAtCatch: number | null;
  gameWinning: boolean;
  teamLeadingAtRelease: 'winning' | 'losing' | 'tied';
}

export function computeSeekerStats(
  events: GameEvent[],
  players: Player[],
  games: Game[],
  filters: { seasonId?: string; teamId?: string }
): SeekerStats[] {
  const playerMap = buildPlayerMap(events, players);
  const { eventsByGame, relevantGames } = groupEventsByGame(events, games, filters);

  // Accumulators for time-based stats
  const timeAccum = new Map<string, { minutesSeeking: number; controlSeconds: number; totalSeconds: number; gameIds: Set<string> }>();
  const getTimeAcc = (pid: string) => {
    if (!timeAccum.has(pid)) timeAccum.set(pid, { minutesSeeking: 0, controlSeconds: 0, totalSeconds: 0, gameIds: new Set() });
    return timeAccum.get(pid)!;
  };

  const allResults: SeekerGameResult[] = [];

  for (const [gameId, gameEvents] of eventsByGame) {
    const game = relevantGames.find(g => g.id === gameId);
    if (!game) continue;

    const sorted = [...gameEvents].sort((a, b) => a.videoTime - b.videoTime);
    const clockIntervals = computeGameClockIntervals(sorted);
    const controlPeriods = computeControlPeriodsFromEvents(sorted);

    const { homeTeamId: discHome, awayTeamId: discAway } = discoverGameTeams(sorted, game.homeTeamId, game.awayTeamId);
    const resolvedHomeId = (discHome === null && discAway) ? 'home_inferred' : (discHome || game.homeTeamId);
    const resolvedAwayId = discAway || game.awayTeamId;
    const playerTeamMap = buildPlayerTeamMap(sorted);

    const gameEndEvent = sorted.find(e => (e.type || '').toLowerCase() === 'gameend');
    const gameEndTime = gameEndEvent?.videoTime ?? sorted[sorted.length - 1]?.videoTime ?? 0;

    // Build seeker stints from sub_in/sub_out with position='seeker'
    // Also detect seekers from flag_catch events
    const seekerStints: { playerId: string; teamId: string; startTime: number; endTime: number }[] = [];
    const seekerPlayers = new Map<string, string>(); // playerId -> teamId

    for (const e of sorted) {
      if (e.type === 'sub_in' && e.playerId && (e.position === 'seeker')) {
        const teamId = e.teamId || playerTeamMap.get(e.playerId) || resolvedHomeId;
        seekerPlayers.set(e.playerId, teamId);
      }
      if (e.type === 'flag_catch' && e.playerId && e.teamId) {
        if (!seekerPlayers.has(e.playerId)) {
          seekerPlayers.set(e.playerId, e.teamId);
        }
      }
    }

    // Compute stints for each seeker
    for (const [pid, teamId] of seekerPlayers) {
      let onField = false;
      let stintStart = 0;

      for (const e of sorted) {
        if (e.playerId !== pid) continue;
        if (e.type === 'sub_in' && e.position === 'seeker') {
          if (!onField) {
            onField = true;
            stintStart = e.videoTime;
          }
        } else if (e.type === 'sub_out') {
          if (onField) {
            seekerStints.push({ playerId: pid, teamId, startTime: stintStart, endTime: e.videoTime });
            onField = false;
          }
        }
      }
      // If still on field at game end, close stint
      if (onField) {
        seekerStints.push({ playerId: pid, teamId, startTime: stintStart, endTime: gameEndTime });
      }

      // If no explicit sub_in but they caught the flag, give them a stint from flag_released to catch/gameEnd
      if (seekerStints.filter(s => s.playerId === pid).length === 0) {
        const flagReleased = sorted.find(e => e.type === 'flag_released');
        const catchEvent = sorted.find(e => e.type === 'flag_catch' && e.playerId === pid);
        if (flagReleased) {
          seekerStints.push({
            playerId: pid,
            teamId,
            startTime: flagReleased.videoTime,
            endTime: catchEvent?.videoTime ?? gameEndTime
          });
        }
      }
    }

    // Compute time stats for each seeker stint
    for (const stint of seekerStints) {
      if (filters.teamId && stint.teamId !== filters.teamId) continue;
      const acc = getTimeAcc(stint.playerId);
      acc.gameIds.add(gameId);
      acc.minutesSeeking += getGameMinutesInWindow(clockIntervals, stint.startTime, stint.endTime);
      const totalSec = getGameSecondsInWindow(clockIntervals, stint.startTime, stint.endTime);
      acc.totalSeconds += totalSec;
      acc.controlSeconds += getControlSecondsInWindow(controlPeriods, stint.teamId, stint.startTime, stint.endTime, clockIntervals);
    }

    // Find flag_released time
    const flagReleasedEvent = sorted.find(e => e.type === 'flag_released');
    const flagReleasedTime = flagReleasedEvent?.videoTime ?? null;
    const flagReleasedGameTime = flagReleasedEvent?.gameTime ?? null;

    // Compute running scores at flag_released time
    let homeAtRelease = 0;
    let awayAtRelease = 0;
    for (const e of sorted) {
      if (flagReleasedTime !== null && e.videoTime > flagReleasedTime) break;
      if (e.type === 'goal') {
        if (e.teamId === game.homeTeamId) homeAtRelease += GOAL_PTS;
        else if (e.teamId === game.awayTeamId) awayAtRelease += GOAL_PTS;
      }
    }

    // Score cap at flag_released
    const scoreCap = flagReleasedTime !== null
      ? Math.max(homeAtRelease, awayAtRelease) + 60
      : null;

    // Find flag_catch events
    const catchEvents = sorted.filter(e => e.type === 'flag_catch' && e.playerId);

    // For each catch, compute stats
    for (const catchEvent of catchEvents) {
      let homeAtCatch = 0;
      let awayAtCatch = 0;
      for (const e of sorted) {
        if (e.videoTime > catchEvent.videoTime) break;
        if (e.type === 'goal') {
          if (e.teamId === game.homeTeamId) homeAtCatch += GOAL_PTS;
          else if (e.teamId === game.awayTeamId) awayAtCatch += GOAL_PTS;
        }
      }
      if (catchEvent.teamId === game.homeTeamId) homeAtCatch += FLAG_CATCH_PTS;
      else if (catchEvent.teamId === game.awayTeamId) awayAtCatch += FLAG_CATCH_PTS;

      const nid = catchEvent.playerId!.trim();
      const isHome = catchEvent.teamId === game.homeTeamId;
      const ownScore = isHome ? homeAtCatch : awayAtCatch;
      const oppScore = isHome ? awayAtCatch : homeAtCatch;
      const pointDiff = ownScore - oppScore;
      const gameWinning = scoreCap !== null && ownScore >= scoreCap;
      
      let timeToCatch = null;
      if (flagReleasedTime !== null) {
        if (catchEvent.gameTime !== undefined && flagReleasedGameTime !== null) {
          timeToCatch = catchEvent.gameTime - flagReleasedGameTime;
        } else {
          timeToCatch = catchEvent.videoTime - flagReleasedTime;
        }
      }

      const ownAtRelease = isHome ? homeAtRelease : awayAtRelease;
      const oppAtRelease = isHome ? awayAtRelease : homeAtRelease;
      const teamStatus: 'winning' | 'losing' | 'tied' =
        ownAtRelease > oppAtRelease ? 'winning' : ownAtRelease < oppAtRelease ? 'losing' : 'tied';

      // This is the catcher's own result
      allResults.push({
        playerId: nid,
        teamId: catchEvent.teamId!,
        gameId,
        caught: true,
        opponentCaught: false,
        timeToCatch,
        pointDiffAtCatch: pointDiff,
        gameWinning,
        teamLeadingAtRelease: teamStatus,
      });

      // Find opponent seekers who were on field when this catch happened — they get an OpCTH
      for (const stint of seekerStints) {
        if (stint.teamId === catchEvent.teamId) continue; // same team, skip
        if (catchEvent.videoTime >= stint.startTime && catchEvent.videoTime <= stint.endTime) {
          const sIsHome = stint.teamId === game.homeTeamId;
          const sOwnAtRelease = sIsHome ? homeAtRelease : awayAtRelease;
          const sOppAtRelease = sIsHome ? awayAtRelease : homeAtRelease;
          const sTeamStatus: 'winning' | 'losing' | 'tied' =
            sOwnAtRelease > sOppAtRelease ? 'winning' : sOwnAtRelease < sOppAtRelease ? 'losing' : 'tied';

          allResults.push({
            playerId: stint.playerId,
            teamId: stint.teamId,
            gameId,
            caught: false,
            opponentCaught: true,
            timeToCatch: null,
            pointDiffAtCatch: null,
            gameWinning: false,
            teamLeadingAtRelease: sTeamStatus,
          });
        }
      }
    }

    // For seekers who were on field but neither caught nor got caught against
    const processedIds = new Set(allResults.filter(r => r.gameId === gameId).map(r => r.playerId));
    for (const [seekerId, teamId] of seekerPlayers) {
      if (processedIds.has(seekerId)) continue;
      if (filters.teamId && teamId !== filters.teamId) continue;

      const isHome = teamId === game.homeTeamId;
      const ownAtRelease = isHome ? homeAtRelease : awayAtRelease;
      const oppAtRelease = isHome ? awayAtRelease : homeAtRelease;
      const teamStatus: 'winning' | 'losing' | 'tied' =
        ownAtRelease > oppAtRelease ? 'winning' : ownAtRelease < oppAtRelease ? 'losing' : 'tied';

      allResults.push({
        playerId: seekerId,
        teamId,
        gameId,
        caught: false,
        opponentCaught: false,
        timeToCatch: null,
        pointDiffAtCatch: null,
        gameWinning: false,
        teamLeadingAtRelease: teamStatus,
      });
    }
  }

  // Apply team filter 
  const filteredResults = filters.teamId
    ? allResults.filter(r => r.teamId === filters.teamId)
    : allResults;

  // Aggregate per player — deduplicate by gameId
  const playerResults = new Map<string, SeekerGameResult[]>();
  for (const r of filteredResults) {
    if (!playerResults.has(r.playerId)) playerResults.set(r.playerId, []);
    playerResults.get(r.playerId)!.push(r);
  }

  const stats: SeekerStats[] = [];
  for (const [pid, results] of playerResults) {
    const p = playerMap.get(pid);
    const catches = results.filter(r => r.caught);
    const catchesNum = catches.length;
    const opponentCatches = results.filter(r => r.opponentCaught).length;
    // Total catch opportunities are games where they played seeker (1 per game)
    const uniqueGames = new Set(results.map(r => r.gameId)).size;
    const opportunities = uniqueGames;

    const avgTime = catchesNum > 0
      ? Math.round(catches.reduce((s, r) => s + (r.timeToCatch ?? 0), 0) / catchesNum)
      : 0;
    const avgDiff = catchesNum > 0
      ? Math.round(catches.reduce((s, r) => s + (r.pointDiffAtCatch ?? 0), 0) / catchesNum * 10) / 10
      : 0;
    const gwCatches = catches.filter(r => r.gameWinning).length;

    const whileWinning = results.filter(r => r.teamLeadingAtRelease === 'winning');
    const whileLosing = results.filter(r => r.teamLeadingAtRelease === 'losing');
    const catchesWinning = whileWinning.filter(r => r.caught).length;
    const catchesLosing = whileLosing.filter(r => r.caught).length;

    const tAcc = timeAccum.get(pid);
    const minutesPlayed = tAcc ? Math.round((tAcc.totalSeconds / 60) * 10) / 10 : 0;
    const controlPct = tAcc && tAcc.totalSeconds > 0
      ? Math.round((tAcc.controlSeconds / tAcc.totalSeconds) * 1000) / 10
      : 0;

    stats.push({
      playerId: pid,
      playerName: p ? `${p.firstName} ${p.lastName}`.trim() : pid,
      firstName: p?.firstName || pid,
      lastName: p?.lastName || '',
      gamesPlayed: uniqueGames,
      catches: catchesNum,
      opponentCatches,
      opportunities,
      catchPct: opportunities > 0 ? Math.round((catchesNum / opportunities) * 1000) / 10 : 0,
      minutesPlayed,
      avgMinPerGame: uniqueGames > 0 ? Math.round((minutesPlayed / uniqueGames) * 10) / 10 : 0,
      controlPct,
      avgTimeToCatch: avgTime,
      avgPointDiff: avgDiff,
      gameWinningCatches: gwCatches,
      catchPctWhileWinning: whileWinning.length > 0
        ? Math.round((catchesWinning / whileWinning.length) * 1000) / 10
        : 0,
      catchPctWhilelosing: whileLosing.length > 0
        ? Math.round((catchesLosing / whileLosing.length) * 1000) / 10
        : 0,
      catchesWhileWinning: catchesWinning,
      oppsWhileWinning: whileWinning.length,
      catchesWhileLosing: catchesLosing,
      oppsWhileLosing: whileLosing.length,
    });
  }

  return stats;
}

/**
 * Iterates over chronological game events and infers true Quadball Game Time 
 * by tracking `gameStart` and `gamePause` stopwatch behaviors.
 */
export function enrichEventsWithGameTime<T extends { videoTime: number, type: string, gameTime?: number }>(events: T[]): T[] {
  const sorted = [...events].sort((a, b) => a.videoTime - b.videoTime);
  let runningGameTime = 0;
  let lastStartTime = -1;
  let clockRunning = false;

  return sorted.map(event => {
    let currentGameTime = runningGameTime;
    
    // Accumulate elapsed video duration while clock was running
    if (clockRunning && lastStartTime !== -1) {
      currentGameTime += (event.videoTime - lastStartTime);
      runningGameTime = currentGameTime;
      lastStartTime = event.videoTime;
    }

    // Process the event's mutation on the clock state for *future* rows
    if (event.type === 'gameStart') {
      clockRunning = true;
      lastStartTime = event.videoTime;
    } else if (event.type === 'gamePause') {
      clockRunning = false;
      lastStartTime = -1;
    }

    return { ...event, gameTime: currentGameTime };
  });
}
