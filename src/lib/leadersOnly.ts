/**
 * Leaders Only — an optional, release-time mode for the public stats leaderboards.
 *
 * Quadball is a casual sport, and a leaderboard that ranks everybody also ranks
 * somebody last. In this mode the leaderboards publish only the top slice of the
 * field for whichever column is being sorted, and every sortable column is locked
 * to its "best first" direction, so there's no way to flip a table over and read
 * off the worst players.
 *
 * Whether it's on is a deploy-time decision (VITE_LEADERS_ONLY) rather than a
 * viewer preference — a public toggle would defeat the point. Moderators are the
 * exception: they always get the full tables, since they need the whole field to
 * check tracking. The one way to look at the public view is `?leaders=on`, which
 * only ever turns the mode on.
 */

// Kept local rather than imported from the StatsTable component so this module
// stays free of UI imports. Structurally identical to StatsTable's SortDir.
type SortDir = 'asc' | 'desc';

/** Fraction of the ranked field that stays visible. */
export const LEADERS_TOP_FRACTION = 0.1;

/**
 * Floor on the published rows. Ten percent of a 30-player pool is three names,
 * which is a podium, not a leaderboard.
 */
export const LEADERS_MIN_ROWS = 10;

const TRUTHY = new Set(['1', 'true', 'on', 'yes']);

/**
 * `?leaders=on` forces the mode on for this page load, for anyone, moderators
 * included — the one way to see the public view without a rebuild or a role
 * change. It deliberately only turns the mode ON: a parameter that could turn it
 * off would be a public bypass of the whole feature, so `?leaders=off` does
 * nothing.
 */
export const LEADERS_ONLY_FORCED = (() => {
  if (typeof window === 'undefined') return false;
  try {
    const value = new URLSearchParams(window.location.search).get('leaders');
    return value !== null && TRUTHY.has(value.trim().toLowerCase());
  } catch {
    return false;
  }
})();

/**
 * Release-time switch. Off unless the build was given VITE_LEADERS_ONLY.
 * Read once at module load — it's baked into the bundle by Vite either way.
 */
export const LEADERS_ONLY_ENABLED = LEADERS_ONLY_FORCED || TRUTHY.has(
  String(import.meta.env?.VITE_LEADERS_ONLY ?? '').trim().toLowerCase()
);

export type StatPolarity = 'higher' | 'lower' | 'neutral';

/**
 * Columns where a *smaller* number is the better result. Only keys where zero
 * genuinely means "did well" belong here — see NEUTRAL_STATS for the ones where
 * zero is really "no data".
 */
const LOWER_IS_BETTER = new Set([
  'minus', 'offMinus',
  'turnovers', 'turnoversPerGame', 'turnoversPerTwenty', 'turnoversPer20', 'turnoversPer25Possessions',
  'missKo', 'missTotal', 'missesPerTwenty',
  'fouls', 'foulsPer20',
  'dRtg', 'iDRTG',
  'epr',
  'goalsAgainst',
  'opponentCatches',
  'oppControlPct',
]);

/**
 * Columns with no "good" direction, so they keep normal two-way sorting even in
 * Leaders Only. Either they're context rather than merit, or a low value is the
 * no-data sentinel (a seeker with no catches has avgTimeToCatch === 0, and
 * sorting ascending would crown them the fastest catcher in the league).
 */
const NEUTRAL_STATS = new Set([
  'avgTimeToCatch', 'avgTimeFromRelease',
  'avgPointDiff',
  'offPlusMinusRatio', 'offPlus', 'offPlusMinus', 'onOffDt',
  'controlDependencyDelta', 'controlChangesPerMin', 'eventsPerMin',
  'playerName', 'teamName', 'firstName', 'lastName',
]);

/** Strips the `:with` / `:without` suffix that split control columns sort by. */
function baseKey(sortKey: string): string {
  return String(sortKey).replace(/:(with|without)$/, '');
}

export function statPolarity(sortKey: string): StatPolarity {
  const key = baseKey(sortKey);
  if (NEUTRAL_STATS.has(key)) return 'neutral';
  if (LOWER_IS_BETTER.has(key)) return 'lower';
  return 'higher';
}

/** The direction that puts the best performers first. */
export function bestFirstDir(sortKey: string): SortDir {
  return statPolarity(sortKey) === 'lower' ? 'asc' : 'desc';
}

/** The direction Leaders Only pins a column to, or null if the column is neutral. */
export function lockedSortDir(sortKey: string): SortDir | null {
  const polarity = statPolarity(sortKey);
  if (polarity === 'neutral') return null;
  return polarity === 'lower' ? 'asc' : 'desc';
}

/**
 * Shared click-to-sort behaviour. In Leaders Only a column with a good direction
 * always snaps to it; everything else keeps the usual toggle.
 */
export function resolveSortDir(
  nextKey: string,
  currentKey: string,
  currentDir: SortDir,
  leadersOnly: boolean
): SortDir {
  if (leadersOnly) {
    const locked = lockedSortDir(nextKey);
    if (locked) return locked;
  }
  if (nextKey === currentKey) return currentDir === 'asc' ? 'desc' : 'asc';
  return 'desc';
}

/** How many rows of a ranked field of `total` stay visible. */
export function leadersVisibleCount(total: number): number {
  if (total <= 0) return 0;
  return Math.min(total, Math.max(LEADERS_MIN_ROWS, Math.ceil(total * LEADERS_TOP_FRACTION)));
}

/**
 * Trim a ranked list to its published leaders. Pass `enabled` false and the list
 * comes back untouched, so callers don't need to branch.
 */
export function leadersSlice<T>(rows: T[], enabled: boolean): T[] {
  if (!enabled) return rows;
  return rows.slice(0, leadersVisibleCount(rows.length));
}
