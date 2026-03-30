import React, { useState, useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { computeTeamQuadballStats, getScoreboardName } from '../lib/statsComputations';

interface Player { id: string; firstName: string; lastName: string; [k: string]: any; }
interface GameEvent { id: string; videoId: string; gameId: string; type: string; videoTime: number; status: string; playerId?: string; teamId?: string; [k: string]: any; }
interface Team { id: string; name: string; [k: string]: any; }
interface Game { id: string; seasonId: string; homeTeamId: string; awayTeamId: string; [k: string]: any; createdAt: any; }
interface Season { id: string; name: string; description?: string; year?: string; league?: string; [k: string]: any; }

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

type SortDir = 'asc' | 'desc';

function sortData<T extends Record<string, any>>(data: T[], key: string, dir: SortDir): T[] {
  return [...data].sort((a, b) => {
    const va = a[key] ?? 0;
    const vb = b[key] ?? 0;
    if ((typeof va === 'number' || typeof va === 'string') && (typeof vb === 'number' || typeof vb === 'string') && va !== '' && vb !== '' && !isNaN(Number(va)) && !isNaN(Number(vb))) {
      return dir === 'asc' ? Number(va) - Number(vb) : Number(vb) - Number(va);
    }
    return dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });
}

function SortHeader({ label, sortKey, currentSort, currentDir, onSort }: any) {
  const active = currentSort === sortKey;
  return (
    <th className={cn('px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap text-center', active ? 'text-emerald-500' : 'text-gray-400 hover:text-gray-600')} onClick={() => onSort(sortKey)}>
      <span className="inline-flex items-center gap-0.5">{label}</span>
      {active && <span className="text-[10px] ml-1">{currentDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

function Cell({ value, highlight, bold }: any) {
  return (
    <td className={cn('px-2 py-1.5 text-center text-xs tabular-nums font-mono', highlight === 'pos' && 'text-green-600', highlight === 'neg' && 'text-red-500', !highlight && 'text-gray-700', bold && 'font-bold')}>
      {typeof value === 'number' && value === Infinity ? '∞' : value}
    </td>
  );
}

export default function TeamProfileView({
  players, events, games, seasons, teams, activeTeamId,
  onBack, onPlayerSelect, onGameSelect
}: {
  players: Player[]; events: GameEvent[]; games: Game[]; seasons: Season[]; teams: Team[];
  activeTeamId: string; onBack: () => void;
  onPlayerSelect?: (id: string) => void; onGameSelect?: (id: string) => void;
}) {
  const team = teams.find(t => t.id === activeTeamId);
  const { playedGames, validSeasons } = useMemo(() => {
    const played = games.filter(g => g.homeTeamId === activeTeamId || g.awayTeamId === activeTeamId)
                        .sort((a,b) => {
                          const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : 0);
                          const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : 0);
                          return timeB - timeA;
                        });
    const pSeasons = Array.from(new Set(played.map(g => g.seasonId))).map(sid => seasons.find(s => s.id === sid)).filter(Boolean) as Season[];
    pSeasons.sort((a,b) => (b.description || b.name).localeCompare(a.description || a.name));
    return { playedGames: played, validSeasons: pSeasons };
  }, [games, activeTeamId, seasons]);

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('auto');
  const activeSeasonId = selectedSeasonId === 'auto' ? (validSeasons[0]?.id || '') : selectedSeasonId;

  const [sortKey, setSortKey] = useState('gamesPlayed');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const perGameStats = useMemo(() => {
    if (activeSeasonId && activeSeasonId !== 'all') {
       const filteredGames = playedGames.filter(g => g.seasonId === activeSeasonId);
       return filteredGames.map(g => {
         const gEvents = events.filter(e => e.gameId === g.id);
         const stat = computeTeamQuadballStats(gEvents, players, teams, [g], {});
         const tStat = stat.find(st => st.teamId === activeTeamId);
         
         const opponent = g.homeTeamId === activeTeamId ? g.awayTeamId : g.homeTeamId;
         const oppName = getScoreboardName?.(teams.find(t => t.id === opponent)) || teams.find(t => t.id === opponent)?.name || 'Unknown';

         if (tStat) {
           return {
             ...tStat,
             gameId: g.id,
             opponent: oppName
           };
         }
         return null;
       }).filter(s => s?.gamesPlayed > 0);
    }
    return [];
  }, [playedGames, activeSeasonId, events, players, teams, activeTeamId]);

  const sortedPerGame = useMemo(() => sortData(perGameStats as any[], sortKey, sortDir), [perGameStats, sortKey, sortDir]);

  const seasonAverages = useMemo(() => {
    const leagues: Record<string, any[]> = {};
    validSeasons.forEach(s => {
      const sGames = playedGames.filter(g => g.seasonId === s.id);
      const sEvents = events.filter(e => sGames.some(g => g.id === e.gameId));
      const stat = computeTeamQuadballStats(sEvents, players, teams, sGames, {});
      const tStat = stat.find(st => st.teamId === activeTeamId);
      if (tStat && tStat.gamesPlayed > 0) {
        const l = s.league || 'Other';
        if (!leagues[l]) leagues[l] = [];
        leagues[l].push({ ...tStat, seasonLabel: s.description || s.name });
      }
    });

    Object.keys(leagues).forEach(k => {
      leagues[k] = leagues[k].sort((a,b) => b.gamesPlayed - a.gamesPlayed).slice(0, 10);
    });
    return leagues;
  }, [validSeasons, playedGames, events, players, teams, activeTeamId]);

  const careerTotal = useMemo(() => {
    if (playedGames.length === 0) return null;
    const cEvents = events.filter(e => playedGames.some(g => g.id === e.gameId));
    const stat = computeTeamQuadballStats(cEvents, players, teams, playedGames, {});
    const tStat = stat.find(st => st.teamId === activeTeamId);
    return tStat && tStat.gamesPlayed > 0 ? tStat : null;
  }, [playedGames, events, players, teams, activeTeamId]);

  const handleSort = (k: string) => {
    if (sortKey === k) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }
    else { setSortKey(k); setSortDir('desc'); }
  };

  if (!team) return <div>Team not found</div>;

  const renderTableHeader = () => (
    <tr className="border-b border-gray-100 bg-gray-50/80">
      <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-gray-400 sticky left-0 bg-gray-50 z-10 w-48">Event</th>
      <SortHeader label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
      <SortHeader label="GF" sortKey="goals" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
      <SortHeader label="GA" sortKey="goalsAgainst" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
      <SortHeader label="TO" sortKey="turnovers" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
      <SortHeader label="+/−" sortKey="plusMinus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
      <SortHeader label="ORTG" sortKey="oRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
      <SortHeader label="DRTG" sortKey="dRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
      <SortHeader label="NET" sortKey="netRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
      <SortHeader label="TOV%" sortKey="tovPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
    </tr>
  );

  const renderRow = (row: any, title: React.ReactNode, key: string) => (
    <tr key={key} className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
      <td className="px-2 py-1.5 sticky left-0 bg-white z-10 group-hover:bg-gray-50/30 text-xs font-medium text-gray-800 truncate">{title}</td>
      <Cell value={row.gamesPlayed} />
      <Cell value={row.goals} />
      <Cell value={row.goalsAgainst} />
      <Cell value={row.turnovers} />
      <Cell value={row.plusMinus} highlight={row.plusMinus > 0 ? 'pos' : row.plusMinus < 0 ? 'neg' : undefined} bold />
      <Cell value={row.oRtg} />
      <Cell value={row.dRtg} />
      <Cell value={row.netRtg} highlight={row.netRtg > 0 ? 'pos' : row.netRtg < 0 ? 'neg' : undefined} bold />
      <Cell value={row.tovPct} />
    </tr>
  );

  const renderAggHeader = renderTableHeader;
  const renderAggRow = renderRow;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-emerald-50 text-gray-500 hover:text-emerald-600 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 via-teal-700 to-emerald-800">
            {team.name}
          </h2>
          <p className="text-sm text-gray-400 capitalize flex gap-2">
            <span>{playedGames.length} Historic Games</span>
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Game Logs */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-between gap-4">
            <h3 className="font-bold text-gray-800">Game Logs</h3>
            <select
              value={activeSeasonId}
              onChange={e => setSelectedSeasonId(e.target.value)}
              className="bg-white border text-xs font-medium tracking-wide shadow-sm border-gray-200 text-gray-700 rounded-lg px-3 py-1.5 outline-none focus:border-emerald-500"
            >
              <option value="all">View All Championships...</option>
              {validSeasons.map(s => <option key={s.id} value={s.id}>{s.description || s.name}</option>)}
            </select>
          </div>
          
          <div className="p-0 overflow-x-auto flex-1 bg-white">
            {activeSeasonId === 'all' ? (
              <div className="p-10 text-center text-gray-400 text-sm flex items-center justify-center h-full">Select a single championship to view split game logs.</div>
            ) : sortedPerGame.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm flex items-center justify-center h-full">No recorded games.</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>{renderTableHeader()}</thead>
                <tbody>
                  {sortedPerGame.map(r => renderRow(r, (
                    <button onClick={() => onGameSelect?.(r.gameId)} className="text-emerald-600 hover:underline inline-flex text-left max-w-[150px] truncate font-bold">
                      vs {r.opponent || 'Opponent'}
                    </button>
                  ), r.gameId))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Career Averages */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-bold text-gray-800">Aggregated Historic Profile</h3>
          </div>
          <div className="p-0 overflow-x-auto flex-1 bg-white">
            {Object.keys(seasonAverages).length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm flex items-center justify-center h-full">No historical seasons.</div>
            ) : (
              <div className="">
                {careerTotal && (
                  <div className="mb-6">
                    <div className="bg-gray-800 font-bold px-4 py-2 text-white uppercase tracking-widest text-[10px] border-b border-gray-900 rounded-t-lg">
                      OVERALL MULTI-YEAR PROFILE (ALL LEAGUES)
                    </div>
                    <table className="w-full border-collapse border border-gray-200 rounded-b-lg">
                      <thead>{renderAggHeader()}</thead>
                      <tbody>
                        {renderAggRow(careerTotal, 'All Time', 'career')}
                      </tbody>
                    </table>
                  </div>
                )}

                {Object.entries(seasonAverages).map(([league, rows]) => (
                  <div key={league} className="mt-6 border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-emerald-50/60 font-bold px-4 py-2 text-emerald-800 uppercase tracking-widest text-[10px] border-b border-emerald-100">
                      {league} League
                    </div>
                    <table className="w-full border-collapse">
                      <thead>{renderAggHeader()}</thead>
                      <tbody>
                        {rows.map(r => renderAggRow(r, r.seasonLabel, r.seasonLabel))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
