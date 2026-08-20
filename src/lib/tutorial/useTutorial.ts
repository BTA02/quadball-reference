import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TutorialContext } from './types';
import {
  clearTourPending,
  clearTourSeen,
  hasSeenTour,
  isTourForced,
  isTourPending,
  markTourSeen,
  setTourPending,
  type TourId,
} from './storage';

/** The app state the host component feeds in. Does not need to be memoized. */
export type TutorialAppState = Omit<TutorialContext, 'isMobile'>;

interface UseTutorialArgs {
  /** Which tour this instance drives. Each has its own "seen" flag. */
  tourId: TourId;
  /** Firebase uid, or null when signed out (tutorials never run signed out). */
  uid: string | null;
  /** True when the tour's screen is open, i.e. its targets exist. */
  ready: boolean;
  /** Current app state the steps can read and drive. */
  app: TutorialAppState;
}

/** Let the screen settle before spotlighting anything. */
const AUTO_START_DELAY_MS = 900;

const MOBILE_QUERY = '(max-width: 1023px)'; // Tailwind's `lg` breakpoint

/**
 * Owns one tour's run state and its "already seen" persistence.
 *
 * Auto-starts once per session the first time a signed-in user reaches the
 * tour's screen, and exposes `replay()` for the Info page.
 */
export function useTutorial({ tourId, uid, ready, app }: UseTutorialArgs) {
  const [run, setRun] = useState(false);

  // Everything the steps read goes through refs so `ctx` keeps a stable
  // identity for the lifetime of the hook while always returning fresh values.
  // An unstable ctx would rebuild the step array on every render.
  const appRef = useRef(app);
  appRef.current = app;

  const isMobileRef = useRef(
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      isMobileRef.current = e.matches;
    };
    isMobileRef.current = mql.matches;
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const ctx = useMemo<TutorialContext>(
    () => ({
      setRightPanelTab: tab => appRef.current.setRightPanelTab(tab),
      setIsExpandedLayout: expanded => appRef.current.setIsExpandedLayout(expanded),
      setCreateTab: tab => appRef.current.setCreateTab(tab),
      get isExpandedLayout() {
        return appRef.current.isExpandedLayout;
      },
      get role() {
        return appRef.current.role;
      },
      get canRecord() {
        return appRef.current.canRecord;
      },
      get canCreate() {
        return appRef.current.canCreate;
      },
      get isMobile() {
        return isMobileRef.current;
      },
    }),
    [],
  );

  /** Start (or restart) the tour. The false→true transition resets it to step 1. */
  const start = useCallback(() => {
    setRun(false);
    window.setTimeout(() => setRun(true), 0);
  }, []);

  // Leaving the screen ends the run — the tour's targets are gone.
  useEffect(() => {
    if (!ready) setRun(false);
  }, [ready]);

  const autoStartedRef = useRef(false);

  useEffect(() => {
    if (!ready || !uid || autoStartedRef.current) return;

    const shouldStart = isTourForced(tourId) || isTourPending(tourId, uid) || !hasSeenTour(tourId, uid);
    if (!shouldStart) return;

    const timer = window.setTimeout(() => {
      autoStartedRef.current = true;
      clearTourPending(tourId, uid);
      setRun(true);
    }, AUTO_START_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [tourId, ready, uid]);

  const finish = useCallback(() => {
    setRun(false);
    if (uid) markTourSeen(tourId, uid);
  }, [tourId, uid]);

  /**
   * Clear the "seen" flag and run the tutorial again.
   *
   * Returns `'started'` if it began immediately, or `'pending'` if the tour's
   * screen isn't open — in that case it starts as soon as the user gets there.
   */
  const replay = useCallback((): 'started' | 'pending' => {
    if (!uid) return 'pending';
    clearTourSeen(tourId, uid);
    autoStartedRef.current = false;

    if (ready) {
      clearTourPending(tourId, uid);
      start();
      return 'started';
    }

    setTourPending(tourId, uid);
    return 'pending';
  }, [tourId, uid, ready, start]);

  return {
    /** Spread onto <TutorialOverlay />. */
    tourProps: { run, ctx, onFinish: finish, onSkip: finish },
    isRunning: run,
    start,
    replay,
  };
}
