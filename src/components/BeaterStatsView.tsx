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
  BeaterSoloStats,
  BeaterPairStats,
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
        !highlight && 'text-gray-700',
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
}

export default function BeaterStatsView({ players, events, teams, games, seasons }: BeaterStatsViewProps) {
  const [tab, setTab] = useState<'pairs' | 'solo'>('pairs');
  const [search, setSearch] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [minGames, setMinGames] = useState(1);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('plusMinus');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const perPage = 25;

  useEffect(() => { setPage(1); }, [search, seasonFilter, teamFilter, minGames, tab]);

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filters = useMemo(() => ({ seasonId: seasonFilter || undefined, teamId: teamFilter || undefined }), [seasonFilter, teamFilter]);

  const soloStats = useMemo(() => computeBeaterSoloStats(events, players, games, filters), [events, players, games, filters]);
  const pairStats = useMemo(() => computeBeaterPairStats(events, players, games, filters), [events, players, games, filters]);

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

  const data: any[] = tab === 'solo' ? filteredSolo : filteredPairs;
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
            <span>{soloStats.length} beaters</span>
            <span>{pairStats.length} pairs</span>
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
              className={cn('px-3 py-1 font-medium transition-colors', tab === 'solo' ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50')}>
              Solo
            </button>
          </div>
          <select value={seasonFilter} onChange={e => setSeasonFilter(e.target.value)}
            className="pl-2 pr-1 py-1 bg-white border border-gray-200 rounded-md text-xs outline-none focus:border-purple-400 cursor-pointer">
            <option value="">All Seasons</option>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
            className="pl-2 pr-1 py-1 bg-white border border-gray-200 rounded-md text-xs outline-none focus:border-purple-400 cursor-pointer">
            <option value="">All Teams</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-md px-2 py-1">
            <span className="text-xs text-gray-500 font-medium">Min GP:</span>
            <input type="number" min="1" value={minGames || ''} onChange={e => setMinGames(parseInt(e.target.value) || 0)}
              className="w-16 p-1 bg-white border border-gray-200 rounded text-[10px] outline-none focus:border-red-400" />
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              className="pl-6 pr-2 py-1 bg-white border border-gray-200 rounded-md text-xs outline-none focus:border-purple-400 w-32" />
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
                  {tab === 'pairs' ? 'Beater Pair' : 'Beater'}
                </th>
                <SortHeader label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                <SortHeader label="+" sortKey="plus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Plus" />
                <SortHeader label="−" sortKey="minus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minus" />
                <SortHeader label="+/−" sortKey="plusMinus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Plus / Minus" />
                <SortHeader label="CTRL" sortKey="controlMinutes" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Control Minutes" />
                <SortHeader label="TOT" sortKey="totalMinutes" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Total Minutes" />
                <SortHeader label="CTRL%" sortKey="controlPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Control % (Percentage of possession time team has active Dodgeball Control)" />
                <SortHeader label="+:−" sortKey="plusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Ratio of Plus to Minus" />
                <SortHeader label="Off+:−" sortKey="offPlusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Ratio of Plus to Minus while off the field" />
                <SortHeader label="On-Off" sortKey="onOffDt" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="On/Off Differential (PlusMinus - OffPlusMinus)" />
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={10} className="py-8 text-center text-gray-400 text-xs">No beater stats found</td></tr>
              ) : paged.map((row: any, idx: number) => {
                const rank = (page - 1) * perPage + idx + 1;
                return (
                  <tr key={tab === 'pairs' ? row.pairKey : row.playerId} className="border-b border-gray-50 hover:bg-purple-50/30 transition-colors">
                    <td className="px-2 py-1.5 sticky left-0 bg-white z-10">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-300 w-4 text-right font-mono">{rank}</span>
                        {tab === 'pairs' ? (
                          <span className="text-xs font-medium text-gray-800 truncate">
                            {row.player1Name} <span className="text-gray-300">&</span> {row.player2Name}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-gray-800 truncate">{row.firstName} {row.lastName}</span>
                        )}
                      </div>
                    </td>
                    <Cell value={row.gamesPlayed} />
                    <Cell value={row.plus} highlight={row.plus > 0 ? 'pos' : undefined} />
                    <Cell value={row.minus} highlight={row.minus > 0 ? 'neg' : undefined} />
                    <Cell value={row.plusMinus > 0 ? `+${row.plusMinus}` : row.plusMinus} highlight={row.plusMinus > 0 ? 'pos' : row.plusMinus < 0 ? 'neg' : undefined} bold />
                    <Cell value={row.controlMinutes} />
                    <Cell value={row.totalMinutes} />
                    <Cell value={`${row.controlPct}%`} highlight={row.controlPct >= 55 ? 'pos' : row.controlPct <= 45 ? 'neg' : undefined} bold />
                    <Cell value={row.plusMinusRatio === Infinity ? '∞' : row.plusMinusRatio} />
                    <Cell value={row.offPlusMinusRatio === Infinity ? '∞' : row.offPlusMinusRatio} />
                    <Cell value={row.onOffDt > 0 ? `+${row.onOffDt}` : row.onOffDt || 'E'} highlight={row.onOffDt > 0 ? 'pos' : row.onOffDt < 0 ? 'neg' : undefined} />
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
