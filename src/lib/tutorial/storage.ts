/**
 * Persistence for the game-tracker tutorial.
 *
 * The "seen" flag lives in localStorage keyed by Firebase uid, so a shared
 * browser doesn't silently skip the tutorial for a second author. Bump
 * TOUR_VERSION to re-show the tutorial to everyone after a tracker redesign.
 */

const TOUR_ID = 'game-tracker';
const TOUR_VERSION = 'v1';

const seenKey = (uid: string) => `qr_tour_seen:${TOUR_ID}:${TOUR_VERSION}:${uid}`;
const pendingKey = (uid: string) => `qr_tour_pending:${TOUR_ID}:${uid}`;

// Safari private mode throws on any storage access, so every call is guarded.
function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    /* storage unavailable — the tutorial just shows again next time */
  }
}

function safeRemove(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    /* no-op */
  }
}

export function hasSeenTour(uid: string): boolean {
  if (typeof window === 'undefined') return true;
  return safeGet(window.localStorage, seenKey(uid)) !== null;
}

export function markTourSeen(uid: string): void {
  if (typeof window === 'undefined') return;
  safeSet(window.localStorage, seenKey(uid), new Date().toISOString());
  clearTourPending(uid);
}

export function clearTourSeen(uid: string): void {
  if (typeof window === 'undefined') return;
  safeRemove(window.localStorage, seenKey(uid));
}

/**
 * "Replay" was pressed from the Help page while no game was open. The tour will
 * start on the next game the user opens. Session-scoped on purpose — a stale
 * request shouldn't survive a browser restart.
 */
export function setTourPending(uid: string): void {
  if (typeof window === 'undefined') return;
  safeSet(window.sessionStorage, pendingKey(uid), '1');
}

export function isTourPending(uid: string): boolean {
  if (typeof window === 'undefined') return false;
  return safeGet(window.sessionStorage, pendingKey(uid)) === '1';
}

export function clearTourPending(uid: string): void {
  if (typeof window === 'undefined') return;
  safeRemove(window.sessionStorage, pendingKey(uid));
}

/**
 * QA escape hatch: `?tour=1` anywhere in the URL forces the tutorial to run,
 * regardless of the stored flag. Checks the hash too, since routing is
 * hash-based (`/?tour=1#/tracker` and `/#/tracker?tour=1` both work).
 */
export function isTourForced(): boolean {
  if (typeof window === 'undefined') return false;
  const { search, hash } = window.location;
  return /[?&]tour=1(&|$)/.test(search) || /[?&]tour=1(&|$)/.test(hash);
}
