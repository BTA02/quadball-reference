// firebaseClient.mjs
// Shared Firebase helpers for the Claude video-extraction pipeline.
//
// Uses the Firebase *client* SDK + firebase-applet-config.json, exactly like the
// existing repo write-scripts (fix_orphans.cjs, cleanup_turnover_players.cjs).
// Writes target gameEvents/{gameId}, whose Firestore rule is `allow update: if true`,
// so no interactive sign-in is required (the doc must already exist — it is created
// the first time you open the game/video in the app UI).
//
// If you prefer a service account (firebase-admin) instead, see AGENT_EXTRACTION_GUIDE.md.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, serverTimestamp
} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function loadConfig() {
  const cfgPath = path.join(REPO_ROOT, 'firebase-applet-config.json');
  if (!fs.existsSync(cfgPath)) {
    throw new Error(`firebase-applet-config.json not found at ${cfgPath}`);
  }
  return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
}

let _db = null;
export function getDb() {
  if (_db) return _db;
  const cfg = loadConfig();
  const app = initializeApp(cfg);
  // Named (non-default) Firestore database — matches src/lib/firebase.ts
  _db = cfg.firestoreDatabaseId
    ? getFirestore(app, cfg.firestoreDatabaseId)
    : getFirestore(app);
  return _db;
}

// ── Name / URL resolution (so the CLI only needs url + two team names) ───────

/** Extract the 11-char YouTube id from any common URL form. */
export function parseYoutubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:v=|\/embed\/|youtu\.be\/|\/shorts\/|\/v\/)([\w-]{11})/);
  if (m) return m[1];
  if (/^[\w-]{11}$/.test(url)) return url; // already an id
  return null;
}

function norm(s) { return String(s || '').trim().toLowerCase(); }

/**
 * Resolve a team name (or nickname) to its teamId. Case-insensitive, tolerant of
 * partial matches. Returns { teamId, name } or throws with the closest options.
 */
export async function resolveTeamByName(db, name) {
  const snap = await getDocs(collection(db, 'teams'));
  const teams = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const want = norm(name);

  let hit =
    teams.find((t) => norm(t.name) === want || norm(t.nickname) === want) ||
    teams.find((t) => norm(t.name).includes(want) || want.includes(norm(t.name)) ||
                      (t.nickname && (norm(t.nickname).includes(want) || want.includes(norm(t.nickname)))));

  if (!hit) {
    const sample = teams.map((t) => t.name).filter(Boolean).sort().slice(0, 25).join(', ');
    throw new Error(`No team matching "${name}". Known teams include: ${sample}${teams.length > 25 ? ', …' : ''}`);
  }
  return { teamId: hit.id, name: hit.name || hit.id };
}

/** Find an existing video doc by YouTube id. Returns the doc data + id, or null. */
export async function findVideoByYoutubeId(db, youtubeId) {
  const snap = await getDocs(query(collection(db, 'videos'), where('youtubeId', '==', youtubeId)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/** Find an existing game for this matchup + season. Returns {id,...} or null. */
export async function findGame(db, { homeTeamId, awayTeamId, seasonId }) {
  const snap = await getDocs(query(collection(db, 'games'), where('seasonId', '==', seasonId)));
  const g = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .find((x) =>
      (x.homeTeamId === homeTeamId && x.awayTeamId === awayTeamId) ||
      (x.homeTeamId === awayTeamId && x.awayTeamId === homeTeamId)); // tolerate swapped home/away
  return g || null;
}

/**
 * One-call resolver for the simple CLI: given a YouTube URL + two team names,
 * return everything downstream needs. Finds existing game/video; creates them
 * if missing (requires write access — see guide). `create:false` => never write.
 */
export async function resolveMatch(db, { url, homeName, awayName, seasonId, title, create = true }) {
  const youtubeId = parseYoutubeId(url);
  if (!youtubeId && url) console.warn(`[resolve] could not parse a YouTube id from "${url}"`);

  const home = await resolveTeamByName(db, homeName);
  const away = await resolveTeamByName(db, awayName);

  // Prefer an existing video (it already links to a game).
  let video = youtubeId ? await findVideoByYoutubeId(db, youtubeId) : null;
  let game = video?.gameId ? { id: video.gameId } : await findGame(db, { homeTeamId: home.teamId, awayTeamId: away.teamId, seasonId });

  let created = { game: false, video: false };

  if (!game) {
    const gameId = randomUUID();
    if (create) {
      await setDoc(doc(db, 'games', gameId), {
        id: gameId, seasonId, homeTeamId: home.teamId, awayTeamId: away.teamId,
        isVerified: false, createdAt: serverTimestamp(),
      });
      created.game = true;
    }
    game = { id: gameId, homeTeamId: home.teamId, awayTeamId: away.teamId, seasonId };
  } else if (!game.seasonId) {
    // We only have the game id (found via the video). Fetch the doc so we use its
    // authoritative seasonId + team assignment — the rosters are keyed to THIS season,
    // which may differ from VITE_CURRENT_SEASON_ID.
    const gd = await getDoc(doc(db, 'games', game.id));
    if (gd.exists()) game = { id: game.id, ...gd.data() };
  }

  // Authoritative season + team ids come from the existing game doc when present;
  // fall back to the name-resolved teams / passed season for brand-new games.
  const effectiveSeasonId = game.seasonId || seasonId;
  const homeTeamId = game.homeTeamId || home.teamId;
  const awayTeamId = game.awayTeamId || away.teamId;

  if (!video && youtubeId) {
    const videoId = randomUUID();
    if (create) {
      await setDoc(doc(db, 'videos', videoId), {
        videoId, youtubeId, gameId: game.id,
        title: title || `${home.name} vs ${away.name}`, createdAt: serverTimestamp(),
      });
      created.video = true;
    }
    video = { id: videoId, videoId, youtubeId, gameId: game.id };
  }

  return {
    youtubeId,
    seasonId: effectiveSeasonId,
    requestedSeasonId: seasonId,
    homeTeamId, homeName: home.name,
    awayTeamId, awayName: away.name,
    gameId: game.id,
    videoId: video?.id || null,
    created,
  };
}

// ── Roster / player loading ────────────────────────────────────────────────
// Modern schema (see firestore.rules):
//   rosters/{rosterId}            -> { teamId, seasonId, createdAt }
//   rosters/{rosterId}/players/*  -> { playerId, number, createdAt }
//   players/{playerId}            -> { firstName, lastName }
//   teams/{teamId}                -> { name, ... }

/**
 * Build a jersey→playerId map for one team in one season.
 * Returns { rosterId, teamId, teamName, players: [{ number, playerId, name }], byNumber: {num: {playerId,name}} }
 */
export async function loadTeamRoster(db, { teamId, seasonId }) {
  const rostersSnap = await getDocs(collection(db, 'rosters'));
  let rosterId = null;
  rostersSnap.forEach((d) => {
    const data = d.data();
    if (data.teamId === teamId && data.seasonId === seasonId) rosterId = d.id;
  });
  if (!rosterId) {
    return { rosterId: null, teamId, teamName: null, players: [], byNumber: {} };
  }

  const playersSnap = await getDocs(collection(db, 'rosters', rosterId, 'players'));
  const teamDoc = await getDoc(doc(db, 'teams', teamId));
  const teamName = teamDoc.exists() ? (teamDoc.data().name || null) : null;

  const players = [];
  const byNumber = {};
  for (const pdoc of playersSnap.docs) {
    const { playerId, number } = pdoc.data();
    let name = playerId;
    try {
      const pl = await getDoc(doc(db, 'players', playerId));
      if (pl.exists()) {
        const { firstName, lastName } = pl.data();
        name = [firstName, lastName].filter(Boolean).join(' ') || playerId;
      }
    } catch { /* keep id as name */ }
    const entry = { number: String(number ?? ''), playerId, name };
    players.push(entry);
    if (entry.number) byNumber[entry.number] = { playerId, name };
  }
  return { rosterId, teamId, teamName, players, byNumber };
}

/**
 * Load both teams' rosters for a game and return a combined context object
 * that is easy to feed to the model and to map jersey→playerId afterwards.
 */
export async function loadGameRosterContext(db, { gameId, seasonId }) {
  const gameDoc = await getDoc(doc(db, 'games', gameId));
  if (!gameDoc.exists()) throw new Error(`games/${gameId} does not exist`);
  const game = gameDoc.data();
  const season = seasonId || game.seasonId;

  const home = await loadTeamRoster(db, { teamId: game.homeTeamId, seasonId: season });
  const away = await loadTeamRoster(db, { teamId: game.awayTeamId, seasonId: season });
  return { game, seasonId: season, home, away };
}

// ── Event pushing ──────────────────────────────────────────────────────────

/**
 * Read the existing gameEvents/{gameId} doc (events array). Returns [] if missing.
 */
export async function getExistingEvents(db, gameId) {
  const snap = await getDoc(doc(db, 'gameEvents', gameId));
  if (!snap.exists()) return { exists: false, events: [] };
  return { exists: true, events: snap.data().events || [] };
}

/**
 * Push events into gameEvents/{gameId}. Merges with whatever is already there
 * and de-duplicates against existing AI-sourced events (by source tag + time + type).
 *
 * @param {boolean} opts.dryRun  if true, returns the merged array without writing
 */
export async function pushEvents(db, gameId, newEvents, opts = {}) {
  const { dryRun = false } = opts;
  const { exists, events: existing } = await getExistingEvents(db, gameId);

  // Dedupe: drop a new event if an existing event has same type+videoTime(±1s)+playerId.
  const keep = [];
  for (const ev of newEvents) {
    const dup = existing.some((e) =>
      e.type === ev.type &&
      Math.abs((e.videoTime ?? -999) - ev.videoTime) <= 1 &&
      (e.playerId ?? null) === (ev.playerId ?? null) &&
      (e.teamId ?? null) === (ev.teamId ?? null)
    );
    if (!dup) keep.push(ev);
  }

  const merged = [...existing, ...keep].sort((a, b) => (a.videoTime ?? 0) - (b.videoTime ?? 0));

  if (dryRun) {
    return { wrote: false, added: keep.length, skipped: newEvents.length - keep.length, total: merged.length, merged };
  }

  if (!exists) {
    // create needs auth; with open update we still try setDoc/merge first.
    await setDoc(doc(db, 'gameEvents', gameId), { events: merged }, { merge: true });
  } else {
    await updateDoc(doc(db, 'gameEvents', gameId), { events: merged });
  }
  return { wrote: true, added: keep.length, skipped: newEvents.length - keep.length, total: merged.length };
}
