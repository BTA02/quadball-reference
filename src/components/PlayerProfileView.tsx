import React, { useState, useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { 
  computeExtendedStats, computeTeamQuadballStats, computeBeaterSoloStats, 
  computeBeaterPairStats, computeSeekerStats, AdvancedPlayerStats, 
  getScoreboardName, computeBeaterStints, buildPlayerTeamMap, 
  computeControlPeriodsFromEvents, BeaterStint 
} from '../lib/statsComputations';

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

function formatMinutes(min: number): string {
  if (min <= 0) return '—';
  return `${min.toFixed(1)}`;
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return '—';
  const rounded = Math.round(seconds);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}


import { 
  cn, SortDir, sortBy, SortHeader, Cell, SplitHeader, SplitCell,
  StatsTabSelector, StatsTabButton
} from './ui/StatsTable';

// Tighter, grouped spacing for the mS / mAtt / mKO trio so they read as one wide "miss" column
const MISS_GROUP_START = 'pl-2 pr-1 border-l border-gray-200';
const MISS_GROUP_MID = 'px-1';
const MISS_GROUP_END = 'pr-2 pl-1 border-r border-gray-200';

export default function PlayerProfileView({
  players, events, games, seasons, teams, activePlayerId, initialSeasonId, leagues,
  onBack, onTeamSelect, onGameSelect, jerseyNumbers, statsFilter, onSeekToGameVideo
}: {
  players: Player[]; events: GameEvent[]; games: Game[]; seasons: Season[]; teams: Team[];
  activePlayerId: string; initialSeasonId?: string; onBack: () => void;
  onTeamSelect?: (id: string) => void; onGameSelect?: (id: string) => void;
  jerseyNumbers?: string[]; statsFilter?: string; leagues?: League[];
  onSeekToGameVideo?: (gameId: string, videoTime: number) => void;
}) {
  const leaguesList = leagues || [];
  const player = players.find(p => p.id === activePlayerId);
  const [positionTab, setPositionTab] = useState<'quadball' | 'dodgeball' | 'flag'>('quadball');
  const [quadTab, setQuadTab] = useState<'boxscore' | 'rates' | 'advanced' | 'plusminus'>('boxscore');
  const [dodgeTab, setDodgeTab] = useState<'solo' | 'pairs'>('solo');
  const [pairSortKey, setPairSortKey] = useState('totalMinutes');
  const [pairSortDir, setPairSortDir] = useState<SortDir>('desc');
  const [timelineGameId, setTimelineGameId] = useState<string>('');

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

  const baseFilters = useMemo(() => ({ skipRapm: statsFilter === 'verified_events', outlierFilter: 'include' as const }), [statsFilter]);

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

  const allBeatersStats = useMemo(() => {
    if (positionTab !== 'dodgeball' || activeGames.length === 0) return [];
    return computeBeaterSoloStats(activeEvents, players, activeGames, baseFilters);
  }, [activeEvents, players, activeGames, positionTab, baseFilters]);

  const beaterPercentiles = useMemo(() => {
    if (!dodgeSoloStats || allBeatersStats.length === 0) return null;
    
    const relevantBeaters = allBeatersStats.filter(s => s.totalMinutes > 0.5);
    if (relevantBeaters.length === 0) return null;

    const getPercentile = (field: 'bva' | 'rapm' | 'controlPct', value: number) => {
      const values = relevantBeaters.map(b => b[field] as number).sort((a, b) => a - b);
      const count = values.length;
      if (count <= 1) return 50; 

      const rank = values.findIndex(v => v >= value);
      const pct = (rank / (count - 1)) * 100;
      return Math.round(pct);
    };

    const activePer20 = dodgeSoloStats.totalMinutes > 0 ? (dodgeSoloStats.plusMinus / dodgeSoloStats.totalMinutes) * 20 : 0;
    const allPer20s = relevantBeaters.map(b => b.totalMinutes > 0 ? (b.plusMinus / b.totalMinutes) * 20 : 0).sort((a, b) => a - b);
    const per20Rank = allPer20s.findIndex(v => v >= activePer20);
    const per20Pct = allPer20s.length > 1 ? Math.round((per20Rank / (allPer20s.length - 1)) * 100) : 50;

    return {
      bcl: getPercentile('bva', dodgeSoloStats.bva),
      rapm: getPercentile('rapm', dodgeSoloStats.rapm),
      controlPct: getPercentile('controlPct', dodgeSoloStats.controlPct),
      plusMinusPerTwenty: per20Pct,
      bclVal: dodgeSoloStats.bva,
      rapmVal: dodgeSoloStats.rapm,
      controlPctVal: dodgeSoloStats.controlPct,
      plusMinusPerTwentyVal: activePer20
    };
  }, [dodgeSoloStats, allBeatersStats]);

  const dodgeGames = useMemo(() => {
    return activeGames.filter(g => events.some(e => e.gameId === g.id && (e.playerId === activePlayerId || e.subPlayerId === activePlayerId)));
  }, [activeGames, events, activePlayerId]);

  const activeTimelineGameId = timelineGameId || dodgeGames[0]?.id || '';

  const timelineGameEvents = useMemo(() => {
    if (!activeTimelineGameId) return [];
    return events.filter(e => e.gameId === activeTimelineGameId).sort((a,b) => a.videoTime - b.videoTime);
  }, [events, activeTimelineGameId]);

  const timelinePlayerTeamId = useMemo(() => {
    if (timelineGameEvents.length === 0) return '';
    const map = buildPlayerTeamMap(timelineGameEvents);
    const pidTeam = map.get(activePlayerId);
    if (pidTeam) return pidTeam;
    return timelineGameEvents.find(e => e.playerId === activePlayerId && e.teamId && e.teamId !== 'null')?.teamId || '';
  }, [timelineGameEvents, activePlayerId]);

  const timelineGameEndTime = useMemo(() => {
    if (timelineGameEvents.length === 0) return 0;
    const endEvent = timelineGameEvents.find(e => e.type === 'gameend' || e.type === 'periodend');
    return endEvent ? endEvent.videoTime : Math.max(...timelineGameEvents.map(e => e.videoTime));
  }, [timelineGameEvents]);

  const { gameStartTime, gameDuration } = useMemo(() => {
    if (timelineGameEvents.length === 0) return { gameStartTime: 0, gameDuration: 1 };
    const gameStartEvent = timelineGameEvents.find(e => (e.type || '').toLowerCase() === 'gamestart');
    const start = gameStartEvent?.videoTime ?? timelineGameEvents[0]?.videoTime ?? 0;
    const dur = Math.max(1, timelineGameEndTime - start);
    return { gameStartTime: start, gameDuration: dur };
  }, [timelineGameEvents, timelineGameEndTime]);

  const getPercent = (t: number) => {
    const tRel = Math.max(0, t - gameStartTime);
    return (tRel / gameDuration) * 100;
  };

  const timelineStints = useMemo(() => {
    if (!activeTimelineGameId || !timelinePlayerTeamId) return [];
    const map = buildPlayerTeamMap(timelineGameEvents);
    return computeBeaterStints(timelineGameEvents, timelinePlayerTeamId, activeTimelineGameId, timelineGameEndTime, map);
  }, [timelineGameEvents, activeTimelineGameId, timelinePlayerTeamId, timelineGameEndTime]);

  const playerStints = useMemo(() => {
    return timelineStints.filter(s => s.playerId === activePlayerId);
  }, [timelineStints, activePlayerId]);

  const chaserStints = useMemo(() => {
    if (!activeTimelineGameId || !timelinePlayerTeamId) return [];
    
    const gameEvents = timelineGameEvents;
    const playerId = activePlayerId;
    const teamId = timelinePlayerTeamId;
    
    // Find if the player started the game on the pitch
    let started = false;
    const firstSub = gameEvents.find(e => (e.type === 'sub_in' || e.type === 'sub_out') && e.playerId === playerId);
    if (firstSub) {
      if (firstSub.type === 'sub_out') {
        started = true;
      }
    } else {
      // If there are game events recorded for them, they must have started
      const hasEvents = gameEvents.some(e => e.playerId === playerId && e.type !== 'sub_in' && e.type !== 'sub_out');
      if (hasEvents) {
        started = true;
      }
    }

    // But wait, what if they had a game event before their first sub_in?
    const firstSubIn = gameEvents.find(e => e.type === 'sub_in' && e.playerId === playerId);
    if (firstSubIn) {
      const hasEventBeforeSubIn = gameEvents.some(e => e.playerId === playerId && e.type !== 'sub_in' && e.type !== 'sub_out' && e.videoTime < firstSubIn.videoTime);
      if (hasEventBeforeSubIn) {
        started = true;
      }
    }

    const gameStartEvent = gameEvents.find(e => (e.type || '').toLowerCase() === 'gamestart');
    const chaserGameStart = gameStartEvent?.videoTime ?? gameEvents[0]?.videoTime ?? 0;

    const stints: { playerId: string; teamId: string; gameId: string; startTime: number; endTime: number; position?: string }[] = [];
    let currentStart: { time: number; position?: string } | null = null;

    if (started) {
      const firstOutSub = gameEvents.find(e => e.type === 'sub_out' && e.playerId === playerId);
      currentStart = { time: chaserGameStart, position: firstOutSub?.position };
    }

    // Go through all events to track subs
    const subs = gameEvents.filter(e => (e.type === 'sub_in' || e.type === 'sub_out') && e.playerId === playerId)
                           .sort((a, b) => a.videoTime - b.videoTime);

    for (const e of subs) {
      if (e.type === 'sub_out') {
        if (currentStart) {
          stints.push({
            playerId,
            teamId,
            gameId: activeTimelineGameId,
            startTime: currentStart.time,
            endTime: e.videoTime,
            position: currentStart.position || e.position
          });
          currentStart = null;
        }
      } else if (e.type === 'sub_in') {
        currentStart = { time: e.videoTime, position: e.position };
      }
    }

    if (currentStart) {
      stints.push({
        playerId,
        teamId,
        gameId: activeTimelineGameId,
        startTime: currentStart.time,
        endTime: timelineGameEndTime,
        position: currentStart.position
      });
    }

    // Filter out any stints where the position was explicitly 'beater' or 'seeker'
    return stints.filter(s => s.position !== 'beater' && s.position !== 'seeker');
  }, [timelineGameEvents, activeTimelineGameId, timelinePlayerTeamId, timelineGameEndTime, activePlayerId]);

  const timelineControlPeriods = useMemo(() => {
    if (!activeTimelineGameId) return [];
    return computeControlPeriodsFromEvents(timelineGameEvents);
  }, [timelineGameEvents, activeTimelineGameId]);

  // gameStartTime, gameDuration, and getPercent moved above to prevent initialization TDZ issues

  const seekerStints = useMemo(() => {
    if (!activeTimelineGameId || !timelinePlayerTeamId) return [];
    
    const gameEvents = timelineGameEvents;
    const playerId = activePlayerId;
    const teamId = timelinePlayerTeamId;
    
    const stints: { playerId: string; teamId: string; gameId: string; startTime: number; endTime: number; position?: string }[] = [];
    let onField = false;
    let stintStart = 0;

    for (const e of gameEvents) {
      if (e.playerId !== playerId) continue;
      if (e.type === 'sub_in' && e.position === 'seeker') {
        if (!onField) {
          onField = true;
          stintStart = e.videoTime;
        }
      } else if (e.type === 'sub_out') {
        if (onField) {
          stints.push({
            playerId,
            teamId,
            gameId: activeTimelineGameId,
            startTime: stintStart,
            endTime: e.videoTime,
            position: 'seeker'
          });
          onField = false;
        }
      }
    }
    
    if (onField) {
      stints.push({
        playerId,
        teamId,
        gameId: activeTimelineGameId,
        startTime: stintStart,
        endTime: timelineGameEndTime,
        position: 'seeker'
      });
    }

    if (stints.length === 0) {
      const flagReleased = gameEvents.find(e => e.type === 'flag_released');
      const catchEvent = gameEvents.find(e => e.type === 'flag_catch' && e.playerId === playerId);
      if (flagReleased) {
        stints.push({
          playerId,
          teamId,
          gameId: activeTimelineGameId,
          startTime: flagReleased.videoTime,
          endTime: catchEvent?.videoTime ?? timelineGameEndTime,
          position: 'seeker'
        });
      }
    }

    return stints;
  }, [timelineGameEvents, activeTimelineGameId, timelinePlayerTeamId, timelineGameEndTime, activePlayerId]);

  const flagTimelineData = useMemo(() => {
    if (!activeTimelineGameId || timelineGameEvents.length === 0) {
      return { flagStartTime: null, flagEndTime: null, flagDuration: 1, flagCatchEvent: null };
    }
    const flagReleasedEvent = timelineGameEvents.find(e => e.type === 'flag_released');
    const flagCatchEvent = timelineGameEvents.find(e => e.type === 'flag_catch');
    
    const start = flagReleasedEvent ? flagReleasedEvent.videoTime : (seekerStints[0]?.startTime ?? gameStartTime);
    const end = flagCatchEvent ? flagCatchEvent.videoTime : timelineGameEndTime;
    const duration = Math.max(1, end - start);
    
    return {
      flagStartTime: start,
      flagEndTime: end,
      flagDuration: duration,
      flagCatchEvent
    };
  }, [timelineGameEvents, activeTimelineGameId, seekerStints, gameStartTime, timelineGameEndTime]);

  const flagStints = useMemo(() => {
    const { flagStartTime: fStart, flagEndTime: fEnd } = flagTimelineData;
    if (fStart === null || fEnd === null) return [];
    return seekerStints.map(s => {
      const start = Math.max(fStart, s.startTime);
      const end = Math.min(fEnd, s.endTime);
      if (start < end) {
        return { ...s, displayStart: start, displayEnd: end };
      }
      return null;
    }).filter((s): s is NonNullable<typeof s> => s !== null);
  }, [seekerStints, flagTimelineData]);

  const flagControlPeriods = useMemo(() => {
    const { flagStartTime: fStart, flagEndTime: fEnd } = flagTimelineData;
    if (fStart === null || fEnd === null) return [];
    return timelineControlPeriods.map(cp => {
      const start = Math.max(fStart, cp.startTime);
      const end = Math.min(fEnd, cp.endTime);
      if (start < end) {
        return { ...cp, displayStart: start, displayEnd: end };
      }
      return null;
    }).filter((cp): cp is NonNullable<typeof cp> => cp !== null);
  }, [timelineControlPeriods, flagTimelineData]);

  const getFlagPercent = (t: number) => {
    const { flagStartTime, flagEndTime, flagDuration } = flagTimelineData;
    if (flagStartTime === null || flagEndTime === null) return 0;
    const clampedT = Math.max(flagStartTime, Math.min(flagEndTime, t));
    const tRel = clampedT - flagStartTime;
    return (tRel / flagDuration) * 100;
  };


  const stintGoals = (startTime: number, endTime: number) => {
    const goals = timelineGameEvents.filter(e => {
      const type = (e.type || '').toLowerCase();
      const isGoal = type.includes('goal') || type === 'away_goal' || type === 'home_goal';
      return isGoal && e.videoTime >= startTime && e.videoTime <= endTime;
    });
    let teamGoals = 0;
    let oppGoals = 0;
    goals.forEach(g => {
      if (g.teamId === timelinePlayerTeamId) {
        teamGoals++;
      } else {
        oppGoals++;
      }
    });
    return { teamGoals, oppGoals };
  };

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

         const pStatAny = pStat as any;
         if (pStat && ((pStatAny.gamesPlayed || 0) > 0 || (pStatAny.minutesPlayed || 0) > 0 || (pStatAny.totalMinutes || 0) > 0 || (pStatAny.stints || 0) > 0)) {
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
      const pStatAny = pStat as any;
      if (pStat && ((pStatAny.gamesPlayed || 0) > 0 || (pStatAny.minutesPlayed || 0) > 0 || (pStatAny.totalMinutes || 0) > 0 || (pStatAny.stints || 0) > 0)) {
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
    const pStatAny = pStat as any;
    return pStat && ((pStatAny.gamesPlayed || 0) > 0 || (pStatAny.minutesPlayed || 0) > 0 || (pStatAny.totalMinutes || 0) > 0 || (pStatAny.stints || 0) > 0) ? pStat : null;
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
          <SortHeader label="BVA" sortKey="bva" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
        </>
      )}
      {positionTab === 'flag' && (
        <>
          <SortHeader label="CTH" sortKey="catches" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Flag Catches" />
          <SortHeader label="OpCTH" sortKey="opponentCatches" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Opponent Catches While On Pitch" />
          <SortHeader label="C%" sortKey="catchPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Catch %" />
          <SortHeader label="AVG CTH" sortKey="avgTimeToCatch" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Avg Time to Catch (time on field)" />
          <SortHeader label="FROM REL" sortKey="avgTimeFromRelease" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Avg Time from Flag Release" />
          <SortHeader label="CTRL%" sortKey="controlPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Team Bludger Control % While Seeking" />
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
          <Cell value={row.bva > 0 ? `+${row.bva}` : row.bva || '0'} bold highlight={row.bva > 0 ? 'pos' : row.bva < 0 ? 'neg' : undefined} />
        </>
      )}
      {positionTab === 'flag' && (
        <>
          <Cell value={row.catches} highlight={row.catches > 0 ? 'gold' : undefined} bold />
          <Cell value={row.opponentCatches} highlight={row.opponentCatches > 0 ? 'neg' : undefined} />
          <Cell value={`${row.catchPct}%`} highlight={row.catchPct >= 60 ? 'pos' : row.catchPct <= 30 ? 'neg' : undefined} bold />
          <Cell value={formatTime(row.avgTimeToCatch)} />
          <Cell value={formatTime(row.avgTimeFromRelease)} />
          <Cell value={`${row.controlPct}%`} highlight={row.controlPct >= 60 ? 'pos' : row.controlPct <= 30 ? 'neg' : undefined} />
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
          <SortHeader label="BCL" sortKey="bcl" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
        </>
      )}
      {positionTab === 'flag' && (
        <>
          <SortHeader label="CTH" sortKey="catches" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Flag Catches" />
          <SortHeader label="OpCTH" sortKey="opponentCatches" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Opponent Catches While On Pitch" />
          <SortHeader label="C%" sortKey="catchPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Catch %" />
          <SortHeader label="AVG CTH" sortKey="avgTimeToCatch" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Avg Time to Catch (time on field)" />
          <SortHeader label="FROM REL" sortKey="avgTimeFromRelease" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Avg Time from Flag Release" />
          <SortHeader label="CTRL%" sortKey="controlPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Team Bludger Control % While Seeking" />
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
          <Cell value={row.totalMinutes > 0 ? Math.round((row.plusMinus / row.totalMinutes) * 20 * 10) / 10 : 0} />
          <Cell value={row.bcl > 0 ? `+${row.bcl}` : row.bcl || '0'} bold highlight={row.bcl > 0 ? 'pos' : row.bcl < 0 ? 'neg' : undefined} />
        </>
      )}
      {positionTab === 'flag' && (
        <>
          <Cell value={row.catches} highlight={row.catches > 0 ? 'gold' : undefined} bold />
          <Cell value={row.opponentCatches} highlight={row.opponentCatches > 0 ? 'neg' : undefined} />
          <Cell value={`${row.catchPct}%`} highlight={row.catchPct >= 60 ? 'pos' : row.catchPct <= 30 ? 'neg' : undefined} bold />
          <Cell value={formatTime(row.avgTimeToCatch)} />
          <Cell value={formatTime(row.avgTimeFromRelease)} />
          <Cell value={`${row.controlPct}%`} highlight={row.controlPct >= 60 ? 'pos' : row.controlPct <= 30 ? 'neg' : undefined} />
        </>
      )}
    </tr>
  );

  // Compute teams played for, grouped by league
  const teamsByLeague = useMemo(() => {
    const leagues: Record<string, { id: string; name: string; nickname?: string; colorPrimary?: string; colorPrimaryDark?: string }[]> = {};
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
            <StatsTabButton isFirst active={positionTab === 'quadball'} onClick={() => setPositionTab('quadball')} label="Quadball" activeClass="bg-emerald-600 text-white" />
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
                      <QuadHeaderCell label="GP" sortKey="gamesPlayed" tooltip="Games Played" />
                      <QuadHeaderCell label="MIN" sortKey="minutesPlayed" tooltip="Minutes Played" />
                      <QuadHeaderCell label="G" sortKey="goals" tooltip="Goals" />
                      <QuadHeaderCell label="A" sortKey="assists" tooltip="Assists" />
                      <QuadHeaderCell label="mTOT" sortKey="missTotal" tooltip="Miss Total (mS + mAtt + mKO)" />
                      <QuadHeaderCell label="S%" sortKey="shotPct" tooltip="Scoring % (Goals / (Goals + Shots + Attempts + KOs))" />
                      <QuadHeaderCell label="mS" sortKey="shots" tooltip="Missed Shot (throws)" className={MISS_GROUP_START} />
                      <QuadHeaderCell label="mAtt" sortKey="attempts" tooltip="Missed Attempt (drives/physical attacks)" className={MISS_GROUP_MID} />
                      <QuadHeaderCell label="mKO" sortKey="missKo" tooltip="Missed by Knockout" className={MISS_GROUP_END} />
                      <QuadHeaderCell label="TO" sortKey="turnovers" tooltip="Turnovers" />
                      <QuadHeaderCell label="CTRL%" sortKey="controlPctOnField" tooltip="Team Bludger Control % While On Field" />
                    </>) : quadTab === 'rates' ? (<>
                      <QuadHeaderCell label="GP" sortKey="gamesPlayed" tooltip="Games Played" />
                      <QuadHeaderCell label="MIN" sortKey="minutesPlayed" tooltip="Minutes Played" />
                      <QuadHeaderCell label="G/G" sortKey="goalsPerGame" tooltip="Goals per Game" />
                      <QuadHeaderCell label="A/G" sortKey="assistsPerGame" tooltip="Assists per Game" />
                      <QuadHeaderCell label="PTS/G" sortKey="pointsPerGame" tooltip="Points per Game" />
                      <QuadHeaderCell label="G/20" sortKey="goalsPerTwenty" tooltip="Goals per 20 Minutes" />
                      <QuadHeaderCell label="A/20" sortKey="assistsPerTwenty" tooltip="Assists per 20 Minutes" />
                      <QuadHeaderCell label="PTS/20" sortKey="pointsPerTwenty" tooltip="Points per 20 Minutes" />
                      <QuadHeaderCell label="G/25" sortKey="goalsPer25Possessions" tooltip="Goals per 25 Possessions" />
                      <QuadHeaderCell label="A/25" sortKey="assistsPer25Possessions" tooltip="Assists per 25 Possessions" />
                      <QuadHeaderCell label="PTS/25" sortKey="pointsPer25Possessions" tooltip="Points per 25 Possessions" />
                    </>) : quadTab === 'advanced' ? (<>
                      <QuadHeaderCell label="GP" sortKey="gamesPlayed" tooltip="Games Played" />
                      <QuadHeaderCell label="MIN" sortKey="minutesPlayed" tooltip="Minutes Played" />
                      <QuadHeaderCell label="ORTG" sortKey="oRtg" tooltip="Offensive Rating (Points scored per 25 offensive possessions while on field)" />
                      <QuadHeaderCell label="DRTG" sortKey="dRtg" tooltip="Defensive Rating (Points conceded per 25 defensive possessions while on field)" />
                      <QuadHeaderCell label="NET" sortKey="netRtg" tooltip="Net Rating (ORTG - DRTG)" />
                      <QuadHeaderCell label="RAPM" sortKey="rapm" tooltip="Regularized Adjusted Plus-Minus" />
                      <QuadHeaderCell label="CVA" sortKey="cva" tooltip="Chaser Value Added (Overall estimated goals added/saved per 20 minutes vs league average chaser)" />
                      <QuadHeaderCell label="EPR" sortKey="epr" tooltip="Empty Possession Rate (Empty Turnovers / Offensive Possessions)" />
                      <QuadHeaderCell label="fEPR" sortKey="fEpr" tooltip="Forced Empty Possession Rate (Opponent Empty Turnovers / Defensive Possessions)" />
                      <QuadHeaderCell label="USG%" sortKey="usgPct" tooltip="Usage Rate (Estimates % of team possessions player is involved in while on field)" />
                      <QuadHeaderCell label="GmSc" sortKey="gameScore" tooltip="Game Score (Composite single-number rating of productivity)" />
                    </>) : (<>
                      <QuadHeaderCell label="GP" sortKey="gamesPlayed" tooltip="Games Played" />
                      <QuadHeaderCell label="MIN" sortKey="minutesPlayed" tooltip="Minutes Played" />
                      <QuadHeaderCell label="+" sortKey="plus" tooltip="Goals scored while on field" />
                      <QuadHeaderCell label="−" sortKey="minus" tooltip="Goals conceded while on field" />
                      <QuadHeaderCell label="+:−" sortKey="plusMinusRatio" tooltip="Ratio of Plus to Minus" />
                      <QuadHeaderCell label="Off+:−" sortKey="offPlusMinusRatio" tooltip="Ratio of Plus to Minus while player is off the field" />
                      <QuadHeaderCell label="REL +:−" sortKey="relPlusMinusRatio" tooltip="Relative Value (Your +:− Ratio vs. your team's when you are off)" />
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
                      <Cell value={quadStats.goals} bold />
                      <Cell value={quadStats.assists} bold />
                      <Cell value={quadStats.missTotal} />
                      <Cell value={`${quadStats.shotPct}%`} />
                      <Cell value={quadStats.shots} className={MISS_GROUP_START} />
                      <Cell value={quadStats.attempts} className={MISS_GROUP_MID} />
                      <Cell value={quadStats.missKo} className={MISS_GROUP_END} />
                      <Cell value={quadStats.turnovers} />
                      <Cell value={`${quadStats.controlPctOnField}%`} />
                    </>) : quadTab === 'rates' ? (<>
                      <Cell value={quadStats.gamesPlayed} />
                      <Cell value={quadStats.minutesPlayed} />
                      <Cell value={quadStats.goalsPerGame} />
                      <Cell value={quadStats.assistsPerGame} />
                      <Cell value={quadStats.pointsPerGame} bold />
                      <Cell value={quadStats.goalsPerTwenty} />
                      <Cell value={quadStats.assistsPerTwenty} />
                      <Cell value={quadStats.pointsPerTwenty} bold />
                      <Cell value={quadStats.goalsPer25Possessions} />
                      <Cell value={quadStats.assistsPer25Possessions} />
                      <Cell value={quadStats.pointsPer25Possessions} bold />
                    </>) : quadTab === 'advanced' ? (<>
                      <Cell value={quadStats.gamesPlayed} />
                      <Cell value={quadStats.minutesPlayed} />
                      <Cell value={quadStats.oRtg} />
                      <Cell value={quadStats.dRtg} />
                      <Cell value={quadStats.netRtg > 0 ? `+${quadStats.netRtg}` : quadStats.netRtg || 'E'} bold highlight={quadStats.netRtg > 0 ? 'pos' : quadStats.netRtg < 0 ? 'neg' : undefined} />
                      <Cell value={quadStats.rapm > 0 ? `+${quadStats.rapm}` : quadStats.rapm || 'E'} bold highlight={quadStats.rapm > 0 ? 'pos' : quadStats.rapm < 0 ? 'neg' : undefined} />
                      <Cell value={quadStats.cva > 0 ? `+${quadStats.cva}` : quadStats.cva || '0'} bold highlight={quadStats.cva > 0 ? 'pos' : quadStats.cva < 0 ? 'neg' : undefined} />
                      <Cell value={`${quadStats.epr}%`} />
                      <Cell value={`${quadStats.fEpr}%`} />
                      <Cell value={`${quadStats.usgPct}%`} />
                      <Cell value={quadStats.gameScore} bold />
                    </>) : (<>
                      <Cell value={quadStats.gamesPlayed} />
                      <Cell value={quadStats.minutesPlayed} />
                      <Cell value={quadStats.plus} />
                      <Cell value={quadStats.minus} />
                      <Cell value={quadStats.plusMinusRatio === Infinity ? '∞' : quadStats.plusMinusRatio} />
                      <Cell value={quadStats.offPlusMinusRatio === Infinity ? '∞' : quadStats.offPlusMinusRatio} />
                      <Cell value={quadStats.relPlusMinusRatio > 0 ? `+${quadStats.relPlusMinusRatio}` : quadStats.relPlusMinusRatio || 'E'} highlight={quadStats.relPlusMinusRatio > 0 ? 'pos' : quadStats.relPlusMinusRatio < 0 ? 'neg' : undefined} />
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
                    <QuadHeaderCell label="GP" sortKey="gamesPlayed" tooltip="Games Played" />
                    <QuadHeaderCell label="+" sortKey="plus" tooltip="Plus" />
                    <QuadHeaderCell label="−" sortKey="minus" tooltip="Minus" />
                    <QuadHeaderCell label="+/−" sortKey="plusMinus" tooltip="Plus / Minus" />
                    <QuadHeaderCell label="CTRL" sortKey="controlMinutes" tooltip="Control Minutes" />
                    <QuadHeaderCell label="TOT" sortKey="totalMinutes" tooltip="Total Minutes" />
                    <QuadHeaderCell label="CTRL%" sortKey="controlPct" tooltip="Control % (Percentage of possession time team has active Dodgeball Control)" />
                    <QuadHeaderCell label="+:−" sortKey="plusMinusRatio" tooltip="Ratio of Plus to Minus" />
                    <QuadHeaderCell label="Off+:−" sortKey="offPlusMinusRatio" tooltip="Ratio of Plus to Minus while off the field" />
                    <QuadHeaderCell label="REL +:−" sortKey="relPlusMinusRatio" tooltip="Relative Value (Your +:− Ratio vs. your team's when you are off)" />
                    <QuadHeaderCell label="RAPM" sortKey="rapm" tooltip="Regularized Adjusted Plus-Minus" />
                    <QuadHeaderCell label="EPR" sortKey="epr" tooltip="Empty Possession Rate (while on field)" />
                    <QuadHeaderCell label="fEPR" sortKey="fEpr" tooltip="Forced Empty Possession Rate (while on field)" />
                    <QuadHeaderCell label="BVA" sortKey="bva" tooltip="Beater Value Added (Overall estimated goals added/saved per 20 minutes of possession vs league average beater)" />
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                    <td className="px-2 py-1.5 sticky left-0 bg-white z-10 font-bold text-gray-900 text-xs truncate">
                      {player.firstName} {player.lastName}
                    </td>
                    <Cell value={dodgeSoloStats.gamesPlayed} />
                    <Cell value={dodgeSoloStats.plus} highlight={dodgeSoloStats.plus > 0 ? 'pos' : undefined} />
                    <Cell value={dodgeSoloStats.minus} highlight={dodgeSoloStats.minus > 0 ? 'neg' : undefined} />
                    <Cell value={dodgeSoloStats.plusMinus > 0 ? `+${dodgeSoloStats.plusMinus}` : dodgeSoloStats.plusMinus || 'E'} bold highlight={dodgeSoloStats.plusMinus > 0 ? 'pos' : dodgeSoloStats.plusMinus < 0 ? 'neg' : undefined} />
                    <Cell value={dodgeSoloStats.controlMinutes} />
                    <Cell value={dodgeSoloStats.totalMinutes} />
                    <Cell value={`${dodgeSoloStats.controlPct}%`} bold highlight={dodgeSoloStats.controlPct >= 55 ? 'pos' : dodgeSoloStats.controlPct <= 45 ? 'neg' : undefined} />
                    <Cell value={dodgeSoloStats.plusMinusRatio === Infinity ? '∞' : dodgeSoloStats.plusMinusRatio} />
                    <Cell value={dodgeSoloStats.offPlusMinusRatio === Infinity ? '∞' : dodgeSoloStats.offPlusMinusRatio} />
                    <Cell value={dodgeSoloStats.relPlusMinusRatio > 0 ? `+${dodgeSoloStats.relPlusMinusRatio}` : dodgeSoloStats.relPlusMinusRatio || 'E'} highlight={dodgeSoloStats.relPlusMinusRatio > 0 ? 'pos' : dodgeSoloStats.relPlusMinusRatio < 0 ? 'neg' : undefined} />
                    <Cell value={dodgeSoloStats.rapm} bold highlight={dodgeSoloStats.rapm > 0 ? 'pos' : dodgeSoloStats.rapm < 0 ? 'neg' : undefined} />
                    <Cell value={`${dodgeSoloStats.epr}%`} highlight={dodgeSoloStats.epr < 40 ? 'pos' : dodgeSoloStats.epr > 55 ? 'neg' : undefined} />
                    <Cell value={`${dodgeSoloStats.fEpr}%`} highlight={dodgeSoloStats.fEpr > 55 ? 'pos' : undefined} />
                    <Cell value={dodgeSoloStats.bva > 0 ? `+${dodgeSoloStats.bva}` : dodgeSoloStats.bva || '0'} bold highlight={dodgeSoloStats.bva > 0 ? 'pos' : dodgeSoloStats.bva < 0 ? 'neg' : undefined} />
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
                    <SortHeader label="GP" sortKey="gamesPlayed" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} tooltip="Games Played" />
                    <SortHeader label="+" sortKey="plus" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} tooltip="Plus" />
                    <SortHeader label="−" sortKey="minus" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} tooltip="Minus" />
                    <SortHeader label="+/−" sortKey="plusMinus" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} tooltip="Plus / Minus" />
                    <SortHeader label="CTRL" sortKey="controlMinutes" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} tooltip="Control Minutes" />
                    <SortHeader label="TOT" sortKey="totalMinutes" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} tooltip="Total Minutes" />
                    <SortHeader label="CTRL%" sortKey="controlPct" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} tooltip="Control % (Percentage of possession time team has active Dodgeball Control)" />
                    <SortHeader label="+:−" sortKey="plusMinusRatio" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} tooltip="Ratio of Plus to Minus" />
                    <SortHeader label="Off+:−" sortKey="offPlusMinusRatio" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} tooltip="Ratio of Plus to Minus while off the field" />
                    <SortHeader label="REL +:−" sortKey="relPlusMinusRatio" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} tooltip="Relative Value (Your +:− Ratio vs. your team's when you are off)" />
                    <SortHeader label="RAPM" sortKey="rapm" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} tooltip="Regularized Adjusted Plus-Minus" />
                    <SortHeader label="EPR" sortKey="epr" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} tooltip="Empty Possession Rate (while on field)" />
                    <SortHeader label="fEPR" sortKey="fEpr" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} tooltip="Forced Empty Possession Rate (while on field)" />
                    <SortHeader label="BVA" sortKey="bva" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} tooltip="Beater Value Added (Overall estimated goals added/saved per 20 minutes of possession vs league average beater)" />
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
                      <Cell value={pStat.gamesPlayed} />
                      <Cell value={pStat.plus} highlight={pStat.plus > 0 ? 'pos' : undefined} />
                      <Cell value={pStat.minus} highlight={pStat.minus > 0 ? 'neg' : undefined} />
                      <Cell value={pStat.plusMinus > 0 ? `+${pStat.plusMinus}` : pStat.plusMinus || 'E'} bold highlight={pStat.plusMinus > 0 ? 'pos' : pStat.plusMinus < 0 ? 'neg' : undefined} />
                      <Cell value={pStat.controlMinutes} />
                      <Cell value={pStat.totalMinutes} />
                      <Cell value={`${pStat.controlPct}%`} bold highlight={pStat.controlPct >= 55 ? 'pos' : pStat.controlPct <= 45 ? 'neg' : undefined} />
                      <Cell value={pStat.plusMinusRatio === Infinity ? '∞' : pStat.plusMinusRatio} />
                      <Cell value={pStat.offPlusMinusRatio === Infinity ? '∞' : pStat.offPlusMinusRatio} />
                      <Cell value={pStat.relPlusMinusRatio > 0 ? `+${pStat.relPlusMinusRatio}` : pStat.relPlusMinusRatio || 'E'} highlight={pStat.relPlusMinusRatio > 0 ? 'pos' : pStat.relPlusMinusRatio < 0 ? 'neg' : undefined} />
                      <Cell value={pStat.rapm} bold highlight={pStat.rapm > 0 ? 'pos' : pStat.rapm < 0 ? 'neg' : undefined} />
                      <Cell value={`${pStat.epr}%`} highlight={pStat.epr < 40 ? 'pos' : pStat.epr > 55 ? 'neg' : undefined} />
                      <Cell value={`${pStat.fEpr}%`} highlight={pStat.fEpr > 55 ? 'pos' : undefined} />
                      <Cell value={pStat.bva > 0 ? `+${pStat.bva}` : pStat.bva || '0'} bold highlight={pStat.bva > 0 ? 'pos' : pStat.bva < 0 ? 'neg' : undefined} />
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
                    <SortHeader label="GP" sortKey="gamesPlayed" currentSort="" currentDir="asc" onSort={() => {}} tooltip="Games Played (as Seeker)" />
                    <SortHeader label="CTH" sortKey="catches" currentSort="" currentDir="asc" onSort={() => {}} tooltip="Flag Catches" />
                    <SortHeader label="OpCTH" sortKey="opponentCatches" currentSort="" currentDir="asc" onSort={() => {}} tooltip="Opponent Catches While On Pitch" />
                    <SortHeader label="C%" sortKey="catchPct" currentSort="" currentDir="asc" onSort={() => {}} tooltip="Catch %" />
                    <SortHeader label="MIN/G" sortKey="avgMinPerGame" currentSort="" currentDir="asc" onSort={() => {}} tooltip="Avg Minutes Per Game as Seeker" />
                    <SortHeader label="AVG CTH" sortKey="avgTimeToCatch" currentSort="" currentDir="asc" onSort={() => {}} tooltip="Avg Time to Catch (time on field)" />
                    <SortHeader label="FROM REL" sortKey="avgTimeFromRelease" currentSort="" currentDir="asc" onSort={() => {}} tooltip="Avg Time from Flag Release" />
                    <SortHeader label="CTRL%" sortKey="controlPct" currentSort="" currentDir="asc" onSort={() => {}} tooltip="Team Bludger Control % While Seeking" />
                    <SortHeader label="DIFF" sortKey="avgPointDiff" currentSort="" currentDir="asc" onSort={() => {}} tooltip="Avg Point Diff at Catch" />
                    <SortHeader label="GWC" sortKey="gameWinningCatches" currentSort="" currentDir="asc" onSort={() => {}} tooltip="Game Winning Catches" />
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                    <td className="px-2 py-1.5 sticky left-0 bg-white z-10 font-bold text-gray-900 text-xs truncate">
                      {player.firstName} {player.lastName}
                    </td>
                    <Cell value={flagStats.gamesPlayed} />
                    <Cell value={flagStats.catches} highlight={flagStats.catches > 0 ? 'gold' : undefined} bold />
                    <Cell value={flagStats.opponentCatches} highlight={flagStats.opponentCatches > 0 ? 'neg' : undefined} />
                    <Cell value={`${flagStats.catchPct}%`} highlight={flagStats.catchPct >= 60 ? 'pos' : flagStats.catchPct <= 30 ? 'neg' : undefined} bold />
                    <Cell value={formatMinutes(flagStats.avgMinPerGame)} />
                    <Cell value={formatTime(flagStats.avgTimeToCatch)} />
                    <Cell value={formatTime(flagStats.avgTimeFromRelease)} />
                    <Cell value={`${flagStats.controlPct}%`} highlight={flagStats.controlPct >= 60 ? 'pos' : flagStats.controlPct <= 30 ? 'neg' : undefined} />
                    <Cell value={flagStats.avgPointDiff > 0 ? `+${flagStats.avgPointDiff}` : flagStats.avgPointDiff || '—'} highlight={flagStats.avgPointDiff > 0 ? 'pos' : flagStats.avgPointDiff < 0 ? 'neg' : undefined} />
                    <Cell value={flagStats.gameWinningCatches} highlight={flagStats.gameWinningCatches > 0 ? 'gold' : undefined} />
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

        {/* Game Timeline */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-bold text-gray-800">Game Timeline</h3>
          </div>
          <div className="p-5 flex flex-col gap-6">
          {positionTab === 'quadball' && quadStats && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
              {/* Chaser Gantt Timeline (12 cols) */}
              <div className="lg:col-span-12 bg-white border border-gray-200 rounded-2xl shadow-sm p-5 flex flex-col justify-between min-h-[300px]">
                <div className="w-full flex items-center justify-between border-b border-gray-100 pb-2 mb-4">
                  <div className="flex flex-col">
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Chaser Gantt Timeline</h4>
                    <span className="text-[10px] text-gray-400 font-semibold">Pitch Presence vs Bludger Control</span>
                  </div>
                  {dodgeGames.length > 0 && (
                    <select
                      value={activeTimelineGameId}
                      onChange={e => setTimelineGameId(e.target.value)}
                      className="bg-gray-50 border text-xs font-bold tracking-wide shadow-sm border-gray-200 text-gray-700 rounded-lg px-2 py-1 outline-none focus:border-neutral-900"
                    >
                      {dodgeGames.map(g => {
                        const gameEvents = events.filter(e => e.gameId === g.id);
                        const map = buildPlayerTeamMap(gameEvents);
                        const teamId = map.get(activePlayerId) || gameEvents.find(e => e.playerId === activePlayerId && e.teamId && e.teamId !== 'null')?.teamId;
                        const opp = g.homeTeamId === teamId ? g.awayTeamId : g.homeTeamId;
                        const oppName = teams.find(t => t.id === opp)?.name || 'Opponent';
                        return (
                          <option key={g.id} value={g.id}>
                            vs {oppName} ({g.tag || 'Game'})
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                {activeTimelineGameId ? (
                  <div className="flex flex-col gap-6 flex-1 justify-center my-2">
                    {/* Track 1: Player Pitch presence */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Pitch Presence (Stints)</span>
                        <span className="text-[10px] font-medium text-gray-400">
                          {chaserStints.length} stints • Total {formatMinutes(quadStats?.minutesPlayed || 0)}m
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 border border-gray-200 rounded-xl relative overflow-hidden h-8 shadow-inner">
                        {/* Bench default background */}
                        <div className="absolute inset-0 bg-gray-100 flex items-center px-3 select-none pointer-events-none">
                          <span className="text-[9px] text-gray-300 font-bold uppercase tracking-widest">BENCH</span>
                        </div>
                        {/* Stints overlay */}
                        {chaserStints.map((s, idx) => {
                          const left = getPercent(s.startTime);
                          const right = getPercent(s.endTime);
                          const width = Math.max(0.5, right - left);
                          const { teamGoals, oppGoals } = stintGoals(s.startTime, s.endTime);
                          const diff = teamGoals - oppGoals;
                          const durSec = s.endTime - s.startTime;
                          return (
                            <button
                              key={idx}
                              onClick={() => onSeekToGameVideo?.(activeTimelineGameId, s.startTime)}
                              disabled={!onSeekToGameVideo}
                              className={cn(
                                "absolute top-0 bottom-0 bg-blue-500 hover:bg-blue-400 transition-all border-r border-blue-600/30 flex items-center justify-center font-bold text-white text-[10px] shadow-sm select-none",
                                onSeekToGameVideo && "cursor-pointer hover:scale-[1.01]"
                              )}
                              style={{ left: `${left}%`, width: `${width}%` }}
                              title={`Stint ${idx + 1}: ${formatTime(durSec)} (${formatTime(s.startTime)} - ${formatTime(s.endTime)}) | Stint Goals: +${teamGoals} -${oppGoals} (${diff > 0 ? '+' : ''}${diff})`}
                            >
                              {width > 6 && (
                                <span className="truncate px-0.5">
                                  {formatTime(durSec)} ({diff > 0 ? '+' : ''}{diff})
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Track 2: Control Periods */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Dodgeball Control Periods</span>
                        <div className="flex items-center gap-2 select-none">
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-gray-400">
                            <span className="w-2 h-2 rounded bg-cyan-500" /> Control
                          </span>
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-gray-400">
                            <span className="w-2 h-2 rounded bg-rose-500" /> Opponent
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 border border-gray-200 rounded-xl relative overflow-hidden h-8 shadow-inner">
                        {/* Control periods overlay */}
                        {timelineControlPeriods.map((cp, idx) => {
                          const left = getPercent(cp.startTime);
                          const right = getPercent(cp.endTime);
                          const width = Math.max(0.5, right - left);
                          const isOurControl = cp.teamId === timelinePlayerTeamId;
                          const durSec = cp.endTime - cp.startTime;
                          return (
                            <button
                              key={idx}
                              onClick={() => onSeekToGameVideo?.(activeTimelineGameId, cp.startTime)}
                              disabled={!onSeekToGameVideo}
                              className={cn(
                                "absolute top-0 bottom-0 transition-all flex items-center justify-center font-bold text-white text-[9px] shadow-sm select-none border-r border-white/10",
                                isOurControl ? "bg-cyan-500 hover:bg-cyan-400" : "bg-rose-500 hover:bg-rose-400",
                                onSeekToGameVideo && "cursor-pointer hover:scale-[1.01]"
                              )}
                              style={{ left: `${left}%`, width: `${width}%` }}
                              title={`${isOurControl ? 'Our Control' : 'Opponent Control'}: ${formatTime(durSec)} (${formatTime(cp.startTime)} - ${formatTime(cp.endTime)})`}
                            >
                              {width > 6 && (
                                <span className="truncate px-0.5">
                                  {isOurControl ? 'CTRL' : 'OPP'}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Timeline Axis Ticks */}
                    <div className="relative w-full h-4 mt-1 border-t border-gray-200">
                      {/* 0m tick */}
                      <span className="absolute left-0 top-1 text-[9px] font-bold text-gray-400 select-none">- 0:00</span>
                      
                      {/* Dynamic ticks */}
                      {Array.from({ length: Math.floor(gameDuration / 300) }).map((_, i) => {
                        const tickTime = (i + 1) * 300;
                        if (tickTime >= gameDuration) return null;
                        const left = getPercent(gameStartTime + tickTime);
                        return (
                          <div key={i} className="absolute top-0 h-1 border-l border-gray-300" style={{ left: `${left}%` }}>
                            <span className="absolute top-1 -translate-x-1/2 text-[9px] font-bold text-gray-400 select-none">
                              {i + 1}m
                            </span>
                          </div>
                        );
                      })}

                      {/* End game tick */}
                      <span className="absolute right-0 top-1 text-[9px] font-bold text-gray-400 select-none">
                        {formatTime(timelineGameEndTime - gameStartTime)} -
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center flex-1 py-10">
                    <p className="text-center text-gray-400 text-xs px-6">
                      No recorded quadball stints found for this player.
                    </p>
                  </div>
                )}
                
                {onSeekToGameVideo && (
                  <p className="text-[10px] text-gray-400 font-semibold italic text-center mt-3 border-t border-gray-50 pt-2 select-none">
                    💡 Click any stint or control period block to instantly load the match video at that moment!
                  </p>
                )}
              </div>
            </div>
          )}

          {positionTab === 'dodgeball' && dodgeTab === 'solo' && dodgeSoloStats && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
              {/* Radar Chart (5 cols) */}
              <div className="lg:col-span-5 bg-white border border-gray-200 rounded-2xl shadow-sm p-5 flex flex-col items-center justify-between min-h-[360px]">
                <div className="w-full flex items-center justify-between border-b border-gray-100 pb-2">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Beater Percentile Radar</h4>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase">vs League Beaters</span>
                </div>
                {beaterPercentiles ? (
                  <div className="flex flex-col items-center justify-center w-full py-2">
                    <svg width="260" height="260" className="overflow-visible">
                      {/* Grid Lines */}
                      {[25, 50, 75, 100].map(pct => (
                        <circle
                          key={pct}
                          cx="130"
                          cy="130"
                          r={(pct / 100) * 80}
                          fill="none"
                          stroke={pct === 100 ? '#d1d5db' : '#e5e7eb'}
                          strokeWidth={pct === 100 ? '1.5' : '1'}
                          strokeDasharray={pct === 100 ? 'none' : '3,3'}
                        />
                      ))}
                      
                      {/* Grid Labels */}
                      {[25, 50, 75].map(pct => (
                        <text
                          key={pct}
                          x="134"
                          y={130 - (pct / 100) * 80 + 3}
                          className="fill-gray-300 text-[8px] font-semibold select-none"
                        >
                          {pct}
                        </text>
                      ))}

                      {/* Axes */}
                      {[0, 1, 2, 3].map(i => {
                        const angle = -Math.PI / 2 + (i * Math.PI) / 2;
                        const x = 130 + 80 * Math.cos(angle);
                        const y = 130 + 80 * Math.sin(angle);
                        return (
                          <line
                            key={i}
                            x1="130"
                            y1="130"
                            x2={x}
                            y2={y}
                            stroke="#e5e7eb"
                            strokeWidth="1"
                          />
                        );
                      })}

                      {/* Axis Labels */}
                      {/* BVA Top */}
                      <text x="130" y="32" textAnchor="middle" className="fill-gray-700 text-[9px] font-extrabold select-none uppercase tracking-wider">
                        Net BVA
                      </text>
                      <text x="130" y="43" textAnchor="middle" className="fill-emerald-600 text-[8px] font-bold select-none">
                        {beaterPercentiles.bclVal > 0 ? '+' : ''}{beaterPercentiles.bclVal.toFixed(1)} ({beaterPercentiles.bcl}%)
                      </text>

                      {/* RAPM Right */}
                      <text x="218" y="127" textAnchor="start" className="fill-gray-700 text-[9px] font-extrabold select-none uppercase tracking-wider">
                        RAPM
                      </text>
                      <text x="218" y="138" textAnchor="start" className="fill-emerald-600 text-[8px] font-bold select-none">
                        {beaterPercentiles.rapmVal > 0 ? '+' : ''}{beaterPercentiles.rapmVal.toFixed(2)} ({beaterPercentiles.rapm}%)
                      </text>

                      {/* Control % Bottom */}
                      <text x="130" y="222" textAnchor="middle" className="fill-gray-700 text-[9px] font-extrabold select-none uppercase tracking-wider">
                        Control %
                      </text>
                      <text x="130" y="233" textAnchor="middle" className="fill-emerald-600 text-[8px] font-bold select-none">
                        {beaterPercentiles.controlPctVal.toFixed(1)}% ({beaterPercentiles.controlPct}%)
                      </text>

                      {/* PM/20 Left */}
                      <text x="42" y="127" textAnchor="end" className="fill-gray-700 text-[9px] font-extrabold select-none uppercase tracking-wider">
                        +/− / 20
                      </text>
                      <text x="42" y="138" textAnchor="end" className="fill-emerald-600 text-[8px] font-bold select-none">
                        {beaterPercentiles.plusMinusPerTwentyVal > 0 ? '+' : ''}{beaterPercentiles.plusMinusPerTwentyVal.toFixed(1)} ({beaterPercentiles.plusMinusPerTwenty}%)
                      </text>

                      {/* Data Polygon */}
                      {(() => {
                        const rBcl = Math.max(0, Math.min(100, beaterPercentiles.bcl));
                        const rRapm = Math.max(0, Math.min(100, beaterPercentiles.rapm));
                        const rCtrl = Math.max(0, Math.min(100, beaterPercentiles.controlPct));
                        const rPm = Math.max(0, Math.min(100, beaterPercentiles.plusMinusPerTwenty));

                        const px0 = 130;
                        const py0 = 130 - (rBcl / 100) * 80;
                        const px1 = 130 + (rRapm / 100) * 80;
                        const py1 = 130;
                        const px2 = 130;
                        const py2 = 130 + (rCtrl / 100) * 80;
                        const px3 = 130 - (rPm / 100) * 80;
                        const py3 = 130;

                        return (
                          <>
                            <polygon
                              points={`${px0},${py0} ${px1},${py1} ${px2},${py2} ${px3},${py3}`}
                              fill="rgba(16, 185, 129, 0.18)"
                              stroke="#10b981"
                              strokeWidth="2.5"
                              className="animate-pulse"
                            />
                            <circle cx={px0} cy={py0} r="4" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                            <circle cx={px1} cy={py1} r="4" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                            <circle cx={px2} cy={py2} r="4" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                            <circle cx={px3} cy={py3} r="4" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center flex-1 py-10">
                    <p className="text-center text-gray-400 text-xs px-6">
                      Not enough beater pitch time to calculate percentile ranks (requires &gt;0.5 mins of pitch time).
                    </p>
                  </div>
                )}
              </div>

              {/* Gantt Timeline (7 cols) */}
              <div className="lg:col-span-7 bg-white border border-gray-200 rounded-2xl shadow-sm p-5 flex flex-col justify-between min-h-[360px]">
                <div className="w-full flex items-center justify-between border-b border-gray-100 pb-2 mb-4">
                  <div className="flex flex-col">
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Beater Gantt Timeline</h4>
                    <span className="text-[10px] text-gray-400 font-semibold">Pitch Presence vs Bludger Control</span>
                  </div>
                  {dodgeGames.length > 0 && (
                    <select
                      value={activeTimelineGameId}
                      onChange={e => setTimelineGameId(e.target.value)}
                      className="bg-gray-50 border text-xs font-bold tracking-wide shadow-sm border-gray-200 text-gray-700 rounded-lg px-2 py-1 outline-none focus:border-neutral-900"
                    >
                      {dodgeGames.map(g => {
                        const gameEvents = events.filter(e => e.gameId === g.id);
                        const map = buildPlayerTeamMap(gameEvents);
                        const teamId = map.get(activePlayerId) || gameEvents.find(e => e.playerId === activePlayerId && e.teamId && e.teamId !== 'null')?.teamId;
                        const opp = g.homeTeamId === teamId ? g.awayTeamId : g.homeTeamId;
                        const oppName = teams.find(t => t.id === opp)?.name || 'Opponent';
                        return (
                          <option key={g.id} value={g.id}>
                            vs {oppName} ({g.tag || 'Game'})
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                {activeTimelineGameId ? (
                  <div className="flex flex-col gap-6 flex-1 justify-center my-2">
                    {/* Track 1: Player Pitch presence */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Pitch Presence (Stints)</span>
                        <span className="text-[10px] font-medium text-gray-400">
                          {playerStints.length} stints • Total {formatMinutes(dodgeSoloStats?.totalMinutes || 0)}m
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 border border-gray-200 rounded-xl relative overflow-hidden h-8 shadow-inner">
                        {/* Bench default background */}
                        <div className="absolute inset-0 bg-gray-100 flex items-center px-3 select-none pointer-events-none">
                          <span className="text-[9px] text-gray-300 font-bold uppercase tracking-widest">BENCH</span>
                        </div>
                        {/* Stints overlay */}
                        {playerStints.map((s, idx) => {
                          const left = getPercent(s.startTime);
                          const right = getPercent(s.endTime);
                          const width = Math.max(0.5, right - left);
                          const { teamGoals, oppGoals } = stintGoals(s.startTime, s.endTime);
                          const diff = teamGoals - oppGoals;
                          const durSec = s.endTime - s.startTime;
                          return (
                            <button
                              key={idx}
                              onClick={() => onSeekToGameVideo?.(activeTimelineGameId, s.startTime)}
                              disabled={!onSeekToGameVideo}
                              className={cn(
                                "absolute top-0 bottom-0 bg-emerald-500 hover:bg-emerald-400 transition-all border-r border-emerald-600/30 flex items-center justify-center font-bold text-white text-[10px] shadow-sm select-none",
                                onSeekToGameVideo && "cursor-pointer hover:scale-[1.01]"
                              )}
                              style={{ left: `${left}%`, width: `${width}%` }}
                              title={`Stint ${idx + 1}: ${formatTime(durSec)} (${formatTime(s.startTime)} - ${formatTime(s.endTime)}) | Stint Goals: +${teamGoals} -${oppGoals} (${diff > 0 ? '+' : ''}${diff})`}
                            >
                              {width > 6 && (
                                <span className="truncate px-0.5">
                                  {formatTime(durSec)} ({diff > 0 ? '+' : ''}{diff})
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Track 2: Control Periods */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Dodgeball Control Periods</span>
                        <div className="flex items-center gap-2 select-none">
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-gray-400">
                            <span className="w-2 h-2 rounded bg-cyan-500" /> Control
                          </span>
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-gray-400">
                            <span className="w-2 h-2 rounded bg-rose-500" /> Opponent
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 border border-gray-200 rounded-xl relative overflow-hidden h-8 shadow-inner">
                        {/* Control periods overlay */}
                        {timelineControlPeriods.map((cp, idx) => {
                          const left = getPercent(cp.startTime);
                          const right = getPercent(cp.endTime);
                          const width = Math.max(0.5, right - left);
                          const isOurControl = cp.teamId === timelinePlayerTeamId;
                          const durSec = cp.endTime - cp.startTime;
                          return (
                            <button
                              key={idx}
                              onClick={() => onSeekToGameVideo?.(activeTimelineGameId, cp.startTime)}
                              disabled={!onSeekToGameVideo}
                              className={cn(
                                "absolute top-0 bottom-0 transition-all flex items-center justify-center font-bold text-white text-[9px] shadow-sm select-none border-r border-white/10",
                                isOurControl ? "bg-cyan-500 hover:bg-cyan-400" : "bg-rose-500 hover:bg-rose-400",
                                onSeekToGameVideo && "cursor-pointer hover:scale-[1.01]"
                              )}
                              style={{ left: `${left}%`, width: `${width}%` }}
                              title={`${isOurControl ? 'Our Control' : 'Opponent Control'}: ${formatTime(durSec)} (${formatTime(cp.startTime)} - ${formatTime(cp.endTime)})`}
                            >
                              {width > 6 && (
                                <span className="truncate px-0.5">
                                  {isOurControl ? 'CTRL' : 'OPP'}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Timeline Axis Ticks */}
                    <div className="relative w-full h-4 mt-1 border-t border-gray-200">
                      {/* 0m tick */}
                      <span className="absolute left-0 top-1 text-[9px] font-bold text-gray-400 select-none">- 0:00</span>
                      
                      {/* Dynamic ticks */}
                      {Array.from({ length: Math.floor(gameDuration / 300) }).map((_, i) => {
                        const tickTime = (i + 1) * 300;
                        if (tickTime >= gameDuration) return null;
                        const left = getPercent(gameStartTime + tickTime);
                        return (
                          <div key={i} className="absolute top-0 h-1 border-l border-gray-300" style={{ left: `${left}%` }}>
                            <span className="absolute top-1 -translate-x-1/2 text-[9px] font-bold text-gray-400 select-none">
                              {i + 1}m
                            </span>
                          </div>
                        );
                      })}

                      {/* End game tick */}
                      <span className="absolute right-0 top-1 text-[9px] font-bold text-gray-400 select-none">
                        {formatTime(timelineGameEndTime - gameStartTime)} -
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center flex-1 py-10">
                    <p className="text-center text-gray-400 text-xs px-6">
                      No recorded dodgeball stints found for this player.
                    </p>
                  </div>
                )}
                
                {onSeekToGameVideo && (
                  <p className="text-[10px] text-gray-400 font-semibold italic text-center mt-3 border-t border-gray-50 pt-2 select-none">
                    💡 Click any stint or control period block to instantly load the match video at that moment!
                  </p>
                )}
              </div>
            </div>
          )}

          {positionTab === 'flag' && flagStats && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
              {/* Flag Seeker Gantt Timeline (12 cols) */}
              <div className="lg:col-span-12 bg-white border border-gray-200 rounded-2xl shadow-sm p-5 flex flex-col justify-between min-h-[300px]">
                <div className="w-full flex items-center justify-between border-b border-gray-100 pb-2 mb-4">
                  <div className="flex flex-col">
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Seeker Gantt Timeline</h4>
                    <span className="text-[10px] text-gray-400 font-semibold">Pitch Presence vs Bludger Control during Flag Period</span>
                  </div>
                  {dodgeGames.length > 0 && (
                    <select
                      value={activeTimelineGameId}
                      onChange={e => setTimelineGameId(e.target.value)}
                      className="bg-gray-50 border text-xs font-bold tracking-wide shadow-sm border-gray-200 text-gray-700 rounded-lg px-2 py-1 outline-none focus:border-neutral-900"
                    >
                      {dodgeGames.map(g => {
                        const gameEvents = events.filter(e => e.gameId === g.id);
                        const map = buildPlayerTeamMap(gameEvents);
                        const teamId = map.get(activePlayerId) || gameEvents.find(e => e.playerId === activePlayerId && e.teamId && e.teamId !== 'null')?.teamId;
                        const opp = g.homeTeamId === teamId ? g.awayTeamId : g.homeTeamId;
                        const oppName = teams.find(t => t.id === opp)?.name || 'Opponent';
                        return (
                          <option key={g.id} value={g.id}>
                            vs {oppName} ({g.tag || 'Game'})
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                {activeTimelineGameId && flagTimelineData.flagStartTime !== null ? (
                  <div className="flex flex-col gap-6 flex-1 justify-center my-2">
                    {/* Track 1: Seeker Pitch presence */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Seeker Stints</span>
                        <span className="text-[10px] font-medium text-gray-400">
                          {flagStints.length} stints • Flag Pitch Time {formatTime(flagTimelineData.flagDuration)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 border border-gray-200 rounded-xl relative overflow-hidden h-8 shadow-inner">
                        {/* Bench default background */}
                        <div className="absolute inset-0 bg-gray-100 flex items-center px-3 select-none pointer-events-none">
                          <span className="text-[9px] text-gray-300 font-bold uppercase tracking-widest">OFF PITCH (DURING FLAG)</span>
                        </div>
                        {/* Stints overlay */}
                        {flagStints.map((s, idx) => {
                          const left = getFlagPercent(s.displayStart);
                          const right = getFlagPercent(s.displayEnd);
                          const width = Math.max(0.5, right - left);
                          const durSec = s.endTime - s.startTime;
                          
                          // Let's compute goals during seeker stint as well
                          const { teamGoals, oppGoals } = stintGoals(s.startTime, s.endTime);
                          const diff = teamGoals - oppGoals;
                          const diffSign = diff > 0 ? `+${diff}` : `${diff}`;
                          const isGoldCatch = timelineGameEvents.some(e => e.type === 'flag_catch' && e.playerId === activePlayerId && e.videoTime >= s.startTime - 1 && e.videoTime <= s.endTime + 1);

                          return (
                            <button
                              key={idx}
                              onClick={() => onSeekToGameVideo?.(activeTimelineGameId, s.startTime)}
                              disabled={!onSeekToGameVideo}
                              className={cn(
                                "absolute top-0 bottom-0 bg-yellow-400 hover:bg-yellow-300 transition-all border-r border-yellow-500/30 flex items-center justify-center font-bold text-black text-[10px] shadow-sm select-none",
                                onSeekToGameVideo && "cursor-pointer hover:scale-[1.01]"
                              )}
                              style={{ left: `${left}%`, width: `${width}%` }}
                              title={`Seeker Stint: ${formatTime(durSec)} (${formatTime(s.startTime)} - ${formatTime(s.endTime)}) • Goals: ${diffSign} ${isGoldCatch ? '• Caught Snitch! 🎯' : ''}`}
                            >
                              {width > 6 && (
                                <span className="truncate px-0.5">
                                  {isGoldCatch ? '🎯 CAUGHT' : 'SEEKING'} ({diffSign})
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Track 2: Team Bludger Control */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Dodgeball Control Periods</span>
                        <div className="flex items-center gap-2 select-none">
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-gray-400">
                            <span className="w-2 h-2 rounded bg-cyan-500" /> Control
                          </span>
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-gray-400">
                            <span className="w-2 h-2 rounded bg-rose-500" /> Opponent
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 border border-gray-200 rounded-xl relative overflow-hidden h-8 shadow-inner">
                        {/* Control periods overlay */}
                        {flagControlPeriods.map((cp, idx) => {
                          const left = getFlagPercent(cp.displayStart);
                          const right = getFlagPercent(cp.displayEnd);
                          const width = Math.max(0.5, right - left);
                          const isOurControl = cp.teamId === timelinePlayerTeamId;
                          const durSec = cp.endTime - cp.startTime;

                          return (
                            <button
                              key={idx}
                              onClick={() => onSeekToGameVideo?.(activeTimelineGameId, cp.startTime)}
                              disabled={!onSeekToGameVideo}
                              className={cn(
                                "absolute top-0 bottom-0 transition-all flex items-center justify-center font-bold text-white text-[9px] shadow-sm select-none border-r border-white/10",
                                isOurControl ? "bg-cyan-500 hover:bg-cyan-400" : "bg-rose-500 hover:bg-rose-400",
                                onSeekToGameVideo && "cursor-pointer hover:scale-[1.01]"
                              )}
                              style={{ left: `${left}%`, width: `${width}%` }}
                              title={`${isOurControl ? 'Our Control' : 'Opponent Control'}: ${formatTime(durSec)} (${formatTime(cp.startTime)} - ${formatTime(cp.endTime)})`}
                            >
                              {width > 6 && (
                                <span className="truncate px-0.5">
                                  {isOurControl ? 'CTRL' : 'OPP'}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Timeline Axis Ticks */}
                    <div className="relative w-full h-4 mt-1 border-t border-gray-200">
                      {/* Start Snitch Release tick */}
                      <span className="absolute left-0 top-1 text-[9px] font-bold text-gray-400 select-none">
                        - {formatTime(flagTimelineData.flagStartTime)} (Released)
                      </span>
                      
                      {/* Dynamic ticks every 60s */}
                      {Array.from({ length: Math.floor(flagTimelineData.flagDuration / 60) }).map((_, i) => {
                        const tickTime = (i + 1) * 60;
                        if (tickTime >= flagTimelineData.flagDuration) return null;
                        const left = getFlagPercent(flagTimelineData.flagStartTime! + tickTime);
                        return (
                          <div key={i} className="absolute top-0 h-1 border-l border-gray-300" style={{ left: `${left}%` }}>
                            <span className="absolute top-1 -translate-x-1/2 text-[9px] font-bold text-gray-400 select-none">
                              +{i + 1}m
                            </span>
                          </div>
                        );
                      })}

                      {/* End tick (Caught / Game End) */}
                      <span className="absolute right-0 top-1 text-[9px] font-bold text-gray-400 select-none">
                        {formatTime(flagTimelineData.flagEndTime!)} ({flagTimelineData.flagCatchEvent ? 'Caught' : 'Game End'}) -
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center flex-1 py-10">
                    <p className="text-center text-gray-400 text-xs px-6">
                      No snitch release event found in this match's timeline.
                    </p>
                  </div>
                )}
                
                {onSeekToGameVideo && (
                  <p className="text-[10px] text-gray-400 font-semibold italic text-center mt-3 border-t border-gray-50 pt-2 select-none">
                    💡 Click any stint or control period block to instantly load the match video at that moment!
                  </p>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
