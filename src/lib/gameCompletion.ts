/**
 * Game completion model.
 *
 * Completeness is a property of a *team within a game*, not of the game as a whole.
 * One author can finish tracking the home side while the away side is still untouched,
 * and the home side's stats are publishable the moment that half is done.
 *
 *   none              — nobody has declared this side finished; its stats don't aggregate.
 *   complete          — fully tracked, subs included; safe for minutes/lineup-derived stats.
 *   complete_no_subs  — every scoring/action event is tracked, but substitutions were not,
 *                       so anything derived from stints (minutes, on/off, RAPM) is unreliable.
 *
 * Two scopes fall out of that, and they are what the Stats page toggles between:
 *
 *   public — at least one side is complete. The complete side's stats aggregate; the
 *            other side's do not, even though both sides' events still exist.
 *   full   — both sides are complete.
 *
 * `isVerified` is the legacy whole-game flag this replaces. It is still read as a fallback
 * so games marked complete under the old model keep counting (true => both sides 'complete'),
 * and it is still written as a mirror of "both sides complete" for anything that hasn't
 * migrated. Event-level `status: 'verified'` is a separate concept that is currently unused
 * — events are valid as soon as they are authored, and accuracy is settled by voting.
 */

export type TeamCompletion = 'none' | 'complete' | 'complete_no_subs';

/** Which slice of the data a stats surface is asking for. */
export type CompletionScope = 'public' | 'full';

export interface CompletionGame {
  homeTeamId?: string;
  awayTeamId?: string;
  homeCompletion?: TeamCompletion | null;
  awayCompletion?: TeamCompletion | null;
  /** Legacy whole-game completion flag; read only as a fallback. */
  isVerified?: boolean;
}

export const TEAM_COMPLETION_VALUES: TeamCompletion[] = ['none', 'complete', 'complete_no_subs'];

export const TEAM_COMPLETION_LABELS: Record<TeamCompletion, string> = {
  none: 'Not Complete',
  complete: 'Complete',
  complete_no_subs: 'Complete (No Subs)',
};

/** Compact label for badges and buttons, where the team name already supplies context. */
export const TEAM_COMPLETION_SHORT_LABELS: Record<TeamCompletion, string> = {
  none: 'Incomplete',
  complete: 'Complete',
  complete_no_subs: 'No Subs',
};

function normalizeCompletion(value: unknown, legacyVerified: boolean): TeamCompletion {
  if (value === 'complete' || value === 'complete_no_subs' || value === 'none') return value;
  return legacyVerified ? 'complete' : 'none';
}

export function sideCompletion(game: CompletionGame | null | undefined, side: 'home' | 'away'): TeamCompletion {
  if (!game) return 'none';
  const raw = side === 'home' ? game.homeCompletion : game.awayCompletion;
  return normalizeCompletion(raw, !!game.isVerified);
}

/** 'none' for a team that isn't in this game at all. */
export function teamCompletion(game: CompletionGame | null | undefined, teamId: string | null | undefined): TeamCompletion {
  if (!game || !teamId) return 'none';
  if (teamId === game.homeTeamId) return sideCompletion(game, 'home');
  if (teamId === game.awayTeamId) return sideCompletion(game, 'away');
  return 'none';
}

export function isTeamComplete(game: CompletionGame | null | undefined, teamId: string | null | undefined): boolean {
  return teamCompletion(game, teamId) !== 'none';
}

/** True only when this team's substitutions were tracked, so stint-derived stats hold up. */
export function teamTracksSubs(game: CompletionGame | null | undefined, teamId: string | null | undefined): boolean {
  return teamCompletion(game, teamId) === 'complete';
}

/** At least one side finished — the game contributes to the Public stats scope. */
export function isPartiallyComplete(game: CompletionGame | null | undefined): boolean {
  return sideCompletion(game, 'home') !== 'none' || sideCompletion(game, 'away') !== 'none';
}

/** Both sides finished, subs or not. */
export function isFullyComplete(game: CompletionGame | null | undefined): boolean {
  return sideCompletion(game, 'home') !== 'none' && sideCompletion(game, 'away') !== 'none';
}

/** Both sides finished *with* subs — the bar for anything lineup-based (RAPM, league baselines). */
export function isFullyCompleteWithSubs(game: CompletionGame | null | undefined): boolean {
  return sideCompletion(game, 'home') === 'complete' && sideCompletion(game, 'away') === 'complete';
}

export function gameMatchesScope(game: CompletionGame | null | undefined, scope: CompletionScope): boolean {
  return scope === 'full' ? isFullyComplete(game) : isPartiallyComplete(game);
}

/**
 * Events an incomplete side keeps in a partially-complete game.
 *
 * Dropping the incomplete side outright would wreck the *complete* side's numbers — their
 * goals conceded, their time with bludger control and their score line all depend on the
 * opponent's events. So the opponent stays in the timeline as context, stripped of player
 * attribution, and everything that would only ever feed the opponent's own stat line
 * (their beats, their subs, their turnovers) is dropped.
 */
const TEAM_CONTEXT_EVENT_TYPES = new Set([
  'goal',
  'flag_catch',
  'flag_released',
  'control_change',
  'control_start',
  'gameStart',
  'gamePause',
  'gameEnd',
  'quadball_start',
]);

interface ScopableEvent {
  gameId: string;
  type: string;
  teamId?: string | null;
  playerId?: string | null;
}

/**
 * Narrow a flat event list to what the given scope is allowed to aggregate.
 *
 * Games outside the scope drop entirely. Inside a partially-complete game the incomplete
 * side is reduced to context (see above), which is what keeps its players and its team row
 * out of the aggregates while leaving the complete side's numbers intact.
 */
export function scopeEventsToCompleteTeams<T extends ScopableEvent>(
  events: T[],
  games: (CompletionGame & { id: string })[],
  scope: CompletionScope
): T[] {
  const gameById = new Map<string, CompletionGame & { id: string }>();
  for (const g of games) {
    if (gameMatchesScope(g, scope)) gameById.set(g.id, g);
  }

  // Events don't all carry teamId (a sub or a beat may only name the player), so recover the
  // mapping from the events that carry both.
  const playerTeamByGame = new Map<string, Map<string, string>>();
  for (const e of events) {
    if (!e.playerId || !e.teamId || !gameById.has(e.gameId)) continue;
    let map = playerTeamByGame.get(e.gameId);
    if (!map) { map = new Map(); playerTeamByGame.set(e.gameId, map); }
    if (!map.has(e.playerId)) map.set(e.playerId, e.teamId);
  }

  const scoped: T[] = [];
  for (const e of events) {
    const game = gameById.get(e.gameId);
    if (!game) continue;

    const teamId = e.teamId || (e.playerId ? playerTeamByGame.get(e.gameId)?.get(e.playerId) : undefined);
    // Neutral events, and everything belonging to a complete side, pass through untouched.
    if (!teamId || isTeamComplete(game, teamId)) {
      scoped.push(e);
      continue;
    }

    if (!TEAM_CONTEXT_EVENT_TYPES.has(e.type)) continue;
    scoped.push({ ...e, teamId, playerId: null } as T);
  }
  return scoped;
}
