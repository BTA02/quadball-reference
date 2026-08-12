# Claude Video → Quadball Stats Extractor

An agent pipeline that watches a YouTube quadball game with **Claude** (instead of Gemini),
records the statistical events, maps jersey numbers to your roster's player IDs, and pushes
them straight into Firestore (`gameEvents/{gameId}`).

> This is the "different model" version of `scripts/extract_stats_gemini.ts`. Gemini ingests
> the raw video natively; Claude's API takes **images**, so this pipeline samples frames with
> `ffmpeg` and sends time-windowed batches of frames to Claude. Everything downstream
> (roster mapping, schema, Firestore push) is shared and reusable.

---

## What it produces

For every window of the game, Claude emits events using your app's exact vocabulary —
`goal, assist, shot, turnover, control_change, sub_in, sub_out, flag_released, flag_catch,
card, foul, gameStart, gamePause, gameEnd`. Each event is shaped to match the `GameEvent`
object that `App.tsx` writes (`id, videoId, gameId, userId, userName, type, videoTime,
createdAt, votes, status, playerId, teamId, subPlayerId, relatedEventId, position, color`).
Goals carrying an assist automatically generate a linked `assist` event.

Events are marked `status: "unverified"` and tagged `source: "claude-video-extractor"`, so
they're easy to spot, review, and clean up. **Treat the output as a first draft to fix, not
ground truth** — jersey numbers and fast play are the hardest things to read off frames.

---

## Prerequisites (one time)

1. **Install the Anthropic SDK** (added to `package.json`):
   ```bash
   npm install
   ```
2. **Add your Anthropic API key** to `.env.local`:
   ```
   ANTHROPIC_API_KEY="sk-ant-..."
   ```
3. **yt-dlp** — the repo's `yt-dlp` binary works on macOS. On Linux/CI, `pip install yt-dlp`
   so it's on your PATH (the script falls back to PATH automatically).
4. **ffmpeg** must be installed (`ffmpeg -version`). On macOS: `brew install ffmpeg`.

---

## Running it — the simple way

Give it a video and two team names. That's it:

```bash
npm run extract-stats-claude -- \
  --url "https://youtu.be/VIDEO_ID" \
  --home "Austin Outlaws" --away "Chicago Prowl"
```

The script does the rest automatically:

- Matches **`--home`/`--away`** to your `teams` collection (case-insensitive, accepts nicknames
  and partial names; if it can't find a team it lists the closest ones).
- Picks the **season** from `VITE_CURRENT_SEASON_ID` (override with `--season`).
- **Finds the game and video** for this matchup/URL — or creates the `games` and `videos`
  records if they don't exist yet — so you never have to look up document IDs.
- Loads each team's **roster** (`rosters/{rosterId}/players`, `number` → `playerId`) to map
  jersey numbers to your players. No roster for that season? It still records the jersey numbers
  and leaves `playerId` null (raw jersey kept in `rawPlayerJersey`) for you to reconcile.
- **Pushes the events** into `gameEvents/{gameId}` by default.

Preview first without writing anything:

```bash
npm run extract-stats-claude -- \
  --url "https://youtu.be/VIDEO_ID" --home "Austin Outlaws" --away "Chicago Prowl" \
  --dry-run
```

Test on just the first 3 minutes, with sharper frames for jersey reading:

```bash
npm run extract-stats-claude -- \
  --url "https://youtu.be/VIDEO_ID" --home "Austin Outlaws" --away "Chicago Prowl" \
  --start 0 --end 180 --fps 2 --width 960
```

### Options

| Flag | Default | Meaning |
|---|---|---|
| `--url` | – | YouTube URL (or `--video PATH` for a local file) |
| `--home` / `--away` | – | team names — the only identifiers you need |
| `--season` | `VITE_CURRENT_SEASON_ID` | season used to pick rosters & the game |
| `--fps` | `1` | frames sampled per second (higher = more accurate, more cost) |
| `--width` | `640` | frame width in px (raise to read small jersey numbers) |
| `--window` | `30` | seconds of video per Claude call |
| `--model` | `claude-fable-5` | extraction model. Accepts a preset alias or a full model string (see below). |
| `--cheap` | – | shortcut for `--model cheap` (Haiku) — use this to dial settings in before a full run |
| `--start` / `--end` | `0` / full | analyze only a slice (great for testing) |
| `--no-push` | – | analyze + write the JSON file but don't touch Firestore |
| `--dry-run` | – | compute the merge and print what *would* change |
| `--out` | `ai_extracted_events_claude.json` | output file |
| `--game` / `--video-id` | auto | power-user override to target specific docs by ID |

### Model presets

Pass a short alias to `--model` (or a full Anthropic model string):

| Alias | Model | When to use |
|---|---|---|
| `cheap` / `haiku` | `claude-haiku-4-5-20251001` | cheapest & fastest — **dial in fps/width/teams on a short slice** |
| `sonnet` | `claude-sonnet-4-6` | balanced cost/quality for a full game |
| `opus` | `claude-opus-4-8` | high accuracy |
| `fable` | `claude-fable-5` | top accuracy (default) |

Recommended loop: run a 2–3 minute slice on `cheap` to confirm teams/jerseys read correctly and
tune `--fps`/`--width`, then run the full game on `sonnet` or `fable`.

```bash
# dial-in pass (cheap, short, no writes)
npm run extract-stats-claude -- --url "https://youtu.be/Kp-F1P3MQ3Q" --home "Austin Outlaws" --away "Chicago Prowl" --cheap --start 0 --end 180 --dry-run

# full run on a stronger model
npm run extract-stats-claude -- --url "https://youtu.be/Kp-F1P3MQ3Q" --home "Austin Outlaws" --away "Chicago Prowl" --model sonnet
```

> If you ever see `duration=0s` / `analyzing 0-0s` and zero events, your install is missing
> `ffprobe`. The script now falls back to `ffmpeg` automatically, but installing it cleanly
> (`brew install ffmpeg`) is best; in a pinch, pass an explicit `--start`/`--end`.

---

## How the Firestore push works (and auth)

The push uses the **Firebase client SDK** + `firebase-applet-config.json` — the same pattern as
your existing write-scripts (`fix_orphans.cjs`, `cleanup_turnover_players.cjs`). It targets
`gameEvents/{gameId}`, whose security rule is `allow update: if true`, so **no interactive
sign-in is required**.

⚠️ One caveat from your rules. *Updating* an existing `gameEvents` doc is open, but *creating*
new `games` / `videos` / `gameEvents` docs requires write access. So:

- **If the game already exists in your app** (the common case — you've opened the video before),
  everything works with no sign-in: the script finds the game/video and merges events in.
- **If the game is brand new**, the auto-create step (and the first push) needs write access.
  Easiest path: open that game/video once in the app to create the records, then re-run. Or, for
  fully hands-off creation, drop a `serviceAccount.json` in the repo and switch
  `firebaseClient.mjs` to `firebase-admin/firestore` (Firebase Admin bypasses rules) — your
  `migrate_author_teams.cjs` already shows that pattern. Use `--dry-run` anytime to preview
  without writing.

The push **de-duplicates**: a new event is skipped if an existing event has the same `type`,
`videoTime` (±1s), `playerId`, and `teamId`. So you can re-run a window safely.

---

## Recommended workflow ("get close, fix later")

1. **Dry-run a short slice** (`--start 0 --end 180 --dry-run`) to sanity-check team colors and
   jersey reading before spending tokens on the full game.
2. **Bump quality if numbers are unreadable**: `--fps 2 --width 960`.
3. **Push** the full game (`--push`). Events land as `unverified`.
4. **Review in the app** — the events carry a one-sentence `description` and the raw jersey
   numbers, so correcting a mis-mapped player or a missed goal is quick.
5. Re-run any window; dedupe prevents doubles.

## Accuracy notes

- Frame sampling will **miss very fast events** between frames; raise `--fps` for dense play.
- Jersey numbers are the #1 error source. Higher `--width` and `--fps` help; the broadcast
  scoreboard (score + clock + team tag) is also visible and helps Claude anchor team/score.
- The model is told to be **conservative and not hallucinate** — expect under-counting over
  fabrication. That's the right bias for "fix later".

## Files

| File | Role |
|---|---|
| `extract_stats_claude.mjs` | Orchestrator / CLI entry point |
| `video.mjs` | yt-dlp download + ffmpeg frame sampling |
| `claudeVision.mjs` | Claude prompt + `record_events` tool call per frame batch |
| `eventSchema.mjs` | Maps raw model events → app `GameEvent` shape, jersey→playerId, validation |
| `firebaseClient.mjs` | Loads rosters and pushes/merges events into `gameEvents/{gameId}` |
