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
interface Game { id: string; isVerified?: boolean; seasonId: string; homeTeamId: string; awayTeamId: string; [k: string]: any; }
interface Season { id: string; name: string; [k: string]: any; }

import { 
  cn, SortDir, sortBy, SortHeader, Cell, 
  StatsPaginationFooter 
} from './ui/StatsTable';

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
  statsFilter?: 'public' | 'full';
  teamIds?: string[];
  search?: string;
  minGames?: number;
  bludgerControlMode?: 'all' | 'separate';
  flagFilter?: 'all' | 'on' | 'off';
  onPlayerSelect?: (playerId: string) => void;
  // Player ids opted out of public stat pages (undefined for admins, who see everyone).
  hiddenPlayerIds?: Set<string>;
}

export default function SeekerStatsView({
  players, events, teams, games, seasons, statsFilter = 'public',
  teamIds: teamFilterIds = [], search = '',
  minGames = 1, bludgerControlMode = 'all', flagFilter = 'all',
  onPlayerSelect, hiddenPlayerIds
}: SeekerStatsViewProps) {
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('catches');
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
    statsFilter
  }), [teamFilterIds, bludgerControlMode, flagFilter, statsFilter]);

  const seekerStats = useMemo(
    () => computeSeekerStats(events, players, games, filters),
    [events, players, games, filters]
  );

  // Sorted (but not search-filtered) list establishes each player's ORIGINAL rank,
  // so a search doesn't renumber players relative to their un-searched standing.
  const sorted = useMemo(() => {
    const d = seekerStats.filter(s => s.gamesPlayed >= minGames && !hiddenPlayerIds?.has(s.playerId));
    return sortBy(d, sortKey as keyof SeekerStats, sortDir);
  }, [seekerStats, minGames, sortKey, sortDir, hiddenPlayerIds]);

  const rankMap = useMemo(() => new Map(sorted.map((s, i) => [s.playerId, i + 1])), [sorted]);

  const filtered = useMemo(() => {
    if (!search) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(s => s.playerName.toLowerCase().includes(q));
  }, [sorted, search]);

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
                <SortHeader label="AVG CTH" sortKey="avgTimeToCatch" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Avg Time to Catch (time on field)" />
                <SortHeader label="FROM REL" sortKey="avgTimeFromRelease" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Avg Time from Flag Release" />
                <SortHeader label="CTRL%" sortKey="controlPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Team Bludger Control % While Seeking" />
                <SortHeader label="DIFF" sortKey="avgPointDiff" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Avg Point Diff at Catch" />
                <SortHeader label="GWC" sortKey="gameWinningCatches" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Game Winning Catches" />
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={10} className="py-8 text-center text-gray-400 text-xs">No seeker stats found</td></tr>
              ) : paged.map((row) => {
                const rank = rankMap.get(row.playerId) ?? '-';
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
                    <Cell value={formatTime(row.avgTimeFromRelease)} />
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

      <StatsPaginationFooter
        itemCount={filtered.length}
        itemName="seekers"
        legend="CTH = catches • OpCTH = opp. catches while on pitch • AVG CTH = avg time to catch • FROM REL = avg time from release • CTRL% = bludger control while seeking"
        page={page}
        totalPages={totalPages}
        setPage={setPage}
      />
    </div>
  );
}
