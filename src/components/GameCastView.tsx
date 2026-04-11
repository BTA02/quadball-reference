import React, { useState, useMemo } from 'react';
import { discoverGameTeams, buildPlayerTeamMap } from '../lib/statsComputations';
import {
  Trophy, User, Target, Play, Pause, AlertCircle, LogOut, LogIn, CheckCircle2, Flag, Zap, ChevronUp, ChevronDown
} from 'lucide-react';

interface Player { id: string; firstName: string; lastName: string; [k: string]: any; }
interface GameEvent { id: string; videoId: string; gameId: string; type: string; videoTime: number; gameTime?: number; status: string; playerId?: string; subPlayerId?: string; teamId?: string; [k: string]: any; }
interface Team { id: string; name: string; [k: string]: any; }
interface Game { id: string; isVerified?: boolean; seasonId: string; homeTeamId: string; awayTeamId: string; [k: string]: any; }

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// Event styling map
const EVENT_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  goal: { label: 'Goal', icon: <Trophy className="w-4 h-4" />, color: 'bg-green-500' },
  assist: { label: 'Assist', icon: <User className="w-4 h-4" />, color: 'bg-blue-500' },
  shot: { label: 'Shot', icon: <Target className="w-4 h-4" />, color: 'bg-orange-500' },
  gamestart: { label: 'Game Start', icon: <Play className="w-4 h-4" />, color: 'bg-red-600' },
  gamepause: { label: 'Game Pause', icon: <Pause className="w-4 h-4" />, color: 'bg-gray-500' },
  // gameResume removed, unified into gameStart
  foul: { label: 'Foul', icon: <AlertCircle className="w-4 h-4" />, color: 'bg-yellow-500' },
  card: { label: 'Card', icon: <AlertCircle className="w-4 h-4" />, color: 'bg-red-500' },
  sub_in: { label: 'Sub In', icon: <LogIn className="w-4 h-4" />, color: 'bg-green-500' },
  sub_out: { label: 'Sub Out', icon: <LogOut className="w-4 h-4" />, color: 'bg-orange-500' },
  control_change: { label: 'Control Change', icon: <CheckCircle2 className="w-4 h-4" />, color: 'bg-emerald-500' },
  turnover: { label: 'Turnover', icon: <AlertCircle className="w-4 h-4" />, color: 'bg-amber-500' },
  takeaway: { label: 'Takeaway', icon: <Target className="w-4 h-4" />, color: 'bg-cyan-500' },
  flag_released: { label: 'Flag Released', icon: <Flag className="w-4 h-4" />, color: 'bg-yellow-500' },
  seeker_enters: { label: 'Seeker Enters', icon: <Zap className="w-4 h-4" />, color: 'bg-violet-500' },
  flag_catch: { label: 'Flag Caught!', icon: <Flag className="w-4 h-4" />, color: 'bg-yellow-400' },
  gameend: { label: 'Game End', icon: <Trophy className="w-4 h-4" />, color: 'bg-neutral-500' },
  control_start: { label: 'Control Start', icon: <CheckCircle2 className="w-4 h-4" />, color: 'bg-emerald-700' },
  quadball_start: { label: 'Quadball Start', icon: <Play className="w-4 h-4" />, color: 'bg-indigo-500' },
  offense: { label: 'Offense Start', icon: <Play className="w-4 h-4" />, color: 'bg-blue-400' },
  defense: { label: 'Defense Start', icon: <Play className="w-4 h-4" />, color: 'bg-red-400' },
  quadball_possession: { label: 'Quadball Possession', icon: <Play className="w-4 h-4" />, color: 'bg-red-500' }
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function GameCastView({ players, events, teams, games, overrideGameId }: { players: Player[], events: GameEvent[], teams: Team[], games: Game[], overrideGameId?: string }) {
  const [selectedGameId, setSelectedGameId] = useState<string>(overrideGameId || (games.length > 0 ? games[0].id : ''));
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [expandedPossessions, setExpandedPossessions] = useState<Set<string>>(new Set());

  const playerMap = useMemo(() => {
    const map = new Map<string, Player>();
    players.forEach(p => map.set(p.id, p));
    return map;
  }, [players]);

  const teamMap = useMemo(() => {
    const map = new Map<string, Team>();
    teams.forEach(t => map.set(t.id, t));
    return map;
  }, [teams]);

  const { gameEvents, resolvedHomeId, resolvedAwayId, playerTeamMap } = useMemo(() => {
    if (!selectedGameId) return { gameEvents: [], resolvedHomeId: 'home', resolvedAwayId: 'away', playerTeamMap: new Map() };
    
    const game = games.find(g => g.id === selectedGameId);
    if (!game) return { gameEvents: [], resolvedHomeId: 'home', resolvedAwayId: 'away', playerTeamMap: new Map() };

    let rawEvents = events.filter(e => e.gameId === selectedGameId).sort((a, b) => a.videoTime - b.videoTime);
    const { homeTeamId: discHome, awayTeamId: discAway } = discoverGameTeams(rawEvents, game.homeTeamId, game.awayTeamId);
    
    const resolvedHomeId = (discHome === null && discAway) ? 'home_inferred' : (discHome || game.homeTeamId);
    const resolvedAwayId = discAway || game.awayTeamId;
    const playerTeamMap = buildPlayerTeamMap(rawEvents);
    
    // Combine assists and goals if they happen within 5 seconds for the same team
    let gameEvents = rawEvents.map(e => {
       if (e.type === 'goal') {
           const teamId = e.teamId || (e.playerId ? playerTeamMap.get(e.playerId) : undefined);
           const assist = rawEvents.find(o => o.type === 'assist' && Math.abs(o.videoTime - e.videoTime) <= 5 && (o.teamId === teamId || (o.playerId && playerTeamMap.get(o.playerId) === teamId)));
           if (assist) return { ...e, assistedById: assist.playerId };
       }
       return e;
    });
    gameEvents = gameEvents.filter(e => {
       if (e.type === 'assist') {
           const teamId = e.teamId || (e.playerId ? playerTeamMap.get(e.playerId) : undefined);
           const goal = rawEvents.find(o => o.type === 'goal' && Math.abs(o.videoTime - e.videoTime) <= 5 && (o.teamId === teamId || (o.playerId && playerTeamMap.get(o.playerId) === teamId)));
           if (goal) return false;
       }
       return true;
    });

    let currentDbd = '';
    gameEvents.forEach(e => {
        if (e.type === 'control_change') {
            currentDbd = e.teamId || '';
        }
        e.currentDodgeballTeamId = currentDbd;
    });

    return { gameEvents, resolvedHomeId, resolvedAwayId, playerTeamMap };
  }, [selectedGameId, events, games]);

  const getTeamName = (teamId: string) => {
    if (teamId === 'home_inferred') return 'Home Team';
    if (teamId === 'unknown') return 'Unknown Team';
    return teamMap.get(teamId)?.name || teamId;
  };

  const getPlayerName = (pid?: string) => {
    if (!pid) return '';
    const p = playerMap.get(pid);
    return p ? `${p.firstName} ${p.lastName}` : 'Unknown Player';
  };

  const gamesWithNames = useMemo(() => {
    const counts = new Map<string, number>();
    return games.map(g => {
      const homeName = getTeamName(g.homeTeamId);
      const awayName = getTeamName(g.awayTeamId);
      // Sort names alphabetically so "A vs B" gets the same counter as "B vs A" if desired?
      // Actually standard matchKey is fine.
      const matchKey = [g.homeTeamId, g.awayTeamId].sort().join('_vs_');
      const count = (counts.get(matchKey) || 0) + 1;
      counts.set(matchKey, count);
      return {
        ...g,
        displayName: `${homeName} vs ${awayName} #${count}`
      };
    });
  }, [games, teamMap]);

  const years = useMemo(() => {
    const y = new Set<string>();
    games.forEach(g => {
      if (g.seasonId && g.seasonId !== 'unknown_season') y.add(g.seasonId);
    });
    return Array.from(y).sort((a,b) => b.localeCompare(a));
  }, [games]);

  const filteredGames = useMemo(() => {
    let filtered = gamesWithNames;
    if (selectedYear !== 'all') {
      filtered = filtered.filter(g => g.seasonId === selectedYear);
    }
    return filtered;
  }, [gamesWithNames, selectedYear]);

  // Handle selected game ID resets when filtering
  React.useEffect(() => {
    if (filteredGames.length > 0 && !filteredGames.find(g => g.id === selectedGameId)) {
      setSelectedGameId(filteredGames[0].id);
    }
  }, [filteredGames, selectedGameId]);

  // Build grouped events list with running score
  const possessions = useMemo(() => {
    let homeScore = 0;
    let awayScore = 0;
    const groups: any[] = [];
    let currentGroup: any = null;

    gameEvents.forEach((e) => {
      const type = (e.type || '').toLowerCase();
      if (['gamestart', 'gamepause', 'gameend'].includes(type) || type === 'assist') return; // Assists are bundled into goals
      
      let eventTeamId = e.teamId || (e.playerId ? playerTeamMap.get(e.playerId) : undefined) || resolvedHomeId;
      const isHome = eventTeamId === resolvedHomeId;
      const isAway = eventTeamId === resolvedAwayId;

      if (type === 'goal') {
        if (isHome) homeScore += 10;
        else if (isAway) awayScore += 10;
        else homeScore += 10;
      } else if (type === 'flag_catch') {
        if (isHome) homeScore += 30;
        else if (isAway) awayScore += 30;
        else homeScore += 30;
      }

      const displayEvent = { ...e, displayTeamId: eventTeamId, isHome, homeScoreCurrent: homeScore, awayScoreCurrent: awayScore };
      const timeGap = currentGroup ? Math.abs(e.videoTime - currentGroup.endTime) : 0;

      // Group if same team, same type, and relatively close in time (e.g. within 60 seconds)
      if (currentGroup && currentGroup.teamId === eventTeamId && currentGroup.endReason === type && timeGap <= 60) {
        currentGroup.events.push(displayEvent);
        currentGroup.endTime = e.videoTime;
        currentGroup.homeScoreCurrent = homeScore;
        currentGroup.awayScoreCurrent = awayScore;
      } else {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = {
          id: `grp_${e.videoTime}_${eventTeamId}_${Math.random()}`,
          teamId: eventTeamId,
          isHome,
          startTime: e.videoTime,
          endTime: e.videoTime,
          homeScoreCurrent: homeScore,
          awayScoreCurrent: awayScore,
          events: [displayEvent],
          endReason: type
        };
      }
    });

    if (currentGroup) groups.push(currentGroup);
    return groups.reverse();
  }, [gameEvents, playerTeamMap, resolvedHomeId, resolvedAwayId]);

  if (!selectedGameId) {
    return <div className="p-8 text-center text-gray-400">No games available</div>;
  }

  const currentHomeScore = possessions.length > 0 ? possessions[0].homeScoreCurrent : 0;
  const currentAwayScore = possessions.length > 0 ? possessions[0].awayScoreCurrent : 0;

  return (
    <div className={cn("mx-auto space-y-6", overrideGameId ? 'w-full' : 'max-w-4xl p-4')}>
      {/* Game Selector & Scoreboard (Only show if not embedded) */}
      {!overrideGameId && (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-gray-50 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Year:</span>
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
                className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm"
              >
                <option value="all">All Years</option>
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 flex-1 w-full max-w-sm">
              <span className="text-sm font-medium text-gray-700">Game:</span>
              <select 
                value={selectedGameId} 
                onChange={e => setSelectedGameId(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm"
              >
                {filteredGames.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        
          <div className="p-8 flex items-center justify-between text-center">
            <div className="flex-1">
              <div className="text-xl font-bold text-gray-900 mb-2">{getTeamName(resolvedHomeId)}</div>
              <div className="text-5xl font-mono text-red-600">{currentHomeScore}</div>
            </div>
            <div className="px-8 text-gray-400 font-medium">VS</div>
            <div className="flex-1">
              <div className="text-xl font-bold text-gray-900 mb-2">{getTeamName(resolvedAwayId)}</div>
              <div className="text-5xl font-mono text-red-600">{currentAwayScore}</div>
            </div>
          </div>
        </div>
      )}

      {/* Play-by-play list */}
      <div className="flex-1 bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col h-full mt-4">
        <div className="p-3 border-b bg-gray-50 flex justify-between items-center text-gray-700">
          <span className="font-medium text-sm">Game Timeline</span>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2 bg-gray-50/30">
          {possessions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No possessions built for this game.</div>
          ) : (
            possessions.map((poss, i) => {
              const resultLabel = poss.endReason === 'change_of_possession' ? 'Change of Possession' : 
                                  EVENT_CONFIG[poss.endReason]?.label || poss.endReason;
              
              const config = EVENT_CONFIG[poss.endReason] || { label: poss.endReason, icon: <AlertCircle className="w-4 h-4" />, color: 'bg-gray-400 text-gray-600' };

              const hasExpandableEvents = poss.events.length > 0;
              const isExpanded = expandedPossessions.has(poss.id || i.toString());

              return (
                <div key={poss.id || i} className={cn(
                  "flex flex-col text-xs p-2.5 rounded-lg shadow-sm bg-transparent border-l-4 border-r border-y border-r-gray-200 border-y-gray-200 transition-all",
                  poss.isHome ? "border-l-red-500" : "border-l-blue-500"
                )}>
                  <div
                     className={cn("flex items-center justify-between mb-1", hasExpandableEvents && "cursor-pointer group")}
                     onClick={() => {
                       if (!hasExpandableEvents) return;
                       setExpandedPossessions(prev => {
                         const next = new Set(prev);
                         if (next.has(poss.id || i.toString())) next.delete(poss.id || i.toString());
                         else next.add(poss.id || i.toString());
                         return next;
                       });
                     }}
                  >
                    <div className="flex items-center gap-2">
                       <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1", config.color.replace('bg-', 'bg-opacity-20 bg-').replace('text-', 'text-'))}>
                         {React.cloneElement(config.icon as React.ReactElement<any>, { className: 'w-3 h-3' })}
                         <span className="capitalize">{resultLabel}</span>
                       </span>
                       <span className="font-mono text-[10px] text-gray-400 border border-gray-200 px-1 rounded bg-white/50">{formatTime(poss.events[0]?.gameTime ?? poss.startTime)}</span>
                    </div>
                    {hasExpandableEvents && (
                      <span className="text-gray-400 group-hover:text-gray-600 transition-colors">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 ml-1 overflow-hidden">
                     <span className={cn("font-bold truncate", poss.isHome ? "text-red-700" : "text-blue-700")}>
                        {getTeamName(poss.teamId)}
                     </span>
                     <span className="text-gray-400 text-[10px] shrink-0 font-mono ml-auto">
                        Score: {poss.homeScoreCurrent} - {poss.awayScoreCurrent}
                     </span>
                  </div>

                  {/* Expanded Summarized Events Block */}
                  {isExpanded && hasExpandableEvents && (
                     <div className="mt-3 pt-2 border-t border-gray-200/50 space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                        {poss.events.map((ev: any, eventIndex: number) => {
                          const evConfig = EVENT_CONFIG[ev.type as keyof typeof EVENT_CONFIG];
                          const dynamicLabel = (ev.type === 'sub_in' && ev.position) ? `${ev.position} In` : (ev.type === 'sub_out' && ev.position) ? `${ev.position} Out` : evConfig?.label || ev.type;
                          
                          let assistStr = '';
                          if (ev.type === 'goal') {
                               if (ev.assistedById) {
                                   assistStr = ` (Assisted by: ${getPlayerName(ev.assistedById)})`;
                               } else {
                                   assistStr = ` (Unassisted)`;
                               }
                          }

                          return (
                            <div key={ev.id || eventIndex} className="flex items-center gap-2 text-[10px] bg-white/60 p-1.5 rounded border border-white">
                               <span className={cn("w-2 h-2 rounded-full", evConfig?.color)} />
                               <span className="font-mono text-gray-400">{formatTime(ev.gameTime || ev.videoTime)}</span>
                               <span className="font-bold text-gray-600 uppercase tracking-widest px-1">{dynamicLabel}</span>
                               <span className="text-gray-700 font-medium truncate ml-auto">
                                  {getPlayerName(ev.playerId)}{assistStr}
                               </span>
                            </div>
                          );
                        })}
                     </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
