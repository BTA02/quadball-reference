import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import {
  computeBeaterSoloStats,
  computeBeaterPairStats,
  computeTeamBeaterStats,
  BeaterSoloStats,
  BeaterPairStats,
  TeamBeaterStats
} from '../lib/statsComputations';

interface Player { id: string; firstName: string; lastName: string; preferredName?: string; nickname?: string; [k: string]: any; }
interface GameEvent { id: string; videoId: string; gameId: string; type: string; videoTime: number; gameTime?: number; status: string; playerId?: string; teamId?: string; [k: string]: any; }
interface Team { id: string; name: string; [k: string]: any; }
interface Game { id: string; isVerified?: boolean; seasonId: string; homeTeamId: string; awayTeamId: string; [k: string]: any; }
interface Season { id: string; name: string; [k: string]: any; }

import { 
  cn, SortDir, sortBy, SortHeader, Cell, 
  StatsTabSelector, StatsTabButton, StatsPaginationFooter 
} from './ui/StatsTable';

interface BeaterStatsViewProps {
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
  onPlayerSelect?: (playerId: string) => void;
  onTeamSelect?: (teamId: string) => void;
  tab?: 'pairs' | 'solo' | 'team';
  onTabChange?: (tab: 'pairs' | 'solo' | 'team') => void;
  // Player ids opted out of public stat pages (undefined for admins, who see everyone).
  hiddenPlayerIds?: Set<string>;
}

export default function BeaterStatsView({
  players, events, teams, games, seasons, statsFilter = 'public',
  teamIds: teamFilterIds = [], search = '',
  minGames = 1, bludgerControlMode = 'all', flagFilter = 'all',
  onPlayerSelect, onTeamSelect,
  tab: tabProp, onTabChange: onTabChangeProp,
  hiddenPlayerIds
}: BeaterStatsViewProps) {
  const [localTab, setLocalTab] = useState<'pairs' | 'solo' | 'team'>('pairs');
  const tab = tabProp || localTab;
  const setTab = (newTab: 'pairs' | 'solo' | 'team') => {
    if (onTabChangeProp) onTabChangeProp(newTab);
    else setLocalTab(newTab);
  };
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('plusMinus');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const perPage = 25;

  useEffect(() => { setPage(1); }, [search, teamFilterIds, minGames, bludgerControlMode, flagFilter]);

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };
  
  const filteredSeasons = useMemo(() => {
    let sArr = [...seasons];
    if (statsFilter === 'public') {
      sArr = sArr.filter(sea => {
        const yearMatch = sea.name.match(/\d{4}/);
        return yearMatch ? parseInt(yearMatch[0]) > 2020 : true;
      });
    }
    return sArr.sort((a, b) => b.name.localeCompare(a.name));
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

  const filters = useMemo(() => ({
    teamId: teamFilterIds.length === 1 ? teamFilterIds[0] : undefined,
    teamIds: teamFilterIds.length > 0 ? teamFilterIds : undefined,
    controlFilter: bludgerControlMode === 'all' ? undefined : undefined,
    flagFilter: flagFilter === 'all' ? undefined : flagFilter,
    skipRapm: false
  }), [teamFilterIds, bludgerControlMode, flagFilter, statsFilter]);

  const soloStats = useMemo(() => computeBeaterSoloStats(events, players, games, filters), [events, players, games, filters]);
  const pairStats = useMemo(() => computeBeaterPairStats(events, players, games, filters), [events, players, games, filters]);
  const teamStats = useMemo(() => computeTeamBeaterStats(events, players, teams, games, filters), [events, players, teams, games, filters]);

  // Sorted (but not search-filtered) lists establish each row's ORIGINAL rank,
  // so a search doesn't renumber players relative to their un-searched standing.
  const sortedSolo = useMemo(() => {
    const d = soloStats.filter(s => s.gamesPlayed >= minGames && !hiddenPlayerIds?.has(s.playerId));
    return sortBy(d, sortKey as keyof BeaterSoloStats, sortDir);
  }, [soloStats, minGames, sortKey, sortDir, hiddenPlayerIds]);

  const sortedPairs = useMemo(() => {
    const d = pairStats.filter(s => s.gamesPlayed >= minGames && !hiddenPlayerIds?.has(s.player1Id) && !hiddenPlayerIds?.has(s.player2Id));
    return sortBy(d, sortKey as keyof BeaterPairStats, sortDir);
  }, [pairStats, minGames, sortKey, sortDir, hiddenPlayerIds]);

  const sortedTeam = useMemo(() => {
    const d = teamStats.filter(s => s.gamesPlayed >= minGames);
    return sortBy(d, sortKey as keyof TeamBeaterStats, sortDir);
  }, [teamStats, minGames, sortKey, sortDir]);

  const soloRankMap = useMemo(() => new Map(sortedSolo.map((s, i) => [s.playerId, i + 1])), [sortedSolo]);
  const pairRankMap = useMemo(() => new Map(sortedPairs.map((s, i) => [s.pairKey, i + 1])), [sortedPairs]);
  const teamRankMap = useMemo(() => new Map(sortedTeam.map((s, i) => [s.teamId, i + 1])), [sortedTeam]);

  const filteredSolo = useMemo(() => {
    if (!search) return sortedSolo;
    const q = search.toLowerCase();
    return sortedSolo.filter(s => s.playerName.toLowerCase().includes(q));
  }, [sortedSolo, search]);

  const filteredPairs = useMemo(() => {
    if (!search) return sortedPairs;
    const q = search.toLowerCase();
    return sortedPairs.filter(s => s.player1Name.toLowerCase().includes(q) || s.player2Name.toLowerCase().includes(q));
  }, [sortedPairs, search]);

  const filteredTeam = useMemo(() => {
    if (!search) return sortedTeam;
    const q = search.toLowerCase();
    return sortedTeam.filter(s => s.teamName.toLowerCase().includes(q));
  }, [sortedTeam, search]);

  const data: any[] = tab === 'team' ? filteredTeam : tab === 'solo' ? filteredSolo : filteredPairs;
  const rankMap = tab === 'team' ? teamRankMap : tab === 'solo' ? soloRankMap : pairRankMap;
  const totalPages = Math.ceil(data.length / perPage) || 1;
  const paged = data.slice((page - 1) * perPage, page * perPage);

  const avgCtrl = soloStats.length > 0
    ? Math.round(soloStats.reduce((s, b) => s + b.controlPct, 0) / soloStats.length * 10) / 10
    : 0;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-gray-900">Beaters</h2>
          <div className="flex text-xs text-gray-400 gap-3 font-mono">
            {tab === 'team' ? (
              <span>{teamStats.length} teams</span>
            ) : (
              <>
                <span>{soloStats.length} beaters</span>
                <span>{pairStats.length} pairs</span>
              </>
            )}
            <span>{avgCtrl}% avg ctrl</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatsTabSelector>
            <StatsTabButton isFirst active={tab === 'pairs'} onClick={() => { setTab('pairs'); setSortKey('plusMinus'); setSortDir('desc'); }} label="Pairs" activeClass="bg-purple-600 text-white" />
            <StatsTabButton active={tab === 'solo'} onClick={() => { setTab('solo'); setSortKey('plusMinus'); setSortDir('desc'); }} label="Solo" activeClass="bg-purple-600 text-white" />
            <StatsTabButton active={tab === 'team'} onClick={() => { setTab('team'); setSortKey('controlPct'); setSortDir('desc'); }} label="Team" activeClass="bg-purple-600 text-white" />
          </StatsTabSelector>
        </div>
      </div>

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-gray-400 sticky left-0 bg-gray-50 z-10 min-w-[180px]">
                  {tab === 'pairs' ? 'Beater Pair' : tab === 'team' ? 'Team' : 'Beater'}
                </th>
                {tab === 'team' ? (<>
                  <SortHeader label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                  <SortHeader label="CTRL" sortKey="controlMinutes" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Control Minutes" />
                  <SortHeader label="TOT" sortKey="totalMinutes" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Total Minutes" />
                  <SortHeader label="CTRL%" sortKey="controlPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Control % (Percentage of possession time team has active Dodgeball Control)" />
                  <SortHeader label="CTRL/G" sortKey="controlPerGame" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Control Minutes per Game" />
                  <SortHeader label="Opp CTRL%" sortKey="oppControlPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Opponent Control %" />
                </>) : (<>
                  <SortHeader label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                  <SortHeader label="+" sortKey="plus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Plus" />
                  <SortHeader label="−" sortKey="minus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minus" />
                  <SortHeader label="+/−" sortKey="plusMinus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Plus / Minus" />
                  <SortHeader label="TKO" sortKey="tko" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Team Knockouts (opponent KO'd while on field)" />
                  <SortHeader label="CTRL" sortKey="controlMinutes" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Control Minutes" />
                  <SortHeader label="TOT" sortKey="totalMinutes" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Total Minutes" />
                  <SortHeader label="CTRL%" sortKey="controlPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Control % (Percentage of possession time team has active Dodgeball Control)" />
                  <SortHeader label="+:−" sortKey="plusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Ratio of Plus to Minus" />
                  <SortHeader label="Off+:−" sortKey="offPlusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Ratio of Plus to Minus while off the field" />
                  <SortHeader label="REL +:−" sortKey="relPlusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Relative Value (Your +:− Ratio vs. your team's when you are off)" />
                  <SortHeader label="RAPM" sortKey="rapm" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Regularized Adjusted Plus-Minus" />
                  <SortHeader label="EPR" sortKey="epr" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Empty Possession Rate (while on field)" />
                  <SortHeader label="fEPR" sortKey="fEpr" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Forced Empty Possession Rate (while on field)" />
                  <SortHeader label="BVA" sortKey="bva" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Beater Value Added (Overall estimated goals added/saved per 20 minutes of possession vs league average beater)" />
                </>)}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={10} className="py-8 text-center text-gray-400 text-xs">No beater stats found</td></tr>
              ) : paged.map((row: any) => {
                const rank = rankMap.get(tab === 'team' ? row.teamId : tab === 'pairs' ? row.pairKey : row.playerId) ?? '-';
                return (
                  <tr key={tab === 'team' ? row.teamId : tab === 'pairs' ? row.pairKey : row.playerId} className="border-b border-gray-50 hover:bg-purple-50/30 transition-colors">
                    <td className="px-2 py-1.5 sticky left-0 bg-white z-10">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-300 w-4 text-right font-mono">{rank}</span>
                        {tab === 'pairs' ? (
                          <span className="text-xs font-medium text-gray-800 truncate">
                            <button onClick={() => onPlayerSelect?.(row.player1Id)} className="text-blue-600 hover:underline hover:text-blue-800">{row.player1Name}</button> <span className="text-gray-300">&</span> <button onClick={() => onPlayerSelect?.(row.player2Id)} className="text-blue-600 hover:underline hover:text-blue-800">{row.player2Name}</button>
                          </span>
                        ) : tab === 'team' ? (
                          <button onClick={() => onTeamSelect?.(row.teamId)} className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline truncate">{row.teamName}</button>
                        ) : (
                          <button onClick={() => onPlayerSelect?.(row.playerId)} className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline truncate">{row.firstName} {row.lastName}</button>
                        )}
                      </div>
                    </td>
                    {tab === 'team' ? (<>
                      <Cell value={row.gamesPlayed} />
                      <Cell value={row.controlMinutes} />
                      <Cell value={row.totalMinutes} />
                      <Cell value={`${row.controlPct}%`} highlight={row.controlPct >= 55 ? 'pos' : row.controlPct <= 45 ? 'neg' : undefined} bold />
                      <Cell value={row.controlPerGame} />
                      <Cell value={`${row.oppControlPct}%`} highlight={row.oppControlPct <= 45 ? 'pos' : row.oppControlPct >= 55 ? 'neg' : undefined} />
                    </>) : (<>
                      <Cell value={row.gamesPlayed} />
                      <Cell value={row.plus} highlight={row.plus > 0 ? 'pos' : undefined} />
                      <Cell value={row.minus} highlight={row.minus > 0 ? 'neg' : undefined} />
                      <Cell value={row.plusMinus > 0 ? `+${row.plusMinus}` : row.plusMinus || 'E'} highlight={row.plusMinus > 0 ? 'pos' : row.plusMinus < 0 ? 'neg' : undefined} bold />
                      <Cell value={row.tko} highlight={row.tko > 0 ? 'pos' : undefined} />
                      <Cell value={row.controlMinutes} />
                      <Cell value={row.totalMinutes} />
                      <Cell value={`${row.controlPct}%`} highlight={row.controlPct >= 55 ? 'pos' : row.controlPct <= 45 ? 'neg' : undefined} bold />
                      <Cell value={row.plusMinusRatio === Infinity ? '∞' : row.plusMinusRatio} />
                      <Cell value={row.offPlusMinusRatio === Infinity ? '∞' : row.offPlusMinusRatio} />
                      <Cell value={row.relPlusMinusRatio > 0 ? `+${row.relPlusMinusRatio}` : row.relPlusMinusRatio || 'E'} highlight={row.relPlusMinusRatio > 0 ? 'pos' : row.relPlusMinusRatio < 0 ? 'neg' : undefined} />
                      <Cell value={row.rapm} bold highlight={row.rapm > 0 ? 'pos' : row.rapm < 0 ? 'neg' : undefined} />
                      <Cell value={`${row.epr}%`} highlight={row.epr < 40 ? 'pos' : row.epr > 55 ? 'neg' : undefined} />
                      <Cell value={`${row.fEpr}%`} highlight={row.fEpr > 55 ? 'pos' : undefined} />
                      <Cell value={row.bva > 0 ? `+${row.bva}` : row.bva || '0'} bold highlight={row.bva > 0 ? 'pos' : row.bva < 0 ? 'neg' : undefined} />
                    </>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <StatsPaginationFooter
        itemCount={data.length}
        itemName={tab === 'pairs' ? 'pairs' : tab === 'team' ? 'teams' : 'beaters'}
        page={page}
        totalPages={totalPages}
        setPage={setPage}
      />
    </div>
  );
}
