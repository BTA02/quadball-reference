/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import YouTube, { YouTubeProps } from 'react-youtube';
import Papa from 'papaparse';
import {
  Play,
  Pause,
  Plus,
  Trophy,
  User,
  Target,
  Clock,
  HelpCircle,
  CheckCircle2,
  XCircle,
  Search,
  LogOut,
  LogIn,
  ChevronRight,
  ChevronLeft,
  MessageSquare,
  AlertCircle,
  FileUp,
  Database,
  Flag,
  Zap,
  Activity,
  ShieldCheck,
  History,
  Trash2,
  UploadCloud,
  SkipForward,
  Edit2,
  TrendingUp,
  Rewind,
  FastForward
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  doc,
  updateDoc,
  setDoc,
  getDocs,
  getDoc,
  deleteDoc,
  Timestamp,
  serverTimestamp,
  increment,
  writeBatch,
  limit,
  collectionGroup,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { auth, db, signIn, logOut, handleFirestoreError, OperationType } from './lib/firebase';
import { cn } from './lib/utils';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import QuadballStatsView from './components/QuadballStatsView';
import BeaterStatsView from './components/BeaterStatsView';
import SeekerStatsView from './components/SeekerStatsView';
import MatchMomentumView from './components/MatchMomentumView';
import PlayerProfileView from './components/PlayerProfileView';
import TeamProfileView from './components/TeamProfileView';
import GameBoxScoreView from './components/GameBoxScoreView';
import StatsFilters from './components/StatsFilters';
import LandingHero from './components/LandingHero';
import { enrichEventsWithGameTime, getScoreboardName } from './lib/statsComputations';
// --- Types ---

type EventType = 'goal' | 'assist' | 'shot' | 'attempt' | 'gameStart' | 'gamePause' | 'gameEnd' | 'foul' | 'card' | 'sub_in' | 'sub_out' | 'control_change' | 'turnover' | 'flag_released' | 'flag_catch' | 'control_start' | 'quadball_start';

type PositionType = 'chaser' | 'keeper' | 'beater' | 'seeker';

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  nickname?: string;
  createdAt: any;
}

interface Team { id: string; name: string; scoreboard_name?: string;[k: string]: any; }

interface Season {
  id: string;
  name: string;
  league?: string;
  year?: string;
  description?: string;
  createdAt: any;
}

interface Roster {
  id: string;
  teamId: string;
  seasonId: string;
  createdAt: any;
}

interface RosterPlayer {
  id: string;
  rosterId: string;
  playerId: string;
  number: string;
  createdAt: any;
}

interface GameEvent {
  id: string;
  videoId: string; // Firestore ID of the video
  gameId: string; // Unique ID for the game
  userId: string;
  userName: string;
  type: EventType;
  videoTime: number; // seconds
  gameTime?: number; // inferred real-world stop time
  createdAt: any;
  votes: number;
  upvotes?: number;
  downvotes?: number;
  upvoterIds?: string[];
  downvoterIds?: string[];
  status: 'unverified' | 'verified' | 'rejected';
  playerId?: string; // The global playerId
  subPlayerId?: string; // For substitutions: the global playerId coming in
  relatedEventId?: string; // The ID of a related event (e.g., a goal for an assist)
  teamId?: string; // The ID of the team if the event is team-based
  position?: PositionType; // For substitutions: the position being filled
  color?: string | null; // For cards: blue, yellow, red
}

export interface DraftEvent {
  id: string; // Temporary ID for React key
  type: EventType | null; // Allow null to represent "empty draft"
  videoTime: number; // frozen video time
  gameTime?: number; // frozen game time
  teamId?: string | null;
  playerId?: string | null;
  relatedEventId?: string | null;
  assistedByPlayerId?: string | null;
  position?: PositionType | null;
  subPlayerId?: string | null;
  color?: string | null;
}

interface Game {
  id: string; // Unique Game ID
  isVerified?: boolean;
  seasonId: string;
  homeTeamId: string;
  awayTeamId: string;
  tag?: string;
  createdAt: any;
  authorId?: string;
  authorTeamId?: string;
}

interface Video {
  id: string;
  youtubeId: string;
  videoId: string; // Unique ID for the video/recording
  gameId: string; // Unique ID for the game
  title: string;
  createdAt: any;
}

// --- Components ---

const EVENT_CONFIG: Record<EventType, { label: string; icon: React.ReactNode; color: string }> = {
  goal: { label: 'Goal', icon: <Trophy className="w-4 h-4" />, color: 'bg-green-500' },
  assist: { label: 'Assist', icon: <User className="w-4 h-4" />, color: 'bg-blue-500' },
  shot: { label: 'Shot', icon: <Target className="w-4 h-4" />, color: 'bg-orange-500' },
  attempt: { label: 'Attempt', icon: <Activity className="w-4 h-4" />, color: 'bg-violet-500' },
  gameStart: { label: 'Start Clock', icon: <Play className="w-4 h-4" />, color: 'bg-red-600' },
  gamePause: { label: 'Pause', icon: <Pause className="w-4 h-4" />, color: 'bg-gray-500' },
  foul: { label: 'Foul', icon: <AlertCircle className="w-4 h-4" />, color: 'bg-yellow-500' },
  card: { label: 'Card', icon: <AlertCircle className="w-4 h-4" />, color: 'bg-red-500' },
  sub_in: { label: 'Sub In', icon: <LogIn className="w-4 h-4" />, color: 'bg-green-500' },
  sub_out: { label: 'Sub Out', icon: <LogOut className="w-4 h-4" />, color: 'bg-orange-500' },
  control_change: { label: 'Control Change', icon: <CheckCircle2 className="w-4 h-4" />, color: 'bg-emerald-500' },
  turnover: { label: 'Turnover', icon: <AlertCircle className="w-4 h-4" />, color: 'bg-amber-500' },
  control_start: { label: 'Control Start', icon: <CheckCircle2 className="w-4 h-4" />, color: 'bg-emerald-700' },
  quadball_start: { label: 'Quadball Start', icon: <Play className="w-4 h-4" />, color: 'bg-indigo-500' },
  // Flag / Seeker events
  flag_released: { label: 'Flag Released', icon: <Flag className="w-4 h-4" />, color: 'bg-yellow-500' },
  flag_catch: { label: 'Flag Caught', icon: <Flag className="w-4 h-4" />, color: 'bg-yellow-400' },
  // Game state
  gameEnd: { label: 'Game End', icon: <Trophy className="w-4 h-4" />, color: 'bg-neutral-500' },
};

// --- Inline Roster Builder UI ---
function InlineRosterBuilder({
  teamId,
  seasonId,
  teamName,
  allPlayers,
  onAddGlobalPlayer,
  onCreateRoster,
  onAddPlayerToRoster,
  onPlayerActivated
}: {
  teamId: string;
  seasonId: string;
  teamName: string;
  allPlayers: Player[];
  onAddGlobalPlayer: (first: string, last: string) => Promise<string | null>;
  onCreateRoster: (team: string, season: string) => Promise<string | null>;
  onAddPlayerToRoster: (roster: string, player: string, num: string) => Promise<void>;
  onPlayerActivated: (playerId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jersey, setJersey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const existingPlayerMatch = useMemo(() => {
    return allPlayers.find(p => `${p.firstName} ${p.lastName}`.toLowerCase() === searchQuery.trim().toLowerCase());
  }, [searchQuery, allPlayers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jersey) return;
    setIsSubmitting(true);
    try {
      let activePlayerId = existingPlayerMatch?.id;

      if (!activePlayerId) {
        if (!firstName || !lastName) {
          toast.error("Please provide both First and Last names to create a new player.");
          setIsSubmitting(false);
          return;
        }
        activePlayerId = await onAddGlobalPlayer(firstName, lastName);
      }

      if (!activePlayerId) {
        toast.error("Failed to resolve global player.");
        setIsSubmitting(false);
        return;
      }

      const activeRosterId = await onCreateRoster(teamId, seasonId);
      if (!activeRosterId) {
        toast.error("Failed to generate or recover team Roster.");
        setIsSubmitting(false);
        return;
      }

      await onAddPlayerToRoster(activeRosterId, activePlayerId, jersey);
      onPlayerActivated(activePlayerId);

      setIsExpanded(false);
      setSearchQuery('');
      setFirstName('');
      setLastName('');
      setJersey('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="text-[10px] text-red-500 hover:text-red-700 underline px-1 mt-1 block"
      >
        + Add Player to Roster
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 p-3 bg-white rounded-lg border border-red-200 shadow-sm text-xs w-full text-left">
      <p className="font-bold mb-2 text-gray-700">Add Player to {teamName} Roster</p>

      <div className="space-y-3">
        <div>
          <label className="block text-gray-500 mb-1 font-semibold">Search Database (or leave empty to create new)</label>
          <input
            list="all-players-datalist"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              const parts = e.target.value.trim().split(' ');
              if (parts.length > 0) {
                setFirstName(parts[0]);
                setLastName(parts.slice(1).join(' '));
              }
            }}
            placeholder="Type player name..."
            className="w-full border rounded px-2 py-1.5 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
          />
        </div>

        {!existingPlayerMatch && (
          <div className="flex gap-2">
            <input required={!existingPlayerMatch} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First Name" className="flex-1 border rounded px-2 py-1.5 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none" />
            <input required={!existingPlayerMatch} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last Name" className="flex-1 border rounded px-2 py-1.5 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none" />
          </div>
        )}

        <div>
          <input required type="text" value={jersey} onChange={e => setJersey(e.target.value)} placeholder="Jersey #" className="w-24 border rounded px-2 py-1.5 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={() => setIsExpanded(false)} className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded-md transition-colors">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="px-4 py-1.5 bg-red-600 text-white font-bold rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors">
            {isSubmitting ? 'Saving...' : existingPlayerMatch ? 'Add Existing' : 'Create & Add'}
          </button>
        </div>
      </div>
    </form>
  );
}

// --- Control Computation Utilities ---
interface ControlPeriod {
  teamId: string;
  startTime: number;
  endTime: number | null; // null if still ongoing
}

interface TeamControlStats {
  teamId: string;
  goalsWithControl: number;
  goalsFacingControl: number;
  shotsWithControl: number;
  shotsFacingControl: number;
  turnoversWithControl: number;
  controlPeriods: number;
  totalControlTimeSeconds: number;
  scoringPctWithControl: number;
  scoringPctFacingControl: number;
}

interface PlayerControlStats {
  playerId: string;
  goalsWithControl: number;
  goalsFacingControl: number;
  shotsWithControl: number;
  shotsFacingControl: number;
  assistsWithControl: number;
  assistsFacingControl: number;
}

function computeControlPeriods(events: GameEvent[]): ControlPeriod[] {
  const sorted = [...events].sort((a, b) => a.videoTime - b.videoTime);
  const periods: ControlPeriod[] = [];
  let currentControl: { teamId: string | null; startTime: number } | null = null;

  for (const event of sorted) {
    if (event.type === 'control_change' || event.type === 'control_start') {
      // Close previous period
      if (currentControl) {
        periods.push({
          teamId: currentControl.teamId ?? '',
          startTime: currentControl.startTime,
          endTime: event.videoTime,
        });
      }
      // teamId null = nobody has possession — represented as empty string sentinel
      currentControl = { teamId: event.teamId ?? null, startTime: event.videoTime };
    }
  }

  if (currentControl) {
    periods.push({
      teamId: currentControl.teamId ?? '',
      startTime: currentControl.startTime,
      endTime: null,
    });
  }

  return periods;
}

function getControlTeamAtTime(periods: ControlPeriod[], videoTime: number): string | null {
  for (const period of periods) {
    if (videoTime >= period.startTime && (period.endTime === null || videoTime <= period.endTime)) {
      return period.teamId;
    }
  }
  return null;
}

function computeTeamControlStats(
  events: GameEvent[],
  periods: ControlPeriod[],
  homeTeamId: string,
  awayTeamId: string
): TeamControlStats[] {
  const teamIds = [homeTeamId, awayTeamId];
  const statsMap = new Map<string, TeamControlStats>();

  for (const tid of teamIds) {
    statsMap.set(tid, {
      teamId: tid,
      goalsWithControl: 0,
      goalsFacingControl: 0,
      shotsWithControl: 0,
      shotsFacingControl: 0,
      turnoversWithControl: 0,
      controlPeriods: periods.filter(p => p.teamId === tid).length,
      totalControlTimeSeconds: 0,
      scoringPctWithControl: 0,
      scoringPctFacingControl: 0,
    });
  }

  const sortedEvents = [...events].sort((a, b) => a.videoTime - b.videoTime);
  let isClockRunning = false;
  let currentControlTeam: string | null = null;
  let lastTimeAccruedAt: number | null = null;

  for (const event of sortedEvents) {
    if (event.type === 'gameStart') {
      isClockRunning = true;
      if (currentControlTeam && lastTimeAccruedAt === null) {
        lastTimeAccruedAt = event.videoTime;
      }
    } else if (event.type === 'gamePause' || event.type === 'gameEnd') {
      if (isClockRunning && currentControlTeam && lastTimeAccruedAt !== null) {
        const st = statsMap.get(currentControlTeam);
        if (st) st.totalControlTimeSeconds += (event.videoTime - lastTimeAccruedAt);
      }
      isClockRunning = false;
      lastTimeAccruedAt = null;
    } else if (event.type === 'control_change' || event.type === 'control_start') {
      const newTeamId = event.teamId ?? null;
      if (currentControlTeam !== newTeamId) {
        if (isClockRunning && currentControlTeam && lastTimeAccruedAt !== null) {
          const st = statsMap.get(currentControlTeam);
          if (st) st.totalControlTimeSeconds += (event.videoTime - lastTimeAccruedAt);
        }
        currentControlTeam = newTeamId;
        lastTimeAccruedAt = isClockRunning ? event.videoTime : null;
      }
    }
  }

  // Trailing time if the clock was running at the end of the timeline
  if (isClockRunning && currentControlTeam && lastTimeAccruedAt !== null) {
    const lastEvent = sortedEvents[sortedEvents.length - 1];
    if (lastEvent) {
      const st = statsMap.get(currentControlTeam);
      if (st) st.totalControlTimeSeconds += (lastEvent.videoTime - lastTimeAccruedAt);
    }
  }

  for (const event of events) {
    if (!event.teamId) continue;
    const controllingTeam = getControlTeamAtTime(periods, event.videoTime);
    if (!controllingTeam) continue;

    const stats = statsMap.get(event.teamId);
    if (!stats) continue;

    const hasControl = controllingTeam === event.teamId;

    if (event.type === 'goal') {
      if (hasControl) stats.goalsWithControl++;
      else stats.goalsFacingControl++;
    } else if (event.type === 'shot') {
      if (hasControl) stats.shotsWithControl++;
      else stats.shotsFacingControl++;
    } else if (event.type === 'turnover' && hasControl) {
      stats.turnoversWithControl++;
    }
  }

  // Compute scoring percentages
  for (const stats of statsMap.values()) {
    stats.scoringPctWithControl = stats.shotsWithControl > 0
      ? Math.round((stats.goalsWithControl / stats.shotsWithControl) * 100)
      : 0;
    stats.scoringPctFacingControl = stats.shotsFacingControl > 0
      ? Math.round((stats.goalsFacingControl / stats.shotsFacingControl) * 100)
      : 0;
  }

  return Array.from(statsMap.values());
}

function computePlayerControlStats(
  events: GameEvent[],
  periods: ControlPeriod[]
): PlayerControlStats[] {
  const statsMap = new Map<string, PlayerControlStats>();

  for (const event of events) {
    if (!event.playerId || !event.teamId) continue;
    const controllingTeam = getControlTeamAtTime(periods, event.videoTime);
    if (!controllingTeam) continue;

    if (!statsMap.has(event.playerId)) {
      statsMap.set(event.playerId, {
        playerId: event.playerId,
        goalsWithControl: 0,
        goalsFacingControl: 0,
        shotsWithControl: 0,
        shotsFacingControl: 0,
        assistsWithControl: 0,
        assistsFacingControl: 0,
      });
    }

    const stats = statsMap.get(event.playerId)!;
    const hasControl = controllingTeam === event.teamId;

    if (event.type === 'goal') {
      if (hasControl) stats.goalsWithControl++;
      else stats.goalsFacingControl++;
    } else if (event.type === 'shot') {
      if (hasControl) stats.shotsWithControl++;
      else stats.shotsFacingControl++;
    } else if (event.type === 'assist') {
      if (hasControl) stats.assistsWithControl++;
      else stats.assistsFacingControl++;
    }
  }

  return Array.from(statsMap.values());
}

// --- Score & Win Condition Utilities ---

const GOAL_PTS = 10;
const FLAG_CATCH_PTS = 35; // 3.5 goals × 10 pts

function computeScores(
  events: GameEvent[],
  homeTeamId: string,
  awayTeamId: string
): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const e of events) {
    if (e.type === 'goal') {
      if (e.teamId === homeTeamId) home += GOAL_PTS;
      else if (e.teamId === awayTeamId) away += GOAL_PTS;
    } else if (e.type === 'flag_catch') {
      if (e.teamId === homeTeamId) home += FLAG_CATCH_PTS;
      else if (e.teamId === awayTeamId) away += FLAG_CATCH_PTS;
    }
  }
  return { home, away };
}

interface WinConditionResult {
  targetSet: boolean;
  flagOnPitch: boolean;
  threshold: number | null; // The score that either team needs to hit to win
  winner: string | null;    // teamId of the winning team, or null if not yet decided
}

function computeWinCondition(
  events: GameEvent[],
  homeTeamId: string,
  awayTeamId: string
): WinConditionResult {
  const sorted = [...events].sort((a, b) => a.videoTime - b.videoTime);
  let runningHome = 0;
  let runningAway = 0;
  let runningThreshold: number | null = null;
  let flagOnPitch = false;

  for (const e of sorted) {
    if (e.type === 'flag_released') {
      if (runningThreshold === null) {
        runningThreshold = Math.max(runningHome, runningAway) + 60;
      }
      flagOnPitch = true;
    }
    else if (e.type === 'goal') {
      if (e.teamId === homeTeamId) runningHome += GOAL_PTS;
      else if (e.teamId === awayTeamId) runningAway += GOAL_PTS;
    } else if (e.type === 'flag_catch') {
      if (e.teamId === homeTeamId) runningHome += FLAG_CATCH_PTS;
      else if (e.teamId === awayTeamId) runningAway += FLAG_CATCH_PTS;
      flagOnPitch = false;
    }

    if (runningThreshold !== null) {
      if (runningHome >= runningThreshold && !flagOnPitch) return { targetSet: true, flagOnPitch: false, threshold: runningThreshold, winner: homeTeamId };
      if (runningAway >= runningThreshold && !flagOnPitch) return { targetSet: true, flagOnPitch: false, threshold: runningThreshold, winner: awayTeamId };
    }
  }

  // End condition safety check
  if (runningThreshold !== null && !flagOnPitch) {
    if (runningHome >= runningThreshold) return { targetSet: true, flagOnPitch: false, threshold: runningThreshold, winner: homeTeamId };
    if (runningAway >= runningThreshold) return { targetSet: true, flagOnPitch: false, threshold: runningThreshold, winner: awayTeamId };
  }

  return { targetSet: runningThreshold !== null, flagOnPitch, threshold: runningThreshold, winner: null };
}

/**
 * Returns true if a season name refers to a season AFTER Fall 2019.
 * Parses the year from strings like "Fall 2021", "Spring 2022", etc.
 * Fall 2019 and earlier are excluded ("legacy era").
 */
function isModernSeason(seasonName: string): boolean {
  const match = seasonName.match(/\b(\d{4})\b/);
  if (!match) return true; // unknown format – include by default
  const year = parseInt(match[1], 10);
  if (year > 2019) return true;
  if (year === 2019) {
    // Exclude Fall 2019, include Spring 2019 (spring comes before fall)
    // "Fall 2019" is not modern; "Spring 2019" is also excluded (≤ fall 2019)
    return false;
  }
  return false;
}


// --- Substitution Position Resolution ---

const PLACEHOLDER_TO_POSITION: Record<string, PositionType> = {
  chasera: 'chaser', chaserb: 'chaser', chaserc: 'chaser',
  keeper: 'keeper',
  beatera: 'beater', beaterb: 'beater',
  seeker: 'seeker',
};

/**
 * Resolves position for each substitution event by walking the placeholder chain.
 * Returns a Map<eventIndex, PositionType> keyed by the row's index in the input array.
 */
function resolveSubPositions(
  rows: { type: string; playerId: string | null; subPlayerId: string | null; gameId: string; videoTime: number; index: number }[]
): Map<number, PositionType> {
  const result = new Map<number, PositionType>();
  // Group by gameId
  const byGame = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byGame.has(r.gameId)) byGame.set(r.gameId, []);
    byGame.get(r.gameId)!.push(r);
  }

  for (const [, gameRows] of byGame) {
    // Sort by videoTime
    const sorted = [...gameRows].sort((a, b) => a.videoTime - b.videoTime);
    // playerToPosition: maps current playerId → position (seeded by placeholders)
    const playerToPosition = new Map<string, PositionType>();
    // Seed placeholders
    for (const [placeholder, pos] of Object.entries(PLACEHOLDER_TO_POSITION)) {
      playerToPosition.set(placeholder, pos);
    }

    for (const row of sorted) {
      if (row.type !== 'substitution') continue;
      const outId = row.playerId;
      const inId = row.subPlayerId;
      if (!outId) continue;
      const pos = playerToPosition.get(outId);
      if (pos) {
        result.set(row.index, pos);
        // Transfer position to incoming player
        if (inId) {
          playerToPosition.set(inId, pos);
        }
        // Outgoing player no longer holds this position
        // (but keep them in map in case of re-entry — rare but safe)
      }
    }
  }
  return result;
}

export const serializeTimestamp = (ts: any): string => {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string') {
    // Check if it's the broken "[object Object]" or "Timestamp" string from early migration
    if (ts.startsWith('Timestamp(') || ts === '[object Object]') return new Date().toISOString();
    return ts;
  }
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  if (typeof ts === 'number') return new Date(ts).toISOString();
  if (ts.seconds) return new Date(ts.seconds * 1000).toISOString();
  return new Date().toISOString();
};

// --- Management View ---

interface ManagementViewProps {
  teams: Team[];
  seasons: Season[];
  players: Player[];
  videos: Video[];
  games: Game[];
  onAddTeam: (name: string) => Promise<string | void | null>;
  onAddSeason: (name: string, league: string, year: string, description: string) => Promise<string | void | null>;
  onAddPlayer: (firstName: string, lastName: string, preferredName?: string, nickname?: string) => Promise<string | void | null>;
  onAddPlayerToRoster: (rosterId: string, playerId: string, number: string) => void;
  onRemovePlayerFromRoster: (rosterId: string, playerId: string) => void;
  onCreateRoster: (teamId: string, seasonId: string) => Promise<string | void | null>;
  onEditTeamEmails: (id: string, emails: string[]) => void;
  onDeleteTeam: (id: string) => void;
  onDeleteGame: (id: string, tag?: string | null) => void;
  onDeleteVideo: (id: string) => void;
  onDeleteSeason: (id: string) => void;
  onEditSeason: (id: string, newName: string, newLeague: string, newYear: string, newDescription: string) => Promise<void>;
  onDeletePlayer: (id: string) => void;
  onEditPlayer: (id: string, newFirst: string, newLast: string) => Promise<void>;
  onDeleteRoster: (id: string) => void;
  onSetLocalSimulation?: (data: any) => void;
  onRunMigration: () => Promise<void>;
  onBackfillAuthorId?: () => Promise<number | undefined>;
  isAdmin?: boolean;
  onAddRole?: (email: string, tier: 'authors' | 'trusted' | 'moderators') => Promise<void>;
  onRemoveRole?: (email: string, tier: 'authors' | 'trusted' | 'moderators') => Promise<void>;
  onRefreshData?: () => void;
  userRoles?: { authors: string[], trusted: string[], moderators: string[] };
}

function UnifiedRosterEditor({
  teams, seasons, players, rosters, rosterPlayers,
  selectedRosterId, setSelectedRosterId,
  onAddTeam, onAddPlayer, onAddPlayerToRoster, onRemovePlayerFromRoster,
  onCreateRoster, onDeleteRoster
}: any) {
  const [teamSelection, setTeamSelection] = useState('');
  const [seasonSelection, setSeasonSelection] = useState('');
  const [newTeamName, setNewTeamName] = useState('');

  const [searchPlayer, setSearchPlayer] = useState('');
  const [stagedPlayerId, setStagedPlayerId] = useState('');
  const [stagedPlayerNumber, setStagedPlayerNumber] = useState('');

  const [newPlayerFirst, setNewPlayerFirst] = useState('');
  const [newPlayerLast, setNewPlayerLast] = useState('');
  const [newPlayerNumber, setNewPlayerNumber] = useState('');
  const [newPlayerPreferredName, setNewPlayerPreferredName] = useState('');

  const selectedRoster = rosters.find((r: any) => r.id === selectedRosterId);

  return (
    <>
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
          <h3 className="text-lg font-bold mb-4">Select or Create Roster</h3>
          <div className="space-y-4">
            <select className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3" value={teamSelection} onChange={e => setTeamSelection(e.target.value)}>
              <option value="">-- Select Existing Team --</option>
              {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="flex gap-2 items-center">
              <span className="text-xs font-bold text-gray-400 uppercase">OR</span>
              <input placeholder="New Team Name..." className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} />
              <button onClick={async () => { if (newTeamName) { const id = await onAddTeam(newTeamName); if (id) setTeamSelection(id); setNewTeamName(''); } }} className="bg-gray-900 hover:bg-black text-white px-3 py-2 rounded-xl text-sm font-bold transition-colors">Add</button>
            </div>

            <select className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 mt-4" value={seasonSelection} onChange={e => setSeasonSelection(e.target.value)}>
              <option value="">-- Select Season --</option>
              {seasons.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            <button
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!teamSelection || !seasonSelection}
              onClick={async () => {
                if (teamSelection && seasonSelection) {
                  const id = await onCreateRoster(teamSelection, seasonSelection);
                  if (id) setSelectedRosterId(id);
                }
              }}
            >
              Create / Select Roster
            </button>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden flex flex-col max-h-[500px]">
          <div className="p-4 bg-gray-100 font-bold border-b border-gray-200 shrink-0">Existing Rosters</div>
          <div className="overflow-y-auto custom-scrollbar flex-1 divide-y divide-gray-200">
            {rosters.map((r: any) => {
              const team = teams.find((t: any) => t.id === r.teamId);
              const season = seasons.find((s: any) => s.id === r.seasonId);
              return (
                <div key={r.id} className={cn("p-4 flex justify-between items-center cursor-pointer transition-colors group", selectedRosterId === r.id ? "bg-white border-l-4 border-red-500 shadow-sm" : "hover:bg-white")} onClick={() => setSelectedRosterId(r.id)}>
                  <div className={selectedRosterId === r.id ? "-ml-1" : ""}>
                    <p className="font-bold">{team?.name || 'Unknown Team'}</p>
                    <p className="text-xs text-gray-500">{season?.name || 'Unknown Season'}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete roster?')) onDeleteRoster(r.id); }} className="p-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><XCircle className="w-5 h-5" /></button>
                </div>
              )
            })}
            {rosters.length === 0 && <div className="p-8 text-center text-gray-400">No rosters found.</div>}
          </div>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-6">
        {selectedRoster ? (
          <>
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 flex flex-col md:flex-row gap-8">
              <div className="flex-1 space-y-4">
                <h3 className="text-lg font-bold flex items-center gap-2"><User className="w-5 h-5 text-red-500" /> Add Existing Player</h3>
                <div className="relative">
                  <input placeholder="Search Database..." value={searchPlayer} onChange={e => { setSearchPlayer(e.target.value); setStagedPlayerId(''); }} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 pl-10 focus:border-red-500 outline-none" />
                  <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
                </div>
                {searchPlayer && !stagedPlayerId && (
                  <div className="max-h-48 overflow-y-auto custom-scrollbar border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white shadow-lg relative z-10">
                    {players.filter((p: any) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchPlayer.toLowerCase())).slice(0, 10).map((p: any) => (
                      <div key={p.id} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex items-center justify-between cursor-pointer" onClick={() => { setStagedPlayerId(p.id); setSearchPlayer(`${p.firstName} ${p.lastName}`); }}>
                        <span className="font-medium">{p.firstName} {p.lastName}</span>
                      </div>
                    ))}
                    {players.filter((p: any) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchPlayer.toLowerCase())).length === 0 && (
                      <div className="p-4 text-sm text-gray-500 text-center">No players found matching "{searchPlayer}"</div>
                    )}
                  </div>
                )}
                {stagedPlayerId && (
                  <div className="space-y-3 mt-4 p-4 border border-red-100 bg-red-50 rounded-xl">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-red-900">{searchPlayer}</span>
                      <button onClick={() => { setStagedPlayerId(''); setSearchPlayer(''); }} className="text-xs text-red-500 hover:text-red-700 font-bold uppercase tracking-wider">Clear</button>
                    </div>
                    <input type="text" placeholder="Jersey Number (Optional)" value={stagedPlayerNumber} onChange={e => setStagedPlayerNumber(e.target.value)} className="w-full bg-white border border-red-200 rounded-xl px-4 py-3 font-mono focus:border-red-500 outline-none" />
                    <button onClick={async () => {
                      await onAddPlayerToRoster(selectedRoster.id, stagedPlayerId, stagedPlayerNumber);
                      setStagedPlayerId(''); setSearchPlayer(''); setStagedPlayerNumber('');
                    }} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-all shadow-md hover:shadow-lg">Add to Roster</button>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-4 pt-6 md:pt-0 md:pl-8 border-t md:border-t-0 md:border-l border-gray-200 relative">
                <div className="absolute -top-3 left-1/2 md:-left-3 md:top-1/2 -translate-x-1/2 md:-translate-y-1/2 bg-gray-50 px-2 md:py-2 text-[10px] font-bold text-gray-400 uppercase">OR</div>
                <h3 className="text-lg font-bold flex items-center gap-2"><Plus className="w-5 h-5 text-gray-500" /> Create New Player</h3>
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="First Name" value={newPlayerFirst} onChange={e => setNewPlayerFirst(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:border-gray-500 outline-none" />
                  <input placeholder="Last Name" value={newPlayerLast} onChange={e => setNewPlayerLast(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:border-gray-500 outline-none" />
                  <input placeholder="Preferred Name (Optional)" value={newPlayerPreferredName ?? ''} onChange={e => setNewPlayerPreferredName(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:border-gray-500 outline-none" />
                  <input type="text" placeholder="Jersey # (Optional)" value={newPlayerNumber} onChange={e => setNewPlayerNumber(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 font-mono focus:border-gray-500 outline-none" />
                </div>
                <button onClick={async () => {
                  if (!newPlayerFirst || !newPlayerLast) { alert("Enter first name and last name."); return; }
                  const newId = await onAddPlayer(newPlayerFirst, newPlayerLast, newPlayerPreferredName || undefined);
                  if (newId) {
                    await onAddPlayerToRoster(selectedRoster.id, newId, newPlayerNumber);
                    setNewPlayerFirst(''); setNewPlayerLast(''); setNewPlayerNumber(''); setNewPlayerPreferredName('');
                  }
                }} className="w-full bg-gray-900 text-white font-bold py-3 rounded-xl hover:bg-black transition-all">Create & Add to Roster</button>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden flex flex-col max-h-[600px]">
              <div className="p-4 bg-gray-100 font-bold border-b border-gray-200 flex items-center justify-between shrink-0">
                <span>Players in Roster</span>
                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">{rosterPlayers.length}</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto custom-scrollbar flex-1">
                {rosterPlayers.map((rp: any) => (
                  <div key={rp.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200 group hover:border-gray-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-red-600/10 rounded-lg flex items-center justify-center text-sm font-bold text-red-600 font-mono">
                        {rp.number || '-'}
                      </div>
                      <span className="font-bold">{rp.player?.firstName} {rp.player?.lastName}</span>
                    </div>
                    <button
                      onClick={() => { if (confirm('Remove player from roster?')) onRemovePlayerFromRoster(selectedRosterId, rp.playerId); }}
                      className="p-2 text-gray-300 hover:bg-red-50 hover:text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {rosterPlayers.length === 0 && <p className="col-span-full py-12 text-center text-gray-400">No players currently in this roster.</p>}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl h-[400px] flex flex-col items-center justify-center text-center text-gray-400 p-12">
            <User className="w-16 h-16 mx-auto mb-4 text-gray-200" />
            <p className="text-xl font-bold text-gray-400 mb-2">No Roster Selected</p>
            <p>Select a roster from the list, or create a new one to start adding players and jersey numbers.</p>
          </div>
        )}
      </div>
    </>
  );
}

// === EventsManagementTab ===
function EventsManagementTab({ games, teams, players, videos }: { games: Game[]; teams: Team[]; players: Player[]; videos: Video[] }) {
  const [allGameDocs, setAllGameDocs] = useState<{ gameId: string; events: GameEvent[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filterGameId, setFilterGameId] = useState('');
  const [filterTeamId, setFilterTeamId] = useState('');
  const [filterMissing, setFilterMissing] = useState<'all' | 'no_player' | 'no_team' | 'no_type' | 'no_game' | 'no_video' | 'no_valid_video'>('all');
  const [filterType, setFilterType] = useState('');
  const [sortField, setSortField] = useState<'gameId' | 'videoTime' | 'type'>('gameId');
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchField, setBatchField] = useState<'teamId' | 'playerId' | 'type' | 'position' | 'status'>('teamId');
  const [batchValue, setBatchValue] = useState('');
  const [saving, setSaving] = useState(false);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'gameEvents'));
      const docs = snap.docs.map(d => ({ gameId: d.id, events: (d.data().events || []) as GameEvent[] }));
      setAllGameDocs(docs);
      setLoaded(true);
    } catch (e: any) {
      toast.error('Failed to load events: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const flatEvents = useMemo(() => {
    const flat: (GameEvent & { _docGameId: string })[] = [];
    for (const d of allGameDocs) {
      for (const ev of d.events) {
        flat.push({ ...ev, _docGameId: d.gameId, gameId: ev.gameId || d.gameId });
      }
    }
    return flat;
  }, [allGameDocs]);

  const filteredEvents = useMemo(() => {
    let evs = [...flatEvents];
    if (filterGameId.trim()) {
      const q = filterGameId.trim().toLowerCase();
      evs = evs.filter(e =>
        (e.gameId || '').toLowerCase().includes(q) ||
        (e.videoId || '').toLowerCase().includes(q)
      );
    }
    if (filterTeamId.trim()) {
      const tq = filterTeamId.trim().toLowerCase();
      evs = evs.filter(e => (e.teamId || '').toLowerCase().includes(tq));
    }
    if (filterType) evs = evs.filter(e => e.type === filterType);
    if (filterMissing === 'no_player') evs = evs.filter(e => !e.playerId);
    else if (filterMissing === 'no_team') evs = evs.filter(e => !e.teamId);
    else if (filterMissing === 'no_type') evs = evs.filter(e => !e.type);
    else if (filterMissing === 'no_game') evs = evs.filter(e => !e.gameId || e.gameId.includes('unknown'));
    else if (filterMissing === 'no_video') evs = evs.filter(e => !e.videoId || e.videoId.includes('unknown'));
    else if (filterMissing === 'no_valid_video') {
      const validVideoIds = new Set(videos.map(v => v.videoId || v.id));
      evs = evs.filter(e => e.videoId && e.gameId && !validVideoIds.has(e.videoId));
    }
    evs.sort((a, b) => {
      let va: any = a[sortField as keyof GameEvent] ?? '';
      let vb: any = b[sortField as keyof GameEvent] ?? '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return evs;
  }, [flatEvents, filterGameId, filterTeamId, filterType, filterMissing, sortField, sortAsc]);

  const toggleSelect = (id: string) => setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectAll = () => setSelectedIds(new Set(filteredEvents.map(e => e.id)));
  const clearSel = () => setSelectedIds(new Set());

  const handleBatchUpdate = async () => {
    if (selectedIds.size === 0) { toast.error('No events selected.'); return; }
    if (!confirm(`Update "${batchField}" to "${batchValue}" for ${selectedIds.size} event(s)?`)) return;
    setSaving(true);
    try {
      const grouped = new Map<string, GameEvent[]>();
      for (const d of allGameDocs) {
        if (d.events.some(ev => selectedIds.has(ev.id))) grouped.set(d.gameId, d.events);
      }
      const batch = writeBatch(db);
      for (const [docGameId, events] of grouped) {
        const updated = events.map(ev => {
          if (!selectedIds.has(ev.id)) return ev;
          const val: any = (batchValue === 'null' || batchValue === '') ? null : batchValue;
          return { ...ev, [batchField]: val };
        });
        batch.update(doc(db, 'gameEvents', docGameId), { events: updated });
      }
      await batch.commit();
      setAllGameDocs(prev => prev.map(d => {
        if (!grouped.has(d.gameId)) return d;
        return { ...d, events: d.events.map(ev => { if (!selectedIds.has(ev.id)) return ev; const val: any = (batchValue === 'null' || batchValue === '') ? null : batchValue; return { ...ev, [batchField]: val } as GameEvent; }) };
      }));
      toast.success(`Updated ${selectedIds.size} event(s).`);
      setSelectedIds(new Set());
    } catch (e: any) {
      toast.error('Batch update failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const EVENT_TYPES = ['goal', 'assist', 'shot', 'attempt', 'turnover', 'card', 'sub_in', 'sub_out', 'control_change', 'control_start', 'quadball_start', 'flag_released', 'flag_catch', 'gameStart', 'gamePause', 'gameEnd'];
  const getPlayerName = (id?: string) => { if (!id) return ''; const p = players.find(pl => pl.id === id); return p ? `${p.firstName} ${p.lastName}` : id.slice(0, 10) + '…'; };
  const getTeamName = (id?: string) => { if (!id) return ''; const t = teams.find(tm => tm.id === id); return t ? t.name : id.slice(0, 10) + '…'; };

  return (
    <div className="lg:col-span-3 space-y-4">
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Event Manager</h3>
            <p className="text-sm text-gray-500 mt-0.5">Browse, filter, and batch-update events across all games.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { loadEvents(); setFilterMissing('no_valid_video'); }} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50"
              title="Loads events that have a gameId/videoId but lack a corresponding Video document">
              Find Orphaned Stats
            </button>
            <button onClick={loadEvents} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50">
              {loading ? 'Loading…' : loaded ? '↻ Reload' : 'Load All Events'}
            </button>
          </div>
        </div>

        {loaded && <p className="text-xs text-gray-400 mb-4">{flatEvents.length.toLocaleString()} events across {allGameDocs.length} game documents.</p>}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 block">Game / Video ID</label>
            <input value={filterGameId} onChange={e => setFilterGameId(e.target.value)}
              placeholder="Search ID contains…"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 block">Team ID</label>
            <input value={filterTeamId} onChange={e => setFilterTeamId(e.target.value)}
              placeholder="Search Team ID…"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 block">Event Type</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500">
              <option value="">All Types</option>
              {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 block">Missing Data</label>
            <select value={filterMissing} onChange={e => setFilterMissing(e.target.value as any)}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500">
              <option value="all">Show All</option>
              <option value="no_player">Missing Player</option>
              <option value="no_team">Missing Team</option>
              <option value="no_type">Missing Type</option>
              <option value="no_game">Missing Game ID</option>
              <option value="no_video">Missing Video ID</option>
              <option value="no_valid_video">Orphaned Stats (No DB Video)</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 block">Sort By</label>
            <div className="flex gap-1">
              <select value={sortField} onChange={e => setSortField(e.target.value as any)}
                className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-red-500">
                <option value="gameId">Game ID</option>
                <option value="videoTime">Time</option>
                <option value="type">Type</option>
              </select>
              <button onClick={() => setSortAsc(!sortAsc)}
                className="px-2 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm font-bold">
                {sortAsc ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>

        {loaded && (
          <div className="flex flex-wrap items-center gap-2 mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <span className="text-xs font-bold text-amber-700 whitespace-nowrap uppercase tracking-wider shrink-0">Batch Update ({selectedIds.size} selected)</span>
            <select value={batchField} onChange={e => setBatchField(e.target.value as any)}
              className="bg-white border border-amber-200 rounded-lg px-2 py-1.5 text-sm outline-none">
              <option value="teamId">Team ID</option>
              <option value="playerId">Player ID</option>
              <option value="type">Event Type</option>
              <option value="position">Position</option>
              <option value="status">Status</option>
            </select>
            <input value={batchValue} onChange={e => setBatchValue(e.target.value)}
              placeholder={batchField === 'type' ? 'e.g. goal' : batchField === 'status' ? 'verified / unverified' : 'value or "null" to clear'}
              className="flex-1 min-w-[140px] bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-amber-400" />
            <button onClick={selectAll} className="text-xs font-bold px-2 py-1.5 bg-gray-700 hover:bg-gray-800 text-white rounded-lg transition-colors">All ({filteredEvents.length})</button>
            <button onClick={clearSel} className="text-xs font-bold px-2 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors">Clear</button>
            <button onClick={handleBatchUpdate} disabled={saving || selectedIds.size === 0}
              className="text-xs font-bold px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Apply'}
            </button>
          </div>
        )}

        {!loaded ? (
          <div className="text-center py-16 text-gray-400">
            <Database className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <p className="font-bold">Click "Load All Events" to begin</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                  <tr>
                    <th className="p-2 w-8"><input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === filteredEvents.length} onChange={e => e.target.checked ? selectAll() : clearSel()} className="rounded" /></th>
                    <th className="p-2 text-left text-[10px] uppercase tracking-wider text-gray-400 font-bold">Game ID</th>
                    <th className="p-2 text-left text-[10px] uppercase tracking-wider text-gray-400 font-bold">Video ID</th>
                    <th className="p-2 text-left text-[10px] uppercase tracking-wider text-gray-400 font-bold">Type</th>
                    <th className="p-2 text-left text-[10px] uppercase tracking-wider text-gray-400 font-bold">Time</th>
                    <th className="p-2 text-left text-[10px] uppercase tracking-wider text-gray-400 font-bold">Team</th>
                    <th className="p-2 text-left text-[10px] uppercase tracking-wider text-gray-400 font-bold">Player</th>
                    <th className="p-2 text-left text-[10px] uppercase tracking-wider text-gray-400 font-bold">Pos</th>
                    <th className="p-2 text-left text-[10px] uppercase tracking-wider text-gray-400 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEvents.slice(0, 500).map(ev => {
                    const hasIssue = !ev.playerId || !ev.teamId;
                    const isSel = selectedIds.has(ev.id);
                    const vt = typeof ev.videoTime === 'number' ? `${Math.floor(ev.videoTime / 60)}:${String(Math.floor(ev.videoTime % 60)).padStart(2, '0')}` : '—';
                    return (
                      <tr key={ev.id} onClick={() => toggleSelect(ev.id)}
                        className={cn('cursor-pointer transition-colors', isSel ? 'bg-amber-50 hover:bg-amber-100' : hasIssue ? 'bg-red-50/30 hover:bg-red-50' : 'hover:bg-gray-50')}>
                        <td className="p-2 text-center"><input type="checkbox" checked={isSel} onChange={() => toggleSelect(ev.id)} onClick={e => e.stopPropagation()} className="rounded" /></td>
                        <td className="p-2 font-mono text-gray-500 max-w-[120px] truncate" title={ev.gameId}>{ev.gameId}</td>
                        <td className="p-2 font-mono text-gray-400 max-w-[120px] truncate" title={ev.videoId}>{ev.videoId || '—'}</td>
                        <td className="p-2">
                          <span className={cn('px-1.5 py-0.5 rounded font-bold text-[10px] uppercase',
                            !ev.type ? 'bg-red-100 text-red-500' :
                              ev.type === 'goal' ? 'bg-green-100 text-green-700' :
                                ev.type.startsWith('sub') ? 'bg-blue-100 text-blue-700' :
                                  ev.type.includes('control') ? 'bg-emerald-100 text-emerald-700' :
                                    ev.type.includes('flag') ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-gray-100 text-gray-600'
                          )}>{ev.type || 'MISSING'}</span>
                        </td>
                        <td className="p-2 font-mono text-gray-500">{vt}</td>
                        <td className={cn('p-2 truncate max-w-[90px]', !ev.teamId ? 'text-red-400' : 'text-gray-700')} title={ev.teamId || ''}>{getTeamName(ev.teamId) || <span className="italic">—</span>}</td>
                        <td className={cn('p-2 truncate max-w-[90px]', !ev.playerId ? 'text-red-400' : 'text-gray-700')} title={ev.playerId || ''}>{getPlayerName(ev.playerId) || <span className="italic">—</span>}</td>
                        <td className="p-2 text-gray-400">{ev.position || '—'}</td>
                        <td className="p-2">{ev.status === 'verified' ? <span className="text-amber-500 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredEvents.length > 500 && <p className="text-center py-3 text-xs text-gray-400 border-t">Showing first 500 of {filteredEvents.length.toLocaleString()} — use filters to narrow down.</p>}
              {filteredEvents.length === 0 && <div className="py-16 text-center text-gray-400">No events match the current filters.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ManagementView({

  teams,

  seasons,
  players,
  videos,
  games,
  onAddTeam,
  onAddSeason,
  onAddPlayer,
  onAddPlayerToRoster,
  onRemovePlayerFromRoster,
  onCreateRoster,
  onEditTeamEmails,
  onDeleteTeam,
  onDeleteGame,
  onDeleteVideo,
  onDeleteSeason,
  onEditSeason,
  onDeletePlayer,
  onEditPlayer,
  onDeleteRoster,
  onRefreshData,
  onSetLocalSimulation,
  onRunMigration,
  onBackfillAuthorId,
  isAdmin,
  userRoles,
  onAddRole,
  onRemoveRole
}: ManagementViewProps) {
  const [activeTab, setActiveTab] = useState<'teams' | 'seasons' | 'players' | 'rosters' | 'games' | 'import' | 'roles' | 'events'>('teams');
  const [newItemFirstName, setNewItemFirstName] = useState('');
  const [newItemLastName, setNewItemLastName] = useState('');
  const [newPlayerPreferredName, setNewPlayerPreferredName] = useState('');
  const [newPlayerNickname, setNewPlayerNickname] = useState('');

  // Season Creation State
  const [newSeasonLeague, setNewSeasonLeague] = useState('USQ');
  const [newSeasonYear, setNewSeasonYear] = useState('');
  const [newSeasonDescription, setNewSeasonDescription] = useState('');

  // Roster Management State
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [selectedRosterId, setSelectedRosterId] = useState('');
  const [rosterPlayers, setRosterPlayers] = useState<(RosterPlayer & { player?: Player })[]>([]);

  const [searchPlayer, setSearchPlayer] = useState('');
  const [playerNumber, setPlayerNumber] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');

  // Team Email Editor State
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamEmails, setEditingTeamEmails] = useState('');

  // Import State
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importType, setImportType] = useState<'stats' | 'players' | 'teams' | 'rosters' | 'videos' | 'local_sim' | 'deduplicator'>('stats');
  const [useLocalSimMode, setUseLocalSimMode] = useState<boolean>(true);
  const [uploadSimToLive, setUploadSimToLive] = useState<boolean>(false);
  const [filterTeamId, setFilterTeamId] = useState('');

  // DB Search State
  const [dbSearchTerm, setDbSearchTerm] = useState('');
  const [dbSearchResults, setDbSearchResults] = useState<{collection: string, id: string, data: any}[]>([]);
  const [isSearchingDB, setIsSearchingDB] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'rosters'));
    return onSnapshot(q, (snap) => {
      setRosters(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Roster[]);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'rosters'));
  }, []);

  useEffect(() => {
    if (!selectedRosterId) {
      setRosterPlayers([]);
      return;
    }
    return onSnapshot(collection(db, 'rosters', selectedRosterId, 'players'), (snap) => {
      setRosterPlayers(snap.docs.map(doc => {
        const data = doc.data() as RosterPlayer;
        return { ...data, player: players.find(p => p.id === data.playerId) };
      }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `rosters/${selectedRosterId}/players`));
  }, [selectedRosterId, players]);

  const getPlayerFullName = (p?: Player) => {
    if (!p) return 'Unknown Player';
    return `${p.firstName} ${p.lastName}`;
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-bold">Database Management</h2>
          <button
            onClick={async () => {
              if (!confirm('WARNING: This will completely rebuild all database caches directly from raw documents, forcefully wiping any phantom duplicates or corrupted list data. Proceed?')) return;
              try {
                toast.info('Rebuilding caches... Please wait...', { duration: 5000 });

                const vSnap = await getDocs(collection(db, 'videos'));
                const gSnap = await getDocs(collection(db, 'games'));
                const pSnap = await getDocs(collection(db, 'players'));
                const tSnap = await getDocs(collection(db, 'teams'));
                const sSnap = await getDocs(collection(db, 'seasons'));
                const rSnap = await getDocs(collection(db, 'rosters'));

                const serialize = (d: any) => d?.createdAt ? serializeTimestamp(d.createdAt) : undefined;

                const safeVData = vSnap.docs.map(doc => ({ ...doc.data(), id: doc.id, createdAt: serialize(doc.data()) }));
                const safeGData = gSnap.docs.map(doc => ({ ...doc.data(), id: doc.id, createdAt: serialize(doc.data()) }));
                const safePData = pSnap.docs.map(doc => ({ ...doc.data(), id: doc.id, createdAt: serialize(doc.data()) }));
                const safeTData = tSnap.docs.map(doc => ({ ...doc.data(), id: doc.id, createdAt: serialize(doc.data()) }));
                const safeSData = sSnap.docs.map(doc => ({ ...doc.data(), id: doc.id, createdAt: serialize(doc.data()) }));
                const safeRData = rSnap.docs.map(doc => ({ ...doc.data(), id: doc.id, createdAt: serialize(doc.data()) }));

                const batch = writeBatch(db);
                batch.set(doc(db, 'aggregated', 'videos'), { data: safeVData });
                batch.set(doc(db, 'aggregated', 'games'), { data: safeGData });
                batch.set(doc(db, 'aggregated', 'players'), { data: safePData });
                batch.set(doc(db, 'aggregated', 'teams'), { data: safeTData });
                batch.set(doc(db, 'aggregated', 'seasons'), { data: safeSData });
                batch.set(doc(db, 'aggregated', 'rosters'), { data: safeRData });

                await batch.commit();
                toast.success('System Caches rebuilt successfully! Phantom duplicates destroyed.');
                onRefreshData();
              } catch (e: any) {
                console.error('Cache rebuild failed:', e);
                toast.error('Failed to repair caches: ' + e.message);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 font-bold rounded-lg text-xs transition-colors"
          >
            <Database className="w-4 h-4" /> REPAIR CACHES
          </button>
        </div>
        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-200">
          {(['search', 'teams', 'seasons', 'players', 'rosters', 'games', 'videos', 'roles', 'events', 'import'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold capitalize transition-all",
                activeTab === tab ? "bg-red-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-900"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {activeTab === 'events' ? (
          <EventsManagementTab games={games} teams={teams} players={players} videos={videos} />
        ) : activeTab === 'import' ? (
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-red-600/20 rounded-2xl flex items-center justify-center">
                  <FileUp className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Import Historical Data</h3>
                  <p className="text-gray-500">Upload a CSV file to convert old data to the new schema.</p>
                </div>
              </div>

              <div className="flex gap-4 mb-8 overflow-x-auto pb-2">
                {(['stats', 'players', 'teams', 'rosters', 'videos', 'local_sim', 'deduplicator'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      setImportType(type);
                      setCsvData([]);
                      setMapping({});
                    }}
                    className={cn(
                      "px-6 py-2 rounded-xl text-sm font-bold capitalize transition-all border whitespace-nowrap",
                      importType === type
                        ? "bg-red-600 border-red-500 text-white shadow-lg"
                        : "bg-white border-gray-200 text-gray-500 hover:text-gray-900"
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <div className="mb-8 p-6 bg-yellow-50/50 border border-yellow-200 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-yellow-900">Database Administration</h4>
                  <p className="text-sm text-yellow-700">Run Migration to consolidate fast-read documents to save on Firebase reads.</p>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm('Run the Data Aggregation Migration? This will read all players, teams, and seasons and write them to the `aggregated` collection.')) return;
                    toast.promise(onRunMigration(), {
                      loading: 'Running migration...',
                      success: 'Migration complete!',
                      error: 'Migration failed'
                    });
                  }}
                  className="px-4 py-2 bg-yellow-600/90 text-white rounded-xl font-bold hover:bg-yellow-700 transition"
                >
                  Run Migration
                </button>
              </div>

              {isAdmin && onBackfillAuthorId && (
                <div className="mb-8 p-6 bg-orange-50/50 border border-orange-200 rounded-2xl flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-orange-900">Backfill Author ID</h4>
                    <p className="text-sm text-orange-700">Stamp your user ID as the author on all existing games that don't have one yet.</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm('Set yourself as the author of all existing games without an author? This cannot be undone.')) return;
                      toast.promise(onBackfillAuthorId().then(n => `${n} games updated`), {
                        loading: 'Backfilling author IDs...',
                        success: (msg) => msg as string,
                        error: 'Backfill failed'
                      });
                    }}
                    className="px-4 py-2 bg-orange-600/90 text-white rounded-xl font-bold hover:bg-orange-700 transition"
                  >
                    Backfill
                  </button>
                </div>
              )}

              {importType === 'deduplicator' ? (
                <div className="border border-gray-200 rounded-2xl p-8 bg-white shadow-sm">
                  <div className="mb-6">
                    <h4 className="font-bold text-lg mb-2">Targeted Team Game Extractor</h4>
                    <p className="text-sm text-gray-500 mb-4">Select a team and upload your old events CSV. We will find every game that this team participated in and extract ALL events (for both teams) from those specific games into a new CSV.</p>
                    <select
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 mb-2"
                      value={filterTeamId}
                      onChange={e => setFilterTeamId(e.target.value)}
                    >
                      <option value="">-- Select Team to Extract Games For --</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className={`border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center transition-all group ${filterTeamId ? 'hover:border-red-500/50' : 'opacity-50 cursor-not-allowed'}`}>
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      id="csv-team-extractor"
                      disabled={!filterTeamId}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        toast.info("Scanning CSV for target games...", { duration: 2000 });

                        Papa.parse(file, {
                          header: true,
                          skipEmptyLines: true,
                          complete: (results) => {
                            const rows = results.data as any[];
                            const matchingGameOrVideoIds = new Set<string>();

                            // Pass 1: Find all game/video IDs where the selected team is referenced
                            rows.forEach(row => {
                              const vId = String(row.vid_id || row.videoId || row.objectId || '').trim();
                              const gId = String(row.gameId || '').trim();
                              const tId = String(row.team_id || row.teamId || row.homeTeamId || row.awayTeamId || '').trim();

                              if (tId === filterTeamId) {
                                if (vId) matchingGameOrVideoIds.add(vId);
                                if (gId) matchingGameOrVideoIds.add(gId);
                              }
                            });

                            if (matchingGameOrVideoIds.size === 0) {
                              toast.error("Could not find any events linked to this Team ID in the uploaded CSV.");
                              e.target.value = '';
                              return;
                            }

                            // Pass 2: Keep all rows (both teams) that belong to those games
                            const filteredRows = rows.filter(row => {
                              const vId = String(row.vid_id || row.videoId || row.objectId || '').trim();
                              const gId = String(row.gameId || '').trim();
                              return (vId && matchingGameOrVideoIds.has(vId)) || (gId && matchingGameOrVideoIds.has(gId));
                            });

                            toast.success(`Found ${matchingGameOrVideoIds.size} related games! Extracting ${filteredRows.length} total events. Downloading...`);

                            // Download the result
                            const newCsv = Papa.unparse(filteredRows);
                            const blob = new Blob([newCsv], { type: 'text/csv;charset=utf-8;' });
                            const link = document.createElement("a");
                            const url = URL.createObjectURL(blob);
                            link.setAttribute("href", url);
                            link.setAttribute("download", `extracted_${filterTeamId}_events_${Date.now()}.csv`);
                            link.style.visibility = 'hidden';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }
                        });

                        // Reset input
                        e.target.value = '';
                      }}
                    />
                    <label htmlFor={filterTeamId ? "csv-team-extractor" : ""} className={filterTeamId ? "cursor-pointer" : ""}>
                      <Database className="w-12 h-12 mx-auto mb-4 text-blue-500 group-hover:text-blue-400 transition-colors" />
                      <p className="text-lg font-bold mb-1">Select Old Events CSV</p>
                      <p className="text-sm text-gray-400">Extracts full games involving this team</p>
                    </label>
                  </div>
                </div>
              ) : importType === 'local_sim' ? (
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center hover:border-red-500/50 transition-all group">
                  <input
                    type="file"
                    accept=".csv"
                    multiple
                    className="hidden"
                    id="csv-upload-multiple"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length) return;

                      setIsImporting(true);
                      setImportProgress(10);

                      const parsedData: Record<string, any[]> = {};
                      let parseCount = 0;

                      files.forEach(file => {
                        Papa.parse(file, {
                          header: true,
                          skipEmptyLines: true,
                          complete: async (results) => {
                            const name = file.name.toLowerCase();
                            if (name.includes('players')) parsedData.players = results.data;
                            else if (name.includes('teams')) parsedData.teams = results.data;
                            else if (name.includes('rosters')) parsedData.rosters = results.data;
                            else if (name.includes('videos')) parsedData.videos = results.data;
                            else if (name.includes('stats') || name.includes('events')) parsedData.stats = results.data;
                            else parsedData.stats = results.data; // fallback for generic names like full_transformed.csv

                            parseCount++;
                            if (parseCount === files.length) {
                              setImportProgress(50);

                              // Transform raw parsed datasets directly into Domain Models
                              const simPlayers: Player[] = (parsedData.players || []).map((r: any) => ({
                                id: r.objectId || r.id,
                                firstName: r.first_name || r.firstName || '',
                                lastName: r.last_name || r.lastName || '',
                                createdAt: new Date()
                              }));

                              const simTeams: Team[] = (parsedData.teams || []).map((r: any) => ({
                                id: r.objectId || r.team_id || r.id,
                                name: r.team_name || r.name || r.objectId,
                                createdAt: new Date()
                              }));

                              const simSeasonsMap = new Map<string, Season>();
                              const simGamesMap = new Map<string, Game>();

                              (parsedData.videos || []).forEach((r: any) => {
                                const vId = r.vid_id || r.videoId || r.objectId;
                                const gId = `game_${vId}`;
                                const sId = r.fall_year || r.seasonId || 'unknown_season';
                                if (sId && !simSeasonsMap.has(sId)) {
                                  simSeasonsMap.set(sId, { id: sId, name: sId, createdAt: new Date() });
                                }
                                if (!simGamesMap.has(gId)) {
                                  simGamesMap.set(gId, {
                                    id: gId, seasonId: sId,
                                    homeTeamId: r.team_id || r.homeTeamId || 'unknown',
                                    awayTeamId: r.opponent_id || r.awayTeamId || 'unknown',
                                    createdAt: new Date()
                                  });
                                }
                              });

                              // Pre-build a fast position lookup map if possible from rosters (optional)

                              const simEvents: GameEvent[] = (parsedData.stats || []).map((r: any, idx: number) => {
                                const vId = r.vid_id || r.videoId || 'unknown_video';
                                const typeRaw = String(r.stat_name || r.type || r.eventType || '').trim();
                                let normType = typeRaw.toLowerCase().replace(/\s+/g, '_');

                                const gId = r.gameId || (vId !== 'unknown_video' ? `game_${vId}` : 'unknown_game');
                                const gameContext = simGamesMap.get(gId);

                                let resolvedTeamId = r.team_id || r.teamId;

                                // DROP symmetric mirrors & legacy noise BEFORE prefix-stripping
                                // AWAY_GOAL is a redundant mirror of GOAL (GOAL has player attribution)
                                // AWAY_SNITCH_CATCH is a mirror of SNITCH_CATCH
                                // OFFENSE/DEFENSE are bludger-count metadata, not discrete game events
                                // SWAP is a legacy positional notation
                                const DROP_TYPES = new Set(['away_snitch_catch', 'offense', 'defense', 'swap', 'seekers_released']);
                                if (DROP_TYPES.has(normType)) return null;

                                // If the raw event specifies away/home, strip it and apply correct team ID
                                if (normType.startsWith('away_')) {
                                  normType = normType.replace(/^away_/, '');
                                  if (!resolvedTeamId && gameContext) resolvedTeamId = gameContext.awayTeamId;
                                } else if (normType.startsWith('home_')) {
                                  normType = normType.replace(/^home_/, '');
                                  if (!resolvedTeamId && gameContext) resolvedTeamId = gameContext.homeTeamId;
                                }

                                // Apply user logic for goals without team IDs
                                if (normType === 'goal' && !resolvedTeamId) {
                                  // "If the RAW_EVENT is 'goal', that's almost always a home team goal."
                                  if (gameContext) resolvedTeamId = gameContext.homeTeamId;
                                }

                                if (normType === 'snitch_released') normType = 'flag_released';
                                if (normType === 'snitch_catch') normType = 'flag_catch';
                                if (normType === 'sub') normType = 'substitution';
                                if (normType === 'gain_control') normType = 'control_change';
                                if (normType === 'lose_control') return null;
                                if (normType === 'yellow_card' || normType === 'red_card') normType = 'card';

                                // Clock event normalization
                                if (['game_start', 'start_clock', 'clock_start'].includes(normType)) normType = 'gameStart';
                                if (['game_pause', 'pause_clock', 'clock_pause'].includes(normType)) normType = 'gamePause';
                                if (['game_resume', 'gameresume', 'resume_clock', 'clock_resume'].includes(normType)) normType = 'gameStart';
                                if (['game_end', 'end_clock', 'clock_end', 'end_game'].includes(normType)) normType = 'gameEnd';

                                // Clock events don't need teams or players
                                const isClockEvt = ['gameStart', 'gamePause', 'gameEnd'].includes(normType);
                                if (isClockEvt) resolvedTeamId = undefined as any;

                                // Parse time. Be sure to strip whitespaces or string literals.
                                const rawTime = r.time || r.videoTime || r.video_time || r.vid_time || '0';
                                const videoTime = parseFloat(String(rawTime).trim()) || 0;

                                // DATA CLEANLINESS RULES
                                const EXCLUDED = new Set(['offensive_drive', 'defensive_drive']);
                                if (EXCLUDED.has(normType)) return null;
                                if (vId === 'unknown_video' || gId === 'unknown_game' || !vId || !gId) return null;
                                if (videoTime < 0 || videoTime > 10000) return null; // Drop impossible timestamps

                                return {
                                  id: `evt_sim_${idx}`,
                                  videoId: vId,
                                  gameId: gId,
                                  type: normType,
                                  videoTime,
                                  playerId: isClockEvt ? undefined : (r.player_id || r.playerId || undefined),
                                  subPlayerId: isClockEvt ? undefined : (r.player_in_id || r.subPlayerId || undefined),
                                  teamId: isClockEvt ? undefined : (resolvedTeamId || undefined),
                                  position: r.position || undefined,
                                  status: 'active',
                                  userId: 'local_sim',
                                  userName: 'Simulation',
                                  createdAt: new Date().toISOString(),
                                  votes: 0,
                                } as unknown as GameEvent;
                              }).filter(Boolean) as GameEvent[];

                              // Post-pass: deduplicate goals at same timestamp (keep first, skip mirrors)
                              const dedupedEvents: GameEvent[] = [];
                              const goalTimestamps = new Set<string>();
                              for (const evt of simEvents) {
                                if (evt.type === 'goal') {
                                  const key = `${evt.gameId}_${Math.round(evt.videoTime)}`;
                                  if (goalTimestamps.has(key)) continue; // Skip duplicate goal
                                  goalTimestamps.add(key);
                                }
                                dedupedEvents.push(evt);
                              }
                              const finalSimEvents = dedupedEvents;

                              // Drop Empty Games
                              const validGameIds = new Set(finalSimEvents.map(e => e.gameId));
                              const simGamesCleaned = Array.from(simGamesMap.values()).filter(g => validGameIds.has(g.id));

                              // --- Position Chain Resolution ---
                              const PLACEHOLDER_POS: Record<string, string> = {
                                chasera: 'chaser', chaserb: 'chaser', chaserc: 'chaser',
                                keeper: 'keeper', beatera: 'beater', beaterb: 'beater', seeker: 'seeker',
                              };
                              const eventsByGameSim = new Map<string, typeof finalSimEvents>();
                              for (const ev of finalSimEvents) {
                                if (!eventsByGameSim.has(ev.gameId)) eventsByGameSim.set(ev.gameId, []);
                                eventsByGameSim.get(ev.gameId)!.push(ev);
                              }
                              for (const [, gEvents] of eventsByGameSim) {
                                const sorted = [...gEvents].sort((a, b) => a.videoTime - b.videoTime);
                                const posMap = new Map<string, string>(Object.entries(PLACEHOLDER_POS));
                                for (const ev of sorted) {
                                  if ((ev.type as string) !== 'substitution') continue;
                                  const outPid = ev.playerId?.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
                                  const inPid = ev.subPlayerId?.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
                                  if (!outPid) continue;
                                  const pos = posMap.get(outPid);
                                  if (pos) {
                                    (ev as any).position = pos;
                                    if (inPid) posMap.set(inPid, pos);
                                  }
                                }
                              }

                              const decoupledSimEvents = finalSimEvents.flatMap(ev => {
                                if ((ev.type as string) === 'substitution') {
                                  const outPid = ev.playerId?.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                                  const isPlaceholderOut = outPid && ['chasera', 'chaserb', 'chaserc', 'keeper', 'beatera', 'beaterb', 'seeker', 'null', 'undefined', 'noplayer'].includes(outPid);

                                  const outEv = (ev.playerId && !isPlaceholderOut) ? { ...ev, id: ev.id + '_out', type: 'sub_out', subPlayerId: undefined } as GameEvent : null;
                                  const inEv = ev.subPlayerId ? { ...ev, id: ev.id + '_in', type: 'sub_in', playerId: ev.subPlayerId, subPlayerId: undefined } as GameEvent : null;
                                  return [outEv, inEv].filter(Boolean) as GameEvent[];
                                }
                                return [{ ...ev, subPlayerId: undefined }] as GameEvent[];
                              });

                              setImportProgress(100);

                              if (uploadSimToLive) {
                                if (!confirm("WARNING: This will upload all 5 CSVs and overwrite LIVE data (including clearing Events). Continue?")) {
                                  setIsImporting(false);
                                  return;
                                }
                                toast.info("Starting Mass Upload to Live Firestore...");
                                setImportProgress(5);
                                const BATCH_SIZE = 400;

                                try {
                                  // 1. PLAYERS
                                  for (let i = 0; i < simPlayers.length; i += BATCH_SIZE) {
                                    const batch = writeBatch(db);
                                    simPlayers.slice(i, i + BATCH_SIZE).forEach(p => {
                                      batch.set(doc(db, 'players', p.id), { firstName: p.firstName || '', lastName: p.lastName || '', createdAt: serverTimestamp() }, { merge: true });
                                    });
                                    await batch.commit();
                                  }
                                  setImportProgress(15);

                                  // 2. TEAMS
                                  for (let i = 0; i < simTeams.length; i += BATCH_SIZE) {
                                    const batch = writeBatch(db);
                                    simTeams.slice(i, i + BATCH_SIZE).forEach(t => {
                                      batch.set(doc(db, 'teams', t.id), { name: t.name || t.id, createdAt: serverTimestamp() }, { merge: true });
                                    });
                                    await batch.commit();
                                  }
                                  setImportProgress(25);

                                  // 3. SEASONS & GAMES & VIDEOS
                                  const sList = Array.from(simSeasonsMap.values());
                                  for (let i = 0; i < sList.length; i += BATCH_SIZE) {
                                    const batch = writeBatch(db);
                                    sList.slice(i, i + BATCH_SIZE).forEach(s => batch.set(doc(db, 'seasons', s.id), { name: s.name || s.id, createdAt: serverTimestamp() }, { merge: true }));
                                    await batch.commit();
                                  }

                                  const gList = simGamesCleaned;
                                  for (let i = 0; i < gList.length; i += BATCH_SIZE) {
                                    const batch = writeBatch(db);
                                    gList.slice(i, i + BATCH_SIZE).forEach(g => batch.set(doc(db, 'games', g.id), { id: g.id, seasonId: g.seasonId || '', homeTeamId: g.homeTeamId || 'unknown', awayTeamId: g.awayTeamId || 'unknown', createdAt: serverTimestamp() }, { merge: true }));
                                    await batch.commit();
                                  }

                                  const vList = (parsedData.videos || []).map((r: any) => ({
                                    videoId: String(r.vid_id || r.videoId || r.objectId).trim(),
                                    youtubeId: String(r.vid_id || r.youtubeId || r.objectId).trim(),
                                    gameId: `game_${String(r.vid_id || r.videoId || r.objectId).trim()}`,
                                    title: String(r.description || '').trim()
                                  }));
                                  for (let i = 0; i < vList.length; i += BATCH_SIZE) {
                                    const batch = writeBatch(db);
                                    vList.slice(i, i + BATCH_SIZE).forEach(v => {
                                      if (v.videoId) batch.set(doc(db, 'videos', v.videoId), { ...v, createdAt: serverTimestamp() }, { merge: true });
                                    });
                                    await batch.commit();
                                  }
                                  setImportProgress(40);

                                  // 4. ROSTERS
                                  const allRosters = parsedData.rosters || [];
                                  const uniqueRosterIds = new Set<string>();
                                  for (let i = 0; i < allRosters.length; i += BATCH_SIZE) {
                                    const batch = writeBatch(db);
                                    allRosters.slice(i, i + BATCH_SIZE).forEach((r: any) => {
                                      const id = String(r.objectId || '').trim();
                                      const teamId = String(r.team_id || '').trim();
                                      const seasonId = `season_${String(r.fall_year || '').trim()}`;
                                      if (id && teamId) {
                                        uniqueRosterIds.add(id);
                                        batch.set(doc(db, 'rosters', id), { teamId, seasonId, createdAt: serverTimestamp() }, { merge: true });
                                        let pIds: string[] = [];
                                        try { pIds = JSON.parse(r.player_ids || '[]'); } catch (e) { }
                                        pIds.forEach(pId => {
                                          const rpId = `${id}_${pId}`;
                                          batch.set(doc(db, 'rosters', id, 'players', rpId), { playerId: pId, number: '', createdAt: serverTimestamp() }, { merge: true });
                                        });
                                      }
                                    });
                                    await batch.commit();
                                  }
                                  setImportProgress(55);

                                  // 5. CLEAR EVENTS
                                  toast.info("Clearing old events...");
                                  while (true) {
                                    const q = query(collection(db, 'gameEvents'), limit(500));
                                    const snap = await getDocs(q);
                                    if (snap.empty) break;
                                    const batch = writeBatch(db);
                                    snap.docs.forEach(d => batch.delete(d.ref));
                                    await batch.commit();
                                  }
                                  setImportProgress(70);

                                  // 6. ADD EVENTS
                                  toast.info("Uploading events...");
                                  const eventsByGameId = new Map<string, any[]>();
                                  for (const ev of decoupledSimEvents) {
                                    if (!eventsByGameId.has(ev.gameId)) {
                                      eventsByGameId.set(ev.gameId, []);
                                    }
                                    const clean = JSON.parse(JSON.stringify({ ...ev, userId: 'admin', userName: 'Admin' }));
                                    eventsByGameId.get(ev.gameId)!.push(clean);
                                  }

                                  const gameGroups = Array.from(eventsByGameId.entries());
                                  for (let i = 0; i < gameGroups.length; i += BATCH_SIZE) {
                                    const chunk = gameGroups.slice(i, i + BATCH_SIZE);
                                    const batch = writeBatch(db);
                                    chunk.forEach(([gId, evs]) => {
                                      batch.set(doc(db, 'gameEvents', gId), { events: evs, createdAt: serverTimestamp() }, { merge: true });
                                    });
                                    await batch.commit();
                                    setImportProgress(70 + Math.round(((i + chunk.length) / gameGroups.length) * 30));
                                  }

                                  setImportProgress(100);
                                  toast.success("Live Database successfully scaffolded from all 5 CSVs!");
                                } catch (err) {
                                  console.error("Mass upload error:", err);
                                  toast.error("Mass upload failed. Check the console.");
                                } finally {
                                  setIsImporting(false);
                                }
                                return;
                              }

                              if (onSetLocalSimulation) {
                                onSetLocalSimulation({
                                  events: decoupledSimEvents,
                                  players: simPlayers,
                                  teams: simTeams,
                                  games: simGamesCleaned,
                                  seasons: Array.from(simSeasonsMap.values()),
                                  videos: [],
                                  fileName: 'Multi-File Local Simulation'
                                });
                              }

                              setTimeout(() => {
                                setIsImporting(false);
                                toast.success('Local Database Simulation Loaded Successfully!');
                              }, 500);
                            }
                          }
                        });
                      });
                    }}
                  />
                  <label htmlFor="csv-upload-multiple" className="cursor-pointer">
                    <Database className="w-12 h-12 mx-auto mb-4 text-emerald-500 group-hover:text-emerald-400 transition-colors" />
                    <p className="text-lg font-bold mb-1">Select all 5 CSVs (Players, Teams, Rosters, Videos, Stats)</p>
                    <p className="text-sm text-gray-400">Loads fully in-memory without affecting Firestore</p>
                  </label>

                  <div className="mt-6 inline-flex flex-col items-center justify-center p-4 bg-red-500/5 border border-red-500/20 rounded-xl relative z-20">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input type="checkbox" checked={uploadSimToLive} onChange={e => setUploadSimToLive(e.target.checked)} className="w-5 h-5 text-red-600 rounded focus:ring-red-500" />
                      <div className="text-left">
                        <p className="font-bold text-red-600 group-hover:text-red-500 transition-colors">Upload Directly to Live Firestore</p>
                        <p className="text-[10px] text-red-500/80 uppercase tracking-widest mt-0.5">WARNING: Overwrites live data & clears events!</p>
                      </div>
                    </label>
                  </div>

                  {isImporting && (
                    <div className="mt-8 flex items-center justify-center gap-4">
                      <div className="w-48 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${importProgress}%` }} />
                      </div>
                      <span className="text-sm font-mono text-emerald-500">{importProgress}%</span>
                    </div>
                  )}
                </div>
              ) : !csvData.length ? (
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center hover:border-red-500/50 transition-all group">
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    id="csv-upload"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        Papa.parse(file, {
                          header: true,
                          skipEmptyLines: true,
                          complete: (results) => {
                            setCsvData(results.data);
                            setCsvHeaders(results.meta.fields || []);
                          }
                        });
                      }
                    }}
                  />
                  <label htmlFor="csv-upload" className="cursor-pointer">
                    <Database className="w-12 h-12 mx-auto mb-4 text-neutral-700 group-hover:text-red-400 transition-colors" />
                    <p className="text-lg font-bold mb-1">Click to select CSV file</p>
                    <p className="text-sm text-gray-400">Max file size: 10MB</p>
                  </label>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {['stats', 'players'].includes(importType) ? (
                      <div className="space-y-4">
                        <h4 className="font-bold text-red-400 uppercase text-xs tracking-widest">Map Columns</h4>
                        <div className="space-y-3">
                          {(importType === 'stats' ? [
                            { key: 'videoId', label: 'Video ID (Recording ID) (Optional)' },
                            { key: 'youtubeId', label: 'YouTube Video ID (Optional)' },
                            { key: 'playerId', label: 'Player ID (Optional)' },
                            { key: 'teamId', label: 'Team ID (Optional — overrides auto-detection)' },
                            { key: 'subPlayerId', label: 'Sub In Player ID (Optional)' },
                            { key: 'eventType', label: 'Event Type' },
                            { key: 'videoTime', label: 'Video Time (seconds)' },
                            { key: 'seasonId', label: 'Season ID (Optional)' },
                            { key: 'homeTeamId', label: 'Home Team ID Col (for AWAY_GOAL/HOME_GOAL conversion)' },
                            { key: 'awayTeamId', label: 'Away Team ID Col (for AWAY_GOAL/HOME_GOAL conversion)' },
                          ] : [
                            { key: 'id', label: 'Player ID (Optional)' },
                            { key: 'firstName', label: 'First Name' },
                            { key: 'lastName', label: 'Last Name' }
                          ]).map(field => (
                            <div key={field.key} className="flex items-center justify-between gap-4">
                              <span className="text-sm text-gray-500">{field.label}</span>
                              <select
                                className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500 min-w-[200px]"
                                value={mapping[field.key] || ''}
                                onChange={e => setMapping({ ...mapping, [field.key]: e.target.value })}
                              >
                                <option value="">Select Column...</option>
                                {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <h4 className="font-bold text-red-400 uppercase text-xs tracking-widest">Fixed Schema</h4>
                        <p className="text-sm text-gray-500">Columns are pre-mapped for this legacy database format. Ensure you have selected the correct CSV file.</p>
                      </div>
                    )}

                    <div className="bg-white border border-gray-200 rounded-xl p-6">
                      <h4 className="font-bold text-gray-500 uppercase text-xs tracking-widest mb-4">Preview (First 3 rows)</h4>
                      <div className="space-y-4">
                        {csvData.slice(0, 3).map((row, i) => (
                          <div key={i} className="text-[10px] font-mono text-gray-400 bg-gray-50 p-2 rounded border border-gray-200 overflow-x-auto whitespace-nowrap">
                            {JSON.stringify(row)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-8 border-t border-gray-200">
                    <button
                      onClick={() => {
                        setCsvData([]);
                        setMapping({});
                      }}
                      className="text-sm text-gray-400 hover:text-gray-900 transition-colors"
                    >
                      Clear and start over
                    </button>

                    {/* Download Transformed CSVs — runs normalization without writing to Firestore */}
                    {importType === 'stats' && csvData.length > 0 && mapping.eventType && (
                      <button
                        onClick={() => {
                          const EXCLUDED_TYPES = new Set(['offensive_drive', 'defensive_drive', 'offense', 'defense', 'away_snitch_catch', 'swap', 'seekers_released', 'lose_control']);

                          const downloadCsv = (filename: string, headers: string[], rows: Record<string, any>[]) => {
                            const csv = [
                              headers.join(','),
                              ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))
                            ].join('\n');
                            const blob = new Blob([csv], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = filename;
                            a.click();
                            URL.revokeObjectURL(url);
                          };

                          const eventRows: Record<string, any>[] = [];
                          const videoRows = new Map<string, Record<string, any>>();

                          csvData.forEach(row => {
                            const manualTId = mapping.teamId ? String(row[mapping.teamId] || '').trim() || null : null;
                            const rowHomeTeamId = (mapping.homeTeamId ? String(row[mapping.homeTeamId] || '').trim() : '') || null;
                            const rowAwayTeamId = (mapping.awayTeamId ? String(row[mapping.awayTeamId] || '').trim() : '') || null;
                            const rawEType = mapping.eventType ? String(row[mapping.eventType] || '').trim() : 'unknown';
                            const vTime = mapping.videoTime ? parseFloat(String(row[mapping.videoTime])) || 0 : 0;
                            const vId = mapping.videoId ? String(row[mapping.videoId] || '').trim() : '';
                            const gId = vId ? `game_${vId}` : 'unknown-game'; // auto-derived from videoId
                            const ytId = mapping.youtubeId ? String(row[mapping.youtubeId] || '').trim() : vId;
                            const rawPId = mapping.playerId ? String(row[mapping.playerId] || '').trim() : null;
                            const pId = rawPId;
                            const rawSpId = mapping.subPlayerId ? String(row[mapping.subPlayerId] || '').trim() : null;
                            const spId = rawSpId;
                            const sId = mapping.seasonId ? String(row[mapping.seasonId] || '').trim() : null;

                            let normalizedType = rawEType.toLowerCase().replace(/\s+/g, '_');
                            let resolvedTeamId: string | null = manualTId;

                            // DROP symmetric mirrors & legacy noise BEFORE prefix-stripping
                            const DROP_TYPES = new Set(['away_goal', 'away_snitch_catch', 'offense', 'defense', 'swap', 'seekers_released', 'lose_control']);
                            if (DROP_TYPES.has(normalizedType)) return;

                            if (!manualTId) {
                              if (/^away[_\s]/i.test(rawEType)) {
                                normalizedType = normalizedType.replace(/^away[_\s]/i, '').toLowerCase().replace(/\s+/g, '_');
                                resolvedTeamId = rowAwayTeamId;
                              } else if (/^home[_\s]/i.test(rawEType)) {
                                normalizedType = normalizedType.replace(/^home[_\s]/i, '').toLowerCase().replace(/\s+/g, '_');
                                resolvedTeamId = rowHomeTeamId;
                              }
                              if (normalizedType === 'gain_control') { normalizedType = 'control_change'; }
                              if (normalizedType === 'snitch_released') { normalizedType = 'flag_released'; resolvedTeamId = null; }
                              if (normalizedType === 'snitch_catch') { normalizedType = 'flag_catch'; }
                              if (normalizedType === 'sub') { normalizedType = 'substitution'; }
                              if (normalizedType === 'yellow_card' || normalizedType === 'red_card') { normalizedType = 'card'; }
                            }

                            // Skip excluded event types
                            if (EXCLUDED_TYPES.has(normalizedType)) return;

                            const eventId = `${vId}_${gId}_${normalizedType}_${vTime}_${pId || 'no-player'}`.replace(/[^a-zA-Z0-9]/g, '_');
                            eventRows.push({
                              eventId, gameId: gId, videoId: vId, raw_type: rawEType, type: normalizedType,
                              teamId: resolvedTeamId ?? '', playerId: pId ?? '', subPlayerId: spId ?? '',
                              videoTime: vTime, position: '',
                              // For chain resolution:
                              _rawPlayerId: rawPId ? rawPId.toLowerCase().replace(/[^a-z0-9]/g, '_') : null,
                              _rawSubPlayerId: spId,
                            });

                            // Collect unique videos for modern games
                            if (vId && !videoRows.has(vId)) {
                              const seasonName = seasons.find(s => s.id === sId)?.name ?? sId ?? '';
                              if (isModernSeason(seasonName)) {
                                videoRows.set(vId, { videoId: vId, youtubeId: ytId, gameId: gId, seasonId: sId ?? '' });
                              }
                            }
                          });

                          // Resolve positions for substitution events via chain walk
                          const subRows = eventRows.map((r, i) => ({
                            type: r.type, playerId: r._rawPlayerId, subPlayerId: r._rawSubPlayerId,
                            gameId: r.gameId, videoTime: r.videoTime, index: i
                          }));
                          const posMap = resolveSubPositions(subRows);
                          for (const [idx, pos] of posMap) {
                            eventRows[idx].position = pos;
                          }

                          // Convert 'substitution' to 'sub_in' and 'sub_out'
                          const finalEventRows: Record<string, any>[] = [];
                          for (const r of eventRows) {
                            delete r._rawPlayerId;
                            delete r._rawSubPlayerId;
                            if (r.type === 'substitution') {
                              const outPid = r.playerId?.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                              const isPlaceholderOut = outPid && ['chasera', 'chaserb', 'chaserc', 'keeper', 'beatera', 'beaterb', 'seeker', 'null', 'undefined', 'noplayer'].includes(outPid);

                              if (r.playerId && !isPlaceholderOut) {
                                finalEventRows.push({ ...r, eventId: r.eventId + '_out', type: 'sub_out', subPlayerId: '' });
                              }
                              if (r.subPlayerId) {
                                finalEventRows.push({ ...r, eventId: r.eventId + '_in', type: 'sub_in', playerId: r.subPlayerId, subPlayerId: '' });
                              }
                            } else {
                              finalEventRows.push({ ...r, subPlayerId: '' });
                            }
                          }

                          downloadCsv(
                            `transformed_events_${Date.now()}.csv`,
                            ['eventId', 'gameId', 'videoId', 'raw_type', 'type', 'teamId', 'playerId', 'subPlayerId', 'videoTime', 'position'],
                            finalEventRows
                          );

                          const vRows = Array.from(videoRows.values());
                          downloadCsv(
                            `transformed_videos_${Date.now()}.csv`,
                            ['videoId', 'youtubeId', 'gameId', 'seasonId'],
                            vRows
                          );

                          toast.success(`Downloaded ${eventRows.length} events + ${vRows.length} modern-game videos`);
                        }}
                        className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1.5 border border-emerald-500/30 rounded-lg px-3 py-1.5 hover:bg-emerald-500/5"
                      >
                        <FileUp className="w-3.5 h-3.5" />
                        Download Transformed CSVs
                      </button>
                    )}

                    {!isImporting && (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" checked={useLocalSimMode} onChange={e => setUseLocalSimMode(e.target.checked)} className="w-5 h-5 text-amber-600 rounded focus:ring-amber-500" />
                          <div>
                            <p className="font-bold text-amber-700">Import as Local Simulation (Memory Only)</p>
                            <p className="text-[10px] text-amber-600/80 uppercase tracking-widest mt-0.5">Bypass Firestore to sandbox your imports locally</p>
                          </div>
                        </label>
                      </div>
                    )}

                    <div className="flex items-center gap-4">
                      {isImporting && (
                        <div className="flex items-center gap-3">
                          <div className="w-48 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-600 transition-all duration-300"
                              style={{ width: `${importProgress}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-red-400">{Math.round(importProgress)}%</span>
                        </div>
                      )}

                      {importType === 'players' && !isImporting && (
                        <button
                          onClick={async () => {
                            if (!confirm('Are you sure you want to delete ALL global players? This cannot be undone.')) return;
                            setIsImporting(true);
                            setImportProgress(0);
                            try {
                              const BATCH_SIZE = 500;
                              let deletedCount = 0;
                              while (true) {
                                const q = query(collection(db, 'players'), limit(BATCH_SIZE));
                                const snap = await getDocs(q);
                                if (snap.empty) break;

                                const batch = writeBatch(db);
                                snap.docs.forEach(d => batch.delete(d.ref));
                                await batch.commit();
                                deletedCount += snap.size;
                                setImportProgress((prev) => Math.min(prev + 10, 99));
                                toast.info(`Deleted ${deletedCount} players...`);
                              }
                              toast.success(`Successfully cleared ${deletedCount} players.`);
                            } catch (error) {
                              console.error('Clear error:', error);
                              handleFirestoreError(error, OperationType.DELETE, 'players');
                            } finally {
                              setIsImporting(false);
                              setImportProgress(0);
                            }
                          }}
                          className="bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold px-6 py-3 rounded-xl border border-red-500/20 transition-all"
                        >
                          Clear All Players
                        </button>
                      )}

                      {importType === 'stats' && !isImporting && (
                        <>
                          <button
                            onClick={async () => {
                              if (!confirm('Are you sure you want to delete ALL events? This cannot be undone.')) return;
                              setIsImporting(true);
                              setImportProgress(0);
                              try {
                                const BATCH_SIZE = 500;
                                let deletedCount = 0;

                                // Fetch a sample to get estimate or total size if possible
                                // For simplicity/robustness, we'll just loop until nothing is left
                                while (true) {
                                  const q = query(collection(db, 'gameEvents'), limit(BATCH_SIZE));
                                  const snap = await getDocs(q);
                                  if (snap.empty) break;

                                  const batch = writeBatch(db);
                                  snap.docs.forEach(d => batch.delete(d.ref));
                                  await batch.commit();

                                  deletedCount += snap.size;
                                  // We don't know the full total without an expensive count query, 
                                  // so we'll just update progress showing activity.
                                  setImportProgress((prev) => Math.min(prev + 10, 99));
                                  toast.info(`Deleted ${deletedCount} events so far...`);
                                }
                                toast.success(`Successfully cleared ${deletedCount} events.`);
                              } catch (error) {
                                console.error('Clear error:', error);
                                handleFirestoreError(error, OperationType.DELETE, 'events');
                              } finally {
                                setIsImporting(false);
                                setImportProgress(0);
                              }
                            }}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold px-6 py-3 rounded-xl border border-red-500/20 transition-all"
                          >
                            Clear All Events
                          </button>

                          {/* Combined: clear THEN re-import with new schema normalization */}
                          <button
                            disabled={!mapping.eventType}
                            onClick={async () => {
                              if (!confirm(`This will DELETE all existing events, then import ${csvData.length} rows with the new schema. Continue?`)) return;

                              setIsImporting(true);
                              setImportProgress(0);
                              const beforeUnloadHandler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
                              window.addEventListener('beforeunload', beforeUnloadHandler);

                              try {
                                if (!useLocalSimMode) {
                                  // === Phase 1: Clear all events (0 → 30%) ===
                                  toast.info('Phase 1/2: Clearing existing events…');
                                  const CLEAR_BATCH = 500;
                                  let deletedCount = 0;
                                  while (true) {
                                    const q = query(collection(db, 'gameEvents'), limit(CLEAR_BATCH));
                                    const snap = await getDocs(q);
                                    if (snap.empty) break;

                                    const batch = writeBatch(db);
                                    snap.docs.forEach(d => batch.delete(d.ref));
                                    await batch.commit();
                                    deletedCount += snap.size;
                                    setImportProgress((prev) => Math.min(prev + 5, 30));
                                  }
                                  toast.success(`Cleared ${deletedCount} old events. Starting import…`);
                                } else {
                                  toast.info('Phase 1/2: Preparing Local Sandbox…');
                                  setImportProgress(30);
                                }

                                // === Phase 2: Import with normalization (30 → 100%) ===
                                toast.info('Phase 2/2: Importing new schema events…');
                                const BATCH_SIZE = 100;

                                // Pre-build unique games/videos/players/rosters
                                const uniqueGames = new Map<string, string | null>();
                                const uniqueVideos = new Map<string, { yt: string; g: string }>();
                                const playersToCreate = new Map<string, { f: string; l: string }>();
                                const uniqueRosters = new Map<string, { teamId: string; seasonId: string; }>();
                                const uniqueRosterPlayers = new Map<string, { rosterId: string; playerId: string; }>();

                                csvData.forEach(row => {
                                  const vCustomId = mapping.videoId ? String(row[mapping.videoId] || '').trim() : 'unknown-video';
                                  const ytId = mapping.youtubeId ? String(row[mapping.youtubeId] || '').trim() : (vCustomId === 'unknown-video' ? 'UduPUwNkXKU' : vCustomId);
                                  const sIdRaw = mapping.seasonId ? String(row[mapping.seasonId] || '').trim() : '';
                                  const sId = sIdRaw ? `season_${sIdRaw}` : 'unknown_season';
                                  const tId = mapping.teamId ? String(row[mapping.teamId] || '').trim() : '';
                                  const gId = vCustomId ? `game_${vCustomId}` : 'unknown-game'; // auto-derived

                                  uniqueGames.set(gId, sId);
                                  uniqueVideos.set(vCustomId, { yt: ytId, g: gId });

                                  const handleP = (raw: string | null) => {
                                    if (!raw) return;
                                    const id = raw.toLowerCase().replace(/[^a-z0-9]/g, '_');
                                    if (!players.find(p => p.id === id) && !playersToCreate.has(id)) {
                                      const parts = raw.split(' ');
                                      playersToCreate.set(id, { f: parts[0] || '', l: parts.slice(1).join(' ') || '' });
                                    }
                                    if (tId && sId !== 'unknown_season') {
                                      const rId = `${tId}_${sId}`;
                                      uniqueRosters.set(rId, { teamId: tId, seasonId: sId });
                                      uniqueRosterPlayers.set(`${rId}_${id}`, { rosterId: rId, playerId: id });
                                    }
                                  };

                                  handleP(mapping.playerId ? String(row[mapping.playerId] || '').trim() : null);
                                  handleP(mapping.subPlayerId ? String(row[mapping.subPlayerId] || '').trim() : null);
                                });

                                if (!useLocalSimMode) {
                                  // Write games
                                  for (let i = 0; i < Array.from(uniqueGames.entries()).length; i += BATCH_SIZE) {
                                    const batch = writeBatch(db);
                                    Array.from(uniqueGames.entries()).slice(i, i + BATCH_SIZE).forEach(([id, sId]) => {
                                      if (!games.find(g => g.id === id)) {
                                        batch.set(doc(db, 'games', id), { id, seasonId: sId || 'unknown', homeTeamId: 'unknown', awayTeamId: 'unknown', createdAt: serverTimestamp() }, { merge: true });
                                      }
                                    });
                                    await batch.commit();
                                  }

                                  // Write videos
                                  for (let i = 0; i < Array.from(uniqueVideos.entries()).length; i += BATCH_SIZE) {
                                    const batch = writeBatch(db);
                                    Array.from(uniqueVideos.entries()).slice(i, i + BATCH_SIZE).forEach(([id, data]) => {
                                      if (!videos.find(v => v.videoId === id)) {
                                        batch.set(doc(db, 'videos', id), { youtubeId: data.yt, videoId: id, gameId: data.g, title: `Game ${data.g} - Recording ${id}`, createdAt: serverTimestamp() }, { merge: true });
                                      }
                                    });
                                    await batch.commit();
                                  }

                                  // Write players
                                  for (let i = 0; i < Array.from(playersToCreate.entries()).length; i += BATCH_SIZE) {
                                    const batch = writeBatch(db);
                                    Array.from(playersToCreate.entries()).slice(i, i + BATCH_SIZE).forEach(([id, data]) => {
                                      batch.set(doc(db, 'players', id), { id, firstName: data.f, lastName: data.l, createdAt: serverTimestamp() }, { merge: true });
                                    });
                                    await batch.commit();
                                  }

                                  // Write derived Rosters
                                  for (let i = 0; i < Array.from(uniqueRosters.entries()).length; i += BATCH_SIZE) {
                                    const batch = writeBatch(db);
                                    Array.from(uniqueRosters.entries()).slice(i, i + BATCH_SIZE).forEach(([id, data]) => {
                                      batch.set(doc(db, 'rosters', id), { id, teamId: data.teamId, seasonId: data.seasonId, createdAt: serverTimestamp() }, { merge: true });
                                    });
                                    await batch.commit();
                                  }

                                  // Write derived Roster Players
                                  for (let i = 0; i < Array.from(uniqueRosterPlayers.entries()).length; i += BATCH_SIZE) {
                                    const batch = writeBatch(db);
                                    Array.from(uniqueRosterPlayers.entries()).slice(i, i + BATCH_SIZE).forEach(([id, data]) => {
                                      batch.set(doc(db, 'rosters', data.rosterId, 'players', id), { id, rosterId: data.rosterId, playerId: data.playerId, number: '', createdAt: serverTimestamp() }, { merge: true });
                                    });
                                    await batch.commit();
                                  }
                                }

                                // Write events (bundled)
                                const eventsByGame = new Map<string, any[]>();
                                csvData.forEach(row => {
                                  const vId = mapping.videoId ? String(row[mapping.videoId] || '').trim() : 'unknown-video';
                                  const gId = vId ? `game_${vId}` : 'unknown-game';
                                  const rawPId = mapping.playerId ? String(row[mapping.playerId] || '').trim() : null;
                                  let pId: string | null = rawPId;
                                  const rawSpId = mapping.subPlayerId ? String(row[mapping.subPlayerId] || '').trim() : null;
                                  let spId: string | null = rawSpId;
                                  const manualTId = mapping.teamId ? String(row[mapping.teamId] || '').trim() || null : null;
                                  const rowHomeTeamId = (mapping.homeTeamId ? String(row[mapping.homeTeamId] || '').trim() : '') || null;
                                  const rowAwayTeamId = (mapping.awayTeamId ? String(row[mapping.awayTeamId] || '').trim() : '') || null;
                                  const rawEType = mapping.eventType ? String(row[mapping.eventType] || '').trim() : 'unknown';
                                  const vTime = mapping.videoTime ? parseFloat(String(row[mapping.videoTime])) || 0 : 0;

                                  let normalizedType = rawEType.toLowerCase().replace(/\s+/g, '_');
                                  let resolvedTeamId: string | null = manualTId;

                                  // DROP symmetric mirrors & legacy noise BEFORE prefix-stripping
                                  const DROP_TYPES = new Set(['away_snitch_catch', 'offense', 'defense', 'swap', 'seekers_released', 'lose_control']);
                                  if (DROP_TYPES.has(normalizedType)) return;

                                  if (!manualTId) {
                                    if (/^away[_\s]/i.test(normalizedType)) {
                                      normalizedType = normalizedType.replace(/^away[_\s]/i, '').replace(/^_/, '');
                                      resolvedTeamId = rowAwayTeamId;
                                    } else if (/^home[_\s]/i.test(normalizedType)) {
                                      normalizedType = normalizedType.replace(/^home[_\s]/i, '').replace(/^_/, '');
                                      resolvedTeamId = rowHomeTeamId;
                                    }
                                  }

                                  if (normalizedType === 'gain_control') {
                                    normalizedType = 'control_change';
                                  }
                                  if (normalizedType === 'snitch_released') { normalizedType = 'flag_released'; resolvedTeamId = null; }
                                  if (normalizedType === 'snitch_catch') { normalizedType = 'flag_catch'; }
                                  if (normalizedType === 'sub') { normalizedType = 'substitution'; }
                                  if (normalizedType === 'yellow_card' || normalizedType === 'red_card') { normalizedType = 'card'; }

                                  if (normalizedType === 'offensive_drive' || normalizedType === 'defensive_drive') return;
                                  if (!vId || vId === 'unknown-video' || !gId || gId === 'unknown-game') return;
                                  if (vTime < 0 || vTime > 10000) return;

                                  // Clock event mapping fixes
                                  if (['game_start', 'start_clock', 'clock_start'].includes(normalizedType)) normalizedType = 'gameStart';
                                  if (['game_pause', 'pause_clock', 'clock_pause'].includes(normalizedType)) normalizedType = 'gamePause';
                                  if (['game_resume', 'gameresume', 'resume_clock', 'clock_resume'].includes(normalizedType)) normalizedType = 'gameStart';
                                  if (['game_end', 'end_clock', 'clock_end', 'end_game'].includes(normalizedType)) normalizedType = 'gameEnd';

                                  // Data Cleanliness: Clock Events shouldn't have teams or players
                                  const isClockEvent = ['gameStart', 'gamePause', 'gameEnd'].includes(normalizedType);
                                  if (isClockEvent) {
                                    resolvedTeamId = null;
                                    pId = null;
                                    spId = null;
                                  }

                                  const existing = eventsByGame.get(gId) || [];

                                  // Data Cleanliness: Deduplicate clock events at same timestamp
                                  if (isClockEvent) {
                                    const duplicate = existing.some(e => e.type === normalizedType && Math.abs(e.videoTime - vTime) < 2);
                                    if (duplicate) return; // Skip duplicate clock events
                                  }

                                  // Data Cleanliness: Deduplicate control_change events at same timestamp
                                  if (normalizedType === 'control_change') {
                                    const duplicate = existing.some(e => e.type === 'control_change' && Math.abs(e.videoTime - vTime) < 2);
                                    if (duplicate) return; // Skip duplicate control events
                                  }

                                  // Data Cleanliness: Deduplicate goal events at same timestamp (only 1 goal per timestamp)
                                  if (normalizedType === 'goal') {
                                    const duplicate = existing.some(e => e.type === 'goal' && Math.abs(e.videoTime - vTime) < 2);
                                    if (duplicate) return; // Skip duplicate goal (e.g. AWAY_GOAL mirroring GOAL)
                                  }

                                  const eventId = `${vId}_${gId}_${normalizedType}_${vTime}_${pId || 'no-player'}`.replace(/[^a-zA-Z0-9]/g, '_');
                                  const eventData = {
                                    id: eventId, videoId: vId, gameId: gId,
                                    userId: 'system-import', userName: 'System Import',
                                    type: normalizedType, videoTime: vTime,
                                    createdAt: new Date().toISOString(),
                                    votes: 0, upvotes: 0, downvotes: 0,
                                    upvoterIds: [], downvoterIds: [],
                                    status: 'unverified' as const,
                                    playerId: pId, teamId: resolvedTeamId,
                                    subPlayerId: spId, relatedEventId: null,
                                    position: mapping.position ? String(row[mapping.position] || '').trim() || null : null
                                  };

                                  existing.push(eventData);
                                  eventsByGame.set(gId, existing);
                                });

                                const gameGroups = Array.from(eventsByGame.entries());

                                if (useLocalSimMode) {
                                  const allEvts: GameEvent[] = [];
                                  gameGroups.forEach(([, evs]) => allEvts.push(...(evs as GameEvent[])));

                                  const simPlayers = Array.from(playersToCreate.entries()).map(([id, data]) => ({ id, firstName: data.f, lastName: data.l } as Player));
                                  const simGames = Array.from(uniqueGames.entries()).map(([id, sId]) => ({ id, seasonId: sId, homeTeamId: 'team-a', awayTeamId: 'team-b' } as Game));
                                  const simTeamsSet = new Set(allEvts.map(e => e.teamId).filter(Boolean));
                                  const simTeams = Array.from(simTeamsSet).map(id => ({ id: id as string, name: id as string } as Team));
                                  const simSeasonsSet = new Set(simGames.map(g => g.seasonId).filter(Boolean));
                                  const simSeasons = Array.from(simSeasonsSet).map(id => ({ id: id as string, name: id as string } as Season));
                                  const simVideos = Array.from(uniqueVideos.entries()).map(([id, data]) => ({ id, videoId: id, youtubeId: data.yt, gameId: data.g, title: `Local Recording (${id})` } as Video));

                                  if (onSetLocalSimulation) {
                                    onSetLocalSimulation({
                                      events: allEvts,
                                      players: simPlayers,
                                      games: simGames,
                                      teams: simTeams,
                                      seasons: simSeasons,
                                      videos: simVideos,
                                      fileName: "Simulated Data Engine",
                                    });
                                  }

                                  setImportProgress(100);
                                  toast.success(`Sandbox Mode Loaded: ${csvData.length} records pushed to memory.`);
                                } else {
                                  for (let i = 0; i < gameGroups.length; i += BATCH_SIZE) {
                                    const chunk = gameGroups.slice(i, i + BATCH_SIZE);
                                    const batch = writeBatch(db);
                                    chunk.forEach(([gId, evs]) => {
                                      batch.set(doc(db, 'gameEvents', gId), { events: arrayUnion(...evs) }, { merge: true });
                                    });
                                    await batch.commit();
                                    setImportProgress(30 + ((i + chunk.length) / gameGroups.length) * 70);
                                  }
                                  toast.success(`Migration complete: ${csvData.length} events imported with new schema.`);
                                }
                                setCsvData([]);
                                setMapping({});
                              } catch (error) {
                                console.error('Migration error:', error);
                                handleFirestoreError(error, OperationType.WRITE, 'migration');
                              } finally {
                                setIsImporting(false);
                                window.removeEventListener('beforeunload', beforeUnloadHandler);
                              }
                            }}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold px-8 py-3 rounded-xl transition-all flex items-center gap-2 disabled:cursor-not-allowed"
                          >
                            <Database className="w-5 h-5" />
                            Clear All &amp; Re-import
                          </button>
                        </>
                      )}

                      <button
                        disabled={isImporting || (importType === 'stats' ? !mapping.eventType : (importType === 'players' ? (!mapping.id && (!mapping.firstName || !mapping.lastName)) : false))}
                        onClick={async () => {
                          const confirmed = confirm(`Are you sure you want to import ${csvData.length} records? Large imports can take a few minutes.`);
                          if (!confirmed) return;

                          setIsImporting(true);
                          setImportProgress(0);

                          // Prevent accidentally closing tab during import
                          const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
                            e.preventDefault();
                            e.returnValue = '';
                          };
                          window.addEventListener('beforeunload', beforeUnloadHandler);

                          try {
                            if (useLocalSimMode) {
                              const baseData = { events: [], players, games, teams, seasons, videos };

                              if (importType === 'players') {
                                const pArr = [...baseData.players];
                                csvData.forEach(row => {
                                  const id = mapping.id ? String(row[mapping.id] || '').trim() : '';
                                  const f = mapping.firstName ? String(row[mapping.firstName] || '').trim() : '';
                                  const l = mapping.lastName ? String(row[mapping.lastName] || '').trim() : '';
                                  if (id || (f && l)) pArr.push({ id: id || `${f}_${l}`, firstName: f, lastName: l } as Player);
                                });
                                if (onSetLocalSimulation) onSetLocalSimulation({ ...baseData, players: pArr, fileName: 'Sandbox Update' });
                              } else if (importType === 'teams') {
                                const tArr = [...baseData.teams];
                                csvData.forEach(row => tArr.push({ id: String(row.objectId).trim(), name: String(row.team_name).trim() } as Team));
                                if (onSetLocalSimulation) onSetLocalSimulation({ ...baseData, teams: tArr.filter(t => t.id), fileName: 'Sandbox Update' });
                              } else if (importType === 'videos') {
                                const vArr = [...baseData.videos];
                                csvData.forEach(row => vArr.push({
                                  videoId: String(row.vid_id).trim(), youtubeId: String(row.vid_id).trim(),
                                  gameId: `game_${String(row.vid_id).trim()}`, title: String(row.description).trim()
                                } as Video));
                                if (onSetLocalSimulation) onSetLocalSimulation({ ...baseData, videos: vArr.filter(v => v.videoId), fileName: 'Sandbox Update' });
                              } else if (importType === 'rosters') {
                                // Simple mock mapping for generic parsing
                                const sArr = [...baseData.seasons];
                                csvData.forEach(row => sArr.push({ id: `season_${row.fall_year}`, name: `Fall ${row.fall_year}` } as Season));
                                if (onSetLocalSimulation) onSetLocalSimulation({ ...baseData, seasons: sArr, fileName: 'Sandbox Update' });
                              } else if (importType === 'stats') {
                                // Rely entirely on the 'Clear & Re-import' sandbox handler above.
                                toast.warning("For Sandbox Stats, please utilize the Multi-File Uploader or the 'Clear & Re-import' button.");
                                return;
                              }

                              setImportProgress(100);
                              toast.success(`Sandbox Mode: Synthesized ${csvData.length} ${importType} records into memory!`);
                              setCsvData([]);
                              setMapping({});
                              return;
                            }

                            const BATCH_SIZE = 100; // Documents per batch (safe margin under 500)

                            if (importType === 'players') {
                              // 1. Identify all unique players
                              const uniquePlayers = new Map<string, { f: string; l: string }>();
                              csvData.forEach(row => {
                                const customId = mapping.id ? String(row[mapping.id] || '').trim() : '';
                                const f = mapping.firstName ? String(row[mapping.firstName] || '').trim() : '';
                                const l = mapping.lastName ? String(row[mapping.lastName] || '').trim() : '';

                                if (customId || f || l) {
                                  const id = customId ? customId : `${f}_${l}`;
                                  uniquePlayers.set(id, { f, l });
                                }
                              });

                              const playerEntries = Array.from(uniquePlayers.entries());
                              for (let i = 0; i < playerEntries.length; i += BATCH_SIZE) {
                                const chunk = playerEntries.slice(i, i + BATCH_SIZE);
                                const batch = writeBatch(db);
                                chunk.forEach(([id, data]) => {
                                  batch.set(doc(db, 'players', id), {
                                    id,
                                    firstName: data.f,
                                    lastName: data.l,
                                    createdAt: serverTimestamp()
                                  });
                                });
                                await batch.commit();
                                setImportProgress(((i + chunk.length) / playerEntries.length) * 100);
                              }
                            } else if (importType === 'teams') {
                              for (let i = 0; i < csvData.length; i += BATCH_SIZE) {
                                const chunk = csvData.slice(i, i + BATCH_SIZE);
                                const batch = writeBatch(db);
                                chunk.forEach(row => {
                                  const id = String(row.objectId || '').trim();
                                  const name = String(row.team_name || '').trim();
                                  if (id && name) {
                                    batch.set(doc(db, 'teams', id), { id, name, createdAt: serverTimestamp() });
                                  }
                                });
                                await batch.commit();
                                setImportProgress(((i + chunk.length) / csvData.length) * 100);
                              }
                            } else if (importType === 'rosters') {
                              const uniqueSeasons = new Set<string>();
                              csvData.forEach(row => {
                                const fall_year = String(row.fall_year || '').trim();
                                if (fall_year) uniqueSeasons.add(`season_${fall_year}`);
                              });
                              const seasonBatch = writeBatch(db);
                              Array.from(uniqueSeasons).forEach(sId => {
                                if (!seasons.find(s => s.id === sId)) {
                                  seasonBatch.set(doc(db, 'seasons', sId), { id: sId, name: sId.replace('season_', 'Fall '), createdAt: serverTimestamp() }, { merge: true });
                                }
                              });
                              await seasonBatch.commit();

                              for (let i = 0; i < csvData.length; i += BATCH_SIZE) {
                                const chunk = csvData.slice(i, i + BATCH_SIZE);
                                const batch = writeBatch(db);
                                chunk.forEach(row => {
                                  const id = String(row.objectId || '').trim();
                                  const teamId = String(row.team_id || '').trim();
                                  const seasonId = `season_${String(row.fall_year || '').trim()}`;

                                  if (id && teamId) {
                                    batch.set(doc(db, 'rosters', id), { id, teamId, seasonId, createdAt: serverTimestamp() });
                                    let pIds: string[] = [];
                                    try { pIds = JSON.parse(row.player_ids || '[]'); } catch (e) { }

                                    pIds.forEach(pId => {
                                      const rpId = `${id}_${pId}`;
                                      batch.set(doc(db, 'rosters', id, 'players', rpId), { id: rpId, rosterId: id, playerId: pId, number: '', createdAt: serverTimestamp() });
                                    });
                                  }
                                });
                                await batch.commit();
                                setImportProgress(((i + chunk.length) / csvData.length) * 100);
                              }
                            } else if (importType === 'videos') {
                              for (let i = 0; i < csvData.length; i += BATCH_SIZE) {
                                const chunk = csvData.slice(i, i + BATCH_SIZE);
                                const batch = writeBatch(db);
                                chunk.forEach(row => {
                                  const vidId = String(row.vid_id || '').trim();
                                  const title = String(row.description || '').trim();
                                  const fall_year = String(row.fall_year || '').trim();
                                  const teamId = String(row.team_id || '').trim();
                                  const oppId = String(row.opponent_id || '').trim();

                                  if (vidId) {
                                    const gId = `game_${vidId}`;
                                    const sId = fall_year ? `season_${fall_year}` : 'unknown';
                                    batch.set(doc(db, 'videos', vidId), { youtubeId: vidId, videoId: vidId, gameId: gId, title, createdAt: serverTimestamp() });
                                    batch.set(doc(db, 'games', gId), { id: gId, seasonId: sId, homeTeamId: teamId || 'unknown', awayTeamId: oppId || 'unknown', createdAt: serverTimestamp() }, { merge: true });
                                  }
                                });
                                await batch.commit();
                                setImportProgress(((i + chunk.length) / csvData.length) * 100);
                              }
                            } else {
                              // STATS IMPORT
                              // 1. Pre-identify unique parent records to minimize repetitive writes
                              const uniqueGames = new Map<string, string | null>();
                              const uniqueVideos = new Map<string, { yt: string; g: string }>();
                              const playersToCreate = new Map<string, { f: string; l: string }>();

                              csvData.forEach(row => {
                                const vCustomId = mapping.videoId ? String(row[mapping.videoId] || '').trim() : 'unknown-video';
                                const gId = vCustomId ? `game_${vCustomId}` : 'unknown-game'; // auto-derived
                                const ytId = mapping.youtubeId ? String(row[mapping.youtubeId] || '').trim() : vCustomId;
                                const sId = mapping.seasonId ? String(row[mapping.seasonId] || '').trim() : null;

                                uniqueGames.set(gId, sId);
                                uniqueVideos.set(vCustomId, { yt: ytId, g: gId });

                                const handleP = (raw: string | null) => {
                                  if (!raw) return;
                                  const id = raw;
                                  if (!players.find(p => p.id === id) && !playersToCreate.has(id)) {
                                    const parts = raw.split(' ');
                                    playersToCreate.set(id, { f: parts[0] || '', l: parts.slice(1).join(' ') || '' });
                                  }
                                };
                                handleP(mapping.playerId ? String(row[mapping.playerId] || '').trim() : null);
                                handleP(mapping.subPlayerId ? String(row[mapping.subPlayerId] || '').trim() : null);
                              });

                              // 2. Write Parents first (Games, Videos, Players)
                              const parentsTotal = uniqueGames.size + uniqueVideos.size + playersToCreate.size;
                              let parentsProcessed = 0;

                              if (!useLocalSimMode) {
                                // Games
                                const gameEntries = Array.from(uniqueGames.entries());
                                for (let i = 0; i < gameEntries.length; i += BATCH_SIZE) {
                                  const batch = writeBatch(db);
                                  gameEntries.slice(i, i + BATCH_SIZE).forEach(([id, sId]) => {
                                    if (!games.find(g => g.id === id)) {
                                      batch.set(doc(db, 'games', id), {
                                        id,
                                        seasonId: sId || 'unknown',
                                        homeTeamId: 'unknown',
                                        awayTeamId: 'unknown',
                                        createdAt: serverTimestamp()
                                      }, { merge: true });
                                    }
                                  });
                                  await batch.commit();
                                }

                                // Videos
                                const videoEntries = Array.from(uniqueVideos.entries());
                                for (let i = 0; i < videoEntries.length; i += BATCH_SIZE) {
                                  const batch = writeBatch(db);
                                  videoEntries.slice(i, i + BATCH_SIZE).forEach(([id, data]) => {
                                    if (!videos.find(v => v.videoId === id)) {
                                      batch.set(doc(db, 'videos', id), {
                                        youtubeId: data.yt,
                                        videoId: id,
                                        gameId: data.g,
                                        title: `Game ${data.g} - Recording ${id}`,
                                        createdAt: serverTimestamp()
                                      }, { merge: true });
                                    }
                                  });
                                  await batch.commit();
                                }

                                // Players
                                const playerEntries = Array.from(playersToCreate.entries());
                                for (let i = 0; i < playerEntries.length; i += BATCH_SIZE) {
                                  const batch = writeBatch(db);
                                  playerEntries.slice(i, i + BATCH_SIZE).forEach(([id, data]) => {
                                    batch.set(doc(db, 'players', id), {
                                      id, firstName: data.f, lastName: data.l, createdAt: serverTimestamp()
                                    }, { merge: true });
                                  });
                                  await batch.commit();
                                }
                              }

                              // 3. Write Events in chunks
                              // 3. Write Events in Bundles
                              const eventsByGame = new Map<string, any[]>();
                              csvData.forEach(row => {
                                const vId = mapping.videoId ? String(row[mapping.videoId] || '').trim() : 'unknown-video';
                                const gId = vId ? `game_${vId}` : 'unknown-game';
                                const rawPId = mapping.playerId ? String(row[mapping.playerId] || '').trim() : null;
                                let pId = rawPId;
                                const rawSpId = mapping.subPlayerId ? String(row[mapping.subPlayerId] || '').trim() : null;
                                let spId = rawSpId;
                                const manualTId = mapping.teamId ? String(row[mapping.teamId] || '').trim() || null : null;
                                const rowHomeTeamId = (mapping.homeTeamId ? String(row[mapping.homeTeamId] || '').trim() : '') || null;
                                const rowAwayTeamId = (mapping.awayTeamId ? String(row[mapping.awayTeamId] || '').trim() : '') || null;
                                const rawEType = mapping.eventType ? String(row[mapping.eventType] || '').trim() : 'unknown';
                                const vTime = mapping.videoTime ? parseFloat(String(row[mapping.videoTime])) || 0 : 0;

                                let normalizedType = rawEType.toLowerCase().replace(/\s+/g, '_');
                                let resolvedTeamId: string | null = manualTId;

                                // DROP symmetric mirrors & legacy noise BEFORE prefix-stripping
                                const DROP_TYPES = new Set(['away_snitch_catch', 'offense', 'defense', 'swap', 'seekers_released', 'lose_control']);
                                if (DROP_TYPES.has(normalizedType)) return;

                                if (!manualTId) {
                                  if (/^away[_\s]/i.test(normalizedType)) {
                                    normalizedType = normalizedType.replace(/^away[_\s]/i, '').replace(/^_/, '');
                                    resolvedTeamId = rowAwayTeamId;
                                  } else if (/^home[_\s]/i.test(normalizedType)) {
                                    normalizedType = normalizedType.replace(/^home[_\s]/i, '').replace(/^_/, '');
                                    resolvedTeamId = rowHomeTeamId;
                                  }
                                }

                                if (normalizedType === 'gain_control') {
                                  normalizedType = 'control_change';
                                }
                                if (normalizedType === 'snitch_released') { normalizedType = 'flag_released'; resolvedTeamId = null; }
                                if (normalizedType === 'snitch_catch') { normalizedType = 'flag_catch'; }
                                if (normalizedType === 'sub') { normalizedType = 'substitution'; }
                                if (normalizedType === 'yellow_card' || normalizedType === 'red_card') { normalizedType = 'card'; }

                                if (normalizedType === 'offensive_drive' || normalizedType === 'defensive_drive') return;
                                if (!vId || vId === 'unknown-video' || !gId || gId === 'unknown-game') return;
                                if (vTime < 0 || vTime > 10000) return;

                                // Clock event mapping fixes
                                if (['game_start', 'start_clock', 'clock_start'].includes(normalizedType)) normalizedType = 'gameStart';
                                if (['game_pause', 'pause_clock', 'clock_pause'].includes(normalizedType)) normalizedType = 'gamePause';
                                if (['game_resume', 'gameresume', 'resume_clock', 'clock_resume'].includes(normalizedType)) normalizedType = 'gameStart';
                                if (['game_end', 'end_clock', 'clock_end', 'end_game'].includes(normalizedType)) normalizedType = 'gameEnd';

                                // Data Cleanliness: Clock Events shouldn't have teams or players
                                const isClockEvent = ['gameStart', 'gamePause', 'gameEnd'].includes(normalizedType);
                                if (isClockEvent) {
                                  resolvedTeamId = null;
                                  pId = null;
                                  spId = null;
                                }

                                const existing = eventsByGame.get(gId) || [];

                                // Data Cleanliness: Deduplicate clock events at same timestamp
                                if (isClockEvent) {
                                  const duplicate = existing.some(e => e.type === normalizedType && Math.abs(e.videoTime - vTime) < 2);
                                  if (duplicate) return; // Skip duplicate clock events
                                }

                                // Data Cleanliness: Deduplicate control_change events at same timestamp
                                if (normalizedType === 'control_change') {
                                  const duplicate = existing.some(e => e.type === 'control_change' && Math.abs(e.videoTime - vTime) < 2);
                                  if (duplicate) return; // Skip duplicate control events
                                }

                                // Data Cleanliness: Deduplicate goal events at same timestamp (only 1 goal per timestamp)
                                if (normalizedType === 'goal') {
                                  const duplicate = existing.some(e => e.type === 'goal' && Math.abs(e.videoTime - vTime) < 2);
                                  if (duplicate) return; // Skip duplicate goal (e.g. AWAY_GOAL mirroring GOAL)
                                }

                                const eventId = `${vId}_${gId}_${normalizedType}_${vTime}_${pId || 'no-player'}`.replace(/[^a-zA-Z0-9]/g, '_');
                                const eventData = {
                                  id: eventId, videoId: vId, gameId: gId,
                                  userId: 'system-import', userName: 'System Import',
                                  type: normalizedType, videoTime: vTime,
                                  createdAt: new Date().toISOString(),
                                  votes: 0, upvotes: 0, downvotes: 0,
                                  upvoterIds: [], downvoterIds: [],
                                  status: 'unverified' as const,
                                  playerId: pId, teamId: resolvedTeamId,
                                  subPlayerId: spId, relatedEventId: null,
                                  position: mapping.position ? String(row[mapping.position] || '').trim() || null : null
                                };

                                existing.push(eventData);
                                eventsByGame.set(gId, existing);
                              });

                              const gameGroups = Array.from(eventsByGame.entries());

                              if (useLocalSimMode) {
                                const allEvts: GameEvent[] = [];
                                gameGroups.forEach(([, evs]) => allEvts.push(...(evs as GameEvent[])));

                                const simPlayers = Array.from(playersToCreate.entries()).map(([id, data]) => ({ id, firstName: data.f, lastName: data.l } as Player));
                                const simGames = Array.from(uniqueGames.entries()).map(([id, sId]) => ({ id, seasonId: sId, homeTeamId: 'team-a', awayTeamId: 'team-b' } as Game));
                                const simTeamsSet = new Set(allEvts.map(e => e.teamId).filter(Boolean));
                                const simTeams = Array.from(simTeamsSet).map(id => ({ id: id as string, name: id as string } as Team));
                                const simSeasonsSet = new Set(simGames.map(g => g.seasonId).filter(Boolean));
                                const simSeasons = Array.from(simSeasonsSet).map(id => ({ id: id as string, name: id as string } as Season));
                                const simVideos = Array.from(uniqueVideos.entries()).map(([id, data]) => ({ id, videoId: id, youtubeId: data.yt, gameId: data.g, title: `Local Recording (${id})` } as Video));

                                if (onSetLocalSimulation) {
                                  onSetLocalSimulation({
                                    events: allEvts,
                                    players: simPlayers,
                                    games: simGames,
                                    teams: simTeams,
                                    seasons: simSeasons,
                                    videos: simVideos,
                                    fileName: "Simulated Data Engine (Standard Upload)",
                                  });
                                }

                                setImportProgress(100);
                                toast.success(`Sandbox Mode Loaded: ${csvData.length} records pushed to memory.`);
                              } else {
                                for (let i = 0; i < gameGroups.length; i += BATCH_SIZE) {
                                  const chunk = gameGroups.slice(i, i + BATCH_SIZE);
                                  const batch = writeBatch(db);
                                  chunk.forEach(([gId, evs]) => {
                                    batch.set(doc(db, 'gameEvents', gId), { events: arrayUnion(...evs) }, { merge: true });
                                  });
                                  await batch.commit();
                                  setImportProgress(((i + chunk.length) / gameGroups.length) * 100);
                                }
                                toast.success(`Import complete: ${csvData.length} records processed.`);
                              }
                            }

                            toast.success(`${importType.charAt(0).toUpperCase() + importType.slice(1)} import completed successfully!`);
                            onRefreshData();
                            setCsvData([]);
                            setMapping({});
                          } catch (error) {
                            console.error("Import error:", error);
                            handleFirestoreError(error, OperationType.WRITE, 'bulk_import');
                          } finally {
                            setIsImporting(false);
                            window.removeEventListener('beforeunload', beforeUnloadHandler);
                          }
                        }}
                        className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold px-8 py-3 rounded-xl transition-all flex items-center gap-2"
                      >
                        <FileUp className="w-5 h-5" />
                        {isImporting ? 'Importing...' : 'Start Import'}
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm('Are you sure you want to WIPER EVERYTHING? This deletes ALL events, games, videos, players, teams, seasons, and rosters.')) return;
                          setIsImporting(true);
                          setImportProgress(0);
                          try {
                            const collectionsToClear = ['events', 'gameEvents', 'games', 'videos', 'players', 'teams', 'seasons', 'rosters'];
                            const BATCH_SIZE = 500;

                            for (const name of collectionsToClear) {
                              toast.info(`Clearing ${name}...`);
                              let deletedColCount = 0;
                              while (true) {
                                const q = query(collection(db, name), limit(BATCH_SIZE));
                                const snap = await getDocs(q);
                                if (snap.empty) break;

                                const batch = writeBatch(db);
                                snap.docs.forEach(d => batch.delete(d.ref));
                                await batch.commit();
                                deletedColCount += snap.size;
                              }
                              toast.success(`Cleared ${deletedColCount} ${name}.`);
                            }
                            toast.success(`Full database wipe complete.`);
                          } catch (error) {
                            console.error('Nuclear Reset error:', error);
                            handleFirestoreError(error, OperationType.DELETE, 'database');
                          } finally {
                            setIsImporting(false);
                            setImportProgress(0);
                          }
                        }}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-xl transition-all flex items-center gap-2"
                      >
                        <Zap className="w-5 h-5" />
                        Nuclear Reset
                      </button>
                      
                      <button
                        onClick={async () => {
                          if (!confirm("Are you sure you want to deduplicate the aggregated games database?")) return;
                          try {
                            const d = await getDoc(doc(db, "aggregated", "games"));
                            if (d.exists()) {
                              const data = d.data().data || [];
                              const map = new Map();
                              data.forEach((g: any) => map.set(g.id, g));
                              const deduplicated = Array.from(map.values());
                              if (data.length > deduplicated.length) {
                                await updateDoc(doc(db, "aggregated", "games"), { data: deduplicated });
                                toast.success(`Success! Fixed ${data.length - deduplicated.length} duplicate items.`);
                                onRefreshData?.();
                              } else {
                                toast.info("No duplicates found to resolve.");
                              }
                            }
                          } catch(e) {
                            console.error(e);
                            toast.error("Cleanup failed. See console.");
                          }
                        }}
                        className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-6 py-3 rounded-xl transition-all flex items-center gap-2 ml-4"
                      >
                        <Database className="w-5 h-5" />
                        Deduplicate Stats Data
                      </button>

                      <button
                        onClick={async () => {
                          if (!confirm("Are you sure you want to scan for and recover orphaned stats? This recreates missing core game properties based on their underlying videos so they re-appear in the dashboard.")) return;
                          try {
                            const gamesSnap = await getDocs(collection(db, "games"));
                            const validGameIds = new Set();
                            gamesSnap.docs.forEach((g: any) => validGameIds.add(g.id));

                            const videosSnap = await getDocs(collection(db, "videos"));
                            const validVideoRefByGameId = new Map();
                            videosSnap.docs.forEach((v: any) => {
                                const data = v.data();
                                if (data.gameId) {
                                    validVideoRefByGameId.set(data.gameId, data);
                                }
                            });

                            const gameEventsSnap = await getDocs(collection(db, "gameEvents"));
                            
                            let recreatedCount = 0;
                            
                            for (const docSnap of gameEventsSnap.docs) {
                                const gameId = docSnap.id;
                                
                                // Is this game actually missing from the 'games' collection?
                                if (!validGameIds.has(gameId)) {
                                    const vData = validVideoRefByGameId.get(gameId);
                                    
                                    const newGame = {
                                        id: gameId,
                                        seasonId: "unknown",
                                        homeTeamId: "unknown",
                                        awayTeamId: "unknown",
                                        createdAt: serverTimestamp(),
                                        tag: vData ? vData.title : "Recovered Orphan"
                                    };
                                    
                                    await setDoc(doc(db, "games", gameId), newGame, { merge: true });
                                    
                                    // Add it to aggregated layer
                                    const newAgg = {
                                        id: gameId,
                                        seasonId: "unknown",
                                        homeTeamId: "unknown",
                                        awayTeamId: "unknown",
                                        createdAt: new Date().toISOString(),
                                        tag: newGame.tag
                                    };
                                    await updateDoc(doc(db, "aggregated", "games"), {
                                        data: arrayUnion(newAgg)
                                    });
                                    recreatedCount++;
                                }
                            }
                            if (recreatedCount > 0) {
                              toast.success(`Successfully recovered ${recreatedCount} deleted/orphaned games. Please refresh.`);
                              onRefreshData?.();
                            } else {
                              toast.info("No orphaned games detected.");
                            }
                          } catch(e) {
                            console.error(e);
                            toast.error("Cleanup failed. See console.");
                          }
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-3 rounded-xl transition-all flex items-center gap-2 ml-4"
                      >
                        <ShieldCheck className="w-5 h-5" />
                        Recover Orphaned Games
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'search' ? (
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8">
              <h3 className="text-xl font-bold mb-4">Database Explorer</h3>
              <p className="text-gray-500 mb-6">Deep search across all live Firestore collections to locate orphaned records or verify specific database states.</p>
              
              <div className="flex gap-4 mb-8">
                <input 
                  type="text" 
                  value={dbSearchTerm}
                  onChange={(e) => setDbSearchTerm(e.target.value)}
                  placeholder="Search by any ID, tag, or field value..."
                  className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-3 text-lg outline-none focus:border-red-500 font-mono"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') document.getElementById('run-db-search')?.click();
                  }}
                />
                <button
                  id="run-db-search"
                  disabled={isSearchingDB || dbSearchTerm.trim().length === 0}
                  onClick={async () => {
                    const term = dbSearchTerm.toLowerCase().trim();
                    if (!term) return;
                    setIsSearchingDB(true);
                    setDbSearchResults([]);
                    try {
                      const res: any[] = [];
                      const collectionsToScan = ['games', 'videos', 'gameEvents', 'rosters'];
                      for (const collName of collectionsToScan) {
                        const snap = await getDocs(collection(db, collName));
                        snap.docs.forEach(d => {
                          const id = d.id.toLowerCase();
                          const dataStr = JSON.stringify(d.data()).toLowerCase();
                          if (id.includes(term) || dataStr.includes(term)) {
                            res.push({ collection: collName, id: d.id, data: d.data() });
                          }
                        });
                      }
                      setDbSearchResults(res);
                      if (res.length === 0) toast.info('No matches found in database.');
                    } catch (e: any) {
                      toast.error('Search failed: ' + e.message);
                    } finally {
                      setIsSearchingDB(false);
                    }
                  }}
                  className="bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-bold px-8 py-3 rounded-xl transition-all"
                >
                  {isSearchingDB ? 'Scanning...' : 'Search'}
                </button>
              </div>

              {dbSearchResults.length > 0 && (
                <div className="space-y-4">
                  <h4 className="font-bold text-gray-700">Found {dbSearchResults.length} Results</h4>
                  {dbSearchResults.map((res, i) => (
                    <div key={i} className="bg-white border rounded-xl p-4 shadow-sm overflow-hidden text-left flex flex-col gap-2">
                       <div className="flex items-center gap-3">
                         <span className="bg-red-100 text-red-800 uppercase text-[10px] font-bold px-2 py-0.5 rounded tracking-wider">/{res.collection}</span>
                         <span className="font-mono font-bold text-sm text-gray-800">{res.id}</span>
                       </div>
                       <pre className="text-[10px] text-gray-500 bg-gray-50 p-3 rounded-lg overflow-x-auto">
                         {JSON.stringify(res.data, null, 2)}
                       </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'roles' ? (
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8">
              <h3 className="text-xl font-bold mb-4">Role Management</h3>
              <p className="text-gray-500 mb-8">Add emails to different permission tiers. Trusted users have admin rights. Authors have write access to track events.</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {([
                  { title: 'Admins (Full Access)', key: 'trusted' as const, items: userRoles?.trusted || [], color: 'bg-red-600' },
                  { title: 'Moderators (Create Access)', key: 'moderators' as const, items: userRoles?.moderators || [], color: 'bg-amber-500' },
                  { title: 'Data Authors', key: 'authors' as const, items: userRoles?.authors || [], color: 'bg-blue-500' }
                ]).map(block => (
                  <div key={block.title} className="bg-white p-6 border rounded-xl flex flex-col h-96 shadow-sm">
                    <div className="flex items-center gap-2 border-b pb-3 mb-1">
                      <span className={`w-2 h-2 rounded-full ${block.color}`} />
                      <h4 className="font-bold text-gray-800 text-lg">{block.title}</h4>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const data = new FormData(e.target as HTMLFormElement);
                        const newEmail = data.get('email')?.toString().trim();
                        if (newEmail && onAddRole) {
                          onAddRole(newEmail, block.key);
                          (e.target as HTMLFormElement).reset();
                        }
                      }}
                      className="flex gap-2 mt-4"
                    >
                      <input name="email" type="email" placeholder="user@gmail.com" required className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                      <button type="submit" className="px-4 py-2 bg-gray-900 text-white font-bold rounded-lg text-sm hover:bg-black transition-colors">Add</button>
                    </form>
                    <div className="flex-1 overflow-y-auto mt-4 divide-y divide-gray-100">
                      {block.items.map(email => (
                        <div key={email} className="py-3 flex justify-between items-center group">
                          <span className="text-sm font-medium text-gray-600">{email}</span>
                          <button onClick={() => {
                            if (confirm('Remove this user?')) onRemoveRole?.(email, block.key);
                          }} className="p-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {block.items.length === 0 && <div className="text-gray-400 text-sm italic py-4">No users found.</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : activeTab === 'rosters' ? (
          <UnifiedRosterEditor
            teams={teams}
            seasons={seasons}
            players={players}
            rosters={rosters}
            rosterPlayers={rosterPlayers}
            selectedRosterId={selectedRosterId}
            setSelectedRosterId={setSelectedRosterId}
            onAddTeam={onAddTeam}
            onAddPlayer={onAddPlayer}
            onAddPlayerToRoster={onAddPlayerToRoster}
            onRemovePlayerFromRoster={onRemovePlayerFromRoster}
            onCreateRoster={onCreateRoster}
            onDeleteRoster={onDeleteRoster}
          />
        ) : (
          <>
            {/* Creation Form */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-red-400" />
                  {activeTab === 'games' ? 'Track New Video' : `Add New ${activeTab.slice(0, -1)}`}
                </h3>

                {activeTab === 'games' ? (
                  <div className="flex flex-col items-center justify-center text-center p-8 bg-gray-100 rounded-xl border border-dashed border-gray-300">
                    <Activity className="w-12 h-12 text-gray-300 mb-4" />
                    <p className="text-gray-500 text-sm">Return to the <strong className="text-gray-700 font-bold">Tracker</strong> view and click <strong className="text-red-500 font-bold">Create New Game Link</strong> to add a game.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeTab === 'players' ? (
                      <>
                        <input
                          type="text"
                          placeholder="First Name (Legal/Roster)... *"
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                          value={newItemFirstName}
                          onChange={e => setNewItemFirstName(e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="Last Name... *"
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                          value={newItemLastName}
                          onChange={e => setNewItemLastName(e.target.value)}
                        />
                        <div className="pt-2 pb-1 text-xs font-semibold text-gray-500 uppercase">Optional Identity Fields</div>
                        <input
                          type="text"
                          placeholder="Preferred First Name"
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                          value={newPlayerPreferredName}
                          onChange={e => setNewPlayerPreferredName(e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="Nickname"
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                          value={newPlayerNickname}
                          onChange={e => setNewPlayerNickname(e.target.value)}
                        />
                      </>
                    ) : activeTab === 'seasons' ? (
                      <>
                        <select
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                          value={newSeasonLeague}
                          onChange={e => setNewSeasonLeague(e.target.value)}
                        >
                          <option value="USQ">USQ</option>
                          <option value="MLQ">MLQ</option>
                          <option value="IQA">IQA</option>
                          <option value="Other">Other</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Year (e.g., 2024)"
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                          value={newSeasonYear}
                          onChange={e => setNewSeasonYear(e.target.value)}
                        />
                        <input type="text"
                          placeholder="Championship Name (Optional)"
                          className="w-full p-2 lg:p-3 border border-gray-200 rounded-lg lg:rounded-xl text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                          value={newSeasonDescription}
                          onChange={e => setNewSeasonDescription(e.target.value)}
                        />
                      </>
                    ) : (
                      <input
                        type="text"
                        placeholder={`${activeTab.slice(0, -1)} Name...`}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                        value={newItemFirstName}
                        onChange={e => setNewItemFirstName(e.target.value)}
                      />
                    )}
                    <button
                      onClick={() => {
                        if (activeTab === 'players') {
                          if (!newItemFirstName || !newItemLastName) return;
                          onAddPlayer(newItemFirstName, newItemLastName, newPlayerPreferredName, newPlayerNickname);
                          setNewItemFirstName('');
                          setNewItemLastName('');
                          setNewPlayerPreferredName('');
                          setNewPlayerNickname('');
                        } else if (activeTab === 'seasons') {
                          if (!newSeasonLeague || !newSeasonYear) return;
                          const name = `${newSeasonLeague} ${newSeasonYear}${newSeasonDescription ? ` - ${newSeasonDescription}` : ''}`;
                          onAddSeason(name, newSeasonLeague, newSeasonYear, newSeasonDescription);
                          setNewSeasonYear('');
                          setNewSeasonDescription('');
                        } else {
                          if (!newItemFirstName) return;
                          if (activeTab === 'teams') onAddTeam(newItemFirstName);
                          setNewItemFirstName('');
                        }
                      }}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-all"
                    >
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* List View */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
                  <h3 className="font-bold capitalize">{activeTab} List</h3>
                  <span className="text-xs text-gray-400">
                    {activeTab === 'teams' && teams.length}
                    {activeTab === 'seasons' && seasons.length}
                    {activeTab === 'players' && players.length}
                    {activeTab === 'games' && games.length}
                    {activeTab === 'videos' && videos.length}
                    {' items'}
                  </span>
                </div>

                <div className="divide-y divide-neutral-800 max-h-[600px] overflow-y-auto custom-scrollbar">
                  {activeTab === 'teams' && teams.map(t => (
                    <div key={t.id} className="group border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
                      <div className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-bold flex items-center gap-2">
                            {t.name}
                            {t.emails && t.emails.length > 0 && (
                              <span className="bg-gray-100 text-gray-500 text-[9px] px-1.5 py-0.5 rounded font-medium">
                                {t.emails.length} Admin{t.emails.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5">ID: {t.id}</p>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all focus-within:opacity-100">
                          <button
                            onClick={() => {
                              if (editingTeamId === t.id) {
                                setEditingTeamId(null);
                              } else {
                                setEditingTeamId(t.id);
                                setEditingTeamEmails((t.emails || []).join(', '));
                              }
                            }}
                            className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-full transition-colors"
                            title={editingTeamId === t.id ? 'Cancel Edit' : 'Edit Email Access'}
                          >
                            {editingTeamId === t.id ? <XCircle className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => { if (confirm(`Delete team ${t.name}?`)) onDeleteTeam(t.id); }}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                            title="Delete Team"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      {editingTeamId === t.id && (
                        <div className="px-4 pb-4 pt-1 animate-in fade-in slide-in-from-top-2">
                          <div className="bg-white border text-sm border-gray-200 rounded-xl p-4 shadow-sm">
                            <label className="block text-xs font-bold text-gray-700 mb-2">
                              Authorized Admins (Comma-separated emails)
                            </label>
                            <textarea
                              value={editingTeamEmails}
                              onChange={e => setEditingTeamEmails(e.target.value)}
                              placeholder="e.g. coach@team.com, captain@team.com"
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-700 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 min-h-[80px] resize-y"
                            />
                            <div className="flex justify-end gap-2 mt-3">
                              <button
                                onClick={() => setEditingTeamId(null)}
                                className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => {
                                  let newEmails = editingTeamEmails.split(',').map(e => e.trim()).filter(e => e);
                                  onEditTeamEmails(t.id, newEmails);
                                  setEditingTeamId(null);
                                }}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                              >
                                Save Changes
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {activeTab === 'seasons' && seasons.map(s => (
                    <div key={s.id} className="p-4 flex items-center justify-between hover:bg-gray-200/50 transition-colors group">
                      <div>
                        <p className="font-bold">{s.description || s.name}</p>
                        <p className="text-[10px] text-gray-400 uppercase">League: {s.league || 'Unknown'} | Year: {s.year || 'Unknown'} | ID: {s.id}</p>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => {
                            const newDesc = prompt(`Edit Championship Name for ${s.name}:`, `${s.description || ''}`);
                            if (newDesc === null) return;
                            const newYear = prompt(`Edit Start Year mapping for this season (Used for fallback):`, `${s.year || ''}`);
                            if (newYear === null) return;
                            const newName = `${s.league || 'League'} ${newYear}${newDesc.trim() ? ` - ${newDesc.trim()}` : ''}`;
                            onEditSeason(s.id, newName, s.league || '', newYear, newDesc);
                          }}
                          className="p-2 text-gray-400 hover:text-amber-500 rounded-full hover:bg-white"
                          title="Edit Season"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { if (confirm(`Delete season ${s.name}?`)) onDeleteSeason(s.id); }}
                          className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-white"
                          title="Delete Season"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {activeTab === 'players' && (
                    <div className="p-3 border-b border-gray-200 bg-amber-50/50 flex items-center gap-2 flex-wrap">
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete ALL ${players.length} players? This cannot be undone.`)) return;
                          try {
                            const batchSize = 400;
                            let deleted = 0;
                            while (true) {
                              const snap = await getDocs(query(collection(db, 'players'), limit(batchSize)));
                              if (snap.empty) break;
                              const batch = writeBatch(db);
                              snap.docs.forEach(d => batch.delete(d.ref));
                              await batch.commit();
                              deleted += snap.size;
                            }
                            toast.success(`Cleared ${deleted} players`);
                            onRefreshData();
                          } catch (error) {
                            handleFirestoreError(error, OperationType.DELETE, 'players');
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                      >
                        Clear All Players
                      </button>
                      <label className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors cursor-pointer">
                        Upload Players CSV
                        <input type="file" accept=".csv" className="hidden" onChange={async (ev) => {
                          const file = ev.target.files?.[0];
                          if (!file) return;
                          ev.target.value = '';
                          const Papa = (await import('papaparse')).default;
                          Papa.parse(file, {
                            header: true,
                            skipEmptyLines: true,
                            complete: async (result: any) => {
                              const rows = result.data as Record<string, string>[];
                              if (!rows.length) { toast.error('CSV is empty'); return; }
                              const headers = Object.keys(rows[0]);
                              const findCol = (...names: string[]) =>
                                headers.find(h => names.some(n => h.toLowerCase().replace(/[^a-z0-9]/g, '') === n.toLowerCase().replace(/[^a-z0-9]/g, '')));
                              const colId = findCol('playerId', 'player_id', 'id', 'ID', 'Player ID');
                              const colFirst = findCol('firstName', 'first_name', 'First Name', 'first', 'First');
                              const colLast = findCol('lastName', 'last_name', 'Last Name', 'last', 'Last');
                              if (!colFirst && !colLast) {
                                toast.error('Could not find firstName or lastName columns');
                                return;
                              }
                              let imported = 0;
                              const batchSize = 400;
                              for (let i = 0; i < rows.length; i += batchSize) {
                                const chunk = rows.slice(i, i + batchSize);
                                const batch = writeBatch(db);
                                for (const row of chunk) {
                                  const firstName = colFirst ? String(row[colFirst] || '').trim() : '';
                                  const lastName = colLast ? String(row[colLast] || '').trim() : '';
                                  if (!firstName && !lastName) continue;
                                  // Use CSV's playerId as the Firestore doc ID so it matches event.playerId
                                  const pid = colId ? String(row[colId] || '').trim() : '';
                                  if (pid) {
                                    batch.set(doc(db, 'players', pid), { firstName, lastName, createdAt: serverTimestamp() });
                                  } else {
                                    // Fallback: generate ID from name
                                    const generatedId = `${firstName}_${lastName}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
                                    batch.set(doc(db, 'players', generatedId), { firstName, lastName, createdAt: serverTimestamp() });
                                  }
                                  imported++;
                                }
                                await batch.commit();
                              }
                              toast.success(`Imported ${imported} players from ${file.name}`);
                              onRefreshData();
                            },
                          });
                        }} />
                      </label>
                      <span className="text-[10px] text-gray-400">CSV should have: playerId, firstName, lastName</span>
                    </div>
                  )}
                  {activeTab === 'players' && players.map(p => (
                    <div key={p.id} className="p-4 flex items-center justify-between hover:bg-gray-200/50 transition-colors group">
                      <div>
                        <p className="font-bold">{p.firstName} {p.lastName}</p>
                        <p className="text-[10px] text-gray-400 uppercase">ID: {p.id}</p>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => {
                            const newRawName = prompt(`Edit name for ${p.firstName} ${p.lastName} (First Last):`, `${p.firstName} ${p.lastName}`);
                            if (!newRawName) return;
                            const parts = newRawName.trim().split(' ');
                            const newFirst = parts[0] || '';
                            const newLast = parts.slice(1).join(' ') || '';
                            onEditPlayer(p.id, newFirst, newLast);
                          }}
                          className="p-2 text-gray-400 hover:text-blue-500 rounded-full hover:bg-white"
                          title="Edit Player"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { if (confirm(`Delete player ${p.firstName} ${p.lastName}?`)) onDeletePlayer(p.id); }}
                          className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-white"
                          title="Delete Player"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {activeTab === 'games' && [...games].sort((a, b) => new Date(serializeTimestamp(b.createdAt)).getTime() - new Date(serializeTimestamp(a.createdAt)).getTime()).map(g => (
                    <div key={g.id} className="p-4 flex flex-col gap-3 hover:bg-gray-200/50 transition-colors group border-b border-gray-100 last:border-0">
                      <div className="flex items-center justify-between border-b border-gray-200/50 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded border border-gray-200 text-gray-600">
                            {g.id}
                          </span>
                          <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-200 hidden md:block">{videos.find(v => v.gameId === g.id)?.youtubeId || 'No URL attached'}</span>
                        </div>
                        <button
                          onClick={() => onDeleteGame(g.id, g.tag)}
                          className="px-2 py-1 bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-500 hover:bg-red-50 rounded-md transition-all shadow-sm flex items-center gap-1 text-[10px] uppercase font-bold"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase font-bold text-gray-400">Season</label>
                          <select
                            value={g.seasonId}
                            onChange={async (e) => {
                              try {
                                const oldAgg = { id: g.id, seasonId: g.seasonId || '', homeTeamId: g.homeTeamId || '', awayTeamId: g.awayTeamId || '', createdAt: serializeTimestamp(g.createdAt), ...(g.tag ? { tag: g.tag } : {}), ...(g.isVerified ? { isVerified: true } : { isVerified: false }), ...(g.authorId ? { authorId: g.authorId } : {}), ...(g.authorTeamId ? { authorTeamId: g.authorTeamId } : {}) };
                                const newAgg = { ...oldAgg, seasonId: e.target.value };
                                await updateDoc(doc(db, 'games', g.id), { seasonId: e.target.value });
                                await updateDoc(doc(db, 'aggregated', 'games'), { data: arrayRemove(oldAgg) });
                                await updateDoc(doc(db, 'aggregated', 'games'), { data: arrayUnion(newAgg) });
                                toast.success('Updated game season');
                                onRefreshData();
                              } catch (err) { toast.error('Check network'); }
                            }}
                            className="bg-white border border-gray-200 rounded p-1.5 text-xs outline-none focus:border-red-500"
                          >
                            {seasons.map(s => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Home Team</label>
                          <select
                            value={g.homeTeamId}
                            onChange={async (e) => {
                              try {
                                const oldAgg = { id: g.id, seasonId: g.seasonId || '', homeTeamId: g.homeTeamId || '', awayTeamId: g.awayTeamId || '', createdAt: serializeTimestamp(g.createdAt), ...(g.tag ? { tag: g.tag } : {}), ...(g.isVerified ? { isVerified: true } : { isVerified: false }), ...(g.authorId ? { authorId: g.authorId } : {}), ...(g.authorTeamId ? { authorTeamId: g.authorTeamId } : {}) };
                                const newAgg = { ...oldAgg, homeTeamId: e.target.value };
                                await updateDoc(doc(db, 'games', g.id), { homeTeamId: e.target.value });
                                await updateDoc(doc(db, 'aggregated', 'games'), { data: arrayRemove(oldAgg) });
                                await updateDoc(doc(db, 'aggregated', 'games'), { data: arrayUnion(newAgg) });
                                toast.success('Updated home team');
                                onRefreshData();
                              } catch (err) { toast.error('Check network'); }
                            }}
                            className="bg-white border border-gray-200 rounded p-1.5 text-xs outline-none focus:border-red-500"
                          >
                            {teams.map(t => <option key={t.id} value={t.id}>{t.name || t.id}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Away Team</label>
                          <select
                            value={g.awayTeamId}
                            onChange={async (e) => {
                              try {
                                const oldAgg = { id: g.id, seasonId: g.seasonId || '', homeTeamId: g.homeTeamId || '', awayTeamId: g.awayTeamId || '', createdAt: serializeTimestamp(g.createdAt), ...(g.tag ? { tag: g.tag } : {}), ...(g.isVerified ? { isVerified: true } : { isVerified: false }), ...(g.authorId ? { authorId: g.authorId } : {}), ...(g.authorTeamId ? { authorTeamId: g.authorTeamId } : {}) };
                                const newAgg = { ...oldAgg, awayTeamId: e.target.value };
                                await updateDoc(doc(db, 'games', g.id), { awayTeamId: e.target.value });
                                await updateDoc(doc(db, 'aggregated', 'games'), { data: arrayRemove(oldAgg) });
                                await updateDoc(doc(db, 'aggregated', 'games'), { data: arrayUnion(newAgg) });
                                toast.success('Updated away team');
                                onRefreshData();
                              } catch (err) { toast.error('Check network'); }
                            }}
                            className="bg-white border border-gray-200 rounded p-1.5 text-xs outline-none focus:border-red-500"
                          >
                            {teams.map(t => <option key={t.id} value={t.id}>{t.name || t.id}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Description Tag</label>
                          <input
                            type="text"
                            placeholder="e.g. Finals Match 1"
                            defaultValue={g.tag || ''}
                            onBlur={async (e) => {
                              try {
                                if (e.target.value === (g.tag || '')) return; // No change
                                const oldAgg = { id: g.id, seasonId: g.seasonId || '', homeTeamId: g.homeTeamId || '', awayTeamId: g.awayTeamId || '', createdAt: serializeTimestamp(g.createdAt), ...(g.tag ? { tag: g.tag } : {}), ...(g.isVerified ? { isVerified: true } : { isVerified: false }), ...(g.authorId ? { authorId: g.authorId } : {}), ...(g.authorTeamId ? { authorTeamId: g.authorTeamId } : {}) };
                                const newAgg = { ...oldAgg, tag: e.target.value };
                                await updateDoc(doc(db, 'games', g.id), { tag: e.target.value });
                                await updateDoc(doc(db, 'aggregated', 'games'), { data: arrayRemove(oldAgg) });
                                await updateDoc(doc(db, 'aggregated', 'games'), { data: arrayUnion(newAgg) });
                                toast.success('Game label updated');
                                onRefreshData();
                              } catch (err) {}
                            }}
                            className="bg-white border border-gray-200 rounded p-1.5 text-xs outline-none focus:border-red-500 font-medium w-full"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {activeTab === 'videos' && [...videos].sort((a, b) => new Date(serializeTimestamp(b.createdAt)).getTime() - new Date(serializeTimestamp(a.createdAt)).getTime()).map(v => (
                    <div key={v.id} className="p-4 flex flex-col gap-3 hover:bg-gray-200/50 transition-colors group border-b border-gray-100 last:border-0">
                      <div className="flex items-center justify-between border-b border-gray-200/50 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[10px] bg-gray-100 px-2 py-1 rounded border border-gray-200 text-gray-600">
                            ID: {v.id}
                          </span>
                          <span className="font-mono text-[10px] bg-red-50 text-red-600 font-bold px-2 py-1 rounded border border-red-200">
                            YT: {v.youtubeId}
                          </span>
                        </div>
                        <button
                          onClick={() => onDeleteVideo(v.id)}
                          className="px-2 py-1 bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-500 hover:bg-red-50 rounded-md transition-all shadow-sm flex items-center gap-1 text-[10px] uppercase font-bold"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="flex flex-col">
                           <span className="text-gray-400 uppercase font-bold text-[10px]">Title</span>
                           <span className="text-gray-900 font-medium">{v.title}</span>
                        </div>
                        <div className="flex flex-col">
                           <span className="text-gray-400 uppercase font-bold text-[10px]">Attached Game ID</span>
                           <span className="font-mono text-gray-600 break-all">{v.gameId}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatsView({ players, events, teams, games }: { players: Player[]; events: GameEvent[]; teams: Team[]; games: Game[] }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const playersPerPage = 10;

  const allUniquePlayers = useMemo(() => {
    const playerMap = new Map<string, Player>();

    // Add existing players
    players.forEach(p => {
      const normalizedId = p.id.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
      playerMap.set(normalizedId, p);
    });

    // Extract players from events if they don't exist
    events.forEach(e => {
      if (e.playerId) {
        const normalizedId = e.playerId.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        if (!playerMap.has(normalizedId)) {
          const parts = e.playerId.trim().split(/[\s_]+/);
          const firstName = parts[0] || '';
          const lastName = parts.slice(1).join(' ') || '';
          playerMap.set(normalizedId, {
            id: normalizedId,
            firstName: firstName || e.playerId.trim(),
            lastName: lastName,
            createdAt: new Date()
          });
        }
      }
    });

    return Array.from(playerMap.values());
  }, [players, events]);

  const filteredPlayers = useMemo(() => {
    return allUniquePlayers.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase())
    );
  }, [allUniquePlayers, search]);

  const playerStats = useMemo(() => {
    return filteredPlayers.map(player => {
      const playerEvents = events.filter(e => {
        if (!e.playerId) return false;
        return e.playerId == player.id;
      });
      const goals = playerEvents.filter(e => (e.type || '').toLowerCase().includes('goal')).length;
      const assists = playerEvents.filter(e => (e.type || '').toLowerCase().includes('assist')).length;
      const shots = playerEvents.filter(e => (e.type || '').toLowerCase().includes('shot')).length;
      const fouls = playerEvents.filter(e => (e.type || '').toLowerCase().includes('foul')).length;
      const cards = playerEvents.filter(e => (e.type || '').toLowerCase().includes('card')).length;
      return {
        ...player,
        goals,
        assists,
        shots,
        fouls,
        cards
      };
    }).sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists));
  }, [filteredPlayers, events]);

  const totalPages = Math.ceil(playerStats.length / playersPerPage) || 1;
  const currentPlayers = playerStats.slice((currentPage - 1) * playersPerPage, currentPage * playersPerPage);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-3xl font-bold">Player Stats</h2>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none w-64"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 bg-gray-50 rounded-lg disabled:opacity-50 hover:bg-gray-100 transition-colors border border-gray-200"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="px-4 py-2 bg-gray-50 rounded-lg border border-gray-200 text-sm font-medium min-w-[120px] text-center">
              Page {currentPage} of {totalPages}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 bg-gray-50 rounded-lg disabled:opacity-50 hover:bg-gray-100 transition-colors border border-gray-200"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden shadow-2xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-200 bg-white/80">
              <th className="p-4 font-bold text-gray-500 uppercase text-xs tracking-wider">Player</th>
              <th className="p-4 font-bold text-gray-500 uppercase text-xs tracking-wider text-center">Goals</th>
              <th className="p-4 font-bold text-gray-500 uppercase text-xs tracking-wider text-center">Assists</th>
              <th className="p-4 font-bold text-gray-500 uppercase text-xs tracking-wider text-center">Shots</th>
              <th className="p-4 font-bold text-gray-500 uppercase text-xs tracking-wider text-center">Fouls</th>
              <th className="p-4 font-bold text-gray-500 uppercase text-xs tracking-wider text-center">Cards</th>
              <th className="p-4 font-bold text-gray-500 uppercase text-xs tracking-wider text-center">Total Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {currentPlayers.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="w-8 h-8 opacity-20" />
                    <p>No player stats found.</p>
                  </div>
                </td>
              </tr>
            ) : (
              currentPlayers.map(player => (
                <tr key={player.id} className="hover:bg-gray-200/50 transition-colors group">
                  <td className="p-4">
                    <div className="font-bold text-lg group-hover:text-red-400 transition-colors">{player.firstName} {player.lastName}</div>
                    <div className="text-xs text-gray-400 font-mono">{player.id}</div>
                  </td>
                  <td className="p-4 text-center font-mono text-xl">{player.goals}</td>
                  <td className="p-4 text-center font-mono text-xl">{player.assists}</td>
                  <td className="p-4 text-center font-mono text-xl">{player.shots}</td>
                  <td className="p-4 text-center font-mono text-xl">{player.fouls}</td>
                  <td className="p-4 text-center font-mono text-xl">{player.cards}</td>
                  <td className="p-4 text-center font-mono text-xl text-red-400 font-bold bg-red-500/5">{player.goals + player.assists}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const getPlayerShortName = (p: Player | undefined | null, rosterPool: { player?: Player }[]) => {
  if (!p) return 'Unknown';
  if (!p.firstName) return p.lastName || 'Unknown';

  const sameInitial = rosterPool.filter(rp => rp.player && rp.player.lastName === p.lastName && rp.player.firstName.charAt(0) === p.firstName.charAt(0));
  if (sameInitial.length > 1) {
    if (p.firstName.length >= 2) return `${p.firstName.substring(0, 2)}. ${p.lastName}`;
    return `${p.firstName}. ${p.lastName}`; // fallback
  }
  return `${p.firstName.charAt(0)}. ${p.lastName}`;
};

function CreateView({
  teams, seasons, players,
  onAddTeam, onAddPlayer, onAddPlayerToRoster, onRemovePlayerFromRoster,
  onCreateRoster, onDeleteRoster
}: any) {
  const [activeTab, setActiveTab] = useState<'rosters' | 'teams' | 'players'>('rosters');
  const [selectedRosterId, setSelectedRosterId] = useState('');
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [rosterPlayers, setRosterPlayers] = useState<(RosterPlayer & { player?: Player })[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'rosters'));
    return onSnapshot(q, (snap) => {
      setRosters(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Roster[]);
    });
  }, []);

  useEffect(() => {
    if (!selectedRosterId) {
      setRosterPlayers([]);
      return;
    }
    return onSnapshot(collection(db, 'rosters', selectedRosterId, 'players'), (snap) => {
      setRosterPlayers(snap.docs.map(doc => {
        const data = doc.data() as RosterPlayer;
        return { ...data, player: players.find((p: any) => p.id === data.playerId) };
      }));
    });
  }, [selectedRosterId, players]);

  return (
    <div className="space-y-8 -mx-4 px-4 -mt-8 pt-6 pb-8 min-h-[80vh]">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Moderator - Creation Tools</h2>
        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-200">
          {(['rosters', 'teams', 'players'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold capitalize transition-all",
                activeTab === tab ? "bg-red-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-900"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'rosters' ? (
        <UnifiedRosterEditor
          teams={teams}
          seasons={seasons}
          players={players}
          rosters={rosters}
          rosterPlayers={rosterPlayers}
          selectedRosterId={selectedRosterId}
          setSelectedRosterId={setSelectedRosterId}
          onAddTeam={onAddTeam}
          onAddPlayer={onAddPlayer}
          onAddPlayerToRoster={onAddPlayerToRoster}
          onRemovePlayerFromRoster={onRemovePlayerFromRoster}
          onCreateRoster={onCreateRoster}
          onDeleteRoster={onDeleteRoster}
        />
      ) : activeTab === 'teams' ? (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm max-w-xl">
          <h3 className="text-xl font-bold mb-4">Create New Team</h3>
          <p className="text-sm text-gray-500 mb-6">Create a team once, and it will be available to all authors forever.</p>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.target as HTMLFormElement);
            const teamName = data.get('teamName')?.toString().trim();
            if (teamName) {
              await onAddTeam(teamName);
              (e.target as HTMLFormElement).reset();
            }
          }} className="flex gap-4">
            <input name="teamName" type="text" placeholder="Austin Outlaws..." required className="flex-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3" />
            <button type="submit" className="bg-red-600 text-white px-6 py-3 rounded-xl font-bold transition-colors hover:bg-red-700">Add Team</button>
          </form>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm max-w-xl">
          <h3 className="text-xl font-bold mb-4">Create Global Player</h3>
          <p className="text-sm text-gray-500 mb-6">Add a player to the global database. Ensure they don't already exist first!</p>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.target as HTMLFormElement);
            const fName = data.get('firstName')?.toString().trim();
            const lName = data.get('lastName')?.toString().trim();
            if (fName && lName) {
              await onAddPlayer(fName, lName);
              (e.target as HTMLFormElement).reset();
            }
          }} className="space-y-4">
            <input name="firstName" type="text" placeholder="First Name..." required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3" />
            <input name="lastName" type="text" placeholder="Last Name..." required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3" />
            <button type="submit" className="w-full bg-red-600 text-white px-4 py-3 rounded-xl font-bold transition-colors hover:bg-red-700">Add Player</button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [hasSeenLanding, setHasSeenLanding] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash && hash.length > 2 && hash !== '#/') {
        return true;
      }
      return sessionStorage.getItem('hasSeenLanding') === 'true';
    }
    return false;
  });

  const handleBypassLanding = () => {
    setHasSeenLanding(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('hasSeenLanding', 'true');
    }
  };
  const [videos, setVideos] = useState<Video[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingGame, setIsAddingGame] = useState(false);
  const [events, setEvents] = useState<GameEvent[]>([]);

  // Global Data
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);

  // Roster Data for current video
  const [homeRosterPlayers, setHomeRosterPlayers] = useState<(RosterPlayer & { player: Player })[]>([]);
  const [awayRosterPlayers, setAwayRosterPlayers] = useState<(RosterPlayer & { player: Player })[]>([]);
  const [manualActivePlayerIds, setManualActivePlayerIds] = useState<Set<string>>(new Set());

  const [player, setPlayer] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const hasAutoSeekedRef = useRef<boolean>(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [popupTimeOffset, setPopupTimeOffset] = useState<number>(0);
  // 'home' | 'away' | null (null = neither team / contested)
  const [selectedTeamContext, setSelectedTeamContext] = useState<'home' | 'away' | null>('home');

  // Management State
  const [view, setView] = useState<'tracker' | 'video' | 'manage' | 'create' | 'stats' | 'review' | 'help' | 'playerProfile' | 'teamProfile' | 'gameProfile'>('stats');
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  type ViewState = typeof view;
  const [navHistory, setNavHistory] = useState<{ view: ViewState, states: { p: string | null, t: string | null, g: string | null } }[]>([]);

  const pushProfile = (nextView: ViewState, idObj: { p?: string, t?: string, g?: string }) => {
    setNavHistory(prev => [...prev, { view, states: { p: activePlayerId, t: activeTeamId, g: activeGameId } }]);
    if (idObj.p) setActivePlayerId(idObj.p);
    if (idObj.t) setActiveTeamId(idObj.t);
    if (idObj.g) setActiveGameId(idObj.g);
    setView(nextView);
  };

  const popProfile = () => {
    setNavHistory(prev => {
      if (prev.length === 0) { setView('stats'); return prev; }
      const last = prev[prev.length - 1];
      setView(last.view);
      setActivePlayerId(last.states.p);
      setActiveTeamId(last.states.t);
      setActiveGameId(last.states.g);
      return prev.slice(0, prev.length - 1);
    });
  };

  // URL Deep Linking / Routing Sync
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/game/')) {
        setActiveGameId(hash.replace('#/game/', ''));
        setView('gameProfile');
      } else if (hash.startsWith('#/team/')) {
        setActiveTeamId(hash.replace('#/team/', ''));
        setView('teamProfile');
      } else if (hash.startsWith('#/player/')) {
        setActivePlayerId(hash.replace('#/player/', ''));
        setView('playerProfile');
      } else if (hash === '#/stats' || hash === '') {
        setView('stats');
      } else if (hash.startsWith('#/')) {
        const route = hash.replace('#/', '') as ViewState;
        if (['tracker', 'video', 'manage', 'create', 'review', 'help'].includes(route)) {
          setView(route);
        }
      }
    };

    handleHashChange(); // Run once on startup
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    let newHash = '#/';
    if (view === 'gameProfile' && activeGameId) newHash = `#/game/${activeGameId}`;
    else if (view === 'teamProfile' && activeTeamId) newHash = `#/team/${activeTeamId}`;
    else if (view === 'playerProfile' && activePlayerId) newHash = `#/player/${activePlayerId}`;
    else if (view === 'stats') newHash = '#/stats';
    else newHash = `#/${view}`;

    if (window.location.hash !== newHash) {
      window.history.pushState(null, '', newHash);
    }
  }, [view, activeGameId, activeTeamId, activePlayerId]);

  const handlePlayerProfileClick = (id: string) => { pushProfile('playerProfile', { p: id }); };
  const handleTeamProfileClick = (id: string) => { pushProfile('teamProfile', { t: id }); };
  const handleGameProfileClick = (id: string) => { pushProfile('gameProfile', { g: id }); };
  const [statsSubView, setStatsSubView] = useState<'quadball' | 'beaters' | 'seekers' | 'gamecast'>('quadball');
  const [allEvents, setAllEvents] = useState<GameEvent[]>([]);
  const ADMIN_EMAIL = 'andrew.axtell@gmail.com';
  const isAdmin = user?.email === ADMIN_EMAIL;

  // Persistent anonymous device ID for tracking votes without login
  const [deviceId] = useState(() => {
    const stored = localStorage.getItem('qr_device_id');
    if (stored) return stored;
    const id = 'anon_' + crypto.randomUUID();
    localStorage.setItem('qr_device_id', id);
    return id;
  });
  const voterId = user?.uid || deviceId;
  const [simulateRole, setSimulateRole] = useState<'voter' | 'author' | 'moderator' | 'trusted'>('trusted');
  const [userRoles, setUserRoles] = useState<{ authors: string[]; trusted: string[]; moderators: string[] }>({ authors: [], trusted: [], moderators: [] });
  // Effective role: admin can simulate any role; otherwise check config assignments
  const effectiveRole = isAdmin ? simulateRole
    : userRoles.trusted.includes(user?.email || '') ? 'trusted'
    : userRoles.moderators.includes(user?.email || '') ? 'moderator'
    : user ? 'author' : 'voter';
  const [statsFilter, setStatsFilter] = useState<'all' | 'verified'>('all');

  // Demo data for when Firestore is unavailable
  const [demoData, setDemoData] = useState<{
    events: GameEvent[];
    players: Player[];
    games: Game[];
    teams: Team[];
    seasons: Season[];
    videos: Video[];
    fileName: string;
  } | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<'live_events' | 'record' | 'momentum' | 'rosters'>('live_events');
  const [eventsListFilterMode, setEventsListFilterMode] = useState<'now' | 'all'>('now');
  const [eventsListTeamFilter, setEventsListTeamFilter] = useState<string>('all');
  const [eventsListEventFilter, setEventsListEventFilter] = useState<string>('all');
  const [draftEvents, setDraftEvents] = useState<DraftEvent[]>([]);
  const [watchLeagueId, setWatchLeagueId] = useState<string>('all');
  const [trackerYearId, setTrackerYearId] = useState<string>('all');
  const [trackerTeamId, setTrackerTeamId] = useState<string>('all');
  const [trackerOpponentId, setTrackerOpponentId] = useState<string>('all');
  const [trackerGameId, setTrackerGameId] = useState<string>('');
  const [verifiedYearId, setVerifiedYearId] = useState<string>('all');
  const [verifiedTeamId, setVerifiedTeamId] = useState<string>('all');
  const [statsSeasonId, setStatsSeasonId] = useState<string>('');
  const [statsTeamId, setStatsTeamId] = useState<string>('');
  const [statsSearch, setStatsSearch] = useState<string>('');
  const [statsMinGames, setStatsMinGames] = useState<number>(1);
  const [bludgerControlMode, setBludgerControlMode] = useState<'all' | 'separate'>('all');
  const [statsFlagFilter, setStatsFlagFilter] = useState<'all' | 'on' | 'off'>('all');
  const [statsOutlierFilter, setStatsOutlierFilter] = useState<'include' | 'exclude'>('include');
  const [statsPositionFilter, setStatsPositionFilter] = useState<'all' | 'chaser' | 'keeper'>('all');

  // Resolve which data to use for stats: demo data takes priority
  const statsPlayers = demoData ? demoData.players : allPlayers;
  const statsEventsRaw = demoData ? demoData.events : allEvents;
  const statsTeams = demoData ? demoData.teams : teams;
  const statsGamesRaw = demoData ? demoData.games : games;
  const statsSeasons = demoData ? demoData.seasons : seasons;
  const statsVideos = demoData && demoData.videos.length > 0 ? demoData.videos : videos;

  const legacySeasonIds = useMemo(() => {
    return new Set(statsSeasons.filter(s => {
      const yearMatch = s.name?.match(/\d{4}/) || s.year?.match(/\d{4}/);
      if (!yearMatch) return false;
      return parseInt(yearMatch[0], 10) <= 2020;
    }).map(s => s.id));
  }, [statsSeasons]);

  const currentUserTeamId = useMemo(() => teams.find(t => t.emails?.includes(user?.email || ''))?.id, [teams, user]);
  const currentSeasonId = ''; // All stats public

  const statsGames = useMemo(() => {
    return statsGamesRaw.filter(g => !legacySeasonIds.has(g.seasonId));
  }, [statsGamesRaw, legacySeasonIds]);

  const statsEvents = useMemo(() => {
    let evs = Array.from(statsEventsRaw.values());
    if (statsFilter === 'verified') evs = evs.filter(e => e.status === 'verified');

    const validGameIds = new Set(statsGames.map(g => g.id));
    return evs.filter(e => validGameIds.has(e.gameId));
  }, [statsEventsRaw, statsFilter, statsGames]);

  // Per-game access: current-season games visible on Stats page only to author, author's team, or players on either team
  const dashboardGames = useMemo(() => {
    if (!currentSeasonId) return statsGames; // no current season configured = everything public
    return statsGames.filter(g => {
      // Non-current-season: always public
      if (g.seasonId !== currentSeasonId) return true;
      // Current season: author, author's team, or on the home/away roster
      if (!user) return false;
      if (g.authorId === user.uid) return true;
      if (currentUserTeamId && (g.authorTeamId === currentUserTeamId || g.homeTeamId === currentUserTeamId || g.awayTeamId === currentUserTeamId)) return true;
      return false;
    });
  }, [statsGames, currentSeasonId, user, currentUserTeamId]);

  // True if the user can see at least SOME current-season data (hides the warning banner)
  const hasPrivilegedStatsAccess = useMemo(() => {
    if (!currentSeasonId) return true;
    if (!user) return false;
    return statsGames.some(g =>
      g.seasonId === currentSeasonId &&
      (g.authorId === user.uid || (currentUserTeamId && (g.authorTeamId === currentUserTeamId || g.homeTeamId === currentUserTeamId || g.awayTeamId === currentUserTeamId)))
    );
  }, [statsGames, currentSeasonId, user, currentUserTeamId]);

  const dashboardEvents = useMemo(() => {
    const validGameIds = new Set(dashboardGames.map(g => g.id));
    return statsEvents.filter(e => validGameIds.has(e.gameId));
  }, [statsEvents, dashboardGames]);

  // Contextually filter dropdowns to only show options that contain data
  const filteredDropdownSeasons = useMemo(() => {
    const activeSeasonIds = new Set(dashboardGames.map(g => g.seasonId));
    return statsSeasons.filter(s => activeSeasonIds.has(s.id));
  }, [statsSeasons, dashboardGames]);

  const filteredDropdownTeams = useMemo(() => {
    const activeTeamIds = new Set<string>();
    dashboardGames.forEach(g => {
      if (g.homeTeamId) activeTeamIds.add(g.homeTeamId);
      if (g.awayTeamId) activeTeamIds.add(g.awayTeamId);
    });
    return statsTeams.filter(t => activeTeamIds.has(t.id));
  }, [statsTeams, dashboardGames]);

  const [newVideoData, setNewVideoData] = useState({
    seasonId: '',
    homeTeamId: '',
    awayTeamId: '',
    gameId: '',
    videoId: '',
    tag: ''
  });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Videos and Games are now loaded efficiently via loadGlobalData (Phase 2 Aggregation).

  // Events Listener
  useEffect(() => {
    if (!currentVideo) return;

    const unsubscribe = onSnapshot(doc(db, 'gameEvents', currentVideo.gameId), (docSnap) => {
      const gameEvs = (docSnap.data()?.events || []) as GameEvent[];
      const newEvents = gameEvs
        .filter(e => e.videoId === currentVideo.id)
        .sort((a, b) => a.videoTime - b.videoTime);
      setEvents(newEvents);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `gameEvents/${currentVideo.gameId}`);
    });

    return () => unsubscribe();
  }, [currentVideo]);

  // Global Data — one-time load to minimize reads (no live listener on 20k+ events)
  const [dataLoaded, setDataLoaded] = useState(false);
  const [eventsLoaded, setEventsLoaded] = useState(false);

  const loadGlobalData = useCallback(async () => {
    try {
      const [playersSnap, teamsSnap, seasonsSnap, gamesSnap, videosSnap, rolesSnap] = await Promise.all([
        getDoc(doc(db, 'aggregated', 'players')),
        getDoc(doc(db, 'aggregated', 'teams')),
        getDoc(doc(db, 'aggregated', 'seasons')),
        getDoc(doc(db, 'aggregated', 'games')),
        getDoc(doc(db, 'aggregated', 'videos')),
        getDoc(doc(db, 'appConfig', 'roles'))
      ]);
      const pList = (playersSnap.data()?.data || []) as Player[];
      setAllPlayers(pList.sort((a, b) => String(a.firstName + ' ' + a.lastName).localeCompare(String(b.firstName + ' ' + b.lastName))));

      const tList = (teamsSnap.data()?.data || []) as Team[];
      setTeams(tList.sort((a, b) => String(a.name).localeCompare(String(b.name))));

      const sList = (seasonsSnap.data()?.data || []) as Season[];
      setSeasons(sList.sort((a, b) => String(a.name).localeCompare(String(b.name))));

      const gList = (gamesSnap.data()?.data || []) as Game[];
      setGames(gList.sort((a, b) => new Date(serializeTimestamp(b.createdAt)).getTime() - new Date(serializeTimestamp(a.createdAt)).getTime()));

      const vList = (videosSnap.data()?.data || []) as Video[];
      setVideos(vList.sort((a, b) => new Date(serializeTimestamp(b.createdAt)).getTime() - new Date(serializeTimestamp(a.createdAt)).getTime()));

      if (rolesSnap.exists()) {
        const d = rolesSnap.data() || {};
        setUserRoles({ authors: d.authors || [], trusted: d.trusted || [], moderators: d.moderators || [] });
      } else {
        setUserRoles({ authors: [], trusted: [], moderators: [] });
      }

      setDataLoaded(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'global data');
    }
  }, []);

  const loadAllEvents = useCallback(async () => {
    if (eventsLoaded) return;
    try {
      const eventsSnap = await getDocs(collection(db, 'gameEvents'));
      let flatEvents: GameEvent[] = [];
      eventsSnap.forEach(doc => {
        flatEvents = flatEvents.concat(doc.data().events || []);
      });
      setAllEvents(flatEvents);
      setEventsLoaded(true);
    } catch (error) {
      console.error('Failed to load all events (typically non-issue due to guest perm restrictions)', error);
    }
  }, [eventsLoaded]);

  // Boot aggregated global dictionaries on mount (costs 6 doc reads max)
  useEffect(() => {
    loadGlobalData();
  }, [loadGlobalData]);

  // Lazy load full events registry ONLY if the user accesses heavy statistical views to circumvent massive read quotas
  useEffect(() => {
    if (view === 'stats' || view === 'review') {
      loadAllEvents();
    }
  }, [view, loadAllEvents]);

  const currentGame = useMemo(() => {
    if (!currentVideo) return null;
    const found = games.find(g => g.id === currentVideo.gameId);
    if (found) return found;
    // Fallback: construct a local game object so the tracker UI works even without Firestore
    return {
      id: currentVideo.gameId,
      seasonId: 'local',
      homeTeamId: 'unknown_home',
      awayTeamId: 'unknown_away',
      createdAt: new Date(),
    } as any;
  }, [currentVideo, games]);

  // Roster Listeners for current video
  useEffect(() => {
    if (!currentVideo || !currentGame || !allPlayers.length) return;

    const fetchRoster = async (teamId: string, seasonId: string, setRoster: any) => {
      const q = query(collection(db, 'rosters'), where('teamId', '==', teamId), where('seasonId', '==', seasonId));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        setRoster([]);
        return;
      }
      const rosterId = snapshot.docs[0].id;
      return onSnapshot(collection(db, 'rosters', rosterId, 'players'), (snap) => {
        const rosterPlayers = snap.docs.map(doc => {
          const data = doc.data() as RosterPlayer;
          const playerInfo = allPlayers.find(p => p.id === data.playerId);
          return { ...data, id: doc.id, player: playerInfo || { id: data.playerId, name: 'Unknown', createdAt: null } };
        });
        setRoster(rosterPlayers);
      }, (error) => handleFirestoreError(error, OperationType.LIST, `rosters/${rosterId}/players`));
    };

    let unsubHome: any;
    let unsubAway: any;

    const setup = async () => {
      unsubHome = await fetchRoster(currentGame.homeTeamId, currentGame.seasonId, setHomeRosterPlayers);
      unsubAway = await fetchRoster(currentGame.awayTeamId, currentGame.seasonId, setAwayRosterPlayers);
    };

    setup();

    return () => {
      if (unsubHome) unsubHome();
      if (unsubAway) unsubAway();
    };
  }, [currentVideo, currentGame, allPlayers]);

  // Active Players tracking (from events)
  useEffect(() => {
    if (!events.length) {
      // Default: all roster players are active? Or none?
      // Let's assume for now we track explicitly via subs.
      // But we need an initial state.
      return;
    }

    const active = new Set<string>();
    // This is complex because we need to know who started.
    // Let's simplify: any player who has a non-sub event or was subbed in is "active"
    // Or better: use the 'isActive' logic from before but derived from events.
    // For now, let's just show everyone in the roster and allow marking them active.
  }, [events]);

  // Video Time Polling
  useEffect(() => {
    if (!player) return;

    const interval = setInterval(() => {
      try {
        setCurrentTime(player.getCurrentTime());
      } catch (err) {
        // Iframe unmounted or disconnected
      }
    }, 500);

    return () => clearInterval(interval);
  }, [player]);


  const handleAddEvent = async (
    type: EventType,
    playerId?: string,
    subPlayerId?: string,
    relatedEventId?: string,
    teamId?: string | null,
    position?: PositionType | null,
    providedVideoTime?: number,
    providedGameTime?: number
  ) => {
    if (!user || !currentVideo || (!player && providedVideoTime === undefined)) return;

    const videoTime = providedVideoTime !== undefined ? providedVideoTime : player ? player.getCurrentTime() : 0;
    const eventId = crypto.randomUUID();

    try {
      const eventData = {
        id: eventId,
        videoId: currentVideo.id,
        gameId: currentVideo.gameId,
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        type,
        videoTime,
        gameTime: providedGameTime !== undefined ? providedGameTime : null,
        createdAt: new Date().toISOString(),
        votes: 0,
        upvotes: 0,
        downvotes: 0,
        upvoterIds: [],
        downvoterIds: [],
        status: 'unverified' as const,
        playerId: playerId || null,
        teamId: teamId !== undefined ? teamId : null,
        subPlayerId: subPlayerId || null,
        relatedEventId: relatedEventId || null,
        position: position || null
      };

      const gameEventsRef = doc(db, 'gameEvents', currentVideo.gameId);
      await setDoc(gameEventsRef, {
        events: arrayUnion(eventData)
      }, { merge: true });

      return eventId;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'events');
      return null;
    }
  };

  const togglePlayerActive = (playerId: string) => {
    const nextActive = new Set(manualActivePlayerIds);
    if (nextActive.has(playerId)) {
      nextActive.delete(playerId);
    } else {
      nextActive.add(playerId);
    }
    setManualActivePlayerIds(nextActive);
  };



  const handleCreateDraftEvent = (
    type: EventType | null,
    teamId?: string | null,
    playerId?: string | null,
    relatedEventId?: string | null,
    position?: PositionType | null,
    timeOverride?: number
  ) => {
    if (!currentVideo || !user) return;
    const vTime = timeOverride !== undefined ? timeOverride : (player ? (function(){ try { return player.getCurrentTime(); } catch(e){ return 0; }})() : 0);

    // Auto-pause video when entering draft mode
    try {
      if (player && player.getPlayerState() === 1) { // 1 = playing
        player.pauseVideo();
      }
    } catch(e) {}

    let inferredTeamId = teamId || null;
    if (!inferredTeamId && currentGame && type) {
      const past = activeTrackingEvents.filter(e => e.videoTime <= vTime);
      if (type === 'control_change') {
        const cTeam = getControlTeamAtTime(computeControlPeriods(past), vTime);
        inferredTeamId = cTeam === currentGame.homeTeamId ? currentGame.awayTeamId : currentGame.homeTeamId;
      } else if (['goal', 'shot', 'attempt', 'turnover', 'assist'].includes(type)) {
        const lastQ = past.slice().reverse().find(e => ['goal', 'shot', 'attempt', 'turnover', 'quadball_start', 'takeaway'].includes(e.type as string) && e.teamId);
        if (lastQ) {
          if (['goal', 'turnover'].includes(lastQ.type)) {
            inferredTeamId = lastQ.teamId === currentGame.homeTeamId ? currentGame.awayTeamId : currentGame.homeTeamId;
          } else if ((lastQ.type as string) === 'takeaway') {
            // if someone stole the ball, they possess it!
            inferredTeamId = lastQ.teamId;
          } else {
            inferredTeamId = lastQ.teamId;
          }
        }
      }
    }

    const newDraft: DraftEvent = {
      id: crypto.randomUUID(),
      type,
      videoTime: vTime,
      gameTime: gameTime,
      teamId: inferredTeamId,
      playerId: playerId || null,
      relatedEventId: relatedEventId || null,
      assistedByPlayerId: null,
      position: position || null,
      subPlayerId: null
    };

    if (type === 'gameStart' || type === 'gamePause' || type === 'gameEnd') {
      handleAddEvent(
        newDraft.type as EventType,
        undefined, // playerId
        undefined, // subPlayerId
        undefined, // relatedEventId
        newDraft.teamId || null, // teamId
        null,      // position
        newDraft.videoTime,
        newDraft.gameTime
      );
      return;
    }

    // If there's an existing incomplete draft (no player set) and the user clicks a new event type,
    // replace it instead of stacking
    if (type) {
      const existingIncomplete = draftEvents.find(d => !d.playerId && d.type !== null);
      if (existingIncomplete) {
        setDraftEvents(prev => prev.map(d => d.id === existingIncomplete.id ? newDraft : d));
        return;
      }
    }

    setDraftEvents(prev => [newDraft, ...prev]);
  };

  const handleDeleteDraftEvent = (id: string) => {
    setDraftEvents(prev => prev.filter(d => d.id !== id));
  };

  const handleDeleteRecordedEvent = async (eventId: string) => {
    if (!currentVideo || !user) return;
    const exactDbEvent = events.find(e => e.id === eventId);
    if (!exactDbEvent) {
      toast.error('Event not found in live scope.');
      return;
    }

    if (effectiveRole !== 'trusted' && exactDbEvent.userId !== user.uid) {
      toast.error('You do not have permission to delete an event authored by someone else.');
      return;
    }

    try {
      const gameEventsRef = doc(db, 'gameEvents', currentVideo.gameId);
      const snap = await getDoc(gameEventsRef);
      if (snap.exists()) {
        const evs = snap.data().events || [];
        const newEvs = evs.filter((ev: any) => ev.id !== eventId);
        await updateDoc(gameEventsRef, { events: newEvs });
        toast.success('Event permanently deleted');
      } else {
        toast.error('Game events not found');
      }
    } catch (error) {
      toast.error('Failed to delete event');
      console.error("Delete Error:", error);
    }
  };

  const handleUpdateEventPlayerId = async (eventId: string, newPlayerId: string) => {
    if (!currentVideo || !user) return;
    const exactDbEvent = events.find(e => e.id === eventId);
    if (!exactDbEvent) {
      toast.error('Event not found in live scope.');
      return;
    }

    if (effectiveRole !== 'trusted' && exactDbEvent.userId !== user.uid) {
      toast.error('You do not have permission to modify an event authored by someone else.');
      return;
    }

    try {
      const gameEventsRef = doc(db, 'gameEvents', currentVideo.gameId);
      await updateDoc(gameEventsRef, {
        events: arrayRemove(exactDbEvent)
      });
      await updateDoc(gameEventsRef, {
        events: arrayUnion({ ...exactDbEvent, playerId: newPlayerId })
      });
      toast.success('Event updated');
    } catch (error) {
      toast.error('Failed to update event');
      console.error("Update Error:", error);
    }
  };

  const handleVerifyGame = async (gameId: string) => {
    if (effectiveRole === 'voter') {
      toast.error('You do not have permission to verify games.');
      return;
    }
    if (!gameId) return;
    const currentGame = games.find(g => g.id === gameId);
    const newVerified = !(currentGame?.isVerified);
    try {
      const batch = writeBatch(db);
      const gameRef = doc(db, 'games', gameId);
      batch.update(gameRef, { isVerified: newVerified });

      const aggGameRef = doc(db, 'aggregated', 'games');
      const aggSnap = await getDoc(aggGameRef);
      if (aggSnap.exists()) {
        const gamesList = aggSnap.data()?.data || [];
        const updatedList = gamesList.map((g: any) => g.id === gameId ? { ...g, isVerified: newVerified } : g);
        batch.update(aggGameRef, { data: updatedList });
      }

      await batch.commit();
      setGames(prev => prev.map(g => g.id === gameId ? { ...g, isVerified: newVerified } : g));
      toast.success(newVerified ? 'Game verified!' : 'Game unverified.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `games/${gameId}`);
    }
  };

  const handleToggleAllEventsVerified = async (gameId: string) => {
    if (effectiveRole === 'voter') {
      toast.error('You do not have permission to verify events.');
      return;
    }
    if (!gameId) return;
    try {
      const gameEventsRef = doc(db, 'gameEvents', gameId);
      const snap = await getDoc(gameEventsRef);
      if (!snap.exists()) return;
      const currentEvents = (snap.data()?.events || []) as GameEvent[];
      // If all non-draft events are verified, unverify them; otherwise verify them
      const nonDraftEvents = currentEvents.filter(e => e.id && !e.id.includes('_draft'));
      const allVerified = nonDraftEvents.length > 0 && nonDraftEvents.every(e => e.status === 'verified');
      const newStatus = allVerified ? 'recorded' : 'verified';
      const updatedEvents = currentEvents.map(e => {
        if (e.id && !e.id.includes('_draft')) {
          return { ...e, status: newStatus };
        }
        return e;
      });
      await updateDoc(gameEventsRef, { events: updatedEvents });
      toast.success(allVerified ? 'All events unverified.' : 'All events verified!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `gameEvents/${gameId}`);
    }
  };

  const handleSaveDraftEvent = (draft: DraftEvent, chainNext: boolean = false) => {
    if (!draft.type) {
      toast.error("Please select an event type");
      return;
    }
    handleAddEvent(
      draft.type,
      draft.playerId || undefined,
      undefined, // subPlayerId usually not drafted this way, but we can extend later
      draft.relatedEventId || undefined,
      draft.teamId || null,
      draft.position || null,
      draft.videoTime,
      draft.gameTime
    ).then((primaryEventId) => {
      if (draft.type === 'goal' && draft.assistedByPlayerId && primaryEventId) {
        handleAddEvent(
          'assist',
          draft.assistedByPlayerId,
          undefined,
          primaryEventId,
          draft.teamId || null,
          null,
          draft.videoTime,
          draft.gameTime
        );
      }

      if (draft.type === 'sub_out' && draft.subPlayerId && primaryEventId) {
        const subPosition = (draft.playerId && activePlayerPositions.get(draft.playerId)) || 'chaser';
        handleAddEvent(
          'sub_in',
          draft.subPlayerId,
          undefined,
          primaryEventId,
          draft.teamId || null,
          subPosition,
          draft.videoTime,
          draft.gameTime
        );
      }
    });

    if (chainNext && (draft.type === 'sub_out' || draft.type === 'sub_in')) {
      const nextDraft: DraftEvent = {
        ...draft,
        id: crypto.randomUUID(),
        playerId: null,
        subPlayerId: null,
      };
      setDraftEvents(prev => prev.map(d => d.id === draft.id ? nextDraft : d));
    } else {
      setDraftEvents(prev => prev.filter(d => d.id !== draft.id));
    }

    // Auto-resume video and focus iframe after quaffle / control events
    const autoResumeTypes = ['goal', 'shot', 'attempt', 'turnover', 'quadball_start', 'control_change', 'control_start'];
    if (draft.type && autoResumeTypes.includes(draft.type)) {
      try {
        if (player && player.getPlayerState() !== 1) { // not already playing
          player.playVideo();
        }
      } catch (e) {}
      // Focus the YouTube iframe so arrow keys work
      setTimeout(() => {
        const iframe = document.querySelector('iframe[src*="youtube"]') as HTMLIFrameElement;
        if (iframe) iframe.focus();
      }, 100);
    }
  };

  // Management Actions
  const handleRunMigration = async () => {
    try {
      const [pSnap, tSnap, sSnap, gSnap, vSnap] = await Promise.all([
        getDocs(collection(db, 'players')),
        getDocs(collection(db, 'teams')),
        getDocs(collection(db, 'seasons')),
        getDocs(collection(db, 'games')),
        getDocs(collection(db, 'videos'))
      ]);
      const pData = pSnap.docs.map(doc => ({ id: doc.id, firstName: doc.data().firstName || '', lastName: doc.data().lastName || '', preferredName: doc.data().preferredName || '', nickname: doc.data().nickname || '' }));
      const tData = tSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name || '' }));
      const sData = sSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name || '', league: doc.data().league || '', year: doc.data().year || '', description: doc.data().description || '' }));
      const gData = gSnap.docs.map(doc => ({ id: doc.id, seasonId: doc.data().seasonId || '', homeTeamId: doc.data().homeTeamId || '', awayTeamId: doc.data().awayTeamId || '', isVerified: doc.data().isVerified || false, authorId: doc.data().authorId || '', authorTeamId: doc.data().authorTeamId || '', createdAt: serializeTimestamp(doc.data().createdAt) }));
      const vData = vSnap.docs.map(doc => ({ id: doc.id, videoId: doc.data().videoId || '', youtubeId: doc.data().youtubeId || '', gameId: doc.data().gameId || '', title: doc.data().title || '', createdAt: serializeTimestamp(doc.data().createdAt) }));

      const batch = writeBatch(db);
      batch.set(doc(db, 'aggregated', 'players'), { data: pData });
      batch.set(doc(db, 'aggregated', 'teams'), { data: tData });
      batch.set(doc(db, 'aggregated', 'seasons'), { data: sData });
      batch.set(doc(db, 'aggregated', 'games'), { data: gData });
      batch.set(doc(db, 'aggregated', 'videos'), { data: vData });
      await batch.commit();
    } catch (error) {
      console.error("Migration error:", error);
      throw error;
    }
  };

  const handleBackfillAuthorId = async () => {
    if (!user) return;
    const gamesSnap = await getDocs(collection(db, 'games'));
    let updated = 0;
    for (let i = 0; i < gamesSnap.docs.length; i += 500) {
      const batch = writeBatch(db);
      const slice = gamesSnap.docs.slice(i, i + 500);
      for (const gameDoc of slice) {
        const data = gameDoc.data();
        if (!data.authorId) {
          batch.update(doc(db, 'games', gameDoc.id), { authorId: user.uid, authorTeamId: currentUserTeamId || '' });
          updated++;
        }
      }
      await batch.commit();
    }
    // Also update aggregated cache
    const aggSnap = await getDoc(doc(db, 'aggregated', 'games'));
    if (aggSnap.exists()) {
      const gamesList = (aggSnap.data().data || []) as any[];
      const patched = gamesList.map((g: any) => (!g.authorId ? { ...g, authorId: user.uid, authorTeamId: currentUserTeamId || '' } : g));
      await updateDoc(doc(db, 'aggregated', 'games'), { data: patched });
    }
    // Refresh local state
    await loadGlobalData();
    return updated;
  };

  const handleAddTeam = async (name: string) => {
    try {
      const docRef = await addDoc(collection(db, 'teams'), { name, createdAt: serverTimestamp() });
      await updateDoc(doc(db, 'aggregated', 'teams'), { data: arrayUnion({ id: docRef.id, name }) });
      setTeams(prev => [...prev, { id: docRef.id, name, createdAt: new Date() } as Team].sort((a, b) => String(a.name).localeCompare(String(b.name))));
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'teams');
      return null;
    }
  };

  const handleEditTeamEmails = async (id: string, emails: string[]) => {
    try {
      const teamRef = doc(db, 'teams', id);
      await updateDoc(teamRef, { emails });
      const t = teams.find(tm => tm.id === id);
      if (t) {
        // Safe read-filter-write pattern for aggregated
        const aggSnap = await getDoc(doc(db, 'aggregated', 'teams'));
        if (aggSnap.exists()) {
          const arr = (aggSnap.data().data || []) as any[];
          const updated = arr.map(a => a.id === id ? { ...a, emails } : a);
          await updateDoc(doc(db, 'aggregated', 'teams'), { data: updated });
        }
      }
      setTeams(prev => prev.map(tm => tm.id === id ? { ...tm, emails } : tm));
      toast.success(`Team access emails updated.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'teams');
    }
  };

  const handleAddSeason = async (name: string, league: string, year: string, description: string) => {
    try {
      const docRef = await addDoc(collection(db, 'seasons'), { name, league, year, description, createdAt: serverTimestamp() });
      await updateDoc(doc(db, 'aggregated', 'seasons'), { data: arrayUnion({ id: docRef.id, name, league, year, description }) });
      setSeasons(prev => [...prev, { id: docRef.id, name, league, year, description, createdAt: new Date() } as Season].sort((a, b) => String(a.name).localeCompare(String(b.name))));
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'seasons');
      return null;
    }
  };

  const handleAddGlobalPlayer = async (firstName: string, lastName: string, preferredName?: string, nickname?: string) => {
    try {
      const docRef = await addDoc(collection(db, 'players'), { firstName, lastName, preferredName: preferredName || '', nickname: nickname || '', createdAt: serverTimestamp() });
      const aggregatedData = { id: docRef.id, firstName: firstName || '', lastName: lastName || '', preferredName: preferredName || '', nickname: nickname || '' };
      await updateDoc(doc(db, 'aggregated', 'players'), { data: arrayUnion(aggregatedData) });
      setAllPlayers(prev => [...prev, { id: docRef.id, firstName, lastName, preferredName, nickname, createdAt: new Date() } as Player].sort((a, b) => String(a.firstName + ' ' + a.lastName).localeCompare(String(b.firstName + ' ' + b.lastName))));
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'players');
      return null;
    }
  };

  const handleAddPlayerToRoster = async (rosterId: string, playerId: string, number: string) => {
    try {
      await setDoc(doc(db, 'rosters', rosterId, 'players', playerId), {
        playerId,
        number,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `rosters/${rosterId}/players`);
    }
  };

  const handleRemovePlayerFromRoster = async (rosterId: string, playerId: string) => {
    try {
      await deleteDoc(doc(db, 'rosters', rosterId, 'players', playerId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rosters/${rosterId}/players/${playerId}`);
    }
  };

  const handleCreateRoster = async (teamId: string, seasonId: string) => {
    try {
      // Check if roster already exists
      const q = query(collection(db, 'rosters'), where('teamId', '==', teamId), where('seasonId', '==', seasonId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs[0].id; // Roster exists organically
      }

      const docRef = await addDoc(collection(db, 'rosters'), {
        teamId,
        seasonId,
        createdAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'rosters');
      return null;
    }
  };

  const handleDeleteTeam = async (id: string) => {
    const relatedGames = statsGames.filter(g => g.homeTeamId === id || g.awayTeamId === id);
    const relatedVideos = statsVideos.filter(v => relatedGames.some(g => g.id === v.gameId));
    let relatedEvents = 0;
    for (const v of relatedVideos) {
      const snap = await getDocs(query(collection(db, 'gameEvents', v.gameId)));
      // Note: tracking events are strictly locked to the video. Finding exact sums requires deeper inspection or trust.
      // But we know deleting the game deletes ALL the game's events anyway!
    }

    if (!confirm(`Delete this Team? WARNING: This will permanently destroy ${relatedGames.length} connected Games and ${relatedVideos.length} connected Videos attached to them, along with ALL their recorded events. Proceed?`)) return;

    try {
      const deletedTeam = teams.find(t => t.id === id);
      await deleteDoc(doc(db, 'teams', id));
      if (deletedTeam) {
        await updateDoc(doc(db, 'aggregated', 'teams'), { data: arrayRemove({ id: deletedTeam.id, name: deletedTeam.name || '' }) });
      }

      // Cascade Delete Games
      for (const g of relatedGames) {
        const oldAgg = { id: g.id, seasonId: g.seasonId || '', homeTeamId: g.homeTeamId || '', awayTeamId: g.awayTeamId || '', isVerified: g.isVerified || false, createdAt: serializeTimestamp(g.createdAt) };
        await deleteDoc(doc(db, 'games', g.id));
        await updateDoc(doc(db, 'aggregated', 'games'), { data: arrayRemove(oldAgg) }).catch(() => { });
        await deleteDoc(doc(db, 'gameEvents', g.id)); // Destroys all events tied to the game
      }

      // Cascade Delete Videos (they are orphans now)
      for (const v of relatedVideos) {
        const oldAgg = { id: v.id, gameId: v.gameId, videoId: v.videoId, youtubeId: v.youtubeId || '', title: v.title || '', createdAt: serializeTimestamp(v.createdAt) };
        await deleteDoc(doc(db, 'videos', v.id));
        await updateDoc(doc(db, 'aggregated', 'videos'), { data: arrayRemove(oldAgg) }).catch(() => { });
      }

      toast.success('Team and all connected dependencies wiped');
      loadGlobalData();
    } catch (error) { handleFirestoreError(error, OperationType.DELETE, 'teams'); }
  };

  const handleDeleteGame = async (id: string, tagParam?: string | null) => {
    const shortId = id.length > 16 ? id.substring(0, 16) + '…' : id;
    const isTargetedType = tagParam !== undefined;
    const typed = prompt(
      `⚠️ DESTRUCTIVE ACTION ⚠️\n\nThis will permanently delete:\n• Game List Entry: ${id}${isTargetedType ? `\n• Specific Tag Version: "${tagParam || '(empty)'}"` : ''}\n\nType "${shortId}" to confirm:`
    );
    if (!typed || typed.trim() !== shortId) {
      toast.info('Deletion cancelled.');
      return;
    }

    try {
      let isLastArrayEntry = true;
      const aggGamesSnap = await getDoc(doc(db, 'aggregated', 'games'));
      if (aggGamesSnap.exists()) {
        const currentData = (aggGamesSnap.data().data || []) as any[];
        
        let removedFound = false;
        const filtered = currentData.filter((g: any) => {
          if (g.id !== id) return true; // Keep other games
          
          if (!removedFound && isTargetedType && g.tag === tagParam) {
            removedFound = true; // Delete exactly one target from this tag copy
            return false;
          } else if (!isTargetedType) {
            return false; // Wipe the whole ID
          }
          return true; // Keep duplicates 
        });

        isLastArrayEntry = !filtered.some(g => g.id === id);
        await updateDoc(doc(db, 'aggregated', 'games'), { data: filtered });
      }

      // If it's the last array entry, or we wanted to wipe the whole ID, nuke the document.
      if (isLastArrayEntry || !isTargetedType) {
        await deleteDoc(doc(db, 'games', id));
      }

      toast.success(isLastArrayEntry || !isTargetedType ? 'Game deleted completely' : 'Duplicate Game list entry deleted successfully');
      loadGlobalData();
    } catch (error) { handleFirestoreError(error, OperationType.DELETE, 'games'); }
  };

  const handleDeleteVideo = async (id: string) => {
    const v = videos.find(v => v.id === id);
    if (!v) return;
    const relatedEventsCount = statsEvents.filter(e => e.videoId === v.id).length;

    if (!confirm(`Delete this Video? WARNING: This will permanently destroy all ${relatedEventsCount} statistical events attached uniquely to this video clip. Proceed?`)) return;

    try {
      const oldAgg = { id: v.id, gameId: v.gameId, videoId: v.videoId, youtubeId: v.youtubeId || '', title: v.title || '', createdAt: serializeTimestamp(v.createdAt) };
      await deleteDoc(doc(db, 'videos', id));
      await updateDoc(doc(db, 'aggregated', 'videos'), { data: arrayRemove(oldAgg) }).catch(() => { });

      // Safe pull and filter for event sub-documents
      const gameEventsRef = doc(db, 'gameEvents', v.gameId);
      const snap = await getDoc(gameEventsRef);
      if (snap.exists() && snap.data().events) {
        const safeEvents = snap.data().events.filter((e: any) => e.videoId !== id);
        await setDoc(gameEventsRef, { events: safeEvents });
      }

      toast.success('Video and events cleanly wiped');
      loadGlobalData();
    } catch (error) { handleFirestoreError(error, OperationType.DELETE, 'videos'); }
  };

  const handleDeleteSeason = async (id: string) => {
    try {
      const deletedSeason = seasons.find(s => s.id === id);
      await deleteDoc(doc(db, 'seasons', id));
      if (deletedSeason) {
        await updateDoc(doc(db, 'aggregated', 'seasons'), { data: arrayRemove({ id: deletedSeason.id, name: deletedSeason.name || '', league: deletedSeason.league || '', year: deletedSeason.year || '', description: deletedSeason.description || '' }) });
      }
    } catch (error) { handleFirestoreError(error, OperationType.DELETE, 'seasons'); }
  };

  const handleEditSeason = async (id: string, newName: string, newLeague: string, newYear: string, newDescription: string) => {
    try {
      const oldSeason = seasons.find(s => s.id === id);
      if (!oldSeason) return;
      await updateDoc(doc(db, 'seasons', id), { name: newName, league: newLeague, year: newYear, description: newDescription });

      const oldAgg = { id: oldSeason.id, name: oldSeason.name || '', league: oldSeason.league || '', year: oldSeason.year || '', description: oldSeason.description || '' };
      const newAgg = { ...oldAgg, name: newName, league: newLeague, year: newYear, description: newDescription };

      await updateDoc(doc(db, 'aggregated', 'seasons'), { data: arrayRemove(oldAgg) }).catch(() => { });
      await updateDoc(doc(db, 'aggregated', 'seasons'), { data: arrayUnion(newAgg) }).catch(() => { });

      loadGlobalData();
      toast.success("Season Championship details updated successfully");
    } catch (error) { handleFirestoreError(error, OperationType.WRITE, 'seasons'); }
  };

  const handleDeletePlayer = async (id: string) => {
    try {
      const deletedPlayer = allPlayers.find(p => p.id === id);
      await deleteDoc(doc(db, 'players', id));
      if (deletedPlayer) {
        const aggregatedData = { id: deletedPlayer.id, firstName: deletedPlayer.firstName || '', lastName: deletedPlayer.lastName || '', preferredName: deletedPlayer.preferredName || '', nickname: deletedPlayer.nickname || '' };
        await updateDoc(doc(db, 'aggregated', 'players'), { data: arrayRemove(aggregatedData) });
      }
    } catch (error) { handleFirestoreError(error, OperationType.DELETE, 'players'); }
  };

  const handleEditPlayer = async (id: string, newFirst: string, newLast: string) => {
    try {
      const oldPlayer = allPlayers.find(p => p.id === id);
      if (!oldPlayer) return;
      await updateDoc(doc(db, 'players', id), { firstName: newFirst, lastName: newLast });

      const oldAgg = { id: oldPlayer.id, firstName: oldPlayer.firstName || '', lastName: oldPlayer.lastName || '', preferredName: oldPlayer.preferredName || '', nickname: oldPlayer.nickname || '' };
      const newAgg = { ...oldAgg, firstName: newFirst, lastName: newLast };

      await updateDoc(doc(db, 'aggregated', 'players'), { data: arrayRemove(oldAgg) }).catch(() => { });
      await updateDoc(doc(db, 'aggregated', 'players'), { data: arrayUnion(newAgg) }).catch(() => { });

      setAllPlayers(prev => prev.map(p => p.id === id ? { ...p, firstName: newFirst, lastName: newLast } : p).sort((a, b) => String(a.firstName + ' ' + a.lastName).localeCompare(String(b.firstName + ' ' + b.lastName))));
      toast.success("Player updated successfully");
    } catch (error) { handleFirestoreError(error, OperationType.WRITE, 'players'); }
  };

  const handleAddRole = async (email: string, tier: 'authors' | 'trusted' | 'moderators') => {
    if (effectiveRole !== 'trusted') {
      toast.error("You don't have permission to modify roles.");
      return;
    }
    const currentList = tier === 'authors' ? userRoles.authors : tier === 'trusted' ? userRoles.trusted : userRoles.moderators;
    if (currentList.includes(email)) return;

    try {
      const dbRef = doc(db, 'appConfig', 'roles');
      const snap = await getDoc(dbRef);
      if (!snap.exists()) {
        await setDoc(dbRef, { authors: [], trusted: [], moderators: [] });
      }

      await updateDoc(dbRef, { [tier]: arrayUnion(email) });
      setUserRoles(prev => ({ ...prev, [tier]: [...(prev[tier] as string[]), email] }));
      toast.success(`Role assigned to ${email}`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to assign role');
    }
  };

  const handleRemoveRole = async (email: string, tier: 'authors' | 'trusted' | 'moderators') => {
    if (effectiveRole !== 'trusted') {
      toast.error("You don't have permission to modify roles.");
      return;
    }
    try {
      const dbRef = doc(db, 'appConfig', 'roles');
      await updateDoc(dbRef, { [tier]: arrayRemove(email) });
      setUserRoles(prev => ({ ...prev, [tier]: (prev[tier] as string[]).filter(e => e !== email) }));
      toast.success(`Role removed for ${email}`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to revoke role');
    }
  };

  const handleUpdateRecordEvent = async (eventId: string, updates: Partial<GameEvent>) => { };

  const handleDeleteRoster = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'rosters', id));
    } catch (error) { handleFirestoreError(error, OperationType.DELETE, 'rosters'); }
  };

  const handleVote = async (eventId: string, isAccurate: boolean) => {
    if (!currentVideo) return;

    // Optimistic local update
    setEvents(prev => prev.map(e => {
      if (e.id !== eventId) return e;
      let upvoters = [...(e.upvoterIds || [])];
      let downvoters = [...(e.downvoterIds || [])];
      const hadUpvote = upvoters.includes(voterId);
      const hadDownvote = downvoters.includes(voterId);
      const oldVote = hadUpvote ? true : hadDownvote ? false : null;
      upvoters = upvoters.filter(id => id !== voterId);
      downvoters = downvoters.filter(id => id !== voterId);
      if (oldVote !== isAccurate) {
        if (isAccurate) upvoters.push(voterId);
        else downvoters.push(voterId);
      }
      return { ...e, upvoterIds: upvoters, downvoterIds: downvoters, upvotes: upvoters.length, downvotes: downvoters.length, votes: upvoters.length - downvoters.length };
    }));

    try {
      const gameRef = doc(db, 'gameEvents', currentVideo.gameId);
      const gameSnap = await getDoc(gameRef);
      if (!gameSnap.exists()) { toast.error('Game events doc not found'); return; }

      const gameData = gameSnap.data();
      const currentEvents = (gameData.events || []) as GameEvent[];
      const eventIndex = currentEvents.findIndex(e => e.id === eventId);

      if (eventIndex === -1) { toast.error('Event not found in game doc'); return; }

      const evt = { ...currentEvents[eventIndex] };
      let upvoters = [...(evt.upvoterIds || [])];
      let downvoters = [...(evt.downvoterIds || [])];

      const hadUpvote = upvoters.includes(voterId);
      const hadDownvote = downvoters.includes(voterId);
      const oldVote = hadUpvote ? true : hadDownvote ? false : null;

      upvoters = upvoters.filter(id => id !== voterId);
      downvoters = downvoters.filter(id => id !== voterId);

      if (oldVote !== isAccurate) {
        if (isAccurate) upvoters.push(voterId);
        else downvoters.push(voterId);
      }

      evt.upvoterIds = upvoters;
      evt.downvoterIds = downvoters;
      evt.upvotes = upvoters.length;
      evt.downvotes = downvoters.length;
      evt.votes = evt.upvotes - evt.downvotes;

      currentEvents[eventIndex] = evt;

      await updateDoc(gameRef, { events: currentEvents });
    } catch (error) {
      console.error('Vote failed:', error);
      toast.error('Vote failed — check console');
    }
  };

  const handleSearchVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;

    // Robust YouTube ID extraction
    const extractYoutubeId = (url: string) => {
      if (url.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
      const patterns = [
        /(?:v=|\/v\/|embed\/|youtu\.be\/|shorts\/|\/u\/\w\/|watch\?v=)([^#&?]*)/,
        /youtube\.com\/watch\?.*v=([^#&?]*)/,
        /youtu\.be\/([^#&?]*)/
      ];
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1] && match[1].length === 11) return match[1];
      }
      return null;
    };

    const youtubeId = extractYoutubeId(searchQuery);
    if (!youtubeId) {
      toast.error("Please enter a valid YouTube URL or 11-character Video ID.");
      return;
    }

    const homeId = newVideoData.homeTeamId;
    const awayId = newVideoData.awayTeamId;
    const seasonId = newVideoData.seasonId;

    if (!homeId || !awayId || !seasonId) {
      toast.error("Please select Home Team, Away Team, and Season constraints.");
      return;
    }

    const homeName = teams.find(t => t.id === homeId)?.name || 'Home';
    const awayName = teams.find(t => t.id === awayId)?.name || 'Away';

    const gId = `game_${crypto.randomUUID()}`;
    const vId = crypto.randomUUID();

    // SET VIDEO LOCALLY FIRST — so the embed renders immediately regardless of Firestore
    const localVideo: Video = {
      id: vId, youtubeId, videoId: vId, gameId: gId,
      title: `${homeName} vs ${awayName}`, createdAt: new Date()
    } as Video;
    setCurrentVideo(localVideo);
    setIsAddingGame(false);
    setSearchQuery('');

    // Also inject local game + teams into state so scoreboard shows names immediately
    if (!games.find(g => g.id === gId)) {
      setGames(prev => [...prev, { id: gId, seasonId, homeTeamId: homeId, awayTeamId: awayId, tag: newVideoData.tag, createdAt: new Date() } as any]);
    }

    // Background Firestore sync (best-effort)
    try {
      // Check for exact existing game to safely inherit timestamp
      const gameRef = doc(db, 'games', gId);
      const gameSnap = await getDoc(gameRef);
      let gCreatedAt = new Date().toISOString();

      if (!gameSnap.exists()) {
        await setDoc(gameRef, {
          id: gId, seasonId, homeTeamId: homeId, awayTeamId: awayId, isVerified: false, createdAt: serverTimestamp(), tag: newVideoData.tag || null,
          authorId: user?.uid || '', authorTeamId: currentUserTeamId || ''
        });
      } else {
        const d = gameSnap.data();
        if (d && d.createdAt) gCreatedAt = serializeTimestamp(d.createdAt) || gCreatedAt;
      }

      // Auto-heal the Games cache safely without string duplication
      await updateDoc(doc(db, 'aggregated', 'games'), {
        data: arrayUnion({ id: gId, seasonId, homeTeamId: homeId, awayTeamId: awayId, isVerified: false, createdAt: gCreatedAt, tag: newVideoData.tag || null, authorId: user?.uid || '', authorTeamId: currentUserTeamId || '' })
      }).catch(() => { });

      // Always Provision Unique Video Document 1:1 Mapping to Game
      const vCreatedAt = new Date().toISOString();
      await setDoc(doc(db, 'videos', vId), {
        youtubeId, videoId: vId, gameId: gId,
        title: `${homeName} vs ${awayName}`, createdAt: serverTimestamp()
      });

      // Safely Update Video cache tracking
      await updateDoc(doc(db, 'aggregated', 'videos'), {
        data: arrayUnion({ id: vId, videoId: vId, youtubeId, gameId: gId, title: `${homeName} vs ${awayName}`, createdAt: vCreatedAt })
      }).catch(() => { });

      // Fetch latest arrays so the UI reacts instantly
      loadGlobalData();
      toast.success('Game and Stream initialized successfully!');
    } catch (error) {
      console.warn('Firestore sync failed (video still loaded locally):', error);
      toast.error('Warning: Backend sync failed. Game only saved locally for this session.');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate Game Time
  const gameTime = useMemo(() => {
    let totalGameTime = 0;
    let lastStartTime = -1;

    const chronologicalEvents = [...events]
      .filter(e => e.videoTime <= currentTime)
      .sort((a, b) => a.videoTime - b.videoTime);

    for (const event of chronologicalEvents) {
      if (event.type === 'gameStart') {
        lastStartTime = event.videoTime;
      } else if (event.type === 'gamePause' || event.type === 'gameEnd') {
        if (lastStartTime !== -1) {
          totalGameTime += event.videoTime - lastStartTime;
          lastStartTime = -1;
        }
      }
    }

    if (lastStartTime !== -1 && currentTime > lastStartTime) {
      totalGameTime += currentTime - lastStartTime;
    }

    return totalGameTime;
  }, [events, currentTime]);

  const enrichedEvents = useMemo(() => enrichEventsWithGameTime(events), [events]);

  const trackingYears = useMemo(() => {
    const ySet = new Set<string>();
    const gamesWithVideos = new Set(statsVideos.map(v => v.gameId));

    statsGames.forEach(g => {
      if (!gamesWithVideos.has(g.id)) return; // Exclude games without videos

      if (watchLeagueId !== 'all') {
        const s = statsSeasons.find(sea => sea.id === g.seasonId);
        if (!s || s.league !== watchLeagueId) return;
      }
      const s = statsSeasons.find(sea => sea.id === g.seasonId);
      if (s && s.name) ySet.add(s.name);
      else if (g.seasonId) ySet.add(g.seasonId);
    });
    return Array.from(ySet).sort((a, b) => b.localeCompare(a));
  }, [statsGames, statsSeasons, statsVideos, watchLeagueId]);

  const watchLeagues = useMemo(() => {
    const lSet = new Set<string>();
    statsSeasons.forEach(s => {
      if (s.league) lSet.add(s.league);
    });
    return Array.from(lSet).sort();
  }, [statsSeasons]);
  const trackingTeams = useMemo(() => {
    const tSet = new Set<string>();
    statsGames.forEach(g => {
      if (watchLeagueId !== 'all') {
        const s = statsSeasons.find(sea => sea.id === g.seasonId);
        if (!s || s.league !== watchLeagueId) return;
      }
      if (trackerYearId !== 'all') {
        const s = statsSeasons.find(sea => sea.id === g.seasonId);
        const yearStr = (s && s.name) ? s.name : g.seasonId;
        if (yearStr !== trackerYearId) return;
      }
      tSet.add(g.homeTeamId);
      tSet.add(g.awayTeamId);
    });
    return Array.from(tSet)
      .map(tid => statsTeams.find(t => t.id === tid))
      .filter((t): t is Team => !!t)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [statsGames, statsSeasons, statsTeams, trackerYearId, watchLeagueId]);

  const trackingOpponents = useMemo(() => {
    const tSet = new Set<string>();
    statsGames.forEach(g => {
      if (watchLeagueId !== 'all') {
        const s = statsSeasons.find(sea => sea.id === g.seasonId);
        if (!s || s.league !== watchLeagueId) return;
      }
      if (trackerYearId !== 'all') {
        const s = statsSeasons.find(sea => sea.id === g.seasonId);
        const yearStr = (s && s.name) ? s.name : g.seasonId;
        if (yearStr !== trackerYearId) return;
      }
      if (trackerTeamId !== 'all') {
        if (g.homeTeamId !== trackerTeamId && g.awayTeamId !== trackerTeamId) return;
        tSet.add(g.homeTeamId === trackerTeamId ? g.awayTeamId : g.homeTeamId);
      } else {
        tSet.add(g.homeTeamId);
        tSet.add(g.awayTeamId);
      }
    });
    return Array.from(tSet)
      .filter(tid => tid !== trackerTeamId)
      .map(tid => statsTeams.find(t => t.id === tid))
      .filter((t): t is Team => !!t)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [statsGames, statsSeasons, statsTeams, trackerYearId, trackerTeamId, watchLeagueId]);

  const trackingFilteredGames = useMemo(() => {
    return statsGames.filter(g => {
      if (trackerYearId !== 'all') {
        const s = statsSeasons.find(sea => sea.id === g.seasonId);
        const yearStr = (s && s.name) ? s.name : g.seasonId;
        if (yearStr !== trackerYearId) return false;
      }
      if (watchLeagueId !== 'all') {
        const s = statsSeasons.find(sea => sea.id === g.seasonId);
        if (!s || s.league !== watchLeagueId) return false;
      }
      if (trackerTeamId !== 'all') {
        if (g.homeTeamId !== trackerTeamId && g.awayTeamId !== trackerTeamId) return false;
      }
      if (trackerOpponentId !== 'all') {
        if (g.homeTeamId !== trackerOpponentId && g.awayTeamId !== trackerOpponentId) return false;
      }
      return true;
    }).map(g => {
      const hName = statsTeams.find(t => t.id === g.homeTeamId)?.name || g.homeTeamId;
      const aName = statsTeams.find(t => t.id === g.awayTeamId)?.name || g.awayTeamId;
      return { ...g, displayName: g.tag ? `${hName} vs ${aName} (${g.tag})` : `${hName} vs ${aName}` };
    });
  }, [statsGames, statsSeasons, statsTeams, trackerYearId, trackerTeamId, trackerOpponentId, watchLeagueId]);

  const verifiedTeams = useMemo(() => {
    const tSet = new Set<string>();
    statsGames.forEach(g => {
      if (!g.isVerified) return;
      if (verifiedYearId !== 'all') {
        const s = statsSeasons.find(sea => sea.id === g.seasonId);
        const yearStr = (s && s.name) ? s.name : g.seasonId;
        if (yearStr !== verifiedYearId) return;
      }
      tSet.add(g.homeTeamId);
      tSet.add(g.awayTeamId);
    });
    return Array.from(tSet)
      .map(tid => statsTeams.find(t => t.id === tid))
      .filter((t): t is Team => !!t)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [statsGames, statsSeasons, statsTeams, verifiedYearId]);

  const verifiedFilteredGames = useMemo(() => {
    return statsGames.filter(g => {
      if (!g.isVerified) return false;
      if (verifiedYearId !== 'all') {
        const s = statsSeasons.find(sea => sea.id === g.seasonId);
        const yearStr = (s && s.name) ? s.name : g.seasonId;
        if (yearStr !== verifiedYearId) return false;
      }
      if (verifiedTeamId !== 'all') {
        if (g.homeTeamId !== verifiedTeamId && g.awayTeamId !== verifiedTeamId) return false;
      }
      return true;
    }).map(g => {
      const hName = statsTeams.find(t => t.id === g.homeTeamId)?.name || g.homeTeamId;
      const aName = statsTeams.find(t => t.id === g.awayTeamId)?.name || g.awayTeamId;
      return { ...g, displayName: g.tag ? `${hName} vs ${aName} (${g.tag})` : `${hName} vs ${aName}` };
    });
  }, [statsGames, statsSeasons, statsTeams, verifiedYearId, verifiedTeamId]);

  const trackerActiveVideos = useMemo(() => {
    if (!trackerGameId && trackingFilteredGames.length === 0) return [];
    const targetId = trackerGameId || trackingFilteredGames[0]?.id;
    return statsVideos.filter(v => v.gameId === targetId);
  }, [statsVideos, trackerGameId, trackingFilteredGames]);

  const activeTrackingEvents = useMemo(() => {
    if (!currentVideo) return [];
    // CRITICAL FIX: The live 'events' websocket ALWAYS takes priority over the stale global 'statsEvents' payload.
    // If you are actively viewing a video, we want the live hook. If you just landed and the hook is booting,
    // we fallback to statsEvents only if 'events' hasn't hydrated yet!
    const source = events.length > 0 ? events : statsEvents.filter(e => e.videoId === currentVideo.id);
    // The live hook 'events' already rigorously filters to the `currentVideo.gameId` natively in the onSnapshot.
    // However, some legacy global events might trail in. We ensure strict matching here just in case.
    const filtered = source.filter(e => e.videoId === currentVideo.id);
    return enrichEventsWithGameTime(filtered);
  }, [statsEvents, events, currentVideo]);

  // Reset auto-seek when video changes
  useEffect(() => {
    hasAutoSeekedRef.current = false;
  }, [currentVideo?.id]);

  // Auto-seek to first event
  useEffect(() => {
    if (!player || activeTrackingEvents.length === 0 || hasAutoSeekedRef.current) return;
    
    let firstEventTime = Infinity;
    for (const event of activeTrackingEvents) {
      if (event.videoTime < firstEventTime) {
         firstEventTime = event.videoTime;
      }
    }

    if (firstEventTime !== Infinity && firstEventTime > 0) {
       // Seek 3 seconds before the first event to give context buffer (min 0)
       try { player.seekTo(Math.max(0, firstEventTime - 3), true); } catch(e) { }
       hasAutoSeekedRef.current = true;
    } else if (firstEventTime === 0) {
       hasAutoSeekedRef.current = true;
    }
  }, [player, activeTrackingEvents]);

  // Dynamically resolve on-field players and their active positions based on manual overrides AND chronological substitution events
  const activePlayerPositions = useMemo(() => {
    const active = new Map<string, PositionType>();
    manualActivePlayerIds.forEach(id => active.set(id, 'chaser'));

    const pastEvents = [...activeTrackingEvents]
      .filter(e => e.videoTime <= currentTime)
      .sort((a, b) => a.videoTime - b.videoTime);

    for (const e of pastEvents) {
      if (e.type === 'sub_in' && e.playerId) {
        active.set(e.playerId, (e.position as PositionType) || 'chaser');
      }
      if (e.type === 'sub_out' && e.playerId) {
        active.delete(e.playerId);
      }
    }
    return active;
  }, [manualActivePlayerIds, activeTrackingEvents, currentTime]);

  if (!isAuthReady) return <div className="min-h-screen bg-white flex items-center justify-center text-gray-900">Loading...</div>;
  if (!user && !hasSeenLanding) return <LandingHero onProceed={() => { handleBypassLanding(); setView('stats'); }} onSignIn={() => handleBypassLanding()} />;

  return (
    <div className={cn("bg-white text-gray-900 font-sans selection:bg-red-200/50", view === 'tracker' ? "h-screen overflow-hidden flex flex-col" : "min-h-screen")}>
      <Toaster position="top-right" richColors />
      {/* Header */}
      <header className={cn("border-b border-gray-200 bg-white/80 backdrop-blur-md z-50", view === 'tracker' ? "shrink-0" : "sticky top-0")}>
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/quadball-logo.svg" alt="Quadball Reference Logo" className="w-10 h-10 object-contain drop-shadow-sm" />
            <h1 className="text-xl font-bold tracking-tight text-red-900">Quadball Reference</h1>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setView(view === 'stats' ? 'tracker' : 'stats')}
              className={cn(
                "px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2",
                view === 'stats' ? "bg-red-600 text-white" : "bg-gray-50 text-gray-500 hover:text-gray-900 border border-gray-200"
              )}
            >
              <Database className="w-4 h-4" />
              Stats
            </button>
            <button
              onClick={() => setView('tracker')}
              className={cn(
                "px-4 py-2 rounded-lg font-medium transition-all hidden md:flex items-center gap-2",
                view === 'tracker' ? "bg-red-600 text-white" : "bg-gray-50 text-gray-500 hover:text-gray-900 border border-gray-200"
              )}
            >
              <Play className="w-4 h-4" />
              Watch
            </button>
            <button
              onClick={() => setView('help')}
              className={cn(
                "px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2",
                view === 'help' ? "bg-red-600 text-white" : "bg-gray-50 text-gray-500 hover:text-gray-900 border border-gray-200"
              )}
            >
              <HelpCircle className="w-4 h-4" />
              Help
            </button>

            {view === 'tracker' && isAdmin && (
              <select
                value={simulateRole}
                onChange={e => setSimulateRole(e.target.value as any)}
                className="bg-gray-50 border border-gray-200 text-gray-600 text-xs rounded-lg px-3 py-2 outline-none focus:border-red-500 font-bold"
              >
                <option value="voter">View As: Voter</option>
                <option value="author">View As: Author</option>
                <option value="moderator">View As: Moderator</option>
                <option value="trusted">View As: Trusted (Admin)</option>
              </select>
            )}

            {(effectiveRole === 'moderator' || effectiveRole === 'trusted') && (
              <button
                onClick={() => setView(view === 'create' ? 'stats' : 'create')}
                className={cn(
                  "px-4 py-2 rounded-lg font-medium transition-all hidden md:flex items-center gap-2",
                  view === 'create' ? "bg-red-600 text-white" : "bg-gray-50 text-gray-500 hover:text-gray-900 border border-gray-200"
                )}
              >
                <Plus className="w-4 h-4" />
                Create
              </button>
            )}

            {(effectiveRole === 'trusted') && (
              <button
                onClick={() => setView(view === 'manage' ? 'stats' : 'manage')}
                className={cn(
                  "px-4 py-2 rounded-lg font-medium transition-all hidden md:flex items-center gap-2",
                  view === 'manage' ? "bg-red-600 text-white" : "bg-gray-50 text-gray-500 hover:text-gray-900 border border-gray-200"
                )}
              >
                <User className="w-4 h-4" />
                Manage
              </button>
            )}
            {user ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-full border border-gray-200">
                  <img src={user.photoURL || ''} alt="" className="w-6 h-6 rounded-full bg-gray-100" referrerPolicy="no-referrer" />
                  <span className="text-sm font-medium">{user.displayName}</span>
                </div>
                <button onClick={logOut} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <LogOut className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            ) : (
              <button onClick={signIn} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-all active:scale-95">
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={cn("mx-auto transition-all w-full", (view === 'tracker' && currentVideo) ? "max-w-[100vw] px-2 py-2 flex-1 min-h-0 flex flex-col" : "max-w-7xl px-4 py-8")}>
        {view === 'help' ? (
          <div className="bg-white rounded-xl shadow-sm border p-8 max-w-4xl mx-auto space-y-10">
            <div className="mb-12">
              <h2 className="text-3xl font-extrabold border-b pb-4 text-gray-900 mb-6">How to Watch a Game</h2>
              <div className="space-y-4 text-gray-700 leading-relaxed text-sm">
                <p>While watching a video, <strong>Events</strong> show the events that happen during the game. For spectators, that's where they can upvote and downvote events. For signed-in users, they will have a <strong>Record</strong> tab where they can (optionally) record the various game events that happen. Adding events to the proper timestamp of the video will ensure stats are calculated accurately.</p>
                <p>Anyone can add any amount of events, and they will be accessible globally<span className="text-red-500">*</span>. It isn't important to get everything done, just that any event added is accurate.</p>
                <p>The <strong>GameCast</strong> tab shows the various events in a more condensed format. The <strong>Players</strong> tab shows the players on each team. Each player's basic performance is shown under their name.</p>
                <p>For authors, the Players tab also allows for a different way to add stats. Clicking on a name pops up a quick access to recording an event. Dragging and dropping allows for substitutions as well.</p>
              </div>
              <p className="italic text-xs text-gray-500 mt-4"><span className="text-red-500">*</span>current season stats are hidden on aggregate tab</p>
            </div>

            <div className="mb-12">
              <h2 className="text-3xl font-extrabold border-b pb-4 text-gray-900 mb-6">Become an Author</h2>
              <div className="space-y-4 text-gray-700 leading-relaxed text-sm">
                <p>Just... sign in. That's it. Any stat you author becomes public<span className="text-red-500">*</span>. They get aggregated on the "pending" tab, but will move to verified after receiving enough votes.</p>
              </div>
            </div>

            <div className="mb-12">
              <h2 className="text-3xl font-extrabold border-b pb-4 text-gray-900 mb-6">Add A Game</h2>
              <div className="space-y-4 text-gray-700 leading-relaxed text-sm">
                <p>After signing in, authors can add videos from the Watch tab. Adding a new video is the first step in tracking stats for a game. Once added, any author can add events for verification.</p>
              </div>
            </div>

            <div className="mb-12">
              <h2 className="text-3xl font-extrabold border-b pb-4 text-gray-900 mb-6">Appendix</h2>
              <div className="space-y-6 text-gray-700 leading-relaxed text-sm">
                <div>
                  <h3 className="font-bold text-gray-900 border-b pb-1 mb-2">Quadball Possessions</h3>
                  <p>Every possession ends in either a <strong>shot</strong>, <strong>goal</strong>, or <strong>turnover</strong> by the offense. Shots and goals are assigned to individuals. Turnovers <em>can</em> be assigned to individuals, but that should be reserved for turnover-worthy plays. It is too difficult to truly assign a turnover, so leaving it to the team in general will still allow it to be used in some stats (TOV%, for example).</p>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 border-b pb-1 mb-2">Subbing</h3>
                  <p>Sub In players before the first whistle, and that's enough. As players sub in and out, you can use the sub out option to replace players on pitch more quickly. You can also sub players on the Players tab.</p>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 border-b pb-1 mb-2">Control</h3>
                  <p>Marking dodgeball control between home and away teams helps track beater and team-wide contextual stats. Control changes do not have a player associated with it. It is too difficult to discern who is "responsible" in the complex interplay of the game.</p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-3xl font-extrabold border-b pb-4 text-gray-900 mb-6">Statistics Glossary</h2>
              <p className="text-gray-500">Definitions for all statistics recorded and calculated in Quadball Reference.</p>
            </div>

            <section>
              <h3 className="text-2xl font-bold mb-4 text-red-800 flex items-center gap-2"><Trophy className="w-6 h-6" /> Quadball (Chasers & Keepers)</h3>

              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-gray-900 uppercase tracking-widest text-sm mb-2 opacity-70 border-b pb-1">Basic Stats</h4>
                  <ul className="space-y-3 text-sm text-gray-700">
                    <li><strong className="text-gray-900 w-16 inline-block">GP</strong> Games Played.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">MIN</strong> Total Minutes Played.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">S</strong> Total Shots attempted (Goals + Misses).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">G</strong> Total Goals scored (10 points each).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">A</strong> Assists (Passes leading directly to a goal).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">TO</strong> Turnovers (Loss of offensive possession without a shot).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">A:TO</strong> Ratio of Assists to Turnovers.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">S%</strong> Shooting Percentage (Goals divided by Total Shots).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">CTRL%</strong> Team Bludger Control Percentage while this player is on the field.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold text-gray-900 uppercase tracking-widest text-sm mb-2 opacity-70 border-b pb-1">Advanced Stats</h4>
                  <ul className="space-y-3 text-sm text-gray-700">
                    <li><strong className="text-gray-900 w-16 inline-block">+</strong> Plus (Total goals scored by the team while the player is on).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">−</strong> Minus (Total goals conceded by the team while the player is on).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">+/−</strong> Plus/Minus (Net differential: Plus minus Minus).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">+:−</strong> Plus:Minus Ratio (Team goals scored divided by Team goals conceded while on field).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">Off +:−</strong> Plus:Minus Ratio for the team when this player is NOT on the field.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">REL +:−</strong> Relative Value (The player's +:− divided by the Off +:−). Measures individual impact relative to the rest of the team.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">G/20</strong> Goals scored per 20 minutes played.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">A/20</strong> Assists recorded per 20 minutes played.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">PTS/20</strong> Points (Goals + Assists) per 20 minutes played.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">G/G</strong> Average Goals per Game played.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">A/G</strong> Average Assists per Game played.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">PTS/G</strong> Average Points per Game played.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold text-gray-900 uppercase tracking-widest text-sm mb-2 opacity-70 border-b pb-1">Team Impact</h4>
                  <ul className="space-y-3 text-sm text-gray-700">
                    <li><strong className="text-gray-900 w-16 inline-block">ORTG</strong> Offensive Rating (Team points scored per 100 offensive possessions while on field).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">DRTG</strong> Defensive Rating (Team points conceded per 100 defensive possessions while on field).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">NET</strong> Net Rating (ORTG - DRTG).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">TOV%</strong> Team Turnover Rate (Team Turnovers per possession while on field).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">FTOV%</strong> Forced Turnover Rate (Opponent Turnovers per possession while on field).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">USG%</strong> Usage Rate (Estimates percentage of team possessions a player is involved in while playing).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">GmSc</strong> Game Score (Composite single-number rating of productivity based on basic counting stats).</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-2xl font-bold mb-4 text-purple-800 flex items-center gap-2"><Target className="w-6 h-6" /> Beaters (Pairs & Solo)</h3>
              <div className="space-y-3 text-sm text-gray-700">
                <ul className="space-y-3 text-sm text-gray-700 relative pl-1">
                  <li><strong className="text-gray-900 w-20 inline-block">GP</strong> Games Played.</li>
                  <li><strong className="text-gray-900 w-20 inline-block">+</strong> Goals scored by the team while this beater/pair was active.</li>
                  <li><strong className="text-gray-900 w-20 inline-block">−</strong> Goals conceded by the team while this beater/pair was active.</li>
                  <li><strong className="text-gray-900 w-20 inline-block">+/−</strong> Point differential while this beater/pair was active.</li>
                  <li><strong className="text-gray-900 w-20 inline-block">CTRL</strong> Control Minutes. Minutes the team held dodgeball control while on field.</li>
                  <li><strong className="text-gray-900 w-20 inline-block">TOT</strong> Total game-clock minutes played for this pair or individual.</li>
                  <li><strong className="text-gray-900 w-20 inline-block">CTRL%</strong> Percentage of possession time the team maintained dodgeball control.</li>
                  <li><strong className="text-gray-900 w-20 inline-block">+:−</strong> Ratio of Plus to Minus.</li>
                  <li><strong className="text-gray-900 w-20 inline-block">Off+:−</strong> Ratio of Plus to Minus while this beater/pair is off the field.</li>
                  <li><strong className="text-gray-900 w-20 inline-block">REL +:−</strong> Relative Value (The plus-minus ratio compared to the off-field ratio).</li>
                </ul>
              </div>
            </section>
          </div>
        ) : view === 'manage' ? (
          <ManagementView
            teams={teams}
            seasons={seasons}
            players={allPlayers}
            videos={videos}
            games={games}
            onAddTeam={handleAddTeam}
            onAddSeason={handleAddSeason}
            onAddPlayer={handleAddGlobalPlayer}
            onAddPlayerToRoster={handleAddPlayerToRoster}
            onRemovePlayerFromRoster={handleRemovePlayerFromRoster}
            onCreateRoster={handleCreateRoster}
            onEditTeamEmails={handleEditTeamEmails}
            onDeleteTeam={handleDeleteTeam}
            onDeleteGame={handleDeleteGame}
            onDeleteVideo={handleDeleteVideo}
            onDeleteSeason={handleDeleteSeason}
            onEditSeason={handleEditSeason}
            onDeletePlayer={handleDeletePlayer}
            onEditPlayer={handleEditPlayer}
            onDeleteRoster={handleDeleteRoster}
            onRefreshData={loadGlobalData}
            onRunMigration={handleRunMigration}
            onBackfillAuthorId={handleBackfillAuthorId}
            isAdmin={isAdmin}
            onAddRole={handleAddRole}
            onRemoveRole={handleRemoveRole}
            userRoles={userRoles}
            onSetLocalSimulation={(data) => {
              setDemoData(data);
              setView('stats');
            }}
          />
        ) : view === 'create' ? (
          <CreateView
            teams={teams}
            seasons={seasons}
            players={allPlayers}
            onAddTeam={handleAddTeam}
            onAddPlayer={handleAddGlobalPlayer}
            onAddPlayerToRoster={handleAddPlayerToRoster}
            onRemovePlayerFromRoster={handleRemovePlayerFromRoster}
            onCreateRoster={handleCreateRoster}
            onDeleteRoster={handleDeleteRoster}
          />
        ) : view === 'review' ? (
          <div className="-mx-4 px-4 -mt-8 pt-6 pb-8 min-h-[80vh]">
            <GameCastView players={statsPlayers} events={statsEvents} teams={statsTeams} games={statsGames} />
          </div>
        ) : view === 'stats' ? (
          <div className="-mx-4 px-4 -mt-8 pt-6 pb-8 min-h-[80vh]">
            {/* Data source indicator */}
            <div className="flex items-center gap-3 mb-2 text-[10px] font-mono text-gray-400">
              <span className={demoData ? 'text-amber-500' : 'text-green-500'}>● {demoData ? 'Demo CSV' : 'Firestore'}</span>
              <span>{statsEvents.length.toLocaleString()} events{statsFilter === 'verified' ? ' (verified)' : ''}</span>
              <span>{statsPlayers.length} players</span>
              <span>{statsGames.length} games</span>
              <span>{statsTeams.length} teams</span>
              <span>{statsSeasons.length} seasons</span>
              <button
                onClick={() => {
                  loadGlobalData();
                  if (view === 'stats' || view === 'review') {
                    setEventsLoaded(false);
                    loadAllEvents();
                  }
                  toast.success('Refreshing data...');
                }}
                className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-500 transition-colors"
                id="refresh-btn"
              >
                ↻ Refresh
              </button>
            </div>
            {/* Stats toolbar */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center border border-gray-200 rounded-md overflow-hidden w-fit bg-white text-xs">
                <button onClick={() => setStatsSubView('quadball')}
                  className={cn('px-3 py-1.5 font-medium transition-colors',
                    statsSubView === 'quadball' ? 'bg-white text-green-600' : 'text-gray-500 hover:bg-gray-50')}>
                  Quadball
                </button>
                <button onClick={() => setStatsSubView('beaters')}
                  className={cn('px-3 py-1.5 font-medium transition-colors border-l border-gray-200',
                    statsSubView === 'beaters' ? 'bg-neutral-900 text-white' : 'text-gray-500 hover:bg-gray-50')}>
                  Dodgeball
                </button>
                <button onClick={() => setStatsSubView('seekers')}
                  className={cn('px-3 py-1.5 font-medium transition-colors border-l border-gray-200',
                    statsSubView === 'seekers' ? 'bg-yellow-400 text-black' : 'text-gray-500 hover:bg-gray-50')}>
                  Flag
                </button>
              </div>
              <div className="flex border rounded-lg bg-gray-50 overflow-hidden text-xs font-bold shadow-sm">
                {(['verified', 'all'] as const).map(option => (
                  <button
                    key={option}
                    onClick={() => setStatsFilter(option)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 transition-all outline-none',
                      statsFilter === option ? (option === 'verified' ? 'bg-amber-500/10 text-amber-600 shadow-sm border border-amber-500/30' : 'bg-white shadow-sm border border-gray-200 text-gray-800') : 'text-gray-400 hover:text-gray-600 border border-transparent hover:bg-white/50'
                    )}
                  >
                    {option === 'verified' && <ShieldCheck className="w-3.5 h-3.5" />}
                    {option === 'all' ? 'Pending' : 'Verified Only'}
                  </button>
                ))}
              </div>
            </div>

            {/* Shared Filters component */}
            <StatsFilters
              viewType={statsSubView as 'quadball' | 'beaters' | 'seekers'}
              seasonId={statsSeasonId} onSeasonChange={setStatsSeasonId}
              teamId={statsTeamId} onTeamChange={setStatsTeamId}
              seasons={filteredDropdownSeasons} teams={filteredDropdownTeams}
              search={statsSearch} onSearchChange={setStatsSearch}
              minGames={statsMinGames} onMinGamesChange={setStatsMinGames}
              bludgerControlMode={bludgerControlMode} onBludgerControlModeChange={setBludgerControlMode}
              flagFilter={statsFlagFilter} onFlagFilterChange={setStatsFlagFilter}
              outlierFilter={statsOutlierFilter} onOutlierFilterChange={setStatsOutlierFilter}
              positionFilter={statsSubView === 'quadball' ? statsPositionFilter : undefined}
              onPositionFilterChange={statsSubView === 'quadball' ? setStatsPositionFilter : undefined}
            />

            {!hasPrivilegedStatsAccess && currentSeasonId && (
              <div className="bg-amber-50/80 border border-amber-200/60 rounded-xl p-3 text-xs text-amber-800 flex items-start sm:items-center shadow-sm mb-4">
                <ShieldCheck className="w-5 h-5 text-amber-500 mr-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                <div><span className="font-bold">Current Season Protected.</span> The aggregated analytics below do not include data from the ongoing season. If you are an author or verified team member, log in to securely access current season analytics.</div>
              </div>
            )}

            {statsSubView === 'quadball' ? (
              <QuadballStatsView
                players={statsPlayers}
                events={dashboardEvents}
                teams={statsTeams}
                games={dashboardGames}
                seasons={statsSeasons}
                statsFilter={statsFilter}
                seasonId={statsSeasonId}
                teamId={statsTeamId}
                search={statsSearch}
                minGames={statsMinGames}
                bludgerControlMode={bludgerControlMode}
                flagFilter={statsFlagFilter}
                outlierFilter={statsOutlierFilter}
                positionFilter={statsPositionFilter}
                onPlayerSelect={handlePlayerProfileClick}
                onTeamSelect={handleTeamProfileClick}
              />
            ) : statsSubView === 'beaters' ? (
              <BeaterStatsView
                players={statsPlayers}
                events={dashboardEvents}
                teams={statsTeams}
                games={dashboardGames}
                seasons={statsSeasons}
                statsFilter={statsFilter}
                seasonId={statsSeasonId}
                teamId={statsTeamId}
                search={statsSearch}
                minGames={statsMinGames}
                bludgerControlMode={bludgerControlMode}
                flagFilter={statsFlagFilter}
                outlierFilter={statsOutlierFilter}
                onPlayerSelect={handlePlayerProfileClick}
                onTeamSelect={handleTeamProfileClick}
              />
            ) : statsSubView === 'seekers' ? (
              <SeekerStatsView
                players={statsPlayers}
                events={dashboardEvents}
                teams={statsTeams}
                games={dashboardGames}
                seasons={statsSeasons}
                statsFilter={statsFilter}
                seasonId={statsSeasonId}
                teamId={statsTeamId}
                search={statsSearch}
                minGames={statsMinGames}
                bludgerControlMode={bludgerControlMode}
                flagFilter={statsFlagFilter}
                onPlayerSelect={handlePlayerProfileClick}
              />
            ) : null}
          </div>
        ) : view === 'playerProfile' && activePlayerId ? (
          <PlayerProfileView
            players={statsPlayers} events={dashboardEvents} games={dashboardGames} seasons={statsSeasons} teams={statsTeams}
            activePlayerId={activePlayerId}
            onBack={popProfile}
            onTeamSelect={handleTeamProfileClick}
            onGameSelect={handleGameProfileClick}
          />
        ) : view === 'teamProfile' && activeTeamId ? (
          <TeamProfileView
            players={statsPlayers} events={dashboardEvents} games={dashboardGames} seasons={statsSeasons} teams={statsTeams}
            activeTeamId={activeTeamId}
            onBack={popProfile}
            onPlayerSelect={handlePlayerProfileClick}
            onGameSelect={handleGameProfileClick}
          />
        ) : view === 'gameProfile' && activeGameId ? (
          <GameBoxScoreView
            players={statsPlayers} events={statsEvents} games={statsGames} seasons={statsSeasons} teams={statsTeams}
            activeGameId={activeGameId}
            onBack={popProfile}
            onPlayerSelect={handlePlayerProfileClick}
            onTeamSelect={handleTeamProfileClick}
          />
        ) : !currentVideo ? (
          <div className="max-w-[1400px] mx-auto mt-8 px-4 pb-12">

            <div className="flex flex-col xl:flex-row gap-6 w-full items-start">

              {/* Unified Video List */}
              <div className="xl:w-2/3 w-full bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden p-6 flex flex-col">
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3"><Play className="w-5 h-5 text-gray-400" /> Watch and Contribute</h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 shrink-0 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 block">League</span>
                    <select
                      value={watchLeagueId}
                      onChange={e => { setWatchLeagueId(e.target.value); setTrackerYearId('all'); setTrackerTeamId('all'); setTrackerOpponentId('all'); setTrackerGameId(''); }}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-red-500 font-medium"
                    >
                      <option value="all">All Leagues</option>
                      {watchLeagues.map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 block">Season</span>
                    <select
                      value={trackerYearId}
                      onChange={e => { setTrackerYearId(e.target.value); setTrackerTeamId('all'); setTrackerOpponentId('all'); setTrackerGameId(''); }}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-red-500 font-medium"
                    >
                      <option value="all">All Seasons</option>
                      {trackingYears.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 block">Team</span>
                    <select
                      value={trackerTeamId}
                      onChange={e => { setTrackerTeamId(e.target.value); setTrackerOpponentId('all'); setTrackerGameId(''); }}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-red-500 font-medium"
                    >
                      <option value="all">All Teams</option>
                      {trackingTeams.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5 flex-1 min-h-[400px] max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                  {trackingFilteredGames.map(g => {
                    const acts = statsVideos.filter(v => v.gameId === g.id);
                    if (acts.length === 0) return null;

                    const isVerified = g.isVerified;
                    return acts.map((vid, idx) => (
                      <button
                        key={`${g.id}_${vid.id}_${idx}`}
                        onClick={() => setCurrentVideo(vid)}
                        className={cn(
                          "w-full py-2 px-3 border rounded-lg flex items-center gap-3 transition-all text-left hover:bg-gray-100",
                          isVerified
                            ? "bg-amber-50/20 border-amber-200/50 hover:border-amber-300 hover:bg-amber-100/30"
                            : "bg-white border-transparent hover:border-gray-300"
                        )}
                      >
                        <div className={cn("w-14 h-10 bg-black rounded overflow-hidden flex-shrink-0 border", isVerified ? "border-amber-200/50" : "border-gray-200")}>
                          <img src={`https://img.youtube.com/vi/${vid.youtubeId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover opacity-90 transition-opacity" referrerPolicy="no-referrer" />
                        </div>
                        <div className="flex-1 min-w-0 flex items-center justify-between">
                          <div className="min-w-0 pr-4">
                            <p className={cn("font-bold text-sm leading-tight truncate transition-colors", isVerified ? "text-gray-900" : "text-gray-800")}>{g.displayName}</p>
                            {g.tag && <p className={cn("text-[10px] font-normal truncate mt-0.5", isVerified ? "text-amber-700/60" : "text-gray-500")}>{g.tag}</p>}
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className={cn("text-[11px] flex items-center gap-1 font-medium", isVerified ? "text-amber-600/80" : "text-gray-500")}>
                                <Clock className="w-3 h-3" />
                                {new Date(vid.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {isVerified && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 uppercase tracking-wider">
                                <ShieldCheck className="w-3 h-3" />
                                Verified
                              </span>
                            )}
                            <ChevronRight className={cn("w-4 h-4", isVerified ? "text-amber-300" : "text-gray-300")} />
                          </div>
                        </div>
                      </button>
                    ));
                  })}

                  {trackingFilteredGames.length === 0 && (
                    <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 flex flex-col justify-center items-center">
                      <Database className="w-10 h-10 text-gray-300 mb-3" />
                      <p className="text-gray-500 font-medium">No videos match your selected filters.</p>
                      <button onClick={() => { setWatchLeagueId('all'); setTrackerYearId('all'); setTrackerTeamId('all'); }} className="mt-3 text-sm text-red-600 font-bold hover:underline">Clear Filters</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Start New Video */}
              {['author', 'trusted'].includes(effectiveRole) && (
                <div className="xl:w-1/3 w-full bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden sticky top-6">
                  <div className="bg-gray-50/50 border-b border-gray-100 p-5">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Play className="w-4 h-4 text-red-600" /> Add New Video</h3>
                    <p className="text-sm text-gray-500 mt-1">Don't see the game above? Paste a YouTube link here to add it.</p>
                  </div>
                  <div className="p-6 space-y-5">
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5 block">YouTube URL</span>
                      <div className="relative">
                        <input type="text" placeholder="https://www.youtube.com/watch?v=..." className="w-full bg-gray-50 border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 rounded-xl px-4 py-3 outline-none transition-all pr-12 text-sm font-medium" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                        <div className="absolute right-3 top-3 text-gray-300"><Search className="w-5 h-5" /></div>
                      </div>
                    </label>

                    <div className="grid grid-cols-1 gap-5">
                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5 block">Season (Year)</span>
                        <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-sm font-medium" value={newVideoData.seasonId} onChange={e => setNewVideoData({ ...newVideoData, seasonId: e.target.value })} required>
                          <option value="" disabled>Select Season...</option>
                          {seasons.map(s => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5 block">Home Team</span>
                        <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-sm font-medium" value={newVideoData.homeTeamId} onChange={e => setNewVideoData({ ...newVideoData, homeTeamId: e.target.value })} required>
                          <option value="" disabled>Select Home...</option>
                          {teams.map(t => <option key={t.id} value={t.id}>{t.name || t.id}</option>)}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5 block">Away Team</span>
                        <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-sm font-medium" value={newVideoData.awayTeamId} onChange={e => setNewVideoData({ ...newVideoData, awayTeamId: e.target.value })} required>
                          <option value="" disabled>Select Away...</option>
                          {teams.map(t => <option key={t.id} value={t.id}>{t.name || t.id}</option>)}
                        </select>
                      </label>
                    </div>

                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5 block flex items-center justify-between">
                        Game Tag
                        <span className="text-gray-300 font-normal normal-case">Optional, e.g. Finals</span>
                      </span>
                      <input type="text" placeholder="e.g. Finals Match 1" className="w-full bg-gray-50 border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 rounded-xl px-4 py-3 outline-none transition-all text-sm font-medium" value={newVideoData.tag} onChange={(e) => setNewVideoData({ ...newVideoData, tag: e.target.value })} />
                    </label>

                    <button onClick={handleSearchVideo} disabled={!searchQuery || !newVideoData.seasonId || !newVideoData.homeTeamId || !newVideoData.awayTeamId} className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all mt-4 flex justify-center items-center gap-2 shadow-sm" >
                      Start Tracking
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Column: Player & Controls */}
            <div className="lg:col-span-9 flex flex-col gap-2 min-h-0 overflow-hidden">
              <div className="flex-1 min-h-0 bg-black rounded-2xl overflow-hidden shadow-2xl border border-gray-200 flex items-center justify-center relative">
                {(() => {
                  const url = currentVideo?.youtubeId || '';
                  let validId = '';
                  if (url && !url.includes('unknown')) {
                    if (url.length === 11) validId = url;
                    else {
                      const m = url.match(/(?:v=|\/v\/|embed\/|youtu\.be\/|shorts\/|\/u\/\w\/|watch\?v=)([\w-]{11})/);
                      if (m) validId = m[1];
                    }
                  }

                  if (!validId) {
                    return (
                      <div className="absolute inset-0 bg-gray-50 flex flex-col items-center justify-center p-8 text-center text-gray-400">
                        <AlertCircle className="w-12 h-12 mb-4 text-gray-300" />
                        <p className="font-bold text-gray-500 mb-2">No Video Source Attached</p>
                        <p className="text-xs max-w-xs mx-auto">This game was imported locally without a linked YouTube ID. You can still track events timeline-style below.</p>
                      </div>
                    );
                  }

                  return (
                    <YouTube
                      videoId={validId}
                      className="w-full h-full"
                      opts={{
                        width: '100%',
                        height: '100%',
                        playerVars: { autoplay: 0, modestbranding: 1 },
                      }}
                      onReady={(e) => setPlayer(e.target)}
                    />
                  );
                })()}
              </div>

              {/* Controls and Scoreboard Row */}
              <div className="flex flex-row items-center justify-between gap-3 w-full mt-2 mb-3">
                {/* Scoreboard Persistent Header */}
                <div className="flex-1 min-w-0">
                  {(() => {
                    if (!currentGame) return null;
                    const pastEvents = activeTrackingEvents.filter(e => e.videoTime <= currentTime);
                    const liveScores = computeScores(pastEvents, currentGame.homeTeamId, currentGame.awayTeamId);
                    const winCond = computeWinCondition(pastEvents, currentGame.homeTeamId, currentGame.awayTeamId);
                    const homeName = teams.find(t => t.id === currentGame.homeTeamId)?.name || 'Home';
                    const awayName = teams.find(t => t.id === currentGame.awayTeamId)?.name || 'Away';
                    const currentDodgeballTeamId = getControlTeamAtTime(computeControlPeriods(pastEvents), currentTime);

                    return (
                      <div className={cn("bg-white border rounded py-1.5 px-3 shrink-0 shadow-sm flex items-center justify-between w-full mx-auto gap-4 relative", winCond.flagOnPitch && !winCond.winner ? "bg-yellow-50 border-yellow-300" : "border-gray-200")}>
                        {/* Left: Home */}
                        <div className="flex items-center justify-end flex-1 w-0 gap-2">
                          <p className="text-[10px] md:text-xs uppercase font-bold text-red-500 truncate text-right w-full">{homeName}</p>
                          <div className="flex items-center gap-1 shrink-0">
                            <p className="text-xl font-mono font-bold text-red-600">{liveScores.home}</p>
                            {currentDodgeballTeamId === currentGame.homeTeamId && <div title="Dodgeball Control" className="w-1.5 h-1.5 bg-black rounded-sm shadow-sm" />}
                          </div>
                        </div>

                        {/* Center: Clock & Win Cond */}
                        <div className="flex flex-col items-center justify-center shrink-0 border-x border-gray-100 px-4 min-w-[100px]">
                          <p className="text-xs font-mono font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded shadow-inner leading-none">{formatTime(gameTime)}</p>
                          {winCond.winner ? (
                            <p className="text-[8px] font-bold text-yellow-600 uppercase tracking-widest mt-1 truncate">
                              Winner: {teams.find(t => t.id === winCond.winner)?.name || winCond.winner}
                            </p>
                          ) : winCond.targetSet ? (
                            <div className="flex items-center gap-1 mt-1 text-[8px] font-bold uppercase tracking-widest text-yellow-600">
                              {winCond.flagOnPitch && <Flag className="w-2.5 h-2.5" />} Target: {winCond.threshold}
                            </div>
                          ) : null}
                        </div>

                        {/* Right: Away */}
                        <div className="flex items-center justify-start flex-1 w-0 gap-2">
                          <div className="flex items-center gap-1 shrink-0">
                            {currentDodgeballTeamId === currentGame.awayTeamId && <div title="Dodgeball Control" className="w-1.5 h-1.5 bg-black rounded-sm shadow-sm" />}
                            <p className="text-xl font-mono font-bold text-blue-600">{liveScores.away}</p>
                          </div>
                          <p className="text-[10px] md:text-xs uppercase font-bold text-blue-500 truncate text-left w-full">{awayName}</p>
                        </div>

                        {isAdmin && rightPanelTab === 'record' && (
                          <div className="flex gap-1 absolute -right-2 top-0 bottom-0 translate-x-full">
                            <button onClick={() => handleVerifyGame(currentGame.id)} className={cn("flex flex-col items-center justify-center p-1 rounded-r border transition-colors", currentGame.isVerified ? "text-emerald-600 bg-emerald-50 border-emerald-200" : "text-gray-400 bg-gray-50 border-gray-200 hover:text-emerald-600 hover:bg-emerald-50")} title={currentGame.isVerified ? "Unverify Game" : "Verify Game"}>
                              <ShieldCheck className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Video Scrub Controls */}
                {player && (
                  <div className="flex gap-1 items-center shrink-0">
                    <button onClick={() => player.seekTo(Math.max(0, currentTime - 15))} className="p-1.5 md:px-2 md:py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[9px] md:text-[10px] uppercase tracking-wider font-bold rounded shadow-sm flex items-center justify-center gap-0.5 md:gap-1 transition-all" title="Rewind 15s"><Rewind className="w-3 h-3"/> <span className="hidden md:block">15s</span></button>
                    <button onClick={() => player.seekTo(Math.max(0, currentTime - 5))} className="p-1.5 md:px-2 md:py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[9px] md:text-[10px] uppercase tracking-wider font-bold rounded shadow-sm flex items-center justify-center gap-0.5 md:gap-1 transition-all" title="Rewind 5s"><Rewind className="w-3 h-3"/> <span className="hidden md:block">5s</span></button>
                    <button onClick={() => player.seekTo(currentTime + 5)} className="p-1.5 md:px-2 md:py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[9px] md:text-[10px] uppercase tracking-wider font-bold rounded shadow-sm flex items-center justify-center gap-0.5 md:gap-1 transition-all" title="Forward 5s"><span className="hidden md:block">5s</span> <FastForward className="w-3 h-3"/></button>
                    <button onClick={() => player.seekTo(currentTime + 15)} className="p-1.5 md:px-2 md:py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[9px] md:text-[10px] uppercase tracking-wider font-bold rounded shadow-sm flex items-center justify-center gap-0.5 md:gap-1 transition-all" title="Forward 15s"><span className="hidden md:block">15s</span> <FastForward className="w-3 h-3"/></button>
                  </div>
                )}
              </div>

              {!user && (
                <p className="mt-4 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Sign in to track stats and vote
                </p>
              )}
            </div>

            {/* Right Column: Event Feed & Roster */}
            <div className="lg:col-span-3 flex flex-col gap-4 overflow-hidden h-full">
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col h-full relative">
                <div className="p-0 border-b border-gray-200 flex items-center justify-between bg-gray-50/50 z-10 shrink-0">
                  <div className="flex w-full">
                    <button
                      onClick={() => setRightPanelTab('live_events')}
                      className={cn("flex-1 px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors", rightPanelTab === 'live_events' ? "bg-white text-red-600 border-b-2 border-red-600" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100")}
                    >
                      <Clock className="w-4 h-4" /> {statsFilter === 'verified' ? 'Verified' : 'Events'}
                    </button>
                    {user && effectiveRole !== 'voter' && (
                      <button
                        onClick={() => setRightPanelTab('record')}
                        className={cn("flex-1 px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors relative", rightPanelTab === 'record' ? "bg-white text-emerald-600 border-b-2 border-emerald-600" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100")}
                      >
                        <UploadCloud className="w-4 h-4" /> Record
                        {draftEvents.length > 0 && (
                          <span className="absolute top-2 right-2 flex min-w-4 h-4 items-center justify-center bg-emerald-500 text-white text-[9px] font-bold rounded-full px-1">
                            {draftEvents.length}
                          </span>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => setRightPanelTab('momentum')}
                      className={cn("flex-1 px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors", rightPanelTab === 'momentum' ? "bg-white text-red-600 border-b-2 border-red-600" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100")}
                    >
                      <TrendingUp className="w-4 h-4" /> Momentum
                    </button>
                    <button
                      onClick={() => setRightPanelTab('rosters')}
                      className={cn("flex-1 px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors", rightPanelTab === 'rosters' ? "bg-white text-red-600 border-b-2 border-red-600" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100")}
                    >
                      <User className="w-4 h-4" /> Players
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden relative">

                  {/* RECORD TAB */}
                  <div className={cn("absolute inset-0 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4 bg-white", rightPanelTab === 'record' ? "block" : "hidden")}>

                    {/* Event Type Grid ALWAYS visible because Player Actions are now local popups */}
                    <div className="flex flex-col gap-3 mb-2">
                      {(() => {
                        const chaserTypes = ['goal', 'shot', 'attempt', 'turnover'];
                        const clockTypes = ['gameStart', 'gamePause', 'gameEnd'];

                        return (
                          <>
                            <div className="flex flex-col gap-1.5 mb-2">
                              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest pl-1">Chaser Actions</span>
                              <div className="grid grid-cols-3 gap-1.5">
                                {chaserTypes.map(type => {
                                  const config = EVENT_CONFIG[type as EventType];
                                  if (!config) return null;
                                  return (
                                    <div key={type} className="flex rounded-lg overflow-hidden border border-gray-200 shadow-sm transition-all focus-within:ring-2 focus-within:ring-red-200">
                                      <button
                                        onClick={() => handleCreateDraftEvent(type as EventType, currentGame?.homeTeamId ?? null, selectedPlayerId || null, null, null)}
                                        className="flex-1 flex flex-col items-center justify-center py-1.5 px-0.5 border-r border-gray-100 transition-all hover:bg-red-50 bg-white group active:bg-red-100"
                                      >
                                        <span className="text-[9px] uppercase font-bold tracking-tighter text-red-600 leading-[10px] group-hover:text-red-700">H.<br />{config.label}</span>
                                      </button>
                                      <button
                                        onClick={() => handleCreateDraftEvent(type as EventType, currentGame?.awayTeamId ?? null, selectedPlayerId || null, null, null)}
                                        className="flex-1 flex flex-col items-center justify-center py-1.5 px-0.5 transition-all hover:bg-blue-50 bg-white group active:bg-blue-100"
                                      >
                                        <span className="text-[9px] uppercase font-bold tracking-tighter text-blue-600 leading-[10px] group-hover:text-blue-700">A.<br />{config.label}</span>
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest pl-1">Game Clock</span>
                              <div className="grid grid-cols-3 gap-1.5">
                                {clockTypes.map(type => {
                                  const config = EVENT_CONFIG[type as EventType];
                                  if (!config) return null;
                                  return (
                                    <button
                                      key={type}
                                      onClick={() => handleCreateDraftEvent(type as EventType, null, null, null, null)}
                                      className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border border-gray-200 hover:border-gray-500 hover:bg-gray-50 transition-all active:scale-95 text-center bg-white shadow-sm"
                                    >
                                      <span className="text-[10px] uppercase font-bold tracking-tight text-gray-700 leading-tight">{config.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        );
                      })()}

                      {/* Control Change UI */}
                      <div className="flex flex-col gap-1.5 mt-1">
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest pl-1">Control Change</span>
                        <div className="flex rounded-lg overflow-hidden border border-emerald-200 shadow-sm">
                          <button
                            onClick={() => handleCreateDraftEvent('control_change', currentGame?.homeTeamId || null, null, null, null)}
                            className="flex-1 flex flex-col items-center justify-center py-1.5 px-1 bg-white hover:bg-emerald-50 active:bg-emerald-100 transition-all border-r border-emerald-100 group"
                          >
                            <span className="text-[10px] uppercase font-bold tracking-tight text-emerald-700 leading-tight group-hover:text-emerald-800">Home Control</span>
                          </button>
                          <button
                            onClick={() => handleCreateDraftEvent('control_change', currentGame?.awayTeamId || null, null, null, null)}
                            className="flex-1 flex flex-col items-center justify-center py-1.5 px-1 bg-white hover:bg-emerald-50 active:bg-emerald-100 transition-all group"
                          >
                            <span className="text-[10px] uppercase font-bold tracking-tight text-emerald-700 leading-tight group-hover:text-emerald-800">Away Control</span>
                          </button>
                        </div>
                      </div>

                      {/* Cards UI */}
                      <div className="flex flex-col gap-1.5 mt-1">
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest pl-1">Penalties</span>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button onClick={() => { handleCreateDraftEvent('card', selectedTeamContext === 'home' ? currentGame?.homeTeamId || null : selectedTeamContext === 'away' ? currentGame?.awayTeamId || null : null, selectedPlayerId || null, null, null); setDraftEvents(d => { const last = d[0]; if (last) last.color = 'blue'; return [...d]; }); }} className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border border-blue-200 hover:border-blue-500 hover:bg-blue-50 transition-all active:scale-95 bg-white shadow-sm"><span className="text-[10px] uppercase font-bold tracking-tight text-blue-700">Blue Card</span></button>
                          <button onClick={() => { handleCreateDraftEvent('card', selectedTeamContext === 'home' ? currentGame?.homeTeamId || null : selectedTeamContext === 'away' ? currentGame?.awayTeamId || null : null, selectedPlayerId || null, null, null); setDraftEvents(d => { const last = d[0]; if (last) last.color = 'yellow'; return [...d]; }); }} className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border border-yellow-200 hover:border-yellow-500 hover:bg-yellow-50 transition-all active:scale-95 bg-white shadow-sm"><span className="text-[10px] uppercase font-bold tracking-tight text-yellow-700">Yellow Card</span></button>
                          <button onClick={() => { handleCreateDraftEvent('card', selectedTeamContext === 'home' ? currentGame?.homeTeamId || null : selectedTeamContext === 'away' ? currentGame?.awayTeamId || null : null, selectedPlayerId || null, null, null); setDraftEvents(d => { const last = d[0]; if (last) last.color = 'red'; return [...d]; }); }} className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border border-red-200 hover:border-red-500 hover:bg-red-50 transition-all active:scale-95 bg-white shadow-sm"><span className="text-[10px] uppercase font-bold tracking-tight text-red-700">Red Card</span></button>
                        </div>
                      </div>

                      {/* Game Phase Events */}
                      <div className="flex flex-col gap-1.5 mt-1">
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest pl-1">Game Phase Events</span>
                        <div className="grid grid-cols-4 gap-1.5">
                          <button onClick={() => handleCreateDraftEvent('quadball_start', null, null, null, null)} className="flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg border border-gray-200 hover:border-red-500 hover:bg-red-50 transition-all active:scale-95 bg-white shadow-sm"><span className="text-[8px] sm:text-[9px] uppercase font-bold tracking-tight text-gray-700 leading-tight text-center">Quadball Start</span></button>
                          <button onClick={() => handleCreateDraftEvent('control_start', null, null, null, null)} className="flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all active:scale-95 bg-white shadow-sm"><span className="text-[8px] sm:text-[9px] uppercase font-bold tracking-tight text-emerald-800 leading-tight text-center">Control Start</span></button>
                          <button onClick={() => handleCreateDraftEvent('flag_released', null, null, null, null)} className="flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg border border-gray-200 hover:border-purple-500 hover:bg-purple-50 transition-all active:scale-95 bg-white shadow-sm"><span className="text-[8px] sm:text-[9px] uppercase font-bold tracking-tight text-purple-800 leading-tight text-center">Flag Released</span></button>
                          <button onClick={() => handleCreateDraftEvent('flag_catch', selectedTeamContext === 'home' ? currentGame?.homeTeamId || null : currentGame?.awayTeamId || null, selectedPlayerId || null, null, null)} className="flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg border border-gray-200 hover:border-purple-500 hover:bg-purple-50 transition-all active:scale-95 bg-white shadow-sm"><span className="text-[8px] sm:text-[9px] uppercase font-bold tracking-tight text-purple-800 leading-tight text-center">Flag Catch</span></button>
                        </div>
                      </div>

                      {/* Sub UI */}
                      <div className="flex flex-col gap-1.5 mt-1 border border-gray-200 bg-gray-50 p-2 rounded-lg">
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Substitutions</span>
                        <div className="flex gap-4">
                          <div className="flex-1 flex flex-col gap-1">
                            <span className="text-[9px] text-gray-500 font-bold uppercase truncate">{getScoreboardName(teams.find(t => t.id === currentGame?.homeTeamId))}</span>
                            <div className="flex gap-1">
                              <button onClick={() => handleCreateDraftEvent('sub_in', currentGame?.homeTeamId || null, null, null, null)} className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-900 rounded text-white text-[9px] font-bold shadow-sm transition-all active:scale-95">IN</button>
                              <button onClick={() => handleCreateDraftEvent('sub_out', currentGame?.homeTeamId || null, null, null, null)} className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-900 rounded text-white text-[9px] font-bold shadow-sm transition-all active:scale-95">OUT</button>
                            </div>
                          </div>
                          <div className="flex-1 flex flex-col gap-1">
                            <span className="text-[9px] text-gray-500 font-bold uppercase truncate">{getScoreboardName(teams.find(t => t.id === currentGame?.awayTeamId))}</span>
                            <div className="flex gap-1">
                              <button onClick={() => handleCreateDraftEvent('sub_in', currentGame?.awayTeamId || null, null, null, null)} className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-900 rounded text-white text-[9px] font-bold shadow-sm transition-all active:scale-95">IN</button>
                              <button onClick={() => handleCreateDraftEvent('sub_out', currentGame?.awayTeamId || null, null, null, null)} className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-900 rounded text-white text-[9px] font-bold shadow-sm transition-all active:scale-95">OUT</button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* End Event Grid */}
                    </div>
                    {/* Draft Cards Pipeline */}
                    <div className="flex flex-col gap-4">
                      {draftEvents.length > 0 ? (
                        <div className="flex flex-col gap-3">
                          <h4 className="text-[11px] font-bold uppercase tracking-widest text-emerald-600 border-b border-emerald-100 pb-2">Pending Events Queue ({draftEvents.length})</h4>
                          {draftEvents.map(draft => (
                            <div key={draft.id} className="p-2.5 bg-emerald-50/20 border border-emerald-200 rounded-lg shadow-sm flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
                              {/* Header */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  {/* -1s / +1s time adjusters */}
                                  <button
                                    onClick={() => setDraftEvents(prev => prev.map(d => d.id === draft.id ? { ...d, videoTime: Math.max(0, d.videoTime - 1) } : d))}
                                    title="Shift timestamp back 1 second"
                                    className="h-5 w-5 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 active:scale-95 text-gray-700 text-[10px] font-bold transition-all select-none"
                                  >−</button>
                                  <div className="px-2 py-0.5 bg-gray-800 text-white rounded text-[10px] font-mono shadow-inner tracking-wider">
                                    {formatTime(draft.videoTime)}
                                  </div>
                                  <button
                                    onClick={() => setDraftEvents(prev => prev.map(d => d.id === draft.id ? { ...d, videoTime: d.videoTime + 1 } : d))}
                                    title="Shift timestamp forward 1 second"
                                    className="h-5 w-5 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 active:scale-95 text-gray-700 text-[10px] font-bold transition-all select-none"
                                  >+</button>
                                  <span className="text-xs font-bold text-gray-600 ml-1">Pending Log</span>
                                </div>
                              </div>

                              {/* Form Array */}
                              <div className="grid grid-cols-2 gap-2">
                                {/* Event Type Select (Static) */}
                                <div className="col-span-2 text-[10px] border border-gray-200 rounded p-1.5 bg-gray-50 text-gray-600 font-bold flex items-center gap-1.5 uppercase tracking-tight">
                                  {EVENT_CONFIG[draft.type as EventType] ? React.cloneElement(EVENT_CONFIG[draft.type as EventType].icon as React.ReactElement<any>, { className: 'w-2.5 h-2.5' }) : null}
                                  {EVENT_CONFIG[draft.type as EventType]?.label || 'Event'}
                                </div>

                                {/* Team & Player Selects (Hidden for Clock Events) */}
                                {!['gameStart', 'gamePause', 'gameEnd'].includes(draft.type || '') && (
                                  <>
                                    <select
                                      value={draft.teamId || ''}
                                      onChange={(e) => {
                                        setDraftEvents(prev => prev.map(d => d.id === draft.id ? { ...d, teamId: e.target.value, playerId: null } : d));
                                      }}
                                      className={cn("text-xs border border-gray-300 rounded p-1.5 bg-white", ['sub_in', 'sub_out'].includes(draft.type || '') ? "col-span-2" : "")}
                                    >
                                      <option value="">No Team</option>
                                      {currentGame && <option value={currentGame.homeTeamId}>{teams.find(t => t.id === currentGame.homeTeamId)?.name}</option>}
                                      {currentGame && <option value={currentGame.awayTeamId}>{teams.find(t => t.id === currentGame.awayTeamId)?.name}</option>}
                                    </select>

                                    <select
                                      value={draft.playerId || ''}
                                      onChange={(e) => {
                                        const newPlr = e.target.value;
                                        setDraftEvents(prev => prev.map(d => {
                                          if (d.id !== draft.id) return d;
                                          let updatedDraft = { ...d, playerId: newPlr };
                                          if (d.type === 'sub_in') {
                                            const past = [...activeTrackingEvents].sort((a, b) => b.videoTime - a.videoTime).find(ev => ev.playerId === newPlr && ev.type === 'sub_in');
                                            updatedDraft.position = (past?.position as PositionType) || 'chaser';
                                          }
                                          return updatedDraft;
                                        }));
                                      }}
                                      className="text-xs border border-gray-300 rounded p-1.5 bg-white disabled:opacity-50"
                                      disabled={!draft.teamId}
                                    >
                                      <option value="">{draft.type === 'sub_out' ? 'Sub Out Player' : draft.type === 'sub_in' ? 'Sub In Player' : 'No Player'}</option>
                                      {draft.teamId && (draft.teamId === currentGame?.homeTeamId ? homeRosterPlayers : awayRosterPlayers)
                                        .filter(rp => {
                                          if (draft.type === 'sub_in') return !activePlayerPositions.has(rp.playerId);
                                          if (draft.type === 'sub_out') return activePlayerPositions.has(rp.playerId);

                                          // For stats like goal, shot, turnover etc, if team has NO active players, show all
                                          const teamRoster = draft.teamId === currentGame?.homeTeamId ? homeRosterPlayers : awayRosterPlayers;
                                          const teamAnyActive = teamRoster.some(r => activePlayerPositions.has(r.playerId));
                                          if (!teamAnyActive) return true;

                                          return activePlayerPositions.has(rp.playerId);
                                        })
                                        .sort((a, b) => {
                                          if (draft.type === 'sub_in' || !activePlayerPositions.has(a.playerId)) {
                                            return (a.player?.lastName || '').localeCompare(b.player?.lastName || '');
                                          } else {
                                            const posA = activePlayerPositions.get(a.playerId) || 'chaser';
                                            const posB = activePlayerPositions.get(b.playerId) || 'chaser';
                                            const order = { chaser: 1, keeper: 2, beater: 3, seeker: 4 } as Record<string, number>;
                                            return order[posA] - order[posB];
                                          }
                                        })
                                        .map(rp => (
                                          <option key={rp.playerId} value={rp.playerId}>
                                            {draft.type !== 'sub_in' ? `[${(activePlayerPositions.get(rp.playerId) || 'bench').substring(0, 1).toUpperCase()}] ` : ''}
                                            {getPlayerShortName(rp.player, draft.teamId === currentGame?.homeTeamId ? homeRosterPlayers : awayRosterPlayers)}
                                          </option>
                                        ))}
                                    </select>

                                    {draft.type === 'sub_in' && (
                                      <select
                                        value={draft.position || 'chaser'}
                                        onChange={(e) => setDraftEvents(prev => prev.map(d => d.id === draft.id ? { ...d, position: e.target.value as PositionType } : d))}
                                        className="text-xs border border-green-200 rounded p-1.5 bg-green-50 text-green-800 disabled:opacity-50 mt-1"
                                      >
                                        <option value="chaser">Chaser</option>
                                        <option value="beater">Beater</option>
                                        <option value="keeper">Keeper</option>
                                        <option value="seeker">Seeker</option>
                                      </select>
                                    )}

                                    {draft.type === 'sub_out' && (
                                      <select
                                        value={draft.subPlayerId || ''}
                                        onChange={(e) => setDraftEvents(prev => prev.map(d => d.id === draft.id ? { ...d, subPlayerId: e.target.value } : d))}
                                        className="text-xs border border-green-200 rounded p-1.5 bg-green-50 text-green-800 disabled:opacity-50 mt-1"
                                        disabled={!draft.teamId}
                                      >
                                        <option value="">Sub In... (Optional)</option>
                                        {draft.teamId && (draft.teamId === currentGame?.homeTeamId ? homeRosterPlayers : awayRosterPlayers)
                                          .filter(rp => !activePlayerPositions.has(rp.playerId) && rp.playerId !== draft.playerId)
                                          .sort((a, b) => (a.player?.lastName || '').localeCompare(b.player?.lastName || ''))
                                          .map(rp => (
                                            <option key={rp.playerId} value={rp.playerId}>
                                              Sub in {getPlayerShortName(rp.player, draft.teamId === currentGame?.homeTeamId ? homeRosterPlayers : awayRosterPlayers)}
                                            </option>
                                          ))}
                                      </select>
                                    )}

                                    {draft.type === 'goal' && (
                                      <select
                                        value={draft.assistedByPlayerId || ''}
                                        onChange={(e) => setDraftEvents(prev => prev.map(d => d.id === draft.id ? { ...d, assistedByPlayerId: e.target.value } : d))}
                                        className="col-span-2 text-xs border border-purple-200 rounded p-1.5 bg-purple-50 text-purple-800 disabled:opacity-50 mt-1"
                                        disabled={!draft.teamId}
                                      >
                                        <option value="">No Assist Data</option>
                                        {draft.teamId && (draft.teamId === currentGame?.homeTeamId ? homeRosterPlayers : awayRosterPlayers)
                                          .filter(rp => {
                                            if (activePlayerPositions.has(rp.playerId)) return rp.playerId !== draft.playerId;
                                            const teamRoster = draft.teamId === currentGame?.homeTeamId ? homeRosterPlayers : awayRosterPlayers;
                                            const teamAnyActive = teamRoster.some(r => activePlayerPositions.has(r.playerId));
                                            return !teamAnyActive && rp.playerId !== draft.playerId;
                                          })
                                          .sort((a, b) => {
                                            const posA = activePlayerPositions.get(a.playerId);
                                            const posB = activePlayerPositions.get(b.playerId);
                                            if (!posA || !posB) return (a.player?.lastName || '').localeCompare(b.player?.lastName || '');
                                            const order = { chaser: 1, keeper: 2, beater: 3, seeker: 4 } as Record<string, number>;
                                            return order[posA] - order[posB];
                                          })
                                          .map(rp => (
                                            <option key={rp.playerId} value={rp.playerId}>
                                              Assist - [{activePlayerPositions.get(rp.playerId)?.substring(0, 1).toUpperCase() || 'C'}] {getPlayerShortName(rp.player, draft.teamId === currentGame?.homeTeamId ? homeRosterPlayers : awayRosterPlayers)}
                                            </option>
                                          ))}
                                      </select>
                                    )}
                                  </>
                                )}
                              </div>

                              <div className="flex gap-2 w-full mt-1">
                                {draft.type === 'sub_out' || draft.type === 'sub_in' ? (
                                  <div className="flex gap-1 flex-1">
                                    <button
                                      onClick={() => handleSaveDraftEvent(draft, false)}
                                      className="flex-1 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] py-1.5 rounded-lg transition-colors shadow flex items-center justify-center gap-1 min-h-[32px] px-1"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Save
                                    </button>
                                    <button
                                      onClick={() => handleSaveDraftEvent(draft, true)}
                                      className="flex-1 shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[11px] py-1.5 rounded-lg transition-colors shadow flex items-center justify-center gap-1 min-h-[32px] px-1"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" /> + Next
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleSaveDraftEvent(draft, false)}
                                    className="flex-1 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] py-1.5 rounded-lg transition-colors shadow flex items-center justify-center gap-1.5 min-h-[32px]"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Save to Timeline
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteDraftEvent(draft.id)}
                                  className="w-10 shrink-0 bg-red-50 border border-red-100 hover:bg-red-100 text-red-500 font-bold p-1.5 text-[11px] rounded-lg transition-colors flex items-center justify-center min-h-[32px]"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center py-6 px-4 bg-gray-100 rounded-xl border border-dashed border-gray-300">
                          <History className="w-8 h-8 text-gray-300 mb-2" />
                          <p className="text-[11px] font-bold text-gray-400">No pending events.</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">Select an action above to draft an event at the current video timestamp.</p>
                        </div>
                      )}
                    </div>

                    {/* Vertical Event Thread Remapped to Screen Floor -> Empty placeholder rendering null as component was relocated natively globally component above! */}

                  </div>

                  <div className={cn("absolute inset-0 overflow-y-auto custom-scrollbar p-4 space-y-8 bg-gray-50", rightPanelTab === 'rosters' ? "block" : "hidden")}>
                    {rightPanelTab === 'rosters' && (() => {
                      const pastEvents = activeTrackingEvents.filter(e => e.videoTime <= currentTime);
                      const liveStats = new Map<string, { g: number, a: number, plus: number, minus: number }>();

                      const activePlayers = new Set<string>();
                      const seenSubIn = new Set<string>();
                      const sortedEvents = [...pastEvents].sort((a, b) => a.videoTime - b.videoTime);

                      for (const e of sortedEvents) {
                        if (!e.playerId) continue;
                        if (!liveStats.has(e.playerId)) liveStats.set(e.playerId, { g: 0, a: 0, plus: 0, minus: 0 });

                        if (e.type === 'sub_in') { seenSubIn.add(e.playerId); }
                        else if (e.type === 'sub_out') { if (!seenSubIn.has(e.playerId)) activePlayers.add(e.playerId); }
                        else { if (!seenSubIn.has(e.playerId)) activePlayers.add(e.playerId); }
                      }

                      const activeHomeTracking = new Set<string>();
                      const activeAwayTracking = new Set<string>();
                      for (const pid of activePlayers) {
                        if (homeRosterPlayers.some(r => r.playerId === pid)) activeHomeTracking.add(pid);
                        if (awayRosterPlayers.some(r => r.playerId === pid)) activeAwayTracking.add(pid);
                      }

                      for (const e of sortedEvents) {
                        if (e.type === 'sub_in' && e.playerId) {
                          if (homeRosterPlayers.some(r => r.playerId === e.playerId)) activeHomeTracking.add(e.playerId);
                          if (awayRosterPlayers.some(r => r.playerId === e.playerId)) activeAwayTracking.add(e.playerId);
                        }
                        if (e.type === 'sub_out' && e.playerId) {
                          activeHomeTracking.delete(e.playerId);
                          activeAwayTracking.delete(e.playerId);
                        }

                        if (e.type === 'goal') {
                          const isHomeGoal = e.teamId === currentGame?.homeTeamId;
                          const isAwayGoal = e.teamId === currentGame?.awayTeamId;
                          if (isHomeGoal || isAwayGoal) {
                            for (const pid of activeHomeTracking) {
                              if (!liveStats.has(pid)) liveStats.set(pid, { g: 0, a: 0, plus: 0, minus: 0 });
                              if (isHomeGoal) liveStats.get(pid)!.plus++;
                              if (isAwayGoal) liveStats.get(pid)!.minus++;
                            }
                            for (const pid of activeAwayTracking) {
                              if (!liveStats.has(pid)) liveStats.set(pid, { g: 0, a: 0, plus: 0, minus: 0 });
                              if (isAwayGoal) liveStats.get(pid)!.plus++;
                              if (isHomeGoal) liveStats.get(pid)!.minus++;
                            }
                          }
                        }

                        if (e.playerId && e.type === 'goal') liveStats.get(e.playerId)!.g++;
                        if (e.playerId && e.type === 'assist') liveStats.get(e.playerId)!.a++;
                      }

                      // Compute beater control time per player
                      const controlPeriods = computeControlPeriods(sortedEvents);
                      const beaterControlTime = new Map<string, { ctrlSec: number, totalSec: number }>();

                      // Build stints for all beaters currently tracked
                      const allBeaters = [...homeRosterPlayers, ...awayRosterPlayers]
                        .filter(rp => activePlayerPositions.get(rp.playerId) === 'beater');

                      for (const rp of allBeaters) {
                        const pid = rp.playerId;
                        const teamId = homeRosterPlayers.some(r => r.playerId === pid)
                          ? currentGame?.homeTeamId : currentGame?.awayTeamId;

                        // Build stints from events
                        const stints: { start: number; end: number }[] = [];
                        let onField = false;
                        let stintStart = 0;

                        for (const e of sortedEvents) {
                          if (e.playerId !== pid) continue;
                          if (e.type === 'sub_in' && e.position === 'beater') {
                            if (!onField) { onField = true; stintStart = e.videoTime; }
                          } else if (e.type === 'sub_out') {
                            if (onField) { stints.push({ start: stintStart, end: e.videoTime }); onField = false; }
                          }
                        }
                        if (onField) stints.push({ start: stintStart, end: currentTime });

                        // If no sub_in events found, they might have been on from the start
                        if (stints.length === 0 && activePlayerPositions.get(pid) === 'beater') {
                          // check if they have any events at all
                          const hasAnyEvent = sortedEvents.some(e => e.playerId === pid);
                          if (hasAnyEvent) {
                            const firstEvent = sortedEvents.find(e => e.playerId === pid);
                            stints.push({ start: firstEvent?.videoTime || 0, end: currentTime });
                          }
                        }

                        // Calculate control time across all stints
                        let ctrlSec = 0;
                        let totalSec = 0;
                        for (const stint of stints) {
                          totalSec += Math.max(0, stint.end - stint.start);
                          for (const cp of controlPeriods) {
                            if (cp.teamId !== teamId) continue;
                            const overlapStart = Math.max(stint.start, cp.startTime);
                            const overlapEnd = Math.min(stint.end, cp.endTime ?? currentTime);
                            if (overlapEnd > overlapStart) ctrlSec += (overlapEnd - overlapStart);
                          }
                        }

                        beaterControlTime.set(pid, { ctrlSec: Math.round(ctrlSec), totalSec: Math.round(totalSec) });
                      }

                      // Compute seeker total seeking time
                      const seekerTime = new Map<string, number>();
                      const allSeekers = [...homeRosterPlayers, ...awayRosterPlayers]
                        .filter(rp => activePlayerPositions.get(rp.playerId) === 'seeker');

                      for (const rp of allSeekers) {
                        const pid = rp.playerId;
                        let onField = false;
                        let stintStart = 0;
                        let totalSec = 0;

                        for (const e of sortedEvents) {
                          if (e.playerId !== pid) continue;
                          if (e.type === 'sub_in' && e.position === 'seeker') {
                            if (!onField) { onField = true; stintStart = e.videoTime; }
                          } else if (e.type === 'sub_out') {
                            if (onField) { totalSec += Math.max(0, e.videoTime - stintStart); onField = false; }
                          }
                        }
                        if (onField) totalSec += Math.max(0, currentTime - stintStart);

                        // If no sub_in events found, they might have been on from the start
                        if (totalSec === 0 && activePlayerPositions.get(pid) === 'seeker') {
                          const hasAnyEvent = sortedEvents.some(e => e.playerId === pid);
                          if (hasAnyEvent) {
                            const firstEvent = sortedEvents.find(e => e.playerId === pid);
                            totalSec = Math.max(0, currentTime - (firstEvent?.videoTime || 0));
                          }
                        }
                        seekerTime.set(pid, totalSec);
                      }

                      const isAuthToRecord = !!(user && (effectiveRole === 'trusted' || (currentVideo as any)?.authorId === user.uid));
                      return (
                        <div className="flex flex-col gap-6 w-full max-w-full">
                          <div className="grid grid-cols-2 gap-4 border-b border-gray-200 pb-2">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-[#FF4B4B] text-center truncate px-1" title={teams.find(t => t.id === currentGame?.homeTeamId)?.name}>
                              {teams.find(t => t.id === currentGame?.homeTeamId)?.name || 'Home'}
                            </h4>
                            <h4 className="text-xs font-bold uppercase tracking-widest text-blue-500 text-center truncate px-1" title={teams.find(t => t.id === currentGame?.awayTeamId)?.name}>
                              {teams.find(t => t.id === currentGame?.awayTeamId)?.name || 'Away'}
                            </h4>
                          </div>

                          <div className="flex flex-col gap-4">
                            {['chaser', 'keeper', 'beater', 'seeker'].map(pos => {
                              const homePlrs = homeRosterPlayers.filter(rp => activePlayerPositions.has(rp.playerId) && activePlayerPositions.get(rp.playerId) === pos).sort((a, b) => (a.player?.lastName || '').localeCompare(b.player?.lastName || ''));
                              const awayPlrs = awayRosterPlayers.filter(rp => activePlayerPositions.has(rp.playerId) && activePlayerPositions.get(rp.playerId) === pos).sort((a, b) => (a.player?.lastName || '').localeCompare(b.player?.lastName || ''));

                              if (homePlrs.length === 0 && awayPlrs.length === 0) return null;

                              homePlrs.sort((a, b) => (a.player?.lastName || '').localeCompare(b.player?.lastName || ''));
                              awayPlrs.sort((a, b) => (a.player?.lastName || '').localeCompare(b.player?.lastName || ''));

                              const maxRows = Math.max(homePlrs.length, awayPlrs.length);

                              return (
                                <div
                                  key={pos}
                                  className="flex flex-col gap-2 relative bg-transparent rounded-lg transition-colors min-h-[50px] p-1"
                                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.05)'; }}
                                  onDragLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                  onDrop={e => {
                                    e.preventDefault();
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    if (!isAuthToRecord) return;
                                    try {
                                      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                                      if (data.playerId && data.teamId) {
                                        const eType = 'sub_in';
                                        handleCreateDraftEvent(eType, data.teamId, data.playerId, null, pos as PositionType);
                                      }
                                    } catch (err) { }
                                  }}
                                >
                                  <div className="text-[9px] uppercase font-bold text-gray-400 text-center tracking-widest bg-gray-100 py-0.5 rounded shadow-inner mb-1 pointer-events-none">
                                    {pos}
                                  </div>
                                  {Array.from({ length: maxRows }).map((_, i) => {
                                    const hp = homePlrs[i];
                                    const ap = awayPlrs[i];

                                    const renderPlayer = (rp: any | undefined, isBench = false) => {
                                      if (!rp) return <div className="h-full" />;
                                      const stats = liveStats.get(rp.playerId);
                                      const plusMinus = (stats?.plus || 0) - (stats?.minus || 0);
                                      const isBeater = pos === 'beater';
                                      const isSeeker = pos === 'seeker';
                                      const bCtrl = beaterControlTime.get(rp.playerId);
                                      const sTime = seekerTime.get(rp.playerId) || 0;
                                      return (
                                        <div
                                          draggable={isAuthToRecord}
                                          onDragStart={(e) => {
                                            if (!isAuthToRecord) { e.preventDefault(); return; }
                                            e.dataTransfer.setData('text/plain', JSON.stringify({ playerId: rp.playerId, teamId: rp.teamId, source: isBench ? 'bench' : 'active' }))
                                          }}
                                          onClick={() => {
                                            if (!isAuthToRecord) return;
                                            if (!isBench) {
                                              if (selectedPlayerId === rp.playerId) {
                                                setSelectedPlayerId(null);
                                              } else {
                                                setSelectedPlayerId(rp.playerId);
                                                setPopupTimeOffset(0);
                                              }
                                            }
                                          }}
                                          className={cn(
                                            "flex flex-col p-2 rounded border shadow-sm w-full transition-all relative z-0",
                                            !isBench
                                              ? (isAuthToRecord ? "cursor-pointer active:scale-95 cursor-grab active:cursor-grabbing" : "cursor-default")
                                              : cn("opacity-60 grayscale-[0.3]", isAuthToRecord ? "cursor-grab active:cursor-grabbing" : "cursor-default"),
                                            selectedPlayerId === rp.playerId
                                              ? "bg-slate-900 border-slate-700 shadow-xl"
                                              : "bg-white/80 border-gray-200 hover:border-gray-400"
                                          )}
                                        >
                                          <div className="overflow-hidden">
                                            <span className={cn("text-xs font-bold truncate block", selectedPlayerId === rp.playerId ? "text-slate-200" : "text-gray-800")} title={getPlayerShortName(rp.player, rp.teamId === currentGame?.homeTeamId ? homeRosterPlayers : awayRosterPlayers)}>
                                              {getPlayerShortName(rp.player, rp.teamId === currentGame?.homeTeamId ? homeRosterPlayers : awayRosterPlayers)}
                                            </span>
                                          </div>
                                          <div className={cn("flex items-center gap-1.5 mt-1 text-[9px] font-mono justify-between overflow-hidden", selectedPlayerId === rp.playerId ? "text-slate-400" : "text-gray-500")}>
                                            {isBeater ? (
                                              <>
                                                <span>CTRL {Math.floor((bCtrl?.ctrlSec || 0) / 60)}:{String(Math.round((bCtrl?.ctrlSec || 0) % 60)).padStart(2, '0')}</span>
                                                <span className={cn("font-bold px-1 rounded-sm",
                                                  bCtrl && bCtrl.totalSec > 0 && (bCtrl.ctrlSec / bCtrl.totalSec) >= 0.5 ? (selectedPlayerId === rp.playerId ? "text-emerald-400 bg-emerald-900/30" : "text-emerald-600 bg-emerald-50") :
                                                    bCtrl && bCtrl.totalSec > 0 && (bCtrl.ctrlSec / bCtrl.totalSec) < 0.4 ? (selectedPlayerId === rp.playerId ? "text-red-400 bg-red-900/30" : "text-red-500 bg-red-50") : (selectedPlayerId === rp.playerId ? "text-slate-500" : "text-gray-400")
                                                )}>
                                                  {bCtrl && bCtrl.totalSec > 0 ? `${Math.round((bCtrl.ctrlSec / bCtrl.totalSec) * 100)}%` : '—'}
                                                </span>
                                              </>
                                            ) : isSeeker ? (
                                              <>
                                                <span>SEEKING {Math.floor(sTime / 60)}:{String(Math.round(sTime % 60)).padStart(2, '0')}</span>
                                                <span className="text-transparent">—</span>
                                              </>
                                            ) : (
                                              <>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                  <span>{stats?.g || 0}G</span>
                                                  <span>{stats?.a || 0}A</span>
                                                </div>
                                                <span className={cn("font-bold px-1 rounded-sm shrink-0", plusMinus > 0 ? (selectedPlayerId === rp.playerId ? "text-emerald-400 bg-emerald-900/30" : "text-emerald-600 bg-emerald-50") : plusMinus < 0 ? (selectedPlayerId === rp.playerId ? "text-red-400 bg-red-900/30" : "text-red-500 bg-red-50") : (selectedPlayerId === rp.playerId ? "text-slate-500" : "text-gray-400"))}>
                                                  {plusMinus > 0 ? '+' : ''}{plusMinus}
                                                </span>
                                              </>
                                            )}
                                          </div>

                                          {selectedPlayerId === rp.playerId && !isBench && (
                                            <div className="mt-2 pt-2 border-t border-slate-700/50 animate-in slide-in-from-top-2 fade-in" onClick={(e) => e.stopPropagation()}>
                                              <div className="flex items-center justify-between bg-slate-800 rounded p-1 mb-1.5 shadow-inner">
                                                <button onClick={(e) => { e.stopPropagation(); setPopupTimeOffset(p => p - 1); }} className="w-5 h-5 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-slate-300 text-xs font-bold transition-all active:scale-95">-1</button>
                                                <span className="text-[10px] font-bold text-emerald-400 font-mono tracking-wider tabular-nums">
                                                  {formatTime(Math.max(0, (player ? player.getCurrentTime() : 0) + popupTimeOffset))}
                                                </span>
                                                <button onClick={(e) => { e.stopPropagation(); setPopupTimeOffset(p => p + 1); }} className="w-5 h-5 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-slate-300 text-xs font-bold transition-all active:scale-95">+1</button>
                                              </div>
                                              <div className="flex flex-col gap-1">
                                                {(!isBeater && !isSeeker) && (
                                                  <div className="flex gap-1 items-stretch">
                                                    <button onClick={(e) => { e.stopPropagation(); handleCreateDraftEvent('goal', rp.teamId, rp.playerId, null, null, Math.max(0, (player ? (function(){try{return player.getCurrentTime()}catch(e){return 0}})() : 0) + popupTimeOffset)); setSelectedPlayerId(null); }} className="flex-[1.5] py-1 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg font-black tracking-widest text-[10px] shadow-[0_2px_0_theme(colors.emerald.700)] active:shadow-none active:translate-y-[2px] transition-all">GOAL</button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleCreateDraftEvent('shot', rp.teamId, rp.playerId, null, null, Math.max(0, (player ? (function(){try{return player.getCurrentTime()}catch(e){return 0}})() : 0) + popupTimeOffset)); setSelectedPlayerId(null); }} className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-[9px] border border-slate-700 transition-colors">SHOT</button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleCreateDraftEvent('attempt', rp.teamId, rp.playerId, null, null, Math.max(0, (player ? (function(){try{return player.getCurrentTime()}catch(e){return 0}})() : 0) + popupTimeOffset)); setSelectedPlayerId(null); }} className="flex-1 py-1 bg-slate-800 hover:bg-violet-900/40 text-violet-400 rounded-lg font-bold text-[8px] border border-slate-700 transition-colors">ATTEMPT</button>
                                                  </div>
                                                )}
                                                <div className="flex gap-1 border-t border-slate-700/50 pt-1">
                                                  <button onClick={(e) => { e.stopPropagation(); handleCreateDraftEvent('sub_out', rp.teamId, rp.playerId, null, null, Math.max(0, (player ? (function(){try{return player.getCurrentTime()}catch(e){return 0}})() : 0) + popupTimeOffset)); setSelectedPlayerId(null); }} className="flex-1 py-1.5 bg-slate-800 hover:bg-red-900/40 text-red-400 rounded-lg font-bold text-[8px] border border-slate-700 transition-colors">SUB OUT</button>
                                                  <button onClick={(e) => { e.stopPropagation(); handleCreateDraftEvent('sub_in', rp.teamId, rp.playerId, null, null, Math.max(0, (player ? (function(){try{return player.getCurrentTime()}catch(e){return 0}})() : 0) + popupTimeOffset)); setSelectedPlayerId(null); }} className="flex-1 py-1.5 bg-slate-800 hover:bg-blue-900/40 text-blue-400 rounded-lg font-bold text-[8px] border border-slate-700 transition-colors">SUB IN</button>
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    };

                                    return (
                                      <div key={i} className="grid grid-cols-2 gap-4">
                                        {renderPlayer(hp)}
                                        {renderPlayer(ap)}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                            {/* Bench Section */}
                            {(() => {
                              const homeBench = homeRosterPlayers.filter(rp => !activePlayerPositions.has(rp.playerId)).sort((a, b) => (a.player?.lastName || '').localeCompare(b.player?.lastName || ''));
                              const awayBench = awayRosterPlayers.filter(rp => !activePlayerPositions.has(rp.playerId)).sort((a, b) => (a.player?.lastName || '').localeCompare(b.player?.lastName || ''));

                              if (homeBench.length === 0 && awayBench.length === 0) return null;

                              const maxBenchRows = Math.max(homeBench.length, awayBench.length);

                              const renderBenchPlayer = (rp: any | undefined) => {
                                if (!rp) return <div className="h-full" />;
                                const stats = liveStats.get(rp.playerId);
                                const plusMinus = (stats?.plus || 0) - (stats?.minus || 0);

                                return (
                                  <div
                                    draggable={isAuthToRecord}
                                    onDragStart={(e) => {
                                      if (!isAuthToRecord) { e.preventDefault(); return; }
                                      e.dataTransfer.setData('text/plain', JSON.stringify({ playerId: rp.playerId, teamId: rp.teamId, source: 'bench' }))
                                    }}
                                    className={cn("flex flex-col p-2 bg-gray-50/50 rounded border border-gray-200 shadow-sm w-full overflow-hidden opacity-60 hover:bg-gray-100/50 transition-colors", isAuthToRecord ? "cursor-grab active:cursor-grabbing" : "cursor-default")}
                                  >
                                    <span className="text-[10px] font-bold truncate text-gray-500" title={getPlayerShortName(rp.player, rp.teamId === currentGame?.homeTeamId ? homeRosterPlayers : awayRosterPlayers)}>
                                      {getPlayerShortName(rp.player, rp.teamId === currentGame?.homeTeamId ? homeRosterPlayers : awayRosterPlayers)}
                                    </span>
                                    <div className="flex items-center gap-1.5 mt-0.5 text-[8px] font-mono text-gray-400 justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <span>{stats?.g || 0}G</span>
                                        <span>{stats?.a || 0}A</span>
                                      </div>
                                      <span>{plusMinus > 0 ? '+' : ''}{plusMinus}</span>
                                    </div>
                                  </div>
                                );
                              };

                              return (
                                <div
                                  className="flex flex-col gap-2 relative mt-4 bg-transparent rounded-lg transition-colors p-1"
                                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.05)'; }}
                                  onDragLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                  onDrop={e => {
                                    e.preventDefault();
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    if (!isAuthToRecord) return;
                                    try {
                                      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                                      if (data.playerId && data.teamId && data.source === 'active') {
                                        handleCreateDraftEvent('sub_out', data.teamId, data.playerId, null, null);
                                      }
                                    } catch (err) { }
                                  }}
                                >
                                  <div className="text-[9px] uppercase font-bold text-gray-400 text-center tracking-widest bg-gray-100 py-0.5 rounded shadow-inner mb-1 pointer-events-none">
                                    Bench (Drag Here to Sub Out)
                                  </div>
                                  {Array.from({ length: maxBenchRows }).map((_, i) => (
                                    <div key={i} className="grid grid-cols-2 gap-4">
                                      {renderBenchPlayer(homeBench[i])}
                                      {renderBenchPlayer(awayBench[i])}
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}

                            {activePlayerPositions.size === 0 && (
                              <div className="text-center py-8 text-gray-400 text-sm font-medium italic">
                                No players currently checked in.
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className={cn("absolute inset-0 overflow-y-auto p-4 custom-scrollbar bg-gray-50", rightPanelTab === 'live_events' ? "block" : "hidden")} id="events-scroll-container">
                    <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-md pb-3 pt-1 mb-4 border-b border-gray-200/60 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => {
                            const container = document.getElementById('events-scroll-container');
                            if (!container) return;
                            const allCards = container.querySelectorAll('[data-event-time]');
                            let nearest: Element | null = null;
                            let bestDiff = Infinity;
                            allCards.forEach(card => {
                              const t = parseFloat(card.getAttribute('data-event-time') || '0');
                              const diff = Math.abs(t - currentTime);
                              if (diff < bestDiff) { bestDiff = diff; nearest = card; }
                            });
                            if (nearest) (nearest as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }}
                          className="flex items-center gap-1 px-3 py-1 rounded text-[10px] font-bold transition-all border bg-white text-gray-500 border-gray-200 hover:text-red-500 hover:border-red-300 shadow-sm"
                          title="Scroll to event nearest current time"
                        >
                          <SkipForward className="w-3 h-3" />
                          Now
                        </button>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mr-1">
                            {statsFilter === 'verified' ? `${activeTrackingEvents.filter(e => e.status === 'verified').length} verified` : `${activeTrackingEvents.length} events`}
                          </span>
                          <button
                            onClick={() => setStatsFilter(statsFilter === 'verified' ? 'all' : 'verified')}
                            className={cn('flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all border', statsFilter === 'verified' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' : 'bg-white text-gray-400 border-gray-200 hover:text-amber-500')}
                          >
                            <ShieldCheck className="w-3 h-3" /> {statsFilter === 'verified' ? 'Verified' : 'All'}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select value={eventsListTeamFilter} onChange={e => setEventsListTeamFilter(e.target.value)} className="flex-1 text-[10px] font-bold text-gray-600 bg-white border border-gray-200 rounded-md py-1.5 px-2 outline-none focus:border-red-300 focus:ring-1 focus:ring-red-200 shadow-sm text-center appearance-none">
                          <option value="all">All Teams</option>
                          {currentGame?.homeTeamId && <option value={currentGame.homeTeamId}>Home</option>}
                          {currentGame?.awayTeamId && <option value={currentGame.awayTeamId}>Away</option>}
                        </select>
                        <select value={eventsListEventFilter} onChange={e => setEventsListEventFilter(e.target.value)} className="flex-1 text-[10px] font-bold text-gray-600 bg-white border border-gray-200 rounded-md py-1.5 px-2 outline-none focus:border-red-300 focus:ring-1 focus:ring-red-200 shadow-sm text-center appearance-none">
                          <option value="all">All Types</option>
                          <option value="goal">Goals</option>
                          <option value="assist">Assists</option>
                          <option value="shot">Shots / Attempts</option>
                          <option value="turnover">Turnovers</option>
                          <option value="control_change">Control Change</option>
                          <option value="card">Cards / Fouls</option>
                          <option value="sub_in">Substitutions</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-4">
                    {(() => {
                      let displayEvents = [...activeTrackingEvents].sort((a,b) => a.videoTime - b.videoTime);
                      
                      if (statsFilter === 'verified') displayEvents = displayEvents.filter(e => e.status === 'verified');
                      if (eventsListTeamFilter !== 'all') displayEvents = displayEvents.filter(e => e.teamId === eventsListTeamFilter);
                      if (eventsListEventFilter !== 'all') {
                        if (eventsListEventFilter === 'sub_in') displayEvents = displayEvents.filter(e => e.type === 'sub_in' || e.type === 'sub_out');
                        else if (eventsListEventFilter === 'card') displayEvents = displayEvents.filter(e => e.type === 'foul' || e.type === 'card');
                        else if (eventsListEventFilter === 'shot') displayEvents = displayEvents.filter(e => e.type === 'shot' || e.type === 'attempt');
                        else if (eventsListEventFilter === 'control_change') displayEvents = displayEvents.filter(e => e.type === 'control_change' || e.type === 'control_start');
                        else displayEvents = displayEvents.filter(e => e.type === eventsListEventFilter);
                      }



                      return displayEvents.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center p-8">
                          <Clock className="w-12 h-12 mb-4 opacity-20" />
                          <p>{statsFilter === 'verified' ? 'No verified events yet.' : 'No events recorded yet.'}</p>
                          <p className="text-sm">{statsFilter === 'verified' ? 'Switch to All to see unverified events.' : 'Be the first to track a goal!'}</p>
                        </div>
                      ) : (
                        displayEvents.slice().reverse().map((event) => {
                          const eventConfig = EVENT_CONFIG[event.type as EventType] || { label: event.type, icon: <AlertCircle className="w-4 h-4" />, color: 'bg-neutral-500' };
                          const dynamicLabel = (event.type === 'sub_in' && event.position) ? `${event.position} In` : (event.type === 'sub_out' && event.position) ? `${event.position} Out` : eventConfig.label;
                          return (
                            <div
                              key={event.id}
                              data-event-time={event.videoTime}
                              className={cn(
                                "group border rounded-xl p-3 transition-all",
                                event.teamId === currentGame?.homeTeamId ? "bg-red-50/50 border-red-100 hover:border-red-200" :
                                  event.teamId === currentGame?.awayTeamId ? "bg-blue-50/50 border-blue-100 hover:border-blue-200" :
                                    "bg-white border-gray-200 hover:border-gray-300",
                                event.status === 'rejected' && "opacity-50 grayscale"
                              )}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div className={cn("p-1.5 rounded-md", eventConfig.color)}>
                                    {React.cloneElement(eventConfig.icon as React.ReactElement<any>, { className: 'w-3 h-3' })}
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <p className="font-mono text-xs font-bold text-gray-800 w-12 text-center">{formatTime(event.gameTime || 0)}</p>
                                    <p className="font-mono text-[9px] text-gray-400 w-12 text-center">({formatTime(event.videoTime)})</p>
                                  </div>
                                  <div className="flex flex-col justify-center gap-0.5 ml-1">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm font-bold capitalize">
                                        {dynamicLabel}
                                      </p>
                                      {event.status === 'verified' && (
                                        <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                                      )}
                                    </div>
                                    {(event.playerId || event.teamId) && (
                                      <div className="text-xs">
                                        {event.playerId ? (() => {
                                          const p = allPlayers.find(pl => pl.id === event.playerId);
                                          return p ? (
                                            <span className={cn("font-bold tracking-tight", event.teamId === currentGame?.homeTeamId ? "text-red-700" : event.teamId === currentGame?.awayTeamId ? "text-blue-700" : "text-gray-700")}>
                                              {p.firstName.charAt(0)}. {p.lastName}
                                            </span>
                                          ) : 'Player';
                                        })() : (() => {
                                          const t = teams.find(tm => tm.id === event.teamId);
                                          return t ? (
                                            <span className={cn("font-bold text-[9px] uppercase tracking-wider", event.teamId === currentGame?.homeTeamId ? "text-red-700" : event.teamId === currentGame?.awayTeamId ? "text-blue-700" : "text-gray-500")}>
                                              {t.name}
                                            </span>
                                          ) : 'Team';
                                        })()}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {(isAdmin || (event.userId === user?.uid && event.status !== 'verified')) && (
                                    <button
                                      onClick={() => { if (window.confirm('Delete this event permanently?')) handleDeleteRecordedEvent(event.id) }}
                                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors rounded flex items-center justify-center border border-transparent hover:border-red-100"
                                      title="Delete Event"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {event.status !== 'verified' && event.type === 'goal' && !event.playerId && ['trusted', 'author'].includes(effectiveRole) && (
                                    <button
                                      onClick={() => {
                                        const searchName = prompt("Enter player name or ID for goal:");
                                        if (searchName) {
                                          const p = allPlayers.find(pl => `${pl.firstName} ${pl.lastName}`.toLowerCase().includes(searchName.toLowerCase()) || pl.id === searchName);
                                          if (p) {
                                            handleUpdateEventPlayerId(event.id, p.id);
                                          } else {
                                            toast.error("Player not found.");
                                          }
                                        }
                                      }}
                                      className="text-[10px] bg-red-600/10 text-red-500 px-2 py-1 rounded hover:bg-red-600/20 transition-all font-bold tracking-tight uppercase border border-red-600/20"
                                      title="Add Player"
                                    >
                                      + Player
                                    </button>
                                  )}
                                  {event.status !== 'verified' && event.type === 'goal' && !enrichedEvents.some(e => e.type === 'assist' && e.relatedEventId === event.id) && ['trusted', 'author'].includes(effectiveRole) && (
                                    <button
                                      onClick={() => {
                                        setRightPanelTab('record');
                                        setDraftEvents(prev => [{
                                          id: crypto.randomUUID(), type: 'assist', videoTime: event.videoTime, gameTime: event.gameTime || 0, teamId: event.teamId || null, playerId: null, relatedEventId: event.id, assistedByPlayerId: null, position: null
                                        }, ...prev]);
                                      }}
                                      className="text-[10px] bg-blue-600/10 text-blue-500 px-2 py-1 rounded hover:bg-blue-600/20 transition-all font-bold tracking-tight uppercase border border-blue-600/20"
                                      title="Add Assist Event"
                                    >
                                      + Assist
                                    </button>
                                  )}
                                  <button
                                    onClick={() => player?.seekTo(event.videoTime)}
                                    className="text-[10px] font-mono bg-gray-100 hover:bg-red-600 px-2 py-1 rounded transition-colors"
                                  >
                                    Seek {formatTime(event.videoTime)}
                                  </button>
                                </div>
                              </div>

                              {event.relatedEventId && (
                                <div className="mb-2 pl-8 border-l-2 border-gray-200 text-[10px] text-gray-400 italic">
                                  Assisting: {enrichedEvents.find(e => e.id === event.relatedEventId)?.type || 'Event'}
                                  ({formatTime(enrichedEvents.find(e => e.id === event.relatedEventId)?.gameTime || 0)})
                                </div>
                              )}

                              <div className="flex items-center justify-between pt-2 border-t border-gray-200/50">
                                <div className="flex items-center gap-3">
                                  {isAdmin && (
                                    <button
                                      onClick={async () => {
                                        if (!user || !currentVideo) return;
                                        const newStatus = event.status === 'verified' ? 'unverified' : 'verified';
                                        // Optimistic local update
                                        setEvents(prev => prev.map(e => e.id === event.id ? { ...e, status: newStatus } : e));
                                        try {
                                          const gameRef = doc(db, 'gameEvents', currentVideo.gameId);
                                          const gameSnap = await getDoc(gameRef);
                                          if (!gameSnap.exists()) { toast.error('Game doc not found'); return; }
                                          const gameData = gameSnap.data();
                                          const currentEvents = gameData.events as GameEvent[] || [];
                                          const eventIndex = currentEvents.findIndex(e => e.id === event.id);
                                          if (eventIndex !== -1) {
                                            currentEvents[eventIndex] = { ...currentEvents[eventIndex], status: newStatus };
                                            await updateDoc(gameRef, { events: currentEvents });
                                            toast.success(newStatus === 'verified' ? '✓ Event verified' : 'Verification removed');
                                          }
                                        } catch (e) {
                                          console.error(e);
                                          toast.error('Failed to update verification');
                                          // Revert optimistic update
                                          setEvents(prev => prev.map(ev => ev.id === event.id ? { ...ev, status: event.status } : ev));
                                        }
                                      }}
                                      className={cn("p-1.5 rounded-lg transition-all border", event.status === 'verified' ? 'bg-amber-500/15 text-amber-500 border-amber-500/30 shadow-sm' : 'bg-gray-50 text-gray-300 border-gray-200 hover:text-amber-500 hover:border-amber-500 hover:bg-amber-50')}
                                      title={event.status === 'verified' ? "Remove Verification" : "Verify Event (Trusted Only)"}
                                    >
                                      <ShieldCheck className="w-4 h-4" />
                                    </button>
                                  )}
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs font-bold text-green-500">{event.upvotes || 0}</span>
                                    <CheckCircle2 className="w-3 h-3 text-green-500 opacity-50" />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs font-bold text-red-500">{event.downvotes || 0}</span>
                                    <XCircle className="w-3 h-3 text-red-500 opacity-50" />
                                  </div>
                                  <div className="h-3 w-px bg-gray-100 mx-1" />
                                  <span className={cn(
                                    "text-xs font-bold",
                                    event.votes > 0 ? "text-green-500" : event.votes < 0 ? "text-red-500" : "text-gray-400"
                                  )}>
                                    {event.votes > 0 ? `+${event.votes}` : event.votes}
                                  </span>
                                  <span className="text-[10px] text-gray-300 uppercase font-bold tracking-tighter">Net</span>
                                </div>
                                {(
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleVote(event.id, true)}
                                      className={cn(
                                        'p-1.5 rounded transition-all',
                                        event.upvoterIds?.includes(voterId)
                                          ? 'bg-green-500/20 text-green-600 ring-1 ring-green-500/30'
                                          : 'hover:bg-green-500/20 text-gray-400 hover:text-green-500'
                                      )}
                                      title="Accurate"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleVote(event.id, false)}
                                      className={cn(
                                        'p-1.5 rounded transition-all',
                                        event.downvoterIds?.includes(voterId)
                                          ? 'bg-red-500/20 text-red-600 ring-1 ring-red-500/30'
                                          : 'hover:bg-red-500/20 text-gray-400 hover:text-red-500'
                                      )}
                                      title="Inaccurate"
                                    >
                                      <XCircle className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      );
                    })()}
                    </div>
                  </div>

                  <div className={cn("absolute inset-0 overflow-y-auto custom-scrollbar bg-white", rightPanelTab === 'momentum' ? "block" : "hidden")}>
                    {rightPanelTab === 'momentum' && <MatchMomentumView events={enrichedEvents} teams={teams} homeTeamId={currentGame?.homeTeamId || ''} awayTeamId={currentGame?.awayTeamId || ''} currentTime={player?.getCurrentTime() || 0} onSeek={(t) => player?.seekTo(t, true)} />}
                  </div>
                </div>

                <div className="px-3 py-2 bg-white border-t border-gray-200 shrink-0">
                  <button
                    onClick={() => setCurrentVideo(null)}
                    className="w-full py-1 text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-gray-900 flex items-center justify-center gap-2 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Switch Video
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #262626;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #404040;
        }
      `}</style>
    </div>
  );
}
