import { useMemo } from 'react';
import { Joyride, EVENTS, STATUS, type Step } from 'react-joyride';
import type { TutorialContext, TutorialStep } from '../../lib/tutorial/types';
import TutorialTooltip from './TutorialTooltip';

interface GameTutorialProps {
  /** Whether the tour is currently playing. */
  run: boolean;
  /** The authored steps, in order. */
  steps: TutorialStep[];
  /** App state the steps are allowed to read and drive. */
  ctx: TutorialContext;
  /** Reached the last step and pressed Done. */
  onFinish: () => void;
  /** Skipped, closed, or pressed Escape. */
  onSkip: () => void;
}

/** Give React two frames to commit a `before()` state change before measuring. */
const nextFrame = () =>
  new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

/**
 * Engine wrapper around react-joyride. Nothing in here is tutorial content —
 * steps live in `src/lib/tutorial/steps.tsx`.
 */
export default function GameTutorial({ run, steps, ctx, onFinish, onSkip }: GameTutorialProps) {
  // Drop steps that don't apply to this user or form factor. Filtering here
  // (rather than skipping at runtime) keeps the "step 3 of N" counter honest.
  const joyrideSteps = useMemo<Step[]>(() => {
    return steps
      .filter(step => {
        if (step.showOn === 'desktop' && ctx.isMobile) return false;
        if (step.showOn === 'mobile' && !ctx.isMobile) return false;
        return step.enabled ? step.enabled(ctx) : true;
      })
      .map(step => ({
        target: step.target,
        title: step.title,
        content: step.body,
        placement: step.placement ?? 'auto',
        spotlightPadding: step.spotlightPadding ?? 10,
        blockTargetInteraction: !step.allowTargetInteraction,
        skipScroll: step.skipScroll ?? false,
        data: { id: step.id },
        before: step.before
          ? async () => {
              step.before!(ctx);
              await nextFrame();
            }
          : undefined,
      }));
  }, [steps, ctx]);

  if (joyrideSteps.length === 0) return null;

  return (
    <Joyride
      continuous
      run={run}
      steps={joyrideSteps}
      scrollToFirstStep
      tooltipComponent={TutorialTooltip}
      floatingOptions={{
        // The tooltip is portalled to <body>. With the default `absolute`
        // strategy a card placed past the right edge widens the document,
        // which hides the overflow from flip/shift and lets it sit off-screen.
        strategy: 'fixed',
        // Targets here are often near-viewport-sized (the video, a whole
        // panel), so every side placement overflows and flip has nothing
        // better to pick. crossAxis shifting pulls the card back on-screen.
        shiftOptions: { crossAxis: true, padding: 12 },
      }}
      onEvent={data => {
        if (data.type === EVENTS.TOUR_END) {
          if (data.status === STATUS.SKIPPED) onSkip();
          else onFinish();
        }
      }}
      options={{
        buttons: ['back', 'close', 'primary', 'skip'],
        // The X and Escape both end the tour rather than advancing a step.
        closeButtonAction: 'skip',
        dismissKeyAction: false, // handled in TutorialTooltip so Escape skips
        overlayClickAction: false,
        skipBeacon: true,
        // Clears the command palette (z-[100]) and the sticky header (z-50).
        zIndex: 300,
        overlayColor: 'rgba(2, 6, 23, 0.55)',
        primaryColor: '#dc2626',
        spotlightRadius: 12,
        // Panels inside the tracker mount lazily; give targets room to appear.
        targetWaitTimeout: 2500,
        scrollOffset: 80,
      }}
      styles={{
        spotlight: { fill: 'rgba(255,255,255,0.06)' },
        // The library fades the card in over 0.3s. That transition can stall
        // at opacity 0 when a step's portal is torn down and rebuilt in the
        // same frame (a skipped step, or a `before` hook that re-renders the
        // tracker), leaving an invisible tooltip. Show it outright instead.
        floater: { transition: 'none' },
      }}
    />
  );
}
