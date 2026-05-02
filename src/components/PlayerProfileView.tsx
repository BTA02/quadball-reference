import React, { useState, useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { computeAdvancedStats, computeTeamQuadballStats, computeBeaterSoloStats, computeSeekerStats, AdvancedPlayerStats, getScoreboardName } from '../lib/statsComputations';

interface Player { id: string; firstName: string; lastName: string; preferredName?: string; nickname?: string; [k: string]: any; }
interface GameEvent { id: string; videoId: string; gameId: string; type: string; videoTime: number; status: string; playerId?: string; teamId?: string; [k: string]: any; }
interface Team { id: string; name: string; [k: string]: any; }
interface Game { id: string; isVerified?: boolean; seasonId: string; homeTeamId: string; awayTeamId: string; [k: string]: any; }
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

function SortHeader({ label, sortKey, currentSort, currentDir, onSort, tooltip }: any) {
  const active = currentSort === sortKey;
  return (
    <th className={cn('px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap text-center', active ? 'text-blue-700' : 'text-slate-600 hover:text-slate-900')} onClick={() => onSort(sortKey)} title={tooltip}>
      <span className="inline-flex items-center gap-0.5">{label}</span>
      {active && <span className="text-[10px] ml-1">{currentDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

function Cell({ value, highlight, bold }: any) {
  return (
    <td className={cn('px-2 py-1.5 text-center text-xs tabular-nums font-mono', highlight === 'pos' && 'text-emerald-700 font-bold', highlight === 'neg' && 'text-red-600 font-bold', !highlight && 'text-slate-800', bold && 'font-black')}>
      {typeof value === 'number' && value === Infinity ? '∞' : value}
    </td>
  );
}

export default function PlayerProfileView({
  players, events, games, seasons, teams, activePlayerId, initialSeasonId,
  onBack, onTeamSelect, onGameSelect, jerseyNumbers
}: {
  players: Player[]; events: GameEvent[]; games: Game[]; seasons: Season[]; teams: Team[];
  activePlayerId: string; initialSeasonId?: string; onBack: () => void;
  onTeamSelect?: (id: string) => void; onGameSelect?: (id: string) => void;
  jerseyNumbers?: string[];
}) {
  const player = players.find(p => p.id === activePlayerId);
  const [positionTab, setPositionTab] = useState<'quadball' | 'dodgeball' | 'flag'>('quadball');

  const { playedGames, validSeasons } = useMemo(() => {
    const played = games.filter(g => events.some(e => e.gameId === g.id && e.playerId === activePlayerId && e.type === 'sub_in'));
    const pSeasons = Array.from(new Set(played.map(g => g.seasonId))).map(sid => seasons.find(s => s.id === sid)).filter(Boolean) as Season[];
    pSeasons.sort((a,b) => (b.description || b.name).localeCompare(a.description || a.name));
    return { playedGames: played, validSeasons: pSeasons };
  }, [events, games, activePlayerId, seasons]);

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>(initialSeasonId || 'auto');
  const activeSeasonId = selectedSeasonId === 'auto' ? (validSeasons[0]?.id || '') : selectedSeasonId;

  const [sortKey, setSortKey] = useState('minutesPlayed');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const getStatsFn = (pos: string) => {
    if (pos === 'dodgeball') return computeBeaterSoloStats;
    if (pos === 'flag') return computeSeekerStats;
    return computeAdvancedStats;
  };

  const perGameStats = useMemo(() => {
    if (activeSeasonId && activeSeasonId !== 'all') {
       const filteredGames = playedGames.filter(g => g.seasonId === activeSeasonId);
       const fn = getStatsFn(positionTab);
       return filteredGames.map(g => {
         const gEvents = events.filter(e => e.gameId === g.id);
         const stat = fn(gEvents, players, [g], {});
         const pStat = stat.find((st: any) => st.playerId === activePlayerId);
         
         const playerTeamId = gEvents.find(e => e.playerId === activePlayerId && e.teamId && e.teamId !== 'null')?.teamId;
         const opponent = g.homeTeamId === playerTeamId ? g.awayTeamId : g.homeTeamId;
         const oppName = getScoreboardName?.(teams.find(t => t.id === opponent)) || teams.find(t => t.id === opponent)?.name || 'Unknown';

         if (pStat && ((pStat.gamesPlayed || 0) > 0 || (pStat.minutesPlayed || 0) > 0 || (pStat.totalMinutes || 0) > 0 || (pStat.stints || 0) > 0)) {
           return {
             ...pStat,
             gameId: g.id,
             opponent: oppName,
             description: g.tag
           };
         }
         return null;
       }).filter(s => s !== null);
    }
    return [];
  }, [playedGames, activeSeasonId, events, players, activePlayerId, teams, positionTab]);

  const sortedPerGame = useMemo(() => sortData(perGameStats as any[], sortKey, sortDir), [perGameStats, sortKey, sortDir]);

  const seasonAverages = useMemo(() => {
    const leagues: Record<string, any[]> = {};
    const fn = getStatsFn(positionTab);
    validSeasons.forEach(s => {
      const sGames = playedGames.filter(g => g.seasonId === s.id);
      if (sGames.length === 0) return;
      const sEvents = events.filter(e => sGames.some(g => g.id === e.gameId));
      const stat = fn(sEvents, players, sGames, {});
      const pStat = stat.find((st: any) => st.playerId === activePlayerId);
      if (pStat && ((pStat.gamesPlayed || 0) > 0 || (pStat.minutesPlayed || 0) > 0 || (pStat.totalMinutes || 0) > 0 || (pStat.stints || 0) > 0)) {
        const l = s.league || 'Other';
        if (!leagues[l]) leagues[l] = [];
        leagues[l].push({ ...pStat, seasonLabel: s.description || s.name });
      }
    });

    Object.keys(leagues).forEach(k => {
      leagues[k] = leagues[k].sort((a,b) => b.gamesPlayed - a.gamesPlayed).slice(0, 10);
    });
    return leagues;
  }, [validSeasons, playedGames, events, players, activePlayerId, positionTab]);

  const careerTotal = useMemo(() => {
    if (playedGames.length === 0) return null;
    const cEvents = events.filter(e => playedGames.some(g => g.id === e.gameId));
    const fn = getStatsFn(positionTab);
    const stat = fn(cEvents, players, playedGames, {});
    const pStat = stat.find((st: any) => st.playerId === activePlayerId);
    return pStat && ((pStat.gamesPlayed || 0) > 0 || (pStat.minutesPlayed || 0) > 0 || (pStat.totalMinutes || 0) > 0 || (pStat.stints || 0) > 0) ? pStat : null;
  }, [playedGames, events, players, activePlayerId, positionTab]);

  const handleSort = (k: string) => {
    if (sortKey === k) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }
    else { setSortKey(k); setSortDir('desc'); }
  };

  if (!player) return <div>Player not found.</div>;

  const renderTableHeader = () => (
    <tr className="border-b border-gray-100 bg-gray-50/80">
      <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-gray-400 sticky left-0 bg-gray-50 z-10 w-48">Event</th>
      <SortHeader label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
      {positionTab === 'quadball' && (
        <>
          <SortHeader label="MIN" sortKey="minutesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="G" sortKey="goals" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="A" sortKey="assists" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="TO" sortKey="turnovers" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="+" sortKey="plus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="−" sortKey="minus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="+/−" sortKey="plusMinus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
        </>
      )}
      {positionTab === 'dodgeball' && (
        <>
          <SortHeader label="MIN" sortKey="totalMinutes" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="CTRL MIN" sortKey="controlMinutes" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="CTRL %" sortKey="controlPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="+" sortKey="plus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="−" sortKey="minus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="+/−" sortKey="plusMinus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
        </>
      )}
      {positionTab === 'flag' && (
        <>
          <SortHeader label="STINTS" sortKey="stints" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="TIME/STINT" sortKey="timePerStint" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="TIME TO CH" sortKey="catchTimeSec" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="REL TO CH" sortKey="releaseToCatchSec" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
        </>
      )}
    </tr>
  );

  const renderRow = (row: any, title: React.ReactNode, key: string) => (
    <tr key={key} className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
      <td className="px-2 py-1.5 sticky left-0 bg-white z-10 group-hover:bg-gray-50/30 text-xs font-medium text-gray-800 truncate">{title}</td>
      <Cell value={row.gamesPlayed} />
      {positionTab === 'quadball' && (
        <>
          <Cell value={row.minutesPlayed} />
          <Cell value={row.goals} />
          <Cell value={row.assists} />
          <Cell value={row.turnovers} />
          <Cell value={row.plus} />
          <Cell value={row.minus} />
          <Cell value={row.plusMinus} highlight={row.plusMinus > 0 ? 'pos' : row.plusMinus < 0 ? 'neg' : undefined} bold />
        </>
      )}
      {positionTab === 'dodgeball' && (
        <>
          <Cell value={row.totalMinutes} />
          <Cell value={row.controlMinutes} />
          <Cell value={row.controlPct} />
          <Cell value={row.plus} />
          <Cell value={row.minus} />
          <Cell value={row.plusMinus} highlight={row.plusMinus > 0 ? 'pos' : row.plusMinus < 0 ? 'neg' : undefined} bold />
        </>
      )}
      {positionTab === 'flag' && (
        <>
          <Cell value={row.stints} />
          <Cell value={row.timePerStint} />
          <Cell value={row.catchTimeSec} />
          <Cell value={row.releaseToCatchSec} />
        </>
      )}
    </tr>
  );

  const renderAggHeader = () => (
    <tr className="border-b border-gray-100 bg-gray-50/80">
      <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-gray-400 sticky left-0 bg-gray-50 z-10 w-48">Event</th>
      <SortHeader label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
      {positionTab === 'quadball' && (
        <>
          <SortHeader label="MIN" sortKey="minutesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="G" sortKey="goals" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="A" sortKey="assists" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="TO" sortKey="turnovers" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="+/− RATIO" sortKey="plusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="PTS/20" sortKey="pointsPerTwenty" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="PTS/G" sortKey="pointsPerGame" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
        </>
      )}
      {positionTab === 'dodgeball' && (
        <>
          <SortHeader label="MIN" sortKey="totalMinutes" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="CTRL MIN" sortKey="controlMinutes" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="CTRL %" sortKey="controlPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="+" sortKey="plus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="−" sortKey="minus" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="+/− RATIO" sortKey="plusMinusRatio" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="+/− / 20" sortKey="plusMinusPerTwenty" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
        </>
      )}
      {positionTab === 'flag' && (
        <>
          <SortHeader label="STINTS" sortKey="stints" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="TIME/STINT" sortKey="timePerStint" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="TIME TO CH" sortKey="catchTimeSec" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          <SortHeader label="REL TO CH" sortKey="releaseToCatchSec" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
        </>
      )}
    </tr>
  );

  const renderAggRow = (row: any, title: React.ReactNode, key: string) => (
    <tr key={key} className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
      <td className="px-2 py-1.5 sticky left-0 bg-white z-10 group-hover:bg-gray-50/30 text-xs font-medium text-gray-800 truncate">{title}</td>
      <Cell value={row.gamesPlayed} />
      {positionTab === 'quadball' && (
        <>
          <Cell value={row.minutesPlayed} />
          <Cell value={row.goals} />
          <Cell value={row.assists} />
          <Cell value={row.turnovers} />
          <Cell value={row.plusMinusRatio > 0 ? `+${row.plusMinusRatio}` : row.plusMinusRatio} highlight={row.plusMinusRatio > 0 ? 'pos' : row.plusMinusRatio < 0 ? 'neg' : undefined} bold />
          <Cell value={row.pointsPerTwenty} />
          <Cell value={row.pointsPerGame} />
        </>
      )}
      {positionTab === 'dodgeball' && (
        <>
          <Cell value={row.totalMinutes} />
          <Cell value={row.controlMinutes} />
          <Cell value={row.controlPct} />
          <Cell value={row.plus} />
          <Cell value={row.minus} />
          <Cell value={row.plusMinusRatio > 0 ? `+${row.plusMinusRatio}` : row.plusMinusRatio} highlight={row.plusMinusRatio > 0 ? 'pos' : row.plusMinusRatio < 0 ? 'neg' : undefined} bold />
          <Cell value={row.plusMinusPerTwenty} />
        </>
      )}
      {positionTab === 'flag' && (
        <>
          <Cell value={row.stints} />
          <Cell value={row.timePerStint} />
          <Cell value={row.catchTimeSec} />
          <Cell value={row.releaseToCatchSec} />
        </>
      )}
    </tr>
  );

  // Compute teams played for, grouped by league
  const teamsByLeague = useMemo(() => {
    const leagues: Record<string, { id: string; name: string; nickname?: string; colorPrimary?: string }[]> = {};
    // Find all teams this player has played for via events
    const playerTeamIds = new Set<string>();
    events.forEach(e => {
      if (e.playerId === activePlayerId && e.teamId && e.teamId !== 'null') {
        playerTeamIds.add(e.teamId);
      }
    });
    // Group by league using game's season
    playerTeamIds.forEach(teamId => {
      const team = teams.find(t => t.id === teamId);
      if (!team) return;
      // Find which leagues this player played for this team
      const playerGamesForTeam = playedGames.filter(g => {
        const isOnTeam = g.homeTeamId === teamId || g.awayTeamId === teamId;
        const playedForTeam = events.some(e => e.gameId === g.id && e.playerId === activePlayerId && e.teamId === teamId);
        return isOnTeam && playedForTeam;
      });
      const leaguesForTeam = new Set<string>();
      playerGamesForTeam.forEach(g => {
        const season = seasons.find(s => s.id === g.seasonId);
        leaguesForTeam.add(season?.league || 'Other');
      });
      leaguesForTeam.forEach(league => {
        if (!leagues[league]) leagues[league] = [];
        if (!leagues[league].some(t => t.id === teamId)) {
          leagues[league].push({ id: teamId, name: team.name, nickname: (team as any).nickname, colorPrimary: (team as any).colorPrimary });
        }
      });
    });
    return leagues;
  }, [events, activePlayerId, teams, playedGames, seasons]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex items-start gap-4">
        <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors mt-1">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">
            {player.firstName} {player.lastName}
          </h2>
          {player.preferredName && (
            <p className="text-sm text-gray-400 mt-0.5">
              Goes by <span className="font-medium text-gray-500">{player.preferredName}</span>
            </p>
          )}
          {jerseyNumbers && jerseyNumbers.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1">
              {jerseyNumbers.map(n => (
                <span key={n} className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-gray-100 border border-gray-200 text-xs font-bold text-gray-600 tabular-nums">
                  #{n}
                </span>
              ))}
            </div>
          )}
          {Object.keys(teamsByLeague).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {Object.entries(teamsByLeague).map(([league, leagueTeams]) => (
                <div key={league} className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400">{league}</span>
                  <div className="flex items-center gap-1.5">
                    {leagueTeams.map(t => (
                      <button
                        key={t.id}
                        onClick={() => onTeamSelect?.(t.id)}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors border border-gray-200"
                      >
                        {t.colorPrimary && (
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-gray-300" style={{ backgroundColor: t.colorPrimary }} />
                        )}
                        {t.nickname || t.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Game Logs */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h3 className="font-bold text-gray-800">Game Logs</h3>
              <div className="flex items-center border border-gray-200 rounded-md overflow-hidden bg-white text-xs">
                <button onClick={() => setPositionTab('quadball')} className={cn('px-3 py-1.5 font-medium transition-colors', positionTab === 'quadball' ? 'bg-white text-blue-600' : 'text-gray-500 hover:bg-gray-50')}>Quadball</button>
                <button onClick={() => setPositionTab('dodgeball')} className={cn('px-3 py-1.5 font-medium transition-colors border-l border-gray-200', positionTab === 'dodgeball' ? 'bg-neutral-900 text-white' : 'text-gray-500 hover:bg-gray-50')}>Dodgeball</button>
                <button onClick={() => setPositionTab('flag')} className={cn('px-3 py-1.5 font-medium transition-colors border-l border-gray-200', positionTab === 'flag' ? 'bg-yellow-400 text-black' : 'text-gray-500 hover:bg-gray-50')}>Flag</button>
              </div>
            </div>
            <select
              value={activeSeasonId}
              onChange={e => setSelectedSeasonId(e.target.value)}
              className="bg-white border text-xs font-medium tracking-wide shadow-sm border-gray-200 text-gray-700 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500"
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
                    <button onClick={() => onGameSelect?.(r.gameId)} className="text-blue-600 hover:underline flex flex-col items-start max-w-[220px] overflow-hidden">
                      <span className="font-bold truncate w-full text-left">vs {r.opponent || 'Opponent'}</span>
                      {r.description && <span className="text-[10px] text-gray-500 font-normal truncate w-full text-left leading-tight mt-0.5">{r.description}</span>}
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
            <h3 className="font-bold text-gray-800">Aggregated Career History</h3>
          </div>
          <div className="p-0 overflow-x-auto flex-1 bg-white">
            {Object.keys(seasonAverages).length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm flex items-center justify-center h-full">No historical seasons.</div>
            ) : (
              <div className="">
                {careerTotal && (
                  <div className="mb-6">
                    <div className="bg-gray-800 font-bold px-4 py-2 text-white uppercase tracking-widest text-[10px] border-b border-gray-900 rounded-t-lg">
                      Total Career (All Leagues)
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
                    <div className="bg-blue-50/60 font-bold px-4 py-2 text-blue-800 uppercase tracking-widest text-[10px] border-b border-blue-100">
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
