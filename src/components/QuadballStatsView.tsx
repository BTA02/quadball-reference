import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Filter,
  Info
} from 'lucide-react';
import { 
  computeExtendedStats, computeTeamQuadballStats,
  ExtendedPlayerStats, TeamQuadballStats 
} from '../lib/statsComputations';

interface Player { id: string; firstName: string; lastName: string; preferredName?: string; nickname?: string; [k: string]: any; }
interface GameEvent { id: string; videoId: string; gameId: string; type: string; videoTime: number; gameTime?: number; status: string; playerId?: string; teamId?: string; [k: string]: any; }
interface Team { id: string; name: string; [k: string]: any; }
interface Game { id: string; isVerified?: boolean; seasonId: string; homeTeamId: string; awayTeamId: string; [k: string]: any; }
interface Season { id: string; name: string; [k: string]: any; }

import { 
  cn, SortDir, sortBy, SortHeader, Cell, SplitHeader, SplitCell, 
  StatsTabSelector, StatsTabButton, StatsPaginationFooter 
} from './ui/StatsTable';

// Tighter, grouped spacing for the mS / mAtt / mKO trio so they read as one wide "miss" column
const MISS_GROUP_START = 'pl-2 pr-1 border-l border-gray-200';
const MISS_GROUP_MID = 'px-1';
const MISS_GROUP_END = 'pr-2 pl-1 border-r border-gray-200';

interface QuadballStatsViewProps {
  players: Player[];
  events: GameEvent[];
  teams: Team[];
  games: Game[];
  seasons: Season[];
  statsFilter?: 'public' | 'full';
  teamIds?: string[];
  search?: string;
  minGames?: number;
  bludgerControlMode?: 'all' | 'separate';
  flagFilter?: 'all' | 'on' | 'off';
  positionFilter?: 'all' | 'chaser' | 'keeper';
  onPlayerSelect?: (playerId: string) => void;
  onTeamSelect?: (teamId: string) => void;
}

export default function QuadballStatsView({ 
  players, events, teams, games, seasons, statsFilter = 'public',
  teamIds: teamFilterIds = [], search = '',
  minGames = 1, bludgerControlMode = 'all', flagFilter = 'all', positionFilter = 'all',
  onPlayerSelect, onTeamSelect
}: QuadballStatsViewProps) {
  const [tab, setTab] = useState<'boxscore' | 'rates' | 'advanced' | 'plusminus' | 'team'>('boxscore');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('points');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showHelp, setShowHelp] = useState(false);
  const perPage = 25;

  useEffect(() => { setPage(1); }, [search, teamFilterIds, positionFilter, minGames, bludgerControlMode, flagFilter]);

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filteredSeasons = useMemo(() => {
    let s = [...seasons];
    if (statsFilter === 'public') {
      s = s.filter(sea => {
        const yearMatch = sea.name.match(/\d{4}/);
        return yearMatch ? parseInt(yearMatch[0]) > 2020 : true;
      });
    }
    return s.sort((a, b) => b.name.localeCompare(a.name));
  }, [seasons, statsFilter]);

  const filteredTeams = useMemo(() => {
    if (statsFilter !== 'public') return teams;
    const seasonIdsAfter2020 = new Set(filteredSeasons.map(s => s.id));
    const teamsWithGamesAfter2020 = new Set<string>();
    games.forEach(g => {
      if (seasonIdsAfter2020.has(g.seasonId)) {
        teamsWithGamesAfter2020.add(g.homeTeamId);
        teamsWithGamesAfter2020.add(g.awayTeamId);
      }
    });
    return teams
      .filter(t => teamsWithGamesAfter2020.has(t.id))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [teams, games, filteredSeasons, statsFilter]);

  const filtersAll = useMemo(() => ({
    teamId: teamFilterIds.length === 1 ? teamFilterIds[0] : undefined,
    teamIds: teamFilterIds.length > 0 ? teamFilterIds : undefined,
    position: positionFilter === 'all' ? undefined : positionFilter,
    controlFilter: undefined,
    flagFilter: flagFilter === 'all' ? undefined : flagFilter,
    skipRapm: false
  }), [teamFilterIds, positionFilter, flagFilter, statsFilter]);

  const filtersWith = useMemo(() => ({ ...filtersAll, controlFilter: 'with' as const }), [filtersAll]);
  const filtersWithout = useMemo(() => ({ ...filtersAll, controlFilter: 'without' as const }), [filtersAll]);

  const extendedStatsAll = useMemo(() => computeExtendedStats(events, players, games, filtersAll), [events, players, games, filtersAll]);
  const extendedStatsWith = useMemo(() => bludgerControlMode === 'separate' ? computeExtendedStats(events, players, games, filtersWith) : [], [bludgerControlMode, events, players, games, filtersWith]);
  const extendedStatsWithout = useMemo(() => bludgerControlMode === 'separate' ? computeExtendedStats(events, players, games, filtersWithout) : [], [bludgerControlMode, events, players, games, filtersWithout]);

  const teamStatsAll = useMemo(() => computeTeamQuadballStats(events, players, teams, games, filtersAll), [events, players, teams, games, filtersAll]);
  const teamStatsWith = useMemo(() => bludgerControlMode === 'separate' ? computeTeamQuadballStats(events, players, teams, games, filtersWith) : [], [bludgerControlMode, events, players, teams, games, filtersWith]);
  const teamStatsWithout = useMemo(() => bludgerControlMode === 'separate' ? computeTeamQuadballStats(events, players, teams, games, filtersWithout) : [], [bludgerControlMode, events, players, teams, games, filtersWithout]);

  const useSplit = bludgerControlMode === 'separate';

  const mergedPlayers = useMemo(() => {
    if (!useSplit) return extendedStatsAll;
    const withMap = new Map(extendedStatsWith.map(s => [s.playerId, s]));
    const withoutMap = new Map(extendedStatsWithout.map(s => [s.playerId, s]));
    return extendedStatsAll.map(sAll => ({ ...sAll, _with: withMap.get(sAll.playerId) || null, _without: withoutMap.get(sAll.playerId) || null }));
  }, [useSplit, extendedStatsAll, extendedStatsWith, extendedStatsWithout]);

  const mergedTeams = useMemo(() => {
    if (!useSplit) return teamStatsAll;
    const withMap = new Map(teamStatsWith.map(s => [s.teamId, s]));
    const withoutMap = new Map(teamStatsWithout.map(s => [s.teamId, s]));
    return teamStatsAll.map(sAll => ({ ...sAll, _with: withMap.get(sAll.teamId) || null, _without: withoutMap.get(sAll.teamId) || null }));
  }, [useSplit, teamStatsAll, teamStatsWith, teamStatsWithout]);

  const validQuadballPlayerIds = useMemo(() => {
    const explicitPositions = new Map<string, Set<string>>();
    for (const e of events) {
      if (!e.playerId) continue;
      if (!explicitPositions.has(e.playerId)) explicitPositions.set(e.playerId, new Set());
      const pSet = explicitPositions.get(e.playerId)!;
      
      if (e.position) {
        pSet.add(e.position);
      }
      const t = (e.type || '').toLowerCase();
      if (t === 'goal' || t === 'assist' || t === 'shot' || t === 'attempt') {
        pSet.add('chaser');
      }
      if (t.includes('beater') || t.includes('dodgeball')) {
        pSet.add('beater');
      }
      if (t === 'flag_catch') {
        pSet.add('seeker');
      }
    }
    const validIds = new Set<string>();
    players.forEach(p => {
      const poss = explicitPositions.get(p.id);
      if (!poss || poss.size === 0) validIds.add(p.id);
      else if (poss.has('chaser') || poss.has('keeper')) validIds.add(p.id);
      else if (!poss.has('beater') && !poss.has('seeker')) validIds.add(p.id);
    });
    return validIds;
  }, [events, players]);

  // Sorted (but not search-filtered) lists establish each row's ORIGINAL rank,
  // so a search doesn't renumber players/teams relative to their un-searched standing.
  const sortedPlayers = useMemo(() => {
    const d = mergedPlayers.filter(s => s.gamesPlayed >= minGames && validQuadballPlayerIds.has(s.playerId));
    return sortBy(d, sortKey as keyof ExtendedPlayerStats, sortDir);
  }, [mergedPlayers, minGames, sortKey, sortDir, validQuadballPlayerIds]);

  const sortedTeam = useMemo(() => {
    const d = mergedTeams.filter(s => s.gamesPlayed >= minGames);
    return sortBy(d, sortKey as keyof TeamQuadballStats, sortDir);
  }, [mergedTeams, minGames, sortKey, sortDir]);

  const playerRankMap = useMemo(() => new Map(sortedPlayers.map((s, i) => [s.playerId, i + 1])), [sortedPlayers]);
  const teamRankMap = useMemo(() => new Map(sortedTeam.map((s, i) => [s.teamId, i + 1])), [sortedTeam]);

  const filteredPlayers = useMemo(() => {
    if (!search) return sortedPlayers;
    const q = search.toLowerCase();
    return sortedPlayers.filter(s => s.playerName.toLowerCase().includes(q));
  }, [sortedPlayers, search]);

  const filteredTeam = useMemo(() => {
    if (!search) return sortedTeam;
    const q = search.toLowerCase();
    return sortedTeam.filter(s => s.teamName.toLowerCase().includes(q));
  }, [sortedTeam, search]);

  const data = tab === 'team' ? filteredTeam : filteredPlayers;
  const rankMap = tab === 'team' ? teamRankMap : playerRankMap;
  const totalPages = Math.ceil(data.length / perPage) || 1;
  const paged = data.slice((page - 1) * perPage, page * perPage);

  const totalG = mergedPlayers.reduce((s, p) => s + p.goals, 0);
  const totalA = mergedPlayers.reduce((s, p) => s + p.assists, 0);

    const HeaderCell = (props: any) => {
    if (useSplit && tab !== 'team') return <SplitHeader {...props} />;
    return <SortHeader {...props} />;
  };
  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-gray-900">Quadball</h2>
          <div className="flex text-xs text-slate-500 gap-3 font-mono">
            {tab === 'team' ? (
              <span>{mergedTeams.length} teams</span>
            ) : (
              <span>{mergedPlayers.length} players</span>
            )}
            <span>{totalG}G</span>
            <span>{totalA}A</span>
            <span>{totalG * 10}PTS</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatsTabSelector>
            <StatsTabButton isFirst active={tab === 'boxscore'} onClick={() => { setTab('boxscore'); setSortKey('goals'); setSortDir('desc'); }} label="Box Score" />
            <StatsTabButton active={tab === 'rates'} onClick={() => { setTab('rates'); setSortKey('goalsPerGame'); setSortDir('desc'); }} label="Rate Score" />
            <StatsTabButton active={tab === 'plusminus'} onClick={() => { setTab('plusminus'); setSortKey('plusMinus'); setSortDir('desc'); }} label="Plus/Minus" />
            <StatsTabButton active={tab === 'advanced'} onClick={() => { setTab('advanced'); setSortKey('gameScore'); setSortDir('desc'); }} label="Advanced" />
            <StatsTabButton active={tab === 'team'} onClick={() => { setTab('team'); setSortKey('netRtg'); setSortDir('desc'); }} label="Team" />
          </StatsTabSelector>
          <button onClick={() => setShowHelp(!showHelp)} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors ml-1 bg-white border border-gray-200 rounded-md" title="How stats are calculated">
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Help Panel — contextual per tab */}
      {showHelp && (
        <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-900 space-y-2">
          {tab === 'boxscore' ? (<>
            <p className="font-semibold">Box Score — Counting Stats</p>
            <ul className="list-disc pl-4 space-y-1 opacity-90">
              <li><strong>GP</strong> — Games Played. Number of games with recorded minutes.</li>
              <li><strong>MIN</strong> — Minutes Played. Total on-field time across all games.</li>
              <li><strong>G</strong> — Goals. Total goals scored (10 points each).</li>
              <li><strong>A</strong> — Assists. Passes leading directly to a scored goal.</li>
              <li><strong>PTS</strong> — Points. Goals + Assists.</li>
              <li><strong>mTOT</strong> — Miss Total. mS + mAtt + mKO combined.</li>
              <li><strong>S%</strong> — Scoring Percentage. Goals ÷ (Goals + Shots + Attempts + KOs).</li>
              <li><strong>mS</strong> — Missed Shots. Thrown shots that did not result in a goal.</li>
              <li><strong>mAtt</strong> — Missed Attempts. Drives or physical attacks on the hoops that did not result in a goal.</li>
              <li><strong>mKO</strong> — Missed by Knockout. Scoring attempt ending because the player was knocked out before releasing the quadball on a shot or drive.</li>
              <li><strong>TO</strong> — Turnovers. Loss of offensive possession without a shot attempt.</li>
              <li><strong>CTRL%</strong> — Bludger Control %. Percentage of game time the player's team held dodgeball control while the player was on the field.</li>
            </ul>
          </>) : tab === 'rates' ? (<>
            <p className="font-semibold">Rate Score — Per-Game &amp; Pace-Adjusted Rates</p>
            <ul className="list-disc pl-4 space-y-1 opacity-90">
              <li><strong>GP</strong> — Games Played.</li>
              <li><strong>MIN</strong> — Minutes Played.</li>
              <li><strong>G/G</strong> — Goals per Game.</li>
              <li><strong>A/G</strong> — Assists per Game.</li>
              <li><strong>PTS/G</strong> — Points (Goals + Assists) per Game.</li>
              <li><strong>G/20</strong> — Goals per 20 minutes played. Normalizes for different playing times.</li>
              <li><strong>A/20</strong> — Assists per 20 minutes played.</li>
              <li><strong>PTS/20</strong> — Points per 20 minutes played.</li>
              <li><strong>G/25</strong> — Goals per 25 possessions. Adjusts for pace differences between games.</li>
              <li><strong>A/25</strong> — Assists per 25 possessions.</li>
              <li><strong>PTS/25</strong> — Points per 25 possessions.</li>
            </ul>
          </>) : tab === 'plusminus' ? (<>
            <p className="font-semibold">Plus/Minus — On-Field Impact</p>
            <ul className="list-disc pl-4 space-y-1 opacity-90">
              <li><strong>GP</strong> — Games Played.</li>
              <li><strong>MIN</strong> — Minutes Played.</li>
              <li><strong>+</strong> — Plus. Total goals scored by the player's team while they are on the field.</li>
              <li><strong>−</strong> — Minus. Total goals conceded by the player's team while they are on the field.</li>
              <li><strong>+/−</strong> — Plus minus Minus. Net goal differential while on the field.</li>
              <li><strong>+:−</strong> — Plus-to-Minus Ratio. Team goals scored ÷ Team goals conceded while on the field.</li>
              <li><strong>Off+:−</strong> — Off-Field Ratio. The team's plus-to-minus ratio when this player is NOT on the field.</li>
              <li><strong>REL +:−</strong> — Relative Value. The player's on-field ratio divided by the off-field ratio. Values above 1.0 indicate the team performs better with the player on the field.</li>
            </ul>
          </>) : tab === 'advanced' ? (<>
            <p className="font-semibold">Advanced — Efficiency &amp; Impact Metrics</p>
            <p className="opacity-75 mb-1">Possessions are inferred dynamically — a team possession ends when a Goal, Shot, or Turnover occurs while a player is on the field.</p>
            <ul className="list-disc pl-4 space-y-1 opacity-90">
              <li><strong>GP</strong> — Games Played.</li>
              <li><strong>MIN</strong> — Minutes Played.</li>
              <li><strong>ORTG</strong> — Offensive Rating. Points scored per 25 offensive possessions while on the field.</li>
              <li><strong>DRTG</strong> — Defensive Rating. Points conceded per 25 defensive possessions while on the field.</li>
              <li><strong>NET</strong> — Net Rating. ORTG minus DRTG. Positive values indicate outscoring opponents.</li>
              <li><strong>RAPM</strong> — Regularized Adjusted Plus-Minus. A ridge-regression model that isolates individual impact by controlling for teammates and opponents on the field simultaneously.</li>
              <li><strong>EPR</strong> — Empty Possession Rate. Percentage of offensive possessions that are "empty" — ending in a turnover with no shot, attempt, or KO taken during that possession.</li>
              <li><strong>fEPR</strong> — Forced Empty Possession Rate. Percentage of defensive possessions where the opponent's possession was "empty" — they turned the ball over without getting off a shot, attempt, or KO.</li>
              <li><strong>USG%</strong> — Usage Rate. Estimates the percentage of team possessions a player is directly involved in (Goals + Assists + Shots + Turnovers ÷ Team Possessions while on field).</li>
              <li><strong>GmSc</strong> — Game Score. A composite single-number rating of overall productivity based on counting stats.</li>
            </ul>
          </>) : tab === 'team' ? (<>
            <p className="font-semibold">Team Aggregates</p>
            <ul className="list-disc pl-4 space-y-1 opacity-90">
              <li><strong>GP</strong> — Games Played.</li>
              <li><strong>G</strong> — Total Goals scored by the team.</li>
              <li><strong>A</strong> — Total Assists recorded by the team.</li>
              <li><strong>mS</strong> — Missed Shots.</li>
              <li><strong>mAtt</strong> — Missed Attempts.</li>
              <li><strong>mKO</strong> — Missed by Knockout. Scoring attempt ending because the player was knocked out before releasing the quadball on a shot or drive.</li>
              <li><strong>mTOT</strong> — Miss Total. mS + mAtt + mKO combined.</li>
              <li><strong>TO</strong> — Turnovers.</li>
              <li><strong>G/G</strong> — Goals per Game.</li>
              <li><strong>A/G</strong> — Assists per Game.</li>
              <li><strong>PTS/G</strong> — Points per Game.</li>
              <li><strong>ORTG</strong> — Team Offensive Rating (points per 25 possessions).</li>
              <li><strong>DRTG</strong> — Team Defensive Rating (opponent points per 25 possessions).</li>
              <li><strong>NET</strong> — Net Rating (ORTG − DRTG).</li>
            </ul>
          </>) : null}
        </div>
      )}

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-slate-600 sticky left-0 bg-gray-50 z-10 min-w-[140px]">
                  {tab === 'team' ? 'Team' : 'Player'}
                </th>
                {tab === 'boxscore' ? (<>
                  <HeaderCell label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                  <HeaderCell label="MIN" sortKey="minutesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minutes Played" />
                  <HeaderCell label="G" sortKey="goals" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals" />
                  <HeaderCell label="A" sortKey="assists" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists" />
                  <HeaderCell label="PTS" sortKey="points" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Points (Goals + Assists)" />
                  <HeaderCell label="mTOT" sortKey="missTotal" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Miss Total (mS + mAtt + mKO)" />
                  <HeaderCell label="S%" sortKey="shotPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Scoring % (Goals / (Goals + Shots + Attempts + KOs))" />
                  <HeaderCell label="mS" sortKey="shots" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Missed Shot (throws)" className={MISS_GROUP_START} />
                  <HeaderCell label="mAtt" sortKey="attempts" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Missed Attempt (drives/physical attacks)" className={MISS_GROUP_MID} />
                  <HeaderCell label="mKO" sortKey="missKo" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Missed by Knockout" className={MISS_GROUP_END} />
                  <HeaderCell label="TO" sortKey="turnovers" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Turnovers" />
                  <HeaderCell label="CTRL%" sortKey="controlPctOnField" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Team Bludger Control % While On Field" />
                </>) : tab === 'rates' ? (<>
                  <HeaderCell label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                  <HeaderCell label="MIN" sortKey="minutesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minutes Played" />
                  <HeaderCell label="G/G" sortKey="goalsPerGame" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals per Game" />
                  <HeaderCell label="A/G" sortKey="assistsPerGame" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists per Game" />
                  <HeaderCell label="PTS/G" sortKey="pointsPerGame" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Points per Game" />
                  <HeaderCell label="G/20" sortKey="goalsPerTwenty" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals per 20 Minutes" />
                  <HeaderCell label="A/20" sortKey="assistsPerTwenty" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists per 20 Minutes" />
                  <HeaderCell label="PTS/20" sortKey="pointsPerTwenty" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Points per 20 Minutes" />
                  <HeaderCell label="G/25" sortKey="goalsPer25Possessions" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals per 25 Possessions" />
                  <HeaderCell label="A/25" sortKey="assistsPer25Possessions" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists per 25 Possessions" />
                  <HeaderCell label="PTS/25" sortKey="pointsPer25Possessions" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Points per 25 Possessions" />
                </>) : tab === 'advanced' ? (<>
                  <HeaderCell label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                  <HeaderCell label="MIN" sortKey="minutesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minutes Played" />
                  <HeaderCell label="ORTG" sortKey="oRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Offensive Rating (Points scored per 25 offensive possessions while on field)" />
                  <HeaderCell label="DRTG" sortKey="dRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Defensive Rating (Points conceded per 25 defensive possessions while on field)" />
                  <HeaderCell label="NET" sortKey="netRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Net Rating (ORTG - DRTG)" />
                  <HeaderCell label="RAPM" sortKey="rapm" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Regularized Adjusted Plus-Minus" />
                  <HeaderCell label="CVA" sortKey="cva" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Chaser Value Added (Overall estimated goals added/saved per 20 minutes vs league average chaser)" />
                  <HeaderCell label="EPR" sortKey="epr" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Empty Possession Rate (Empty Turnovers / Offensive Possessions)" />
                  <HeaderCell label="fEPR" sortKey="fEpr" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Forced Empty Possession Rate (Opponent Empty Turnovers / Defensive Possessions)" />
                  <HeaderCell label="USG%" sortKey="usgPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Usage Rate (Estimates % of team possessions player is involved in while on field)" />
                  <HeaderCell label="GmSc" sortKey="gameScore" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Game Score (Composite single-number rating of productivity)" />
                </>) : tab === 'plusminus' ? (<>
                  <HeaderCell label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                  <HeaderCell label="MIN" sortKey="minutesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minutes Played" />
                  <HeaderCell label="+" sortKey="plus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals scored while on field" />
                  <HeaderCell label="−" sortKey="minus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals conceded while on field" />
                  <HeaderCell label="+/−" sortKey="plusMinus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Plus minus Minus" />
                  <HeaderCell label="+:−" sortKey="plusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Ratio of Plus to Minus" />
                  <HeaderCell label="Off+:−" sortKey="offPlusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Ratio of Plus to Minus while player is off the field" />
                  <HeaderCell label="REL +:−" sortKey="relPlusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Relative Value (Your +:− Ratio vs. your team's when you are off)" />
                </>) : (<>
                  <HeaderCell label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                  <HeaderCell label="G" sortKey="goals" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals" />
                  <HeaderCell label="A" sortKey="assists" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists" />
                  <HeaderCell label="mS" sortKey="shots" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Missed Shot" className={MISS_GROUP_START} />
                  <HeaderCell label="mAtt" sortKey="attempts" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Missed Attempt" className={MISS_GROUP_MID} />
                  <HeaderCell label="mKO" sortKey="missKo" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Missed by Knockout" className={MISS_GROUP_END} />
                  <HeaderCell label="mTOT" sortKey="missTotal" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Miss Total (mS + mAtt + mKO)" />
                  <HeaderCell label="TO" sortKey="turnovers" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Turnovers" />
                  <HeaderCell label="G/G" sortKey="goalsPerGame" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals per Game" />
                  <HeaderCell label="A/G" sortKey="assistsPerGame" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists per Game" />
                  <HeaderCell label="PTS/G" sortKey="pointsPerGame" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Points per Game" />
                  <HeaderCell label="ORTG" sortKey="oRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Offensive Rating" />
                  <HeaderCell label="DRTG" sortKey="dRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Defensive Rating" />
                  <HeaderCell label="NET" sortKey="netRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Net Rating" />
                </>)}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={12} className="py-8 text-center text-slate-500 text-xs">No stats found</td></tr>
              ) : paged.map((row: any) => {
                const rank = rankMap.get(tab === 'team' ? row.teamId : row.playerId) ?? '-';
                const DataCell = ({ prop, fmt, bold, group }: { prop?: string, fmt?: (v: any, rowObj?: any) => string|number, bold?: boolean, group?: 'start' | 'mid' | 'end' }) => {
                  const groupClass = group === 'start' ? MISS_GROUP_START : group === 'mid' ? MISS_GROUP_MID : group === 'end' ? MISS_GROUP_END : undefined;
                  if (useSplit && tab !== 'team') {
                    let wVal = prop ? (row._with?.[prop] ?? '—') : '—';
                    let woVal = prop ? (row._without?.[prop] ?? '—') : '—';
                    if (fmt && row._with && wVal !== '—') wVal = fmt(wVal, row._with);
                    if (fmt && row._without && woVal !== '—') woVal = fmt(woVal, row._without);
                    return <SplitCell valWith={wVal} valWithout={woVal} bold={bold} className={groupClass} />;
                  } else {
                    let aVal = prop ? (row[prop] ?? '—') : '—';
                    if (fmt && aVal !== '—') aVal = fmt(aVal, row);
                    return <Cell value={aVal} bold={bold} className={groupClass} />;
                  }
                };
                return (
                  <tr key={tab === 'team' ? row.teamId : row.playerId} className="border-b border-gray-50 hover:bg-red-50/30 transition-colors">
                    <td className="px-2 py-1.5 sticky left-0 bg-white z-10 group-hover:bg-red-50/30">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 w-4 text-right font-mono">{rank}</span>
                        {tab === 'team' ? (
                          <button onClick={() => onTeamSelect?.(row.teamId)} className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline truncate">
                            {row.teamName}
                          </button>
                        ) : (
                          <button onClick={() => onPlayerSelect?.(row.playerId)} className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline truncate">
                            {row.firstName} {row.lastName}
                          </button>
                        )}
                      </div>
                    </td>
                    {tab === 'boxscore' ? (<>
                      <DataCell prop="gamesPlayed" />
                      <DataCell prop="minutesPlayed" />
                      <DataCell prop="goals" bold />
                      <DataCell prop="assists" bold />
                      <DataCell prop="points" bold />
                      <DataCell prop="missTotal" />
                      <DataCell prop="shotPct" fmt={v => `${v}%`} />
                      <DataCell prop="shots" group="start" />
                      <DataCell prop="attempts" group="mid" />
                      <DataCell prop="missKo" group="end" />
                      <DataCell prop="turnovers" />
                      <DataCell prop="controlPctOnField" fmt={v => `${v}%`} />
                    </>) : tab === 'rates' ? (<>
                      <DataCell prop="gamesPlayed" />
                      <DataCell prop="minutesPlayed" />
                      <DataCell prop="goalsPerGame" />
                      <DataCell prop="assistsPerGame" />
                      <DataCell prop="pointsPerGame" bold />
                      <DataCell prop="goalsPerTwenty" />
                      <DataCell prop="assistsPerTwenty" />
                      <DataCell prop="pointsPerTwenty" bold />
                      <DataCell prop="goalsPer25Possessions" />
                      <DataCell prop="assistsPer25Possessions" />
                      <DataCell prop="pointsPer25Possessions" bold />
                    </>) : tab === 'advanced' ? (<>
                      <DataCell prop="gamesPlayed" />
                      <DataCell prop="minutesPlayed" />
                      <DataCell prop="oRtg" />
                      <DataCell prop="dRtg" />
                      <DataCell prop="netRtg" bold fmt={v => v > 0 ? `+${v}` : v || 'E'} />
                      <DataCell prop="rapm" bold fmt={v => v > 0 ? `+${v}` : v || 'E'} />
                      <DataCell prop="cva" bold fmt={v => v > 0 ? `+${v}` : v || '0'} />
                      <DataCell prop="epr" fmt={v => `${v}%`} />
                      <DataCell prop="fEpr" fmt={v => `${v}%`} />
                      <DataCell prop="usgPct" fmt={v => `${v}%`} />
                      <DataCell prop="gameScore" bold />
                    </>) : tab === 'plusminus' ? (<>
                      <DataCell prop="gamesPlayed" />
                      <DataCell prop="minutesPlayed" />
                      <DataCell prop="plus" />
                      <DataCell prop="minus" />
                      <DataCell prop="plusMinus" bold fmt={v => v > 0 ? `+${v}` : v || 'E'} />
                      <DataCell prop="plusMinusRatio" fmt={v => v === Infinity ? '∞' : v} />
                      <DataCell prop="offPlusMinusRatio" fmt={v => v === Infinity ? '∞' : v} />
                      <DataCell prop="relPlusMinusRatio" fmt={v => v > 0 ? `+${v}` : v || 'E'} />
                    </>) : (<>
                      <DataCell prop="gamesPlayed" />
                      <DataCell prop="goals" bold />
                      <DataCell prop="assists" bold />
                      <DataCell prop="shots" group="start" />
                      <DataCell prop="attempts" group="mid" />
                      <DataCell prop="missKo" group="end" />
                      <DataCell prop="missTotal" />
                      <DataCell prop="turnovers" />
                      <DataCell prop="goalsPerGame" />
                      <DataCell prop="assistsPerGame" />
                      <DataCell prop="pointsPerGame" />
                      <DataCell prop="oRtg" />
                      <DataCell prop="dRtg" />
                      <DataCell prop="netRtg" bold fmt={v => v > 0 ? `+${v}` : v || 'E'} />
                    </>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination footer */}
      <StatsPaginationFooter
        itemCount={data.length}
        itemName={tab === 'team' ? 'teams' : 'players'}
        legend="mS = missed shots • mAtt = missed attempts (drives) • mKO = missed by knockout • mTOT = mS + mAtt + mKO • G = goals • A = assists • TO = turnovers • S% = scoring %"
        page={page}
        totalPages={totalPages}
        setPage={setPage}
      />
    </div>
  );
}
