/**
 * Persistence for the guided tutorials.
 *
 * Each tour tracks its own "seen" flag in localStorage, keyed by Firebase uid
 * so a shared browser doesn't silently skip the tutorial for a second author.
 * Bump a tour's version below to re-show it to everyone after a redesign.
 */

export type TourId = 'game-tracker' | 'create-tools';

const TOUR_VERSIONS: Record<TourId, string> = {
  'game-tracker': 'v1',
  'create-tools': 'v1',
};

const seenKey = (tourId: TourId, uid: string) =>
  `qr_tour_seen:${tourId}:${TOUR_VERSIONS[tourId]}:${uid}`;
const pendingKey = (tourId: TourId, uid: string) => `qr_tour_pending:${tourId}:${uid}`;

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

export function hasSeenTour(tourId: TourId, uid: string): boolean {
  if (typeof window === 'undefined') return true;
  return safeGet(window.localStorage, seenKey(tourId, uid)) !== null;
}

export function markTourSeen(tourId: TourId, uid: string): void {
  if (typeof window === 'undefined') return;
  safeSet(window.localStorage, seenKey(tourId, uid), new Date().toISOString());
  clearTourPending(tourId, uid);
}

export function clearTourSeen(tourId: TourId, uid: string): void {
  if (typeof window === 'undefined') return;
  safeRemove(window.localStorage, seenKey(tourId, uid));
}

/**
 * "Replay" was pressed from the Info page while the tour's screen wasn't open.
 * The tour starts as soon as the user gets there. Session-scoped on purpose —
 * a stale request shouldn't survive a browser restart.
 */
export function setTourPending(tourId: TourId, uid: string): void {
  if (typeof window === 'undefined') return;
  safeSet(window.sessionStorage, pendingKey(tourId, uid), '1');
}

export function isTourPending(tourId: TourId, uid: string): boolean {
  if (typeof window === 'undefined') return false;
  return safeGet(window.sessionStorage, pendingKey(tourId, uid)) === '1';
}

export function clearTourPending(tourId: TourId, uid: string): void {
  if (typeof window === 'undefined') return;
  safeRemove(window.sessionStorage, pendingKey(tourId, uid));
}

/**
 * QA escape hatch. `?tour=1` forces whichever tour's screen you open;
 * `?tour=create-tools` forces just that one. Checks the hash too, since
 * routing is hash-based (`/?tour=1#/create` and `/#/create?tour=1` both work).
 */
export function isTourForced(tourId: TourId): boolean {
  if (typeof window === 'undefined') return false;
  const { search, hash } = window.location;
  const matches = (re: RegExp) => re.test(search) || re.test(hash);
  return matches(/[?&]tour=1(&|$)/) || matches(new RegExp(`[?&]tour=${tourId}(&|$)`));
}
