# Releasing

Production is Firebase Hosting for `ai-studio-applet-webapp-742af`
(<https://ai-studio-applet-webapp-742af.web.app>). Nothing deploys on a schedule and
nothing deploys from a developer's laptop — every production build comes from a
GitHub Actions run against a tagged commit on `main`.

## The shape of it

| Workflow | Trigger | What it does |
| --- | --- | --- |
| **CI** | every PR, every push to `main` | typecheck + build |
| **Release** | manual, from `main` | bumps the version, tags it, publishes a GitHub Release, deploys the tag |
| **Deploy** | called by Release/Rollback, or manual | builds one git ref and puts it live |
| **Rollback** | manual | redeploys an earlier release tag |

Release and Rollback both funnel into the same **Deploy** workflow, so a rollback
is the identical operation to a release — just aimed at an older tag. There is no
separate, less-tested path out of a bad deploy.

## Cutting a release

1. Get your change onto `main` through a PR. CI has to be green.
2. **Actions → Release → Run workflow**, with the branch set to `main`.
3. Pick a bump:
   - `patch` — fixes and small changes (the default)
   - `minor` — new features
   - `major` — breaking changes
   Or type an exact `version` (e.g. `1.4.0`) to override the bump.
4. Leave **deploy** checked to go straight to production; uncheck it to tag now
   and deploy later (Actions → Deploy → Run workflow with the tag).

The run installs, typechecks and builds *before* it writes anything, so a broken
commit never gets a tag. Then it commits `chore(release): vX.Y.Z` with the version
bumped in `package.json` and `package-lock.json`, tags it, publishes a GitHub
Release whose notes are the commit subjects since the last tag, and deploys.

> If `main` is a protected branch, the `github-actions[bot]` actor needs permission
> to push to it, or the release job will fail at the version-bump commit.

## Rolling back

**Actions → Rollback → Run workflow.** Leave the version blank and it deploys the
release immediately before whatever is live now. That covers the common case:
something shipped, it's bad, put the previous one back.

To go further back, pass an explicit tag (`v1.3.0`). Rollback builds that tag from
source, so the result is reproducible from the lockfile rather than a stashed
artifact.

Rolling back does not delete the bad release or revert `main`. Fix forward on
`main` and cut a new release — the rollback is just breathing room.

### What's live right now?

Every successful deploy force-moves a `deployed-production` tag onto the deployed
commit, and records a deployment against the `production` GitHub Environment.

```sh
git fetch --tags --force
git log -1 deployed-production
```

The build also carries its own identity: `VITE_APP_VERSION` (the tag) and
`VITE_APP_COMMIT` (short SHA) are baked in at build time, so a rollback can be
confirmed from the shipped bundle rather than taken on trust.

## Release-time settings

Two things are decided at deploy time rather than in code:

- **`LEADERS_ONLY`** (repository variable, Settings → Secrets and variables →
  Actions → Variables). Set to `true` to ship the [Leaders Only](../src/lib/leadersOnly.ts)
  stats mode, anything else (or unset) to ship the full leaderboards. Deploy has a
  one-off `leaders_only` input for trying it on a single deploy without changing
  the variable; leave it blank and the variable wins.
- **`FIREBASE_SERVICE_ACCOUNT`** (repository secret). The Firebase Hosting deploy
  credentials. Deploy is the only workflow that reads it.

Changing the variable does not change what is live — a variable only takes effect
on the next build, so redeploy the current tag (Actions → Deploy, `ref` =
`deployed-production` or the live version tag) to apply it.

## The `production` environment

Deploy runs against the `production` GitHub Environment, which is where to add
required reviewers or a wait timer if deploys should need a second pair of eyes
(Settings → Environments → production). Production deploys serialise on a single
concurrency group, so two runs can never race each other onto the live channel.
