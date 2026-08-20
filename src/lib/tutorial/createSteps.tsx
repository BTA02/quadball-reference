import type { TutorialStep } from './types';

/**
 * ============================================================================
 *  THE CREATE (MODERATOR) TUTORIAL SCRIPT
 * ============================================================================
 *
 * Runs the first time a moderator opens the Create tab. Same rules as the game
 * tracker script in `trackerSteps.tsx` — see `types.ts` for the full step
 * contract.
 *
 * ----------------------------------------------------------------------------
 *  AVAILABLE TARGETS
 * ----------------------------------------------------------------------------
 *   [data-tour="create-tabs"]          the rosters/teams/players/games tab bar
 *   [data-tour="create-roster-select"] Select / Create Roster panel
 *   [data-tour="create-roster-list"]   Existing Rosters list + search
 *   [data-tour="create-quick-add"]     Quick Add Player box (needs a roster picked)
 *   [data-tour="create-team-list"]     Existing Teams list + search
 *   [data-tour="create-team-form"]     Create New Team form
 *   [data-tour="create-player-list"]   Existing Players list + search
 *   [data-tour="create-player-form"]   Add New Player form
 *   [data-tour="create-game-form"]     Add New Game form
 *
 * Use `target: 'body'` with `placement: 'center'` for a card with no anchor.
 *
 * ----------------------------------------------------------------------------
 *  NOTE ON PLACEHOLDER COPY
 * ----------------------------------------------------------------------------
 * The wording below is scaffolding so the flow can be walked end to end.
 * Replace it.
 */
export const CREATE_STEPS: TutorialStep[] = [
  {
    id: 'create-welcome',
    target: 'body',
    placement: 'center',
    title: 'Welcome to the moderator tools',
    body: (
      <>
        <p>
          The Create tab is where the things everyone else picks from get made — teams, players,
          rosters and games. Authors can only choose from what exists here.
        </p>
        <p className="text-gray-500">
          Because this is shared scaffolding, a mistake here shows up in every game that uses it.
          Worth a minute to see how the pieces fit.
        </p>
      </>
    ),
  },
  {
    id: 'create-tabs',
    target: '[data-tour="create-tabs"]',
    placement: 'bottom',
    title: 'Four things you can make',
    body: (
      <>
        <p>
          They're listed in the order you'll usually need them: a <strong>team</strong> exists
          first, <strong>players</strong> exist independently of any team, a{' '}
          <strong>roster</strong> ties players to a team for one season, and a{' '}
          <strong>game</strong> attaches a video to two teams.
        </p>
        <p className="text-gray-500">
          Rosters is the tab you'll live in — the other three are mostly one-offs.
        </p>
      </>
    ),
  },
  {
    id: 'create-team-list',
    target: '[data-tour="create-team-list"]',
    placement: 'right',
    before: ctx => ctx.setCreateTab('teams'),
    title: 'Check whether the team already exists',
    body: (
      <p>
        Every team on the site, searchable by name, league or division. Start here rather than at
        the form — a duplicate team splits one club's history across two records, and merging them
        back together afterwards is a chore.
      </p>
    ),
  },
  {
    id: 'create-team-form',
    target: '[data-tour="create-team-form"]',
    placement: 'left',
    before: ctx => ctx.setCreateTab('teams'),
    title: 'Adding one that is genuinely new',
    body: (
      <p>
        Name, league and division. What you type here is what every author picks from forever
        after, so spell it the way the league does.
      </p>
    ),
  },
  {
    id: 'create-player-list',
    target: '[data-tour="create-player-list"]',
    placement: 'right',
    before: ctx => ctx.setCreateTab('players'),
    title: 'Search before you create',
    body: (
      <p>
        Every player already known to the site, searchable. A player exists once globally and gets
        attached to rosters season by season, so look here first — the same person appearing twice
        is the most common mess to clean up.
      </p>
    ),
  },
  {
    id: 'create-player-form',
    target: '[data-tour="create-player-form"]',
    placement: 'left',
    before: ctx => ctx.setCreateTab('players'),
    title: 'Adding someone new',
    body: (
      <p>
        Legal or roster name in the first two fields — that's what official rosters will match
        against. <strong>Preferred first name</strong> and <strong>nickname</strong> are optional
        and are what actually gets shown around the site, so put the name people know them by
        there rather than bending the legal name.
      </p>
    ),
  },
  {
    id: 'create-roster-select',
    target: '[data-tour="create-roster-select"]',
    placement: 'right',
    before: ctx => ctx.setCreateTab('rosters'),
    title: 'A roster is a team plus a season',
    body: (
      <p>
        Pick the team and the season and you're either opening the existing roster or starting a
        new one. Keeping them per-season is what lets someone's history follow them as they move
        between teams.
      </p>
    ),
  },
  {
    id: 'create-roster-list',
    target: '[data-tour="create-roster-list"]',
    placement: 'right',
    before: ctx => ctx.setCreateTab('rosters'),
    title: 'Or jump to one that exists',
    body: (
      <p>
        Every roster already built, searchable by team or season — so "outlaws", "college" and
        "2026" all narrow the list. Click one to open it for editing instead of rebuilding it from
        the pickers above.
      </p>
    ),
  },
  {
    id: 'create-quick-add',
    target: '[data-tour="create-quick-add"]',
    placement: 'left',
    before: ctx => ctx.setCreateTab('rosters'),
    title: 'Filling the roster',
    body: (
      <>
        <p>
          Start typing a name and matching players appear. Pick one, add their jersey number, and
          they're on the roster. If nobody matches, the dropdown offers{' '}
          <strong>Create new player</strong> so you don't have to leave for the Players tab.
        </p>
        <p className="text-gray-500">
          It's built for the keyboard — type, pick, number, enter, repeat.
        </p>
      </>
    ),
  },
  {
    id: 'create-game-form',
    target: '[data-tour="create-game-form"]',
    placement: 'right',
    before: ctx => ctx.setCreateTab('games'),
    title: 'Adding a game',
    body: (
      <p>
        Paste a YouTube URL and set the metadata. Once a game exists, any author can open it and
        start recording events — this is the step that unblocks everyone else.
      </p>
    ),
  },
  {
    id: 'create-finish',
    target: 'body',
    placement: 'center',
    title: "That's the tools",
    body: (
      <>
        <p>
          Rough order for a new event: create any missing teams, build each roster for the season,
          then add the games. After that it's authors' work.
        </p>
        <p className="text-gray-500">
          You can replay this any time from the <strong>Help</strong> page.
        </p>
      </>
    ),
  },
];
