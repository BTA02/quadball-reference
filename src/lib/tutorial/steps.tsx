import type { TutorialStep } from './types';

/**
 * ============================================================================
 *  THE TUTORIAL SCRIPT
 * ============================================================================
 *
 * This is the only file you need to touch to change the tutorial. Steps run
 * top to bottom; reorder by moving entries, remove one by deleting it.
 *
 * Every step needs four things:
 *
 *   id      a stable name, for your own reference (never reused)
 *   target  a CSS selector for the element to spotlight
 *   title   the card heading
 *   body    the card copy — JSX, so <strong>, <ul>, multiple <p>s all work
 *
 * Optional extras: `placement`, `before`, `enabled`, `showOn`,
 * `spotlightPadding`, `allowTargetInteraction`, `skipScroll`.
 * See `types.ts` for what each one does.
 *
 * ----------------------------------------------------------------------------
 *  AVAILABLE TARGETS
 * ----------------------------------------------------------------------------
 * These `data-tour` attributes are already placed in the tracker UI. To add a
 * new one, put `data-tour="my-thing"` on the element in App.tsx.
 *
 *   [data-tour="video-player"]     the YouTube embed
 *   [data-tour="scrub-controls"]   rewind / play / forward buttons
 *   [data-tour="scoreboard"]       live score + team names
 *   [data-tour="cinema-toggle"]    Cinema Mode button
 *   [data-tour="panel-tabs"]       the whole right-panel tab bar
 *   [data-tour="tab-events"]       Events tab button
 *   [data-tour="tab-record"]       Record tab button (authors only)
 *   [data-tour="tab-players"]      Players tab button
 *   [data-tour="tab-momentum"]     Momentum tab button
 *   [data-tour="events-feed"]      the Events panel body
 *   [data-tour="record-panel"]     the Record panel body
 *   [data-tour="event-grid"]       every event button, as one block
 *   [data-tour="record-actions"]   Chaser Actions row
 *   [data-tour="record-clock"]     Game Clock row
 *   [data-tour="record-control"]   Home/Away Control buttons
 *   [data-tour="record-pins"]      Drop Pin buttons
 *   [data-tour="record-subs"]      Substitutions IN/OUT buttons
 *   [data-tour="draft-queue"]      Pending Events Queue
 *   [data-tour="rosters-panel"]    the Players panel body
 *   [data-tour="momentum-panel"]   the Momentum panel body
 *   [data-tour="switch-video"]     Switch Video button
 *
 * Use `target: 'body'` with `placement: 'center'` for a card with no anchor.
 *
 * ----------------------------------------------------------------------------
 *  NOTE ON PLACEHOLDER COPY
 * ----------------------------------------------------------------------------
 * The wording below is scaffolding so the flow can be walked end to end.
 * Replace it.
 */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    target: 'body',
    placement: 'center',
    title: 'Welcome to the game tracker',
    // Cinema Mode hides the video and the tab bar, so start from the normal layout.
    before: ctx => ctx.setIsExpandedLayout(false),
    body: (
      <>
        <p>
          This is where games get watched and stats get recorded. The next minute walks through
          the pieces.
        </p>
        <p className="text-gray-500">
          Use <strong>Next</strong> and <strong>Back</strong>, or the arrow keys. You can leave at
          any time and replay it later from the Help page.
        </p>
      </>
    ),
  },
  {
    id: 'video-player',
    target: '[data-tour="video-player"]',
    placement: 'right',
    showOn: 'desktop',
    title: 'The game video',
    body: (
      <p>
        Every stat is tied to a timestamp in this video, which is what makes the numbers line up
        across everyone who contributes to the same game.
      </p>
    ),
  },
  {
    id: 'scrub-controls',
    target: '[data-tour="scrub-controls"]',
    placement: 'top',
    title: 'Jump around the tape',
    body: (
      <p>
        Skip back 5 or 15 seconds to re-watch a play before logging it. Accuracy matters more than
        speed — a correctly timestamped event is worth more than three rushed ones.
      </p>
    ),
  },
  {
    id: 'scoreboard',
    target: '[data-tour="scoreboard"]',
    placement: 'top',
    title: 'Live score',
    body: (
      <p>
        The score updates from the events recorded so far, not from a scoreboard in the video. If
        it drifts from what you see on screen, an event is missing or mistimed.
      </p>
    ),
  },
  {
    id: 'panel-tabs',
    target: '[data-tour="panel-tabs"]',
    placement: 'bottom',
    title: 'Four ways to look at the game',
    body: (
      <p>
        <strong>Events</strong> is the running log, <strong>Record</strong> is where you add to it,
        <strong> Players</strong> shows who's on the pitch, and <strong>Momentum</strong> charts
        how the game swung.
      </p>
    ),
  },
  {
    id: 'events-feed',
    target: '[data-tour="events-feed"]',
    placement: 'left',
    before: ctx => ctx.setRightPanelTab('live_events'),
    title: 'The event log',
    body: (
      <p>
        Everything anyone has recorded for this game, in order. Events here are public — you can
        vote on ones that look wrong.
      </p>
    ),
  },
  {
    id: 'record-tab',
    target: '[data-tour="tab-record"]',
    placement: 'bottom',
    enabled: ctx => ctx.canRecord,
    title: 'Recording is yours',
    body: (
      <p>
        Because you're signed in, you get the <strong>Record</strong> tab. Anything you add becomes
        part of the public record once it's verified by votes.
      </p>
    ),
  },
  {
    id: 'event-grid',
    target: '[data-tour="event-grid"]',
    placement: 'left',
    enabled: ctx => ctx.canRecord,
    before: ctx => ctx.setRightPanelTab('record'),
    title: 'Log what just happened',
    body: (
      <p>
        Click an action and it's stamped at the current video time. Goals, shots, misses and
        turnovers go in the top row; the clock events below mark the start, stops and end of play.
      </p>
    ),
  },
  {
    id: 'record-control',
    target: '[data-tour="record-control"]',
    placement: 'left',
    enabled: ctx => ctx.canRecord,
    before: ctx => ctx.setRightPanelTab('record'),
    title: 'Dodgeball control',
    body: (
      <p>
        Mark which side holds control as it changes hands. No player is attached to it — control is
        a team state, and it drives most of the beater and contextual stats.
      </p>
    ),
  },
  {
    id: 'record-pins',
    target: '[data-tour="record-pins"]',
    placement: 'left',
    enabled: ctx => ctx.canRecord,
    before: ctx => ctx.setRightPanelTab('record'),
    title: 'Pins for later',
    body: (
      <p>
        Not sure what you just saw? Drop a pin and move on. Pins mark a timestamp to come back to
        without interrupting your flow.
      </p>
    ),
  },
  {
    id: 'record-subs',
    target: '[data-tour="record-subs"]',
    placement: 'left',
    enabled: ctx => ctx.canRecord,
    before: ctx => ctx.setRightPanelTab('record'),
    title: 'Subbing players on and off',
    body: (
      <>
        <p>
          Each team gets its own pair. <strong>IN</strong> puts a player on the pitch,{' '}
          <strong>OUT</strong> takes one off — both stamped at the current video time.
        </p>
        <p>
          An <strong>IN</strong> card asks for the position they're taking, so their time on pitch
          lands in the right column. An <strong>OUT</strong> card has an optional{' '}
          <strong>Sub In…</strong> picker: name the replacement there and the swap is recorded in
          one action instead of two.
        </p>
      </>
    ),
  },
  {
    id: 'record-subs-chain',
    target: '[data-tour="record-subs"]',
    placement: 'left',
    enabled: ctx => ctx.canRecord,
    before: ctx => ctx.setRightPanelTab('record'),
    title: 'Run a whole line change at once',
    body: (
      <>
        <p>
          On a sub card, <strong>Save</strong> files it and closes the card.{' '}
          <strong>+ Next</strong> files it and immediately reopens the same card — same team, same
          type, <em>same timestamp</em> — with the player cleared. Tap through your line without
          touching the video.
        </p>
        <p>
          <strong>One timestamp for the whole group is the right call.</strong> A line change
          happens in a cluster, and being a few seconds off on any individual player doesn't move
          the stats. Don't rewind to time each one separately — it costs you a lot and buys
          nothing.
        </p>
      </>
    ),
  },
  {
    id: 'draft-queue',
    target: '[data-tour="draft-queue"]',
    placement: 'left',
    enabled: ctx => ctx.canRecord,
    before: ctx => ctx.setRightPanelTab('record'),
    title: 'Nothing is saved yet',
    body: (
      <p>
        New events land here first so you can attach the right player and nudge the timestamp a
        second either way before they go live.
      </p>
    ),
  },
  {
    id: 'rosters-panel',
    target: '[data-tour="rosters-panel"]',
    placement: 'left',
    before: ctx => ctx.setRightPanelTab('rosters'),
    title: 'Who is on the pitch',
    body: (
      <p>
        Sub players in before the first whistle and the rest follows. Authors can also click a name
        here to record an event for that player directly, or drag one player onto another to
        substitute.
      </p>
    ),
  },
  {
    id: 'cinema-toggle',
    target: '[data-tour="cinema-toggle"]',
    placement: 'bottom',
    showOn: 'desktop',
    title: 'Cinema Mode',
    body: (
      <p>
        Hides the video and puts all four panels side by side. Useful once you know your way
        around and want everything visible at once.
      </p>
    ),
  },
  {
    id: 'finish',
    target: 'body',
    placement: 'center',
    title: "That's the tour",
    body: (
      <>
        <p>
          Add as much or as little as you like — partial data is fine, wrong data isn't. Every
          event you add is checked by other authors.
        </p>
        <p className="text-gray-500">
          Full write-ups and the stat glossary live under <strong>Help</strong>, along with a button
          to replay this tutorial.
        </p>
      </>
    ),
  },
];
