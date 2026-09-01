/**
 * Quadball Win Shares
 * ===================
 *
 * An adaptation of Basketball-Reference's Win Shares (Justin Kubatko, after Dean Oliver's
 * *Basketball on Paper*) to quadball. The shape of the metric is unchanged:
 *
 *     Win Shares = (marginal offense) / (marginal points per win)
 *                + (marginal defense) / (marginal points per win)
 *
 * where "marginal" means *above what a replacement-level player would have produced in the
 * same role, with the same workload*. Everything below is the work of deciding what those
 * three quantities mean in a sport that is played with four balls, seven players a side and
 * a 35-point flag catch that ends the game.
 *
 * ---------------------------------------------------------------------------------------
 * 1. Wins have to be inferred
 * ---------------------------------------------------------------------------------------
 * Nothing in the data records a winner, so we reconstruct the scoreboard: a goal is 10
 * points, a flag catch is 35, and the higher final total wins. Only *pristine* games count
 * — both sides marked complete **with substitutions** (`isFullyCompleteWithSubs`). Win
 * Shares are minutes-weighted from first principles, so a game with untracked subs would
 * silently hand a starter's credit to whoever the tracker last saw on the pitch.
 *
 * ---------------------------------------------------------------------------------------
 * 2. Points per win, derived rather than borrowed
 * ---------------------------------------------------------------------------------------
 * Basketball-Reference uses `0.32 × (league points per game)`. That constant is specific to
 * the NBA's scoring distribution and is badly wrong for quadball, where a single flag catch
 * moves the scoreboard by three and a half goals and blowouts are routine.
 *
 * The underlying idea generalises cleanly. If single-game margins are roughly normal with
 * standard deviation σ and mean 0, then a team whose true margin is m wins with probability
 * Φ(m/σ), so near .500 each extra point of margin is worth φ(0)/σ = 0.3989/σ of a win.
 * Inverting:
 *
 *     points per marginal win  =  σ / 0.3989  =  2.507 × σ
 *
 * This reproduces the known values for other sports (NBA σ ≈ 13.5 → ≈ 34 points/win; NFL
 * σ ≈ 14 → ≈ 35 points/win), needs no sport-specific constant, and is estimated directly
 * from the games in scope. Like Basketball-Reference we then pace-adjust it per team:
 * a team that plays faster games has more points available per win.
 *
 * ---------------------------------------------------------------------------------------
 * 3. Replacement level, pinned to points per win
 * ---------------------------------------------------------------------------------------
 * The two constants in Basketball-Reference's model are not independent. A replacement team
 * is `r` worse than average on offense *and* on defense, so it runs a margin of −2·r·PPG per
 * game; for Win Shares to sum to team wins that team must win about zero games, i.e. sit
 * 0.5 wins per game below .500. That forces
 *
 *     points per win = 2·r·PPG / 0.5 = 4·r·PPG          (r = 0.08 → 0.32 × PPG, as published)
 *
 * We run the identity the other way: σ gives us points per win, and replacement level falls
 * out as `r = PPW / (4 × league PPG)`. Low-parity sports land on a much lower replacement
 * bar than the NBA's 8%, which is the honest answer — a replacement-level side in a league
 * with routine blowouts really is that far below average.
 *
 * ---------------------------------------------------------------------------------------
 * 4. Splitting the credit across four positions
 * ---------------------------------------------------------------------------------------
 * Chasers and keepers have a box score. Beaters essentially do not — their whole job is
 * bludger control, which shows up in *other people's* numbers. Seekers touch the game
 * exactly once, for 35 points. So a team's marginal points are split by *points category*
 * before being allocated to players, which keeps the flag's real weight in a given season
 * flowing through instead of being fixed by a guess:
 *
 *     quadball points scored   → chasers/keepers 75%, beaters 25%
 *     quadball points allowed  → chasers/keepers 60%, beaters 40%
 *     flag points (both ways)  → seekers 70%, beaters 30%
 *
 * Beaters are weighted more heavily on defense than offense because bludger control is
 * primarily a goal-prevention lever, and they take a real share of the flag because the
 * seeker game is played through the beaters. Within each unit, credit is then allocated by
 * marginal production exactly as in the basketball model. Nothing is counted twice: each
 * category of points is divided once and then distributed inside each unit.
 *
 * ---------------------------------------------------------------------------------------
 * 5. What this metric is not
 * ---------------------------------------------------------------------------------------
 * Win Shares is a *whole-game accounting* metric: the parts have to add back up to the
 * game. It therefore ignores the situational filters (bludger control on/off, flag
 * on/off) — a "with control only" slice of a game does not add up to a win. Team and
 * season filters are respected, since those select whole games.
 *
 * Team Win Shares are left un-normalised, as Basketball-Reference leaves them. The
 * replacement calibration above is what makes a team's total land near its actual wins,
 * and the team table reports the gap so the calibration can be judged rather than assumed.
 */

import {
  computeGameClockIntervals,
  computePlayerStints,
  computeBeaterStints,
  getActivePlayersAtTime,
  getGameMinutesInWindow,
  discoverGameTeams,
  buildPlayerTeamMap,
  isValidPlayerId,
  type StintRecord,
} from './statsComputations';
import { isFullyCompleteWithSubs, type CompletionGame } from './gameCompletion';

// ─── Model constants ─────────────────────────────────────────────────
// Everything the model assumes, in one place. These are the knobs; the rest is arithmetic.

/** Scoreboard value of a goal. */
export const GOAL_POINTS = 10;
/** Scoreboard value of a flag catch. */
export const FLAG_POINTS = 35;

/** Share of a goal's 10 points credited to the assister rather than the scorer. */
const ASSIST_CREDIT = 0.35;

/** φ(0) — the standard normal density at zero. Converts margin σ into points per win. */
const NORMAL_PEAK_DENSITY = 0.3989422804014327;

/** Chasers/keepers vs. beaters, splitting marginal quadball offense. */
const QUAD_OFF_SHARE_CK = 0.75;
const QUAD_OFF_SHARE_BEATER = 1 - QUAD_OFF_SHARE_CK;

/** Chasers/keepers vs. beaters, splitting marginal quadball defense. */
const QUAD_DEF_SHARE_CK = 0.60;
const QUAD_DEF_SHARE_BEATER = 1 - QUAD_DEF_SHARE_CK;

/** Seekers vs. beaters, splitting marginal flag points in both directions. */
const FLAG_SHARE_SEEKER = 0.70;
const FLAG_SHARE_BEATER = 1 - FLAG_SHARE_SEEKER;

/**
 * Replacement level is derived, but a tiny or freak sample can push it somewhere absurd.
 * The floor is a shade under the NBA's 8%; the ceiling is a league so lopsided that a
 * replacement side scores a quarter of average and concedes nearly double.
 */
const MIN_REPLACEMENT_FRACTION = 0.05;
const MAX_REPLACEMENT_FRACTION = 0.75;

/**
 * σ from a handful of games is unbiased but noisy, so it is still the better estimate — the
 * Basketball-Reference ratio is not a neutral prior here, it is a different sport's answer.
 * Below this many games we use σ anyway and flag the result as thin.
 */
const MIN_GAMES_FOR_STABLE_PPW = 8;
/** Only used when σ cannot be formed at all (no games, or every game a tie). */
const FALLBACK_PPW_RATIO = 0.32;

// ─── Types ───────────────────────────────────────────────────────────

interface GameEvent {
  id: string;
  videoId: string;
  gameId: string;
  type: string;
  status: string;
  videoTime: number;
  playerId?: string;
  subPlayerId?: string;
  teamId?: string;
  position?: string;
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

interface Team {
  id: string;
  name: string;
  [key: string]: any;
}

interface Game extends CompletionGame {
  id: string;
  seasonId?: string;
  homeTeamId: string;
  awayTeamId: string;
  [key: string]: any;
}

/** The unit a player's time was spent in. Players who switch roles get 'hybrid'. */
export type WinShareUnit = 'quadball' | 'beater' | 'seeker' | 'hybrid';

export interface PlayerWinShares {
  playerId: string;
  playerName: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  nickname?: string;
  teamId: string;
  teamName: string;
  /** Where this player spent most of their tracked minutes. */
  unit: WinShareUnit;
  gamesPlayed: number;
  minutesPlayed: number;
  /** Minutes split by unit, so a hybrid's row can be read honestly. */
  quadballMinutes: number;
  beaterMinutes: number;
  seekerMinutes: number;
  /** Offensive Win Shares — marginal points *produced* ÷ points per win. */
  ows: number;
  /** Defensive Win Shares — marginal points *prevented* ÷ points per win. */
  dws: number;
  /** Total Win Shares. */
  ws: number;
  /** Win Shares per 20 minutes of game clock — the rate-stat form. */
  wsPer20: number;
  /** Marginal points produced above replacement (the OWS numerator). */
  marginalOffense: number;
  /** Marginal points prevented above replacement (the DWS numerator). */
  marginalDefense: number;
  /** Estimated scoreboard points produced (goals + share of assisted goals + flag catches). */
  pointsProduced: number;
  /** Individual possessions consumed, scaled to the team's possession count. */
  possessionsUsed: number;
  /** Flag catches, and opponent catches conceded while on pitch. */
  flagCatches: number;
  flagCatchesAgainst: number;
  /** Points per win used for this player's team — useful when reading the numbers back. */
  pointsPerWin: number;
}

export interface TeamWinShares {
  teamId: string;
  teamName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  marginPerGame: number;
  /** Possessions per 20 minutes of game clock. */
  pace: number;
  /** Pace-adjusted marginal points per win for this team. */
  pointsPerWin: number;
  /** Wins implied by point differential alone: G/2 + (point diff ÷ points per win). */
  expectedWins: number;
  /** Sum of this team's players' Win Shares. */
  teamWinShares: number;
  ows: number;
  dws: number;
  /** teamWinShares − wins. Near zero means the replacement calibration is holding. */
  calibration: number;
}

export interface WinShareBaselines {
  /** Qualifying (pristine, both sides complete with subs) games in scope. */
  games: number;
  /** Team-games — two per qualifying game. */
  teamGames: number;
  /** League quadball points (goals only) per offensive possession. */
  pointsPerPossession: number;
  /** League total points (goals + flag) per team per game. */
  pointsPerGame: number;
  /** League possessions per 20 minutes. */
  pace: number;
  /** RMS of single-game point margins — the σ that sets points per win. */
  marginSigma: number;
  /** League-wide marginal points per win, before per-team pace adjustment. */
  pointsPerWin: number;
  /** Replacement level, as a fraction below league average. */
  replacementFraction: number;
  /** Expected flag points per flag opportunity (a team-game in which the flag was released). */
  flagPointsPerOpportunity: number;
  /** True when σ could not be formed at all and the Basketball-Reference ratio stood in. */
  usedFallbackPointsPerWin: boolean;
  /** True when the sample is too thin for σ — and so for every number here — to be trusted. */
  lowSample: boolean;
}

export interface GameWinShareResult {
  gameId: string;
  seasonId?: string;
  homeTeamId: string;
  awayTeamId: string;
  homePoints: number;
  awayPoints: number;
  homeGoals: number;
  awayGoals: number;
  homeFlagCatches: number;
  awayFlagCatches: number;
  /** null on a tie. */
  winnerTeamId: string | null;
  margin: number;
}

export interface WinSharesResult {
  players: PlayerWinShares[];
  teams: TeamWinShares[];
  baselines: WinShareBaselines;
  games: GameWinShareResult[];
  /** Games in scope that were not pristine, and so contributed nothing. */
  excludedGames: number;
}

export interface WinSharesFilters {
  seasonId?: string;
  teamId?: string;
  teamIds?: string[];
}

// ─── Internal accumulators ───────────────────────────────────────────

interface UnitTime {
  minutes: number;
  /** Team goals scored / opponent goals scored while this player was on pitch. */
  goalsFor: number;
  goalsAgainst: number;
  /** Team offensive / defensive possessions while this player was on pitch. */
  teamPoss: number;
  oppPoss: number;
}

const emptyUnitTime = (): UnitTime => ({ minutes: 0, goalsFor: 0, goalsAgainst: 0, teamPoss: 0, oppPoss: 0 });

interface PlayerAccum {
  playerId: string;
  teamId: string;
  gameIds: Set<string>;
  /** Chaser/keeper time. */
  ck: UnitTime;
  /** Beater time. */
  bt: UnitTime;
  /** Seeker time. */
  sk: UnitTime;
  // Individual box score (chaser/keeper production).
  goals: number;
  assists: number;
  shots: number;
  attempts: number;
  missKo: number;
  turnovers: number;
  // Flag ledger. Seekers carry their own catches; beaters carry a minutes-weighted share
  // of the team's flag result over the periods they were on pitch for.
  flagCatches: number;
  flagCatchesAgainst: number;
  seekerFlagOpportunities: number;
  beaterFlagPointsFor: number;
  beaterFlagPointsAgainst: number;
  beaterFlagOpportunities: number;
}

function newPlayerAccum(playerId: string, teamId: string): PlayerAccum {
  return {
    playerId, teamId,
    gameIds: new Set(),
    ck: emptyUnitTime(), bt: emptyUnitTime(), sk: emptyUnitTime(),
    goals: 0, assists: 0, shots: 0, attempts: 0, missKo: 0, turnovers: 0,
    flagCatches: 0, flagCatchesAgainst: 0, seekerFlagOpportunities: 0,
    beaterFlagPointsFor: 0, beaterFlagPointsAgainst: 0, beaterFlagOpportunities: 0,
  };
}

interface TeamAccum {
  teamId: string;
  gameIds: Set<string>;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  goals: number;
  goalsAgainst: number;
  assists: number;
  flagCatches: number;
  flagCatchesAgainst: number;
  flagOpportunities: number;
  teamPoss: number;
  oppPoss: number;
  /** Game-clock minutes of the games this team played (not player-minutes). */
  gameMinutes: number;
}

function newTeamAccum(teamId: string): TeamAccum {
  return {
    teamId, gameIds: new Set(),
    wins: 0, losses: 0, ties: 0,
    pointsFor: 0, pointsAgainst: 0,
    goals: 0, goalsAgainst: 0, assists: 0,
    flagCatches: 0, flagCatchesAgainst: 0, flagOpportunities: 0,
    teamPoss: 0, oppPoss: 0, gameMinutes: 0,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Events that end a possession, and so mark the boundary between one team's and the next's. */
const POSSESSION_ENDING = new Set(['goal', 'shot', 'attempt', 'miss_ko', 'turnover']);

/**
 * Seeker stints, built the same way {@link computeSeekerStats} builds them: from explicit
 * `sub_in position=seeker` events, with a fallback stint from flag release to the catch for
 * a seeker who was never subbed in on the record but demonstrably caught the flag.
 */
function computeSeekerStints(
  sorted: GameEvent[],
  playerTeamMap: Map<string, string>,
  fallbackTeamId: string,
  gameEndTime: number
): StintRecord[] {
  const seekerPlayers = new Map<string, string>();
  for (const e of sorted) {
    if (e.type === 'sub_in' && e.playerId && e.position === 'seeker') {
      seekerPlayers.set(e.playerId, e.teamId || playerTeamMap.get(e.playerId) || fallbackTeamId);
    }
    if (e.type === 'flag_catch' && e.playerId && e.teamId && !seekerPlayers.has(e.playerId)) {
      seekerPlayers.set(e.playerId, e.teamId);
    }
  }

  const stints: StintRecord[] = [];
  for (const [pid, teamId] of seekerPlayers) {
    let onField = false;
    let stintStart = 0;
    for (const e of sorted) {
      if (e.playerId !== pid) continue;
      if (e.type === 'sub_in' && e.position === 'seeker') {
        if (!onField) { onField = true; stintStart = e.videoTime; }
      } else if (e.type === 'sub_out' && onField) {
        stints.push({ playerId: pid, teamId, startTime: stintStart, endTime: e.videoTime, position: 'seeker' });
        onField = false;
      }
    }
    if (onField) {
      stints.push({ playerId: pid, teamId, startTime: stintStart, endTime: gameEndTime, position: 'seeker' });
    }
    if (!stints.some(s => s.playerId === pid)) {
      const released = sorted.find(e => e.type === 'flag_released');
      const caught = sorted.find(e => e.type === 'flag_catch' && e.playerId === pid);
      if (released) {
        stints.push({
          playerId: pid, teamId,
          startTime: released.videoTime,
          endTime: caught?.videoTime ?? gameEndTime,
          position: 'seeker',
        });
      }
    }
  }
  return stints.filter(s => isValidPlayerId(s.playerId));
}

// ─── Main entry point ────────────────────────────────────────────────

/**
 * Compute Win Shares over the pristine games in scope.
 *
 * `events` may be the app's already-scoped event list; games that are not complete on both
 * sides *with substitutions* are dropped here regardless, because the metric is
 * minutes-weighted and cannot be trusted without them.
 */
export function computeWinShares(
  events: GameEvent[],
  players: Player[],
  teams: Team[],
  games: Game[],
  filters: WinSharesFilters = {}
): WinSharesResult {
  const playerMap = new Map<string, Player>(players.map(p => [p.id, p]));
  const teamMap = new Map<string, Team>(teams.map(t => [t.id, t]));

  const teamIdSet = filters.teamIds?.length
    ? new Set(filters.teamIds)
    : filters.teamId ? new Set([filters.teamId]) : null;

  const scopedGames = filters.seasonId ? games.filter(g => g.seasonId === filters.seasonId) : games;
  const qualifying = scopedGames.filter(g => isFullyCompleteWithSubs(g));
  const excludedGames = scopedGames.length - qualifying.length;
  const qualifyingIds = new Set(qualifying.map(g => g.id));

  const eventsByGame = new Map<string, GameEvent[]>();
  for (const e of events) {
    if (!qualifyingIds.has(e.gameId)) continue;
    let list = eventsByGame.get(e.gameId);
    if (!list) { list = []; eventsByGame.set(e.gameId, list); }
    list.push(e);
  }

  const playerAccum = new Map<string, PlayerAccum>();
  const teamAccum = new Map<string, TeamAccum>();
  const gameResults: GameWinShareResult[] = [];

  const getPlayerAccum = (playerId: string, teamId: string) => {
    const key = `${playerId}::${teamId}`;
    let acc = playerAccum.get(key);
    if (!acc) { acc = newPlayerAccum(playerId, teamId); playerAccum.set(key, acc); }
    return acc;
  };
  const getTeamAccum = (teamId: string) => {
    let acc = teamAccum.get(teamId);
    if (!acc) { acc = newTeamAccum(teamId); teamAccum.set(teamId, acc); }
    return acc;
  };

  // ── Pass 1: walk every qualifying game ────────────────────────────
  for (const game of qualifying) {
    const raw = eventsByGame.get(game.id);
    if (!raw || raw.length === 0) continue;

    const sorted = [...raw]
      .map(e => ({ ...e, videoTime: Number(e.videoTime) || 0 }))
      .sort((a, b) => a.videoTime - b.videoTime);

    const { homeTeamId: discHome, awayTeamId: discAway } = discoverGameTeams(sorted, game.homeTeamId, game.awayTeamId);
    const resolvedHomeId = discHome || game.homeTeamId;
    const resolvedAwayId = discAway || game.awayTeamId;
    // Win Shares needs a real two-sided scoreboard; a game whose sides can't both be pinned
    // to a known team can't produce a winner, so it contributes nothing.
    if (!resolvedHomeId || !resolvedAwayId || resolvedHomeId === resolvedAwayId) continue;
    if (!teamMap.has(game.homeTeamId) || !teamMap.has(game.awayTeamId)) continue;

    /** Canonical (roster) team id for an id resolved from events. */
    const canonical = (resolved: string | undefined | null): string | null => {
      if (resolved === resolvedHomeId) return game.homeTeamId;
      if (resolved === resolvedAwayId) return game.awayTeamId;
      return null;
    };

    const clockIntervals = computeGameClockIntervals(sorted);
    const playerTeamMap = buildPlayerTeamMap(sorted);
    const gameEndEvent = sorted.find(e => {
      const t = (e.type || '').toLowerCase();
      return t === 'gameend';
    });
    const gameEndTime = gameEndEvent?.videoTime ?? sorted[sorted.length - 1]?.videoTime ?? 0;
    const gameMinutes = clockIntervals.reduce((sum, [s, e]) => sum + (e - s), 0) / 60;

    const homePlayerIds = new Set<string>();
    const awayPlayerIds = new Set<string>();
    for (const [pid, team] of playerTeamMap) {
      if (team === resolvedHomeId) homePlayerIds.add(pid);
      else if (team === resolvedAwayId) awayPlayerIds.add(pid);
    }

    // Stints, per side, per unit.
    const ckStints: Record<'home' | 'away', StintRecord[]> = {
      home: computePlayerStints(sorted, resolvedHomeId, homePlayerIds, gameEndTime)
        .filter(s => s.position !== 'beater' && s.position !== 'seeker' && isValidPlayerId(s.playerId)),
      away: computePlayerStints(sorted, resolvedAwayId, awayPlayerIds, gameEndTime)
        .filter(s => s.position !== 'beater' && s.position !== 'seeker' && isValidPlayerId(s.playerId)),
    };
    const beaterStints: Record<'home' | 'away', StintRecord[]> = {
      home: computeBeaterStints(sorted, resolvedHomeId, game.id, gameEndTime, playerTeamMap)
        .map(s => ({ playerId: s.playerId, teamId: s.teamId, startTime: s.startTime, endTime: s.endTime, position: 'beater' })),
      away: computeBeaterStints(sorted, resolvedAwayId, game.id, gameEndTime, playerTeamMap)
        .map(s => ({ playerId: s.playerId, teamId: s.teamId, startTime: s.startTime, endTime: s.endTime, position: 'beater' })),
    };
    const allSeekerStints = computeSeekerStints(sorted, playerTeamMap, resolvedHomeId, gameEndTime);
    const seekerStints: Record<'home' | 'away', StintRecord[]> = {
      home: allSeekerStints.filter(s => s.teamId === resolvedHomeId),
      away: allSeekerStints.filter(s => s.teamId === resolvedAwayId),
    };

    // ── Scoreboard ──
    let homeGoals = 0, awayGoals = 0, homeCatches = 0, awayCatches = 0, homeAssists = 0, awayAssists = 0;
    for (const e of sorted) {
      const t = (e.type || '').toLowerCase();
      if (t !== 'goal' && t !== 'flag_catch' && t !== 'assist') continue;
      const side = canonical(e.teamId || (e.playerId ? playerTeamMap.get(e.playerId) : undefined));
      if (!side) continue;
      const isHome = side === game.homeTeamId;
      if (t === 'goal') { if (isHome) homeGoals++; else awayGoals++; }
      else if (t === 'flag_catch') { if (isHome) homeCatches++; else awayCatches++; }
      else { if (isHome) homeAssists++; else awayAssists++; }
    }
    const homePoints = homeGoals * GOAL_POINTS + homeCatches * FLAG_POINTS;
    const awayPoints = awayGoals * GOAL_POINTS + awayCatches * FLAG_POINTS;
    const winnerTeamId = homePoints > awayPoints ? game.homeTeamId
      : awayPoints > homePoints ? game.awayTeamId
      : null;

    gameResults.push({
      gameId: game.id,
      seasonId: game.seasonId,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homePoints, awayPoints,
      homeGoals, awayGoals,
      homeFlagCatches: homeCatches, awayFlagCatches: awayCatches,
      winnerTeamId,
      margin: homePoints - awayPoints,
    });

    const homeAcc = getTeamAccum(game.homeTeamId);
    const awayAcc = getTeamAccum(game.awayTeamId);
    for (const [acc, own, opp, ownGoals, oppGoals, ownAssists, ownCatch, oppCatch] of [
      [homeAcc, homePoints, awayPoints, homeGoals, awayGoals, homeAssists, homeCatches, awayCatches],
      [awayAcc, awayPoints, homePoints, awayGoals, homeGoals, awayAssists, awayCatches, homeCatches],
    ] as [TeamAccum, number, number, number, number, number, number, number][]) {
      acc.gameIds.add(game.id);
      acc.pointsFor += own;
      acc.pointsAgainst += opp;
      acc.goals += ownGoals;
      acc.goalsAgainst += oppGoals;
      acc.assists += ownAssists;
      acc.flagCatches += ownCatch;
      acc.flagCatchesAgainst += oppCatch;
      acc.gameMinutes += gameMinutes;
      if (own > opp) acc.wins++;
      else if (own < opp) acc.losses++;
      else acc.ties++;
    }

    // ── Minutes ──
    const creditMinutes = (stints: StintRecord[], side: 'home' | 'away', unit: 'ck' | 'bt' | 'sk') => {
      const teamId = side === 'home' ? game.homeTeamId : game.awayTeamId;
      for (const s of stints) {
        const minutes = getGameMinutesInWindow(clockIntervals, s.startTime, s.endTime);
        if (minutes <= 0) continue;
        const acc = getPlayerAccum(s.playerId, teamId);
        acc[unit].minutes += minutes;
        acc.gameIds.add(game.id);
      }
    };
    creditMinutes(ckStints.home, 'home', 'ck');
    creditMinutes(ckStints.away, 'away', 'ck');
    creditMinutes(beaterStints.home, 'home', 'bt');
    creditMinutes(beaterStints.away, 'away', 'bt');
    creditMinutes(seekerStints.home, 'home', 'sk');
    creditMinutes(seekerStints.away, 'away', 'sk');

    // ── On-pitch goals and possessions ──
    // Possession inference matches the rest of the stats layer: a possession flips to the
    // other team the first time that team ends one.
    let possTeam: string | null = null;
    for (const e of sorted) {
      const t = (e.type || '').toLowerCase();
      const isGoal = t === 'goal';
      if (!POSSESSION_ENDING.has(t)) continue;

      const eventTeam = canonical(e.teamId || (e.playerId ? playerTeamMap.get(e.playerId) : undefined));
      if (!eventTeam) continue;
      const isHomeEvent = eventTeam === game.homeTeamId;

      const newPossession = possTeam !== eventTeam;
      if (newPossession) possTeam = eventTeam;

      const activeHomeCk = getActivePlayersAtTime(ckStints.home, e.videoTime);
      const activeAwayCk = getActivePlayersAtTime(ckStints.away, e.videoTime);
      const activeHomeBt = getActivePlayersAtTime(beaterStints.home, e.videoTime);
      const activeAwayBt = getActivePlayersAtTime(beaterStints.away, e.videoTime);

      const credit = (ids: Set<string>, side: 'home' | 'away', unit: 'ck' | 'bt') => {
        const teamId = side === 'home' ? game.homeTeamId : game.awayTeamId;
        const scoredByThisSide = (side === 'home') === isHomeEvent;
        for (const pid of ids) {
          const slot = getPlayerAccum(pid, teamId)[unit];
          if (isGoal) {
            if (scoredByThisSide) slot.goalsFor++; else slot.goalsAgainst++;
          }
          if (newPossession) {
            if (scoredByThisSide) slot.teamPoss++; else slot.oppPoss++;
          }
        }
      };
      credit(activeHomeCk, 'home', 'ck');
      credit(activeAwayCk, 'away', 'ck');
      credit(activeHomeBt, 'home', 'bt');
      credit(activeAwayBt, 'away', 'bt');

      if (newPossession) {
        if (isHomeEvent) { homeAcc.teamPoss++; awayAcc.oppPoss++; }
        else { awayAcc.teamPoss++; homeAcc.oppPoss++; }
      }
    }

    // ── Individual box score (chaser/keeper production) ──
    for (const e of sorted) {
      if (!isValidPlayerId(e.playerId)) continue;
      const t = (e.type || '').toLowerCase();
      if (t !== 'goal' && t !== 'assist' && t !== 'shot' && t !== 'attempt' && t !== 'miss_ko' && t !== 'turnover') continue;
      const side = canonical(e.teamId || playerTeamMap.get(e.playerId!));
      if (!side) continue;
      const acc = getPlayerAccum(e.playerId!, side);
      acc.gameIds.add(game.id);
      if (t === 'goal') acc.goals++;
      else if (t === 'assist') acc.assists++;
      else if (t === 'shot') acc.shots++;
      else if (t === 'attempt') acc.attempts++;
      else if (t === 'miss_ko') acc.missKo++;
      else acc.turnovers++;
    }

    // ── The flag ──
    const flagReleased = sorted.find(e => (e.type || '').toLowerCase() === 'flag_released');
    const firstCatch = sorted.find(e => (e.type || '').toLowerCase() === 'flag_catch');
    // Older archives record the catch but never the release. A catch is proof the flag was
    // live, so the opportunity still counts; only the window it happened in is unknown.
    const flagStart = flagReleased?.videoTime ?? firstCatch?.videoTime ?? null;
    if (flagStart !== null) {
      const flagEnd = firstCatch?.videoTime ?? gameEndTime;
      homeAcc.flagOpportunities++;
      awayAcc.flagOpportunities++;

      const flagMinutes = (s: StintRecord) =>
        getGameMinutesInWindow(clockIntervals, Math.max(s.startTime, flagStart), Math.min(s.endTime, flagEnd));
      /** Whole-game minutes, the fallback when the flag window is unknown or unstaffed. */
      const wholeGameMinutes = (s: StintRecord) =>
        getGameMinutesInWindow(clockIntervals, s.startTime, s.endTime);

      /**
       * Minutes each player of a unit logged over the flag period, as a share of the unit's
       * total. Falls back to whole-game minutes when the flag window is degenerate — which
       * it is whenever the release wasn't recorded — so the opportunity is still shared out
       * rather than silently dropped, which would leave a catch credited with no baseline.
       */
      const flagShares = (stints: StintRecord[]): Map<string, number> => {
        for (const measure of [flagMinutes, wholeGameMinutes]) {
          const minutes = new Map<string, number>();
          let total = 0;
          for (const s of stints) {
            const m = measure(s);
            if (m <= 0) continue;
            minutes.set(s.playerId, (minutes.get(s.playerId) || 0) + m);
            total += m;
          }
          if (total > 0) {
            for (const [pid, m] of minutes) minutes.set(pid, m / total);
            return minutes;
          }
        }
        return new Map();
      };

      for (const side of ['home', 'away'] as const) {
        const teamId = side === 'home' ? game.homeTeamId : game.awayTeamId;
        const ownCatches = side === 'home' ? homeCatches : awayCatches;
        const oppCatches = side === 'home' ? awayCatches : homeCatches;

        // Seekers: their own catches are recorded exactly; the *opportunity* they were on
        // pitch for is shared out by flag-live minutes, so two seekers splitting a flag
        // period split one opportunity.
        let seekerShares = flagShares(seekerStints[side]);
        if (seekerShares.size === 0 && ownCatches > 0) {
          // No seeker was ever subbed in on the record, but somebody caught it — the
          // opportunity belongs to whoever did, rather than vanishing.
          const catcher = sorted.find(e =>
            (e.type || '').toLowerCase() === 'flag_catch' &&
            isValidPlayerId(e.playerId) &&
            canonical(e.teamId || playerTeamMap.get(e.playerId!)) === teamId);
          if (catcher) seekerShares = new Map([[catcher.playerId!, 1]]);
        }
        for (const [pid, share] of seekerShares) {
          getPlayerAccum(pid, teamId).seekerFlagOpportunities += share;
        }

        // Beaters: they never touch the flag, so they take a minutes-weighted share of the
        // team's flag result over the period they were on pitch for it.
        for (const [pid, share] of flagShares(beaterStints[side])) {
          const acc = getPlayerAccum(pid, teamId);
          acc.beaterFlagPointsFor += share * ownCatches * FLAG_POINTS;
          acc.beaterFlagPointsAgainst += share * oppCatches * FLAG_POINTS;
          acc.beaterFlagOpportunities += share;
        }
      }
    }

    // Catches themselves, credited to the seeker who made them and charged to the seekers
    // who were on pitch when the opponent made theirs.
    for (const e of sorted) {
      if ((e.type || '').toLowerCase() !== 'flag_catch') continue;
      const side = canonical(e.teamId || (e.playerId ? playerTeamMap.get(e.playerId) : undefined));
      if (!side) continue;
      if (isValidPlayerId(e.playerId)) {
        getPlayerAccum(e.playerId!, side).flagCatches++;
      }
      const opponentSide = side === game.homeTeamId ? 'away' : 'home';
      const opponentTeamId = side === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
      for (const pid of getActivePlayersAtTime(seekerStints[opponentSide], e.videoTime)) {
        getPlayerAccum(pid, opponentTeamId).flagCatchesAgainst++;
      }
    }
  }

  // ── Pass 2: league baselines ──────────────────────────────────────
  const baselines = computeBaselines(gameResults, teamAccum);

  // ── Pass 3: marginal points → win shares ──────────────────────────
  const { players: playerRows, teams: teamRows } =
    allocateWinShares(playerAccum, teamAccum, baselines, playerMap, teamMap);

  const keepTeam = (teamId: string) => !teamIdSet || teamIdSet.has(teamId);

  return {
    players: playerRows.filter(p => keepTeam(p.teamId)).sort((a, b) => b.ws - a.ws),
    teams: teamRows.filter(t => keepTeam(t.teamId)).sort((a, b) => b.teamWinShares - a.teamWinShares),
    baselines,
    games: gameResults,
    excludedGames,
  };
}

// ─── Baselines ───────────────────────────────────────────────────────

function computeBaselines(
  gameResults: GameWinShareResult[],
  teamAccum: Map<string, TeamAccum>
): WinShareBaselines {
  let totalGoals = 0;
  let totalPoints = 0;
  let totalPoss = 0;
  let totalTeamGameMinutes = 0;
  let teamGames = 0;
  let flagPoints = 0;
  let flagOpportunities = 0;

  for (const acc of teamAccum.values()) {
    totalGoals += acc.goals;
    totalPoints += acc.pointsFor;
    totalPoss += acc.teamPoss;
    totalTeamGameMinutes += acc.gameMinutes;
    teamGames += acc.gameIds.size;
    flagPoints += acc.flagCatches * FLAG_POINTS;
    flagOpportunities += acc.flagOpportunities;
  }

  const pointsPerPossession = totalPoss > 0 ? (totalGoals * GOAL_POINTS) / totalPoss : 0;
  const pointsPerGame = teamGames > 0 ? totalPoints / teamGames : 0;
  const pace = totalTeamGameMinutes > 0 ? totalPoss / (totalTeamGameMinutes / 20) : 0;

  // σ of single-game margins. The mean margin is zero by symmetry (every game is one team's
  // +M and the other's −M), so the RMS *is* the standard deviation.
  const marginSigma = gameResults.length > 0
    ? Math.sqrt(gameResults.reduce((sum, g) => sum + g.margin * g.margin, 0) / gameResults.length)
    : 0;

  let usedFallbackPointsPerWin = false;
  let pointsPerWin = marginSigma / NORMAL_PEAK_DENSITY;
  if (!(pointsPerWin > 0)) {
    pointsPerWin = FALLBACK_PPW_RATIO * pointsPerGame;
    usedFallbackPointsPerWin = true;
  }
  if (!(pointsPerWin > 0)) pointsPerWin = 1; // degenerate scope; keeps the arithmetic finite

  // Replacement level is whatever makes a full replacement-level team win about zero games
  // at this points-per-win. See the module header.
  const rawReplacement = pointsPerGame > 0 ? pointsPerWin / (4 * pointsPerGame) : MIN_REPLACEMENT_FRACTION;
  const replacementFraction = Math.min(MAX_REPLACEMENT_FRACTION, Math.max(MIN_REPLACEMENT_FRACTION, rawReplacement));

  const flagPointsPerOpportunity = flagOpportunities > 0 ? flagPoints / flagOpportunities : 0;

  return {
    games: gameResults.length,
    teamGames,
    pointsPerPossession: round3(pointsPerPossession),
    pointsPerGame: round2(pointsPerGame),
    pace: round2(pace),
    marginSigma: round2(marginSigma),
    pointsPerWin: round2(pointsPerWin),
    replacementFraction: round3(replacementFraction),
    flagPointsPerOpportunity: round2(flagPointsPerOpportunity),
    usedFallbackPointsPerWin,
    lowSample: gameResults.length < MIN_GAMES_FOR_STABLE_PPW,
  };
}

// ─── Allocation ──────────────────────────────────────────────────────

function allocateWinShares(
  playerAccum: Map<string, PlayerAccum>,
  teamAccum: Map<string, TeamAccum>,
  baselines: WinShareBaselines,
  playerMap: Map<string, Player>,
  teamMap: Map<string, Team>
): { players: PlayerWinShares[]; teams: TeamWinShares[] } {
  const r = baselines.replacementFraction;
  const lgPPP = baselines.pointsPerPossession;
  const lgFlagPPO = baselines.flagPointsPerOpportunity;
  const replacementPPP = (1 - r) * lgPPP;
  const opponentReplacementPPP = (1 + r) * lgPPP;

  // Group players by team so the per-team denominators (unit minutes, possession scaling)
  // can be built once.
  const byTeam = new Map<string, PlayerAccum[]>();
  for (const acc of playerAccum.values()) {
    let list = byTeam.get(acc.teamId);
    if (!list) { list = []; byTeam.set(acc.teamId, list); }
    list.push(acc);
  }

  const playerRows: PlayerWinShares[] = [];
  const teamRows: TeamWinShares[] = [];

  for (const [teamId, team] of teamAccum) {
    const roster = byTeam.get(teamId) || [];
    const gamesPlayed = team.gameIds.size;

    const teamPace = team.gameMinutes > 0 ? team.teamPoss / (team.gameMinutes / 20) : 0;
    const pointsPerWin = baselines.pace > 0 && teamPace > 0
      ? baselines.pointsPerWin * (teamPace / baselines.pace)
      : baselines.pointsPerWin;
    const safePPW = pointsPerWin > 0 ? pointsPerWin : 1;

    // Team rates, used as the no-information prior for a player with no on-pitch sample.
    const teamOffPPP = team.teamPoss > 0 ? (team.goals * GOAL_POINTS) / team.teamPoss : lgPPP;
    const teamDefPPP = team.oppPoss > 0 ? (team.goalsAgainst * GOAL_POINTS) / team.oppPoss : lgPPP;

    // Share of goals that carried a recorded assist, so points produced still totals the
    // team's actual goal points however generously assists were tracked.
    const assistedShare = team.goals > 0 ? Math.min(1, team.assists / team.goals) : 0;

    // Raw individual production and usage, before calibrating to the team totals.
    const rawProduction = new Map<string, number>();
    const rawUsage = new Map<string, number>();
    let sumProduction = 0;
    let sumUsage = 0;
    for (const acc of roster) {
      const produced = GOAL_POINTS * (acc.goals * (1 - ASSIST_CREDIT * assistedShare) + ASSIST_CREDIT * acc.assists);
      const used = acc.goals + acc.shots + acc.attempts + acc.missKo + acc.turnovers;
      rawProduction.set(acc.playerId, produced);
      rawUsage.set(acc.playerId, used);
      sumProduction += produced;
      sumUsage += used;
    }
    // Oliver calibrates individual possession estimates against the team's possession count;
    // the same trick handles this data's unattributed events, redistributing them across the
    // players who *were* named rather than leaving production free of any workload cost.
    const teamGoalPoints = team.goals * GOAL_POINTS;
    const productionScale = sumProduction > 0 ? teamGoalPoints / sumProduction : 0;
    const usageScale = sumUsage > 0 ? team.teamPoss / sumUsage : 0;

    // Unit minutes — the denominators that make each unit's shares sum to one.
    let ckMinutes = 0, beaterMinutes = 0;
    for (const acc of roster) { ckMinutes += acc.ck.minutes; beaterMinutes += acc.bt.minutes; }

    let teamWS = 0, teamOWS = 0, teamDWS = 0;

    for (const acc of roster) {
      const player = playerMap.get(acc.playerId);
      if (!player) continue;

      const minutes = acc.ck.minutes + acc.bt.minutes + acc.sk.minutes;

      // ── Chaser / keeper offense: points produced against possessions used ──
      const pointsProduced = (rawProduction.get(acc.playerId) || 0) * productionScale;
      const possessionsUsed = (rawUsage.get(acc.playerId) || 0) * usageScale;
      const ckOffense = QUAD_OFF_SHARE_CK * (pointsProduced - replacementPPP * possessionsUsed);

      // ── Chaser / keeper defense: goals conceded on pitch against the replacement bar ──
      const ckShare = ckMinutes > 0 ? acc.ck.minutes / ckMinutes : 0;
      const ckDrtg = acc.ck.oppPoss > 0
        ? (acc.ck.goalsAgainst * GOAL_POINTS) / acc.ck.oppPoss
        : teamDefPPP;
      const ckDefense = QUAD_DEF_SHARE_CK * ckShare * team.oppPoss * (opponentReplacementPPP - ckDrtg);

      // ── Beaters: no box score, so both sides come from on-pitch team rates ──
      const btShare = beaterMinutes > 0 ? acc.bt.minutes / beaterMinutes : 0;
      const btOrtg = acc.bt.teamPoss > 0
        ? (acc.bt.goalsFor * GOAL_POINTS) / acc.bt.teamPoss
        : teamOffPPP;
      const btDrtg = acc.bt.oppPoss > 0
        ? (acc.bt.goalsAgainst * GOAL_POINTS) / acc.bt.oppPoss
        : teamDefPPP;
      const btOffense = QUAD_OFF_SHARE_BEATER * btShare * team.teamPoss * (btOrtg - replacementPPP);
      const btDefense = QUAD_DEF_SHARE_BEATER * btShare * team.oppPoss * (opponentReplacementPPP - btDrtg);

      // ── The flag ──
      const seekerFlagOffense = FLAG_SHARE_SEEKER *
        (acc.flagCatches * FLAG_POINTS - (1 - r) * lgFlagPPO * acc.seekerFlagOpportunities);
      const seekerFlagDefense = FLAG_SHARE_SEEKER *
        ((1 + r) * lgFlagPPO * acc.seekerFlagOpportunities - acc.flagCatchesAgainst * FLAG_POINTS);
      const beaterFlagOffense = FLAG_SHARE_BEATER *
        (acc.beaterFlagPointsFor - (1 - r) * lgFlagPPO * acc.beaterFlagOpportunities);
      const beaterFlagDefense = FLAG_SHARE_BEATER *
        ((1 + r) * lgFlagPPO * acc.beaterFlagOpportunities - acc.beaterFlagPointsAgainst);

      const marginalOffense = ckOffense + btOffense + seekerFlagOffense + beaterFlagOffense;
      const marginalDefense = ckDefense + btDefense + seekerFlagDefense + beaterFlagDefense;

      const ows = marginalOffense / safePPW;
      const dws = marginalDefense / safePPW;
      const ws = ows + dws;

      teamOWS += ows;
      teamDWS += dws;
      teamWS += ws;

      // A player with no tracked minutes anywhere (an event-only appearance) still has a
      // production line; keep the row, but a per-20 rate off zero minutes is meaningless.
      const wsPer20 = minutes > 0 ? (ws / minutes) * 20 : 0;

      playerRows.push({
        playerId: acc.playerId,
        playerName: `${player.firstName || acc.playerId} ${player.lastName || ''}`.trim(),
        firstName: player.firstName || acc.playerId,
        lastName: player.lastName || '',
        preferredName: player.preferredName,
        nickname: player.nickname,
        teamId,
        teamName: teamMap.get(teamId)?.name || teamId,
        unit: primaryUnit(acc),
        gamesPlayed: acc.gameIds.size,
        minutesPlayed: round1(minutes),
        quadballMinutes: round1(acc.ck.minutes),
        beaterMinutes: round1(acc.bt.minutes),
        seekerMinutes: round1(acc.sk.minutes),
        ows: round2(ows),
        dws: round2(dws),
        ws: round2(ws),
        wsPer20: round3(wsPer20),
        marginalOffense: round1(marginalOffense),
        marginalDefense: round1(marginalDefense),
        pointsProduced: round1(pointsProduced),
        possessionsUsed: round1(possessionsUsed),
        flagCatches: acc.flagCatches,
        flagCatchesAgainst: acc.flagCatchesAgainst,
        pointsPerWin: round1(pointsPerWin),
      });
    }

    const decided = team.wins + team.losses + team.ties;
    teamRows.push({
      teamId,
      teamName: teamMap.get(teamId)?.name || teamId,
      gamesPlayed,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      winPct: decided > 0 ? round3((team.wins + 0.5 * team.ties) / decided) : 0,
      pointsFor: team.pointsFor,
      pointsAgainst: team.pointsAgainst,
      pointDiff: team.pointsFor - team.pointsAgainst,
      marginPerGame: gamesPlayed > 0 ? round1((team.pointsFor - team.pointsAgainst) / gamesPlayed) : 0,
      pace: round1(teamPace),
      pointsPerWin: round1(pointsPerWin),
      expectedWins: round2(gamesPlayed / 2 + (team.pointsFor - team.pointsAgainst) / safePPW),
      teamWinShares: round2(teamWS),
      ows: round2(teamOWS),
      dws: round2(teamDWS),
      calibration: round2(teamWS - team.wins),
    });
  }

  return { players: mergePlayerRows(playerRows), teams: teamRows };
}

/** Where a player spent most of their minutes; 'hybrid' when no unit holds a clear majority. */
function primaryUnit(acc: PlayerAccum): WinShareUnit {
  const total = acc.ck.minutes + acc.bt.minutes + acc.sk.minutes;
  if (total <= 0) return acc.flagCatches > 0 ? 'seeker' : 'quadball';
  const entries: [WinShareUnit, number][] = [
    ['quadball', acc.ck.minutes],
    ['beater', acc.bt.minutes],
    ['seeker', acc.sk.minutes],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][1] / total >= 0.6 ? entries[0][0] : 'hybrid';
}

/**
 * One row per player. Win Shares are computed against each team's own denominators, so a
 * player who changed teams accumulates a row per team; those are summed here and attributed
 * to whichever team they played the most minutes for.
 */
function mergePlayerRows(rows: PlayerWinShares[]): PlayerWinShares[] {
  const byPlayer = new Map<string, PlayerWinShares[]>();
  for (const row of rows) {
    let list = byPlayer.get(row.playerId);
    if (!list) { list = []; byPlayer.set(row.playerId, list); }
    list.push(row);
  }

  const merged: PlayerWinShares[] = [];
  for (const list of byPlayer.values()) {
    if (list.length === 1) { merged.push(list[0]); continue; }
    const primary = list.reduce((best, row) => (row.minutesPlayed > best.minutesPlayed ? row : best), list[0]);
    const sum = (pick: (r: PlayerWinShares) => number) => list.reduce((s, r) => s + pick(r), 0);
    merged.push({
      ...primary,
      gamesPlayed: sum(r => r.gamesPlayed),
      minutesPlayed: round1(sum(r => r.minutesPlayed)),
      quadballMinutes: round1(sum(r => r.quadballMinutes)),
      beaterMinutes: round1(sum(r => r.beaterMinutes)),
      seekerMinutes: round1(sum(r => r.seekerMinutes)),
      ows: round2(sum(r => r.ows)),
      dws: round2(sum(r => r.dws)),
      ws: round2(sum(r => r.ws)),
      wsPer20: (() => {
        const mins = sum(r => r.minutesPlayed);
        return mins > 0 ? round3((sum(r => r.ws) / mins) * 20) : 0;
      })(),
      marginalOffense: round1(sum(r => r.marginalOffense)),
      marginalDefense: round1(sum(r => r.marginalDefense)),
      pointsProduced: round1(sum(r => r.pointsProduced)),
      possessionsUsed: round1(sum(r => r.possessionsUsed)),
      flagCatches: sum(r => r.flagCatches),
      flagCatchesAgainst: sum(r => r.flagCatchesAgainst),
    });
  }
  return merged;
}
