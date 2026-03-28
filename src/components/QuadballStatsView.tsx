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
  computeAdvancedStats, computeExtendedStats, computeTeamQuadballStats,
  AdvancedPlayerStats, ExtendedPlayerStats, TeamQuadballStats 
} from '../lib/statsComputations';

interface Player { id: string; firstName: string; lastName: string; preferredName?: string; nickname?: string; [k: string]: any; }
interface GameEvent { id: string; videoId: string; gameId: string; type: string; videoTime: number; gameTime?: number; status: string; playerId?: string; teamId?: string; [k: string]: any; }
interface Team { id: string; name: string; [k: string]: any; }
interface Game { id: string; seasonId: string; homeTeamId: string; awayTeamId: string; [k: string]: any; }
interface Season { id: string; name: string; [k: string]: any; }

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

type SortDir = 'asc' | 'desc';

function sortBy<T>(arr: T[], key: keyof T, dir: SortDir): T[] {
  return [...arr].sort((a, b) => {
    const va = a[key] ?? 0;
    const vb = b[key] ?? 0;
    
    // Numeric sorting fallback if both values are numbers or successfully parse to numbers (and isn't empty string)
    if (
      (typeof va === 'number' || typeof va === 'string') &&
      (typeof vb === 'number' || typeof vb === 'string') &&
      va !== '' && vb !== '' &&
      !isNaN(Number(va)) && !isNaN(Number(vb))
    ) {
      const numA = Number(va);
      const numB = Number(vb);
      return dir === 'asc' ? numA - numB : numB - numA;
    }
    
    return dir === 'asc' 
      ? String(va).localeCompare(String(vb)) 
      : String(vb).localeCompare(String(va));
  });
}

function SortHeader({ label, sortKey, currentSort, currentDir, onSort, tooltip }: {
  label: string; sortKey: string; currentSort: string; currentDir: SortDir;
  onSort: (k: string) => void; tooltip?: string;
}) {
  const active = currentSort === sortKey;
  return (
    <th className={cn('px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap text-center',
        active ? 'text-red-600' : 'text-gray-400 hover:text-gray-600')}
      onClick={() => onSort(sortKey)} title={tooltip}>
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active && (currentDir === 'asc'
          ? <ChevronUp className="w-3 h-3" />
          : <ChevronDown className="w-3 h-3" />)}
      </span>
    </th>
  );
}

function Cell({ value, highlight, bold }: { value: string | number; highlight?: 'pos' | 'neg'; bold?: boolean }) {
  return (
    <td className={cn('px-2 py-1.5 text-center text-xs tabular-nums font-mono',
        highlight === 'pos' && 'text-green-600',
        highlight === 'neg' && 'text-red-500',
        !highlight && 'text-gray-700',
        bold && 'font-bold')}>
      {typeof value === 'number' && value === Infinity ? '∞' : value}
    </td>
  );
}

interface QuadballStatsViewProps {
  players: Player[];
  events: GameEvent[];
  teams: Team[];
  games: Game[];
  seasons: Season[];
  statsFilter?: 'all' | 'verified' | 'legacy';
  seasonId?: string;
  onSeasonChange?: (val: string) => void;
  teamId?: string;
  onTeamChange?: (val: string) => void;
  search?: string;
  onSearchChange?: (val: string) => void;
}

export default function QuadballStatsView({ 
  players, events, teams, games, seasons, statsFilter = 'all',
  seasonId: seasonFilter = '', onSeasonChange: setSeasonFilter,
  teamId: teamFilter = '', onTeamChange: setTeamFilter,
  search = '', onSearchChange: setSearch
}: QuadballStatsViewProps) {
  const [tab, setTab] = useState<'basic' | 'advanced' | 'teamPlayers' | 'team'>('basic');
  const [positionFilter, setPositionFilter] = useState<'all' | 'chaser' | 'keeper'>('all');
  const [minGames, setMinGames] = useState(1);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('points');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showHelp, setShowHelp] = useState(false);
  const perPage = 25;

  useEffect(() => { setPage(1); }, [search, seasonFilter, teamFilter, positionFilter, minGames]);

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

  const filters = useMemo(() => ({
    seasonId: seasonFilter || undefined,
    teamId: teamFilter || undefined,
    position: positionFilter === 'all' ? undefined : positionFilter,
  }), [seasonFilter, teamFilter, positionFilter]);

  const advancedStats = useMemo(() => computeAdvancedStats(events, players, games, filters), [events, players, games, filters]);
  const extendedStats = useMemo(() => computeExtendedStats(events, players, games, filters), [events, players, games, filters]);
  const teamStats = useMemo(() => computeTeamQuadballStats(events, players, teams, games, filters), [events, players, teams, games, filters]);

  const validQuadballPlayerIds = useMemo(() => {
    const explicitPositions = new Map<string, Set<string>>();
    for (const e of events) {
      if (e.playerId && e.position) {
        if (!explicitPositions.has(e.playerId)) explicitPositions.set(e.playerId, new Set());
        explicitPositions.get(e.playerId)!.add(e.position);
      }
      if (e.type === 'goal' || e.type === 'assist' || e.type === 'shot') {
        if (e.playerId) {
          if (!explicitPositions.has(e.playerId)) explicitPositions.set(e.playerId, new Set());
          explicitPositions.get(e.playerId)!.add('chaser');
        }
      }
    }
    const validIds = new Set<string>();
    players.forEach(p => {
      const poss = explicitPositions.get(p.id);
      if (!poss) validIds.add(p.id);
      else if (poss.has('chaser') || poss.has('keeper')) validIds.add(p.id);
    });
    return validIds;
  }, [events, players]);

  const filteredAdvanced = useMemo(() => {
    let d = advancedStats.filter(s => s.gamesPlayed >= minGames && validQuadballPlayerIds.has(s.playerId));
    if (search) { const q = search.toLowerCase(); d = d.filter(s => s.playerName.toLowerCase().includes(q)); }
    return sortBy(d, sortKey as keyof AdvancedPlayerStats, sortDir);
  }, [advancedStats, search, minGames, sortKey, sortDir, validQuadballPlayerIds]);

  const filteredTeamPlayers = useMemo(() => {
    let d = extendedStats.filter(s => s.gamesPlayed >= minGames && validQuadballPlayerIds.has(s.playerId));
    if (search) { const q = search.toLowerCase(); d = d.filter(s => s.playerName.toLowerCase().includes(q)); }
    return sortBy(d, sortKey as keyof ExtendedPlayerStats, sortDir);
  }, [extendedStats, search, minGames, sortKey, sortDir, validQuadballPlayerIds]);

  const filteredTeam = useMemo(() => {
    let d = teamStats.filter(s => s.gamesPlayed >= minGames);
    if (search) { const q = search.toLowerCase(); d = d.filter(s => s.teamName.toLowerCase().includes(q)); }
    return sortBy(d, sortKey as keyof TeamQuadballStats, sortDir);
  }, [teamStats, search, minGames, sortKey, sortDir]);

  const data = tab === 'team' ? filteredTeam : tab === 'teamPlayers' ? filteredTeamPlayers : filteredAdvanced;
  const totalPages = Math.ceil(data.length / perPage) || 1;
  const paged = data.slice((page - 1) * perPage, page * perPage);

  const totalG = advancedStats.reduce((s, p) => s + p.goals, 0);
  const totalA = advancedStats.reduce((s, p) => s + p.assists, 0);

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-gray-900">Quadball</h2>
          <div className="flex text-xs text-gray-400 gap-3 font-mono">
            {tab === 'team' ? (
              <span>{teamStats.length} teams</span>
            ) : (
              <span>{advancedStats.length} players</span>
            )}
            <span>{totalG}G</span>
            <span>{totalA}A</span>
            <span>{totalG * 10}PTS</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="flex border border-gray-200 rounded-md overflow-hidden text-xs">
            <button onClick={() => { setTab('basic'); setSortKey('points'); setSortDir('desc'); }}
              className={cn('px-3 py-1 font-medium transition-colors', tab === 'basic' ? 'bg-red-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50')}>
              Basic
            </button>
            <button onClick={() => { setTab('advanced'); setSortKey('plusMinus'); setSortDir('desc'); }}
              className={cn('px-3 py-1 font-medium transition-colors border-l border-gray-200', tab === 'advanced' ? 'bg-red-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50')}>
              Advanced
            </button>
            <button onClick={() => { setTab('teamPlayers'); setSortKey('gameScore'); setSortDir('desc'); }}
              className={cn('px-3 py-1 font-medium transition-colors border-l border-gray-200', tab === 'teamPlayers' ? 'bg-red-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50')}>
              Team (Indiv)
            </button>
            <button onClick={() => { setTab('team'); setSortKey('netRtg'); setSortDir('desc'); }}
              className={cn('px-3 py-1 font-medium transition-colors border-l border-gray-200', tab === 'team' ? 'bg-red-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50')}>
              Team
            </button>
          </div>
          <button onClick={() => setShowHelp(!showHelp)} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors ml-1 bg-white border border-gray-200 rounded-md" title="How stats are calculated">
            <Info className="w-4 h-4" />
          </button>

          <select value={seasonFilter} onChange={e => setSeasonFilter?.(e.target.value)}
            className="pl-2 pr-1 py-1 bg-white border border-gray-200 rounded-md text-xs outline-none focus:border-red-400 cursor-pointer">
            <option value="">All Seasons</option>
            {filteredSeasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={teamFilter} onChange={e => setTeamFilter?.(e.target.value)}
            className="pl-2 pr-1 py-1 bg-white border border-gray-200 rounded-md text-xs outline-none focus:border-red-400 cursor-pointer">
            <option value="">All Teams</option>
            {filteredTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={positionFilter} onChange={e => setPositionFilter(e.target.value as any)}
            className="pl-2 pr-1 py-1 bg-white border border-gray-200 rounded-md text-xs outline-none focus:border-red-400 cursor-pointer">
            <option value="all">All Positions</option>
            <option value="chaser">Chaser Only</option>
            <option value="keeper">Keeper Only</option>
          </select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch?.(e.target.value)}
              className="pl-6 pr-2 py-1 bg-white border border-gray-200 rounded-md text-xs outline-none focus:border-red-400 w-32" />
          </div>
          <input type="number" min="0" value={minGames || ''} onChange={e => setMinGames(parseInt(e.target.value) || 0)}
            className="w-16 p-1 bg-white border border-gray-200 rounded text-[10px] outline-none focus:border-red-400" />
        </div>
      </div>

      {/* Help Panel */}
      {showHelp && (
        <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-900 space-y-2">
          <p className="font-semibold">How Advanced Stats are Calculated</p>
          <ul className="list-disc pl-4 space-y-1 opacity-90">
            <li><strong>Possessions</strong> are inferred dynamically. Since "OFFENSE" tags are unreliable, a team possession ends when a Goal, Shot (Miss), or Turnover occurs while a player is on the field.</li>
            <li><strong>USG% (Usage Rate)</strong> estimates the percentage of team possessions a player is directly involved in (Goals + Assists + Shots + Turnovers / Team Possessions).</li>
            <li><strong>ORTG (Offensive Rating)</strong>: Points produced per 100 offensive possessions while on the field.</li>
            <li><strong>DRTG (Defensive Rating)</strong>: Opponent goals conceded per 100 defensive possessions while on the field.</li>
            <li><strong>+ (Plus) and − (Minus)</strong> track goals scored and conceded while the player is actively on the field.</li>
          </ul>
        </div>
      )}

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-gray-400 sticky left-0 bg-gray-50 z-10 min-w-[140px]">
                  {tab === 'team' ? 'Team' : 'Player'}
                </th>
                {tab === 'basic' ? (<>
                  <SortHeader label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                  <SortHeader label="MIN" sortKey="minutesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minutes Played" />
                  <SortHeader label="S" sortKey="shots" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Shots (total attempts)" />
                  <SortHeader label="G" sortKey="goals" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals" />
                  <SortHeader label="A" sortKey="assists" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists" />
                  <SortHeader label="TO" sortKey="turnovers" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Turnovers" />
                  <SortHeader label="A:TO" sortKey="assistToTurnover" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assist to Turnover Ratio" />
                  <SortHeader label="S%" sortKey="shotPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Shooting %" />
                  <SortHeader label="CTRL%" sortKey="controlPctOnField" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Team Bludger Control % While On Field" />
                </>) : tab === 'advanced' ? (<>
                  <SortHeader label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                  <SortHeader label="G" sortKey="goals" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals" />
                  <SortHeader label="A" sortKey="assists" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists" />
                  <SortHeader label="MIN" sortKey="minutesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minutes Played" />
                  <SortHeader label="+" sortKey="plus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals scored while on field" />
                  <SortHeader label="−" sortKey="minus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals conceded while on field" />
                  <SortHeader label="+/−" sortKey="plusMinus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Plus / Minus (Net differntial)" />
                  <SortHeader label="+:−" sortKey="plusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Ratio of Plus to Minus" />
                  <SortHeader label="Off+:−" sortKey="offPlusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Ratio of Plus to Minus while player is off the field" />
                  <SortHeader label="REL +:−" sortKey="relPlusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Relative Value (Your +:− Ratio vs. your team's when you are off)" />
                  <SortHeader label="G/20" sortKey="goalsPerTwenty" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals per 20 Min" />
                  <SortHeader label="A/20" sortKey="assistsPerTwenty" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists per 20 Min" />
                  <SortHeader label="PTS/20" sortKey="pointsPerTwenty" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Points per 20 Min" />
                  <SortHeader label="G/G" sortKey="goalsPerGame" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals per Game" />
                  <SortHeader label="A/G" sortKey="assistsPerGame" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists per Game" />
                  <SortHeader label="PTS/G" sortKey="pointsPerGame" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Points per Game" />
                </>) : tab === 'teamPlayers' ? (<>
                  <SortHeader label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                  <SortHeader label="ORTG" sortKey="oRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Offensive Rating (Points produced per 100 offensive possessions)" />
                  <SortHeader label="DRTG" sortKey="dRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Defensive Rating (Opponent points conceded per 100 defensive possessions)" />
                  <SortHeader label="NET" sortKey="netRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Net Rating (ORTG - DRTG)" />
                  <SortHeader label="TOV%" sortKey="tovPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Team Turnover Rate (Team Turnovers per possession while on field)" />
                  <SortHeader label="FTOV%" sortKey="fTovPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Forced Turnover Rate (Opponent Turnovers per possession while on field)" />
                  <SortHeader label="MIN" sortKey="minutesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minutes Played" />
                  <SortHeader label="USG%" sortKey="usgPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Usage Rate (Estimates % of team possessions player is involved in while on field)" />
                  <SortHeader label="GmSc" sortKey="gameScore" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Game Score (Composite single-number rating of productivity)" />
                  <SortHeader label="TO/20" sortKey="turnoversPer20" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Individual Turnovers per 20 Min" />
                </>) : (<>
                  <SortHeader label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                  <SortHeader label="G" sortKey="goals" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals" />
                  <SortHeader label="A" sortKey="assists" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists" />
                  <SortHeader label="S" sortKey="shots" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Shots" />
                  <SortHeader label="TO" sortKey="turnovers" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Turnovers" />
                  <SortHeader label="G/G" sortKey="goalsPerGame" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals per Game" />
                  <SortHeader label="A/G" sortKey="assistsPerGame" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists per Game" />
                  <SortHeader label="PTS/G" sortKey="pointsPerGame" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Points per Game" />
                  <SortHeader label="ORTG" sortKey="oRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Offensive Rating" />
                  <SortHeader label="DRTG" sortKey="dRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Defensive Rating" />
                  <SortHeader label="NET" sortKey="netRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Net Rating" />
                  <SortHeader label="TOV%" sortKey="tovPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Turnover Rate" />
                  <SortHeader label="FTOV%" sortKey="fTovPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Forced Turnover Rate" />
                </>)}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={12} className="py-8 text-center text-gray-400 text-xs">No stats found</td></tr>
              ) : paged.map((row: any, idx) => {
                const rank = (page - 1) * perPage + idx + 1;
                return (
                  <tr key={tab === 'team' ? row.teamId : row.playerId} className="border-b border-gray-50 hover:bg-red-50/30 transition-colors">
                    <td className="px-2 py-1.5 sticky left-0 bg-white z-10 group-hover:bg-red-50/30">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-300 w-4 text-right font-mono">{rank}</span>
                        <span className="text-xs font-medium text-gray-800 truncate">
                          {tab === 'team' ? row.teamName : `${row.firstName} ${row.lastName}`}
                        </span>
                      </div>
                    </td>
                    {tab === 'basic' ? (<>
                      <Cell value={row.gamesPlayed} />
                      <Cell value={row.minutesPlayed} />
                      <Cell value={row.shots} highlight={row.shots > 5 ? 'pos' : undefined} />
                      <Cell value={row.goals} bold highlight={row.goals > 0 ? 'pos' : undefined} />
                      <Cell value={row.assists} bold highlight={row.assists > 0 ? 'pos' : undefined} />
                      <Cell value={row.turnovers} highlight={row.turnovers > 3 ? 'neg' : undefined} />
                      <Cell value={row.turnovers > 0 ? (Math.round((row.assists / row.turnovers) * 100) / 100) : row.assists > 0 ? '∞' : 0} highlight={row.turnovers > 0 && row.assists / row.turnovers >= 2 ? 'pos' : undefined} />
                      <Cell value={`${(row.goals + row.shots) > 0 ? Math.round((row.goals / (row.goals + row.shots)) * 1000) / 10 : 0}%`} highlight={(row.goals + row.shots) > 0 && (row.goals / (row.goals + row.shots)) >= 0.5 ? 'pos' : undefined} />
                      <Cell value={`${row.controlPctOnField}%`} highlight={row.controlPctOnField >= 55 ? 'pos' : row.controlPctOnField <= 45 ? 'neg' : undefined} />
                    </>) : tab === 'advanced' ? (<>
                      <Cell value={row.gamesPlayed} />
                      <Cell value={row.goals} />
                      <Cell value={row.assists} />
                      <Cell value={row.minutesPlayed} />
                      <Cell value={row.plus} highlight={row.plus > 0 ? 'pos' : undefined} />
                      <Cell value={row.minus} highlight={row.minus > 0 ? 'neg' : undefined} />
                      <Cell value={row.plusMinus > 0 ? `+${row.plusMinus}` : row.plusMinus || 'E'} highlight={row.plusMinus > 0 ? 'pos' : row.plusMinus < 0 ? 'neg' : undefined} bold />
                      <Cell value={row.plusMinusRatio === Infinity ? '∞' : row.plusMinusRatio} />
                      <Cell value={row.offPlusMinusRatio === Infinity ? '∞' : row.offPlusMinusRatio} />
                      <Cell value={row.relPlusMinusRatio > 0 ? `+${row.relPlusMinusRatio}` : row.relPlusMinusRatio || 'E'} highlight={row.relPlusMinusRatio > 0 ? 'pos' : row.relPlusMinusRatio < 0 ? 'neg' : undefined} />
                      <Cell value={row.goalsPerTwenty} highlight={row.goalsPerTwenty > 0 ? 'pos' : undefined} />
                      <Cell value={row.assistsPerTwenty} highlight={row.assistsPerTwenty > 0 ? 'pos' : undefined} />
                      <Cell value={row.pointsPerTwenty} highlight={row.pointsPerTwenty > 0 ? 'pos' : undefined} />
                      <Cell value={row.goalsPerGame} highlight={row.goalsPerGame > 0 ? 'pos' : undefined} />
                      <Cell value={row.assistsPerGame} highlight={row.assistsPerGame > 0 ? 'pos' : undefined} />
                      <Cell value={row.pointsPerGame} highlight={row.pointsPerGame > 0 ? 'pos' : undefined} />
                    </>) : tab === 'teamPlayers' ? (<>
                      <Cell value={row.gamesPlayed} />
                      <Cell value={row.oRtg} highlight={row.oRtg > 0 ? 'pos' : undefined} />
                      <Cell value={row.dRtg} highlight={row.dRtg > 0 ? 'neg' : undefined} />
                      <Cell value={row.netRtg > 0 ? `+${row.netRtg}` : row.netRtg || 'E'} highlight={row.netRtg > 0 ? 'pos' : row.netRtg < 0 ? 'neg' : undefined} bold />
                      <Cell value={`${row.tovPct}%`} highlight={row.tovPct >= 20 ? 'neg' : undefined} />
                      <Cell value={`${row.fTovPct}%`} highlight={row.fTovPct >= 20 ? 'pos' : undefined} />
                      <Cell value={row.minutesPlayed} />
                      <Cell value={`${row.usgPct}%`} />
                      <Cell value={row.gameScore} highlight={row.gameScore > 0 ? 'pos' : row.gameScore < 0 ? 'neg' : undefined} bold />
                      <Cell value={row.turnoversPer20} highlight={row.turnoversPer20 > 0 ? 'neg' : undefined} />
                    </>) : (<>
                      <Cell value={row.gamesPlayed} />
                      <Cell value={row.goals} bold highlight={row.goals > 0 ? 'pos' : undefined} />
                      <Cell value={row.assists} bold highlight={row.assists > 0 ? 'pos' : undefined} />
                      <Cell value={row.shots} />
                      <Cell value={row.turnovers} highlight={row.turnovers > 3 ? 'neg' : undefined} />
                      <Cell value={row.goalsPerGame} highlight={row.goalsPerGame > 0 ? 'pos' : undefined} />
                      <Cell value={row.assistsPerGame} highlight={row.assistsPerGame > 0 ? 'pos' : undefined} />
                      <Cell value={row.pointsPerGame} highlight={row.pointsPerGame > 0 ? 'pos' : undefined} />
                      <Cell value={row.oRtg} highlight={row.oRtg > 0 ? 'pos' : undefined} />
                      <Cell value={row.dRtg} highlight={row.dRtg > 0 ? 'neg' : undefined} />
                      <Cell value={row.netRtg > 0 ? `+${row.netRtg}` : row.netRtg || 'E'} highlight={row.netRtg > 0 ? 'pos' : row.netRtg < 0 ? 'neg' : undefined} bold />
                      <Cell value={`${row.tovPct}%`} highlight={row.tovPct >= 20 ? 'neg' : undefined} />
                      <Cell value={`${row.fTovPct}%`} highlight={row.fTovPct >= 20 ? 'pos' : undefined} />
                    </>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span>{data.length} players • S = shots (total) • G = goals • A = assists • TO = turnovers • A:TO = assist/turnover • S% = shooting %</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="p-1 rounded disabled:opacity-30 hover:bg-gray-100"><ChevronLeft className="w-3 h-3" /></button>
          <span className="px-2 font-mono">{page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="p-1 rounded disabled:opacity-30 hover:bg-gray-100"><ChevronRight className="w-3 h-3" /></button>
        </div>
      </div>
    </div>
  );
}
