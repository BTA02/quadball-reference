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

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

type SortDir = 'asc' | 'desc';

function sortBy<T>(arr: T[], key: keyof T, dir: SortDir): T[] {
  return [...arr].sort((a, b) => {
    const va = a[key] ?? 0;
    const vb = b[key] ?? 0;
    
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
        active ? 'text-purple-600' : 'text-gray-400 hover:text-gray-600')}
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
        !highlight && 'text-[#e2e8f0]',
        bold && 'font-bold')}>
      {value}
    </td>
  );
}

interface BeaterStatsViewProps {
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
  controlFilter?: 'all' | 'with' | 'without';
  flagFilter?: 'all' | 'on' | 'off';
  outlierFilter?: 'include' | 'exclude';
  onPlayerSelect?: (playerId: string) => void;
  onTeamSelect?: (teamId: string) => void;
}

export default function BeaterStatsView({ 
  players, events, teams, games, seasons, statsFilter = 'all',
  seasonId: seasonFilter = '', teamId: teamFilter = '', search = '',
  minGames = 1, controlFilter = 'all', flagFilter = 'all', outlierFilter = 'include',
  onPlayerSelect, onTeamSelect
}: BeaterStatsViewProps) {
  const [tab, setTab] = useState<'pairs' | 'solo' | 'team'>('pairs');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('plusMinus');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const perPage = 25;

  useEffect(() => { setPage(1); }, [search, seasonFilter, teamFilter, minGames, controlFilter, flagFilter, outlierFilter]);

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };
  
  const filteredSeasons = useMemo(() => {
    let sArr = [...seasons];
    if (statsFilter === 'all') {
      sArr = sArr.filter(sea => {
        const yearMatch = sea.name.match(/\d{4}/);
        return yearMatch ? parseInt(yearMatch[0]) > 2020 : true;
      });
    }
    return sArr.sort((a, b) => b.name.localeCompare(a.name));
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
    controlFilter: controlFilter === 'all' ? undefined : controlFilter,
    flagFilter: flagFilter === 'all' ? undefined : flagFilter,
    outlierFilter
  }), [seasonFilter, teamFilter, controlFilter, flagFilter, outlierFilter]);

  const soloStats = useMemo(() => computeBeaterSoloStats(events, players, games, filters), [events, players, games, filters]);
  const pairStats = useMemo(() => computeBeaterPairStats(events, players, games, filters), [events, players, games, filters]);
  const teamStats = useMemo(() => computeTeamBeaterStats(events, players, teams, games, filters), [events, players, teams, games, filters]);

  const filteredSolo = useMemo(() => {
    let d = soloStats.filter(s => s.gamesPlayed >= minGames);
    if (search) { const q = search.toLowerCase(); d = d.filter(s => s.playerName.toLowerCase().includes(q)); }
    return sortBy(d, sortKey as keyof BeaterSoloStats, sortDir);
  }, [soloStats, search, minGames, sortKey, sortDir]);

  const filteredPairs = useMemo(() => {
    let d = pairStats.filter(s => s.gamesPlayed >= minGames);
    if (search) { const q = search.toLowerCase(); d = d.filter(s => s.player1Name.toLowerCase().includes(q) || s.player2Name.toLowerCase().includes(q)); }
    return sortBy(d, sortKey as keyof BeaterPairStats, sortDir);
  }, [pairStats, search, minGames, sortKey, sortDir]);

  const filteredTeam = useMemo(() => {
    let d = teamStats.filter(s => s.gamesPlayed >= minGames);
    if (search) { const q = search.toLowerCase(); d = d.filter(s => s.teamName.toLowerCase().includes(q)); }
    return sortBy(d, sortKey as keyof TeamBeaterStats, sortDir);
  }, [teamStats, search, minGames, sortKey, sortDir]);

  const data: any[] = tab === 'team' ? filteredTeam : tab === 'solo' ? filteredSolo : filteredPairs;
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
          <div className="flex border border-gray-200 rounded-md overflow-hidden text-xs">
            <button onClick={() => { setTab('pairs'); setSortKey('plusMinus'); setSortDir('desc'); }}
              className={cn('px-3 py-1 font-medium transition-colors', tab === 'pairs' ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50')}>
              Pairs
            </button>
            <button onClick={() => { setTab('solo'); setSortKey('plusMinus'); setSortDir('desc'); }}
              className={cn('px-3 py-1 font-medium transition-colors border-l border-gray-200', tab === 'solo' ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50')}>
              Solo
            </button>
            <button onClick={() => { setTab('team'); setSortKey('controlPct'); setSortDir('desc'); }}
              className={cn('px-3 py-1 font-medium transition-colors border-l border-gray-200', tab === 'team' ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50')}>
              Team
            </button>
          </div>
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
                  <SortHeader label="CTRL" sortKey="controlMinutes" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Control Minutes" />
                  <SortHeader label="TOT" sortKey="totalMinutes" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Total Minutes" />
                  <SortHeader label="CTRL%" sortKey="controlPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Control % (Percentage of possession time team has active Dodgeball Control)" />
                  <SortHeader label="+:−" sortKey="plusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Ratio of Plus to Minus" />
                  <SortHeader label="Off+:−" sortKey="offPlusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Ratio of Plus to Minus while off the field" />
                  <SortHeader label="REL +:−" sortKey="relPlusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Relative Value (Your +:− Ratio vs. your team's when you are off)" />
                </>)}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={10} className="py-8 text-center text-gray-400 text-xs">No beater stats found</td></tr>
              ) : paged.map((row: any, idx: number) => {
                const rank = (page - 1) * perPage + idx + 1;
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
                      <Cell value={row.controlMinutes} />
                      <Cell value={row.totalMinutes} />
                      <Cell value={`${row.controlPct}%`} highlight={row.controlPct >= 55 ? 'pos' : row.controlPct <= 45 ? 'neg' : undefined} bold />
                      <Cell value={row.plusMinusRatio === Infinity ? '∞' : row.plusMinusRatio} />
                      <Cell value={row.offPlusMinusRatio === Infinity ? '∞' : row.offPlusMinusRatio} />
                      <Cell value={row.relPlusMinusRatio > 0 ? `+${row.relPlusMinusRatio}` : row.relPlusMinusRatio || 'E'} highlight={row.relPlusMinusRatio > 0 ? 'pos' : row.relPlusMinusRatio < 0 ? 'neg' : undefined} />
                    </>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span>{data.length} {tab === 'pairs' ? 'pairs' : 'beaters'}</span>
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
