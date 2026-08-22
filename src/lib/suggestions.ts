// Suggested edits — Phase 1/2. See docs/suggested-edits-design.md.
//
// Suggestions are documents in gameEvents/{gameId}/suggestions, never events themselves.
// A suggestion stores a sparse patch — only the fields being changed — plus a `baseline`
// snapshot of what those fields held at suggest time, so an accept can detect drift and a
// diff can render as a clean before/after without needing the whole event.
import type { EventType, GameEvent, PositionType } from '../App';

/** The only fields a suggestion may ever touch. Never `id`, `userId`, or vote fields. */
export type SuggestablePatch = Partial<Pick<GameEvent,
  'type' | 'videoTime' | 'playerId' | 'subPlayerId' | 'teamId' | 'position' | 'color' | 'relatedEventId'
>>;

export const SUGGESTABLE_KEYS: (keyof SuggestablePatch)[] = [
  'type', 'videoTime', 'playerId', 'subPlayerId', 'teamId', 'position', 'color', 'relatedEventId',
];

export type SuggestionKind = 'edit' | 'delete' | 'add';
export type SuggestionStatus = 'open' | 'accepted' | 'rejected' | 'superseded';

export type DeleteReason = 'did_not_happen' | 'duplicate' | 'wrong_moment' | 'other';

export const DELETE_REASON_LABELS: Record<DeleteReason, string> = {
  did_not_happen: "This didn't happen",
  duplicate: 'Duplicate of another event',
  wrong_moment: "Doesn't match this moment in the video",
  other: 'Other',
};

export interface EventSuggestion {
  id: string;
  gameId: string;
  videoId: string;

  kind: SuggestionKind;
  targetEventId: string | null; // null only when kind === 'add'

  patch: SuggestablePatch;
  baseline: SuggestablePatch; // values of exactly the patched keys, at suggest time

  /**
   * Required for kind === 'delete', absent otherwise. A closed set, never free text — see
   * governing principle in docs/suggested-edits-design.md §2. The diff itself is the
   * explanation for an edit; a delete needs *some* reason but not an open text box.
   */
  reason?: DeleteReason;
  authorId: string; // uid only — never a name, label, or email
  createdAt: any;

  status: SuggestionStatus;
  resolvedBy?: string;
  resolvedAt?: any;

  upvoterIds: string[];
  downvoterIds: string[];
  score: number; // up - down, for ordering the review queue
}

export interface EventRevision {
  id: string;
  gameId: string;
  targetEventId: string;
  before: SuggestablePatch | null; // null when the revision is a deletion or an addition
  after: SuggestablePatch | null;
  suggestionId: string;
  suggestedBy: string;
  resolvedBy: string;
  createdAt: any;
}

/**
 * Deterministic id for edit/delete suggestions: one open suggestion of a given kind per
 * (event, author) pair, structurally. `add` suggestions have no target to key off, so they
 * get a random id instead.
 */
export function suggestionId(kind: SuggestionKind, targetEventId: string | null, authorId: string): string {
  if (kind === 'add' || !targetEventId) return `add_${crypto.randomUUID()}`;
  return `${targetEventId}__${authorId}__${kind}`;
}

/** Sparse patch of only the fields that actually differ, plus their current values as the baseline. */
export function diffEvent(original: GameEvent, edited: SuggestablePatch): { patch: SuggestablePatch; baseline: SuggestablePatch } {
  const patch: SuggestablePatch = {};
  const baseline: SuggestablePatch = {};
  for (const key of SUGGESTABLE_KEYS) {
    if (!(key in edited)) continue;
    const before = original[key];
    const after = edited[key];
    if (before === after) continue;
    if ((before === undefined || before === null) && (after === undefined || after === null)) continue;
    (patch as any)[key] = after;
    (baseline as any)[key] = before ?? null;
  }
  return { patch, baseline };
}

/** True if the live event still holds what the suggestion was made against. */
export function baselineStillMatches(liveEvent: GameEvent, baseline: SuggestablePatch): boolean {
  return (Object.keys(baseline) as (keyof SuggestablePatch)[]).every(key => {
    const live = liveEvent[key] ?? null;
    const expected = baseline[key] ?? null;
    return live === expected;
  });
}

/** Apply a suggestion's patch to an event, producing the next version. */
export function applyPatch(event: GameEvent, patch: SuggestablePatch): GameEvent {
  return { ...event, ...patch };
}

export const TYPE_LABELS: Partial<Record<EventType, string>> = {
  goal: 'Goal', assist: 'Assist', shot: 'Shot', attempt: 'Attempt', miss_ko: 'Miss (KO)',
  foul: 'Foul', card: 'Card', sub_in: 'Sub In', sub_out: 'Sub Out',
  control_change: 'Control Change', turnover: 'Turnover', flag_released: 'Flag Released',
  flag_catch: 'Flag Catch', control_start: 'Control Start', quadball_start: 'Quadball Start',
  gameStart: 'Game Start', gamePause: 'Game Pause', gameEnd: 'Game End',
};

export const POSITION_LABELS: Record<PositionType, string> = {
  chaser: 'Chaser', keeper: 'Keeper', beater: 'Beater', seeker: 'Seeker',
};

/** Human-readable label for one patched field, for rendering a diff card. */
export function describeFieldValue(key: keyof SuggestablePatch, value: unknown, ctx: {
  playerName?: (id: string) => string | undefined;
  teamName?: (id: string) => string | undefined;
}): string {
  if (value === undefined || value === null) return '—';
  switch (key) {
    case 'type': return TYPE_LABELS[value as EventType] || String(value);
    case 'position': return POSITION_LABELS[value as PositionType] || String(value);
    case 'playerId':
    case 'subPlayerId': return ctx.playerName?.(String(value)) || String(value);
    case 'teamId': return ctx.teamName?.(String(value)) || String(value);
    case 'videoTime': {
      const t = Number(value);
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    }
    case 'color': return String(value);
    default: return String(value);
  }
}

export function fieldLabel(key: keyof SuggestablePatch): string {
  switch (key) {
    case 'type': return 'Type';
    case 'videoTime': return 'Time';
    case 'playerId': return 'Player';
    case 'subPlayerId': return 'Sub Player';
    case 'teamId': return 'Team';
    case 'position': return 'Position';
    case 'color': return 'Card Color';
    case 'relatedEventId': return 'Related Event';
    default: return key;
  }
}
