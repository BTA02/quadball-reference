import type { ReactNode } from 'react';

/**
 * Where a tooltip sits relative to its target.
 * `auto` lets the tour pick the side with the most room; `center` pins the card
 * to the middle of the screen (use it with `target: 'body'` for intro/outro cards).
 */
export type TutorialPlacement =
  | 'auto'
  | 'center'
  | 'top' | 'top-start' | 'top-end'
  | 'bottom' | 'bottom-start' | 'bottom-end'
  | 'left' | 'left-start' | 'left-end'
  | 'right' | 'right-start' | 'right-end';

/**
 * The slice of app state a step is allowed to read and drive.
 * Passed to every `before()` and `enabled()` hook.
 *
 * One shared shape covers every tour, so a step author only has one thing to
 * learn. Fields are grouped by the screen they belong to.
 */
export interface TutorialContext {
  // --- Game tracker ---
  /** Switch the tracker's right-hand panel before a step is shown. */
  setRightPanelTab: (tab: 'live_events' | 'record' | 'momentum' | 'rosters') => void;
  /** Ungroup every tab into its own view beside the video, or regroup them. */
  setIsExpandedLayout: (expanded: boolean) => void;
  /** True when every tab is currently ungrouped. */
  isExpandedLayout: boolean;
  /** True when the user can record events (i.e. the Record tab is rendered). */
  canRecord: boolean;

  // --- Create (moderator tools) ---
  /** Switch the Create screen's sub-tab before a step is shown. */
  setCreateTab: (tab: 'rosters' | 'teams' | 'players' | 'games' | 'activity') => void;
  /** True when the user can reach the Create tab (moderator or trusted). */
  canCreate: boolean;

  // --- Everywhere ---
  /** The signed-in user's effective role: voter | author | moderator | trusted. */
  role: string;
  /** True below the `lg` breakpoint, where layouts stack into one column. */
  isMobile: boolean;
}

/**
 * One step of the tutorial.
 *
 * Only `id`, `target`, `title` and `body` are required — everything else has a
 * sensible default. Steps run in array order; see `steps.tsx`.
 */
export interface TutorialStep {
  /** Stable identifier. Never reused, never renumbered — used for debugging. */
  id: string;

  /**
   * CSS selector for the element to spotlight, e.g. `[data-tour="record-tab"]`.
   * Use `'body'` together with `placement: 'center'` for a step with no anchor.
   */
  target: string;

  /** Heading shown at the top of the card. */
  title: string;

  /** Body copy. JSX is allowed — `<strong>`, `<ul>`, multiple `<p>`s, etc. */
  body: ReactNode;

  /** Tooltip position relative to the target. Defaults to `auto`. */
  placement?: TutorialPlacement;

  /**
   * Runs before the step is shown; the tour waits for it (and for the target to
   * appear) before measuring. Use it to put the app in the right state:
   *
   *   before: (ctx) => ctx.setRightPanelTab('record')
   */
  before?: (ctx: TutorialContext) => void;

  /**
   * Return false to drop the step from the run entirely. Use it for steps that
   * don't apply to everyone, e.g. `enabled: (ctx) => ctx.canRecord`.
   * Steps removed this way don't count toward the "3 of 11" progress.
   */
  enabled?: (ctx: TutorialContext) => boolean;

  /** Restrict the step to one form factor. Defaults to `all`. */
  showOn?: 'all' | 'desktop' | 'mobile';

  /** Breathing room around the spotlight cutout, in px. Defaults to 10. */
  spotlightPadding?: number;

  /**
   * Let the user actually click the highlighted element while the step is open.
   * Off by default so the tour can't be knocked out of sync.
   */
  allowTargetInteraction?: boolean;

  /** Don't scroll the target into view. Useful for targets that are always visible. */
  skipScroll?: boolean;
}
