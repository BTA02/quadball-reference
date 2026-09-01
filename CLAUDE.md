# Project Context: Quadball

This project deals with the sport of **quadball** (formerly known as quidditch). Use this file for general context, and consult the full rulebook below whenever you need authoritative detail — scoring, fouls, positions, timing, pitch dimensions, or gameplay procedures.

## Official rulebook

The complete rules are in a PDF (only on local development) at:

```
docs/rules/quadball-rulebook.pdf
```

**When to read it:** if a question touches anything rules-specific (edge cases, exact wording, penalties, officiating procedure, equipment specs, etc.), read the relevant pages of that PDF directly rather than relying on general/trained knowledge — the PDF is the source of truth for this project, and rules bodies revise them periodically, so don't assume prior knowledge is current.

**How to read it efficiently:** the rulebook is long. Don't load the whole thing for every question — use the table of contents / index (usually near the front or back) to find the right section first, then read just that page range. Only read the full document when you genuinely need to reason across it (e.g., cross-referencing multiple sections).

## How to Play

**When to read it:** considering the size, make sure you understand this section before / during conversations regarding the game of quadball and this project

Quadball is a game played in two teams of 7 players on the field each. It is a mixed-gender, full-contact sport played similar to two sports mashed up. There is one "quadball" is the main scoring ball (akin to a basketball). Scoring the quadball is worth 10 points, or 1 goal. The quadball is handled by the positions called the chasers and keeper. Each team has 3 chasers and 1 keeper on the field at a time. They are very similar positions, with the keeper having a couple of special privileges. 

Beaters throw dodgeballs at opposing players (chasers, keepers, beaters, and seekers). A player hit by a thrown dodgeball is "knocked out" and must drop the ball they are carrying and touch their own hoop before returning to play. There are 3 dodgeballs on the field at a time. Since there are 4 beaters (2 per team) on each side, this means that one team will have one more dodgeball than the other, and we call this "Dodgeball control", or just "control".

Seekers attempt to catch the "flag" (a tennis ball in a sock attached to a neutral "flag runner"). A successful flag catch is worth 35 points. The flag can only be caught once per game, and both seekers leave the pitch after a successful catch. Seekers are subject to the "knock out" effect, so beaters heavily influence a seeker's ability to catch the flag.

The game is played in 3 phases, the first lasts 20 minutes. It is played between only 6 players on each side, as the seekers do not play in this phase. This phase is played continuously, with both teams attempting to score the quadball on the other teams' hoops, while defending their own. Beaters interact with the chasers and keepers by attempting to knock them out of the game while also defending their own team from the other beaters. This dynamic creates interesting gameplay where two somewhat unrelated events heavily influence the success of the other. This phase ends after 20 minutes (the game is not stopped at 20 minutes, rather the game plays out until the possession ends).

The game ends not at a time limit, but at a set score. This "set score" is calculated at the end of the first phase. The set score is the higher goal total of the two teams, plus 60 points. The first team to reach or exceed that score wins. There is no game clock.

The second phase includes the "flag runner" being added to the field, and seekers being allowed to pursue the flag runner after 10 seconds in to this phase. We call this phase "flag runner on pitch". In this phase, both teams are attempting to score the quadball on the other teams' hoops, while defending their own, and the seekers are attempting to catch the flag runner for 35 points. 

This phase ends when the flag runner is caught, or when the set score is reached. If the flag runner is caught and the set score is NOT reached, then the flag runner and seekers from both teams leave the field. The game then continues similar in the thrid phase, very similar to the first phase, with each team attempting to score the quadball until they reach the set score. 

The first team to reach the set score wins.

## Quick reference

_Fill this in with the handful of facts you find yourself needing constantly (e.g., team size, pitch dimensions, position names, basic scoring values), so routine questions don't require opening the PDF at all. Leave detailed/edge-case rules to the PDF itself — this section is just a cheat sheet._

- Positions: Chaser, Keeper, Beater, Seeker
- Balls: Quadball, Dodgeball, Flag
- Roles per team: 3 chasers, 1 keeper, 2 beaters, 1 seeker
- Scoring (quadball goals, snitch catch, etc.): A quadball is scored through 1 of 3 hoops, resulting in 1 goal, which is worth 10 points. The quadball can be scored by a chaser or a keeper. A flag catch, which is done by the seeker, is worth 35 points. The flag can only be caught once per game. 
- 

- Pitch/field dimensions:
- Match duration / win conditions:

## Working conventions

_Add anything else Claude should know about how you want it to help on this project — e.g., what you're building (stats tracker, league manager, referee app, etc.), preferred terminology, data models already in use, coding conventions._

-
