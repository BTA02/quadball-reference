// claudeVision.mjs — analyze a batch of video frames with Claude (Anthropic API)
// and return structured quadball events.

import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

export const SYSTEM_PROMPT = `You are a professional Quadball (formerly Quidditch) statistician doing film breakdown.
You will be shown an ORDERED sequence of still frames sampled from one continuous window of a game video.
Each frame is labelled with its absolute video timestamp in seconds. Treat them as a short flip-book of play.

QUADBALL RULES YOU MUST KNOW:
- 6-7 players per team on pitch: 4 chasers (one is the keeper, the goal defender), 2 beaters, plus a seeker when released.
- Chasers/keeper move the quadball (volleyball) and score through one of 3 hoops. A goal = 10 points (log as one 'goal').
- Beaters fight over 3 dodgeballs ("bludgers"). Whoever holds 2 of 3 has "control". A team gaining/losing control = 'control_change'.
- Seekers chase the flag runner; catching the flag = 'flag_catch' (worth ~35 pts, often ends the game).

EVENT TYPES (use ONLY these in the "type" field):
  goal            – ball goes through a hoop. Set playerJersey to the scorer. If a clear pass set it up, set assistedByPlayerJersey.
  shot            – shot at hoops that misses / is saved / blocked.
  turnover        – possession of the quadball changes teams (drop, interception, bad pass, strip).
  control_change  – a team newly secures (or loses) bludger control. team = the team that NOW has control.
  sub_in / sub_out– a player enters/leaves the pitch. Use subPlayerJersey for the entering player on sub_in.
  flag_released   – seekers released / flag runner enters.
  flag_catch      – a seeker catches the flag. team = catching team.
  card / foul     – referee issues a card (cardColor: blue|yellow|red) or calls a foul.
  gameStart / gamePause / gameEnd – whistle starts play / stoppage / final whistle.

TEAM ASSIGNMENT:
- "home" and "away" are defined by jersey colour in the roster context provided in the user message. Use it.
- For neutral clock events with no team, use team:"neutral".

PLAYER IDENTIFICATION:
- Read jersey numbers off the frames. Put the NUMBER (as a string) in playerJersey.
- Use the roster context (number -> name) only to sanity-check; always report the number you actually see.
- If you cannot read a number, omit playerJersey rather than guessing.

OUTPUT RULES:
- Only log events you can actually see happening within this window's timestamps.
- Be conservative: it is better to miss a borderline event than to invent one. Do NOT hallucinate.
- One event per distinct action. Use the timestamp of the frame where the action completes.
- Respond by calling the record_events tool exactly once.`;

const TOOL = {
  name: 'record_events',
  description: 'Record the chronological quadball events observed in this window of frames.',
  input_schema: {
    type: 'object',
    properties: {
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            videoTime: { type: 'integer', description: 'Absolute video timestamp (seconds) of the frame where the action completes.' },
            type: { type: 'string', enum: ['goal','assist','shot','turnover','control_change','sub_in','sub_out','flag_released','flag_catch','card','foul','gameStart','gamePause','gameEnd'] },
            team: { type: 'string', enum: ['home','away','neutral'] },
            playerJersey: { type: 'string', description: 'Jersey number of the primary player, as seen on the frame.' },
            assistedByPlayerJersey: { type: 'string' },
            subPlayerJersey: { type: 'string', description: 'Jersey of the entering player (sub_in only).' },
            position: { type: 'string', enum: ['chaser','keeper','beater','seeker'] },
            cardColor: { type: 'string', enum: ['blue','yellow','red'] },
            description: { type: 'string', description: 'One concise sentence describing what happened.' },
          },
          required: ['videoTime', 'type', 'team', 'description'],
        },
      },
    },
    required: ['events'],
  },
};

/** Only the older models reliably accept `temperature`; the 4.8/5 generation deprecates it.
 *  (A runtime fallback also strips it if the API rejects it, so this is just an optimization.) */
function supportsTemperature(model) {
  return /haiku-4-5|sonnet-4-6/i.test(String(model));
}

/** Create a message, auto-stripping params the model reports as deprecated/unsupported. */
async function createResilient(client, params) {
  let p = { ...params };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await client.messages.create(p);
    } catch (e) {
      const msg = (e?.error?.error?.message || e?.message || '').toLowerCase();
      const offending = ['temperature', 'top_p', 'top_k'].find(
        (k) => k in p && msg.includes(k) && /deprecat|not compatible|unsupported|not support/.test(msg)
      );
      if (!offending) throw e;
      delete p[offending];
    }
  }
  return await client.messages.create(p);
}

function rosterBlurb(ctx) {
  const fmt = (label, r) => {
    if (!r || !r.players?.length) return `${label}: (no roster loaded — report jersey numbers only)`;
    const list = r.players.map((p) => `#${p.number || '?'}=${p.name}`).join(', ');
    return `${label} = ${r.teamName || r.teamId}: ${list}`;
  };
  return `ROSTER CONTEXT (use jersey colours in the frames to decide which team is home vs away):
${fmt('HOME', ctx.home)}
${fmt('AWAY', ctx.away)}`;
}

function imageBlock(file) {
  const b64 = fs.readFileSync(file).toString('base64');
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } };
}

/**
 * Analyze one batch of frames.
 * @param {object} client  Anthropic client
 * @param {Array<{t:number,file:string}>} frames
 * @param {object} ctx  roster context { home, away }
 * @returns {Array} raw events
 */
export async function analyzeBatch(client, frames, ctx, { model, start, end }) {
  const content = [];
  content.push({ type: 'text', text:
    `${rosterBlurb(ctx)}\n\nThis window covers ${start}s to ${end}s of the video. ` +
    `Below are ${frames.length} frames in chronological order, each preceded by its timestamp. ` +
    `Record every clear quadball event you can see, then call record_events.` });
  for (const fr of frames) {
    content.push({ type: 'text', text: `--- t=${fr.t}s ---` });
    content.push(imageBlock(fr.file));
  }

  const params = {
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    // Note: reasoning models (e.g. Fable/Mythos) reject *forced* tool_choice, so we let the
    // model choose. The prompt instructs it to call record_events; a text-JSON fallback below
    // covers the rare case where it returns the events as text instead.
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content }],
  };
  // temperature is deprecated on the current model generation; send it only where supported,
  // and createResilient() will strip it automatically if the API still objects.
  if (supportsTemperature(model)) params.temperature = 0;

  const resp = await createResilient(client, params);

  let events = [];
  const toolUse = resp.content.find((c) => c.type === 'tool_use' && c.name === 'record_events');
  if (toolUse) {
    events = toolUse.input?.events || [];
  } else {
    events = extractEventsFromText(resp.content);
  }
  // clamp to window so overlaps don't double-log
  return events.filter((e) => e && typeof e.videoTime === 'number' && e.videoTime >= start && e.videoTime < end);
}

/** Fallback: pull an events[] array out of any text the model returned. */
function extractEventsFromText(contentBlocks) {
  const text = (contentBlocks || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
  if (!text) return [];

  // Try fenced JSON first, then the largest {...} containing "events".
  const candidates = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) candidates.push(fence[1]);
  const objMatch = text.match(/\{[\s\S]*"events"[\s\S]*\}/);
  if (objMatch) candidates.push(objMatch[0]);

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (Array.isArray(parsed?.events)) return parsed.events;
      if (Array.isArray(parsed)) return parsed;
    } catch { /* try next */ }
  }
  return [];
}

export function makeClient(apiKey) {
  return new Anthropic({ apiKey });
}
