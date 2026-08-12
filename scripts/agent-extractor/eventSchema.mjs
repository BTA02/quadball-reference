// eventSchema.mjs
// Converts raw model output into the exact GameEvent object shape that App.tsx
// writes into gameEvents/{gameId}.events (see handleAddEvent in src/App.tsx).

import { randomUUID } from 'crypto';

// The canonical EventType union from src/App.tsx
export const EVENT_TYPES = [
  'goal', 'assist', 'shot', 'attempt', 'miss_ko',
  'gameStart', 'gamePause', 'gameEnd',
  'foul', 'card',
  'sub_in', 'sub_out',
  'control_change', 'turnover',
  'flag_released', 'flag_catch',
  'control_start', 'quadball_start',
];

export const POSITIONS = ['chaser', 'keeper', 'beater', 'seeker'];

// Tag so we can identify / clean up agent-generated events later.
export const AGENT_SOURCE = 'claude-video-extractor';

/**
 * Map a raw model event to a fully-formed GameEvent.
 *
 * rawEvent fields expected from the model:
 *   { videoTime, type, team: 'home'|'away'|'neutral', playerJersey?,
 *     assistedByPlayerJersey?, subPlayerJersey?, position?, cardColor?, description? }
 *
 * ctx: {
 *   videoId, gameId, userId, userName,
 *   homeTeamId, awayTeamId,
 *   homeByNumber: {num:{playerId,name}}, awayByNumber: {...}
 * }
 */
export function toGameEvent(raw, ctx) {
  const teamId =
    raw.team === 'home' ? ctx.homeTeamId :
    raw.team === 'away' ? ctx.awayTeamId :
    null;

  const byNumber =
    raw.team === 'home' ? (ctx.homeByNumber || {}) :
    raw.team === 'away' ? (ctx.awayByNumber || {}) :
    {};

  const lookup = (jersey) => {
    if (jersey === undefined || jersey === null || jersey === '') return null;
    const hit = byNumber[String(jersey).trim()];
    return hit ? hit.playerId : null;
  };

  const playerId = lookup(raw.playerJersey);
  // sub_in uses subPlayerId for the player entering; assists carry the assister as subPlayerId-less relatedEvent.
  const subPlayerId = lookup(raw.subPlayerJersey);

  const ev = {
    id: randomUUID(),
    videoId: ctx.videoId,
    gameId: ctx.gameId,
    userId: ctx.userId || 'agent',
    userName: ctx.userName || 'Claude Extractor',
    type: raw.type,
    videoTime: Math.round(Number(raw.videoTime) || 0),
    gameTime: null,
    createdAt: new Date().toISOString(),
    votes: 0,
    upvotes: 0,
    downvotes: 0,
    upvoterIds: [],
    downvoterIds: [],
    status: 'unverified',
    playerId: playerId || null,
    teamId: teamId,
    subPlayerId: subPlayerId || null,
    relatedEventId: null,
    position: POSITIONS.includes(raw.position) ? raw.position : null,
    // extra metadata (ignored by the app's required schema, useful for review)
    color: raw.cardColor || null,
    source: AGENT_SOURCE,
    description: raw.description || null,
    // Unmapped jersey numbers are preserved so you can reconcile later.
    rawPlayerJersey: raw.playerJersey ?? null,
    rawAssistJersey: raw.assistedByPlayerJersey ?? null,
    rawSubJersey: raw.subPlayerJersey ?? null,
  };
  return ev;
}

/**
 * Convert a list of raw model events into linked GameEvents.
 * Also synthesizes 'assist' events from goals that carry assistedByPlayerJersey,
 * and links them via relatedEventId.
 */
export function buildGameEvents(rawEvents, ctx) {
  const out = [];
  for (const raw of rawEvents) {
    if (!EVENT_TYPES.includes(raw.type)) continue; // skip unknown types
    const goal = toGameEvent(raw, ctx);
    out.push(goal);

    if (raw.type === 'goal' && raw.assistedByPlayerJersey) {
      const assistRaw = {
        videoTime: raw.videoTime,
        type: 'assist',
        team: raw.team,
        playerJersey: raw.assistedByPlayerJersey,
        position: 'chaser',
        description: `Assist on goal by #${raw.playerJersey ?? '?'}`,
      };
      const assist = toGameEvent(assistRaw, ctx);
      assist.relatedEventId = goal.id;
      out.push(assist);
    }
  }
  return out.sort((a, b) => a.videoTime - b.videoTime);
}

/** Basic sanity validation; returns a list of human-readable warnings. */
export function validateEvents(events) {
  const warnings = [];
  let lastT = -1;
  events.forEach((e, i) => {
    if (!EVENT_TYPES.includes(e.type)) warnings.push(`#${i}: unknown type "${e.type}"`);
    if (typeof e.videoTime !== 'number' || e.videoTime < 0) warnings.push(`#${i}: bad videoTime`);
    if (['goal', 'shot', 'turnover', 'control_change'].includes(e.type) && !e.teamId)
      warnings.push(`#${i} (${e.type}@${e.videoTime}s): missing teamId`);
    if (['goal', 'shot'].includes(e.type) && !e.playerId)
      warnings.push(`#${i} (${e.type}@${e.videoTime}s): jersey ${e.rawPlayerJersey ?? '?'} did not map to a playerId`);
    if (e.videoTime < lastT) warnings.push(`#${i}: out of chronological order`);
    lastT = e.videoTime;
  });
  return warnings;
}
