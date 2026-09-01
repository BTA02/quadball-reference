# Quadball Win Shares

An adaptation of Basketball-Reference's Win Shares to quadball. Implemented in
[`src/lib/winShares.ts`](../src/lib/winShares.ts), surfaced as the **Win Shares** tab on the
Stats page ([`src/components/WinSharesView.tsx`](../src/components/WinSharesView.tsx)).

The question Win Shares answers is: *how many of a team's wins is each player responsible
for?* Not how productive they were, not how good their rate stats look — how many wins. It
is a divide-up-the-pie metric, so its parts have to add back up to the whole.

---

## The basketball original

Basketball-Reference credits every player:

```
Win Shares = (marginal offense) / (marginal points per win)
           + (marginal defense) / (marginal points per win)
```

- **Marginal offense** = points produced − 0.92 × (league points per possession) × (offensive possessions used)
- **Marginal defense** = (player's share of team defensive minutes) × (team defensive possessions)
  × (1.08 × league points per possession − player's defensive rating)
- **Marginal points per win** = 0.32 × (league points per game) × (team pace ÷ league pace)

"Marginal" means *above replacement*: the 0.92/1.08 pair says a replacement-level player is
8% worse than league average on each side of the ball.

Two things have to change for quadball, and one thing has to be built from scratch.

---

## 1. Wins have to be inferred

Nothing in the data records a winner, so the scoreboard is reconstructed from the events: a
goal is **10 points**, a flag catch is **35**, higher final total wins. Ties are possible
(a game with no catch and level goals) and count a half-win each.

**Only pristine games count.** Both sides must be marked complete *with substitutions*
(`isFullyCompleteWithSubs` in [`gameCompletion.ts`](../src/lib/gameCompletion.ts)). This is
stricter than the Stats page's own Complete/With Partial toggle, and deliberately so:

- Both sides are needed because a win is a comparison — one side's points are meaningless
  without the other's.
- Substitutions are needed because every allocation below is minutes-weighted. Without subs
  the engine would hand a starter's whole credit to whoever the tracker last saw on pitch.

Games that fall short are counted and reported in the view's warning strip rather than
silently dropped.

---

## 2. Points per win, derived rather than borrowed

`0.32 × league points per game` is an NBA number. Quadball scores in 10-point chunks with a
35-point flag catch on top, and blowouts are routine — the constant does not transfer.

The idea underneath it does. If single-game margins are roughly normal with mean 0 and
standard deviation σ, a team whose true margin is *m* wins with probability Φ(*m*/σ). Near
.500 the slope of that is φ(0)/σ, so each point of margin is worth φ(0)/σ ≈ 0.3989/σ of a
win. Inverting:

```
marginal points per win = σ / 0.3989 = 2.507 × σ
```

σ is measured directly from the games in scope (the RMS of game margins — the mean is exactly
zero by symmetry, since every game is one team's +M and the other's −M).

This is not a quadball-specific hack. It reproduces the accepted values elsewhere:

| Sport | σ of game margin | σ / 0.3989 | Commonly cited points per win |
|-------|------------------|------------|-------------------------------|
| NBA   | ≈ 13.5           | ≈ 33.8     | ≈ 31–35                       |
| NFL   | ≈ 14             | ≈ 35.1     | ≈ 35                          |

As in the original, it is then pace-adjusted per team: `PPW_team = PPW × (team pace ÷ league pace)`.

---

## 3. Replacement level follows from it

The 0.32 and the 8% in the basketball model are not independent constants — one implies the
other. A replacement team is `r` worse than average on offense *and* defense, so it runs a
margin of −2·*r*·PPG per game. For Win Shares to total team wins, that team has to win about
zero games, i.e. sit 0.5 wins per game below .500:

```
2·r·PPG / PPW = 0.5     ⟹     PPW = 4·r·PPG
```

At *r* = 0.08 this is exactly the published `0.32 × PPG`. We run the identity in the other
direction — σ gives PPW, so:

```
r = PPW / (4 × league points per game)
```

clamped to [5%, 75%] against freak samples. A low-parity league lands on a much lower
replacement bar than the NBA's 8%, and that is the honest answer: where blowouts are routine,
a replacement-level side really is that far below average. (Running the same identity on the
NFL gives *r* ≈ 0.42, which correctly describes a team that would go winless.)

This is the step that makes team Win Shares land near team wins without anything being
normalised after the fact.

---

## 4. Splitting credit across four positions

Chasers and keepers have a box score. Beaters essentially do not — their whole job is bludger
control, which shows up in *other people's* numbers. Seekers touch the game once, for 35
points.

Rather than fix a weight per position, the team's marginal points are split **by points
category** and each category is then distributed inside its unit. This keeps the flag's real
weight in a given season flowing through the metric instead of being frozen into a guess:

| Points category | Chasers / Keepers | Beaters | Seekers |
|-----------------|-------------------|---------|---------|
| Quadball points scored  | 75% | 25% | — |
| Quadball points allowed | 60% | 40% | — |
| Flag points (both ways) | —   | 30% | 70% |

Beaters are weighted more heavily on defense than offense because bludger control is
primarily a goal-prevention lever, and they take a real share of the flag because the seeker
game is played through the beaters. Seekers get no quadball credit at all — they are on pitch
for the flag and nothing else.

Nothing is double-counted: each category is divided exactly once, then allocated within each
unit by marginal production.

### Chasers and keepers

```
points produced  = 10 × [ goals × (1 − 0.35 × team assisted-goal share) + 0.35 × assists ]
possessions used = goals + missed shots + missed attempts + missed KOs + turnovers

marginal offense = 0.75 × [ points produced − (1 − r) × lgPPP × possessions used ]
marginal defense = 0.60 × (share of unit minutes) × (team defensive possessions)
                        × [ (1 + r) × lgPPP − (goals conceded on pitch × 10 ÷ opponent possessions) ]
```

Both `points produced` and `possessions used` are scaled so the unit's totals equal the
team's actual goal points and possession count. This is the same calibration Oliver applies
to individual possession estimates, and it is what handles unattributed events — production
that nobody was named for is redistributed across the players who *were*, rather than letting
attributed production escape its share of the workload cost.

The assist split gives the assister 35% of a goal's 10 points and the scorer the rest.
Weighting by the team's assisted-goal share keeps the totals exact however generously assists
were tracked in a given season.

### Beaters

No box score, so both halves come from on-pitch team rates:

```
marginal offense = 0.25 × (share of beater minutes) × (team offensive possessions)
                        × [ on-pitch team points per possession − (1 − r) × lgPPP ]
marginal defense = 0.40 × (share of beater minutes) × (team defensive possessions)
                        × [ (1 + r) × lgPPP − on-pitch points allowed per possession ]
```

A beater with no on-pitch possession sample falls back to the team's own rate, which is the
correct no-information prior — it credits them with the team's average rather than inventing
a difference from nothing.

### Seekers

```
marginal offense = 0.70 × [ 35 × catches − (1 − r) × (league flag points per opportunity) × opportunities ]
marginal defense = 0.70 × [ (1 + r) × (league flag points per opportunity) × opportunities − 35 × opponent catches on pitch ]
```

An **opportunity** is a team-game in which the flag was live, shared out among that team's
seekers by their minutes inside the flag window — two seekers splitting a flag period split
one opportunity. League flag points per opportunity is typically near 17.5, since one of the
two sides catches it.

Beaters take the same shape at 30%, weighted by their own minutes inside the flag window.

Older archives record the catch but never the release. A catch proves the flag was live, so
the opportunity still counts; only the window is unknown, and the share falls back to
whole-game minutes.

---

## What the numbers mean

| Column | Meaning |
|--------|---------|
| **WS** | Win Shares. Wins this player is responsible for. |
| **OWS / DWS** | The offensive and defensive halves. |
| **WS/20** | Win Shares per 20 minutes of game clock. |
| **mOFF / mDEF** | Marginal points produced and prevented above replacement — the numerators. |
| **PProd / POSS** | Estimated points produced, and possessions used. |
| **xW** | Wins implied by point differential alone: `G/2 + point diff ÷ PPW`. |
| **±** | Team Win Shares minus actual wins — the calibration check. |

### Read WS/20 within a position group only

A seeker is on pitch for a few minutes and swings 35 points; a chaser never can. Seekers will
top a mixed WS/20 leaderboard every time, and that is a property of the sport, not a ranking.
The view has a position-group filter for this reason. **WS** itself *is* comparable across
positions — it is denominated in wins.

### The ± column is a feature

Team Win Shares are left un-normalised, as Basketball-Reference leaves them. The replacement
calibration in §3 is what pulls a team's total toward its actual wins, and `±` reports how
well it held:

- Near zero — the model is calibrated and the team's record matches its margins.
- Large positive — the team lost games their point differential says they should have won.
- Large negative — the team won more than their margins deserved (close wins, blowout losses).

A team whose players are missing from the player collection will also show a large negative
±, since only rostered players accumulate rows.

---

## Deliberate limitations

- **Situational filters do not apply.** Bludger-control and flag-state slices of a game do
  not add back up to a win, so the Win Shares view ignores them and says so. Team and season
  filters are respected, since those select whole games.
- **Position tagging drives the unit split.** A substitution with no `position` is treated as
  a chaser/keeper, the same convention the rest of the stats layer uses. In the legacy
  archive most subs are untagged, so beaters there are under-detected; extractor-produced
  data tags positions properly.
- **Beater credit is on/off, not isolated.** A beater's rates carry their teammates' quality
  with them. RAPM is the metric that isolates a beater; Win Shares is the one that allocates
  wins.
- **Small samples.** Points per win is estimated from the spread of margins in scope. Under
  eight games the view flags the whole table as provisional. Even so, σ from a small sample
  is unbiased — it is noisy, not wrong — which is why it is still preferred over substituting
  another sport's constant.

## Validation

The model was checked against a synthetic four-team double round robin with known team
strengths: inferred wins and scores matched the generated scoreboard exactly, league Win
Shares totalled 12.01 against 12 actual wins (ratio 1.001), and per-team gaps ran from −1.04
to +0.79 wins — tracking, correctly, which teams over- and under-performed their margins.
It was also run over the legacy archive in `src/example/` for robustness: no crashes and no
non-finite values across 80 games and 251 players.
