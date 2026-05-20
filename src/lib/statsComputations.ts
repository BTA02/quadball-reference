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
  isVerified?: boolean;
  seasonId: string;
  homeTeamId: string;
  awayTeamId: string;
  [key: string]: any;
}

export function getScoreboardName(team: any): string {
  if (!team || !team.name) return 'Team';
  if (team.scoreboard_name) return team.scoreboard_name;
  
  const rawName = team.name.trim();
  if (rawName.length <= 15) return rawName;

  const words = rawName.split(/\s+/).filter((w: string) => w.length > 0);
  if (words.length === 0) return 'Team';
  if (words.length === 1) return words[0].substring(0, 15);

  const genericLower = ['university', 'college', 'institute', 'club', 'quadball', 'quidditch', 'athletics', 'state', 'qc'];
  
  let filtered = [...words];
  while (filtered.length > 1 && genericLower.includes(filtered[filtered.length - 1].toLowerCase())) {
    filtered.pop();
  }
  
  const filteredName = filtered.join(' ');
  if (filteredName.length <= 15 && filteredName.length > 0) return filteredName;

  return filtered[filtered.length - 1].substring(0, 15);
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
  attempts: number;
  missKo: number;
  turnovers: number;
  fouls: number;
  cards: number;
  points: number;      // goals × 10
  shotPct: number;     // goals / (shots+attempts) × 100
}

/** Build a Set of team IDs from filters for multi-team support */
function buildTeamIdSet(filters: { teamId?: string; teamIds?: string[] }): Set<string> | null {
  if (filters.teamIds && filters.teamIds.length > 0) return new Set(filters.teamIds);
  if (filters.teamId) return new Set([filters.teamId]);
  return null;
}

export function computeBasicStats(
  events: GameEvent[],
  players: Player[],
  games: Game[],
  filters: { seasonId?: string; teamId?: string; teamIds?: string[] }
): BasicPlayerStats[] {
  const teamIdSet = buildTeamIdSet(filters);

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
  if (teamIdSet) {
    filtered = filtered.filter(e => e.teamId && teamIdSet.has(e.teamId));
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
      attempts: 0,
      missKo: 0,
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
    else if (t === 'attempt') stats.attempts++;
    else if (t === 'miss_ko') stats.missKo++;
    else if (t === 'turnover') stats.turnovers++;
    else if (t === 'foul') stats.fouls++;
    else if (t === 'card') stats.cards++;
  }

  // Finalize derived stats
  for (const [nid, stats] of statsMap) {
    stats.gamesPlayed = playerGameSets.get(nid)?.size || 0;
    stats.points = stats.goals * 10;
    stats.shotPct = (stats.goals + stats.shots + stats.attempts + stats.missKo) > 0 ? Math.round((stats.goals / (stats.goals + stats.shots + stats.attempts + stats.missKo)) * 1000) / 10 : 0;
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

  // First pass: Seed with explicit team tags
  for (const e of gameEvents) {
    const pid = e.playerId;
    if (e.teamId && e.teamId !== 'unknown' && e.teamId !== 'null' && e.teamId !== '') {
      if (isValidPlayerId(pid)) playerTeamMap.set(pid!, e.teamId);
    }
  }

  // Second pass: Trace substitution chains
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of gameEvents) {
      if (e.type === 'sub_in' || e.type === 'sub_out') {
        const t1 = e.playerId ? playerTeamMap.get(e.playerId) : undefined;
        const t2 = e.subPlayerId ? playerTeamMap.get(e.subPlayerId) : undefined;
        
        if (t1 && !t2 && isValidPlayerId(e.subPlayerId)) {
          playerTeamMap.set(e.subPlayerId!, t1);
          changed = true;
        } else if (!t1 && t2 && isValidPlayerId(e.playerId)) {
          playerTeamMap.set(e.playerId!, t2);
          changed = true;
        }
      }
    }
  }

  return playerTeamMap;
}

// ─── Advanced Computed Stats ─────────────────────────────────────────

export interface AdvancedPlayerStats {
  playerId: string;
  teamId?: string;
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
  offPlus: number;
  offMinus: number;
  offPlusMinus: number;
  onOffDt: number;
  offPlusMinusRatio: number;
  relPlusMinusRatio: number;
  minutesPlayed: number;
  controlSeconds: number;
  teamPossessions: number;
  oppPossessions: number;
  oppShotsOn: number;
  oppAttemptsOn: number;
  teamTurnoversOn: number;
  oppTurnoversOn: number;
  teamEmptyTurnoversOn: number;
  oppEmptyTurnoversOn: number;
  goalsPerTwenty: number;
  assistsPerTwenty: number;
  pointsPerTwenty: number;
  goalsPerGame: number;
  assistsPerGame: number;
  pointsPerGame: number;
  goalsPer25Possessions: number;
  assistsPer25Possessions: number;
  pointsPer25Possessions: number;
  shotPct: number;
  assistToTurnover: number;
  controlPctOnField: number;
  // Raw counts for ratio computation
  goals: number;
  assists: number;
  shots: number;
  attempts: number;
  missKo: number;
  turnovers: number;
  fouls: number;
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
export function computeGameClockIntervals(gameEvents: GameEvent[]): [number, number][] {
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

  // Fallback for legacy data with no gamestart tags
  if (intervals.length === 0 && gameEvents.length > 0) {
    const firstEventTime = gameEvents[0].videoTime;
    const lastEventTime = gameEvents[gameEvents.length - 1].videoTime;
    if (lastEventTime >= firstEventTime) {
      intervals.push([firstEventTime, lastEventTime]);
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
  if (clockIntervals.length === 0) {
    return Math.max(0, windowEnd - windowStart) / 60;
  }
  
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
 * Global helper to check if a specific team is in the active filter state at a specific video time.
 */
function isStateActiveForTeam(
  teamId: string,
  time: number,
  controlPeriods: { teamId: string; startTime: number; endTime: number }[],
  flagReleaseTime: number,
  filters: { controlFilter?: 'all' | 'with' | 'without'; flagFilter?: 'all' | 'on' | 'off' }
): boolean {
  if (filters.flagFilter === 'on' && time < flagReleaseTime) return false;
  if (filters.flagFilter === 'off' && time >= flagReleaseTime) return false;
  if (filters.controlFilter === 'with' || filters.controlFilter === 'without') {
     let currentControl = null;
     for (const cp of controlPeriods) {
        if (time >= cp.startTime && time <= cp.endTime) {
           currentControl = cp.teamId;
           break;
        }
     }
     const hasCtrl = currentControl === teamId;
     if (filters.controlFilter === 'with' && !hasCtrl) return false;
     if (filters.controlFilter === 'without' && hasCtrl) return false;
  }
  return true;
}

/**
 * Global helper to get filter-adjusted play seconds and control seconds for a team within a window.
 */
function getFilteredSecondsInWindow(
  teamId: string,
  windowStart: number,
  windowEnd: number,
  clockIntervals: [number, number][],
  controlPeriods: { teamId: string; startTime: number; endTime: number }[],
  flagReleaseTime: number,
  filters: { controlFilter?: 'all' | 'with' | 'without'; flagFilter?: 'all' | 'on' | 'off' }
): { activeSeconds: number; activeControlSeconds: number } {
  let activeSeconds = 0;
  let activeControlSeconds = 0;

  for (const [start, end] of clockIntervals) {
    const os = Math.max(start, windowStart);
    const oe = Math.min(end, windowEnd);
    for (let s = Math.floor(os); s < Math.floor(oe); s++) {
      if (isStateActiveForTeam(teamId, s, controlPeriods, flagReleaseTime, filters)) {
        activeSeconds++;
        // Check if team has control for this second
        let currentControl = null;
        for (const cp of controlPeriods) {
           if (s >= cp.startTime && s <= cp.endTime) {
              currentControl = cp.teamId;
              break;
           }
        }
        if (currentControl === teamId) activeControlSeconds++;
      }
    }
  }
  return { activeSeconds, activeControlSeconds };
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
  filters: { seasonId?: string; teamId?: string; teamIds?: string[]; position?: 'chaser' | 'keeper'; controlFilter?: 'all' | 'with' | 'without'; flagFilter?: 'all' | 'on' | 'off'; outlierFilter?: 'include' | 'exclude' }
): AdvancedPlayerStats[] {
  const teamIdSet = buildTeamIdSet(filters);
  // Build player lookup by ID
  const playerMap = new Map<string, Player>();
  players.forEach(p => playerMap.set(p.id, p));

  const { eventsByGame, relevantGames } = groupEventsByGame(events, games, filters);
  const rapmScores = computeRAPM(events, players, games, filters, 'beater');

  // Accumulators
  const statsAccum = new Map<string, {
    teamId: string;
    plus: number;
    minus: number;
    plusMinus: number;
    minutesPlayed: number;
    goals: number;
    assists: number;
    shots: number;
    attempts: number;
    missKo: number;
    turnovers: number;
    fouls: number;
    teamPossessions: number;
    oppPossessions: number;
    oppShotsOn: number;
    oppAttemptsOn: number;
    teamTurnoversOn: number;
    oppTurnoversOn: number;
    teamEmptyTurnoversOn: number;
    oppEmptyTurnoversOn: number;
    teamGoalsInGames: number;
    oppGoalsInGames: number;
    controlSeconds: number;
    gameIds: Set<string>;
  }>();

  const getAccum = (pid: string, teamId: string = '') => {
    if (!statsAccum.has(pid)) {
      statsAccum.set(pid, {
        teamId,
        plus: 0,
        minus: 0,
        plusMinus: 0,
        minutesPlayed: 0,
        goals: 0,
        assists: 0,
        shots: 0,
        attempts: 0,
        missKo: 0,
        turnovers: 0,
        fouls: 0,
        teamPossessions: 0,
        oppPossessions: 0,
        oppShotsOn: 0,
        oppAttemptsOn: 0,
        teamTurnoversOn: 0,
        oppTurnoversOn: 0,
        teamEmptyTurnoversOn: 0,
        oppEmptyTurnoversOn: 0,
        teamGoalsInGames: 0,
        oppGoalsInGames: 0,
        controlSeconds: 0,
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
    const processHome = !teamIdSet || teamIdSet.has(resolvedHomeId) || teamIdSet.has(game.homeTeamId);
    const processAway = !teamIdSet || teamIdSet.has(resolvedAwayId) || teamIdSet.has(game.awayTeamId);

    const gameEndEvent = sorted.find(e => e.type === 'gameEnd' || e.type === 'gameend');
    const gameEndTime = gameEndEvent?.videoTime ?? sorted[sorted.length - 1]?.videoTime ?? 0;

    const controlPeriods = computeControlPeriodsFromEvents(sorted);
    const flagReleaseEvent = sorted.find(ev => ev.type === 'flag_released');
    const flagReleaseTime = flagReleaseEvent?.videoTime ?? Infinity;

    // Compute stints for minutes
    let homeStints: StintRecord[] = [];
    let awayStints: StintRecord[] = [];

    const calculateActiveStats = (stint: StintRecord, teamId: string) => {
      if (!filters.flagFilter && !filters.controlFilter) {
         return {
           activeMinutes: getGameMinutesInWindow(clockIntervals, stint.startTime, stint.endTime),
           controlSeconds: getControlSecondsInWindow(controlPeriods, teamId, stint.startTime, stint.endTime, clockIntervals)
         };
      }
      const filtered = getFilteredSecondsInWindow(teamId, stint.startTime, stint.endTime, clockIntervals, controlPeriods, flagReleaseTime, filters);
      return {
        activeMinutes: filtered.activeSeconds / 60,
        controlSeconds: filtered.activeControlSeconds
      };
    };

    if (processHome) {
      homeStints = computePlayerStints(sorted, resolvedHomeId, homePlayerIds, gameEndTime).filter(s => s.position !== 'beater' && s.position !== 'seeker');
      for (const stint of homeStints) {
        if (filters.position && stint.position !== filters.position && stint.position !== undefined) continue;
        const accum = getAccum(stint.playerId, game.homeTeamId);
        const activeData = calculateActiveStats(stint, resolvedHomeId);
        accum.minutesPlayed += activeData.activeMinutes;
        accum.controlSeconds += activeData.controlSeconds;
      }
    }
    if (processAway) {
      awayStints = computePlayerStints(sorted, resolvedAwayId, awayPlayerIds, gameEndTime).filter(s => s.position !== 'beater' && s.position !== 'seeker');
      for (const stint of awayStints) {
        if (filters.position && stint.position !== filters.position && stint.position !== undefined) continue;
        const accum = getAccum(stint.playerId, game.awayTeamId);
        const activeData = calculateActiveStats(stint, resolvedAwayId);
        accum.minutesPlayed += activeData.activeMinutes;
        accum.controlSeconds += activeData.controlSeconds;
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
      const isAttempt = t === 'ATTEMPT';
      const isMissKo = t === 'MISS_KO';
      const isTurnover = t === 'TURNOVER';
      const isExplicitOffense = t === 'OFFENSE';
      const isExplicitDefense = t === 'DEFENSE';
      const isStartEvent = t === 'CONTROL_START' || t === 'QUADBALL_START';

      if (!isGoal && !isShot && !isAttempt && !isMissKo && !isTurnover && !isExplicitOffense && !isExplicitDefense && !isStartEvent) continue;

      let eventTeamId = e.teamId || playerTeamMap.get(e.playerId);
      if (!eventTeamId && (playerTeamMap.size === 0 || (discHome === null && discAway))) {
        eventTeamId = resolvedHomeId;
      }
      if (!eventTeamId) continue;

      let isNewPossessionForEventTeam = false;
      let isEmptyTurnover = false;

      if (!hasExplicitPossessions) {
        if (isGoal || isShot || isAttempt || isMissKo || isTurnover) {
           isNewPossessionForEventTeam = (currentInferredPossTeam !== eventTeamId);
           if (isNewPossessionForEventTeam) {
             currentInferredPossTeam = eventTeamId;
             didCurrentPossShoot = (isShot || isAttempt || isMissKo);
             isEmptyTurnover = isTurnover && !didCurrentPossShoot;
           } else {
             isEmptyTurnover = isTurnover && !didCurrentPossShoot;
             if (isShot || isAttempt || isMissKo) didCurrentPossShoot = true;
           }
        } else if (isStartEvent) {
           isNewPossessionForEventTeam = false;
           currentInferredPossTeam = eventTeamId;
           didCurrentPossShoot = false;
        }
      }

      const homeActive = isStateActiveForTeam(resolvedHomeId, e.videoTime, controlPeriods, flagReleaseTime, filters);
      const awayActive = isStateActiveForTeam(resolvedAwayId, e.videoTime, controlPeriods, flagReleaseTime, filters);

      const activeHome = processHome && homeActive ? getActivePlayersAtTime(homeStints, e.videoTime, filters.position) : new Set<string>();
      const activeAway = processAway && awayActive ? getActivePlayersAtTime(awayStints, e.videoTime, filters.position) : new Set<string>();

      for (const pid of activeHome) {
        const accum = getAccum(pid);
        if (isGoal) {
          if (eventTeamId === resolvedHomeId) { accum.plus++; accum.plusMinus++; }
          else if (eventTeamId === resolvedAwayId) { accum.minus++; accum.plusMinus--; }
        }
        if (isShot) {
          if (eventTeamId === resolvedAwayId) { accum.oppShotsOn++; }
        }
        if (isAttempt) {
          if (eventTeamId === resolvedAwayId) { accum.oppAttemptsOn++; }
        }
        if (isTurnover) {
          if (eventTeamId === resolvedHomeId) { 
            accum.teamTurnoversOn++; 
            if (isEmptyTurnover) accum.teamEmptyTurnoversOn++;
          }
          else if (eventTeamId === resolvedAwayId) { 
            accum.oppTurnoversOn++; 
            if (isEmptyTurnover) accum.oppEmptyTurnoversOn++;
          }
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
        if (isShot) {
          if (eventTeamId === resolvedHomeId) { accum.oppShotsOn++; }
        }
        if (isAttempt) {
          if (eventTeamId === resolvedHomeId) { accum.oppAttemptsOn++; }
        }
        if (isTurnover) {
          if (eventTeamId === resolvedAwayId) { 
            accum.teamTurnoversOn++; 
            if (isEmptyTurnover) accum.teamEmptyTurnoversOn++;
          }
          else if (eventTeamId === resolvedHomeId) { 
            accum.oppTurnoversOn++;
            if (isEmptyTurnover) accum.oppEmptyTurnoversOn++;
          }
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

        if (eTeam === resolvedHomeId && isStateActiveForTeam(resolvedHomeId, e.videoTime, controlPeriods, flagReleaseTime, filters)) homeGoalsThisGame++;
        else if (eTeam === resolvedAwayId && isStateActiveForTeam(resolvedAwayId, e.videoTime, controlPeriods, flagReleaseTime, filters)) awayGoalsThisGame++;
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
      
      const isP_Home = homePlayerIds.has(pid);
      if (isP_Home && !isStateActiveForTeam(resolvedHomeId, e.videoTime, controlPeriods, flagReleaseTime, filters)) continue;
      if (!isP_Home && !isStateActiveForTeam(resolvedAwayId, e.videoTime, controlPeriods, flagReleaseTime, filters)) continue;

      const activeFilterPlayers = getActivePlayersAtTime(isP_Home ? homeStints : awayStints, e.videoTime, filters.position);
      if (!activeFilterPlayers.has(pid)) continue;

      let eTeam = e.teamId;
      if (!eTeam && e.playerId) eTeam = playerTeamMap.get(e.playerId);
      if (!eTeam && (playerTeamMap.size === 0 || (discHome === null && discAway))) eTeam = resolvedHomeId;
      if (teamIdSet && eTeam && !teamIdSet.has(eTeam)) continue;

      if (isP_Home && processHome) homePlayersInGame.add(pid);
      if (!isP_Home && processAway) awayPlayersInGame.add(pid);

      const accum = getAccum(pid);
      const t = (e.type || '').toLowerCase();
      if (t === 'goal') accum.goals++;
      else if (t === 'assist') accum.assists++;
      else if (t === 'shot') accum.shots++;
      else if (t === 'attempt') accum.attempts++;
      else if (t === 'miss_ko') accum.missKo++;
      else if (t === 'turnover') accum.turnovers++;
      else if (t === 'foul') accum.fouls++;
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
      teamId: accum.teamId,
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
      offPlus,
      offMinus,
      offPlusMinusRatio: offMinus > 0
        ? Math.round((offPlus / offMinus) * 100) / 100
        : offPlus > 0 ? Infinity : 0,
      offPlusMinus,
      onOffDt,
      relPlusMinusRatio: Math.round(((accum.minus > 0 ? accum.plus / accum.minus : accum.plus > 0 ? 5 : 0) - (offMinus > 0 ? offPlus / offMinus : offPlus > 0 ? 5 : 0)) * 100) / 100,
      minutesPlayed: Math.round(minutes * 10) / 10,
      controlSeconds: accum.controlSeconds,
      teamPossessions: accum.teamPossessions,
      oppPossessions: accum.oppPossessions,
      oppShotsOn: accum.oppShotsOn,
      oppAttemptsOn: accum.oppAttemptsOn,
      goalsPerTwenty: minutes > 0 ? Math.round((accum.goals / minutes) * 20 * 100) / 100 : ('N/A' as any),
      assistsPerTwenty: minutes > 0 ? Math.round((accum.assists / minutes) * 20 * 100) / 100 : ('N/A' as any),
      pointsPerTwenty: minutes > 0 ? Math.round((points / minutes) * 20 * 100) / 100 : ('N/A' as any),
      goalsPerGame: accum.gameIds.size > 0 ? Math.round((accum.goals / accum.gameIds.size) * 100) / 100 : ('N/A' as any),
      assistsPerGame: accum.gameIds.size > 0 ? Math.round((accum.assists / accum.gameIds.size) * 100) / 100 : ('N/A' as any),
      pointsPerGame: accum.gameIds.size > 0 ? Math.round((points / accum.gameIds.size) * 100) / 100 : ('N/A' as any),
      goalsPer25Possessions: accum.teamPossessions > 0 ? Math.round((accum.goals / accum.teamPossessions) * 25 * 100) / 100 : ('N/A' as any),
      assistsPer25Possessions: accum.teamPossessions > 0 ? Math.round((accum.assists / accum.teamPossessions) * 25 * 100) / 100 : ('N/A' as any),
      pointsPer25Possessions: accum.teamPossessions > 0 ? Math.round((points / accum.teamPossessions) * 25 * 100) / 100 : ('N/A' as any),
      shotPct: (accum.goals + accum.shots + accum.attempts + accum.missKo) > 0 ? Math.round((accum.goals / (accum.goals + accum.shots + accum.attempts + accum.missKo)) * 1000) / 10 : 0,
      assistToTurnover: accum.turnovers > 0
        ? Math.round((accum.assists / accum.turnovers) * 100) / 100
        : accum.assists > 0 ? Infinity : 0,
      controlPctOnField: minutes > 0
        ? Math.round((accum.controlSeconds / (minutes * 60)) * 1000) / 10
        : 0,
      goals: accum.goals,
      assists: accum.assists,
      shots: accum.shots, // Explicit thrown shots
      attempts: accum.attempts, // Physical drives
      missKo: accum.missKo,     // Miss by KO
      turnovers: accum.turnovers,
      fouls: accum.fouls,
      teamTurnoversOn: accum.teamTurnoversOn,
      oppTurnoversOn: accum.oppTurnoversOn,
      teamEmptyTurnoversOn: accum.teamEmptyTurnoversOn,
      oppEmptyTurnoversOn: accum.oppEmptyTurnoversOn,
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
  teamPossessions: number;
  plus: number;
  minus: number;
  plusMinus: number;
  plusMinusRatio: number;
  offPlus: number;
  offMinus: number;
  offPlusMinus: number;
  onOffDt: number;
  offPlusMinusRatio: number;
  relPlusMinusRatio: number;
  // Basketball-inspired
  usgPct: number;        // Usage Rate — % of team events player is involved in while on-field
  eFGPct: number;        // Effective Goal % — weighted shooting efficiency
  eOff: number;          // Expected Offense — possession score based on goals + shot generation
  eDef: number;          // Expected Defense — isolated expected opponent possession score
  gameScore: number;     // Game Score — Normalized Performance Rating per 20 min (includes +/- and individual stats)
  oRtg: number;          // Offensive Rating — Team goals scored per 25 possessions while on pitch
  dRtg: number;          // Defensive Rating — Opponent goals conceded per 25 possessions while on pitch
  netRtg: number;        // Net Rating — oRtg - dRtg
  iORTG: number;         // Individual ORTG (Weighted plus)
  iDRTG: number;         // Individual DRTG (Weighted minus)
  iNet: number;          // Individual Net Rating
  epr: number;           // Empty Possession Rate (Turnovers with no shot/attempt/KO in the possession / Possessions)
  fEpr: number;          // Forced Empty Possession Rate (Opponent turnovers with no shot/attempt/KO / Opp Possessions)
  rapm: number;          // Regularized Adjusted Plus Minus
  // Per-20 rates
  turnoversPer20: number;
  shotsPer20: number;
  foulsPer20: number;
  goals: number;
  assists: number;
  shots: number;
  attempts: number;
  missKo: number;
  turnovers: number;
  fouls: number;
  points: number;
  // Merged basic metrics
  controlPctOnField: number;
  shotPct: number;
  assistToTurnover: number;
  goalsPerGame: number;
  assistsPerGame: number;
  pointsPerGame: number;
  goalsPerTwenty: number;
  assistsPerTwenty: number;
  pointsPerTwenty: number;
  goalsPer25Possessions: number;
  assistsPer25Possessions: number;
  pointsPer25Possessions: number;
}


// ─── RAPM Solver ───────────────────────────────────────────────────────
function computeRAPM(
  events: GameEvent[],
  players: Player[],
  games: Game[],
  filters: any,
  mode: 'quadball' | 'beater' = 'quadball'
): Map<string, number> {
  if (filters.skipRapm) return new Map<string, number>();
  const { relevantGames: allRelevant, eventsByGame } = groupEventsByGame(events, games, filters);
  const relevantGames = allRelevant.filter(g => g.isVerified);
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
    const homeStintsFull = computePlayerStints(sorted, resolvedHomeId, homePlayerIds, gameEndTime);
    const awayStintsFull = computePlayerStints(sorted, resolvedAwayId, awayPlayerIds, gameEndTime);
    const homeStints = homeStintsFull.filter(s => mode === 'beater' ? s.position === 'beater' : (s.position !== 'seeker'));
    const awayStints = awayStintsFull.filter(s => mode === 'beater' ? s.position === 'beater' : (s.position !== 'seeker'));
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
      const isMissKo = t === 'MISS_KO';
      const isTurnover = t === 'TURNOVER';
      const isExplicitOffense = t === 'OFFENSE';
      const isExplicitDefense = t === 'DEFENSE';
      const isStartEvent = t === 'CONTROL_START' || t === 'QUADBALL_START';

      if (!isGoal && !isShot && !isAttempt && !isMissKo && !isTurnover && !isExplicitOffense && !isExplicitDefense && !isStartEvent) continue;

      let eventTeamId = e.teamId || playerTeamMap.get(e.playerId);
      if (!eventTeamId && (playerTeamMap.size === 0 || (discHome === null && discAway))) eventTeamId = resolvedHomeId;
      if (!eventTeamId) continue;

      let isNewPossessionForEventTeam = false;

      if (!hasExplicitPossessions) {
        if (isGoal || isShot || isAttempt || isMissKo || isTurnover) {
           isNewPossessionForEventTeam = (currentInferredPossTeam !== eventTeamId);
           if (isNewPossessionForEventTeam) {
             currentInferredPossTeam = eventTeamId;
             didCurrentPossShoot = (isShot || isAttempt || isMissKo);
           } else {
             if (isShot || isAttempt || isMissKo) didCurrentPossShoot = true;
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
  let intercept = 40; // baseline 40 points per 25 poss
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

export function computeExtendedStats(
  events: GameEvent[],
  players: Player[],
  games: Game[],
  filters: { seasonId?: string; teamId?: string; teamIds?: string[]; position?: 'chaser' | 'keeper'; controlFilter?: 'all' | 'with' | 'without'; flagFilter?: 'all' | 'on' | 'off'; outlierFilter?: 'include' | 'exclude' }
): ExtendedPlayerStats[] {
  // Reuse advanced stats computation for the heavy lifting
  const advanced = computeAdvancedStats(events, players, games, filters);
  const rapmScores = computeRAPM(events, players, games, filters, 'quadball');
  const playerMap = new Map<string, Player>();
  players.forEach(p => playerMap.set(p.id, p));

  return advanced.map(a => {
    const mins = a.minutesPlayed;
    const per20 = mins > 0 ? 20 / mins : 0;
    const teamPoss = a.teamPossessions;
    const oppPoss = a.oppPossessions;

    // Usage Rate: play involvements / team possessions
    const involvements = a.goals + a.assists + a.shots + a.turnovers;
    const usgPct = teamPoss > 0 ? Math.round((involvements / teamPoss) * 1000) / 10 : 0;

    // Effective Goal %: goals / (goals + shots), weight assists as half-goals
    const totalAttempts = a.shots; // a.shots is already total occurrences because it includes goals from computeAdvancedStats
    const eFGPct = totalAttempts > 0
      ? Math.round(((a.goals + 0.5 * a.assists) / totalAttempts) * 1000) / 10
      : 0;

    // Offensive Rating: team goals generated per 25 offensive possessions
    const oRtg = teamPoss > 0 ? Math.round((a.plus / teamPoss) * 25 * 10) / 10 : 0;

    // Defensive Rating: opponent goals allowed per 25 defensive possessions
    const dRtg = oppPoss > 0 ? Math.round((a.minus / oppPoss) * 25 * 10) / 10 : 0;

    // Net Rating
    const netRtg = Math.round((oRtg - dRtg) * 10) / 10;

    // Individual Metric Scaling (iNET)
    const iPointsScored = a.plus + (a.goals * 0.75) + (a.assists * 0.25);
    const iPointsConceded = a.minus + (a.turnovers * 0.75) + (a.shots * 0.25); // penalty
    
    const iORTG = teamPoss > 0 ? Math.round((iPointsScored / teamPoss) * 100 * 10) / 10 : 0;
    const iDRTG = oppPoss > 0 ? Math.round((iPointsConceded / oppPoss) * 100 * 10) / 10 : 0;
    const iNet = Math.round((iORTG - iDRTG) * 10) / 10;

    // Game Score (GS/20): Normalized to impact per 20 minutes
    const points = a.goals + a.assists;
    const rawGameScore = (
      a.plusMinus +             // Core scoreboard impact
      (a.goals * 0.5) +         // Individual goal weight
      (a.assists * 0.4) +       // Individual assist weight
      ((a.goals - a.shots) * 0.2) + // Penalty for missed shots (a.shots is total, goals are made)
      (- a.turnovers * 0.7) +   // Turnover penalty
      (- a.fouls * 0.5)        // Foul penalty
    );
    const gameScore = mins > 0 ? Math.round((rawGameScore / mins) * 20 * 10) / 10 : 0;
    
    // Expected Offense (eOff): Score per possession (100 for goals, scaled partial score for non-goals based on missed shots)
    const missedChances = a.shots + a.attempts + a.missKo;
    const nonGoalPoss = Math.max(0, teamPoss - a.goals);
    let nonGoalScore = 0;
    if (nonGoalPoss > 0) {
      const avgMissedChances = missedChances / nonGoalPoss;
      nonGoalScore = (1 - Math.pow(0.7, avgMissedChances)) * 100;
    }
    const totalEoPoints = (a.goals * 100) + (nonGoalPoss * nonGoalScore);
    const eOff = teamPoss > 0 ? Math.round((totalEoPoints / teamPoss) * 10) / 10 : 0;
    
    // Expected Defense (eDef): Score allowed per opponent possession 
    const oppMissedChances = a.oppShotsOn + a.oppAttemptsOn;
    const oppNonGoalPoss = Math.max(0, oppPoss - a.minus);
    let nonGoalScore_opp = 0;
    if (oppNonGoalPoss > 0) {
      const avgMissedChances_opp = oppMissedChances / oppNonGoalPoss;
      nonGoalScore_opp = (1 - Math.pow(0.7, avgMissedChances_opp)) * 100;
    }
    const totalEdefPoints = (a.minus * 100) + (oppNonGoalPoss * nonGoalScore_opp);
    const eDef = oppPoss > 0 ? Math.round((totalEdefPoints / oppPoss) * 10) / 10 : 0;
    
    // Turnover Rates
    const epr = teamPoss > 0 ? Math.round((a.teamEmptyTurnoversOn / teamPoss) * 1000) / 10 : 0;
    const fEpr = oppPoss > 0 ? Math.round((a.oppEmptyTurnoversOn / oppPoss) * 1000) / 10 : 0;

    return {
      playerId: a.playerId,
      playerName: a.playerName,
      firstName: a.firstName,
      lastName: a.lastName,
      preferredName: a.preferredName,
      nickname: a.nickname,
      gamesPlayed: a.gamesPlayed,
      minutesPlayed: a.minutesPlayed,
      teamPossessions: teamPoss,
      plus: a.plus,
      minus: a.minus,
      plusMinus: a.plusMinus,
      plusMinusRatio: a.minus > 0
        ? Math.round((a.plus / a.minus) * 100) / 100
        : a.plus > 0 ? Infinity : 0,
      offPlus: a.offPlus,
      offMinus: a.offMinus,
      offPlusMinusRatio: a.offPlusMinusRatio,
      offPlusMinus: a.offPlusMinus,
      onOffDt: a.onOffDt,
      relPlusMinusRatio: a.relPlusMinusRatio,
      usgPct,
      eFGPct,
      gameScore,
      oRtg,
      dRtg,
      netRtg,
      eOff,
      eDef,
      iORTG,
      iDRTG,
      iNet,
      epr,
      fEpr,
      rapm: rapmScores.get(a.playerId) || 0,
      turnoversPer20: Math.round(a.turnovers * per20 * 100) / 100,
      shotsPer20: Math.round(a.shots * per20 * 100) / 100,
      attemptsPer20: Math.round(a.attempts * per20 * 100) / 100,
      foulsPer20: Math.round(a.fouls * per20 * 100) / 100,
      goals: a.goals,
      assists: a.assists,
      shots: a.shots,
      attempts: a.attempts,
      missKo: a.missKo,
      turnovers: a.turnovers,
      fouls: a.fouls,
      points,
      // Merged basic metrics
      controlPctOnField: a.controlPctOnField,
      shotPct: (a.goals + a.shots + a.attempts + a.missKo) > 0 
        ? Math.round((a.goals / (a.goals + a.shots + a.attempts + a.missKo)) * 1000) / 10 
        : 0,
      assistToTurnover: a.turnovers > 0
        ? Math.round((a.assists / a.turnovers) * 100) / 100
        : a.assists > 0 ? Infinity : 0,
      goalsPerGame: a.gamesPlayed > 0 ? Math.round((a.goals / a.gamesPlayed) * 100) / 100 : 0,
      assistsPerGame: a.gamesPlayed > 0 ? Math.round((a.assists / a.gamesPlayed) * 100) / 100 : 0,
      pointsPerGame: a.gamesPlayed > 0 ? Math.round((points / a.gamesPlayed) * 100) / 100 : 0,
      goalsPerTwenty: a.goalsPerTwenty,
      assistsPerTwenty: a.assistsPerTwenty,
      pointsPerTwenty: a.pointsPerTwenty,
      goalsPer25Possessions: a.goalsPer25Possessions,
      assistsPer25Possessions: a.assistsPer25Possessions,
      pointsPer25Possessions: a.pointsPer25Possessions,
    };
  });
}

// ─── Team-Aggregated Quadball Stats ──────────────────────────────────

export interface TeamQuadballStats {
  teamId: string;
  teamName: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  shots: number;
  attempts: number;
  missKo: number;
  turnovers: number;
  goalsAgainst: number;
  plusMinus: number;
  shotPct: number;
  goalsPerGame: number;
  assistsPerGame: number;
  pointsPerGame: number;
  oRtg: number;
  dRtg: number;
  netRtg: number;
  rapm: number;
  epr: number;
  fEpr: number;
}

export function computeTeamQuadballStats(
  events: GameEvent[],
  players: Player[],
  teams: { id: string; name: string; [k: string]: any }[],
  games: Game[],
  filters: { seasonId?: string; teamId?: string; teamIds?: string[] }
): TeamQuadballStats[] {
  const teamIdSet = buildTeamIdSet(filters);
  const extended = computeExtendedStats(events, players, games, filters);
  const teamMap = new Map<string, typeof teams[0]>();
  teams.forEach(t => teamMap.set(t.id, t));

  // Group player stats by their primary team
  const teamAccum = new Map<string, {
    goals: number; assists: number; shots: number; attempts: number; turnovers: number;
    teamPoss: number; oppPoss: number;
    teamTurnoversOn: number; oppTurnoversOn: number;
    gameIds: Set<string>;
  }>();

  // Identify which team each player belongs to from events
  const playerTeams = new Map<string, string>();
  for (const e of events) {
    if (e.playerId && e.teamId) {
      playerTeams.set(e.playerId, e.teamId);
    }
  }

  // Also figure out game IDs per team
  const teamGameIds = new Map<string, Set<string>>();
  const { relevantGames } = groupEventsByGame(events, games, filters as any);
  const validGamesForParams = relevantGames.map(x => x.id);
  const filteredGames = games.filter(g => validGamesForParams.includes(g.id) && (!teamIdSet || teamIdSet.has(g.homeTeamId) || teamIdSet.has(g.awayTeamId)));

  for (const g of filteredGames) {
    if (!teamGameIds.has(g.homeTeamId)) teamGameIds.set(g.homeTeamId, new Set());
    if (!teamGameIds.has(g.awayTeamId)) teamGameIds.set(g.awayTeamId, new Set());
    teamGameIds.get(g.homeTeamId)!.add(g.id);
    teamGameIds.get(g.awayTeamId)!.add(g.id);
  }

  // Aggregate: for team-level stats, we count raw events per team (not per player)
  const teamEventAccum = new Map<string, {
    goals: number; assists: number; shots: number; attempts: number; missKo: number; turnovers: number;
    emptyTurnovers: number;
    goalsAgainst: number; turnoversForced: number; oppEmptyTurnovers: number;
    shotsAgainst: number; attemptsAgainst: number;
    teamPoss: number; oppPoss: number;
    gameIds: Set<string>;
  }>();

  const getTA = (tid: string) => {
    if (!teamEventAccum.has(tid)) {
      teamEventAccum.set(tid, { goals: 0, assists: 0, shots: 0, attempts: 0, missKo: 0, turnovers: 0, emptyTurnovers: 0, goalsAgainst: 0, turnoversForced: 0, oppEmptyTurnovers: 0, shotsAgainst: 0, attemptsAgainst: 0, teamPoss: 0, oppPoss: 0, gameIds: new Set() });
    }
    return teamEventAccum.get(tid)!;
  };

  for (const g of filteredGames) {
    // Safety check - make sure both teams get initialized even if 0 events
    getTA(g.homeTeamId);
    getTA(g.awayTeamId);

    const gameEvents = events.filter(e => e.gameId === g.id);
    const sorted = [...gameEvents].sort((a,b) => a.videoTime - b.videoTime);
    const controlPeriods = computeControlPeriodsFromEvents(sorted);
    const flagReleaseTime = gameEvents.find(x => x.type === 'flag_released')?.videoTime ?? Infinity;
    
    let currentInferredPossTeam: string | null = null;
    let didCurrentPossShoot = false;
    
    for (const e of sorted) {
      if (!e.teamId) continue;
      const t = e.type?.toLowerCase() || '';
      const oppId = e.teamId === g.homeTeamId ? g.awayTeamId : g.homeTeamId;

      let isNewPossForEventTeam = false;
      let isEmptyTurnover = false;

      // Check if team ends possession
      if (['goal', 'shot', 'attempt', 'miss_ko', 'turnover'].includes(t)) {
        isNewPossForEventTeam = (currentInferredPossTeam !== e.teamId);
        if (isNewPossForEventTeam) {
          getTA(e.teamId).teamPoss++;
          getTA(oppId).oppPoss++;
          currentInferredPossTeam = e.teamId;
          const isShotOrAttempt = (t === 'shot' || t === 'attempt' || t === 'miss_ko');
          didCurrentPossShoot = isShotOrAttempt;
          isEmptyTurnover = t === 'turnover' && !didCurrentPossShoot;
        } else {
          const isShotOrAttempt = (t === 'shot' || t === 'attempt' || t === 'miss_ko');
          isEmptyTurnover = t === 'turnover' && !didCurrentPossShoot;
          if (isShotOrAttempt) didCurrentPossShoot = true;
        }
      }

      const isValidForTeam = isStateActiveForTeam(e.teamId, e.videoTime, controlPeriods, flagReleaseTime, filters as any);
      const isValidForOpp = isStateActiveForTeam(oppId, e.videoTime, controlPeriods, flagReleaseTime, filters as any);

      if (isValidForTeam) {
        const acc = getTA(e.teamId);
        acc.gameIds.add(g.id);
        
        if (t === 'goal') acc.goals++;
        if (t === 'assist') acc.assists++;
        if (t === 'shot') acc.shots++;
        if (t === 'attempt') acc.attempts++;
        if (t === 'miss_ko') acc.missKo++;
        if (t === 'turnover') {
          acc.turnovers++;
          if (isEmptyTurnover) acc.emptyTurnovers++;
        }
      }

      if (isValidForOpp) {
        const oppAcc = getTA(oppId);
        oppAcc.gameIds.add(g.id);

        if (t === 'goal') oppAcc.goalsAgainst++;
        if (t === 'shot') oppAcc.shotsAgainst++;
        if (t === 'attempt') oppAcc.attemptsAgainst++;
        if (t === 'turnover') {
          oppAcc.turnoversForced++;
          if (isEmptyTurnover) oppAcc.oppEmptyTurnovers++;
        }
      }
    }
  }

  const results: TeamQuadballStats[] = [];
  for (const [tid, acc] of teamEventAccum) {
    const team = teamMap.get(tid);
    if (!team) continue;
    if (teamIdSet && !teamIdSet.has(tid)) continue;
    
    const gp = acc.gameIds.size;
    const totalMissT = acc.shots + acc.attempts + acc.missKo; // Total shots + drives + KO
    const teamPoss = acc.teamPoss;
    const oppPoss = acc.oppPoss;
    
    // Expected Offense calculation for Team
    const nonGoalPossT = Math.max(0, teamPoss - acc.goals);
    let nonGoalScoreT = 0;
    if (nonGoalPossT > 0) {
      const avgMissedChances = totalMissT / nonGoalPossT;
      nonGoalScoreT = (1 - Math.pow(0.7, avgMissedChances)) * 100;
    }
    const totalEoPointsT = (acc.goals * 100) + (nonGoalPossT * nonGoalScoreT);
    const eOff = teamPoss > 0 ? Math.round((totalEoPointsT / teamPoss) * 10) / 10 : 0;
    
    // Expected Defense calculation for Team
    const totalMissAgainstT = acc.shotsAgainst + acc.attemptsAgainst;
    const oppNonGoalPossT = Math.max(0, oppPoss - acc.goalsAgainst);
    let nonGoalScoreAgainstT = 0;
    if (oppNonGoalPossT > 0) {
      const avgMissedChancesAgainst = totalMissAgainstT / oppNonGoalPossT;
      nonGoalScoreAgainstT = (1 - Math.pow(0.7, avgMissedChancesAgainst)) * 100;
    }
    const totalEdefPointsT = (acc.goalsAgainst * 100) + (oppNonGoalPossT * nonGoalScoreAgainstT);
    const eDef = oppPoss > 0 ? Math.round((totalEdefPointsT / oppPoss) * 10) / 10 : 0;
    
    results.push({
      teamId: tid,
      teamName: team.name || tid,
      gamesPlayed: gp,
      goals: acc.goals,
      goalsAgainst: acc.goalsAgainst,
      plusMinus: acc.goals - acc.goalsAgainst,
      assists: acc.assists,
      shots: acc.shots,
      attempts: acc.attempts,
      missKo: acc.missKo,
      turnovers: acc.turnovers,
      shotPct: (acc.goals + acc.shots + acc.attempts + acc.missKo) > 0 ? Math.round((acc.goals / (acc.goals + acc.shots + acc.attempts + acc.missKo)) * 1000) / 10 : 0,
      goalsPerGame: gp > 0 ? Math.round((acc.goals / gp) * 100) / 100 : 0,
      assistsPerGame: gp > 0 ? Math.round((acc.assists / gp) * 100) / 100 : 0,
      pointsPerGame: gp > 0 ? Math.round(((acc.goals + acc.assists) / gp) * 100) / 100 : 0,
      oRtg: teamPoss > 0 ? Math.round((acc.goals / teamPoss) * 25 * 10) / 10 : 0,
      dRtg: oppPoss > 0 ? Math.round((acc.goalsAgainst / oppPoss) * 25 * 10) / 10 : 0,
      netRtg: (() => {
        const o = teamPoss > 0 ? (acc.goals / teamPoss) * 25 : 0;
        const d = oppPoss > 0 ? (acc.goalsAgainst / oppPoss) * 25 : 0;
        return Math.round((o - d) * 10) / 10;
      })(),
      rapm: 0, // Team-level RAPM could be calculated, but defaulting to 0 for now
      epr: teamPoss > 0 ? Math.round((acc.emptyTurnovers / teamPoss) * 1000) / 10 : 0,
      fEpr: oppPoss > 0 ? Math.round((acc.oppEmptyTurnovers / oppPoss) * 1000) / 10 : 0,
    });
  }

  return results.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
}

// ─── Team-Aggregated Beater Stats ────────────────────────────────────

export interface TeamBeaterStats {
  teamId: string;
  teamName: string;
  gamesPlayed: number;
  controlMinutes: number;
  totalMinutes: number;
  controlPct: number;
  controlPerGame: number;  // CTRL minutes per game
  oppControlPct: number;   // opponent control %
}

export function computeTeamBeaterStats(
  events: GameEvent[],
  players: Player[],
  teams: { id: string; name: string; [k: string]: any }[],
  games: Game[],
  filters: { seasonId?: string; teamId?: string; teamIds?: string[]; controlFilter?: 'all' | 'with' | 'without'; flagFilter?: 'all' | 'on' | 'off'; outlierFilter?: 'include' | 'exclude' }
): TeamBeaterStats[] {
  const teamIdSet = buildTeamIdSet(filters);
  const soloStats = computeBeaterSoloStats(events, players, games, filters);
  const teamMap = new Map<string, typeof teams[0]>();
  teams.forEach(t => teamMap.set(t.id, t));

  // Map player → team from events
  const playerTeams = new Map<string, string>();
  for (const e of events) {
    if (e.playerId && e.teamId) playerTeams.set(e.playerId, e.teamId);
  }

  // Aggregate by team: sum control/total from solo stats
  // But we need to avoid double-counting overlapping pair time
  // Best approach: use the pair stats for team-level since pairs represent unique time windows
  const teamAccum = new Map<string, {
    controlSeconds: number; totalSeconds: number; gameIds: Set<string>;
  }>();

  // Use game-level control periods instead of individual player stints
  const { eventsByGame, relevantGames } = groupEventsByGame(events, games, filters);
  
  for (const [gameId, gameEvents] of eventsByGame) {
    const game = relevantGames.find(g => g.id === gameId);
    if (!game) continue;
    const sorted = [...gameEvents].sort((a, b) => a.videoTime - b.videoTime);
    const clockIntervals = computeGameClockIntervals(sorted);
    const controlPeriods = computeControlPeriodsFromEvents(sorted);
    const gameEndEvent = sorted.find(e => (e.type || '').toLowerCase() === 'gameend');
    const gameEndTime = gameEndEvent?.videoTime ?? sorted[sorted.length - 1]?.videoTime ?? 0;
    const gameStartEvent = sorted.find(e => (e.type || '').toLowerCase() === 'gamestart');
    const gameStartTime = gameStartEvent?.videoTime ?? sorted[0]?.videoTime ?? 0;

    const totalGameSec = getGameSecondsInWindow(clockIntervals, gameStartTime, gameEndTime);

    const flagReleaseEvent = sorted.find(ev => ev.type === 'flag_released');
    const flagReleaseTime = flagReleaseEvent?.videoTime ?? Infinity;

    for (const teamId of [game.homeTeamId, game.awayTeamId]) {
      if (teamIdSet && !teamIdSet.has(teamId)) continue;
      if (!teamAccum.has(teamId)) {
        teamAccum.set(teamId, { controlSeconds: 0, totalSeconds: 0, gameIds: new Set() });
      }
      const acc = teamAccum.get(teamId)!;
      acc.gameIds.add(gameId);

      if (!filters.flagFilter && !filters.controlFilter) {
        acc.totalSeconds += totalGameSec;
        acc.controlSeconds += getControlSecondsInWindow(controlPeriods, teamId, gameStartTime, gameEndTime, clockIntervals);
      } else {
        const { activeSeconds, activeControlSeconds } = getFilteredSecondsInWindow(teamId, gameStartTime, gameEndTime, clockIntervals, controlPeriods, flagReleaseTime, filters);
        acc.totalSeconds += activeSeconds;
        acc.controlSeconds += activeControlSeconds;
      }
    }
  }

  const results: TeamBeaterStats[] = [];
  for (const [tid, acc] of teamAccum) {
    const team = teamMap.get(tid);
    if (!team) continue;
    const gp = acc.gameIds.size;
    const ctrlMin = acc.controlSeconds / 60;
    const totalMin = acc.totalSeconds / 60;

    results.push({
      teamId: tid,
      teamName: team.name || tid,
      gamesPlayed: gp,
      controlMinutes: Math.round(ctrlMin * 10) / 10,
      totalMinutes: Math.round(totalMin * 10) / 10,
      controlPct: totalMin > 0 ? Math.round((ctrlMin / totalMin) * 1000) / 10 : 0,
      controlPerGame: gp > 0 ? Math.round((ctrlMin / gp) * 10) / 10 : 0,
      oppControlPct: totalMin > 0 ? Math.round(((totalMin - ctrlMin) / totalMin) * 1000) / 10 : 0,
    });
  }

  return results.sort((a, b) => b.controlPct - a.controlPct);
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
export function computeBeaterStints(
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
export function computeControlPeriodsFromEvents(
  gameEvents: GameEvent[]
): { teamId: string; startTime: number; endTime: number }[] {
  const periods: { teamId: string; startTime: number; endTime: number }[] = [];
  let currentTeam: string | null = null;
  let currentStart = 0;

  for (const e of gameEvents) {
    if (e.type === 'control_change' || e.type === 'control_start') {
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
export function getGameSecondsInWindow(
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
  offPlus: number;
  offMinus: number;
  offPlusMinus: number;
  onOffDt: number;
  offPlusMinusRatio: number;
  relPlusMinusRatio: number;
  controlMinutes: number;      // minutes their team had control while on field
  totalMinutes: number;        // total game-clock minutes on field
  controlPct: number;          // controlMinutes / totalMinutes × 100
  rapm: number;
  epr: number;
  fEpr: number;
  bcl: number;                 // Bludger Control Leverage rating
}

export function computeBeaterSoloStats(
  events: GameEvent[],
  players: Player[],
  games: Game[],
  filters: { seasonId?: string; teamId?: string; teamIds?: string[]; controlFilter?: 'all' | 'with' | 'without'; flagFilter?: 'all' | 'on' | 'off'; outlierFilter?: 'include' | 'exclude' }
): BeaterSoloStats[] {
  const teamIdSet = buildTeamIdSet(filters);
  const playerMap = buildPlayerMap(events, players);
  const { eventsByGame, relevantGames } = groupEventsByGame(events, games, filters);
  const rapmScores = computeRAPM(events, players, games, filters, 'beater');

  const accum = new Map<string, {
    plus: number; minus: number;
    teamGoalsTotal: number; oppGoalsTotal: number;
    controlSeconds: number; totalSeconds: number;
    teamPoss: number; oppPoss: number;
    shots: number; attempts: number; oppShotsOn: number; oppAttemptsOn: number;
    emptyTurnovers: number; oppEmptyTurnovers: number; turnovers: number;
    goalsScoredWithControl: number;
    goalsConcededWithControl: number;
    goalsScoredWithoutControl: number;
    goalsConcededWithoutControl: number;
    gameIds: Set<string>;
  }>();

  const getAcc = (pid: string) => {
    if (!accum.has(pid)) {
      accum.set(pid, {
        plus: 0, minus: 0,
        teamGoalsTotal: 0, oppGoalsTotal: 0,
        controlSeconds: 0, totalSeconds: 0,
        teamPoss: 0, oppPoss: 0,
        shots: 0, attempts: 0, oppShotsOn: 0, oppAttemptsOn: 0,
        emptyTurnovers: 0, oppEmptyTurnovers: 0, turnovers: 0,
        goalsScoredWithControl: 0,
        goalsConcededWithControl: 0,
        goalsScoredWithoutControl: 0,
        goalsConcededWithoutControl: 0,
        gameIds: new Set()
      });
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
    if (teamIdSet && !teamIdSet.has(resolvedHomeId) && !teamIdSet.has(resolvedAwayId) && !teamIdSet.has(game.homeTeamId) && !teamIdSet.has(game.awayTeamId)) continue;

    const playerTeamMap = buildPlayerTeamMap(sorted);
    const homeStints = computeBeaterStints(sorted, resolvedHomeId, gameId, gameEndTime, playerTeamMap);
    const awayStints = computeBeaterStints(sorted, resolvedAwayId, gameId, gameEndTime, playerTeamMap);
    const beaterStints = [...homeStints, ...awayStints];
    
    const flagReleaseEvent = sorted.find(ev => ev.type === 'flag_released');
    const flagReleaseTime = flagReleaseEvent?.videoTime ?? Infinity;

    for (const stint of beaterStints) {
      if (teamIdSet && !teamIdSet.has(stint.teamId)) continue;
      const acc = getAcc(stint.playerId);
      acc.gameIds.add(gameId);

      if (!filters.flagFilter && !filters.controlFilter) {
        acc.controlSeconds += getControlSecondsInWindow(controlPeriods, stint.teamId, stint.startTime, stint.endTime, clockIntervals);
        acc.totalSeconds += getGameSecondsInWindow(clockIntervals, stint.startTime, stint.endTime);
      } else {
        const { activeSeconds, activeControlSeconds } = getFilteredSecondsInWindow(stint.teamId, stint.startTime, stint.endTime, clockIntervals, controlPeriods, flagReleaseTime, filters);
        acc.totalSeconds += activeSeconds;
        acc.controlSeconds += activeControlSeconds;
      }
    }

    let homeGoalsThisGame = 0;
    let awayGoalsThisGame = 0;

    // Tracking possessions, goals, and attempts for beaters during their stints
    let currentInferredPossTeam: string | null = null;
    let didCurrentPossShoot = false;
    const hasExplicitPossessions = sorted.some(e => {
      const t = (e.type || '').toUpperCase();
      return t === 'OFFENSE' || t === 'DEFENSE';
    });

    for (const e of sorted) {
      let eventTeamId = e.teamId;
      if (!eventTeamId && e.playerId) eventTeamId = playerTeamMap.get(e.playerId);
      if (!eventTeamId && (playerTeamMap.size === 0 || (discHome === null && discAway))) eventTeamId = resolvedHomeId;
      if (!eventTeamId) continue;

      const t = (e.type || '').toUpperCase();
      const isGoal = t === 'GOAL';
      const isShot = t === 'SHOT';
      const isAttempt = t === 'ATTEMPT';
      const isMissKo = t === 'MISS_KO';
      const isTurnover = t === 'TURNOVER';
      const isStartEvent = t === 'CONTROL_START' || t === 'QUADBALL_START';
      const isExplicitOffense = t === 'OFFENSE';
      const isExplicitDefense = t === 'DEFENSE';

      if (!isGoal && !isShot && !isAttempt && !isMissKo && !isTurnover && !isExplicitOffense && !isExplicitDefense && !isStartEvent) continue;

      let isNewPossessionForEventTeam = false;
      let isEmptyTurnover = false;

      if (!hasExplicitPossessions) {
        if (isGoal || isShot || isAttempt || isMissKo || isTurnover) {
           isNewPossessionForEventTeam = (currentInferredPossTeam !== eventTeamId);
           if (isNewPossessionForEventTeam) {
             currentInferredPossTeam = eventTeamId;
             didCurrentPossShoot = (isShot || isAttempt || isMissKo);
             isEmptyTurnover = isTurnover && !didCurrentPossShoot;
           } else {
             isEmptyTurnover = isTurnover && !didCurrentPossShoot;
             if (isShot || isAttempt || isMissKo) didCurrentPossShoot = true;
           }
        } else if (isStartEvent) {
           isNewPossessionForEventTeam = false;
           currentInferredPossTeam = eventTeamId;
           didCurrentPossShoot = false;
        }
      }

      if (isGoal) {
        if (eventTeamId === resolvedHomeId && isStateActiveForTeam(resolvedHomeId, e.videoTime, controlPeriods, flagReleaseTime, filters)) homeGoalsThisGame++;
        else if (eventTeamId === resolvedAwayId && isStateActiveForTeam(resolvedAwayId, e.videoTime, controlPeriods, flagReleaseTime, filters)) awayGoalsThisGame++;
      }

      for (const stint of beaterStints) {
        if (teamIdSet && !teamIdSet.has(stint.teamId)) continue;
        if (e.videoTime >= stint.startTime && e.videoTime <= stint.endTime) {
          if (!isStateActiveForTeam(stint.teamId, e.videoTime, controlPeriods, flagReleaseTime, filters)) continue;
          
          const acc = getAcc(stint.playerId);
          const isTeamEv = stint.teamId === eventTeamId;

          if (isGoal) {
            const hasControl = controlPeriods.some(cp =>
              cp.teamId === stint.teamId && e.videoTime >= cp.startTime && e.videoTime <= cp.endTime
            );
            if (isTeamEv) {
              acc.plus++;
              if (hasControl) acc.goalsScoredWithControl++;
              else acc.goalsScoredWithoutControl++;
            } else {
              acc.minus++;
              if (hasControl) acc.goalsConcededWithControl++;
              else acc.goalsConcededWithoutControl++;
            }
          }
          if (isShot) {
            if (isTeamEv) acc.shots++;
            else acc.oppShotsOn++;
          }
          if (isAttempt) {
            if (isTeamEv) acc.attempts++;
            else acc.oppAttemptsOn++;
          }
          if (isTurnover) {
            if (isTeamEv) {
              acc.turnovers++;
              if (isEmptyTurnover) acc.emptyTurnovers++;
            } else {
              if (isEmptyTurnover) acc.oppEmptyTurnovers++;
            }
          }
          if (hasExplicitPossessions) {
            if (isExplicitOffense) {
              if (isTeamEv) acc.teamPoss++;
              else acc.oppPoss++;
            } else if (isExplicitDefense) {
              if (isTeamEv) acc.oppPoss++;
              else acc.teamPoss++;
            }
          } else {
            if (isNewPossessionForEventTeam) {
              if (isTeamEv) acc.teamPoss++;
              else acc.oppPoss++;
            }
          }
        }
      }
    }

    const homePlayersWithStints = new Set<string>();
    for (const stint of homeStints) homePlayersWithStints.add(stint.playerId);
    for (const pid of homePlayersWithStints) {
      if (teamIdSet && !teamIdSet.has(resolvedHomeId)) continue;
      const acc = getAcc(pid);
      acc.teamGoalsTotal += homeGoalsThisGame;
      acc.oppGoalsTotal += awayGoalsThisGame;
    }

    const awayPlayersWithStints = new Set<string>();
    for (const stint of awayStints) awayPlayersWithStints.add(stint.playerId);
    for (const pid of awayPlayersWithStints) {
      if (teamIdSet && !teamIdSet.has(resolvedAwayId)) continue;
      const acc = getAcc(pid);
      acc.teamGoalsTotal += awayGoalsThisGame;
      acc.oppGoalsTotal += homeGoalsThisGame;
    }
  }

  // Compute minutes-weighted league average net rating with control across all active solo beaters
  let totalGoalsScoredWithCtrl = 0;
  let totalGoalsConcededWithCtrl = 0;
  let totalMinWithCtrl = 0;

  for (const [pid, a] of accum) {
    const minWithControl = a.controlSeconds / 60;
    if (minWithControl > 0) {
      totalGoalsScoredWithCtrl += a.goalsScoredWithControl;
      totalGoalsConcededWithCtrl += a.goalsConcededWithControl;
      totalMinWithCtrl += minWithControl;
    }
  }

  const leagueAvgNetWithCtrl = totalMinWithCtrl > 0 
    ? (totalGoalsScoredWithCtrl - totalGoalsConcededWithCtrl) / totalMinWithCtrl 
    : 0;

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
    const relPlusMinusRatio = Math.round(((a.minus > 0 ? a.plus / a.minus : a.plus > 0 ? 5 : 0) - (offMinus > 0 ? offPlus / offMinus : offPlus > 0 ? 5 : 0)) * 100) / 100;

    const timeWithControl = a.controlSeconds;
    const minWithControl = timeWithControl / 60;

    const netWithCtrl = minWithControl > 0 
      ? (a.goalsScoredWithControl - a.goalsConcededWithControl) / minWithControl 
      : 0;
    const bcl = Math.round((netWithCtrl - leagueAvgNetWithCtrl) * 100) / 100;

    results.push({
      playerId: pid,
      playerName: p ? `${p.firstName} ${p.lastName}`.trim() : pid,
      firstName: p?.firstName || pid,
      lastName: p?.lastName || '',
      gamesPlayed: a.gameIds.size,
      plus: a.plus,
      minus: a.minus,
      plusMinus: a.plus - a.minus,
      offPlus,
      offMinus,
      plusMinusRatio,
      offPlusMinusRatio,
      relPlusMinusRatio,
      offPlusMinus,
      onOffDt,
      controlMinutes: Math.round(controlMin * 10) / 10,
      totalMinutes: Math.round(totalMin * 10) / 10,
      controlPct: totalMin > 0 ? Math.round((controlMin / totalMin) * 1000) / 10 : 0,
      rapm: rapmScores.get(pid) || 0,
      epr: a.teamPoss > 0 ? Math.round((a.emptyTurnovers / a.teamPoss) * 1000) / 10 : 0,
      fEpr: a.oppPoss > 0 ? Math.round((a.oppEmptyTurnovers / a.oppPoss) * 1000) / 10 : 0,
      bcl,
    });
  }

  return results;
}

// ── Beater Pair Stats ──

export interface BeaterPairStats {
  pairKey: string;          // sorted "playerA|playerB"
  teamId: string;
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  gamesPlayed: number;
  plus: number;
  minus: number;
  plusMinus: number;
  plusMinusRatio: number;
  offPlus: number;
  offMinus: number;
  offPlusMinus: number;
  onOffDt: number;
  offPlusMinusRatio: number;
  relPlusMinusRatio: number;
  controlMinutes: number;
  totalMinutes: number;
  controlPct: number;
  rapm: number;
  epr: number;
  fEpr: number;
  bcl: number;              // Bludger Control Leverage rating
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
  filters: { seasonId?: string; teamId?: string; teamIds?: string[]; controlFilter?: 'all' | 'with' | 'without'; flagFilter?: 'all' | 'on' | 'off'; outlierFilter?: 'include' | 'exclude' }
): BeaterPairStats[] {
  const teamIdSet = buildTeamIdSet(filters);
  const playerMap = buildPlayerMap(events, players);
  const { eventsByGame, relevantGames } = groupEventsByGame(events, games, filters);
  const rapmScores = computeRAPM(events, players, games, filters, 'beater');

  const accum = new Map<string, {
    player1Id: string; player2Id: string;
    teamId: string;
    plus: number; minus: number;
    teamGoalsTotal: number; oppGoalsTotal: number;
    controlSeconds: number; totalSeconds: number;
    teamPoss: number; oppPoss: number;
    shots: number; attempts: number; oppShotsOn: number; oppAttemptsOn: number;
    emptyTurnovers: number; oppEmptyTurnovers: number; turnovers: number;
    goalsScoredWithControl: number;
    goalsConcededWithControl: number;
    goalsScoredWithoutControl: number;
    goalsConcededWithoutControl: number;
    gameIds: Set<string>;
  }>();

  const getPairAcc = (p1: string, p2: string, teamId: string) => {
    const [a, b] = [p1, p2].sort();
    const key = `${a}|${b}`;
    if (!accum.has(key)) {
      accum.set(key, {
        player1Id: a, player2Id: b,
        teamId: teamId,
        plus: 0, minus: 0,
        teamGoalsTotal: 0, oppGoalsTotal: 0,
        controlSeconds: 0, totalSeconds: 0,
        teamPoss: 0, oppPoss: 0, shots: 0, attempts: 0, oppShotsOn: 0, oppAttemptsOn: 0, emptyTurnovers: 0, oppEmptyTurnovers: 0, turnovers: 0,
        goalsScoredWithControl: 0, goalsConcededWithControl: 0, goalsScoredWithoutControl: 0, goalsConcededWithoutControl: 0,
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

    if (teamIdSet && !teamIdSet.has(resolvedHomeId) && !teamIdSet.has(resolvedAwayId) && !teamIdSet.has(game.homeTeamId) && !teamIdSet.has(game.awayTeamId)) continue;

    const playerTeamMap = buildPlayerTeamMap(sorted);
    const homeStints = computeBeaterStints(sorted, resolvedHomeId, gameId, gameEndTime, playerTeamMap);
    const awayStints = computeBeaterStints(sorted, resolvedAwayId, gameId, gameEndTime, playerTeamMap);
    const beaterStints = [...homeStints, ...awayStints];
    
    const flagReleaseEvent = sorted.find(ev => ev.type === 'flag_released');
    const flagReleaseTime = flagReleaseEvent?.videoTime ?? Infinity;

    const pairOverlaps = computePairOverlaps(beaterStints);

    for (const overlap of pairOverlaps) {
      if (teamIdSet && !teamIdSet.has(overlap.teamId)) continue;
      const acc = getPairAcc(overlap.player1, overlap.player2, overlap.teamId);
      acc.gameIds.add(gameId);

      if (!filters.flagFilter && !filters.controlFilter) {
        acc.controlSeconds += getControlSecondsInWindow(controlPeriods, overlap.teamId, overlap.start, overlap.end, clockIntervals);
        acc.totalSeconds += getGameSecondsInWindow(clockIntervals, overlap.start, overlap.end);
      } else {
        const { activeSeconds, activeControlSeconds } = getFilteredSecondsInWindow(overlap.teamId, overlap.start, overlap.end, clockIntervals, controlPeriods, flagReleaseTime, filters);
        acc.totalSeconds += activeSeconds;
        acc.controlSeconds += activeControlSeconds;
      }
    }

    let homeGoalsThisGame = 0;
    let awayGoalsThisGame = 0;

    // Tracking possessions, goals, and attempts during pair overlaps
    let currentInferredPossTeam: string | null = null;
    let didCurrentPossShoot = false;
    const hasExplicitPossessions = sorted.some(e => {
      const t = (e.type || '').toUpperCase();
      return t === 'OFFENSE' || t === 'DEFENSE';
    });

    for (const e of sorted) {
      let eventTeamId = e.teamId;
      if (!eventTeamId && e.playerId) eventTeamId = playerTeamMap.get(e.playerId);
      if (!eventTeamId && (playerTeamMap.size === 0 || (discHome === null && discAway))) eventTeamId = resolvedHomeId;
      if (!eventTeamId) continue;

      const t = (e.type || '').toUpperCase();
      const isGoal = t === 'GOAL';
      const isShot = t === 'SHOT';
      const isAttempt = t === 'ATTEMPT';
      const isMissKo = t === 'MISS_KO';
      const isTurnover = t === 'TURNOVER';
      const isStartEvent = t === 'CONTROL_START' || t === 'QUADBALL_START';
      const isExplicitOffense = t === 'OFFENSE';
      const isExplicitDefense = t === 'DEFENSE';

      if (!isGoal && !isShot && !isAttempt && !isMissKo && !isTurnover && !isExplicitOffense && !isExplicitDefense && !isStartEvent) continue;

      let isNewPossessionForEventTeam = false;
      let isEmptyTurnover = false;

      if (!hasExplicitPossessions) {
        if (isGoal || isShot || isAttempt || isMissKo || isTurnover) {
           isNewPossessionForEventTeam = (currentInferredPossTeam !== eventTeamId);
           if (isNewPossessionForEventTeam) {
             currentInferredPossTeam = eventTeamId;
             didCurrentPossShoot = (isShot || isAttempt || isMissKo);
             isEmptyTurnover = isTurnover && !didCurrentPossShoot;
           } else {
             isEmptyTurnover = isTurnover && !didCurrentPossShoot;
             if (isShot || isAttempt || isMissKo) didCurrentPossShoot = true;
           }
        } else if (isStartEvent) {
           isNewPossessionForEventTeam = false;
           currentInferredPossTeam = eventTeamId;
           didCurrentPossShoot = false;
        }
      }

      if (isGoal) {
        if (eventTeamId === resolvedHomeId) homeGoalsThisGame++;
        else if (eventTeamId === resolvedAwayId) awayGoalsThisGame++;
      }

      for (const overlap of pairOverlaps) {
        let overlapTeamRaw = overlap.teamId;
        if (overlapTeamRaw === resolvedHomeId) overlapTeamRaw = game.homeTeamId;
        if (overlapTeamRaw === resolvedAwayId) overlapTeamRaw = game.awayTeamId;

        if (e.videoTime >= overlap.start && e.videoTime <= overlap.end) {
          const acc = getPairAcc(overlap.player1, overlap.player2, overlapTeamRaw);
          const isTeamEv = overlap.teamId === eventTeamId;

          if (isGoal) {
            const hasControl = controlPeriods.some(cp =>
              cp.teamId === overlap.teamId && e.videoTime >= cp.startTime && e.videoTime <= cp.endTime
            );
            if (isTeamEv) {
              acc.plus++;
              if (hasControl) acc.goalsScoredWithControl++;
              else acc.goalsScoredWithoutControl++;
            } else {
              acc.minus++;
              if (hasControl) acc.goalsConcededWithControl++;
              else acc.goalsConcededWithoutControl++;
            }
          }
          if (isShot) {
            if (isTeamEv) acc.shots++;
            else acc.oppShotsOn++;
          }
          if (isAttempt) {
            if (isTeamEv) acc.attempts++;
            else acc.oppAttemptsOn++;
          }
          if (isTurnover) {
            if (isTeamEv) {
              acc.turnovers++;
              if (isEmptyTurnover) acc.emptyTurnovers++;
            } else {
              if (isEmptyTurnover) acc.oppEmptyTurnovers++;
            }
          }
          if (hasExplicitPossessions) {
            if (isExplicitOffense) {
              if (isTeamEv) acc.teamPoss++;
              else acc.oppPoss++;
            } else if (isExplicitDefense) {
              if (isTeamEv) acc.oppPoss++;
              else acc.teamPoss++;
            }
          } else {
            if (isNewPossessionForEventTeam) {
              if (isTeamEv) acc.teamPoss++;
              else acc.oppPoss++;
            }
          }
        }
      }
    }

    const homePairsWithStints = new Set<string>();
    for (const overlap of pairOverlaps) {
      if (overlap.teamId === resolvedHomeId) homePairsWithStints.add(`${overlap.player1}|${overlap.player2}`);
    }
    for (const pairKey of homePairsWithStints) {
      if (teamIdSet && !teamIdSet.has(resolvedHomeId)) continue;
      const [p1, p2] = pairKey.split('|');
      const acc = getPairAcc(p1, p2, game.homeTeamId);
      acc.teamGoalsTotal += homeGoalsThisGame;
      acc.oppGoalsTotal += awayGoalsThisGame;
    }

    const awayPairsWithStints = new Set<string>();
    for (const overlap of pairOverlaps) {
      if (overlap.teamId === resolvedAwayId) awayPairsWithStints.add(`${overlap.player1}|${overlap.player2}`);
    }
    for (const pairKey of awayPairsWithStints) {
      if (teamIdSet && !teamIdSet.has(resolvedAwayId)) continue;
      const [p1, p2] = pairKey.split('|');
      const acc = getPairAcc(p1, p2, game.awayTeamId);
      acc.teamGoalsTotal += awayGoalsThisGame;
      acc.oppGoalsTotal += homeGoalsThisGame;
    }
  }

  // Compute minutes-weighted cohort average net rating with control across all active beater pairs
  let totalGoalsScoredWithCtrl = 0;
  let totalGoalsConcededWithCtrl = 0;
  let totalMinWithCtrl = 0;

  for (const [key, a] of accum) {
    const minWithControl = a.controlSeconds / 60;
    if (minWithControl > 0) {
      totalGoalsScoredWithCtrl += a.goalsScoredWithControl;
      totalGoalsConcededWithCtrl += a.goalsConcededWithControl;
      totalMinWithCtrl += minWithControl;
    }
  }

  const cohortAvgNetWithCtrl = totalMinWithCtrl > 0 
    ? (totalGoalsScoredWithCtrl - totalGoalsConcededWithCtrl) / totalMinWithCtrl 
    : 0;

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
    const relPlusMinusRatio = Math.round(((a.minus > 0 ? a.plus / a.minus : a.plus > 0 ? 5 : 0) - (offMinus > 0 ? offPlus / offMinus : offPlus > 0 ? 5 : 0)) * 100) / 100;

    const timeWithControl = a.controlSeconds;
    const minWithControl = timeWithControl / 60;

    const netWithCtrl = minWithControl > 0 
      ? (a.goalsScoredWithControl - a.goalsConcededWithControl) / minWithControl 
      : 0;
    const bcl = Math.round((netWithCtrl - cohortAvgNetWithCtrl) * 100) / 100;

    results.push({
      pairKey: key,
      teamId: a.teamId,
      player1Id: a.player1Id,
      player1Name: p1 ? `${p1.firstName} ${p1.lastName}`.trim() : a.player1Id,
      player2Id: a.player2Id,
      player2Name: p2 ? `${p2.firstName} ${p2.lastName}`.trim() : a.player2Id,
      gamesPlayed: a.gameIds.size,
      plus: a.plus,
      minus: a.minus,
      plusMinus: a.plus - a.minus,
      offPlus,
      offMinus,
      plusMinusRatio,
      offPlusMinusRatio,
      relPlusMinusRatio,
      offPlusMinus,
      onOffDt,
      controlMinutes: Math.round(controlMin * 10) / 10,
      totalMinutes: Math.round(totalMin * 10) / 10,
      controlPct: totalMin > 0 ? Math.round((controlMin / totalMin) * 1000) / 10 : 0,
      rapm: Math.round(((rapmScores.get(a.player1Id) || 0) + (rapmScores.get(a.player2Id) || 0)) * 10) / 10,
      epr: a.teamPoss > 0 ? Math.round((a.emptyTurnovers / a.teamPoss) * 1000) / 10 : 0,
      fEpr: a.oppPoss > 0 ? Math.round((a.oppEmptyTurnovers / a.oppPoss) * 1000) / 10 : 0,
      bcl,
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
  filters: { seasonId?: string; teamId?: string; teamIds?: string[]; outlierFilter?: 'include' | 'exclude' }
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
    eventsByGame.get(e.gameId)!.push({ ...e, videoTime: Number(e.videoTime) || 0 });
  }

  if (filters.outlierFilter === 'exclude') {
    const keptGames = new Set<string>();
    for (const [gameId, gameEvents] of eventsByGame) {
      const game = relevantGames.find(g => g.id === gameId);
      if (game) {
        const sorted = [...gameEvents].sort((a, b) => a.videoTime - b.videoTime);
        const { homeTeamId: discHome, awayTeamId: discAway } = discoverGameTeams(sorted, game.homeTeamId, game.awayTeamId);
        const resolvedHomeId = (discHome === null && discAway) ? 'home_inferred' : (discHome || game.homeTeamId);
        const resolvedAwayId = discAway || game.awayTeamId;
        const playerTeamMap = buildPlayerTeamMap(sorted);

        let homeScore = 0;
        let awayScore = 0;

        for (const e of sorted) {
          let eTeam = e.teamId;
          if (!eTeam && e.playerId) eTeam = playerTeamMap.get(e.playerId);
          if (!eTeam && (playerTeamMap.size === 0 || (discHome === null && discAway))) eTeam = resolvedHomeId;

          const t = (e.type || '').toLowerCase();
          if (t === 'goal') {
            if (eTeam === resolvedHomeId) homeScore += 10;
            else if (eTeam === resolvedAwayId) awayScore += 10;
          } else if (t === 'flag_catch') {
            if (eTeam === resolvedHomeId) homeScore += 35;
            else if (eTeam === resolvedAwayId) awayScore += 35;
          }
        }

        if (Math.abs(homeScore - awayScore) < 145) {
          keptGames.add(gameId);
        }
      }
    }
    
    // Prune eventsByGame and relevantGames
    for (const key of eventsByGame.keys()) {
      if (!keptGames.has(key)) eventsByGame.delete(key);
    }
    relevantGames = relevantGames.filter(g => keptGames.has(g.id));
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
  avgTimeToCatch: number;     // avg seconds on field from sub-in to catch
  avgTimeFromRelease: number; // avg seconds from flag_released to flag_catch
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
  timeFromRelease: number | null;
  pointDiffAtCatch: number | null;
  gameWinning: boolean;
  teamLeadingAtRelease: 'winning' | 'losing' | 'tied';
}

export function computeSeekerStats(
  events: GameEvent[],
  players: Player[],
  games: Game[],
  filters: { seasonId?: string; teamId?: string; teamIds?: string[]; controlFilter?: 'all' | 'with' | 'without'; flagFilter?: 'all' | 'on' | 'off'; outlierFilter?: 'include' | 'exclude' }
): SeekerStats[] {
  const teamIdSet = buildTeamIdSet(filters);
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

    // Find flag_released time
    const flagReleasedEvent = sorted.find(e => e.type === 'flag_released');
    const flagReleasedTime = flagReleasedEvent?.videoTime ?? null;
    const flagReleaseTimeForFilter = flagReleasedTime ?? Infinity;
    const flagReleasedGameTime = flagReleasedEvent?.gameTime ?? null;

    // Compute time stats for each seeker stint
    for (const stint of seekerStints) {
      if (teamIdSet && !teamIdSet.has(stint.teamId)) continue;
      const acc = getTimeAcc(stint.playerId);
      acc.gameIds.add(gameId);
      
      if (!filters.flagFilter && !filters.controlFilter) {
         acc.minutesSeeking += getGameMinutesInWindow(clockIntervals, stint.startTime, stint.endTime);
         const totalSec = getGameSecondsInWindow(clockIntervals, stint.startTime, stint.endTime);
         acc.totalSeconds += totalSec;
         acc.controlSeconds += getControlSecondsInWindow(controlPeriods, stint.teamId, stint.startTime, stint.endTime, clockIntervals);
      } else {
         const { activeSeconds, activeControlSeconds } = getFilteredSecondsInWindow(stint.teamId, stint.startTime, stint.endTime, clockIntervals, controlPeriods, flagReleaseTimeForFilter, filters);
         acc.minutesSeeking += activeSeconds / 60;
         acc.totalSeconds += activeSeconds;
         acc.controlSeconds += activeControlSeconds;
      }
    }

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
      // Respect filters for catches
      if (!isStateActiveForTeam(catchEvent.teamId, catchEvent.videoTime, controlPeriods, flagReleaseTimeForFilter, filters)) {
         continue; // Catch happened outside the filter state!
      }
      let homeAtCatch = 0;
      let awayAtCatch = 0;
      for (const e of sorted) {
        if (e.videoTime > catchEvent.videoTime) break;
        if (e.type === 'goal') {
          if (e.teamId === game.homeTeamId) homeAtCatch += GOAL_PTS;
          else if (e.teamId === game.awayTeamId) awayAtCatch += GOAL_PTS;
        }
      }
      const nid = catchEvent.playerId!.trim();
      const isHome = catchEvent.teamId === game.homeTeamId;
      const ownScore = isHome ? homeAtCatch : awayAtCatch;
      const oppScore = isHome ? awayAtCatch : homeAtCatch;
      const pointDiff = ownScore - oppScore;

      if (catchEvent.teamId === game.homeTeamId) homeAtCatch += FLAG_CATCH_PTS;
      else if (catchEvent.teamId === game.awayTeamId) awayAtCatch += FLAG_CATCH_PTS;

      const ownScoreAfter = isHome ? homeAtCatch : awayAtCatch;
      const gameWinning = scoreCap !== null && ownScoreAfter >= scoreCap;
      
      let timeFromRelease = null;
      if (flagReleasedTime !== null) {
        if (catchEvent.gameTime !== undefined && flagReleasedGameTime !== null) {
          timeFromRelease = catchEvent.gameTime - flagReleasedGameTime;
        } else {
          timeFromRelease = catchEvent.videoTime - flagReleasedTime;
        }
      }

      let timeToCatch = null;
      const catchingStint = seekerStints.find(s => s.playerId === nid && catchEvent.videoTime >= s.startTime - 15 && catchEvent.videoTime <= s.endTime + 15);
      if (catchingStint) {
        timeToCatch = Math.round(getGameMinutesInWindow(clockIntervals, catchingStint.startTime, catchEvent.videoTime) * 60);
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
        timeFromRelease,
        pointDiffAtCatch: pointDiff,
        gameWinning,
        teamLeadingAtRelease: teamStatus,
      });

      // Find opponent seekers who were on field when this catch happened — they get an OpCTH
      let foundOpponent = false;
      const CATCH_GRACE_PERIOD = 15; // 15 seconds grace for logging delays
      for (const stint of seekerStints) {
        if (stint.teamId === catchEvent.teamId) continue; // same team, skip
        if (catchEvent.videoTime >= stint.startTime - CATCH_GRACE_PERIOD && catchEvent.videoTime <= stint.endTime + CATCH_GRACE_PERIOD) {
          foundOpponent = true;
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
            timeFromRelease: null,
            pointDiffAtCatch: null,
            gameWinning: false,
            teamLeadingAtRelease: sTeamStatus,
          });
        }
      }

      // If we still didn't find an opponent seeker to blame, guess the only known opponent seeker if there is exactly 1
      if (!foundOpponent) {
        const oppSeekers = Array.from(seekerPlayers.entries()).filter(([_, t]) => t !== catchEvent.teamId);
        if (oppSeekers.length === 1) {
          const [oppPid, oppTeamId] = oppSeekers[0];
          const sIsHome = oppTeamId === game.homeTeamId;
          const sOwnAtRelease = sIsHome ? homeAtRelease : awayAtRelease;
          const sOppAtRelease = sIsHome ? awayAtRelease : homeAtRelease;
          const sTeamStatus: 'winning' | 'losing' | 'tied' =
            sOwnAtRelease > sOppAtRelease ? 'winning' : sOwnAtRelease < sOppAtRelease ? 'losing' : 'tied';

          allResults.push({
            playerId: oppPid,
            teamId: oppTeamId,
            gameId,
            caught: false,
            opponentCaught: true,
            timeToCatch: null,
            timeFromRelease: null,
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
      if (teamIdSet && !teamIdSet.has(teamId)) continue;

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
        timeFromRelease: null,
        pointDiffAtCatch: null,
        gameWinning: false,
        teamLeadingAtRelease: teamStatus,
      });
    }
  }

  // Apply team filter 
  const filteredResults = teamIdSet
    ? allResults.filter(r => r.teamId && teamIdSet.has(r.teamId))
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
    const avgFromRelease = catchesNum > 0
      ? Math.round(catches.reduce((s, r) => s + (r.timeFromRelease ?? 0), 0) / catchesNum)
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
      avgTimeFromRelease: avgFromRelease,
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
    } else if (event.type === 'gamePause' || event.type === 'gameEnd') {
      clockRunning = false;
      lastStartTime = -1;
    }

    return { ...event, gameTime: currentGameTime };
  });
}
