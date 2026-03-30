import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { computeSeekerStats, SeekerStats } from '../lib/statsComputations';

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
      return dir === 'asc' ? Number(va) - Number(vb) : Number(vb) - Number(va);
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
        active ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600')}
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

function Cell({ value, highlight, bold }: { value: string | number; highlight?: 'pos' | 'neg' | 'gold'; bold?: boolean }) {
  return (
    <td className={cn('px-2 py-1.5 text-center text-xs tabular-nums font-mono',
        highlight === 'pos' && 'text-green-600',
        highlight === 'neg' && 'text-red-500',
        highlight === 'gold' && 'text-amber-600',
        !highlight && 'text-gray-700',
        bold && 'font-bold')}>
      {value}
    </td>
  );
}

function formatMinutes(min: number): string {
  if (min <= 0) return '—';
  return `${min.toFixed(1)}`;
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface SeekerStatsViewProps {
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
  onPlayerSelect?: (playerId: string) => void;
}

export default function SeekerStatsView({ 
  players, events, teams, games, seasons, statsFilter = 'all',
  seasonId: seasonFilter = '', onSeasonChange: setSeasonFilter,
  teamId: teamFilter = '', onTeamChange: setTeamFilter,
  search = '', onSearchChange: setSearch,
  onPlayerSelect
}: SeekerStatsViewProps) {
  const [minGames, setMinGames] = useState(1);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('catches');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const perPage = 25;

  useEffect(() => { setPage(1); }, [seasonFilter, teamFilter, minGames]);

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

  const filters = useMemo(() => ({ seasonId: seasonFilter || undefined, teamId: teamFilter || undefined }), [seasonFilter, teamFilter]);

  const seekerStats = useMemo(
    () => computeSeekerStats(events, players, games, filters),
    [events, players, games, filters]
  );

  const filtered = useMemo(() => {
    let d = seekerStats.filter(s => s.gamesPlayed >= minGames);
    if (search) { const q = search.toLowerCase(); d = d.filter(s => s.playerName.toLowerCase().includes(q)); }
    return sortBy(d, sortKey as keyof SeekerStats, sortDir);
  }, [seekerStats, search, minGames, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const totalCatches = seekerStats.reduce((s, p) => s + p.catches, 0);
  const totalGWC = seekerStats.reduce((s, p) => s + p.gameWinningCatches, 0);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-gray-900">Seekers</h2>
          <div className="flex text-xs text-gray-400 gap-3 font-mono">
            <span>{seekerStats.length} seekers</span>
            <span>{totalCatches} CTH</span>
            <span>{totalGWC} GWC</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={seasonFilter} onChange={e => setSeasonFilter?.(e.target.value)}
            className="pl-2 pr-1 py-1 bg-white border border-gray-200 rounded-md text-xs outline-none focus:border-amber-400 cursor-pointer">
            <option value="">All Seasons</option>
            {filteredSeasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={teamFilter} onChange={e => setTeamFilter?.(e.target.value)}
            className="pl-2 pr-1 py-1 bg-white border border-gray-200 rounded-md text-xs outline-none focus:border-amber-400 cursor-pointer">
            <option value="">All Teams</option>
            {filteredTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-md px-2 py-1">
            <span className="text-xs text-gray-500 font-medium">Min GP:</span>
            <input type="number" min="0" value={minGames || ''} onChange={e => setMinGames(parseInt(e.target.value) || 0)}
              className="w-12 p-1 bg-white border-transparent rounded text-xs outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 -my-1" />
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch?.(e.target.value)}
              className="pl-6 pr-2 py-1 bg-white border border-gray-200 rounded-md text-xs outline-none focus:border-amber-400 w-32" />
          </div>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-gray-400 sticky left-0 bg-gray-50 z-10 min-w-[140px]">Seeker</th>
                <SortHeader label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played (as Seeker)" />
                <SortHeader label="CTH" sortKey="catches" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Flag Catches" />
                <SortHeader label="OpCTH" sortKey="opponentCatches" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Opponent Catches While On Pitch" />
                <SortHeader label="C%" sortKey="catchPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Catch %" />
                <SortHeader label="MIN/G" sortKey="avgMinPerGame" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Avg Minutes Per Game as Seeker" />
                <SortHeader label="AVG CTH" sortKey="avgTimeToCatch" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Avg Time to Catch (from flag release)" />
                <SortHeader label="CTRL%" sortKey="controlPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Team Bludger Control % While Seeking" />
                <SortHeader label="DIFF" sortKey="avgPointDiff" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Avg Point Diff at Catch" />
                <SortHeader label="GWC" sortKey="gameWinningCatches" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Game Winning Catches" />
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={10} className="py-8 text-center text-gray-400 text-xs">No seeker stats found</td></tr>
              ) : paged.map((row, idx) => {
                const rank = (page - 1) * perPage + idx + 1;
                return (
                  <tr key={row.playerId} className="border-b border-gray-50 hover:bg-amber-50/30 transition-colors">
                    <td className="px-2 py-1.5 sticky left-0 bg-white z-10">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-300 w-4 text-right font-mono">{rank}</span>
                        <button onClick={() => onPlayerSelect?.(row.playerId)} className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline truncate">
                          {row.firstName} {row.lastName}
                        </button>
                      </div>
                    </td>
                    <Cell value={row.gamesPlayed} />
                    <Cell value={row.catches} highlight={row.catches > 0 ? 'gold' : undefined} bold />
                    <Cell value={row.opponentCatches} highlight={row.opponentCatches > 0 ? 'neg' : undefined} />
                    <Cell value={`${row.catchPct}%`} highlight={row.catchPct >= 60 ? 'pos' : row.catchPct <= 30 ? 'neg' : undefined} bold />
                    <Cell value={formatMinutes(row.avgMinPerGame)} />
                    <Cell value={formatTime(row.avgTimeToCatch)} />
                    <Cell value={`${row.controlPct}%`} highlight={row.controlPct >= 60 ? 'pos' : row.controlPct <= 30 ? 'neg' : undefined} />
                    <Cell value={row.avgPointDiff > 0 ? `+${row.avgPointDiff}` : row.avgPointDiff || '—'} highlight={row.avgPointDiff > 0 ? 'pos' : row.avgPointDiff < 0 ? 'neg' : undefined} />
                    <Cell value={row.gameWinningCatches} highlight={row.gameWinningCatches > 0 ? 'gold' : undefined} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span>{filtered.length} seekers • CTH = catches • OpCTH = opp. catches while on pitch • AVG CTH = avg time to catch • CTRL% = bludger control while seeking</span>
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
