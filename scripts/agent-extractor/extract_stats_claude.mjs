#!/usr/bin/env node
// extract_stats_claude.mjs
// ---------------------------------------------------------------------------
// Watch a YouTube quadball game with Claude (vision via sampled frames),
// produce a chronological event log mapped to your player IDs, and optionally
// push it straight into Firestore gameEvents/{gameId}.
//
// USAGE (the simple way — a video and two team names):
//   node scripts/agent-extractor/extract_stats_claude.mjs \
//     --url "https://youtu.be/VIDEO" --home "Austin Outlaws" --away "Chicago Prowl"
//
//   Team IDs, rosters, and the game/video records are resolved automatically from
//   your database. Events are pushed to Firestore by default (--no-push to skip,
//   --dry-run to preview). Season defaults to VITE_CURRENT_SEASON_ID.
//
// More control (all optional):
//   [--season SEASON_ID] [--fps 1] [--width 640] [--window 30]
//   [--model claude-fable-5] [--start 0] [--end 600] [--no-push] [--dry-run]
//   [--video PATH]  analyze a local file instead of --url
//   [--game ID] [--video-id ID]  target specific docs instead of resolving by name
//
// Requires ANTHROPIC_API_KEY in .env.local (or the environment).
// See AGENT_EXTRACTION_GUIDE.md for how to find the IDs and the full workflow.
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { downloadYoutube, probeDuration, extractFrames, makeTempDir, ffmpegAvailable, REPO_ROOT } from './video.mjs';
import { makeClient, analyzeBatch } from './claudeVision.mjs';
import { buildGameEvents, validateEvents } from './eventSchema.mjs';
import { getDb, resolveMatch, loadTeamRoster, pushEvents } from './firebaseClient.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Friendly model presets -> exact Anthropic API model strings.
// Pass --model <alias> (e.g. --model haiku) or a full model string.
const MODEL_ALIASES = {
  cheap:  'claude-haiku-4-5-20251001', // fastest + cheapest, great for dialing things in
  haiku:  'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',         // balanced
  opus:   'claude-opus-4-8',           // high quality
  fable:  'claude-fable-5',            // top quality (default)
};
function resolveModel(m) { return MODEL_ALIASES[String(m).toLowerCase()] || m; }

// ── load env (.env.local preferred) ─────────────────────────────────────────
const envLocal = path.join(REPO_ROOT, '.env.local');
if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal }); else dotenv.config();

function parseArgs() {
  const a = process.argv.slice(2);
  const o = {
    fps: 1, width: 640, window: 30, model: 'claude-fable-5',
    start: 0, end: null, push: true, dryRun: false,
    out: path.join(REPO_ROOT, 'ai_extracted_events_claude.json'),
  };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    const next = () => a[++i];
    if (k === '--url') o.url = next();
    else if (k === '--home') o.home = next();
    else if (k === '--away') o.away = next();
    else if (k === '--video') o.video = next();
    else if (k === '--season') o.seasonId = next();
    // optional power-user overrides (normally auto-resolved from team names):
    else if (k === '--game') o.gameId = next();
    else if (k === '--video-id') o.videoId = next();
    else if (k === '--fps') o.fps = parseFloat(next());
    else if (k === '--width') o.width = parseInt(next(), 10);
    else if (k === '--window') o.window = parseInt(next(), 10);
    else if (k === '--model') o.model = next();
    else if (k === '--cheap') o.model = 'cheap';
    else if (k === '--start') o.start = parseInt(next(), 10);
    else if (k === '--end') o.end = parseInt(next(), 10);
    else if (k === '--push') o.push = true;
    else if (k === '--no-push') o.push = false;
    else if (k === '--dry-run') { o.dryRun = true; o.push = false; }
    else if (k === '--out') o.out = path.resolve(next());
    else if (k === '--user') o.userName = next();
  }
  return o;
}

async function main() {
  const opts = parseArgs();
  const modelAlias = opts.model;
  opts.model = resolveModel(opts.model); // expand presets like "cheap"/"haiku" to full strings
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY is not set. Add it to .env.local:');
    console.error('  ANTHROPIC_API_KEY="sk-ant-..."');
    process.exit(1);
  }
  if (!opts.url && !opts.video) { console.error('ERROR: provide --url <youtube> (or --video <file>)'); process.exit(1); }

  // Preflight: ffmpeg is required to sample frames. Fail fast (before downloading) with guidance.
  if (!(await ffmpegAvailable())) {
    console.error('ERROR: ffmpeg was not found, so the video can\'t be split into frames.');
    console.error('  Install it:   brew install ffmpeg      (macOS, includes ffprobe)');
    console.error('  Then verify:  ffmpeg -version');
    console.error('  Already installed but not detected? Point the script at it directly:');
    console.error('    FFMPEG_PATH=/opt/homebrew/bin/ffmpeg FFPROBE_PATH=/opt/homebrew/bin/ffprobe npm run extract-stats-claude -- ...');
    process.exit(1);
  }
  const haveTeams = opts.home && opts.away;
  const haveOverrides = opts.gameId;
  if (!haveTeams && !haveOverrides) {
    console.error('ERROR: provide --home "Team A" --away "Team B" (or --game <id> to target a specific game).');
    process.exit(1);
  }

  const requestedSeason = opts.seasonId || process.env.VITE_CURRENT_SEASON_ID;
  const db = getDb();

  // 1) Resolve the match from team names (auto-find/create game + video) and load rosters.
  let ctx = { home: { players: [], byNumber: {}, teamName: null }, away: { players: [], byNumber: {}, teamName: null } };
  let homeTeamId = null, awayTeamId = null, gameId = opts.gameId, videoId = opts.videoId;
  let seasonId = requestedSeason; // may be overridden by the existing game doc's season

  if (haveTeams) {
    if (!requestedSeason) { console.error('ERROR: no season found. Pass --season <id> or set VITE_CURRENT_SEASON_ID in .env.local.'); process.exit(1); }
    try {
      const m = await resolveMatch(db, {
        url: opts.url, homeName: opts.home, awayName: opts.away, seasonId: requestedSeason,
        create: opts.push, // only write game/video docs if we intend to push
      });
      homeTeamId = m.homeTeamId; awayTeamId = m.awayTeamId;
      gameId = m.gameId; videoId = videoId || m.videoId;
      seasonId = m.seasonId; // authoritative season from the game doc (rosters are keyed to this)
      const seasonNote = m.seasonId !== m.requestedSeasonId
        ? `${m.seasonId} (from game; ignoring requested ${m.requestedSeasonId})`
        : m.seasonId;
      console.log(`[match] ${m.homeName} (home) vs ${m.awayName} (away) | season ${seasonNote}`);
      console.log(`[match] game=${gameId} video=${videoId || 'n/a'}` +
        (m.created.game ? ' (created game)' : '') + (m.created.video ? ' (created video)' : ''));
    } catch (e) {
      console.error(`[match] ${e.message}`);
      process.exit(1);
    }
  }

  // Load rosters for each team (jersey -> playerId), using the game's actual season.
  try {
    if (homeTeamId) ctx.home = await loadTeamRoster(db, { teamId: homeTeamId, seasonId });
    if (awayTeamId) ctx.away = await loadTeamRoster(db, { teamId: awayTeamId, seasonId });
    console.log(`[roster] HOME ${ctx.home.teamName || homeTeamId || '?'}: ${ctx.home.players.length} players | ` +
                `AWAY ${ctx.away.teamName || awayTeamId || '?'}: ${ctx.away.players.length} players`);
  } catch (e) {
    console.warn(`[roster] could not load rosters (${e.message}). Continuing with jersey numbers only.`);
  }

  // 2) Get the video file
  const tmp = makeTempDir();
  let videoPath = opts.video ? path.resolve(opts.video) : await downloadYoutube(opts.url, tmp);
  if (!fs.existsSync(videoPath)) { console.error('Video file not found:', videoPath); process.exit(1); }

  const duration = await probeDuration(videoPath);
  const start = opts.start;
  const end = opts.end ?? (duration > 0 ? duration : null);

  // Guard: without a usable end time the sweep would do nothing (the bug behind the empty first run).
  if (!end || end <= start) {
    console.error(`[video] Could not determine an end time (probed duration=${duration}s).`);
    console.error('        Pass an explicit slice, e.g. --start 0 --end 600, and re-run.');
    console.error('        (Tip: install ffprobe — `brew install ffmpeg` includes it — so duration is detected automatically.)');
    process.exit(1);
  }
  console.log(`[video] ${videoPath} | duration=${duration || '?'}s | analyzing ${start}-${end}s @ ${opts.fps}fps, ${opts.window}s windows`);
  console.log(`[model] ${opts.model}${modelAlias !== opts.model ? ` (alias "${modelAlias}")` : ''}`);

  // 3) Sweep windows, send frames to Claude
  const client = makeClient(apiKey);
  const rawEvents = [];
  for (let ws = start; ws < end; ws += opts.window) {
    const we = Math.min(ws + opts.window, end);
    let frames;
    try {
      frames = await extractFrames(videoPath, { start: ws, end: we, fps: opts.fps, width: opts.width, outDir: tmp });
    } catch (e) { console.warn(`  [frames ${ws}-${we}] ffmpeg failed: ${e.message}`); continue; }
    if (!frames.length) continue;
    process.stdout.write(`  [window ${ws}-${we}s] ${frames.length} frames -> Claude ... `);
    try {
      const evs = await analyzeBatch(client, frames, ctx, { model: opts.model, start: ws, end: we });
      rawEvents.push(...evs);
      console.log(`${evs.length} events`);
    } catch (e) {
      console.log(`FAILED (${e.message})`);
    }
  }

  // 4) Shape into GameEvents (+ jersey->playerId, synth assists)
  const shapeCtx = {
    videoId: videoId || 'unknown-video',
    gameId,
    userId: 'agent', userName: opts.userName || 'Claude Extractor',
    homeTeamId, awayTeamId,
    homeByNumber: ctx.home?.byNumber || {},
    awayByNumber: ctx.away?.byNumber || {},
  };
  const events = buildGameEvents(rawEvents, shapeCtx);
  const warnings = validateEvents(events);

  const output = {
    gameId,
    videoId: shapeCtx.videoId,
    model: opts.model,
    generatedAt: new Date().toISOString(),
    counts: countByType(events),
    warnings,
    events,
  };
  fs.writeFileSync(opts.out, JSON.stringify(output, null, 2));
  console.log(`\n[output] ${events.length} events -> ${opts.out}`);
  console.log('[counts]', JSON.stringify(output.counts));
  if (warnings.length) console.log(`[warnings] ${warnings.length} (see file). e.g. ${warnings.slice(0,3).join(' | ')}`);

  // 5) Optionally push to Firebase
  if (opts.push || opts.dryRun) {
    try {
      const res = await pushEvents(db, gameId, events, { dryRun: opts.dryRun });
      if (opts.dryRun) console.log(`[push:dry-run] would add ${res.added}, skip ${res.skipped} dupes, total ${res.total}`);
      else console.log(`[push] added ${res.added}, skipped ${res.skipped} dupes, gameEvents now has ${res.total} events`);
    } catch (e) {
      console.error(`[push] FAILED: ${e.message}`);
      console.error('       The gameEvents doc must already exist (open the game/video once in the app), or use a service account.');
    }
  }

  process.exit(0);
}

function countByType(events) {
  const c = {};
  for (const e of events) c[e.type] = (c[e.type] || 0) + 1;
  return c;
}

main().catch((e) => { console.error(e); process.exit(1); });
