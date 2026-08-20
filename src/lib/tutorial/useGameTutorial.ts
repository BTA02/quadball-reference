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
} from './storage';

/** The app state the host component feeds in. Does not need to be memoized. */
export type TutorialAppState = Omit<TutorialContext, 'isMobile'>;

interface UseGameTutorialArgs {
  /** Firebase uid, or null when signed out (the tutorial never runs signed out). */
  uid: string | null;
  /** True when the tracker is open on a game, i.e. the tour's targets exist. */
  ready: boolean;
  /** Current app state the steps can read and drive. */
  app: TutorialAppState;
}

/** Let the player, panels and rosters settle before spotlighting anything. */
const AUTO_START_DELAY_MS = 900;

const MOBILE_QUERY = '(max-width: 1023px)'; // Tailwind's `lg` breakpoint

/**
 * Owns the tutorial's run state and its "already seen" persistence.
 *
 * Auto-starts once per session the first time a signed-in user opens a game,
 * and exposes `replay()` for the Help page.
 */
export function useGameTutorial({ uid, ready, app }: UseGameTutorialArgs) {
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
      get isExpandedLayout() {
        return appRef.current.isExpandedLayout;
      },
      get role() {
        return appRef.current.role;
      },
      get canRecord() {
        return appRef.current.canRecord;
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

  // Leaving the tracker ends the run — the tour's targets are gone.
  useEffect(() => {
    if (!ready) setRun(false);
  }, [ready]);

  const autoStartedRef = useRef(false);

  useEffect(() => {
    if (!ready || !uid || autoStartedRef.current) return;

    const shouldStart = isTourForced() || isTourPending(uid) || !hasSeenTour(uid);
    if (!shouldStart) return;

    const timer = window.setTimeout(() => {
      autoStartedRef.current = true;
      clearTourPending(uid);
      setRun(true);
    }, AUTO_START_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [ready, uid]);

  const finish = useCallback(() => {
    setRun(false);
    if (uid) markTourSeen(uid);
  }, [uid]);

  /**
   * Clear the "seen" flag and run the tutorial again.
   *
   * Returns `'started'` if it began immediately, or `'pending'` if no game is
   * open — in that case it starts on the next game the user opens.
   */
  const replay = useCallback((): 'started' | 'pending' => {
    if (!uid) return 'pending';
    clearTourSeen(uid);
    autoStartedRef.current = false;

    if (ready) {
      clearTourPending(uid);
      start();
      return 'started';
    }

    setTourPending(uid);
    return 'pending';
  }, [uid, ready, start]);

  return {
    /** Spread onto <GameTutorial />. */
    tourProps: { run, ctx, onFinish: finish, onSkip: finish },
    isRunning: run,
    start,
    replay,
  };
}
