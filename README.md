<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Quadball Reference

A crowdsourced stats tracker for [quadball](https://en.wikipedia.org/wiki/Quadball):
tag events against game video, and the site turns them into box scores, player and
team profiles, and league leaderboards.

Live: <https://ai-studio-applet-webapp-742af.web.app>

## Run locally

**Prerequisites:** Node.js 20+

```sh
npm install
cp .env.example .env.local   # then fill in the values you need
npm run dev                  # http://localhost:3000
```

`GEMINI_API_KEY` is only needed for the stats-extraction scripts. See
[.env.example](.env.example) for the rest, including `VITE_LEADERS_ONLY`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 3000 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm run test:rules` | Firestore security rules against the emulator |
| `npm run test:migration` | Privacy migration against the emulator |

## Deploying

Releases are cut from `main` through GitHub Actions and deployed to Firebase
Hosting; rollbacks redeploy an earlier tag through the same path. See
**[docs/RELEASING.md](docs/RELEASING.md)**.

## Leaders Only

An optional, release-time mode that trims the public leaderboards to the top of
each column and locks sorting to best-first, so a casual league's stats page isn't
also a public list of who is worst. Off by default; turned on per-release with the
`LEADERS_ONLY` repository variable. Implementation and rationale live in
[`src/lib/leadersOnly.ts`](src/lib/leadersOnly.ts).

### Trying it out

`?leaders=on` on any URL (`http://localhost:3000/?leaders=on`) turns the mode on
for that page load, whatever the build shipped with and whatever your role — which
matters because moderators are otherwise exempt from it. It's the way to check the
public view on a deployed build too. The parameter only ever turns the mode *on*;
`?leaders=off` does nothing, on purpose, since a switch that could turn it off
would be a public bypass of the whole feature.

To exercise the real release path instead, put `VITE_LEADERS_ONLY=true` in
`.env.local` and restart the dev server — Vite reads env files only at startup —
then sign out, since a signed-in moderator is exempt.

The frosted panel only appears when players are actually being hidden: it needs
more than 10 ranked players in the current filter (10 is the floor on published
rows), and it sits at the foot of the **last** page. The Team tabs are never
trimmed, so check Quadball → Box Score rather than Quadball → Team.
