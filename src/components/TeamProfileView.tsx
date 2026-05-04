import React, { useState, useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { computeTeamQuadballStats, getScoreboardName } from '../lib/statsComputations';

interface Player { id: string; firstName: string; lastName: string; [k: string]: any; }
interface GameEvent { id: string; videoId: string; gameId: string; type: string; videoTime: number; status: string; playerId?: string; teamId?: string; [k: string]: any; }
interface Team { id: string; name: string; nickname?: string; colorPrimary?: string; [k: string]: any; }
interface Game { id: string; isVerified?: boolean; seasonId: string; homeTeamId: string; awayTeamId: string; [k: string]: any; createdAt: any; }
interface Season { id: string; name: string; description?: string; year?: string; league?: string; [k: string]: any; }

import { 
  cn, SortDir, sortBy, SortHeader, Cell
} from './ui/StatsTable';

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
         const stat = computeTeamQuadballStats(gEvents, players, teams, [g], { teamId: activeTeamId });
         const tStat = stat.find(st => st.teamId === activeTeamId);
         
         const opponent = g.homeTeamId === activeTeamId ? g.awayTeamId : g.homeTeamId;
         const oppName = getScoreboardName?.(teams.find(t => t.id === opponent)) || teams.find(t => t.id === opponent)?.name || 'Unknown';

         if (tStat) {
           return {
             ...tStat,
             gameId: g.id,
             opponent: oppName,
             description: g.tag
           };
         }
         return null;
       }).filter(s => s?.gamesPlayed > 0);
    }
    return [];
  }, [playedGames, activeSeasonId, events, players, teams, activeTeamId]);

  const sortedPerGame = useMemo(() => sortBy(perGameStats as any[], sortKey, sortDir), [perGameStats, sortKey, sortDir]);

  const seasonAverages = useMemo(() => {
    const leagues: Record<string, any[]> = {};
    validSeasons.forEach(s => {
      const sGames = playedGames.filter(g => g.seasonId === s.id);
      const sEvents = events.filter(e => sGames.some(g => g.id === e.gameId));
      const stat = computeTeamQuadballStats(sEvents, players, teams, sGames, { teamId: activeTeamId });
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
    const stat = computeTeamQuadballStats(cEvents, players, teams, playedGames, { teamId: activeTeamId });
    const tStat = stat.find(st => st.teamId === activeTeamId);
    return tStat && tStat.gamesPlayed > 0 ? tStat : null;
  }, [playedGames, events, players, teams, activeTeamId]);

  const handleSort = (k: string) => {
    if (sortKey === k) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }
    else { setSortKey(k); setSortDir('desc'); }
  };

  if (!team) return <div>Team not found</div>;

  const teamColor = (team as any).colorPrimary || '#059669';
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const TableHeaderRow = ({ onSortClick, currentSort, currentDir }: any) => (
    <tr className="border-b border-gray-100 bg-gray-50/80">
      <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-gray-400 sticky left-0 bg-gray-50 z-10 w-48">Event</th>
      <SortHeader label="GP" sortKey="gamesPlayed" currentSort={currentSort} currentDir={currentDir} onSort={onSortClick} />
      <SortHeader label="GF" sortKey="goals" currentSort={currentSort} currentDir={currentDir} onSort={onSortClick} />
      <SortHeader label="GA" sortKey="goalsAgainst" currentSort={currentSort} currentDir={currentDir} onSort={onSortClick} />
      <SortHeader label="TO" sortKey="turnovers" currentSort={currentSort} currentDir={currentDir} onSort={onSortClick} />
      <SortHeader label="EPR" sortKey="epr" currentSort={currentSort} currentDir={currentDir} onSort={onSortClick} />
      <SortHeader label="fEPR" sortKey="fEpr" currentSort={currentSort} currentDir={currentDir} onSort={onSortClick} />
      <SortHeader label="+/−" sortKey="plusMinus" currentSort={currentSort} currentDir={currentDir} onSort={onSortClick} />
      <SortHeader label="ORTG" sortKey="oRtg" currentSort={currentSort} currentDir={currentDir} onSort={onSortClick} />
      <SortHeader label="DRTG" sortKey="dRtg" currentSort={currentSort} currentDir={currentDir} onSort={onSortClick} />
      <SortHeader label="NET" sortKey="netRtg" currentSort={currentSort} currentDir={currentDir} onSort={onSortClick} />
      <SortHeader label="eOff" sortKey="eOff" currentSort={currentSort} currentDir={currentDir} onSort={onSortClick} />
      <SortHeader label="eDef" sortKey="eDef" currentSort={currentSort} currentDir={currentDir} onSort={onSortClick} />
    </tr>
  );

  const TableDataRow = ({ row, title, rowKey }: any) => (
    <tr key={rowKey} className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
      <td className="px-2 py-1.5 sticky left-0 bg-white z-10 group-hover:bg-gray-50/30 text-xs font-medium text-gray-800 truncate">{title}</td>
      <Cell value={row.gamesPlayed} />
      <Cell value={row.goals} />
      <Cell value={row.goalsAgainst} />
      <Cell value={row.turnovers} />
      <Cell value={`${row.epr}%`} highlight={row.epr >= 20 ? 'neg' : undefined} />
      <Cell value={`${row.fEpr}%`} highlight={row.fEpr >= 20 ? 'pos' : undefined} />
      <Cell value={row.plusMinus} highlight={row.plusMinus > 0 ? 'pos' : row.plusMinus < 0 ? 'neg' : undefined} bold />
      <Cell value={row.oRtg} />
      <Cell value={row.dRtg} />
      <Cell value={row.netRtg} highlight={row.netRtg > 0 ? 'pos' : row.netRtg < 0 ? 'neg' : undefined} bold />
      <Cell value={row.eOff} highlight={row.eOff > 45 ? 'pos' : undefined} />
      <Cell value={row.eDef} highlight={row.eDef < 30 ? 'pos' : row.eDef > 50 ? 'neg' : undefined} />
    </tr>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex items-start gap-4">
        <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors mt-1">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-3xl font-black tracking-tight text-gray-900">
            {team.name}
          </h2>
          {(team as any).nickname && (team as any).nickname !== team.name && (
            <p className="text-sm font-medium mt-0.5 text-gray-400">
              {(team as any).nickname}
            </p>
          )}
          <p className="text-sm text-gray-400 mt-0.5">
            {playedGames.length} Historic Games
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
                <thead><TableHeaderRow onSortClick={handleSort} currentSort={sortKey} currentDir={sortDir} /></thead>
                <tbody>
                  {sortedPerGame.map((r, idx) => (
                    <TableDataRow 
                      key={`game-${r.gameId}-${idx}`} 
                      row={r} 
                      title={
                        <button onClick={() => onGameSelect?.(r.gameId)} className="text-gray-900 hover:underline flex flex-col items-start max-w-[220px] overflow-hidden">
                          <span className="font-bold truncate w-full text-left">vs {r.opponent || 'Opponent'}</span>
                          {r.description && <span className="text-[10px] text-gray-400 font-normal truncate w-full text-left leading-tight mt-0.5">{r.description}</span>}
                        </button>
                      } 
                      rowKey={`game-${r.gameId}-${idx}`} 
                    />
                  ))}
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
                      <thead><TableHeaderRow onSortClick={() => {}} currentSort="" currentDir="asc" /></thead>
                      <tbody>
                        <TableDataRow key="career" row={careerTotal} title="All Time" rowKey="career" />
                      </tbody>
                    </table>
                  </div>
                )}

                {Object.entries(seasonAverages).map(([league, rows]) => (
                  <div key={league} className="mt-6 border border-gray-200 rounded-lg overflow-hidden">
                    <div className="font-bold px-4 py-2 uppercase tracking-widest text-[10px] border-b bg-gray-50/60 text-gray-800 border-gray-200">
                      {league} League
                    </div>
                    <table className="w-full border-collapse">
                      <thead><TableHeaderRow onSortClick={() => {}} currentSort="" currentDir="asc" /></thead>
                      <tbody>
                        {rows.map((r, idx) => (
                          <TableDataRow key={`agg-${league}-${idx}`} row={r} title={r.seasonLabel} rowKey={`agg-${league}-${idx}`} />
                        ))}
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
