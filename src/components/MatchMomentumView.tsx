import React, { useMemo } from 'react';
import { TrendingUp, Activity, CheckCircle2, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { EventType } from '../App';
import { computeControlPeriodsFromEvents } from '../lib/statsComputations';

interface Team { id: string; name: string; nickname?: string; colorPrimaryDark?: string; colorPrimaryLight?: string; colorAccent?: string; colorPrimary?: string; colorDark?: string; colorLight?: string; [k: string]: any; }
interface GameEvent {
  id: string;
  type: EventType;
  videoTime: number;
  gameTime?: number;
  teamId?: string;
}

interface MatchMomentumViewProps {
  events: GameEvent[];
  teams: Team[];
  homeTeamId: string;
  awayTeamId: string;
  currentTime?: number;
  onSeek?: (time: number) => void;
}

const GOAL_PTS = 10;
const FLAG_CATCH_PTS = 35;

export default function MatchMomentumView({
  events,
  teams,
  homeTeamId,
  awayTeamId,
  currentTime = 0,
  onSeek
}: MatchMomentumViewProps) {
  
  const homeTeam = teams.find(t => t.id === homeTeamId);
  const awayTeam = teams.find(t => t.id === awayTeamId);
  const homeName = homeTeam?.nickname || homeTeam?.name || 'Home';
  const awayName = awayTeam?.nickname || awayTeam?.name || 'Away';
  const homeColor = homeTeam?.colorPrimaryDark || homeTeam?.colorPrimary || '#ef4444';
  const awayColor = awayTeam?.colorPrimaryDark || awayTeam?.colorPrimary || '#3b82f6';

  // Helper to convert hex to rgba
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const analysis = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.videoTime - b.videoTime);
    
    let homeScore = 0;
    let awayScore = 0;
    
    const firstEventTime = sorted.length > 0 ? sorted[0].videoTime : 0;
    
    // Track stats
    const timeline: { time: number, gameTime: number, diff: number, homePts: number, awayPts: number, type: string, teamId: string | null }[] = [{
      time: firstEventTime, gameTime: sorted[0]?.gameTime || 0, diff: 0, homePts: 0, awayPts: 0, type: 'start', teamId: null
    }];

    let maxLeadHome = 0;
    let maxLeadAway = 0;
    let currentRunTeam = null;
    let currentRunPoints = 0;
    let maxRunHome = 0;
    let maxRunAway = 0;

    for (const e of sorted) {
      let isScore = false;
      let pts = 0;

      if (e.type === 'goal') {
        pts = GOAL_PTS;
        isScore = true;
      } else if (e.type === 'flag_catch') {
        pts = FLAG_CATCH_PTS;
        isScore = true;
      }
      
      if (isScore || e.type === 'flag_released') {
        if (isScore) {
          if (e.teamId === homeTeamId) {
            homeScore += pts;
            if (currentRunTeam === homeTeamId) {
              currentRunPoints += pts;
            } else {
              currentRunTeam = homeTeamId;
              currentRunPoints = pts;
            }
            maxRunHome = Math.max(maxRunHome, currentRunPoints);
          } else if (e.teamId === awayTeamId) {
            awayScore += pts;
            if (currentRunTeam === awayTeamId) {
              currentRunPoints += pts;
            } else {
              currentRunTeam = awayTeamId;
              currentRunPoints = pts;
            }
            maxRunAway = Math.max(maxRunAway, currentRunPoints);
          }
        }

        const diff = homeScore - awayScore;
        if (diff > maxLeadHome) maxLeadHome = diff;
        if (-diff > maxLeadAway) maxLeadAway = -diff;

        timeline.push({
          time: e.videoTime,
          gameTime: e.gameTime ?? 0,
          diff,
          homePts: homeScore,
          awayPts: awayScore,
          type: e.type,
          teamId: e.teamId || null
        });
      }
    }

    // Determine momentum shifts (Lead changes)
    let leadChanges = 0;
    let lastNonTieLeader = 0; // 1 home, -1 away
    for (const point of timeline) {
      if (point.diff > 0) {
        if (lastNonTieLeader === -1) leadChanges++;
        lastNonTieLeader = 1;
      } else if (point.diff < 0) {
        if (lastNonTieLeader === 1) leadChanges++;
        lastNonTieLeader = -1;
      }
    }

    // Determine control periods for background shading
    const controlPeriods = computeControlPeriodsFromEvents(sorted);

    return { timeline, maxLeadHome, maxLeadAway, maxRunHome, maxRunAway, leadChanges, controlPeriods };
  }, [events, homeTeamId, awayTeamId]);

  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-gray-400 h-full">
        <Activity className="w-8 h-8 mb-4 opacity-20" />
        <p className="font-bold">No Match Data Available</p>
        <p className="text-xs">Record goals and events to view match momentum.</p>
      </div>
    );
  }

  // Draw timeline chart
  const minTime = analysis.timeline[0]?.time || 0;
  const maxTime = analysis.timeline[analysis.timeline.length - 1]?.time || 100;
  const timeSpan = Math.max(1, maxTime - minTime);

  let targetScore: number | null = null;
  let flagReleaseTime: number | null = null;
  for (const pt of analysis.timeline) {
    if (pt.type === 'flag_released' && targetScore === null) {
      targetScore = Math.max(pt.homePts, pt.awayPts) + 60;
      flagReleaseTime = pt.time;
    }
  }

  const highestScore = Math.max(
    10,
    analysis.timeline[analysis.timeline.length - 1]?.homePts || 0,
    analysis.timeline[analysis.timeline.length - 1]?.awayPts || 0
  );
  
  const maxPts = Math.max(highestScore, targetScore || 0);

  // Create points for SVG path
  const svgWidth = 500; // viewbox width
  const svgHeight = 200; // viewbox height
  
  const getY = (pts: number) => svgHeight - (pts / maxPts) * (svgHeight * 0.85) - 10;
  const getX = (time: number) => ((time - minTime) / timeSpan) * svgWidth;

  const createSmoothPath = (points: {time: number, pts: number}[]) => {
    if (points.length === 0) return '';
    let d = `M ${getX(points[0].time)},${getY(points[0].pts)}`;
    for (let i = 1; i < points.length; i++) {
        d += ` L ${getX(points[i].time)},${getY(points[i].pts)}`;
    }
    d += ` L ${svgWidth},${getY(points[points.length-1].pts)}`;
    return d;
  };

  const homePathD = createSmoothPath(analysis.timeline.map(pt => ({time: pt.time, pts: pt.homePts})));
  const awayPathD = createSmoothPath(analysis.timeline.map(pt => ({time: pt.time, pts: pt.awayPts})));

  // Fill paths for shading
  const homeFillD = `${homePathD} L ${svgWidth},${svgHeight} L 0,${svgHeight} Z`;
  const awayFillD = `${awayPathD} L ${svgWidth},${svgHeight} L 0,${svgHeight} Z`;

  const currentScrubX = ((Math.max(minTime, Math.min(currentTime, maxTime)) - minTime) / timeSpan) * svgWidth;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-white animate-in fade-in slide-in-from-bottom-2">
      <div className="p-4 border-b border-gray-100 bg-gray-50/50">
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-800 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-500" /> Match Momentum
        </h2>
        <p className="text-[10px] text-gray-500 font-medium tracking-tight mt-1">
          Visualizing score differential and team runs over the course of the game.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
        
        {/* The Graph */}
        <div className="bg-white border rounded-2xl p-4 shadow-sm relative">
          <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest mb-4">
            <span style={{ color: homeColor }} className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: homeColor }}></div> {homeName}</span>
            <span style={{ color: awayColor }} className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest">{awayName} <div className="w-2 h-2 rounded-full" style={{ backgroundColor: awayColor }}></div></span>
          </div>
          
          <div className="relative w-full aspect-[21/9] border-y border-gray-100 group">
            {/* Y-axis Labels */}
            <div className="absolute left-2 top-2 text-[8px] font-mono font-bold text-gray-500/50 pointer-events-none">{maxPts} pts</div>
            <div className="absolute left-2 bottom-2 text-[8px] font-mono font-bold text-gray-400/50 pointer-events-none">0 pts</div>
            
            {/* Target Score Box bounds implicitly managed */}

            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
              {/* Background Control Shading */}
              {analysis.controlPeriods.map((cp, i) => {
                 const x1 = Math.max(0, getX(Math.max(minTime, cp.startTime)));
                 const x2 = Math.min(svgWidth, getX(Math.min(maxTime, cp.endTime)));
                 if (x2 <= x1) return null;
                 const color = cp.teamId === homeTeamId ? hexToRgba(homeColor, 0.08) : hexToRgba(awayColor, 0.08);
                 return (
                   <rect key={`cp-${i}`} x={x1} y="0" width={x2 - x1} height={svgHeight} fill={color} />
                 );
              })}

              {/* Main Line */}
              <path d={homePathD} fill="none" stroke={homeColor} strokeWidth="2.5" strokeLinejoin="round" />
              <path d={awayPathD} fill="none" stroke={awayColor} strokeWidth="2.5" strokeLinejoin="round" />

              {/* Target / Set Score Line */}
              {targetScore !== null && (
                <line x1={getX(flagReleaseTime || minTime)} y1={getY(targetScore)} x2={svgWidth} y2={getY(targetScore)} stroke="#eab308" strokeWidth="2" strokeDasharray="4 4" opacity="0.8" />
              )}
              {/* Flag Released vertical line */}
              {flagReleaseTime !== null && (
                <line x1={getX(flagReleaseTime)} y1="0" x2={getX(flagReleaseTime)} y2={svgHeight} stroke="#eab308" strokeWidth="2" opacity="0.6" />
              )}

              {/* Points overlay allowing seek */}
              {analysis.timeline.map((pt, i) => {
                if (pt.type === 'start') return null;
                if (pt.type === 'flag_released') return null; // do not plot user-visible dot for flag released
                const x = getX(pt.time);
                
                let dotY, dotColor;
                if (pt.type === 'flag_catch') {
                   if (pt.teamId === homeTeamId) dotY = getY(pt.homePts);
                   else if (pt.teamId === awayTeamId) dotY = getY(pt.awayPts);
                   else dotY = getY(Math.max(pt.homePts, pt.awayPts));
                   dotColor = '#eab308'; // yellow
                } else if (pt.teamId === homeTeamId) {
                   dotY = getY(pt.homePts);
                   dotColor = homeColor;
                } else if (pt.teamId === awayTeamId) {
                   dotY = getY(pt.awayPts);
                   dotColor = awayColor;
                } else {
                   dotY = getY(Math.max(pt.homePts, pt.awayPts));
                   dotColor = '#27272a'; // tie/none
                }

                return (
                  <circle 
                    key={i} 
                    cx={x} cy={dotY} r={pt.type === 'flag_catch' ? "4" : "3"} 
                    fill={dotColor}
                    stroke="white"
                    strokeWidth="1.5"
                    className="transition-all hover:r-[6px] cursor-pointer hover:stroke-gray-200"
                    onClick={() => onSeek?.(Math.max(0, pt.time - 5))}
                  >
                    <title>
                      {homeName}: {pt.homePts} - {awayName}: {pt.awayPts} 
                      at {formatTime(pt.gameTime)} ({pt.type === 'goal' ? 'Goal' : pt.type})
                    </title>
                  </circle>
                );
              })}
            </svg>

            {/* Current Scrub Position */}
            {currentTime >= minTime && currentTime <= maxTime + 60 && (
              <div 
                className="absolute top-0 bottom-0 border-l-2 border-emerald-500 flex flex-col items-center pointer-events-none transition-all duration-300 ease-linear"
                style={{ left: `${((currentTime - minTime) / timeSpan) * 100}%` }}
              >
                <div className="bg-emerald-500 text-white text-[8px] font-mono font-bold px-1 py-0.5 rounded-sm -translate-x-1/2 -mt-4 whitespace-nowrap">
                  {formatTime(currentTime)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Insights Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border flex flex-col gap-1 items-start" style={{ backgroundColor: hexToRgba(homeColor, 0.05), borderColor: hexToRgba(homeColor, 0.15) }}>
            <span className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: homeColor }}>Largest Lead</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black leading-none" style={{ color: homeColor }}>{analysis.maxLeadHome}</span>
              <span className="text-xs font-bold uppercase" style={{ color: homeColor }}>Points</span>
            </div>
            <p className="text-[10px] font-medium truncate w-full" style={{ color: hexToRgba(homeColor, 0.6) }}>{homeName}</p>
          </div>

          <div className="p-4 rounded-xl border flex flex-col gap-1 items-start text-right items-end" style={{ backgroundColor: hexToRgba(awayColor, 0.05), borderColor: hexToRgba(awayColor, 0.15) }}>
            <span className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: awayColor }}>Largest Lead</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-bold uppercase" style={{ color: awayColor }}>Points</span>
              <span className="text-3xl font-black leading-none" style={{ color: awayColor }}>{analysis.maxLeadAway}</span>
            </div>
            <p className="text-[10px] font-medium truncate w-full" style={{ color: hexToRgba(awayColor, 0.6) }}>{awayName}</p>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col gap-1 items-start h-full">
            <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-amber-500" /> Defining Runs</span>
            <div className="flex flex-col gap-2 w-full mt-1">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold truncate min-w-0 pr-2 max-w-[60px] text-[10px] uppercase" style={{ color: homeColor }}>{homeName?.[0] || 'H'}</span>
                <span className="font-mono px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: hexToRgba(homeColor, 0.1), color: homeColor }}>{analysis.maxRunHome > 0 ? `+${analysis.maxRunHome}` : '-'} run</span>
              </div>
              <div className="flex justify-between items-center text-sm border-t border-gray-200/60 pt-2">
                <span className="font-bold truncate min-w-0 pr-2 max-w-[60px] text-[10px] uppercase" style={{ color: awayColor }}>{awayName?.[0] || 'A'}</span>
                <span className="font-mono px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: hexToRgba(awayColor, 0.1), color: awayColor }}>{analysis.maxRunAway > 0 ? `+${analysis.maxRunAway}` : '-'} run</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col gap-1 items-start h-full justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-emerald-500" /> Game Chaos</span>
              <p className="text-[10px] text-gray-400 mt-1 leading-snug">Times the lead flipped back and forth between teams.</p>
            </div>
            <div className="flex items-baseline gap-2 mt-4 text-gray-700">
              <span className="text-3xl font-black leading-none tracking-tight">{analysis.leadChanges}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest">Lead {analysis.leadChanges === 1 ? 'Change' : 'Changes'}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
