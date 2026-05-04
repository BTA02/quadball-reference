# Stats UI Definitions

This document defines the standard views used across the YouTube Sports Stats Tracker application to present statistics for different sports and positions. It serves as a shared language for developers and users.

## Quadball (Chasers & Keepers)
Quadball stats are tracked for Chasers and Keepers. The stats are separated into the following views:

*   **Box Score**: Basic counting stats (Goals, Assists, Shots, Attempts, Turnovers, etc.) and basic percentages (Shooting %).
*   **Rate Score**: Stats normalized per game, per 20 minutes, and per 100 possessions to provide a pace-adjusted view of player productivity.
*   **Advanced Ratings**: Advanced efficiency and possession models, including Offensive/Defensive Ratings (ORTG/DRTG), Net Rating (NET), Expected Offense/Defense (eOff/eDef), Empty Possession Rates (EPR), Usage Percentage (USG%), and overall Game Score (GmSc).
*   **Plus/Minus**: Impact analysis showing point differentials when a player is on the field vs. off the field, including Relative Plus/Minus and Plus/Minus ratios.
*   **Team**: Aggregated team-level performance metrics, combining counting stats and advanced ratings for entire rosters.

## Dodgeball (Beaters)
Beaters play the "dodgeball" mini-game within Quadball. Their stats revolve around bludger control and are separated into:

*   **Pairs**: Stats calculated for specific pairs of beaters playing together, highlighting their combined effectiveness in maintaining bludger control and driving positive point differentials.
*   **Solo**: Individual beater statistics, showing their personal plus/minus, control percentage, and expected possession values regardless of their partner.
*   **Team**: Team-wide beater performance, aggregating total control minutes, control percentage, and opponent control percentage.

## Flag (Seekers)
Seekers are dedicated to catching the flag (snitch). Their stats are focused entirely on this single objective:

*   **Flag View**: A single, comprehensive view detailing games played, flag catches, opponent catches, catch percentage, average time on pitch before a catch, time from flag release, team bludger control during their shifts, and game-winning catches.

## Standard UI Components
To ensure consistency across all views, the following components (located in `src/components/ui/StatsTable.tsx`) should be re-used:
*   `SortHeader`: Standardized column headers with sorting chevrons.
*   `Cell`: Formatted data cells with built-in highlighting for positive, negative, and exceptional (gold) values.
*   `SplitHeader` & `SplitCell`: Specialized columns for displaying stats split by situational factors (e.g., "With Control" vs. "Without Control").
*   `sortBy`: A robust, universal sorting utility to handle strings, numbers, infinity, and missing values uniformly.
