import React, { useState, useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { computeAdvancedStats, computeBeaterPairStats, computeBeaterSoloStats, computeGameClockIntervals, getGameSecondsInWindow } from '../lib/statsComputations';

interface Player { id: string; firstName: string; lastName: string; preferredName?: string; nickname?: string; [k: string]: any; }
interface GameEvent { id: string; videoId: string; gameId: string; type: string; videoTime: number; status: string; playerId?: string; teamId?: string; position?: string; [k: string]: any; }
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
    <th className={cn('px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap text-center', active ? 'text-red-700' : 'text-slate-600 hover:text-slate-900')} onClick={() => onSort(sortKey)} title={tooltip}>
      <span className="inline-flex items-center gap-0.5">{label}</span>
      {active && <span className="text-[10px] ml-1">{currentDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

function Cell({ value, highlight, bold, align = 'center' }: any) {
  return (
    <td className={cn('px-2 py-1.5 text-xs tabular-nums font-mono', 
      align === 'center' ? 'text-center' : align === 'left' ? 'text-left' : 'text-right',
      highlight === 'pos' && 'text-emerald-700 font-bold', highlight === 'neg' && 'text-red-600 font-bold', !highlight && 'text-slate-800', bold && 'font-black'
    )}>
      {typeof value === 'number' && value === Infinity ? '∞' : value}
    </td>
  );
}

export default function GameBoxScoreView({
  players, events, games, seasons, teams, activeGameId,
  onBack, onPlayerSelect, onTeamSelect
}: {
  players: Player[]; events: GameEvent[]; games: Game[]; seasons: Season[]; teams: Team[];
  activeGameId: string; onBack: () => void;
  onPlayerSelect?: (id: string) => void; onTeamSelect?: (id: string) => void;
}) {
  const game = games.find(g => g.id === activeGameId);
  const season = seasons.find(s => s.id === game?.seasonId);
  const homeTeam = teams.find(t => t.id === game?.homeTeamId);
  const awayTeam = teams.find(t => t.id === game?.awayTeamId);

  const [sortKeyHome, setSortKeyHome] = useState('minutesPlayed');
  const [sortDirHome, setSortDirHome] = useState<SortDir>('desc');
  const [sortKeyAway, setSortKeyAway] = useState('minutesPlayed');
  const [sortDirAway, setSortDirAway] = useState<SortDir>('desc');

  const [sortKeyHomeP, setSortKeyHomeP] = useState('totalMinutes');
  const [sortDirHomeP, setSortDirHomeP] = useState<SortDir>('desc');
  const [sortKeyAwayP, setSortKeyAwayP] = useState('totalMinutes');
  const [sortDirAwayP, setSortDirAwayP] = useState<SortDir>('desc');

  const { homeStats, awayStats, homePairs, awayPairs, score } = useMemo(() => {
    if (!game) return { homeStats: [], awayStats: [], homePairs: [], awayPairs: [], score: {home: 0, away: 0, homeCatch: false, awayCatch: false, setScore: null, gameTimeStr: ''} };
    const gEvents = events.filter(e => e.gameId === game.id);
    
    // Compute total combined game stats for all players
    const stats = computeAdvancedStats(gEvents, players, [game], {});
    const pairs = computeBeaterPairStats(gEvents, players, [game], {});
    const bSolos = computeBeaterSoloStats(gEvents, players, [game], {});
    
    // Map to identify pure beaters easily
    const beaterSolosMap = new Map(bSolos.map(b => [b.playerId, b.totalMinutes]));

    // Filter active Quaffle players (hide pure beaters who logged 0 actual offensive numbers)
    const activeStats = stats.filter(s => {
      const isBeater = beaterSolosMap.has(s.playerId) && (beaterSolosMap.get(s.playerId) || 0) >= s.minutesPlayed * 0.8;
      if (isBeater && s.goals === 0 && s.assists === 0 && s.shots === 0) return false;
      return s.minutesPlayed > 0 || s.goals > 0 || s.assists > 0 || s.shots > 0;
    });
    
    const activePairs = pairs.filter(p => p.totalMinutes > 0);
    
    const hStats = sortData(activeStats.filter(s => (s as any).teamId === game.homeTeamId), sortKeyHome, sortDirHome);
    const aStats = sortData(activeStats.filter(s => (s as any).teamId === game.awayTeamId), sortKeyAway, sortDirAway);

    const hPairs = sortData(activePairs.filter(p => (p as any).teamId === game.homeTeamId), sortKeyHomeP, sortDirHomeP);
    const aPairs = sortData(activePairs.filter(p => (p as any).teamId === game.awayTeamId), sortKeyAwayP, sortDirAwayP);

    const matchHomeGoals = gEvents.filter(e => e.teamId === game.homeTeamId && e.type === 'goal').length * 10;
    const matchAwayGoals = gEvents.filter(e => e.teamId === game.awayTeamId && e.type === 'goal').length * 10;
    const hCatch = gEvents.some(e => e.type === 'flag_catch' && e.teamId === game.homeTeamId);
    const aCatch = gEvents.some(e => e.type === 'flag_catch' && e.teamId === game.awayTeamId);

    const sortedEvents = [...gEvents].sort((a, b) => a.videoTime - b.videoTime);
    let setScore: number | null = null;
    const flagReleaseEvent = sortedEvents.find(e => e.type === 'flag_released');
    if (flagReleaseEvent) {
       const preReleaseHome = sortedEvents.filter(e => e.videoTime <= flagReleaseEvent.videoTime && e.teamId === game.homeTeamId && e.type === 'goal').length * 10;
       const preReleaseAway = sortedEvents.filter(e => e.videoTime <= flagReleaseEvent.videoTime && e.teamId === game.awayTeamId && e.type === 'goal').length * 10;
       setScore = Math.max(preReleaseHome, preReleaseAway) + 60;
    }

    const clockIntervals = computeGameClockIntervals(sortedEvents);
    const gameDurationSec = getGameSecondsInWindow(clockIntervals, 0, Infinity);
    const gameTimeStr = `${Math.floor(gameDurationSec / 60)}:${String(Math.floor(gameDurationSec % 60)).padStart(2, '0')}`;

    return {
      homeStats: hStats,
      awayStats: aStats,
      homePairs: hPairs,
      awayPairs: aPairs,
      score: { home: matchHomeGoals + (hCatch ? 35 : 0), away: matchAwayGoals + (aCatch ? 35 : 0), homeCatch: hCatch, awayCatch: aCatch, setScore, gameTimeStr }
    };
  }, [events, players, game, sortKeyHome, sortDirHome, sortKeyAway, sortDirAway, sortKeyHomeP, sortDirHomeP, sortKeyAwayP, sortDirAwayP]);

  const handleSortHome = (k: string) => { if (sortKeyHome === k) setSortDirHome(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKeyHome(k); setSortDirHome('desc'); } };
  const handleSortAway = (k: string) => { if (sortKeyAway === k) setSortDirAway(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKeyAway(k); setSortDirAway('desc'); } };

  const handleSortHomeP = (k: string) => { if (sortKeyHomeP === k) setSortDirHomeP(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKeyHomeP(k); setSortDirHomeP('desc'); } };
  const handleSortAwayP = (k: string) => { if (sortKeyAwayP === k) setSortDirAwayP(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKeyAwayP(k); setSortDirAwayP('desc'); } };

  if (!game) return <div>Game not found.</div>;

  const renderTableHeader = (onSort: any, sortKey: string, sortDir: string) => (
    <tr className="border-b border-gray-200 bg-gray-100">
      <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-gray-500 sticky left-0 bg-gray-100 z-10 min-w-48">Player</th>
      <SortHeader label="MIN" sortKey="minutesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortHeader label="S" sortKey="shots" currentSort={sortKey} currentDir={sortDir} onSort={onSort} tooltip="Total Attempts" />
      <SortHeader label="G" sortKey="goals" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortHeader label="A" sortKey="assists" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortHeader label="PTS" sortKey="points" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortHeader label="TO" sortKey="turnovers" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortHeader label="+" sortKey="plus" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortHeader label="−" sortKey="minus" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortHeader label="+/−" sortKey="plusMinus" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortHeader label="CTRL%" sortKey="controlPctOnField" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
    </tr>
  );

  const renderRow = (row: any) => (
    <tr key={row.playerId} className="border-b border-gray-100/50 hover:bg-red-50/20 transition-colors">
      <td className="px-2 py-1.5 sticky left-0 bg-white z-10 group-hover:bg-red-50/20 text-xs font-bold text-gray-800 truncate">
        <button onClick={() => onPlayerSelect?.(row.playerId)} className="text-blue-600 hover:text-blue-800 hover:underline">
          {row.firstName} {row.lastName}
        </button>
      </td>
      <Cell value={row.minutesPlayed} />
      <Cell value={row.shots} />
      <Cell value={row.goals} />
      <Cell value={row.assists} />
      <Cell value={row.points} />
      <Cell value={row.turnovers} />
      <Cell value={row.plus} />
      <Cell value={row.minus} />
      <Cell value={row.plusMinus} highlight={row.plusMinus > 0 ? 'pos' : row.plusMinus < 0 ? 'neg' : undefined} bold />
      <Cell value={row.controlPctOnField} />
    </tr>
  );

  const renderPairHeader = (onSort: any, sortKey: string, sortDir: string) => (
    <tr className="border-b border-gray-200 bg-gray-100">
      <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-gray-500 sticky left-0 bg-gray-100 z-10 min-w-48">Beater Pair</th>
      <SortHeader label="MIN" sortKey="totalMinutes" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortHeader label="CTRL MIN" sortKey="controlMinutes" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortHeader label="CTRL %" sortKey="controlPct" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortHeader label="+" sortKey="plus" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortHeader label="−" sortKey="minus" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortHeader label="+/−" sortKey="plusMinus" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
    </tr>
  );

  const renderPairRow = (row: any) => (
    <tr key={row.pairKey} className="border-b border-gray-100/50 hover:bg-red-50/20 transition-colors">
      <td className="px-2 py-1.5 sticky left-0 bg-white z-10 group-hover:bg-red-50/20 flex flex-col justify-center gap-0.5">
        <button onClick={() => onPlayerSelect?.(row.player1Id)} className="text-blue-600 hover:text-blue-800 hover:underline text-[11px] font-bold text-left leading-tight truncate max-w-[150px]">
          {row.player1Name}
        </button>
        <button onClick={() => onPlayerSelect?.(row.player2Id)} className="text-blue-600 hover:text-blue-800 hover:underline text-[11px] font-bold text-left leading-tight truncate max-w-[150px]">
          {row.player2Name}
        </button>
      </td>
      <Cell value={row.totalMinutes} />
      <Cell value={row.controlMinutes} />
      <Cell value={row.controlPct} />
      <Cell value={row.plus} />
      <Cell value={row.minus} />
      <Cell value={row.plusMinus} highlight={row.plusMinus > 0 ? 'pos' : row.plusMinus < 0 ? 'neg' : undefined} bold />
    </tr>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500 hover:text-gray-900 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      <div className="bg-white border text-center border-gray-200 rounded-2xl shadow-sm p-8 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-4 left-4 flex flex-col gap-1.5 items-start max-w-[50%]">
          <div className="text-[10px] text-gray-400 tracking-widest uppercase font-bold px-3 py-1 bg-gray-100 rounded-full truncate max-w-full">
            {season?.description || season?.name}
          </div>
          {game?.tag && (
            <div className="text-[10px] text-gray-500 font-bold px-3 py-1 bg-gray-50 uppercase tracking-widest rounded-full border border-gray-100 shadow-sm truncate max-w-full">
              {game.tag}
            </div>
          )}
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-8 md:gap-16 my-4 w-full justify-center">
          <div className="flex flex-col items-center">
            <button onClick={() => onTeamSelect?.(game.homeTeamId)} className="text-2xl font-black text-gray-900 hover:text-blue-600 transition-colors">
              {homeTeam?.name || 'Home Team'}
            </button>
            <div className="text-7xl font-black tracking-tighter tabular-nums text-gray-900 mt-2">
              {score.home}{score.homeCatch && <span className="text-amber-500 text-5xl align-top">*</span>}
            </div>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <div className="text-gray-300 font-bold text-lg hidden md:block">VS</div>
            <div className="text-sm font-bold text-gray-400 font-mono tracking-widest mt-2">{score.gameTimeStr}</div>
            {score.setScore && (
              <div className="text-xs font-semibold text-gray-500 tracking-wider">
                SET {score.setScore}
              </div>
            )}
          </div>
          
          <div className="flex flex-col items-center">
            <button onClick={() => onTeamSelect?.(game.awayTeamId)} className="text-2xl font-black text-gray-900 hover:text-blue-600 transition-colors">
              {awayTeam?.name || 'Away Team'}
            </button>
            <div className="text-7xl font-black tracking-tighter tabular-nums text-gray-900 mt-2">
              {score.away}{score.awayCatch && <span className="text-amber-500 text-5xl align-top">*</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-10">
        {/* Home Box */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center gap-4 border-t-4 border-t-red-500">
            <h3 className="font-bold text-xl text-gray-800 tracking-tight">{homeTeam?.name || 'Home'} Box Score</h3>
          </div>
          
          {/* Home Quadball Stats */}
          <div className="p-0 overflow-x-auto flex-1 bg-white">
            <table className="w-full border-collapse">
              <thead>{renderTableHeader(handleSortHome, sortKeyHome, sortDirHome)}</thead>
              <tbody>{homeStats.map(r => renderRow(r))}</tbody>
            </table>
          </div>

          {/* Home Beater Stats */}
          {homePairs.length > 0 && (
            <div className="p-0 overflow-x-auto bg-white border-t-2 border-gray-100/50">
              <div className="bg-gray-100/80 text-gray-500 text-[10px] uppercase tracking-widest px-4 py-1.5 font-bold border-b border-gray-200 text-center">
                 Beater Pair Box Score
              </div>
              <table className="w-full border-collapse">
                <thead>{renderPairHeader(handleSortHomeP, sortKeyHomeP, sortDirHomeP)}</thead>
                <tbody>{homePairs.map(r => renderPairRow(r))}</tbody>
              </table>
            </div>
          )}
        </div>

        {/* Away Box */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center gap-4 border-t-4 border-t-blue-500">
            <h3 className="font-bold text-xl text-gray-800 tracking-tight">{awayTeam?.name || 'Away'} Box Score</h3>
          </div>
          
          {/* Away Quadball Stats */}
          <div className="p-0 overflow-x-auto flex-1 bg-white">
            <table className="w-full border-collapse">
              <thead>{renderTableHeader(handleSortAway, sortKeyAway, sortDirAway)}</thead>
              <tbody>{awayStats.map(r => renderRow(r))}</tbody>
            </table>
          </div>

          {/* Away Beater Stats */}
          {awayPairs.length > 0 && (
            <div className="p-0 overflow-x-auto bg-white border-t-2 border-gray-100/50">
              <div className="bg-gray-100/80 text-gray-500 text-[10px] uppercase tracking-widest px-4 py-1.5 font-bold border-b border-gray-200 text-center">
                 Beater Pair Box Score
              </div>
              <table className="w-full border-collapse">
                <thead>{renderPairHeader(handleSortAwayP, sortKeyAwayP, sortDirAwayP)}</thead>
                <tbody>{awayPairs.map(r => renderPairRow(r))}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
