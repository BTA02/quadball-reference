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

interface QuadballStatsViewProps {
  players: Player[];
  events: GameEvent[];
  teams: Team[];
  games: Game[];
  seasons: Season[];
  statsFilter?: 'all' | 'verified' | 'legacy';
  seasonId?: string;
  teamId?: string;
  search?: string;
  minGames?: number;
  bludgerControlMode?: 'all' | 'separate';
  flagFilter?: 'all' | 'on' | 'off';
  positionFilter?: 'all' | 'chaser' | 'keeper';
  outlierFilter?: 'include' | 'exclude';
  onPlayerSelect?: (playerId: string) => void;
  onTeamSelect?: (teamId: string) => void;
}

export default function QuadballStatsView({ 
  players, events, teams, games, seasons, statsFilter = 'all',
  seasonId: seasonFilter = '', teamId: teamFilter = '', search = '',
  minGames = 1, bludgerControlMode = 'all', flagFilter = 'all', positionFilter = 'all', outlierFilter = 'include',
  onPlayerSelect, onTeamSelect
}: QuadballStatsViewProps) {
  const [tab, setTab] = useState<'boxscore' | 'rates' | 'advanced' | 'plusminus' | 'team'>('boxscore');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('points');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showHelp, setShowHelp] = useState(false);
  const perPage = 25;

  useEffect(() => { setPage(1); }, [search, seasonFilter, teamFilter, positionFilter, minGames, bludgerControlMode, flagFilter]);

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filteredSeasons = useMemo(() => {
    let s = [...seasons];
    if (statsFilter === 'all') {
      s = s.filter(sea => {
        const yearMatch = sea.name.match(/\d{4}/);
        return yearMatch ? parseInt(yearMatch[0]) > 2020 : true;
      });
    }
    return s.sort((a, b) => b.name.localeCompare(a.name));
  }, [seasons, statsFilter]);

  const filteredTeams = useMemo(() => {
    if (statsFilter !== 'all') return teams;
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
    seasonId: seasonFilter || undefined,
    teamId: teamFilter || undefined,
    position: positionFilter === 'all' ? undefined : positionFilter,
    controlFilter: undefined,
    flagFilter: flagFilter === 'all' ? undefined : flagFilter,
    outlierFilter
  }), [seasonFilter, teamFilter, positionFilter, flagFilter, outlierFilter]);

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

  const filteredPlayers = useMemo(() => {
    let d = mergedPlayers.filter(s => s.gamesPlayed >= minGames && validQuadballPlayerIds.has(s.playerId));
    if (search) { const q = search.toLowerCase(); d = d.filter(s => s.playerName.toLowerCase().includes(q)); }
    return sortBy(d, sortKey as keyof ExtendedPlayerStats, sortDir);
  }, [mergedPlayers, search, minGames, sortKey, sortDir, validQuadballPlayerIds]);

  const filteredTeam = useMemo(() => {
    let d = mergedTeams.filter(s => s.gamesPlayed >= minGames);
    if (search) { const q = search.toLowerCase(); d = d.filter(s => s.teamName.toLowerCase().includes(q)); }
    return sortBy(d, sortKey as keyof TeamQuadballStats, sortDir);
  }, [mergedTeams, search, minGames, sortKey, sortDir]);

  const data = tab === 'team' ? filteredTeam : filteredPlayers;
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

      {/* Help Panel */}
      {showHelp && (
        <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-900 space-y-2">
          <p className="font-semibold">How Advanced Stats are Calculated</p>
          <ul className="list-disc pl-4 space-y-1 opacity-90">
            <li><strong>Possessions</strong> are inferred dynamically. Since "OFFENSE" tags are unreliable, a team possession ends when a Goal, Shot (Miss), or Turnover occurs while a player is on the field.</li>
            <li><strong>USG% (Usage Rate)</strong> estimates the percentage of team possessions a player is directly involved in (Goals + Assists + Shots + Turnovers / Team Possessions).</li>
            <li><strong>DRTG (Defensive Rating)</strong>: Points conceded per 100 team defensive possessions while on the field.</li>
            <li><strong>NET (Net Rating)</strong>: Points differential per 100 team possessions while on the field (ORTG - DRTG).</li>
            <li><strong>USG% (Usage Rate)</strong>: Rebounds, points, and turnovers normalized evaluating a specific player's dominance over their team's possession outcomes.</li>
          </ul>
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
                  <HeaderCell label="S" sortKey="shots" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Missed Shot (throws)" />
                  <HeaderCell label="ATT" sortKey="attempts" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Missed Attempt (drives/physical attacks)" />
                  <HeaderCell label="KO" sortKey="missKo" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Missed by Knockout" />
                  <HeaderCell label="G" sortKey="goals" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals" />
                  <HeaderCell label="A" sortKey="assists" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists" />
                  <HeaderCell label="TO" sortKey="turnovers" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Turnovers" />
                  <HeaderCell label="S%" sortKey="shotPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Scoring % (Goals / (Goals + Shots + Attempts + KOs))" />
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
                  <HeaderCell label="G/100" sortKey="goalsPer100Possessions" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals per 100 Possessions" />
                  <HeaderCell label="A/100" sortKey="assistsPer100Possessions" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists per 100 Possessions" />
                  <HeaderCell label="PTS/100" sortKey="pointsPer100Possessions" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Points per 100 Possessions" />
                </>) : tab === 'advanced' ? (<>
                  <HeaderCell label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                  <HeaderCell label="MIN" sortKey="minutesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minutes Played" />
                  <HeaderCell label="ORTG" sortKey="oRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Offensive Rating (Points scored per 100 offensive possessions while on field)" />
                  <HeaderCell label="DRTG" sortKey="dRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Defensive Rating (Points conceded per 100 defensive possessions while on field)" />
                  <HeaderCell label="NET" sortKey="netRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Net Rating (ORTG - DRTG)" />
                  <HeaderCell label="RAPM" sortKey="rapm" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Regularized Adjusted Plus-Minus" />
                  <HeaderCell label="EPR" sortKey="epr" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Empty Possession Rate (Empty Turnovers / Offensive Possessions)" />
                  <HeaderCell label="fEPR" sortKey="fEpr" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Forced Empty Possession Rate (Opponent Empty Turnovers / Defensive Possessions)" />
                  <HeaderCell label="USG%" sortKey="usgPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Usage Rate (Estimates % of team possessions player is involved in while on field)" />
                  <HeaderCell label="GmSc" sortKey="gameScore" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Game Score (Composite single-number rating of productivity)" />
                </>) : tab === 'plusminus' ? (<>
                  <HeaderCell label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                  <HeaderCell label="MIN" sortKey="minutesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minutes Played" />
                  <HeaderCell label="+" sortKey="plus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals scored while on field" />
                  <HeaderCell label="−" sortKey="minus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals conceded while on field" />
                  <HeaderCell label="+/−" sortKey="plusMinus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Plus / Minus (Net differntial)" />
                  <HeaderCell label="+:−" sortKey="plusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Ratio of Plus to Minus" />
                  <HeaderCell label="Off+:−" sortKey="offPlusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Ratio of Plus to Minus while player is off the field" />
                  <HeaderCell label="REL +:−" sortKey="relPlusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Relative Value (Your +:− Ratio vs. your team's when you are off)" />
                </>) : (<>
                  <HeaderCell label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                  <HeaderCell label="G" sortKey="goals" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals" />
                  <HeaderCell label="A" sortKey="assists" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists" />
                  <HeaderCell label="S" sortKey="shots" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Missed Shot" />
                  <HeaderCell label="ATT" sortKey="attempts" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Missed Attempt" />
                  <HeaderCell label="KO" sortKey="missKo" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Missed by Knockout" />
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
              ) : paged.map((row: any, idx) => {
                const rank = (page - 1) * perPage + idx + 1;
                const DataCell = ({ prop, fmt, bold }: { prop?: string, fmt?: (v: any, rowObj?: any) => string|number, bold?: boolean }) => {
                  if (useSplit && tab !== 'team') {
                    let wVal = prop ? (row._with?.[prop] ?? '—') : '—';
                    let woVal = prop ? (row._without?.[prop] ?? '—') : '—';
                    if (fmt && row._with && wVal !== '—') wVal = fmt(wVal, row._with);
                    if (fmt && row._without && woVal !== '—') woVal = fmt(woVal, row._without);
                    return <SplitCell valWith={wVal} valWithout={woVal} bold={bold} />;
                  } else {
                    let aVal = prop ? (row[prop] ?? '—') : '—';
                    if (fmt && aVal !== '—') aVal = fmt(aVal, row);
                    return <Cell value={aVal} bold={bold} />;
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
                      <DataCell prop="shots" />
                      <DataCell prop="attempts" />
                      <DataCell prop="missKo" />
                      <DataCell prop="goals" bold />
                      <DataCell prop="assists" bold />
                      <DataCell prop="turnovers" />
                      <DataCell prop="shotPct" fmt={v => `${v}%`} />
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
                      <DataCell prop="goalsPer100Possessions" />
                      <DataCell prop="assistsPer100Possessions" />
                      <DataCell prop="pointsPer100Possessions" bold />
                    </>) : tab === 'advanced' ? (<>
                      <DataCell prop="gamesPlayed" />
                      <DataCell prop="minutesPlayed" />
                      <DataCell prop="oRtg" />
                      <DataCell prop="dRtg" />
                      <DataCell prop="netRtg" bold fmt={v => v > 0 ? `+${v}` : v || 'E'} />
                      <DataCell prop="rapm" bold fmt={v => v > 0 ? `+${v}` : v || 'E'} />
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
                      <DataCell prop="shots" />
                      <DataCell prop="attempts" />
                      <DataCell prop="missKo" />
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
        legend="S = shots • ATT = attempts (drives) • G = goals • A = assists • TO = turnovers • S% = shooting %"
        page={page}
        totalPages={totalPages}
        setPage={setPage}
      />
    </div>
  );
}
