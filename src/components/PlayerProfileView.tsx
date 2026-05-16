import React, { useState, useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { computeExtendedStats, computeTeamQuadballStats, computeBeaterSoloStats, computeBeaterPairStats, computeSeekerStats, AdvancedPlayerStats, getScoreboardName } from '../lib/statsComputations';

interface Player { id: string; firstName: string; lastName: string; preferredName?: string; nickname?: string; [k: string]: any; }
interface GameEvent { id: string; videoId: string; gameId: string; type: string; videoTime: number; status: string; playerId?: string; teamId?: string; [k: string]: any; }
interface Team { id: string; name: string; [k: string]: any; }
interface Game { id: string; isVerified?: boolean; seasonId: string; homeTeamId: string; awayTeamId: string; [k: string]: any; }
interface Season { id: string; name: string; description?: string; year?: string; division?: string; league?: string; leagueId?: string; [k: string]: any; }
interface League { id: string; name: string; [k: string]: any; }

function getSeasonLabel(s: Season, leagues: League[]): string {
  const league = s.leagueId ? leagues.find(l => l.id === s.leagueId) : null;
  const parts: string[] = [];
  if (league) {
    const words = league.name.split(/\s+/);
    parts.push(words.length > 1 ? words.map(w => w.length <= 3 ? w.toUpperCase() : w[0]?.toUpperCase()).join('') : league.name);
  }
  if (s.division) parts.push(s.division);
  if (s.year) parts.push(s.year);
  return parts.length > 0 ? parts.join(' ') : (s.name || s.id);
}

import { 
  cn, SortDir, sortBy, SortHeader, Cell, SplitHeader, SplitCell,
  StatsTabSelector, StatsTabButton
} from './ui/StatsTable';

export default function PlayerProfileView({
  players, events, games, seasons, teams, activePlayerId, initialSeasonId, leagues,
  onBack, onTeamSelect, onGameSelect, jerseyNumbers, statsFilter
}: {
  players: Player[]; events: GameEvent[]; games: Game[]; seasons: Season[]; teams: Team[];
  activePlayerId: string; initialSeasonId?: string; onBack: () => void;
  onTeamSelect?: (id: string) => void; onGameSelect?: (id: string) => void;
  jerseyNumbers?: string[]; statsFilter?: string; leagues?: League[];
}) {
  const leaguesList = leagues || [];
  const player = players.find(p => p.id === activePlayerId);
  const [positionTab, setPositionTab] = useState<'quadball' | 'dodgeball' | 'flag'>('quadball');
  const [quadTab, setQuadTab] = useState<'boxscore' | 'rates' | 'advanced' | 'plusminus'>('boxscore');
  const [dodgeTab, setDodgeTab] = useState<'solo' | 'pairs'>('solo');
  const [pairSortKey, setPairSortKey] = useState('totalMinutes');
  const [pairSortDir, setPairSortDir] = useState<SortDir>('desc');

  const { playedGames, validSeasons } = useMemo(() => {
    const played = games.filter(g => events.some(e => e.gameId === g.id && (e.playerId === activePlayerId || e.subPlayerId === activePlayerId)));
    const pSeasons = Array.from(new Set(played.map(g => g.seasonId))).map(sid => seasons.find(s => s.id === sid)).filter(Boolean) as Season[];
    pSeasons.sort((a,b) => (b.description || b.name).localeCompare(a.description || a.name));
    return { playedGames: played, validSeasons: pSeasons };
  }, [events, games, activePlayerId, seasons]);

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>(initialSeasonId || 'auto');
  const activeSeasonId = selectedSeasonId === 'auto' ? (validSeasons[0]?.id || '') : selectedSeasonId;

  const [sortKey, setSortKey] = useState('minutesPlayed');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const baseFilters = useMemo(() => ({ skipRapm: statsFilter === 'verified_events', outlierFilter: 'include' }), [statsFilter]);

  const activeGames = activeSeasonId === 'all' ? playedGames : playedGames.filter(g => g.seasonId === activeSeasonId);
  const activeEvents = events.filter(e => activeGames.some(g => g.id === e.gameId));

  const quadStats = useMemo(() => {
    if (positionTab !== 'quadball' || activeGames.length === 0) return null;
    const stats = computeExtendedStats(activeEvents, players, activeGames, baseFilters);
    const pStat = stats.find(s => s.playerId === activePlayerId);
    return pStat || null;
  }, [activeEvents, players, activeGames, activePlayerId, positionTab, baseFilters]);

  const dodgeSoloStats = useMemo(() => {
    if (positionTab !== 'dodgeball' || activeGames.length === 0) return null;
    const stats = computeBeaterSoloStats(activeEvents, players, activeGames, baseFilters);
    return stats.find(s => s.playerId === activePlayerId) || null;
  }, [activeEvents, players, activeGames, activePlayerId, positionTab, baseFilters]);

  const dodgePairStats = useMemo(() => {
    if (positionTab !== 'dodgeball' || activeGames.length === 0) return [];
    const stats = computeBeaterPairStats(activeEvents, players, activeGames, baseFilters);
    const pairs = stats.filter(p => p.player1Id === activePlayerId || p.player2Id === activePlayerId);
    return sortBy(pairs, pairSortKey, pairSortDir);
  }, [activeEvents, players, activeGames, activePlayerId, positionTab, pairSortKey, pairSortDir, baseFilters]);

  const flagStats = useMemo(() => {
    if (positionTab !== 'flag' || activeGames.length === 0) return null;
    const stats = computeSeekerStats(activeEvents, players, activeGames, baseFilters);
    return stats.find(s => s.playerId === activePlayerId) || null;
  }, [activeEvents, players, activeGames, activePlayerId, positionTab, baseFilters]);

  const handlePairSort = (k: string) => {
    if (pairSortKey === k) setPairSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setPairSortKey(k); setPairSortDir('desc'); }
  };

  const QuadHeaderCell = (props: any) => {
    return <SortHeader {...props} onSort={() => {}} currentSort="" currentDir="asc" />;
  };

  const QuadCell = (props: any) => {
    return <Cell {...props} />;
  };


  const getStatsFn = (pos: string) => {
    if (pos === 'dodgeball') return computeBeaterSoloStats;
    if (pos === 'flag') return computeSeekerStats;
    return computeExtendedStats;
  };

  const perGameStats = useMemo(() => {
    if (activeSeasonId && activeSeasonId !== 'all') {
       const filteredGames = playedGames.filter(g => g.seasonId === activeSeasonId);
       const fn = getStatsFn(positionTab);
       return filteredGames.map(g => {
         const gEvents = events.filter(e => e.gameId === g.id);
         const stat = fn(gEvents, players, [g], baseFilters);
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
  }, [playedGames, activeSeasonId, events, players, activePlayerId, teams, positionTab, baseFilters]);

  const sortedPerGame = useMemo(() => sortBy(perGameStats as any[], sortKey, sortDir), [perGameStats, sortKey, sortDir]);

  const seasonAverages = useMemo(() => {
    const leagues: Record<string, any[]> = {};
    const fn = getStatsFn(positionTab);
    validSeasons.forEach(s => {
      const sGames = playedGames.filter(g => g.seasonId === s.id);
      if (sGames.length === 0) return;
      const sEvents = events.filter(e => sGames.some(g => g.id === e.gameId));
      const stat = fn(sEvents, players, sGames, baseFilters);
      const pStat = stat.find((st: any) => st.playerId === activePlayerId);
      if (pStat && ((pStat.gamesPlayed || 0) > 0 || (pStat.minutesPlayed || 0) > 0 || (pStat.totalMinutes || 0) > 0 || (pStat.stints || 0) > 0)) {
        const l = s.league || 'Other';
        if (!leagues[l]) leagues[l] = [];
        leagues[l].push({ ...pStat, seasonLabel: getSeasonLabel(s, leaguesList) });
      }
    });

    Object.keys(leagues).forEach(k => {
      leagues[k] = leagues[k].sort((a,b) => b.gamesPlayed - a.gamesPlayed).slice(0, 10);
    });
    return leagues;
  }, [validSeasons, playedGames, events, players, activePlayerId, positionTab, baseFilters]);

  const careerTotal = useMemo(() => {
    if (playedGames.length === 0) return null;
    const cEvents = events.filter(e => playedGames.some(g => g.id === e.gameId));
    const fn = getStatsFn(positionTab);
    const stat = fn(cEvents, players, playedGames, baseFilters);
    const pStat = stat.find((st: any) => st.playerId === activePlayerId);
    return pStat && ((pStat.gamesPlayed || 0) > 0 || (pStat.minutesPlayed || 0) > 0 || (pStat.totalMinutes || 0) > 0 || (pStat.stints || 0) > 0) ? pStat : null;
  }, [playedGames, events, players, activePlayerId, positionTab, baseFilters]);

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
          leagues[league].push({ id: teamId, name: team.name, nickname: (team as any).nickname, colorPrimaryDark: (team as any).colorPrimaryDark || (team as any).colorPrimary });
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
                        {t.colorPrimaryDark && (
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-gray-300" style={{ backgroundColor: t.colorPrimaryDark }} />
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

      
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <StatsTabSelector>
            <StatsTabButton isFirst active={positionTab === 'quadball'} onClick={() => setPositionTab('quadball')} label="Quadball" activeClass="bg-blue-600 text-white" />
            <StatsTabButton active={positionTab === 'dodgeball'} onClick={() => setPositionTab('dodgeball')} label="Dodgeball" activeClass="bg-neutral-900 text-white" />
            <StatsTabButton active={positionTab === 'flag'} onClick={() => setPositionTab('flag')} label="Flag" activeClass="bg-yellow-400 text-black" />
          </StatsTabSelector>
        </div>
        <select
          value={activeSeasonId}
          onChange={e => setSelectedSeasonId(e.target.value)}
          className="bg-gray-50 border text-xs font-medium tracking-wide shadow-sm border-gray-200 text-gray-700 rounded-lg px-3 py-2 outline-none focus:border-blue-500"
        >
          <option value="all">View All Championships...</option>
          {validSeasons.map(s => <option key={s.id} value={s.id}>{getSeasonLabel(s, leaguesList)}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-6">
        {/* Season Stats */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Season Stats</h3>
            {positionTab === 'quadball' && (
              <StatsTabSelector>
                <StatsTabButton isFirst active={quadTab === 'boxscore'} onClick={() => setQuadTab('boxscore')} label="Box Score" />
                <StatsTabButton active={quadTab === 'rates'} onClick={() => setQuadTab('rates')} label="Rate Score" />
                <StatsTabButton active={quadTab === 'plusminus'} onClick={() => setQuadTab('plusminus')} label="Plus/Minus" />
                <StatsTabButton active={quadTab === 'advanced'} onClick={() => setQuadTab('advanced')} label="Advanced" />
              </StatsTabSelector>
            )}
            {positionTab === 'dodgeball' && (
              <StatsTabSelector>
                <StatsTabButton isFirst active={dodgeTab === 'solo'} onClick={() => setDodgeTab('solo')} label="Solo" />
                <StatsTabButton active={dodgeTab === 'pairs'} onClick={() => setDodgeTab('pairs')} label="Pairs" />
              </StatsTabSelector>
            )}
          </div>
          
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white flex flex-col">
            <div className="overflow-x-auto flex-1 bg-white">
            {positionTab === 'quadball' && (!quadStats ? (
              <div className="p-10 text-center text-gray-400 text-sm">No Quadball stats for this selection.</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-gray-400 sticky left-0 bg-gray-50 z-10 w-48">Player</th>
                    {quadTab === 'boxscore' ? (<>
                      <QuadHeaderCell label="GP" sortKey="gamesPlayed" />
                      <QuadHeaderCell label="MIN" sortKey="minutesPlayed" />
                      <QuadHeaderCell label="S" sortKey="shots" />
                      <QuadHeaderCell label="ATT" sortKey="attempts" />
                      <QuadHeaderCell label="KO" sortKey="missKo" />
                      <QuadHeaderCell label="G" sortKey="goals" />
                      <QuadHeaderCell label="A" sortKey="assists" />
                      <QuadHeaderCell label="TO" sortKey="turnovers" />
                      <QuadHeaderCell label="S%" sortKey="shotPct" />
                      <QuadHeaderCell label="CTRL%" sortKey="controlPctOnField" />
                    </>) : quadTab === 'rates' ? (<>
                      <QuadHeaderCell label="GP" sortKey="gamesPlayed" />
                      <QuadHeaderCell label="MIN" sortKey="minutesPlayed" />
                      <QuadHeaderCell label="G/G" sortKey="goalsPerGame" />
                      <QuadHeaderCell label="G/20" sortKey="goalsPerTwenty" />
                      <QuadHeaderCell label="A/G" sortKey="assistsPerGame" />
                      <QuadHeaderCell label="A/20" sortKey="assistsPerTwenty" />
                      <QuadHeaderCell label="PTS/G" sortKey="pointsPerGame" />
                      <QuadHeaderCell label="PTS/20" sortKey="pointsPerTwenty" />
                      <QuadHeaderCell label="A:TO" sortKey="assistToTurnover" />
                    </>) : quadTab === 'advanced' ? (<>
                      <QuadHeaderCell label="MIN" sortKey="minutesPlayed" />
                      <QuadHeaderCell label="POSS" sortKey="teamPossessions" />
                      <QuadHeaderCell label="USG%" sortKey="usgPct" />
                      <QuadHeaderCell label="ORTG" sortKey="oRtg" />
                      <QuadHeaderCell label="DRTG" sortKey="dRtg" />
                      <QuadHeaderCell label="NET" sortKey="netRtg" />
                      <QuadHeaderCell label="RAPM" sortKey="rapm" />
                      <QuadHeaderCell label="GmSc" sortKey="gameScore" />
                    </>) : (<>
                      <QuadHeaderCell label="MIN" sortKey="minutesPlayed" />
                      <QuadHeaderCell label="+" sortKey="plus" />
                      <QuadHeaderCell label="−" sortKey="minus" />
                      <QuadHeaderCell label="+/−" sortKey="plusMinus" />
                      <QuadHeaderCell label="RATIO" sortKey="plusMinusRatio" />
                      <QuadHeaderCell label="OFF +/−" sortKey="offPlusMinus" />
                      <QuadHeaderCell label="ON/OFF" sortKey="onOffDt" />
                      <QuadHeaderCell label="REL RATIO" sortKey="relPlusMinusRatio" />
                      <QuadHeaderCell label="EPR" sortKey="epr" />
                      <QuadHeaderCell label="fEPR" sortKey="fEpr" />
                    </>)}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                    <td className="px-2 py-1.5 sticky left-0 bg-white z-10 font-bold text-gray-900 text-xs truncate">
                      {player.firstName} {player.lastName}
                    </td>
                    {quadTab === 'boxscore' ? (<>
                      <Cell value={quadStats.gamesPlayed} />
                      <Cell value={quadStats.minutesPlayed} />
                      <Cell value={quadStats.shots} />
                      <Cell value={quadStats.attempts} />
                      <Cell value={quadStats.missKo} />
                      <Cell value={quadStats.goals} />
                      <Cell value={quadStats.assists} />
                      <Cell value={quadStats.turnovers} />
                      <Cell value={quadStats.shotPct} />
                      <Cell value={quadStats.controlPctOnField} />
                    </>) : quadTab === 'rates' ? (<>
                      <QuadCell sortKey="gamesPlayed" value={quadStats.gamesPlayed} />
                      <QuadCell sortKey="minutesPlayed" value={quadStats.minutesPlayed} />
                      <QuadCell sortKey="goalsPerGame" value={quadStats.goalsPerGame} />
                      <QuadCell sortKey="goalsPerTwenty" value={quadStats.goalsPerTwenty} />
                      <QuadCell sortKey="assistsPerGame" value={quadStats.assistsPerGame} />
                      <QuadCell sortKey="assistsPerTwenty" value={quadStats.assistsPerTwenty} />
                      <QuadCell sortKey="pointsPerGame" value={quadStats.pointsPerGame} />
                      <QuadCell sortKey="pointsPerTwenty" value={quadStats.pointsPerTwenty} />
                      <QuadCell sortKey="assistToTurnover" value={quadStats.assistToTurnover} />
                    </>) : quadTab === 'advanced' ? (<>
                      <QuadCell sortKey="minutesPlayed" value={quadStats.minutesPlayed} />
                      <QuadCell sortKey="teamPossessions" value={quadStats.teamPossessions} />
                      <QuadCell sortKey="usgPct" value={quadStats.usgPct} />
                      <QuadCell sortKey="oRtg" value={quadStats.oRtg} />
                      <QuadCell sortKey="dRtg" value={quadStats.dRtg} />
                      <QuadCell sortKey="netRtg" value={quadStats.netRtg} bold highlight={quadStats.netRtg > 0 ? 'pos' : quadStats.netRtg < 0 ? 'neg' : undefined} />
                      <QuadCell sortKey="rapm" value={quadStats.rapm} bold highlight={quadStats.rapm > 0 ? 'pos' : quadStats.rapm < 0 ? 'neg' : undefined} />
                      <QuadCell sortKey="gameScore" value={quadStats.gameScore} />
                    </>) : (<>
                      <QuadCell sortKey="minutesPlayed" value={quadStats.minutesPlayed} />
                      <QuadCell sortKey="plus" value={quadStats.plus} />
                      <QuadCell sortKey="minus" value={quadStats.minus} />
                      <QuadCell sortKey="plusMinus" value={quadStats.plusMinus} bold highlight={quadStats.plusMinus > 0 ? 'pos' : quadStats.plusMinus < 0 ? 'neg' : undefined} />
                      <QuadCell sortKey="plusMinusRatio" value={quadStats.plusMinusRatio} />
                      <QuadCell sortKey="offPlusMinus" value={quadStats.offPlusMinus} />
                      <QuadCell sortKey="onOffDt" value={quadStats.onOffDt} />
                      <QuadCell sortKey="relPlusMinusRatio" value={quadStats.relPlusMinusRatio} />
                      <QuadCell sortKey="epr" value={quadStats.epr} />
                      <QuadCell sortKey="fEpr" value={quadStats.fEpr} />
                    </>)}
                  </tr>
                </tbody>
              </table>
            ))}
            
            {positionTab === 'dodgeball' && dodgeTab === 'solo' && (!dodgeSoloStats ? (
              <div className="p-10 text-center text-gray-400 text-sm">No Dodgeball Solo stats for this selection.</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-gray-400 sticky left-0 bg-gray-50 z-10 w-48">Player</th>
                    <SortHeader label="GP" sortKey="gamesPlayed" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="MIN" sortKey="totalMinutes" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="CTRL MIN" sortKey="controlMinutes" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="CTRL %" sortKey="controlPct" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="+" sortKey="plus" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="−" sortKey="minus" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="+/−" sortKey="plusMinus" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="RATIO" sortKey="plusMinusRatio" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="+/− / 20" sortKey="plusMinusPerTwenty" currentSort="" currentDir="asc" onSort={() => {}} />
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                    <td className="px-2 py-1.5 sticky left-0 bg-white z-10 font-bold text-gray-900 text-xs truncate">
                      {player.firstName} {player.lastName}
                    </td>
                    <Cell value={dodgeSoloStats.gamesPlayed} />
                    <Cell value={dodgeSoloStats.totalMinutes} />
                    <Cell value={dodgeSoloStats.controlMinutes} />
                    <Cell value={dodgeSoloStats.controlPct} />
                    <Cell value={dodgeSoloStats.plus} />
                    <Cell value={dodgeSoloStats.minus} />
                    <Cell value={dodgeSoloStats.plusMinus} bold highlight={dodgeSoloStats.plusMinus > 0 ? 'pos' : dodgeSoloStats.plusMinus < 0 ? 'neg' : undefined} />
                    <Cell value={dodgeSoloStats.plusMinusRatio} />
                    <Cell value={dodgeSoloStats.plusMinusPerTwenty} />
                  </tr>
                </tbody>
              </table>
            ))}
            
            {positionTab === 'dodgeball' && dodgeTab === 'pairs' && (dodgePairStats.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">No Dodgeball Pair stats for this selection.</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-gray-400 sticky left-0 bg-gray-50 z-10 w-48">Pair</th>
                    <SortHeader label="MIN" sortKey="totalMinutes" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} />
                    <SortHeader label="CTRL MIN" sortKey="controlMinutes" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} />
                    <SortHeader label="CTRL %" sortKey="controlPct" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} />
                    <SortHeader label="+" sortKey="plus" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} />
                    <SortHeader label="−" sortKey="minus" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} />
                    <SortHeader label="+/−" sortKey="plusMinus" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} />
                  </tr>
                </thead>
                <tbody>
                  {dodgePairStats.map((pStat: any) => (
                    <tr key={pStat.pairKey} className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                      <td className="px-2 py-1.5 sticky left-0 bg-white z-10 font-bold text-gray-900 text-xs">
                        <div className="flex flex-col">
                           <span>{pStat.player1Name}</span>
                           <span>{pStat.player2Name}</span>
                        </div>
                      </td>
                      <Cell value={pStat.totalMinutes} />
                      <Cell value={pStat.controlMinutes} />
                      <Cell value={pStat.controlPct} />
                      <Cell value={pStat.plus} />
                      <Cell value={pStat.minus} />
                      <Cell value={pStat.plusMinus} bold highlight={pStat.plusMinus > 0 ? 'pos' : pStat.plusMinus < 0 ? 'neg' : undefined} />
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

            {positionTab === 'flag' && (!flagStats ? (
              <div className="p-10 text-center text-gray-400 text-sm">No Flag stats for this selection.</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-gray-400 sticky left-0 bg-gray-50 z-10 w-48">Player</th>
                    <SortHeader label="STINTS" sortKey="stints" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="TIME/STINT" sortKey="timePerStint" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="CTH" sortKey="catches" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="OpCTH" sortKey="oppCatchesOnPitch" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="TIME TO CH" sortKey="catchTimeSec" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="REL TO CH" sortKey="releaseToCatchSec" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="CTRL %" sortKey="controlPctOnPitch" currentSort="" currentDir="asc" onSort={() => {}} />
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                    <td className="px-2 py-1.5 sticky left-0 bg-white z-10 font-bold text-gray-900 text-xs truncate">
                      {player.firstName} {player.lastName}
                    </td>
                    <Cell value={flagStats.stints} />
                    <Cell value={flagStats.timePerStint} />
                    <Cell value={flagStats.catches} />
                    <Cell value={flagStats.oppCatchesOnPitch} />
                    <Cell value={flagStats.catchTimeSec} />
                    <Cell value={flagStats.releaseToCatchSec} />
                    <Cell value={flagStats.controlPctOnPitch} />
                  </tr>
                </tbody>
              </table>
            ))}
          </div>
        </div>
      </div>

        {/* Game Logs */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-between gap-4">
            <h3 className="font-bold text-gray-800">Game Logs</h3>
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
