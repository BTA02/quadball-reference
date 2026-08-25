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
  PlayCircle,
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
  FastForward,
  MapPin,
  RefreshCcw,
  X,
  Maximize2,
  CornerDownRight,
  Menu,
  MessageSquarePlus,
  Ban,
  Inbox,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal
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
  deleteField,
  serverTimestamp,
  increment,
  writeBatch,
  limit,
  collectionGroup,
  arrayUnion,
  arrayRemove,
  runTransaction
} from 'firebase/firestore';
import { auth, db, signIn, logOut, ensureAnonymousSession, handleFirestoreError, OperationType } from './lib/firebase';
import { userLabel } from './lib/userLabel';
import { cn } from './lib/utils';
import {
  TEAM_COMPLETION_LABELS,
  TEAM_COMPLETION_VALUES,
  gameMatchesScope,
  isFullyComplete,
  isPartiallyComplete,
  isPristineComplete,
  isTeamComplete,
  scopeEventsToCompleteTeams,
  sideCompletion,
  type CompletionScope,
  type TeamCompletion,
} from './lib/gameCompletion';
import {
  EventSuggestion,
  EventRevision,
  SuggestablePatch,
  SuggestionKind,
  suggestionId,
  diffEvent,
  baselineStillMatches,
  applyPatch,
  DeleteReason,
} from './lib/suggestions';
import SuggestionCard from './components/SuggestionCard';
import SuggestEditForm from './components/SuggestEditForm';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import QuadballStatsView from './components/QuadballStatsView';
import BeaterStatsView from './components/BeaterStatsView';
import SeekerStatsView from './components/SeekerStatsView';
import MatchMomentumView from './components/MatchMomentumView';
import PlayerProfileView from './components/PlayerProfileView';
import TeamProfileView from './components/TeamProfileView';
import ListsView from './components/ListsView';
import GameBoxScoreView from './components/GameBoxScoreView';
import StatsFilters from './components/StatsFilters';
import LandingHero from './components/LandingHero';
import GameCastView from './components/GameCastView';
import RecentEventsView from './components/RecentEventsView';
import { StatsTabSelector, StatsTabButton } from './components/ui/StatsTable';
import { enrichEventsWithGameTime, getScoreboardName } from './lib/statsComputations';
import TutorialOverlay from './components/tutorial/TutorialOverlay';
import { useTutorial } from './lib/tutorial/useTutorial';
import { TRACKER_STEPS } from './lib/tutorial/trackerSteps';
import { CREATE_STEPS } from './lib/tutorial/createSteps';
// --- Types ---

export type EventType = 'goal' | 'assist' | 'shot' | 'attempt' | 'miss_ko' | 'gameStart' | 'gamePause' | 'gameEnd' | 'foul' | 'card' | 'sub_in' | 'sub_out' | 'control_change' | 'turnover' | 'flag_released' | 'flag_catch' | 'control_start' | 'quadball_start';

export type PositionType = 'chaser' | 'keeper' | 'beater' | 'seeker';

type PlayerGender = 'M' | 'W' | 'NB';

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  nickname?: string;
  // Internal roster-eligibility field (gender the player competes under per IQA/USQ-style
  // mixed-gender rules). Intentionally NOT surfaced in any stats/profile/public UI —
  // admin-only, used for roster gender-ratio checks.
  gender?: PlayerGender;
  createdAt: any;
}

interface League {
  id: string;
  name: string;
  divisions?: string[];
  createdAt: any;
}

export interface Tournament {
  id: string;
  name: string;
  seasonId?: string;
  leagueId?: string;
  division?: string;
  year?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  createdAt: any;
}
interface Team {
  id: string;
  name: string;
  nickname?: string;
  colorPrimaryDark?: string;
  colorPrimaryLight?: string;
  colorAccent?: string;
  colorPrimary?: string; // legacy
  colorDark?: string; // legacy
  colorLight?: string; // legacy
  /**
   * @deprecated Team access used to be a list of email addresses on a world-readable doc.
   * Replaced by `memberUids`; the migration clears this.
   */
  emails?: string[];
  memberUids?: string[];
  leagueId?: string;
  division?: string;
  [k: string]: any;
}

interface Season {
  id: string;
  name: string;
  leagueId?: string;
  division?: string;
  year?: string;
  description?: string;
  createdAt: any;
  league?: string;
  tournamentId?: string;
}

/** Format a season for display: "<league> <division?> <year>"
 *  e.g. "MLQ 2024", "USQ Club 2022", "IQA 2023"
 *  Falls back to season.name if league info is unavailable. */
function getSeasonDisplayName(
  season: Season,
  leagues: League[]
): string {
  const league = season.leagueId ? leagues.find(l => l.id === season.leagueId) : null;
  const parts: string[] = [];
  
  if (league) {
    // Abbreviate: keep short words (≤3 chars like "US") intact, take first letter of longer words
    // "US Quadball" → "USQ", "Major League Quadball" → "MLQ", "IQA" stays "IQA"
    const words = league.name.split(/\s+/);
    const abbrev = words.length > 1
      ? words.map(w => w.length <= 3 ? w.toUpperCase() : w[0]?.toUpperCase()).join('')
      : league.name;
    parts.push(abbrev);
  }
  if (season.division) parts.push(season.division);
  if (season.year) parts.push(season.year);
  
  return parts.length > 0 ? parts.join(' ') : (season.name || season.id);
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

// Four tiers, in ascending order of power. Only 'moderator' needs a stored list — the rest
// fall out of the auth state. See docs/suggested-edits-design.md §5.
type UserRole = 'user' | 'author' | 'moderator' | 'admin';

export interface GameEvent {
  id: string;
  videoId: string; // Firestore ID of the video
  gameId: string; // Unique ID for the game
  userId: string;
  /**
   * @deprecated Real display names used to be denormalised into every event, in a
   * world-readable doc. The migration strips them; render `userLabel(userId)` instead.
   * Kept optional only so pre-migration data still parses.
   */
  userName?: string;
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
  swapPlayerId?: string | null; // For keeper cards: the on-field teammate swapping into keeper
}

export type PinType = 'sub' | 'control' | 'possession' | 'general';
export interface Pin {
  id: string;
  videoId: string;
  time: number;
  type: PinType;
}

interface Game {
  id: string; // Unique Game ID
  /**
   * Legacy whole-game completion flag. Superseded by the per-team fields below, but still
   * written as a mirror of "both sides complete" and read as a fallback for older games.
   * See lib/gameCompletion.ts.
   */
  isVerified?: boolean;
  homeCompletion?: TeamCompletion | null;
  awayCompletion?: TeamCompletion | null;
  seasonId: string;
  leagueId?: string;
  division?: string;
  tournamentId?: string;
  homeTeamId: string;
  awayTeamId: string;
  tag?: string;
  date?: string;
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
  miss_ko: { label: 'Miss (KO)', icon: <Activity className="w-4 h-4" />, color: 'bg-fuchsia-600' },
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

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const MEDIUM_GRAY = '#6b7280';
function avoidWhite(hex: string): string {
  const normalized = hex.trim().toLowerCase();
  return (normalized === '#ffffff' || normalized === '#fff' || normalized === 'white') ? MEDIUM_GRAY : hex;
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
  leagues: League[];
  tournaments: Tournament[];
  teams: Team[];
  seasons: Season[];
  players: Player[];
  videos: Video[];
  games: Game[];
  onAddLeague: (name: string, divisions?: string[]) => Promise<string | void | null>;
  onEditLeague: (id: string, newName: string, newDivisions?: string[]) => Promise<void>;
  onDeleteLeague: (id: string) => void;
  onAddTournament: (name: string, leagueId?: string, division?: string, year?: string, startDate?: string, endDate?: string, location?: string) => Promise<string | void | null>;
  onEditTournament: (id: string, name: string, leagueId?: string, division?: string, year?: string, startDate?: string, endDate?: string, location?: string) => Promise<void>;
  onDeleteTournament: (id: string) => void;
  onAddTeam: (name: string, leagueId?: string, division?: string) => Promise<string | void | null>;
  onAddSeason: (name: string, leagueId: string, division: string | undefined, year: string, description: string) => Promise<string | void | null>;
  onAddPlayer: (firstName: string, lastName: string, preferredName?: string, nickname?: string, gender?: PlayerGender) => Promise<string | void | null>;
  onAddPlayerToRoster: (rosterId: string, playerId: string, number: string) => void;
  onRemovePlayerFromRoster: (rosterId: string, playerId: string) => void;
  onCreateRoster: (teamId: string, seasonId: string) => Promise<string | void | null>;
  onEditTeamEmails: (id: string, memberUids: string[]) => void;
  onDeleteTeam: (id: string) => void;
  onDeleteGame: (id: string, tag?: string | null) => void;
  onDeleteVideo: (id: string) => void;
  onDeleteSeason: (id: string) => void;
  onEditSeason: (id: string, newName: string, newLeagueId: string, newDivision: string | undefined, newYear: string, newDescription: string) => Promise<void>;
  onDeletePlayer: (id: string) => void;
  onEditPlayer: (id: string, newFirst: string, newLast: string, gender?: PlayerGender) => Promise<void>;
  onDeleteRoster: (id: string) => void;
  onSetLocalSimulation?: (data: any) => void;
  onRunMigration: () => Promise<void>;
  onBackfillAuthorId?: () => Promise<number | undefined>;
  isAdmin?: boolean;
  onAddRole?: (uid: string) => Promise<void>;
  onRemoveRole?: (uid: string) => Promise<void>;
  onRefreshData?: () => void;
  moderatorUids?: string[];
  activeTab?: 'leagues' | 'tournaments' | 'search' | 'teams' | 'seasons' | 'players' | 'rosters' | 'games' | 'videos' | 'roles' | 'events' | 'import' | 'merge';
  setActiveTab?: (tab: 'leagues' | 'tournaments' | 'search' | 'teams' | 'seasons' | 'players' | 'rosters' | 'games' | 'videos' | 'roles' | 'events' | 'import' | 'merge') => void;
}

function GameEditRow({ game: g, seasons, teams, videos, leagues, tournaments, onDeleteGame, onRefreshData, isAdmin }: {
  game: any; seasons: any[]; teams: any[]; videos: any[]; leagues?: any[]; tournaments?: any[];
  onDeleteGame: (id: string, tag?: string | null) => void;
  onRefreshData?: () => void;
  isAdmin?: boolean;
}) {
  const matchedVideo = videos.find((v: any) => v.gameId === g.id);
  const [seasonId, setSeasonId] = useState(g.seasonId);
  const [homeTeamId, setHomeTeamId] = useState(g.homeTeamId);
  const [awayTeamId, setAwayTeamId] = useState(g.awayTeamId);
  const [leagueId, setLeagueId] = useState(g.leagueId || '');
  const [division, setDivision] = useState(g.division || '');
  const [tournamentId, setTournamentId] = useState(g.tournamentId || '');
  const [tag, setTag] = useState(g.tag || '');
  const [date, setDate] = useState(g.date || '');
  const [saving, setSaving] = useState(false);

  const handleTournamentChange = (tId: string) => {
    setTournamentId(tId);
    if (!tId) return;
    const t = tournaments?.find(x => x.id === tId);
    if (t) {
      if (t.leagueId) setLeagueId(t.leagueId);
      if (t.division) setDivision(t.division);
      const matchedSeason = seasons.find(s => s.leagueId === t.leagueId && s.year === t.year && s.division === t.division);
      if (matchedSeason) setSeasonId(matchedSeason.id);
    }
  };

  const hasChanges = seasonId !== g.seasonId || leagueId !== (g.leagueId || '') || division !== (g.division || '') || tournamentId !== (g.tournamentId || '') || homeTeamId !== g.homeTeamId || awayTeamId !== g.awayTeamId || tag !== (g.tag || '') || date !== (g.date || '');

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Update the individual game document
      const updatePayload: any = {
        homeTeamId, awayTeamId, tag: tag || null, date: date || null, tournamentId: tournamentId || null
      };
      
      if (tournamentId) {
         updatePayload.seasonId = deleteField();
         updatePayload.leagueId = deleteField();
         updatePayload.division = deleteField();
      } else if (seasonId) {
         updatePayload.seasonId = seasonId;
         updatePayload.leagueId = deleteField();
         updatePayload.division = deleteField();
      } else {
         updatePayload.seasonId = deleteField();
         updatePayload.leagueId = leagueId || null;
         updatePayload.division = division || null;
      }

      await updateDoc(doc(db, 'games', g.id), updatePayload);

      // 2. Update the aggregated games array safely: read → find by id → replace → write back
      const aggRef = doc(db, 'aggregated', 'games');
      const aggSnap = await getDoc(aggRef);
      if (aggSnap.exists()) {
        const aggData = aggSnap.data().data || [];
        const updatedAgg = aggData.map((entry: any) => {
          if (entry.id !== g.id) return entry;
          const newEntry = { ...entry, homeTeamId, awayTeamId, tag: tag || null, date: date || null, tournamentId: tournamentId || null };
          if (tournamentId) {
             delete newEntry.seasonId;
             delete newEntry.leagueId;
             delete newEntry.division;
          } else if (seasonId) {
             newEntry.seasonId = seasonId;
             delete newEntry.leagueId;
             delete newEntry.division;
          } else {
             delete newEntry.seasonId;
             newEntry.leagueId = leagueId || null;
             newEntry.division = division || null;
          }
          return newEntry;
        });
        await updateDoc(aggRef, { data: updatedAgg });
      }

      toast.success('Game updated');
      onRefreshData?.();
    } catch (err) {
      toast.error('Failed to save game changes');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-3 hover:bg-gray-200/50 transition-colors group border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between border-b border-gray-200/50 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded border border-gray-200 text-gray-600">
            {g.id}
          </span>
          <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-200 hidden md:block">YT: {matchedVideo?.youtubeId || 'No URL attached'}</span>
          {isAdmin && matchedVideo && (
            <span className="text-[10px] text-amber-500 bg-amber-50 px-2 py-1 rounded border border-amber-200 hidden md:block font-mono">VID: {matchedVideo.id}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-all shadow-sm flex items-center gap-1.5 text-[10px] uppercase font-bold disabled:opacity-50"
            >
              <CheckCircle2 className="w-3 h-3" /> {saving ? 'Saving...' : 'Save'}
            </button>
          )}
          <button
            onClick={() => onDeleteGame(g.id, g.tag)}
            className="px-2 py-1 bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-500 hover:bg-red-50 rounded-md transition-all shadow-sm flex items-center gap-1 text-[10px] uppercase font-bold"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-8 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Tournament</label>
          <select
            value={tournamentId}
            onChange={(e) => handleTournamentChange(e.target.value)}
            className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500", tournamentId !== (g.tournamentId || '') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')}
          >
            <option value="">None</option>
            {tournaments?.map((t: any) => <option key={t.id} value={t.id}>{t.division ? `(${t.division}) ` : ''}{t.name}</option>)}
          </select>
        </div>
        {!tournamentId && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-gray-400">Season</label>
              <select
                value={seasonId}
                onChange={(e) => setSeasonId(e.target.value)}
                className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500", seasonId !== g.seasonId ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')}
              >
                {seasons.map((s: any) => <option key={s.id} value={s.id}>{getSeasonDisplayName(s, leagues)}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">League</label>
              <select
                value={leagueId}
                onChange={(e) => {
                  setLeagueId(e.target.value);
                  setDivision('');
                }}
                className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500", leagueId !== (g.leagueId || '') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')}
              >
                <option value="">None</option>
                {leagues?.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Div</label>
              <select
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500", division !== (g.division || '') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')}
              >
                <option value="">None</option>
                {leagues?.find(l => l.id === leagueId)?.divisions?.map((d: string) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Home Team</label>
          <select
            value={homeTeamId}
            onChange={(e) => setHomeTeamId(e.target.value)}
            className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500", homeTeamId !== g.homeTeamId ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')}
          >
            {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name || t.id}{t.division ? ` (${t.division})` : ''}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Away Team</label>
          <select
            value={awayTeamId}
            onChange={(e) => setAwayTeamId(e.target.value)}
            className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500", awayTeamId !== g.awayTeamId ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')}
          >
            {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name || t.id}{t.division ? ` (${t.division})` : ''}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Description Tag</label>
          <input
            type="text"
            placeholder="e.g. Finals Match 1"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500 font-medium w-full", tag !== (g.tag || '') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-gray-400 pl-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500 font-medium w-full", date !== (g.date || '') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')}
          />
        </div>
      </div>
    </div>
  );
}

function TeamEditRow({ team: t, onDeleteTeam, onRefreshData }: {
  team: Team;
  onDeleteTeam: (id: string) => void;
  onRefreshData?: () => void;
}) {
  const [name, setName] = useState(t.name || '');
  const [nickname, setNickname] = useState(t.nickname || '');
  const [colorPrimaryDark, setColorPrimaryDark] = useState(t.colorPrimaryDark || t.colorPrimary || '#dc2626');
  const [colorAccent, setColorAccent] = useState(t.colorAccent || t.colorDark || '#000000');
  const [colorPrimaryLight, setColorPrimaryLight] = useState(t.colorPrimaryLight || t.colorLight || '#ffffff');
  const [memberUids, setMemberUids] = useState((t.memberUids || []).join(', '));
  const [saving, setSaving] = useState(false);

  const hasChanges =
    name !== (t.name || '') ||
    nickname !== (t.nickname || '') ||
    colorPrimaryDark !== (t.colorPrimaryDark || t.colorPrimary || '#dc2626') ||
    colorAccent !== (t.colorAccent || t.colorDark || '#000000') ||
    colorPrimaryLight !== (t.colorPrimaryLight || t.colorLight || '#ffffff') ||
    memberUids !== (t.memberUids || []).join(', ');

  const handleSave = async () => {
    setSaving(true);
    try {
      const memberList = memberUids.split(',').map(u => u.trim()).filter(u => u);
      const updates: any = { name, nickname: nickname || null, colorPrimaryDark, colorAccent, colorPrimaryLight, memberUids: memberList };

      await updateDoc(doc(db, 'teams', t.id), updates);

      const aggRef = doc(db, 'aggregated', 'teams');
      const aggSnap = await getDoc(aggRef);
      if (aggSnap.exists()) {
        const arr = (aggSnap.data().data || []) as any[];
        const updated = arr.map(a => a.id === t.id ? { ...a, ...updates } : a);
        await updateDoc(aggRef, { data: updated });
      }

      toast.success('Team updated');
      onRefreshData?.();
    } catch (err) {
      toast.error('Failed to save team changes');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-3 hover:bg-gray-50/50 transition-colors group border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between border-b border-gray-200/50 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded border border-gray-200 text-gray-600">{t.id}</span>
          <span className="font-bold text-sm text-gray-900">{t.name}</span>
          {t.nickname && <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">"{t.nickname}"</span>}
          <div className="flex items-center gap-0.5 ml-1">
            <div className="w-3.5 h-3.5 rounded-sm border border-gray-300 shadow-inner" style={{ backgroundColor: t.colorPrimaryDark || t.colorPrimary || '#dc2626' }} title="Primary Dark" />
            <div className="w-3.5 h-3.5 rounded-sm border border-gray-300 shadow-inner" style={{ backgroundColor: t.colorAccent || t.colorDark || '#000000' }} title="Accent" />
            <div className="w-3.5 h-3.5 rounded-sm border border-gray-300 shadow-inner" style={{ backgroundColor: t.colorPrimaryLight || t.colorLight || '#ffffff' }} title="Primary Light" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button onClick={handleSave} disabled={saving} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-all shadow-sm flex items-center gap-1.5 text-[10px] uppercase font-bold disabled:opacity-50">
              <CheckCircle2 className="w-3 h-3" /> {saving ? 'Saving...' : 'Save'}
            </button>
          )}
          <button onClick={() => { if (confirm(`Delete team ${t.name}?`)) onDeleteTeam(t.id); }} className="px-2 py-1 bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-500 hover:bg-red-50 rounded-md transition-all shadow-sm flex items-center gap-1 text-[10px] uppercase font-bold">
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-gray-400">Full Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500 font-medium", name !== (t.name || '') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-gray-400">Nickname <span className="text-gray-300 normal-case font-normal">(short name)</span></label>
          <input type="text" placeholder="e.g. Outlaws" value={nickname} onChange={(e) => setNickname(e.target.value)} className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500 font-medium", nickname !== (t.nickname || '') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-gray-400">Colors</label>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <input type="color" value={colorPrimaryDark} onChange={(e) => setColorPrimaryDark(e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-gray-200 p-0.5" title="Primary Dark Color" />
              <span className="text-[10px] text-gray-400 font-medium">Primary Dark</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input type="color" value={colorAccent} onChange={(e) => setColorAccent(e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-gray-200 p-0.5" title="Accent Color" />
              <span className="text-[10px] text-gray-400 font-medium">Accent</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input type="color" value={colorPrimaryLight} onChange={(e) => setColorPrimaryLight(e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-gray-200 p-0.5" title="Primary Light Color" />
              <span className="text-[10px] text-gray-400 font-medium">Primary Light</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase font-bold text-gray-400">Team Managers <span className="text-gray-300 normal-case font-normal">(user IDs, comma-separated)</span></label>
        {/* User IDs rather than emails: this doc is world-readable, so addresses here would be
            public. A user copies their own ID from the chip in the site header. */}
        <input type="text" placeholder="Paste user IDs" value={memberUids} onChange={(e) => setMemberUids(e.target.value)} className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500 font-mono w-full", memberUids !== (t.memberUids || []).join(', ') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')} />
        {(t.memberUids || []).length > 0 && (
          <p className="text-[10px] text-gray-400">{(t.memberUids || []).map((u: string) => userLabel(u)).join(', ')}</p>
        )}
      </div>
    </div>
  );
}

function SeasonEditRow({ season: s, leagues, tournaments, onEditSeason, onDeleteSeason }: any) {
  const [tournamentId, setTournamentId] = useState(s.tournamentId || '');
  const [year, setYear] = useState(s.year || '');
  const [leagueId, setLeagueId] = useState(s.leagueId || '');
  const [division, setDivision] = useState(s.division || '');
  const [saving, setSaving] = useState(false);

  const hasChanges = 
    tournamentId !== (s.tournamentId || '') ||
    year !== (s.year || '') ||
    leagueId !== (s.leagueId || '') ||
    division !== (s.division || '');

  const handleSave = async () => {
    setSaving(true);
    try {
      const selectedLeagueName = leagues.find((l: any) => l.id === leagueId)?.name || 'Unknown';
      const divStr = division.trim() ? ` (${division.trim()})` : '';
      const newName = `${selectedLeagueName}${divStr} ${year}`;
      await onEditSeason(s.id, newName, leagueId, division.trim() || undefined, year, tournamentId);
    } finally {
      setSaving(false);
    }
  };

  const leagueName = leagues.find((l: any) => l.id === s.leagueId)?.name || 'Unknown';

  return (
    <div className="p-4 flex flex-col gap-3 hover:bg-gray-50/50 transition-colors group border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between border-b border-gray-200/50 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded border border-gray-200 text-gray-600">{s.id}</span>
          <span className="font-bold text-sm text-gray-900">{getSeasonDisplayName(s, leagues)}</span>
          <span className="text-[10px] text-gray-400 uppercase">League: {leagueName} | Div: {s.division || 'None'} | Year: {s.year || 'Unknown'}</span>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button onClick={handleSave} disabled={saving} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-all shadow-sm flex items-center gap-1.5 text-[10px] uppercase font-bold disabled:opacity-50">
              <CheckCircle2 className="w-3 h-3" /> {saving ? 'Saving...' : 'Save'}
            </button>
          )}
          <button onClick={() => { if (confirm(`Delete season ${s.name}?`)) onDeleteSeason(s.id); }} className="px-2 py-1 bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-500 hover:bg-red-50 rounded-md transition-all shadow-sm flex items-center gap-1 text-[10px] uppercase font-bold">
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-gray-400">Championship Tournament</label>
          <select value={tournamentId} onChange={(e) => setTournamentId(e.target.value)} className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500", tournamentId !== (s.tournamentId || '') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')}>
            <option value="">None</option>
            {tournaments?.map((t: any) => <option key={t.id} value={t.id}>{t.division ? `(${t.division}) ` : ''}{t.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-gray-400">Year</label>
          <input type="text" placeholder="e.g. 2024" value={year} onChange={(e) => setYear(e.target.value)} className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500 font-medium", year !== (s.year || '') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-gray-400">League</label>
          <select value={leagueId} onChange={(e) => { setLeagueId(e.target.value); setDivision(''); }} className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500", leagueId !== (s.leagueId || '') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')}>
            <option value="">None</option>
            {leagues.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-gray-400">Division</label>
          <select value={division} onChange={(e) => setDivision(e.target.value)} className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500", division !== (s.division || '') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')}>
            <option value="">None</option>
            {leagues.find((l: any) => l.id === leagueId)?.divisions?.map((d: string) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

function PlayerEditRow({
  player: p,
  allRosterPlayers,
  rosters,
  teams,
  seasons,
  leagues: leaguesProp = [],
  onEditPlayer,
  onDeletePlayer,
  initialGender,
  showGenderField = false
}: {
  player: any;
  allRosterPlayers: any[];
  rosters: any[];
  teams: any[];
  seasons: any[];
  leagues?: any[];
  onEditPlayer: (id: string, f: string, l: string, gender?: PlayerGender) => void;
  onDeletePlayer: (id: string) => void;
  // Roster-eligibility gender. Only ever passed in (and only ever editable) from the
  // admin-only Manage Players panel — never wired up in the public/contributor-facing
  // create flow, and never rendered as read-only text anywhere in this component.
  initialGender?: PlayerGender;
  showGenderField?: boolean;
}) {
  const [firstName, setFirstName] = useState(p.firstName || '');
  const [lastName, setLastName] = useState(p.lastName || '');
  const [gender, setGender] = useState<PlayerGender | ''>(initialGender || '');
  const [saving, setSaving] = useState(false);

  // initialGender arrives asynchronously (fetched separately from the players list itself,
  // after this row has already mounted with initialGender=undefined), so the useState
  // initializer above only catches it if the fetch happens to beat the render. Re-sync
  // whenever the real value shows up, unless the user already has an unsaved edit pending.
  useEffect(() => {
    if (gender === (initialGender || '')) return;
    if (saving) return;
    setGender(initialGender || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGender]);

  const hasChanges = firstName !== (p.firstName || '') || lastName !== (p.lastName || '') || (showGenderField && gender !== (initialGender || ''));

  const pRosters = allRosterPlayers.filter((rp: any) => rp.playerId === p.id);

  return (
    <div className="p-4 flex flex-col gap-3 hover:bg-gray-50/50 transition-colors group border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between border-b border-gray-200/50 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] bg-gray-100 px-2 py-1 rounded border border-gray-200 text-gray-600">ID: {p.id}</span>
          <span className="font-bold text-sm text-gray-900">{p.firstName} {p.lastName}</span>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              onClick={async () => {
                setSaving(true);
                await onEditPlayer(p.id, firstName, lastName, showGenderField ? (gender || undefined) : undefined);
                setSaving(false);
              }}
              disabled={saving}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-all shadow-sm flex items-center gap-1.5 text-[10px] uppercase font-bold disabled:opacity-50"
            >
              <CheckCircle2 className="w-3 h-3" /> {saving ? 'Saving...' : 'Save'}
            </button>
          )}
          <button
            onClick={() => { if (confirm(`Delete player ${p.firstName} ${p.lastName}?`)) onDeletePlayer(p.id); }}
            className="px-2 py-1 bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-500 hover:bg-red-50 rounded-md transition-all shadow-sm flex items-center gap-1 text-[10px] uppercase font-bold"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-gray-400">First Name</label>
          <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500 font-medium", firstName !== (p.firstName || '') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-gray-400">Last Name</label>
          <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500 font-medium", lastName !== (p.lastName || '') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')} />
        </div>
        {showGenderField && (
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-[10px] uppercase font-bold text-gray-400">Gender (Internal — Never Displayed)</label>
            <select value={gender} onChange={(e) => setGender(e.target.value as PlayerGender | '')} className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500 font-medium", gender !== (initialGender || '') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')}>
              <option value="">Unset</option>
              <option value="M">Man (M)</option>
              <option value="W">Woman (W)</option>
              <option value="NB">Non-binary (NB)</option>
            </select>
          </div>
        )}
      </div>

      {pRosters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {pRosters.map((rp: any) => {
            const r = rosters.find((ro: any) => ro.id === rp.rosterId);
            const t = teams.find((tm: any) => tm.id === r?.teamId);
            const s = seasons.find((se: any) => se.id === r?.seasonId);
            if (!t || !s) return null;
            return (
              <span key={rp.rosterId} className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200 font-medium">
                {t.name} ({getSeasonDisplayName(s, leaguesProp)})
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UnifiedRosterEditor({
  teams, seasons, players, rosters, rosterPlayers, leagues: leaguesProp = [],
  selectedRosterId, setSelectedRosterId,
  onAddTeam, onAddPlayer, onAddPlayerToRoster, onRemovePlayerFromRoster,
  onCreateRoster, onDeleteRoster
}: any) {
  const [teamSelection, setTeamSelection] = useState('');
  const [seasonSelection, setSeasonSelection] = useState('');
  const [rosterSearch, setRosterSearch] = useState('');

  // Free-text filter over the existing rosters list: team name, division,
  // league or season all match, so "outlaws", "college" and "2026" all work.
  const filteredRosters = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    if (!q) return rosters;
    return rosters.filter((r: any) => {
      const team = teams.find((t: any) => t.id === r.teamId);
      const season = seasons.find((s: any) => s.id === r.seasonId);
      return [team?.name, team?.division, team?.league, season ? getSeasonDisplayName(season, leaguesProp) : '']
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rosters, teams, seasons, leaguesProp, rosterSearch]);
  
  // Upsert Flow State
  const [searchName, setSearchName] = useState('');
  const [searchJersey, setSearchJersey] = useState('');
  const [stagedPlayerId, setStagedPlayerId] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const jerseyInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedRoster = rosters.find((r: any) => r.id === selectedRosterId);

  // Compute matching players for the dropdown
  const matchingPlayers = useMemo(() => {
    if (!searchName.trim()) return [];
    const query = searchName.toLowerCase().trim();
    return players
      .filter((p: any) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [searchName, players]);

  // Handle keyboard navigation in the name input / dropdown
  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (!isDropdownOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => Math.min(prev + 1, matchingPlayers.length)); // +1 for "Create new" option
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex === matchingPlayers.length) {
        // "Create new" selected
        setStagedPlayerId(null);
        setIsDropdownOpen(false);
        jerseyInputRef.current?.focus();
      } else if (focusedIndex >= 0 && focusedIndex < matchingPlayers.length) {
        // Existing player selected
        const p = matchingPlayers[focusedIndex];
        setSearchName(`${p.firstName} ${p.lastName}`);
        setStagedPlayerId(p.id);
        setIsDropdownOpen(false);
        jerseyInputRef.current?.focus();
      } else if (matchingPlayers.length > 0) {
         // Default to first match if they hit enter without arrowing
        const p = matchingPlayers[0];
        setSearchName(`${p.firstName} ${p.lastName}`);
        setStagedPlayerId(p.id);
        setIsDropdownOpen(false);
        jerseyInputRef.current?.focus();
      } else {
        // No matches, implicitly "Create new"
        setStagedPlayerId(null);
        setIsDropdownOpen(false);
        jerseyInputRef.current?.focus();
      }
    } else if (e.key === 'Tab') {
       if (focusedIndex >= 0 && focusedIndex < matchingPlayers.length) {
          const p = matchingPlayers[focusedIndex];
          setSearchName(`${p.firstName} ${p.lastName}`);
          setStagedPlayerId(p.id);
       } else if (focusedIndex === -1 && matchingPlayers.length > 0) {
          // Default to first match on tab if nothing selected
          const p = matchingPlayers[0];
          setSearchName(`${p.firstName} ${p.lastName}`);
          setStagedPlayerId(p.id);
       } else {
         setStagedPlayerId(null); // Explicitly create new
       }
       setIsDropdownOpen(false);
       // Browser handles moving focus to jersey
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  const handleUpsertSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoster) return;
    if (!searchName.trim()) {
      toast.error('Player name is required');
      return;
    }

    let activePlayerId = stagedPlayerId;

    // If no existing player selected, create a new one
    if (!activePlayerId) {
      const parts = searchName.trim().split(/\s+/);
      const fName = parts[0];
      const lName = parts.slice(1).join(' ');
      if (!fName || !lName) {
        toast.error('Please enter both a first and last name to create a new player');
        nameInputRef.current?.focus();
        return;
      }
      const newId = await onAddPlayer(fName, lName);
      if (!newId) return; // Error handled inside onAddPlayer
      activePlayerId = newId;
      toast.success(`Created new player: ${fName} ${lName}`);
    }

    // Add to roster
    await onAddPlayerToRoster(selectedRoster.id, activePlayerId, searchJersey.trim());
    
    // Reset and refocus
    setSearchName('');
    setSearchJersey('');
    setStagedPlayerId(null);
    setFocusedIndex(-1);
    nameInputRef.current?.focus();
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          nameInputRef.current && !nameInputRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
      {/* Left Column: Selector & List */}
      <div className="lg:col-span-1 flex flex-col gap-6 max-h-[calc(100vh-200px)]">
        
        {/* Selector */}
        <div data-tour="create-roster-select" className="bg-gray-50 border border-gray-200 rounded-2xl p-5 shrink-0">
          <h3 className="text-base font-bold mb-3">Select / Create Roster</h3>
          <div className="space-y-3">
            <select className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500" value={teamSelection} onChange={e => setTeamSelection(e.target.value)}>
              <option value="">-- Select Team --</option>
              {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}{t.division ? ` (${t.division})` : ''}</option>)}
            </select>
            <select className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500" value={seasonSelection} onChange={e => setSeasonSelection(e.target.value)}>
              <option value="">-- Select Season --</option>
              {seasons.map((s: any) => <option key={s.id} value={s.id}>{getSeasonDisplayName(s, leaguesProp)}</option>)}
            </select>
            <button
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!teamSelection || !seasonSelection}
              onClick={async () => {
                if (teamSelection && seasonSelection) {
                  const id = await onCreateRoster(teamSelection, seasonSelection);
                  if (id) setSelectedRosterId(id);
                }
              }}
            >
              Select Roster
            </button>
          </div>
        </div>

        {/* Existing Rosters List */}
        <div data-tour="create-roster-list" className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-[300px]">
          <div className="p-3 bg-gray-100 border-b border-gray-200 shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">Existing Rosters</span>
              <span className="text-xs text-gray-400 font-medium">
                {rosterSearch.trim() ? `${filteredRosters.length} of ${rosters.length}` : `${rosters.length} items`}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={rosterSearch}
                onChange={e => setRosterSearch(e.target.value)}
                placeholder="Search team or season..."
                className="w-full bg-white border border-gray-200 rounded-lg pl-8 pr-8 py-1.5 text-sm outline-none focus:border-red-500"
              />
              {rosterSearch && (
                <button
                  onClick={() => setRosterSearch('')}
                  title="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-600 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div className="overflow-y-auto custom-scrollbar flex-1 divide-y divide-gray-200">
            {filteredRosters.map((r: any) => {
              const team = teams.find((t: any) => t.id === r.teamId);
              const season = seasons.find((s: any) => s.id === r.seasonId);
              return (
                <div key={r.id} className={cn("p-3 flex justify-between items-center cursor-pointer transition-colors group text-sm", selectedRosterId === r.id ? "bg-white border-l-4 border-red-500 shadow-sm" : "hover:bg-white")} onClick={() => setSelectedRosterId(r.id)}>
                  <div className={selectedRosterId === r.id ? "-ml-1" : ""}>
                    <p className="font-bold text-gray-900">{team?.name || 'Unknown Team'}</p>
                    <p className="text-xs text-gray-500">{season ? getSeasonDisplayName(season, leaguesProp) : 'Unknown Season'}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete roster?')) onDeleteRoster(r.id); }} className="p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-red-50"><XCircle className="w-4 h-4" /></button>
                </div>
              )
            })}
            {rosters.length === 0 && <div className="p-6 text-center text-sm text-gray-400">No rosters found.</div>}
            {rosters.length > 0 && filteredRosters.length === 0 && (
              <div className="p-6 text-center text-sm text-gray-400">No rosters match "{rosterSearch}".</div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Editor & Players */}
      <div className="lg:col-span-2 flex flex-col gap-6 max-h-[calc(100vh-200px)]">
        {selectedRoster ? (
          <>
            {/* Keyboard Upsert Flow */}
            <div data-tour="create-quick-add" className="bg-white border-2 border-red-100 rounded-2xl p-5 shadow-sm shrink-0">
              <h3 className="text-sm font-bold text-red-900 mb-3 flex items-center gap-2 uppercase tracking-wider">
                <Zap className="w-4 h-4" /> Quick Add Player
              </h3>
              
              <form onSubmit={handleUpsertSubmit} className="flex gap-3 relative">
                <div className="flex-1 relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                  <input 
                    ref={nameInputRef}
                    type="text"
                    placeholder="Type name (e.g., John Smith)..." 
                    value={searchName} 
                    onChange={e => {
                      setSearchName(e.target.value);
                      setStagedPlayerId(null);
                      setIsDropdownOpen(true);
                      setFocusedIndex(-1);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    onKeyDown={handleNameKeyDown}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-100 transition-all font-medium" 
                  />
                  
                  {/* Autocomplete Dropdown */}
                  {isDropdownOpen && searchName.trim().length > 0 && (
                    <div ref={dropdownRef} className="absolute z-20 top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden divide-y divide-gray-100">
                      {matchingPlayers.map((p: any, idx: number) => (
                        <div 
                          key={p.id} 
                          onClick={() => {
                            setSearchName(`${p.firstName} ${p.lastName}`);
                            setStagedPlayerId(p.id);
                            setIsDropdownOpen(false);
                            jerseyInputRef.current?.focus();
                          }}
                          className={cn(
                            "px-4 py-3 cursor-pointer text-sm flex items-center justify-between transition-colors",
                            focusedIndex === idx ? "bg-red-50" : "hover:bg-gray-50"
                          )}
                        >
                          <span className="font-bold text-gray-900">{p.firstName} {p.lastName}</span>
                          <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Existing</span>
                        </div>
                      ))}
                      
                      <div 
                        onClick={() => {
                          setStagedPlayerId(null);
                          setIsDropdownOpen(false);
                          jerseyInputRef.current?.focus();
                        }}
                        className={cn(
                          "px-4 py-3 cursor-pointer text-sm flex items-center gap-2 transition-colors",
                          focusedIndex === matchingPlayers.length ? "bg-red-50" : "hover:bg-gray-50"
                        )}
                      >
                        <Plus className="w-4 h-4 text-emerald-500" />
                        <span className="font-bold text-emerald-700">Create new player: "{searchName}"</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-24 relative shrink-0">
                  <input 
                    ref={jerseyInputRef}
                    type="text" 
                    placeholder="Jersey #" 
                    value={searchJersey} 
                    onChange={e => setSearchJersey(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono outline-none focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-100 transition-all text-center" 
                  />
                </div>

                <button 
                  type="submit"
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-md hover:shadow-lg shrink-0 flex items-center gap-2"
                >
                  Save <span className="text-red-200 font-normal text-xs ml-1 font-mono">↵</span>
                </button>
              </form>
              <div className="mt-3 text-[10px] text-gray-400 font-medium flex items-center gap-4">
                <span><kbd className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">Tab</kbd> to jump between fields</span>
                <span><kbd className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">↑</kbd> <kbd className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">↓</kbd> to select existing</span>
                <span><kbd className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">Enter</kbd> to save</span>
              </div>
            </div>

            {/* Current Roster */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden flex flex-col flex-1">
              <div className="p-4 bg-gray-100 font-bold border-b border-gray-200 flex items-center justify-between shrink-0">
                <span>Players in Roster</span>
                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">{rosterPlayers.length}</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto custom-scrollbar flex-1">
                {rosterPlayers.map((rp: any) => (
                  <div key={rp.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200 group hover:border-gray-300 transition-colors shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-sm font-bold text-gray-700 font-mono border border-gray-200">
                        {rp.number || '-'}
                      </div>
                      <span className="font-bold text-sm text-gray-900">{rp.player?.firstName} {rp.player?.lastName}</span>
                    </div>
                    <button
                      onClick={() => { if (confirm('Remove player from roster?')) onRemovePlayerFromRoster(selectedRosterId, rp.playerId); }}
                      className="p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {rosterPlayers.length === 0 && (
                  <div className="col-span-full py-12 text-center text-gray-400 flex flex-col items-center">
                    <User className="w-8 h-8 mb-3 opacity-20" />
                    <p>No players currently in this roster.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl flex-1 flex flex-col items-center justify-center text-center text-gray-400 p-12">
            <User className="w-16 h-16 mx-auto mb-4 text-gray-200" />
            <p className="text-xl font-bold text-gray-400 mb-2">No Roster Selected</p>
            <p>Select a roster from the list, or create a new one to start adding players.</p>
          </div>
        )}
      </div>
    </div>
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

  const EVENT_TYPES = ['goal', 'assist', 'shot', 'attempt', 'miss_ko', 'turnover', 'card', 'sub_in', 'sub_out', 'control_change', 'control_start', 'quadball_start', 'flag_released', 'flag_catch', 'gameStart', 'gamePause', 'gameEnd'];
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

function MergePlayersTab({
  players,
  allRosterPlayers,
  onRefreshData
}: {
  players: any[];
  allRosterPlayers: any[];
  onRefreshData: () => void;
}) {
  const [oldSearch, setOldSearch] = useState('');
  const [newSearch, setNewSearch] = useState('');
  const [selectedOldPlayer, setSelectedOldPlayer] = useState<any | null>(null);
  const [selectedNewPlayer, setSelectedNewPlayer] = useState<any | null>(null);
  const [isOldDropdownOpen, setIsOldDropdownOpen] = useState(false);
  const [isNewDropdownOpen, setIsNewDropdownOpen] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeLogs, setMergeLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setMergeLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const oldMatches = useMemo(() => {
    if (!oldSearch.trim()) return [];
    const q = oldSearch.toLowerCase().trim();
    return players
      .filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [oldSearch, players]);

  const newMatches = useMemo(() => {
    if (!newSearch.trim()) return [];
    const q = newSearch.toLowerCase().trim();
    return players
      .filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [newSearch, players]);

  const handleMerge = async () => {
    if (!selectedOldPlayer || !selectedNewPlayer) {
      toast.error('Please select both players.');
      return;
    }
    if (selectedOldPlayer.id === selectedNewPlayer.id) {
      toast.error('Cannot merge a player into themselves.');
      return;
    }

    const confirmMsg = `WARNING: This will merge "${selectedOldPlayer.firstName} ${selectedOldPlayer.lastName}" (OLD/REMOVE) into "${selectedNewPlayer.firstName} ${selectedNewPlayer.lastName}" (NEW/KEEP).\n\n` +
      `- ALL stats events attributed to the old player will be reassigned to the new player.\n` +
      `- ALL roster memberships will be transferred (or merged if the new player is already on the roster).\n` +
      `- The old player profile will be DELETED from the database.\n\n` +
      `This action CANNOT be undone. Are you sure you want to proceed?`;

    if (!confirm(confirmMsg)) return;

    setIsMerging(true);
    setMergeLogs([]);
    addLog('Starting player merge operation...');

    try {
      const oldId = selectedOldPlayer.id;
      const newId = selectedNewPlayer.id;

      // 1. Fetch gameEvents
      addLog('Fetching gameEvents documents...');
      const gameEventsSnap = await getDocs(collection(db, 'gameEvents'));

      let gameEventsCount = 0;
      let gameEventsModified = 0;

      let batch = writeBatch(db);
      let batchOpCount = 0;

      const commitIfNeeded = async (force = false) => {
        if (batchOpCount >= 400 || (force && batchOpCount > 0)) {
          addLog(`Committing batch with ${batchOpCount} operations...`);
          await batch.commit();
          batch = writeBatch(db);
          batchOpCount = 0;
        }
      };

      gameEventsSnap.forEach(gameDoc => {
        const eventsArray = gameDoc.data().events || [];
        let modified = false;

        const newEventsArray = eventsArray.map((evt: any) => {
          let changed = false;
          const updated = { ...evt };
          if (updated.playerId === oldId) {
            updated.playerId = newId;
            changed = true;
          }
          if (updated.subPlayerId === oldId) {
            updated.subPlayerId = newId;
            changed = true;
          }
          if (changed) {
            modified = true;
            gameEventsModified++;
          }
          return updated;
        });

        if (modified) {
          gameEventsCount++;
          batch.update(gameDoc.ref, { events: newEventsArray });
          batchOpCount++;
        }
      });
      await commitIfNeeded(true);
      addLog(`Updated ${gameEventsModified} events across ${gameEventsCount} gameEvents document(s).`);

      // 2. Fetch legacy events
      addLog('Fetching legacy events...');
      const legacySnap = await getDocs(collection(db, 'events'));
      let legacyCount = 0;

      legacySnap.forEach(evtDoc => {
        const data = evtDoc.data();
        let modified = false;
        const updates: any = {};

        if (data.playerId === oldId) {
          updates.playerId = newId;
          modified = true;
        }
        if (data.subPlayerId === oldId) {
          updates.subPlayerId = newId;
          modified = true;
        }

        if (modified) {
          legacyCount++;
          batch.update(evtDoc.ref, updates);
          batchOpCount++;
        }
      });
      await commitIfNeeded(true);
      addLog(`Updated ${legacyCount} legacy event document(s).`);

      // 3. Process rosters
      addLog('Reassigning roster allocations...');
      const oldRosters = allRosterPlayers.filter((rp: any) => rp.playerId === oldId);
      const newRosters = allRosterPlayers.filter((rp: any) => rp.playerId === newId);
      const newRosterSet = new Set(newRosters.map((rp: any) => rp.rosterId));

      let rosterUpdatesCount = 0;
      for (const oldRp of oldRosters) {
        const rosterId = oldRp.rosterId;
        if (newRosterSet.has(rosterId)) {
          // New player is already on the roster, so we delete old player's roster document
          batch.delete(doc(db, 'rosters', rosterId, 'players', oldId));
          batchOpCount++;
          addLog(`Roster ${rosterId}: New player already on roster. Deleted old player registration.`);
        } else {
          // Transfer to new player (create new and delete old)
          const oldRpDoc = await getDoc(doc(db, 'rosters', rosterId, 'players', oldId));
          const oldNumber = oldRpDoc.exists() ? (oldRpDoc.data()?.number || '') : '';

          batch.set(doc(db, 'rosters', rosterId, 'players', newId), {
            playerId: newId,
            number: oldNumber,
            createdAt: serverTimestamp()
          });
          batch.delete(doc(db, 'rosters', rosterId, 'players', oldId));
          batchOpCount += 2;
          addLog(`Roster ${rosterId}: Transferred spot (number: ${oldNumber || 'N/A'}) to new player.`);
        }
        rosterUpdatesCount++;
        await commitIfNeeded();
      }
      await commitIfNeeded(true);
      addLog(`Processed ${rosterUpdatesCount} roster membership(s).`);

      // 4. Delete Old Player Profile
      addLog(`Deleting player profile document for ${selectedOldPlayer.firstName} ${selectedOldPlayer.lastName} (ID: ${oldId})...`);
      batch.delete(doc(db, 'players', oldId));
      batchOpCount++;
      await commitIfNeeded(true);

      addLog('Successfully completed Firestore operations!');
      toast.success('Players merged successfully!');

      // Reset selection
      setSelectedOldPlayer(null);
      setSelectedNewPlayer(null);
      setOldSearch('');
      setNewSearch('');

      // Refresh data
      onRefreshData();
    } catch (err: any) {
      console.error(err);
      addLog(`ERROR: ${err.message}`);
      toast.error(`Merge failed: ${err.message}`);
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="lg:col-span-3 space-y-6">
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-red-600/20 rounded-2xl flex items-center justify-center">
            <Zap className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Merge Players</h3>
            <p className="text-gray-500">Combine a duplicate or misspelt player profile into their primary profile.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* OLD PLAYER (TO REMOVE) */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4 relative">
            <h4 className="font-bold text-gray-800 flex items-center gap-2 text-sm border-b pb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              1. Player to Remove (OLD PROFILE)
            </h4>
            <p className="text-xs text-gray-400">All events and roster memberships of this player will be merged into the profile on the right, and this profile will be permanently deleted.</p>

            {selectedOldPlayer ? (
              <div className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl p-4">
                <div>
                  <span className="font-bold text-gray-900 block">{selectedOldPlayer.firstName} {selectedOldPlayer.lastName}</span>
                  <span className="text-xs font-mono text-gray-400">ID: {selectedOldPlayer.id}</span>
                </div>
                <button
                  onClick={() => {
                    setSelectedOldPlayer(null);
                    setOldSearch('');
                  }}
                  className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-100/50 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search player to remove..."
                  value={oldSearch}
                  onChange={e => {
                    setOldSearch(e.target.value);
                    setIsOldDropdownOpen(true);
                  }}
                  onFocus={() => setIsOldDropdownOpen(true)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 pl-11 focus:border-red-500 outline-none text-sm shadow-sm"
                />
                <Search className="w-5 h-5 text-gray-400 absolute left-4 top-3" />
                {isOldDropdownOpen && oldMatches.length > 0 && (
                  <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-gray-100">
                    {oldMatches.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedOldPlayer(p);
                          setIsOldDropdownOpen(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 flex flex-col transition-colors"
                      >
                        <span className="font-semibold text-gray-900">{p.firstName} {p.lastName}</span>
                        <span className="text-xs font-mono text-gray-400">ID: {p.id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* NEW PLAYER (TO KEEP) */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4 relative">
            <h4 className="font-bold text-gray-800 flex items-center gap-2 text-sm border-b pb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              2. Player to Keep (PRIMARY PROFILE)
            </h4>
            <p className="text-xs text-gray-400">This profile will remain in the database and inherit all the statistics and rosters of the profile on the left.</p>

            {selectedNewPlayer ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                <div>
                  <span className="font-bold text-gray-900 block">{selectedNewPlayer.firstName} {selectedNewPlayer.lastName}</span>
                  <span className="text-xs font-mono text-gray-400">ID: {selectedNewPlayer.id}</span>
                </div>
                <button
                  onClick={() => {
                    setSelectedNewPlayer(null);
                    setNewSearch('');
                  }}
                  className="p-1 text-gray-400 hover:text-emerald-500 rounded-lg hover:bg-emerald-100/50 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search player to keep..."
                  value={newSearch}
                  onChange={e => {
                    setNewSearch(e.target.value);
                    setIsNewDropdownOpen(true);
                  }}
                  onFocus={() => setIsNewDropdownOpen(true)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 pl-11 focus:border-red-500 outline-none text-sm shadow-sm"
                />
                <Search className="w-5 h-5 text-gray-400 absolute left-4 top-3" />
                {isNewDropdownOpen && newMatches.length > 0 && (
                  <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-gray-100">
                    {newMatches.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedNewPlayer(p);
                          setIsNewDropdownOpen(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 flex flex-col transition-colors"
                      >
                        <span className="font-semibold text-gray-900">{p.firstName} {p.lastName}</span>
                        <span className="text-xs font-mono text-gray-400">ID: {p.id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {selectedOldPlayer && selectedNewPlayer && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-left mb-6">
            <h5 className="font-bold text-amber-800 text-sm flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4" /> Merge Summary Review
            </h5>
            <p className="text-xs text-amber-700 leading-relaxed">
              You are merging <strong className="font-bold text-amber-900">"{selectedOldPlayer.firstName} {selectedOldPlayer.lastName}"</strong> (ID: {selectedOldPlayer.id})
              into <strong className="font-bold text-amber-900">"{selectedNewPlayer.firstName} {selectedNewPlayer.lastName}"</strong> (ID: {selectedNewPlayer.id}). All events will be reassigned, rosters transferred, and the old profile permanently deleted.
            </p>
          </div>
        )}

        <button
          onClick={handleMerge}
          disabled={isMerging || !selectedOldPlayer || !selectedNewPlayer}
          className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
        >
          {isMerging ? (
            <>
              <Database className="w-5 h-5 animate-spin" /> Merging Players & Reassigning Data...
            </>
          ) : (
            <>
              <Zap className="w-5 h-5" /> Execute Merge
            </>
          )}
        </button>

        {mergeLogs.length > 0 && (
          <div className="mt-8 text-left bg-gray-900 text-green-400 p-4 rounded-xl font-mono text-xs max-h-60 overflow-y-auto space-y-1 shadow-inner border border-gray-800">
            <div className="font-bold border-b border-gray-800 pb-1 mb-2 text-gray-400 uppercase tracking-wider">Operation Console Logs</div>
            {mergeLogs.map((log, idx) => (
              <div key={idx}>{log}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ManagementView({
  leagues,
  tournaments,
  teams,
  seasons,
  players,
  videos,
  games,
  onAddLeague,
  onEditLeague,
  onDeleteLeague,
  onAddTournament,
  onEditTournament,
  onDeleteTournament,
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
  moderatorUids,
  onAddRole,
  onRemoveRole,
  activeTab: activeTabProp,
  setActiveTab: setActiveTabProp
}: ManagementViewProps) {
  const [localActiveTab, setLocalActiveTab] = useState<'leagues' | 'tournaments' | 'search' | 'teams' | 'seasons' | 'players' | 'rosters' | 'games' | 'videos' | 'roles' | 'events' | 'import' | 'merge'>('teams');
  const activeTab = activeTabProp || localActiveTab;
  const setActiveTab = setActiveTabProp || setLocalActiveTab;
  const [newItemFirstName, setNewItemFirstName] = useState('');
  const [newItemLastName, setNewItemLastName] = useState('');
  const [newPlayerPreferredName, setNewPlayerPreferredName] = useState('');
  const [newPlayerNickname, setNewPlayerNickname] = useState('');
  const [newPlayerGender, setNewPlayerGender] = useState<PlayerGender | ''>('');
  // Admin-only lookup of current gender per player id. Fetched directly from the players
  // collection (never from the aggregated/players blob) so this never reaches public views.
  const [playerGenderMap, setPlayerGenderMap] = useState<Record<string, PlayerGender | undefined>>({});
  useEffect(() => {
    if (activeTab !== 'players') return;
    let cancelled = false;
    getDocs(collection(db, 'players')).then(snap => {
      if (cancelled) return;
      const map: Record<string, PlayerGender | undefined> = {};
      snap.docs.forEach(d => { const g = d.data().gender; if (g) map[d.id] = g; });
      setPlayerGenderMap(map);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeTab]);

  // League Creation State
  const [newLeagueName, setNewLeagueName] = useState('');
  const [newLeagueDivisionsStr, setNewLeagueDivisionsStr] = useState('');
  
  // Tournament Creation State
  const [newTournamentName, setNewTournamentName] = useState('');
  const [newTournamentSeasonId, setNewTournamentSeasonId] = useState('');
  
  // Team Creation State
  const [newTeamLeagueId, setNewTeamLeagueId] = useState('');
  const [newTeamDivision, setNewTeamDivision] = useState('');

  // Season Creation State
  const [newSeasonLeague, setNewSeasonLeague] = useState('USQ');
  const [newSeasonDivision, setNewSeasonDivision] = useState('');
  const [newSeasonYear, setNewSeasonYear] = useState('');
  const [newSeasonTournamentId, setNewSeasonTournamentId] = useState('');

  // Roster Management State
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [selectedRosterId, setSelectedRosterId] = useState('');
  const [rosterPlayers, setRosterPlayers] = useState<(RosterPlayer & { player?: Player })[]>([]);
  const [allRosterPlayers, setAllRosterPlayers] = useState<(RosterPlayer & { rosterId: string })[]>([]);

  const [playerSearchText, setPlayerSearchText] = useState('');

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
  const [importType, setImportType] = useState<'stats' | 'players' | 'teams' | 'rosters' | 'videos' | 'local_sim' | 'deduplicator' | 'team_roster_builder'>('local_sim');
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

  useEffect(() => {
    if (activeTab === 'players' || activeTab === 'merge') {
      const q = query(collectionGroup(db, 'players'));
      return onSnapshot(q, (snap) => {
        const results: (RosterPlayer & { rosterId: string })[] = [];
        snap.docs.forEach(doc => {
          const rosterId = doc.ref.parent.parent?.id;
          if (rosterId) {
            results.push({ ...(doc.data() as RosterPlayer), id: doc.id, rosterId });
          }
        });
        setAllRosterPlayers(results);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'allRosterPlayers'));
    }
  }, [activeTab]);

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
          {(['leagues', 'tournaments', 'search', 'teams', 'seasons', 'players', 'rosters', 'games', 'videos', 'roles', 'events', 'import', 'merge'] as const).map(tab => (
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

              <div className="mb-6">
                <select
                  value={importType}
                  onChange={e => {
                    setImportType(e.target.value as any);
                    setCsvData([]); // Reset when changing type
                  }}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3"
                >
                  <option value="local_sim">Sandbox Local Simulator</option>
                  <option value="team_roster_builder">Team Roster Builder (CSV)</option>
                  <option value="deduplicator">Targeted Team Game Extractor</option>
                </select>
              </div>

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
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}{t.division ? ` (${t.division})` : ''}</option>)}
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
              ) : importType === 'team_roster_builder' ? (
                <div className="border border-gray-200 rounded-2xl p-8 bg-white shadow-sm">
                  <div className="mb-6">
                    <h4 className="font-bold text-lg mb-2">Team Roster CSV Builder</h4>
                    <p className="text-sm text-gray-500 mb-4">Select a season and upload the team's registration sheet. We will automatically create the team (if missing), register the players (if missing), and assign them to the roster with their jersey numbers.</p>
                    <select
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4"
                      value={selectedSeasonId}
                      onChange={e => setSelectedSeasonId(e.target.value)}
                    >
                      <option value="">-- Select Target Season --</option>
                      {seasons.map(s => <option key={s.id} value={s.id}>{getSeasonDisplayName(s, leagues)}</option>)}
                    </select>
                  </div>
                  <div className={`border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center transition-all group ${selectedSeasonId ? 'hover:border-emerald-500/50' : 'opacity-50 cursor-not-allowed'}`}>
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      id="csv-roster-builder"
                      disabled={!selectedSeasonId || isImporting}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !selectedSeasonId) return;

                        setIsImporting(true);
                        toast.loading("Parsing roster sheet...", { id: 'roster-builder' });

                        Papa.parse(file, {
                          skipEmptyLines: true,
                          complete: async (results) => {
                            try {
                              const rows = results.data as string[][];
                              if (rows.length < 3) throw new Error("CSV does not match expected format.");
                              
                              const teamName = String(rows[0][1] || '').trim();
                              if (!teamName) throw new Error("Could not find Team Name in cell B1.");
                              
                              // Find or create team
                              let targetTeamId = teams.find(t => t.name.toLowerCase() === teamName.toLowerCase())?.id;
                              if (!targetTeamId) {
                                toast.loading(`Creating team: ${teamName}`, { id: 'roster-builder' });
                                targetTeamId = await onAddTeam(teamName, '', '') || undefined;
                                if (!targetTeamId) throw new Error("Failed to create team.");
                              }

                              // Ensure roster exists
                              toast.loading(`Ensuring roster exists...`, { id: 'roster-builder' });
                              let activeRosterId = await onCreateRoster(targetTeamId, selectedSeasonId);
                              if (!activeRosterId) throw new Error("Failed to create or find roster.");

                              // Process players
                              let addedCount = 0;
                              // The header is roughly row 2 (index 2). Data starts index 3.
                              let dataStartIndex = 3;
                              for (let i = 0; i < rows.length; i++) {
                                if (String(rows[i][0]).trim() === 'First Name' || String(rows[i][0]).trim() === 'First Name ') {
                                  dataStartIndex = i + 1;
                                  break;
                                }
                              }

                              for (let i = dataStartIndex; i < rows.length; i++) {
                                const row = rows[i];
                                const fName = String(row[0] || '').trim();
                                const lName = String(row[1] || '').trim();
                                const jerseyNum = String(row[2] || '').trim();

                                // Stop processing if we hit "Registered Coach" or empty rows without jersey numbers
                                if (!jerseyNum || !fName || !lName) {
                                  continue;
                                }

                                toast.loading(`Processing ${fName} ${lName}...`, { id: 'roster-builder' });
                                
                                // Find or create player
                                let playerId = players.find(p => p.firstName.toLowerCase() === fName.toLowerCase() && p.lastName.toLowerCase() === lName.toLowerCase())?.id;
                                if (!playerId) {
                                  playerId = await onAddPlayer(fName, lName) || undefined;
                                }
                                
                                if (playerId) {
                                  await onAddPlayerToRoster(activeRosterId, playerId, jerseyNum);
                                  addedCount++;
                                }
                              }
                              
                              toast.success(`Roster Builder Complete: Processed ${addedCount} players for ${teamName}.`, { id: 'roster-builder' });
                            } catch (err: any) {
                              toast.error(`Roster Build Failed: ${err.message}`, { id: 'roster-builder' });
                            } finally {
                              setIsImporting(false);
                              e.target.value = '';
                            }
                          }
                        });
                      }}
                    />
                    <label htmlFor={selectedSeasonId ? "csv-roster-builder" : ""} className={selectedSeasonId ? "cursor-pointer" : ""}>
                      <Database className="w-12 h-12 mx-auto mb-4 text-emerald-500 group-hover:text-emerald-400 transition-colors" />
                      <p className="text-lg font-bold mb-1">Select Roster CSV</p>
                      <p className="text-sm text-gray-400">Creates teams and rosters automatically</p>
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
                                const DROP_TYPES = new Set(['offense', 'defense', 'swap', 'seekers_released']);
                                if (DROP_TYPES.has(normType)) return null;

                                // If the raw event specifies away/home, strip it and apply correct team ID
                                if (normType.startsWith('away_')) {
                                  normType = normType.replace(/^away_/, '');
                                  if (gameContext) resolvedTeamId = gameContext.awayTeamId;
                                } else if (normType.startsWith('home_')) {
                                  normType = normType.replace(/^home_/, '');
                                  if (gameContext) resolvedTeamId = gameContext.homeTeamId;
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
                                
                                if (normType === 'takeaway') {
                                  normType = 'turnover';
                                  if (resolvedTeamId === gameContext?.homeTeamId && gameContext?.awayTeamId) {
                                    resolvedTeamId = gameContext.awayTeamId;
                                  } else if (resolvedTeamId === gameContext?.awayTeamId && gameContext?.homeTeamId) {
                                    resolvedTeamId = gameContext.homeTeamId;
                                  }
                                  // For takeaway, drop player attribution since we don't know who turned it over
                                  r.player_id = undefined;
                                  r.playerId = undefined;
                                }

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
                                    const clean = JSON.parse(JSON.stringify({ ...ev, userId: 'admin' }));
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
                        <p className="text-sm text-gray-500">Columns are pre-mapped for this database format. Ensure you have selected the correct CSV file.</p>
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
                                    userId: 'system-import',
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
                                  userId: 'system-import',
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
              <h3 className="text-xl font-bold mb-4">Moderators</h3>
              <p className="text-gray-500 mb-2">
                Moderators get the Create tab and are the only people who can mark a team's
                tracking complete, or accept a suggested edit.
              </p>
              <p className="text-gray-500 mb-8">
                Everyone else falls out of how they signed in: a Google account can record events
                on a game, and an anonymous visitor can suggest edits and vote. There is no list
                to maintain for either.
              </p>

              <div className="bg-white p-6 border rounded-xl flex flex-col max-w-2xl shadow-sm">
                <div className="flex items-center gap-2 border-b pb-3 mb-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <h4 className="font-bold text-gray-800 text-lg">Moderator access</h4>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.target as HTMLFormElement);
                    const newUid = data.get('uid')?.toString().trim();
                    if (newUid && onAddRole) {
                      onAddRole(newUid);
                      (e.target as HTMLFormElement).reset();
                    }
                  }}
                  className="flex gap-2 mt-4"
                >
                  <input name="uid" type="text" placeholder="Paste a user ID" required className="flex-1 px-3 py-2 border rounded-lg text-sm font-mono" />
                  <button type="submit" className="px-4 py-2 bg-gray-900 text-white font-bold rounded-lg text-sm hover:bg-black transition-colors">Add</button>
                </form>
                {/* Emails are deliberately not accepted here — nothing in this app maps a
                    person to an address. A user reads their own ID off the header chip, or
                    you promote them straight from the leaderboard. */}
                <p className="text-[11px] text-gray-400 mt-2">
                  A user can copy their own ID from the chip in the header. You can also promote
                  someone directly from the leaderboard on the Create tab. Granting and revoking
                  moderator access is admin-only — moderators cannot promote each other.
                </p>
                <div className="flex-1 overflow-y-auto mt-4 divide-y divide-gray-100">
                  {(moderatorUids || []).map(uid => (
                    <div key={uid} className="py-3 flex justify-between items-center group gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{userLabel(uid)}</p>
                        <p className="text-[10px] font-mono text-gray-400 truncate">{uid}</p>
                      </div>
                      <button onClick={() => {
                        if (confirm(`Remove moderator access for ${userLabel(uid)}?`)) onRemoveRole?.(uid);
                      }} className="p-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {(moderatorUids || []).length === 0 && <div className="text-gray-400 text-sm italic py-4">No moderators yet.</div>}
                </div>
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
            leagues={leagues}
            selectedRosterId={selectedRosterId}
            setSelectedRosterId={setSelectedRosterId}
            onAddTeam={onAddTeam}
            onAddPlayer={onAddPlayer}
            onAddPlayerToRoster={onAddPlayerToRoster}
            onRemovePlayerFromRoster={onRemovePlayerFromRoster}
            onCreateRoster={onCreateRoster}
            onDeleteRoster={onDeleteRoster}
          />
        ) : activeTab === 'merge' ? (
          <MergePlayersTab
            players={players}
            allRosterPlayers={allRosterPlayers}
            onRefreshData={onRefreshData}
          />
        ) : activeTab === 'players' ? (
          <>
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden flex flex-col max-h-[800px]">
                <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex flex-col gap-3 shrink-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold capitalize">Existing Players</h3>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 font-medium">{players.length} items</span>
                      <label className="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors cursor-pointer border border-gray-300">
                        Upload CSV
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
                                  const pid = colId ? String(row[colId] || '').trim() : '';
                                  if (pid) {
                                    batch.set(doc(db, 'players', pid), { firstName, lastName, createdAt: serverTimestamp() });
                                  } else {
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
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      placeholder="Search existing players..." 
                      value={playerSearchText}
                      onChange={e => setPlayerSearchText(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 pl-11 focus:border-red-500 outline-none text-sm shadow-sm"
                    />
                    <Search className="w-5 h-5 text-gray-400 absolute left-4 top-3" />
                  </div>
                </div>
                <div className="overflow-y-auto custom-scrollbar flex-1 divide-y divide-gray-100 bg-white">
                  {players
                    .filter(p => !playerSearchText || `${p.firstName} ${p.lastName}`.toLowerCase().includes(playerSearchText.toLowerCase()))
                    .map(p => (
                      <PlayerEditRow
                        key={p.id}
                        player={p}
                        initialGender={playerGenderMap[p.id]}
                        showGenderField
                        allRosterPlayers={allRosterPlayers}
                        rosters={rosters}
                        teams={teams}
                        seasons={seasons}
                        leagues={leagues}
                        onEditPlayer={onEditPlayer}
                        onDeletePlayer={onDeletePlayer}
                      />
                    ))}
                  {players.filter(p => !playerSearchText || `${p.firstName} ${p.lastName}`.toLowerCase().includes(playerSearchText.toLowerCase())).length === 0 && (
                    <div className="p-12 text-center text-gray-400 flex flex-col items-center">
                      <User className="w-8 h-8 mb-2 opacity-50" />
                      <p>No matching players found.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 sticky top-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-red-500" />
                  Add New Player
                </h3>
                <div className="space-y-4">
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
                  <div className="pt-2 pb-1 text-xs font-bold text-gray-400 uppercase tracking-wider">Optional Identity Fields</div>
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
                  <div className="pt-2 pb-1 text-xs font-bold text-gray-400 uppercase tracking-wider">Roster Eligibility (Internal — Never Displayed)</div>
                  <select
                    value={newPlayerGender}
                    onChange={e => setNewPlayerGender(e.target.value as PlayerGender | '')}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                  >
                    <option value="">Gender... *</option>
                    <option value="M">Man (M)</option>
                    <option value="W">Woman (W)</option>
                    <option value="NB">Non-binary (NB)</option>
                  </select>
                  <button
                    onClick={() => {
                      if (!newItemFirstName || !newItemLastName) return;
                      onAddPlayer(newItemFirstName, newItemLastName, newPlayerPreferredName, newPlayerNickname, newPlayerGender || undefined);
                      setNewItemFirstName('');
                      setNewItemLastName('');
                      setNewPlayerPreferredName('');
                      setNewPlayerNickname('');
                      setNewPlayerGender('');
                    }}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-all shadow-sm hover:shadow-md"
                  >
                    Create Player
                  </button>
                </div>
              </div>
            </div>
          </>
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
                    {activeTab === 'seasons' ? (
                      <>
                        <select
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                          value={newSeasonLeague}
                          onChange={e => {
                            setNewSeasonLeague(e.target.value);
                            setNewSeasonDivision('');
                          }}
                        >
                          <option value="">-- Select League --</option>
                          {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        {newSeasonLeague && leagues.find(l => l.id === newSeasonLeague)?.divisions?.length ? (
                          <select
                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                            value={newSeasonDivision}
                            onChange={e => setNewSeasonDivision(e.target.value)}
                          >
                            <option value="">-- Select Division (Optional) --</option>
                            {leagues.find(l => l.id === newSeasonLeague)?.divisions?.map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        ) : null}
                        <input
                          type="text"
                          placeholder="Year (e.g., 2024)"
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                          value={newSeasonYear}
                          onChange={e => setNewSeasonYear(e.target.value)}
                        />
                        <select
                          className="w-full p-2 lg:p-3 border border-gray-200 rounded-lg lg:rounded-xl text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                          value={newSeasonTournamentId}
                          onChange={e => setNewSeasonTournamentId(e.target.value)}
                        >
                          <option value="">-- Championship Tournament (Optional) --</option>
                          {tournaments.map((t: any) => <option key={t.id} value={t.id}>{t.division ? `(${t.division}) ` : ''}{t.name}</option>)}
                        </select>
                      </>
                    ) : activeTab === 'teams' ? (
                      <>
                        <input
                          type="text"
                          placeholder="Team Name..."
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                          value={newItemFirstName}
                          onChange={e => setNewItemFirstName(e.target.value)}
                        />
                        <select
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                          value={newTeamLeagueId}
                          onChange={e => {
                            setNewTeamLeagueId(e.target.value);
                            setNewTeamDivision(''); // Reset division when league changes
                          }}
                        >
                          <option value="">-- Select League (Optional) --</option>
                          {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        {newTeamLeagueId && leagues.find(l => l.id === newTeamLeagueId)?.divisions?.length ? (
                          <select
                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                            value={newTeamDivision}
                            onChange={e => setNewTeamDivision(e.target.value)}
                          >
                            <option value="">-- Select Division (Optional) --</option>
                            {leagues.find(l => l.id === newTeamLeagueId)?.divisions?.map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        ) : null}
                      </>
                    ) : activeTab === 'leagues' ? (
                      <>
                        <input
                          type="text"
                          placeholder="League Name..."
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                          value={newLeagueName}
                          onChange={e => setNewLeagueName(e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="Divisions (comma separated, Optional)"
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                          value={newLeagueDivisionsStr}
                          onChange={e => setNewLeagueDivisionsStr(e.target.value)}
                        />
                      </>
                    ) : activeTab === 'tournaments' ? (
                      <>
                        <input type="text" placeholder="Tournament Name..." className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500 mb-2" value={newTournamentName} onChange={e => setNewTournamentName(e.target.value)} />
                        <select className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500 mb-2" value={newTournamentSeasonId} onChange={e => setNewTournamentSeasonId(e.target.value)}>
                          <option value="">-- Select Season --</option>
                          {seasons.map(s => <option key={s.id} value={s.id}>{getSeasonDisplayName(s, leagues)}</option>)}
                        </select>
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
                        if (activeTab === 'seasons') {
                          if (!newSeasonLeague || !newSeasonYear) return;
                          const selectedLeagueName = leagues.find(l => l.id === newSeasonLeague)?.name || 'Unknown';
                          const divStr = newSeasonDivision ? ` (${newSeasonDivision})` : '';
                          const name = `${selectedLeagueName}${divStr} ${newSeasonYear}`;
                          onAddSeason(name, newSeasonLeague, newSeasonDivision || undefined, newSeasonYear, newSeasonTournamentId);
                          setNewSeasonYear('');
                          setNewSeasonTournamentId('');
                          setNewSeasonDivision('');
                        } else if (activeTab === 'teams') {
                          if (!newItemFirstName) return;
                          onAddTeam(newItemFirstName, newTeamLeagueId || undefined, newTeamDivision || undefined);
                          setNewItemFirstName('');
                          setNewTeamLeagueId('');
                          setNewTeamDivision('');
                        } else if (activeTab === 'tournaments') {
                          if (!newTournamentName || !newTournamentSeasonId) return;
                          onAddTournament(newTournamentName, newTournamentSeasonId);
                          setNewTournamentName('');
                          setNewTournamentSeasonId('');
                        } else if (activeTab === 'leagues') {
                          if (!newLeagueName) return;
                          const divs = newLeagueDivisionsStr.split(',').map(s => s.trim()).filter(Boolean);
                          onAddLeague(newLeagueName, divs.length > 0 ? divs : undefined);
                          setNewLeagueName('');
                          setNewLeagueDivisionsStr('');
                        } else {
                          if (!newItemFirstName) return;
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
                    {activeTab === 'leagues' && leagues.length}
                    {activeTab === 'tournaments' && tournaments.length}
                    {activeTab === 'teams' && teams.length}
                    {activeTab === 'seasons' && seasons.length}
                    {activeTab === 'games' && games.length}
                    {activeTab === 'videos' && videos.length}
                    {' items'}
                  </span>
                </div>

                <div className="divide-y divide-neutral-800 max-h-[600px] overflow-y-auto custom-scrollbar">
                  {activeTab === 'leagues' && leagues.map(l => (
                    <div key={l.id} className="p-4 flex items-center justify-between hover:bg-gray-200/50 transition-colors group border-b border-gray-100 last:border-0">
                      <div>
                        <p className="font-bold">{l.name}</p>
                        <p className="text-[10px] text-gray-400 uppercase">Divisions: {l.divisions?.join(', ') || 'None'} | ID: {l.id}</p>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => {
                            const newName = prompt(`Edit Name for ${l.name}:`, `${l.name}`);
                            if (!newName) return;
                            const newDivs = prompt(`Edit Divisions (comma separated):`, `${l.divisions?.join(', ') || ''}`);
                            if (newDivs === null) return;
                            const divArr = newDivs.split(',').map(d => d.trim()).filter(Boolean);
                            onEditLeague(l.id, newName, divArr.length > 0 ? divArr : undefined);
                          }}
                          className="p-2 text-gray-400 hover:text-amber-500 rounded-full hover:bg-white"
                          title="Edit League"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { if (confirm(`Delete league ${l.name}?`)) onDeleteLeague(l.id); }}
                          className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-white"
                          title="Delete League"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {activeTab === 'tournaments' && tournaments.map(t => (
                    <div key={t.id} className="p-4 flex items-center justify-between hover:bg-gray-200/50 transition-colors group border-b border-gray-100 last:border-0">
                      <div>
                        <p className="font-bold">{t.name}</p>
                        <p className="text-[10px] text-gray-400 uppercase">Year: {t.year || 'N/A'} | League: {t.leagueId ? leagues.find(l => l.id === t.leagueId)?.name : 'None'} | Div: {t.division || 'None'} | ID: {t.id}</p>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => {
                            const newName = prompt(`Edit Name for ${t.name}:`, `${t.name}`);
                            if (!newName) return;
                            
                            // Native prompt doesn't easily support dropdowns, so we'll leave it simple for now,
                            // or allow them to paste the season ID, but practically, we should find a better UI later.
                            // For now, prompt for the exact Season ID (since they can copy it from the UI or just use the Add form).
                            const currentSeasonStr = seasons.find(s => s.id === t.seasonId)?.name || 'None';
                            const newSeasonName = prompt(`Edit Season for ${t.name} (Type exact Season Name below or cancel to keep ${currentSeasonStr}):`, `${currentSeasonStr}`);
                            
                            let newSeasonId = t.seasonId;
                            if (newSeasonName && newSeasonName !== currentSeasonStr) {
                               const matched = seasons.find(s => s.name.toLowerCase() === newSeasonName.toLowerCase());
                               if (matched) newSeasonId = matched.id;
                               else {
                                  alert(`Could not find a season perfectly matching "${newSeasonName}". Season unchanged.`);
                               }
                            }
                            onEditTournament(t.id, newName, newSeasonId || '');
                          }}
                          className="p-2 text-gray-400 hover:text-amber-500 rounded-full hover:bg-white"
                          title="Edit Tournament"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { if (confirm(`Delete tournament ${t.name}?`)) onDeleteTournament(t.id); }}
                          className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-white"
                          title="Delete Tournament"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {activeTab === 'teams' && teams.map(t => (
                    <TeamEditRow
                      key={t.id}
                      team={t}
                      onDeleteTeam={onDeleteTeam}
                      onRefreshData={onRefreshData}
                    />
                  ))}
                  {activeTab === 'seasons' && seasons.map(s => (
                    <SeasonEditRow
                      key={s.id}
                      season={s}
                      leagues={leagues}
                      onEditSeason={onEditSeason}
                      onDeleteSeason={onDeleteSeason}
                    />
                  ))}
                  {activeTab === 'games' && [...games].sort((a, b) => new Date(serializeTimestamp(b.createdAt)).getTime() - new Date(serializeTimestamp(a.createdAt)).getTime()).map(g => (
                    <GameEditRow
                      key={g.id}
                      game={g}
                      seasons={seasons}
                      teams={teams}
                      videos={videos}
                      leagues={leagues}
                      tournaments={tournaments}
                      onDeleteGame={onDeleteGame}
                      onRefreshData={onRefreshData}
                      isAdmin={isAdmin}
                    />
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

function LeaderboardView({ events, moderatorUids = [], onMakeModerator }: {
  events: any[];
  moderatorUids?: string[];
  // Only ever passed for the admin. Granting moderator access is an admin-only action, and a
  // moderator viewing this table sees the roles but no way to change them.
  onMakeModerator?: (uid: string) => void;
}) {
  const leaderboardStats = useMemo(() => {
    const statsByUser = new Map<string, { userId: string; totalEvents: number; rejectedEvents: number; upvotes: number; downvotes: number }>();
    events.forEach(e => {
      if (!e.userId) return;
      const u = statsByUser.get(e.userId) || { userId: e.userId, totalEvents: 0, rejectedEvents: 0, upvotes: 0, downvotes: 0 };
      u.totalEvents++;
      if (e.status === 'rejected') u.rejectedEvents++;
      u.upvotes += (e.upvotes || 0);
      u.downvotes += (e.downvotes || 0);
      statsByUser.set(e.userId, u);
    });

    // Accuracy is a voting measure now that events aren't verified: the share of a
    // contributor's votes that came back positive.
    return Array.from(statsByUser.values())
      .map(s => ({
        ...s,
        netUpvotes: s.upvotes - s.downvotes,
        accuracy: (s.upvotes + s.downvotes) > 0 ? (s.upvotes / (s.upvotes + s.downvotes)) * 100 : 0
      }))
      .sort((a, b) => b.totalEvents - a.totalEvents || b.netUpvotes - a.netUpvotes);
  }, [events]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-amber-50/30">
        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" /> Community Leaderboard
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Ranking by events contributed. This is the one place a contributor's ID is
          visible, so it doubles as the way to hand someone moderator access.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {onMakeModerator
            ? 'Only you, as the admin, can grant moderator access.'
            : 'Only the admin can grant moderator access.'}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
              <th className="px-6 py-3 font-bold">Rank</th>
              <th className="px-6 py-3 font-bold">Contributor</th>
              <th className="px-6 py-3 font-bold text-right">Total Submissions</th>
              <th className="px-6 py-3 font-bold text-right">Upvote Rate</th>
              <th className="px-6 py-3 font-bold text-right">Net Upvotes</th>
              <th className="px-6 py-3 font-bold text-right">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leaderboardStats.map((u, i) => (
              <tr key={u.userId} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4 font-bold text-gray-900">
                  {i === 0 ? <span className="text-amber-500 flex items-center gap-1"><Trophy className="w-4 h-4" /> 1</span> : 
                   i === 1 ? <span className="text-gray-400 flex items-center gap-1"><Trophy className="w-4 h-4" /> 2</span> :
                   i === 2 ? <span className="text-amber-700 flex items-center gap-1"><Trophy className="w-4 h-4" /> 3</span> :
                   <span className="text-gray-500">{i + 1}</span>}
                </td>
                <td className="px-6 py-4">
                  <p className="font-semibold text-gray-900">{userLabel(u.userId)}</p>
                  <p className="text-[10px] font-mono text-gray-400">{u.userId}</p>
                </td>
                <td className="px-6 py-4 text-right font-bold text-emerald-600">{u.totalEvents}</td>
                <td className="px-6 py-4 text-right text-gray-600">{u.accuracy.toFixed(1)}%</td>
                <td className="px-6 py-4 text-right font-medium text-amber-600">{u.netUpvotes > 0 ? `+${u.netUpvotes}` : u.netUpvotes}</td>
                <td className="px-6 py-4 text-right">
                  {moderatorUids.includes(u.userId) ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600">
                      <ShieldCheck className="w-3.5 h-3.5" /> Moderator
                    </span>
                  ) : onMakeModerator ? (
                    <button
                      onClick={() => {
                        if (confirm(`Give ${userLabel(u.userId)} moderator access?`)) onMakeModerator(u.userId);
                      }}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-gray-200 text-gray-500 hover:text-amber-600 hover:border-amber-500 transition-colors"
                    >
                      Make moderator
                    </button>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-gray-300">Author</span>
                  )}
                </td>
              </tr>
            ))}
            {leaderboardStats.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">No events contributed yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateView({
  teams, seasons, players, leagues, tournaments, events, games, onOpenGame,
  moderatorUids, onMakeModerator,
  searchQuery, setSearchQuery, newVideoData, setNewVideoData, isAddingGame, setIsAddingGame, onAddGame,
  onAddTeam, onAddPlayer, onAddPlayerToRoster, onRemovePlayerFromRoster,
  onCreateRoster, onDeleteRoster, onEditPlayer, onDeletePlayer,
  activeTab: activeTabProp,
  setActiveTab: setActiveTabProp
}: any) {
  const [localActiveTab, setLocalActiveTab] = useState<'rosters' | 'teams' | 'players' | 'games' | 'activity'>('rosters');
  const activeTab = activeTabProp || localActiveTab;
  const setActiveTab = setActiveTabProp || setLocalActiveTab;
  const [selectedRosterId, setSelectedRosterId] = useState('');
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [rosterPlayers, setRosterPlayers] = useState<(RosterPlayer & { player?: Player })[]>([]);
  const [allRosterPlayers, setAllRosterPlayers] = useState<(RosterPlayer & { rosterId: string })[]>([]);
  const [playerSearchText, setPlayerSearchText] = useState('');
  const [teamSearchText, setTeamSearchText] = useState('');

  // Name, league or division all match, so a moderator can check for an
  // existing team before creating a duplicate.
  const filteredTeams = useMemo(() => {
    const q = teamSearchText.trim().toLowerCase();
    const sorted = [...teams].sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
    if (!q) return sorted;
    return sorted.filter((t: any) =>
      [t.name, t.league, t.division].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [teams, teamSearchText]);

  useEffect(() => {
    if (activeTab === 'players') {
      const q = query(collectionGroup(db, 'players'));
      return onSnapshot(q, (snap) => {
        const results: (RosterPlayer & { rosterId: string })[] = [];
        snap.docs.forEach(doc => {
          const rosterId = doc.ref.parent.parent?.id;
          if (rosterId) {
            results.push({ ...(doc.data() as RosterPlayer), id: doc.id, rosterId });
          }
        });
        setAllRosterPlayers(results);
      });
    }
  }, [activeTab]);


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
        <div data-tour="create-tabs" className="flex bg-gray-50 p-1 rounded-xl border border-gray-200">
          {(['rosters', 'teams', 'players', 'games', 'activity'] as const).map(tab => (
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

      {activeTab === 'activity' ? (
        <div className="space-y-8">
          <RecentEventsView games={games} teams={teams} seasons={seasons} onOpenGame={onOpenGame} />
          <LeaderboardView events={events} moderatorUids={moderatorUids} onMakeModerator={onMakeModerator} />
        </div>
      ) : activeTab === 'rosters' ? (
        <UnifiedRosterEditor
          teams={teams}
          seasons={seasons}
          players={players}
          rosters={rosters}
          rosterPlayers={rosterPlayers}
          leagues={leagues}
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
        <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div data-tour="create-team-list" className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden flex flex-col max-h-[800px]">
            <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex flex-col gap-3 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="font-bold capitalize">Existing Teams</h3>
                <span className="text-xs text-gray-400 font-medium">
                  {teamSearchText.trim() ? `${filteredTeams.length} of ${teams.length}` : `${teams.length} items`}
                </span>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={teamSearchText}
                  onChange={e => setTeamSearchText(e.target.value)}
                  placeholder="Search existing teams..."
                  className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-10 py-2.5 text-sm outline-none focus:border-red-500"
                />
                {teamSearchText && (
                  <button
                    onClick={() => setTeamSearchText('')}
                    title="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-600 transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-y-auto custom-scrollbar flex-1 divide-y divide-gray-100">
              {filteredTeams.map((t: any) => (
                <div key={t.id} className="p-3 flex items-center justify-between gap-3 hover:bg-white transition-colors">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{t.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {[t.league, t.division].filter(Boolean).join(' · ') || 'No league or division set'}
                    </p>
                  </div>
                </div>
              ))}
              {teams.length === 0 && (
                <div className="p-6 text-center text-sm text-gray-400">No teams yet.</div>
              )}
              {teams.length > 0 && filteredTeams.length === 0 && (
                <div className="p-6 text-center text-sm text-gray-400">No teams match "{teamSearchText}".</div>
              )}
            </div>
          </div>
        </div>
        <div data-tour="create-team-form" className="lg:col-span-1 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm h-fit sticky top-6">
          <h3 className="text-xl font-bold mb-4">Create New Team</h3>
          <p className="text-sm text-gray-500 mb-6">Create a team once, and it will be available to all authors forever. Search the list first — duplicates split a team's history.</p>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.target as HTMLFormElement);
            const teamName = data.get('teamName')?.toString().trim();
            const league = data.get('league')?.toString().trim();
            const division = data.get('division')?.toString().trim();
            if (teamName) {
              await onAddTeam(teamName, league, division);
              (e.target as HTMLFormElement).reset();
            }
          }} className="flex flex-col gap-4">
            <input name="teamName" type="text" placeholder="Team Name (e.g., Austin Outlaws)..." required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3" />
            <div className="flex gap-4">
              <input name="league" type="text" placeholder="League (e.g., USQ)..." className="flex-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3" />
              <input name="division" type="text" placeholder="Division (e.g., College)..." className="flex-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3" />
            </div>
            <button type="submit" className="bg-red-600 text-white px-6 py-3 rounded-xl font-bold transition-colors hover:bg-red-700 w-full">Add Team</button>
          </form>
        </div>
        </div>
      ) : activeTab === 'players' ? (
        <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <div data-tour="create-player-list" className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden flex flex-col max-h-[800px]">
                <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex flex-col gap-3 shrink-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold capitalize">Existing Players</h3>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 font-medium">{players.length} items</span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      placeholder="Search existing players..." 
                      value={playerSearchText}
                      onChange={e => setPlayerSearchText(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 pl-11 focus:border-red-500 outline-none text-sm shadow-sm"
                    />
                    <Search className="w-5 h-5 text-gray-400 absolute left-4 top-3" />
                  </div>
                </div>
                <div className="overflow-y-auto custom-scrollbar flex-1 divide-y divide-gray-100 bg-white">
                  {players
                    .filter((p: any) => !playerSearchText || `${p.firstName} ${p.lastName}`.toLowerCase().includes(playerSearchText.toLowerCase()))
                    .map((p: any) => (
                      <PlayerEditRow
                        key={p.id}
                        player={p}
                        allRosterPlayers={allRosterPlayers}
                        rosters={rosters}
                        teams={teams}
                        seasons={seasons}
                        leagues={leagues}
                        onEditPlayer={onEditPlayer}
                        onDeletePlayer={onDeletePlayer}
                      />
                    ))
                  }
                  {players.filter((p: any) => !playerSearchText || `${p.firstName} ${p.lastName}`.toLowerCase().includes(playerSearchText.toLowerCase())).length === 0 && (
                    <div className="p-12 text-center text-gray-400 flex flex-col items-center">
                      <User className="w-8 h-8 mb-2 opacity-50" />
                      <p>No matching players found.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="lg:col-span-1 space-y-6">
              <div data-tour="create-player-form" className="bg-gray-50 border border-gray-200 rounded-2xl p-6 sticky top-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-red-500" />
                  Add New Player
                </h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const data = new FormData(e.target as HTMLFormElement);
                  const fName = data.get('firstName')?.toString().trim();
                  const lName = data.get('lastName')?.toString().trim();
                  const pName = data.get('preferredName')?.toString().trim();
                  const nName = data.get('nickname')?.toString().trim();
                  if (fName && lName) {
                    await onAddPlayer(fName, lName, pName, nName);
                    (e.target as HTMLFormElement).reset();
                  }
                }} className="space-y-4">
                  <input
                    name="firstName"
                    type="text"
                    placeholder="First Name (Legal/Roster)... *"
                    required
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                  />
                  <input
                    name="lastName"
                    type="text"
                    placeholder="Last Name... *"
                    required
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                  />
                  <div className="pt-2 pb-1 text-xs font-bold text-gray-400 uppercase tracking-wider">Optional Identity Fields</div>
                  <input
                    name="preferredName"
                    type="text"
                    placeholder="Preferred First Name"
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                  />
                  <input
                    name="nickname"
                    type="text"
                    placeholder="Nickname"
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                  />
                  <button
                    type="submit"
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-all shadow-sm hover:shadow-md"
                  >
                    Create Player
                  </button>
                </form>
              </div>
            </div>
        </div>
      ) : activeTab === 'games' ? (
        <div data-tour="create-game-form" className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm max-w-2xl mx-auto">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-red-500" />
            Add New Game
          </h3>
          <p className="text-sm text-gray-500 mb-6">Create a new game by providing a YouTube URL and game metadata.</p>
          <form onSubmit={onAddGame} className="space-y-4">
            <input
              type="text"
              placeholder="YouTube URL or Video ID... *"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none"
            />
            <div className="grid grid-cols-2 gap-4">
              <select
                value={newVideoData.homeTeamId}
                onChange={(e) => setNewVideoData({ ...newVideoData, homeTeamId: e.target.value })}
                required
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none"
              >
                <option value="">Select Home Team... *</option>
                {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select
                value={newVideoData.awayTeamId}
                onChange={(e) => setNewVideoData({ ...newVideoData, awayTeamId: e.target.value })}
                required
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none"
              >
                <option value="">Select Away Team... *</option>
                {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <select
                value={newVideoData.leagueId || ''}
                onChange={(e) => setNewVideoData({ ...newVideoData, leagueId: e.target.value, division: '' })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none"
              >
                <option value="">Select League (Optional)...</option>
                {leagues.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              
              {newVideoData.leagueId && leagues.find((l: any) => l.id === newVideoData.leagueId)?.divisions ? (
                <select
                  value={newVideoData.division || ''}
                  onChange={(e) => setNewVideoData({ ...newVideoData, division: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none"
                >
                  <option value="">Select Division (Optional)...</option>
                  {leagues.find((l: any) => l.id === newVideoData.leagueId)?.divisions?.map((d: string) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Division (Optional)..."
                  value={newVideoData.division || ''}
                  onChange={(e) => setNewVideoData({ ...newVideoData, division: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <select
                value={newVideoData.seasonId || ''}
                onChange={(e) => setNewVideoData({ ...newVideoData, seasonId: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none"
              >
                <option value="">Select Season (Optional)...</option>
                {seasons.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              
              <select
                value={newVideoData.tournamentId || ''}
                onChange={(e) => setNewVideoData({ ...newVideoData, tournamentId: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none"
              >
                <option value="">Select Tournament (Optional)...</option>
                {tournaments.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.year ? `${t.year} ` : ''}{t.name}{t.division ? ` (${t.division})` : ''}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <input
                type="date"
                value={newVideoData.date || ''}
                onChange={(e) => setNewVideoData({ ...newVideoData, date: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none"
              />
              <input
                type="text"
                placeholder="Game Tag (e.g. Finals)..."
                value={newVideoData.tag || ''}
                onChange={(e) => setNewVideoData({ ...newVideoData, tag: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none"
              />
            </div>
            
            <input
              type="text"
              placeholder="Override Game ID (Optional, for advanced use)..."
              value={newVideoData.gameId || ''}
              onChange={(e) => setNewVideoData({ ...newVideoData, gameId: e.target.value })}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs font-mono focus:border-red-500 outline-none"
            />
            
            <button
              type="submit"
              disabled={isAddingGame}
              className="w-full bg-red-600 text-white font-bold py-3 rounded-xl transition-all hover:bg-red-700 disabled:opacity-50"
            >
              {isAddingGame ? 'Adding Game...' : 'Add Game'}
            </button>
          </form>
        </div>
      ) : null}

    </div>
  );
}

type RouteView = 'tracker' | 'video' | 'manage' | 'create' | 'stats' | 'review' | 'info' | 'playerProfile' | 'teamProfile' | 'gameProfile' | 'lists';

const SIMPLE_ROUTES = ['tracker', 'video', 'manage', 'create', 'review', 'info', 'lists'];

// Parses a location hash into the routing/filter state it represents.
//
// This runs BOTH as the lazy initializer for the relevant useState calls and on every
// hashchange. Initializing synchronously matters: the effect that writes state back out
// to the URL also runs on mount, and if state were still at its defaults at that point it
// would overwrite the incoming deep link (with '#/stats') before the URL had been read.
function splitParam(params: URLSearchParams, key: string): string[] {
  return params.has(key) ? params.get(key)!.split(',').filter(Boolean) : [];
}

/**
 * Reads the Stats page's data scope out of the URL. Old links carry `verify=verified` /
 * `verified_events` / `all` from the retired verification model; anything that asked for
 * the strictest slice lands on 'full', everything else on 'public'.
 */
function parseScopeParam(raw: string | null | undefined): CompletionScope {
  if (raw === 'full' || raw === 'verified') return 'full';
  return 'public';
}

function parseHashRoute(hashFull: string): {
  view: RouteView | null;
  playerId: string | null;
  teamId: string | null;
  gameId: string | null;
  isStats: boolean;
  params: URLSearchParams;
} {
  const [hash, queryString] = (hashFull || '').split('?');
  const params = new URLSearchParams(queryString || '');
  const base = { view: null as RouteView | null, playerId: null, teamId: null, gameId: null, isStats: false, params };

  if (hash.startsWith('#/game/')) return { ...base, view: 'gameProfile', gameId: hash.replace('#/game/', '') };
  if (hash.startsWith('#/team/')) return { ...base, view: 'teamProfile', teamId: hash.replace('#/team/', '') };
  if (hash.startsWith('#/player/')) return { ...base, view: 'playerProfile', playerId: hash.replace('#/player/', '') };
  if (hash === '#/stats' || hash === '') return { ...base, view: 'stats', isStats: true };
  if (hash.startsWith('#/')) {
    const route = hash.replace('#/', '');
    // The Info page used to be called Help; keep old links working.
    if (route === 'help') return { ...base, view: 'info' };
    // 'lists' is intentionally excluded from any nav UI — it's a hidden page,
    // reachable only by navigating directly to #/lists.
    if (SIMPLE_ROUTES.includes(route)) return { ...base, view: route as RouteView };
  }
  return base;
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
  const [suggestions, setSuggestions] = useState<EventSuggestion[]>([]);
  // The suggest-fix / suggest-delete / suggest-missing-event modal. Reuses one piece of state
  // for all three since only one can be open at a time.
  const [suggestFormState, setSuggestFormState] = useState<{ mode: 'edit' | 'delete' | 'add'; targetEvent?: GameEvent } | null>(null);
  const [expandedSuggestionEventIds, setExpandedSuggestionEventIds] = useState<Set<string>>(new Set());
  const [showSuggestionQueue, setShowSuggestionQueue] = useState(false);
  // How much chrome the events feed shows. Persisted locally only — the tracker view doesn't
  // participate in the app's URL deep-linking today, so this stays out of that system rather
  // than bolting a one-off param onto it.
  const [eventDensity, setEventDensity] = useState<'full' | 'compact'>(() => {
    const stored = localStorage.getItem('qr_event_density');
    return stored === 'compact' ? stored : 'full';
  });
  useEffect(() => { localStorage.setItem('qr_event_density', eventDensity); }, [eventDensity]);

  // Global Data
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);

  // Roster Data for current video
  const [homeRosterPlayers, setHomeRosterPlayers] = useState<(RosterPlayer & { player: Player })[]>([]);
  const [awayRosterPlayers, setAwayRosterPlayers] = useState<(RosterPlayer & { player: Player })[]>([]);
  const [manualActivePlayerIds, setManualActivePlayerIds] = useState<Set<string>>(new Set());

  const [player, setPlayer] = useState<any>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isExpandedLayout, setIsExpandedLayout] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const hasAutoSeekedRef = useRef<boolean>(false);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [popupTimeOffset, setPopupTimeOffset] = useState<number>(0);
  // 'home' | 'away' | null (null = neither team / contested)
  const [selectedTeamContext, setSelectedTeamContext] = useState<'home' | 'away' | null>('home');

  // Management State
  // Parsed once, before first render, so a deep-linked URL is never clobbered on mount.
  const initialRoute = useRef(parseHashRoute(typeof window !== 'undefined' ? window.location.hash : '')).current;
  const initialParams = initialRoute.params;
  const [view, setView] = useState<RouteView>(initialRoute.view || 'stats');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [managementActiveTab, setManagementActiveTab] = useState<'leagues' | 'tournaments' | 'search' | 'teams' | 'seasons' | 'players' | 'rosters' | 'games' | 'videos' | 'roles' | 'events' | 'import' | 'merge'>('teams');
  const [createActiveTab, setCreateActiveTab] = useState<'rosters' | 'teams' | 'players' | 'games' | 'activity'>('rosters');
  const [beaterStatsTab, setBeaterStatsTab] = useState<'pairs' | 'solo' | 'team'>('pairs');
  const [activePlayerId, setActivePlayerId] = useState<string | null>(initialRoute.playerId);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(initialRoute.teamId);
  const [activeGameId, setActiveGameId] = useState<string | null>(initialRoute.gameId);
  const [playerJerseyNumbers, setPlayerJerseyNumbers] = useState<string[]>([]);

  // Load jersey numbers for the active player from all roster entries
  useEffect(() => {
    if (!activePlayerId) { setPlayerJerseyNumbers([]); return; }
    const q = query(collectionGroup(db, 'players'), where('playerId', '==', activePlayerId));
    getDocs(q).then(snap => {
      const numbers = new Set<string>();
      snap.docs.forEach(doc => {
        const num = doc.data().number;
        if (num && num.trim()) numbers.add(num.trim());
      });
      setPlayerJerseyNumbers(Array.from(numbers).sort((a, b) => Number(a) - Number(b)));
    }).catch(() => setPlayerJerseyNumbers([]));
  }, [activePlayerId]);

  // Close mobile header menu on outside click
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileMenuOpen]);

  // Close mobile header menu whenever the view changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [view]);

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

  // Stats Filter State
  const [statsSubView, setStatsSubView] = useState<'quadball' | 'beaters' | 'seekers' | 'gamecast'>((initialParams.get('sport') as any) || 'quadball');
  const [statsFilter, setStatsFilter] = useState<CompletionScope>(parseScopeParam(initialParams.get('scope') || initialParams.get('verify')));
  const [statsTeamIds, setStatsTeamIds] = useState<string[]>(splitParam(initialParams, 'teams'));
  const [statsSearch, setStatsSearch] = useState<string>(initialParams.get('q') || '');
  const [statsMinGames, setStatsMinGames] = useState<number>(parseInt(initialParams.get('minGP') || '1') || 1);
  const [bludgerControlMode, setBludgerControlMode] = useState<'all' | 'separate'>((initialParams.get('bc') as any) || 'all');
  const [statsFlagFilter, setStatsFlagFilter] = useState<'all' | 'on' | 'off'>((initialParams.get('flag') as any) || 'all');
  const [statsPositionFilter, setStatsPositionFilter] = useState<'all' | 'chaser' | 'keeper'>((initialParams.get('pos') as any) || 'all');
  const [statsSelectedYears, setStatsSelectedYears] = useState<string[]>(splitParam(initialParams, 'years'));
  const [statsLeagueDivs, setStatsLeagueDivs] = useState<string[]>(splitParam(initialParams, 'leagues'));
  const [statsTournamentIds, setStatsTournamentIds] = useState<string[]>(splitParam(initialParams, 'events'));

  // URL Deep Linking / Routing Sync
  useEffect(() => {
    const handleHashChange = () => {
      const route = parseHashRoute(window.location.hash);
      const params = route.params;

      if (route.gameId) setActiveGameId(route.gameId);
      if (route.teamId) setActiveTeamId(route.teamId);
      if (route.playerId) setActivePlayerId(route.playerId);

      if (route.isStats) {
        setStatsSubView((params.get('sport') as any) || 'quadball');
        setStatsLeagueDivs(splitParam(params, 'leagues'));
        setStatsSelectedYears(splitParam(params, 'years'));
        setStatsTournamentIds(splitParam(params, 'events'));
        setStatsTeamIds(splitParam(params, 'teams'));
        setStatsFilter(parseScopeParam(params.get('scope') || params.get('verify')));
        setStatsPositionFilter((params.get('pos') as any) || 'all');
        setBludgerControlMode((params.get('bc') as any) || 'all');
        setStatsFlagFilter((params.get('flag') as any) || 'all');
        setStatsMinGames(parseInt(params.get('minGP') || '1') || 1);
        setStatsSearch(params.get('q') || '');
      }

      // An unrecognised hash leaves the current view alone.
      if (route.view) setView(route.view);
    };

    // No initial call — the state above is seeded from parseHashRoute at first render.
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    let newHash = '#/';
    if (view === 'gameProfile' && activeGameId) newHash = `#/game/${activeGameId}`;
    else if (view === 'teamProfile' && activeTeamId) newHash = `#/team/${activeTeamId}`;
    else if (view === 'playerProfile' && activePlayerId) newHash = `#/player/${activePlayerId}`;
    else if (view === 'stats') {
      newHash = '#/stats';
      const params = new URLSearchParams();
      if (statsSubView !== 'quadball') params.set('sport', statsSubView);
      if (statsLeagueDivs.length > 0) params.set('leagues', statsLeagueDivs.join(','));
      if (statsSelectedYears.length > 0) params.set('years', statsSelectedYears.join(','));
      if (statsTournamentIds.length > 0) params.set('events', statsTournamentIds.join(','));
      if (statsTeamIds.length > 0) params.set('teams', statsTeamIds.join(','));
      if (statsFilter !== 'public') params.set('scope', statsFilter);
      if (statsPositionFilter !== 'all') params.set('pos', statsPositionFilter);
      if (bludgerControlMode !== 'all') params.set('bc', bludgerControlMode);
      if (statsFlagFilter !== 'all') params.set('flag', statsFlagFilter);
      if (statsMinGames > 1) params.set('minGP', statsMinGames.toString());
      if (statsSearch) params.set('q', statsSearch);
      
      const qs = params.toString();
      if (qs) newHash += `?${qs}`;
    }
    else newHash = `#/${view}`;

    const currentHashFull = window.location.hash || '#/stats';
    if (currentHashFull !== newHash) {
      if (view === 'stats' && currentHashFull.startsWith('#/stats')) {
        window.history.replaceState(null, '', newHash);
      } else {
        window.history.pushState(null, '', newHash);
      }
    }
  }, [view, activeGameId, activeTeamId, activePlayerId, statsSubView, statsLeagueDivs, statsSelectedYears, statsTournamentIds, statsTeamIds, statsFilter, statsPositionFilter, bludgerControlMode, statsFlagFilter, statsMinGames, statsSearch]);

  const handlePlayerProfileClick = (id: string) => { pushProfile('playerProfile', { p: id }); };
  const handleTeamProfileClick = (id: string) => { pushProfile('teamProfile', { t: id }); };
  const handleGameProfileClick = (id: string) => { pushProfile('gameProfile', { g: id }); };

  // Recent Events sends a moderator straight to the tracker, since that's where the
  // vote and verify controls live. Games without a video fall back to the box score.
  const handleOpenGameForReview = (gameId: string) => {
    const game = games.find(g => g.id === gameId);
    const vid = videos.find(v => v.gameId === gameId || v.id === (game as any)?.videoId);
    if (vid) {
      setCurrentVideo(vid);
      setView('tracker');
      return;
    }
    toast.error('No video is linked to this game — opening the box score instead.');
    handleGameProfileClick(gameId);
  };
  const [allEvents, setAllEvents] = useState<GameEvent[]>([]);
  const ADMIN_EMAIL = 'andrew.axtell@gmail.com';

  // A Google account is the only real identity. Everyone else is on a silent anonymous
  // session and counts as a plain 'user'.
  const isSignedIn = !!user && !user.isAnonymous;
  // The account as it actually is, ignoring any simulated role. Only this may switch roles,
  // otherwise simulating 'user' would hide the control needed to switch back.
  const isAdminUser = isSignedIn && user.email === ADMIN_EMAIL;

  // Every visitor has a uid now, so votes and suggestions key straight to it. This replaces a
  // localStorage device id whose writes were always rejected by the gameEvents update rules.
  const voterId = user?.uid || '';

  const [simulateRole, setSimulateRole] = useState<UserRole>('admin');
  // uids, not emails: appConfig/roles is world-readable, so it must not hold addresses.
  const [moderatorUids, setModeratorUids] = useState<string[]>([]);

  const effectiveRole: UserRole = isAdminUser ? simulateRole
    : moderatorUids.includes(user?.uid || '') ? 'moderator'
    : isSignedIn ? 'author'
    : 'user';

  const isAdmin = effectiveRole === 'admin';
  const canModerate = effectiveRole === 'admin' || effectiveRole === 'moderator';

  // The Stats filter bar (league/year/team chips, position/control/flag selects, search) is
  // tall enough to push the actual table below the fold, especially for a signed-out viewer
  // who's just browsing. It defaults open for anyone who signs in — they're the ones actually
  // narrowing things down — and closed for a plain viewer, but a manual toggle always wins
  // over that default and sticks across sessions.
  const [statsFiltersExpandedOverride, setStatsFiltersExpandedOverride] = useState<boolean | null>(() => {
    const stored = localStorage.getItem('qr_stats_filters_expanded');
    return stored === 'true' ? true : stored === 'false' ? false : null;
  });
  const statsFiltersExpanded = statsFiltersExpandedOverride ?? (effectiveRole !== 'user');
  const toggleStatsFiltersExpanded = () => {
    const next = !statsFiltersExpanded;
    setStatsFiltersExpandedOverride(next);
    localStorage.setItem('qr_stats_filters_expanded', String(next));
  };

  // Same idea for the floating header above the Watch tab's event feed: density toggle,
  // suggestion queue, and per-team completion controls all live under it, and a plain viewer
  // never touches any of that — so it starts collapsed to just the scrub/filter row for them.
  const [eventsHeaderExpandedOverride, setEventsHeaderExpandedOverride] = useState<boolean | null>(() => {
    const stored = localStorage.getItem('qr_events_header_expanded');
    return stored === 'true' ? true : stored === 'false' ? false : null;
  });
  const eventsHeaderExpanded = eventsHeaderExpandedOverride ?? (effectiveRole !== 'user');
  const toggleEventsHeaderExpanded = () => {
    const next = !eventsHeaderExpanded;
    setEventsHeaderExpandedOverride(next);
    localStorage.setItem('qr_events_header_expanded', String(next));
  };

  // Protect the /manage and /create routes. Hiding the nav buttons was never enough — `view`
  // is restored straight from the URL, so anyone could land on the moderator tools by typing
  // the address. The matching half of this lives in firestore.rules; neither is sufficient alone.
  useEffect(() => {
    if (view === 'manage' && !isAdmin) {
      setView('stats');
      toast.error('You must be an admin to access management tools.');
    }
    if (view === 'create' && !canModerate) {
      setView('stats');
      toast.error('You must be a moderator to access the creation tools.');
    }
  }, [view, isAdmin, canModerate]);

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
  const [eventsFilterSet, setEventsFilterSet] = useState<string>('all');
  const [draftEvents, setDraftEvents] = useState<DraftEvent[]>([]);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [commandPaletteSelectedIndex, setCommandPaletteSelectedIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [voiceCommandText, setVoiceCommandText] = useState('');
  const [voiceStatusMessage, setVoiceStatusMessage] = useState('');
  const [pins, setPins] = useState<Pin[]>([]);
  const [watchLeagueId, setWatchLeagueId] = useState<string>('all');
  const [watchDivision, setWatchDivision] = useState<string>('all');
  const [trackerYearId, setTrackerYearId] = useState<string>('all');
  const [trackerTeamId, setTrackerTeamId] = useState<string>('all');
  const [trackerOpponentId, setTrackerOpponentId] = useState<string>('all');
  const [trackerGameId, setTrackerGameId] = useState<string>('');
  const [verifiedYearId, setVerifiedYearId] = useState<string>('all');
  const [verifiedTeamId, setVerifiedTeamId] = useState<string>('all');

  // Resolve which data to use for stats: demo data takes priority
  const statsPlayers = demoData ? demoData.players : allPlayers;
  const statsEventsRaw = demoData ? demoData.events : allEvents;
  const statsGamesRaw = useMemo(() => {
    const rawGames = demoData ? demoData.games : games;
    return rawGames.map(g => {
      if (g.tournamentId) {
         const t = tournaments.find(x => x.id === g.tournamentId);
         if (t) {
            const matchedSeason = seasons.find(s => s.leagueId === t.leagueId && s.year === t.year && s.division === t.division);
            return { ...g, leagueId: t.leagueId || undefined, division: t.division || undefined, seasonId: matchedSeason ? matchedSeason.id : (g.seasonId || undefined) };
         }
      } else if (g.seasonId) {
         const s = seasons.find(x => x.id === g.seasonId);
         if (s) {
            return { ...g, leagueId: s.leagueId || undefined, division: s.division || undefined };
         }
      }
      return g;
    });
  }, [demoData, games, tournaments, seasons]);
  const statsTeams = demoData ? demoData.teams : teams;
  
  const statsSeasons = useMemo(() => {
    const s = demoData ? demoData.seasons : seasons;
    return [...s]
      .filter(sea => {
        const yearMatch = sea.name?.match(/\d{4}/) || sea.year?.match(/\d{4}/);
        if (!yearMatch) return true;
        return parseInt(yearMatch[0], 10) > 2020;
      })
      .sort((a,b) => (b.description || b.name).localeCompare(a.description || a.name));
  }, [demoData, seasons]);
  // No initialization needed — default '' means "All Seasons", which is correct
  // since dashboardGames already filters out legacy seasons via legacySeasonIds.
  const statsVideos = demoData && demoData.videos.length > 0 ? demoData.videos : videos;

  const legacySeasonIds = useMemo(() => {
    const s = demoData ? demoData.seasons : seasons;
    return new Set(s.filter(sea => {
      const yearMatch = sea.name?.match(/\d{4}/) || sea.year?.match(/\d{4}/);
      if (!yearMatch) return false;
      return parseInt(yearMatch[0], 10) <= 2020;
    }).map(sea => sea.id));
  }, [demoData, seasons]);

  const currentUserTeamId = useMemo(() => (isSignedIn ? teams.find(t => t.memberUids?.includes(user!.uid))?.id : undefined), [teams, user, isSignedIn]);
  const currentSeasonId = ''; // All stats public

  const statsYears = useMemo(() => {
    const ySet = new Set<string>();
    statsSeasons.forEach(s => {
      if (!legacySeasonIds.has(s.id)) {
        if (s.year) ySet.add(s.year);
        else if (s.name) {
          const m = s.name.match(/\d{4}/);
          if (m) ySet.add(m[0]);
        }
      }
    });
    return Array.from(ySet).sort((a, b) => b.localeCompare(a));
  }, [statsSeasons, legacySeasonIds]);

  const statsGames = useMemo(() => {
    return statsGamesRaw.filter(g => !legacySeasonIds.has(g.seasonId));
  }, [statsGamesRaw, legacySeasonIds]);

  // Every authored event is valid — there is no verification gate any more. Accuracy is
  // settled by voting, and a downvoted event gets corrected rather than hidden. What data
  // is fit to *aggregate* is decided by team completion, further down in dashboardEvents.
  const statsEvents = useMemo(() => {
    const validGameIds = new Set(statsGames.map(g => g.id));
    return statsEventsRaw.filter(e => validGameIds.has(e.gameId));
  }, [statsEventsRaw, statsGames]);

  // Per-game access: current-season games visible on Stats page only to author, author's team, or players on either team
  const dashboardGames = useMemo(() => {
    // Only games with at least one complete side reach the Stats page at all; 'full'
    // narrows that to games where both sides are done.
    let filtered = statsGames.filter(g => gameMatchesScope(g, statsFilter));

    // Privacy filtering
    if (currentSeasonId) {
      filtered = filtered.filter(g => {
        if (g.seasonId !== currentSeasonId) return true;
        if (!isSignedIn) return false;
        if (g.authorId === user.uid) return true;
        if (currentUserTeamId && (g.authorTeamId === currentUserTeamId || g.homeTeamId === currentUserTeamId || g.awayTeamId === currentUserTeamId)) return true;
        return false;
      });
    }

    // League Division filtering (multi-select)
    if (statsLeagueDivs.length > 0) {
      const comboSet = new Set(statsLeagueDivs);
      filtered = filtered.filter(g => {
        if (!g.leagueId) return false;
        const combo = `${g.leagueId}|${g.division || ''}`;
        return comboSet.has(combo);
      });
    }

    // Year filtering (multi-select)
    if (statsSelectedYears.length > 0) {
      const yearSet = new Set(statsSelectedYears);
      const validSeasonIds = new Set(statsSeasons.filter(s => {
         const y = s.year || (s.name && s.name.match(/\d{4}/)?.[0]);
         return y ? yearSet.has(y) : false;
      }).map(s => s.id));
      filtered = filtered.filter(g => validSeasonIds.has(g.seasonId) || (g.date && statsSelectedYears.some(y => g.date?.startsWith(y))));
    }

    // Tournament filtering (multi-select)
    if (statsTournamentIds.length > 0) {
      const tSet = new Set(statsTournamentIds);
      filtered = filtered.filter(g => g.tournamentId && tSet.has(g.tournamentId));
    }

    return filtered;
  }, [statsGames, statsFilter, currentSeasonId, user, currentUserTeamId, statsLeagueDivs, statsSelectedYears, statsTournamentIds, statsSeasons]);

  // True if the user can see at least SOME current-season data (hides the warning banner)
  const hasPrivilegedStatsAccess = useMemo(() => {
    if (!currentSeasonId) return true;
    if (!isSignedIn) return false;
    return statsGames.some(g =>
      g.seasonId === currentSeasonId &&
      (g.authorId === user.uid || (currentUserTeamId && (g.authorTeamId === currentUserTeamId || g.homeTeamId === currentUserTeamId || g.awayTeamId === currentUserTeamId)))
    );
  }, [statsGames, currentSeasonId, user, currentUserTeamId]);

  // Everything the aggregates run on. In a half-tracked game the incomplete side survives
  // only as context (its goals still count against the complete side) with no player
  // attribution, so it never earns a stat line of its own.
  const dashboardEvents = useMemo(
    () => scopeEventsToCompleteTeams(statsEvents, dashboardGames, statsFilter),
    [statsEvents, dashboardGames, statsFilter]
  );

  // Lists page (archetype stats) is hard-locked to fully complete games, independent of
  // whatever scope the user has set on the main Stats page — archetype comparisons don't
  // hold up on games where only one side was tracked.
  const listsGames = useMemo(() => dashboardGames.filter(g => isFullyComplete(g)), [dashboardGames]);
  const listsEvents = useMemo(
    () => scopeEventsToCompleteTeams(statsEvents, listsGames, 'full'),
    [statsEvents, listsGames]
  );

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

  const [newVideoData, setNewVideoData] = useState<{ gameId?: string; videoId?: string; seasonId: string; homeTeamId: string; awayTeamId: string; tag?: string; date?: string; leagueId?: string; division?: string; tournamentId?: string; }>({
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
      // Signed out, or a first-time visitor: drop into a silent anonymous session so voting
      // and suggesting work without a sign-in wall.
      if (!u) void ensureAnonymousSession();
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

  // Suggestions Listener — scoped to the current game, since a suggestion is a proposal
  // about one of its events. Rejected/superseded suggestions stay in this list (they remain
  // visible, collapsed, on the event they targeted) — only the review queue and the amber
  // "N suggested fixes" chip filter down to `status === 'open'`.
  useEffect(() => {
    if (!currentVideo) { setSuggestions([]); return; }

    const unsubscribe = onSnapshot(
      collection(db, 'gameEvents', currentVideo.gameId, 'suggestions'),
      (snap) => {
        setSuggestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as EventSuggestion)));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `gameEvents/${currentVideo.gameId}/suggestions`);
      },
    );

    return () => unsubscribe();
  }, [currentVideo]);

  // Global Data — one-time load to minimize reads (no live listener on 20k+ events)
  const [dataLoaded, setDataLoaded] = useState(false);
  const [eventsLoaded, setEventsLoaded] = useState(false);

  const loadGlobalData = useCallback(async () => {
    try {
      const [playersSnap, teamsSnap, seasonsSnap, gamesSnap, videosSnap, rolesSnap, leaguesSnap, tournamentsSnap] = await Promise.all([
        getDoc(doc(db, 'aggregated', 'players')),
        getDoc(doc(db, 'aggregated', 'teams')),
        getDoc(doc(db, 'aggregated', 'seasons')),
        getDoc(doc(db, 'aggregated', 'games')),
        getDoc(doc(db, 'aggregated', 'videos')),
        getDoc(doc(db, 'appConfig', 'roles')),
        getDoc(doc(db, 'aggregated', 'leagues')),
        getDoc(doc(db, 'aggregated', 'tournaments'))
      ]);
      const pList = (playersSnap.data()?.data || []) as Player[];
      setAllPlayers(pList.sort((a, b) => String(a.firstName + ' ' + a.lastName).localeCompare(String(b.firstName + ' ' + b.lastName))));

      const lList = (leaguesSnap.data()?.data || []) as League[];
      setLeagues(lList.sort((a, b) => String(a.name).localeCompare(String(b.name))));

      const sList = (seasonsSnap.data()?.data || []) as Season[];
      setSeasons(sList.sort((a, b) => String(a.name).localeCompare(String(b.name))));

      const tourneyListRaw = (tournamentsSnap.data()?.data || []) as Tournament[];
      const tourneyList = tourneyListRaw.map(t => {
         if (t.seasonId) {
            const s = sList.find(x => x.id === t.seasonId);
            if (s) {
               return { ...t, leagueId: s.leagueId || undefined, division: s.division || undefined, year: s.year || undefined };
            }
         }
         return t;
      });
      setTournaments(tourneyList.sort((a, b) => String(a.name).localeCompare(String(b.name))));

      const tList = (teamsSnap.data()?.data || []) as Team[];
      setTeams(tList.sort((a, b) => String(a.name).localeCompare(String(b.name))));



      const gListRaw = (gamesSnap.data()?.data || []) as Game[];
      const gList = gListRaw.map(g => {
        if (g.tournamentId) {
           const t = tourneyList.find(x => x.id === g.tournamentId);
           if (t) {
              const matchedSeason = sList.find(s => s.leagueId === t.leagueId && s.year === t.year && s.division === t.division);
              return { ...g, leagueId: t.leagueId || undefined, division: t.division || undefined, seasonId: matchedSeason ? matchedSeason.id : (g.seasonId || undefined) };
           }
        } else if (g.seasonId) {
           const s = sList.find(x => x.id === g.seasonId);
           if (s) {
              return { ...g, leagueId: s.leagueId || undefined, division: s.division || undefined };
           }
        }
        return g;
      });
      setGames(gList.sort((a, b) => new Date(serializeTimestamp(b.createdAt)).getTime() - new Date(serializeTimestamp(a.createdAt)).getTime()));

      const vList = (videosSnap.data()?.data || []) as Video[];
      setVideos(vList.sort((a, b) => new Date(serializeTimestamp(b.createdAt)).getTime() - new Date(serializeTimestamp(a.createdAt)).getTime()));

      if (rolesSnap.exists()) {
        const d = rolesSnap.data() || {};
        setModeratorUids(d.moderators || []);
      } else {
        setModeratorUids([]);
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

  // Lazy load full events registry ONLY if the user accesses heavy statistical views to circumvent massive read quotas.
  // Profile and lists views read off the same registry, so they must be listed here too — otherwise a direct
  // link to e.g. #/player/<id> lands on a view that never triggers the load and renders with no stats.
  // 'create' is here for the Leaderboard tab, which is built from the same registry.
  const EVENT_BACKED_VIEWS: ViewState[] = ['stats', 'review', 'lists', 'playerProfile', 'teamProfile', 'gameProfile', 'create'];
  useEffect(() => {
    if (EVENT_BACKED_VIEWS.includes(view)) {
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

  // --- Guided tutorials -----------------------------------------------------
  // Steps and copy live in src/lib/tutorial/trackerSteps.tsx and createSteps.tsx.
  const canRecordEvents = effectiveRole !== 'user';
  const canUseCreateTools = canModerate;

  const tutorialApp = {
    setRightPanelTab,
    setIsExpandedLayout,
    isExpandedLayout,
    setCreateTab: setCreateActiveTab,
    role: effectiveRole,
    canRecord: canRecordEvents,
    canCreate: canUseCreateTools,
  };

  const trackerTutorial = useTutorial({
    tourId: 'game-tracker',
    uid: user?.uid ?? null,
    ready: isAuthReady && view === 'tracker' && !!currentVideo && !!currentGame,
    app: tutorialApp,
  });

  const createTutorial = useTutorial({
    tourId: 'create-tools',
    uid: user?.uid ?? null,
    ready: isAuthReady && view === 'create' && canUseCreateTools,
    app: tutorialApp,
  });

  const handleReplayTutorial = () => {
    const result = trackerTutorial.replay();
    if (result === 'started') return;
    if (currentVideo) {
      // A game is loaded but we're on another view — go back to it and the
      // pending flag picks it up from there.
      setView('tracker');
      return;
    }
    toast.success('Tutorial will start the next time you open a game.');
  };

  const handleReplayCreateTutorial = () => {
    // Unlike the tracker, we can just take them straight there.
    if (createTutorial.replay() === 'pending') setView('create');
  };

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

  const handleRegeneratePossessionPins = () => {
    if (!currentVideo) return;
    const possTypes = ['goal', 'shot', 'attempt', 'turnover', 'miss_ko'];
    
    // Sort events chronologically
    const videoEvents = events
      .filter(e => e.videoId === currentVideo.id && e.type && possTypes.includes(e.type))
      .sort((a, b) => a.videoTime - b.videoTime);
      
    const newPins: Pin[] = [];
    let lastTeamId: string | null = null;
    let lastType: string | null = null;
    let lastTime: number = 0;
    
    for (const e of videoEvents) {
      if (!e.teamId) continue;
      
      // If the team changed, a transition occurred.
      if (lastTeamId && lastTeamId !== e.teamId) {
        if (lastType === 'shot' || lastType === 'attempt' || lastType === 'miss_ko') {
          newPins.push({
            id: crypto.randomUUID(),
            videoId: currentVideo.id,
            time: lastTime + 1,
            type: 'possession'
          });
        }
      }
      
      // Explicit possession ends
      if (e.type === 'goal' || e.type === 'turnover') {
        newPins.push({
          id: crypto.randomUUID(),
          videoId: currentVideo.id,
          time: e.videoTime + 1,
          type: 'possession'
        });
      }
      
      lastTeamId = e.teamId;
      lastType = e.type;
      lastTime = e.videoTime;
    }

    // Generate missing control pins
    const controlTypes = ['control_change', 'control_start'];
    const controlEvents = events
      .filter(e => e.videoId === currentVideo.id && e.type && controlTypes.includes(e.type))
      .sort((a, b) => a.videoTime - b.videoTime);

    let lastControlTeamId: string | null = null;
    let lastControlTime: number = 0;

    for (const e of controlEvents) {
      if (!e.teamId) continue;

      if (lastControlTeamId && lastControlTeamId === e.teamId) {
        // Missing control transition (same team retained control across two control events)
        const midTime = (lastControlTime + e.videoTime) / 2;
        newPins.push({
          id: crypto.randomUUID(),
          videoId: currentVideo.id,
          time: midTime,
          type: 'control'
        });
      }

      lastControlTeamId = e.teamId;
      lastControlTime = e.videoTime;
    }
    
    // Replace only the possession and control pins for the current video, keeping others intact
    setPins(prev => [
      ...prev.filter(p => p.videoId !== currentVideo.id || (p.type !== 'possession' && p.type !== 'control')),
      ...newPins
    ]);
    
    toast.success(`Regenerated ${newPins.length} auto-pins`);
  };


  const handleAddEvent = async (
    type: EventType,
    playerId?: string,
    subPlayerId?: string,
    relatedEventId?: string,
    teamId?: string | null,
    position?: PositionType | null,
    providedVideoTime?: number,
    providedGameTime?: number,
    color?: string | null
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
        position: position || null,
        color: color || null
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



    let inferredTeamId = teamId || null;
    if (!inferredTeamId && currentGame && type) {
      const past = activeTrackingEvents.filter(e => e.videoTime <= vTime);
      if (type === 'control_change') {
        const cTeam = getControlTeamAtTime(computeControlPeriods(past), vTime);
        inferredTeamId = cTeam === currentGame.homeTeamId ? currentGame.awayTeamId : currentGame.homeTeamId;
      } else if (['goal', 'shot', 'attempt', 'miss_ko', 'turnover', 'assist'].includes(type)) {
        const lastQ = past.slice().reverse().find(e => ['goal', 'shot', 'attempt', 'miss_ko', 'turnover', 'quadball_start', 'takeaway'].includes(e.type as string) && e.teamId);
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



    setDraftEvents(prev => [newDraft, ...prev]);
  };

  const handleDeleteDraftEvent = (id: string) => {
    setDraftEvents(prev => prev.filter(d => d.id !== id));
  };

  // Command Palette & Speech recognition hooks
  const commandPaletteResults = useMemo(() => {
    if (!commandPaletteQuery.trim()) return [];
    const query = commandPaletteQuery.toLowerCase();
    
    const matchedPlayers = statsPlayers
      .filter(p => {
        const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
        return fullName.includes(query) || (p.nickname && p.nickname.toLowerCase().includes(query));
      })
      .map(p => ({
        type: 'player' as const,
        id: p.id,
        title: `${p.firstName} ${p.lastName}`,
        subtitle: p.nickname ? `"${p.nickname}"` : 'Quadball Athlete',
      }));

    const matchedTeams = statsTeams
      .filter(t => t.name.toLowerCase().includes(query) || (t.shortName && t.shortName.toLowerCase().includes(query)))
      .map(t => ({
        type: 'team' as const,
        id: t.id,
        title: t.name,
        subtitle: `${t.shortName || ''} Quadball Club`,
      }));

    const matchedGames = statsGames
      .filter(g => {
        const homeTeamName = statsTeams.find(t => t.id === g.homeTeamId)?.name || '';
        const awayTeamName = statsTeams.find(t => t.id === g.awayTeamId)?.name || '';
        return (
          homeTeamName.toLowerCase().includes(query) ||
          awayTeamName.toLowerCase().includes(query) ||
          (g.tournamentId && g.tournamentId.toLowerCase().includes(query))
        );
      })
      .map(g => {
        const homeTeam = statsTeams.find(t => t.id === g.homeTeamId);
        const awayTeam = statsTeams.find(t => t.id === g.awayTeamId);
        return {
          type: 'game' as const,
          id: g.id,
          title: `${homeTeam?.name || 'Home'} vs ${awayTeam?.name || 'Away'}`,
          subtitle: `${g.date || ''} ${g.division ? '• ' + g.division : ''} ${g.tag ? '• ' + g.tag : ''}`,
        };
      });

    return [...matchedPlayers, ...matchedTeams, ...matchedGames].slice(0, 10);
  }, [commandPaletteQuery, statsPlayers, statsTeams, statsGames]);

  const handleSelectCommandPaletteItem = (item: { type: 'player' | 'team' | 'game'; id: string }) => {
    setIsCommandPaletteOpen(false);
    setCommandPaletteQuery('');
    if (item.type === 'player') {
      handlePlayerProfileClick(item.id);
    } else if (item.type === 'team') {
      handleTeamProfileClick(item.id);
    } else if (item.type === 'game') {
      handleGameProfileClick(item.id);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
        setCommandPaletteQuery('');
        setCommandPaletteSelectedIndex(0);
      }
      if (isCommandPaletteOpen) {
        if (e.key === 'Escape') {
          setIsCommandPaletteOpen(false);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setCommandPaletteSelectedIndex(prev => 
            prev < commandPaletteResults.length - 1 ? prev + 1 : 0
          );
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setCommandPaletteSelectedIndex(prev => 
            prev > 0 ? prev - 1 : commandPaletteResults.length - 1
          );
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const selectedItem = commandPaletteResults[commandPaletteSelectedIndex];
          if (selectedItem) {
            handleSelectCommandPaletteItem(selectedItem);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCommandPaletteOpen, commandPaletteResults, commandPaletteSelectedIndex]);

  const findRosterPlayer = (
    searchStr: string,
    teamId?: string | null
  ): { player: Player; number: string; teamId: string } | null => {
    if (!currentGame) return null;
    const cleanStr = searchStr.trim().toLowerCase();
    if (!cleanStr) return null;

    const candidates: { rp: RosterPlayer & { player: Player }; teamId: string }[] = [];
    if (!teamId || teamId === currentGame.homeTeamId) {
      homeRosterPlayers.forEach(rp => candidates.push({ rp, teamId: currentGame.homeTeamId }));
    }
    if (!teamId || teamId === currentGame.awayTeamId) {
      awayRosterPlayers.forEach(rp => candidates.push({ rp, teamId: currentGame.awayTeamId }));
    }

    const matchByNumber = candidates.find(c => c.rp.number === cleanStr);
    if (matchByNumber) {
      return { player: matchByNumber.rp.player, number: matchByNumber.rp.number, teamId: matchByNumber.teamId };
    }

    const matchByLastName = candidates.find(
      c => c.rp.player.lastName.toLowerCase() === cleanStr || 
           c.rp.player.lastName.toLowerCase().includes(cleanStr)
    );
    if (matchByLastName) {
      return { player: matchByLastName.rp.player, number: matchByLastName.rp.number, teamId: matchByLastName.teamId };
    }

    const matchByFirstName = candidates.find(
      c => c.rp.player.firstName.toLowerCase() === cleanStr ||
           (c.rp.player.preferredName && c.rp.player.preferredName.toLowerCase() === cleanStr) ||
           c.rp.player.firstName.toLowerCase().includes(cleanStr)
    );
    if (matchByFirstName) {
      return { player: matchByFirstName.rp.player, number: matchByFirstName.rp.number, teamId: matchByFirstName.teamId };
    }

    return null;
  };

  const parseNlpCommand = (commandText: string) => {
    if (!currentGame) {
      setVoiceStatusMessage("No active game to log events!");
      return;
    }

    const text = commandText.toLowerCase().trim();
    const vTime = player ? (function(){ try { return player.getCurrentTime(); } catch(e){ return 0; }})() : 0;

    let detectedType: EventType | null = null;
    let targetTeamId: string | null = null;
    let targetPlayerId: string | null = null;
    let assistedByPlayerId: string | null = null;
    let subPlayerId: string | null = null;
    let cardColor: string | null = null;

    if (text.includes("home")) {
      targetTeamId = currentGame.homeTeamId;
    } else if (text.includes("away")) {
      targetTeamId = currentGame.awayTeamId;
    }

    if (text.startsWith("goal") || text.includes("scored")) {
      detectedType = 'goal';
      let scorerQuery = text
        .replace("goal", "")
        .replace("scored", "")
        .replace("home", "")
        .replace("away", "")
        .replace("assist", "")
        .split("for")[0]
        .trim();

      if (text.includes("assist")) {
        const parts = text.split("assist");
        scorerQuery = parts[0]
          .replace("goal", "")
          .replace("scored", "")
          .replace("home", "")
          .replace("away", "")
          .trim();
        const assistQuery = parts[1]
          .replace("by", "")
          .replace("home", "")
          .replace("away", "")
          .trim();
        
        const assistPlayer = findRosterPlayer(assistQuery, targetTeamId);
        if (assistPlayer) {
          assistedByPlayerId = assistPlayer.player.id;
          if (!targetTeamId) targetTeamId = assistPlayer.teamId;
        }
      }

      const scorerPlayer = findRosterPlayer(scorerQuery, targetTeamId);
      if (scorerPlayer) {
        targetPlayerId = scorerPlayer.player.id;
        if (!targetTeamId) targetTeamId = scorerPlayer.teamId;
      }
    }
    else if (text.startsWith("turnover") || text.includes("turn over")) {
      detectedType = 'turnover';
      const playerQuery = text
        .replace("turnover", "")
        .replace("turn over", "")
        .replace("home", "")
        .replace("away", "")
        .trim();
      const p = findRosterPlayer(playerQuery, targetTeamId);
      if (p) {
        targetPlayerId = p.player.id;
        targetTeamId = p.teamId;
      }
    }
    else if (text.includes("card")) {
      detectedType = 'card';
      if (text.includes("yellow")) cardColor = 'yellow';
      else if (text.includes("red")) cardColor = 'red';
      else if (text.includes("blue")) cardColor = 'blue';

      const playerQuery = text
        .replace("card", "")
        .replace("yellow", "")
        .replace("red", "")
        .replace("blue", "")
        .replace("home", "")
        .replace("away", "")
        .trim();
      const p = findRosterPlayer(playerQuery, targetTeamId);
      if (p) {
        targetPlayerId = p.player.id;
        targetTeamId = p.teamId;
      }
    }
    else if (text.startsWith("foul") || text.includes("fouled")) {
      detectedType = 'foul';
      const playerQuery = text
        .replace("foul", "")
        .replace("fouled", "")
        .replace("home", "")
        .replace("away", "")
        .trim();
      const p = findRosterPlayer(playerQuery, targetTeamId);
      if (p) {
        targetPlayerId = p.player.id;
        targetTeamId = p.teamId;
      }
    }
    else if (text.startsWith("sub") || text.includes("substitution") || text.includes("replace")) {
      detectedType = 'sub_out';
      let inQuery = '';
      let outQuery = '';

      if (text.includes("in for")) {
        const parts = text.split("in for");
        inQuery = parts[0].replace("sub", "").replace("in", "").replace("out", "").trim();
        outQuery = parts[1].trim();
      } else if (text.includes("for")) {
        const parts = text.split("for");
        inQuery = parts[0].replace("sub", "").replace("in", "").replace("out", "").trim();
        outQuery = parts[1].trim();
      } else if (text.includes("replace")) {
        const parts = text.split("with");
        outQuery = parts[0].replace("replace", "").trim();
        inQuery = parts[1].trim();
      }

      const outPlayer = findRosterPlayer(outQuery, targetTeamId);
      const inPlayer = findRosterPlayer(inQuery, targetTeamId);

      if (outPlayer) {
        targetPlayerId = outPlayer.player.id;
        targetTeamId = outPlayer.teamId;
      }
      if (inPlayer) {
        subPlayerId = inPlayer.player.id;
        if (!targetTeamId) targetTeamId = inPlayer.teamId;
      }
    }

    if (!detectedType) {
      setVoiceStatusMessage(`Could not recognize event type from: "${commandText}"`);
      return;
    }

    const inferredTeam = targetTeamId || currentGame.homeTeamId;

    const newDraft: DraftEvent = {
      id: crypto.randomUUID(),
      type: detectedType,
      videoTime: vTime,
      gameTime: gameTime,
      teamId: inferredTeam,
      playerId: targetPlayerId || null,
      relatedEventId: null,
      assistedByPlayerId: assistedByPlayerId || null,
      position: null,
      subPlayerId: subPlayerId || null,
      color: cardColor || null
    };

    setDraftEvents(prev => [newDraft, ...prev]);
    setVoiceStatusMessage(`Staged: ${detectedType.toUpperCase()} at ${formatTime(vTime)}!`);
    toast.success(`Staged ${detectedType.toUpperCase()} event!`);
  };

  const toggleSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech Recognition is not supported by your browser. Please type commands manually below.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceStatusMessage("Listening... Speak now!");
      };

      recognition.onerror = (e: any) => {
        console.error("Speech Recognition Error:", e);
        setIsListening(false);
        setVoiceStatusMessage(`Error: ${e.error || 'Failed to capture speech'}`);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onresult = (event: any) => {
        const resultText = event.results[0][0].transcript;
        setVoiceCommandText(resultText);
        parseNlpCommand(resultText);
      };

      recognition.start();
    } catch (err) {
      console.error(err);
      toast.error("Failed to start microphone listener.");
    }
  };

  const handleDeleteRecordedEvent = async (eventId: string) => {
    if (!currentVideo || !user) return;
    const exactDbEvent = events.find(e => e.id === eventId);
    if (!exactDbEvent) {
      toast.error('Event not found in live scope.');
      return;
    }

    if (!canModerate && exactDbEvent.userId !== user.uid) {
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

  const handleEditRecordedEvent = async (eventId: string) => {
    if (!currentVideo || !user) return;
    const exactDbEvent = events.find(e => e.id === eventId);
    if (!exactDbEvent) {
      toast.error('Event not found in live scope.');
      return;
    }

    if (!canModerate && exactDbEvent.userId !== user.uid) {
      toast.error('You do not have permission to edit an event authored by someone else.');
      return;
    }

    // Create a draft pre-populated with the existing event's data
    const editDraft: DraftEvent = {
      id: crypto.randomUUID(),
      type: exactDbEvent.type as EventType,
      videoTime: exactDbEvent.videoTime,
      gameTime: exactDbEvent.gameTime,
      teamId: exactDbEvent.teamId || null,
      playerId: exactDbEvent.playerId || null,
      relatedEventId: exactDbEvent.relatedEventId || null,
      assistedByPlayerId: null,
      position: (exactDbEvent.position as PositionType) || null,
      subPlayerId: exactDbEvent.subPlayerId || null,
      color: exactDbEvent.color || null,
    };

    // Delete the original event from Firestore
    try {
      const gameEventsRef = doc(db, 'gameEvents', currentVideo.gameId);
      const snap = await getDoc(gameEventsRef);
      if (snap.exists()) {
        const evs = snap.data().events || [];
        const newEvs = evs.filter((ev: any) => ev.id !== eventId);
        await updateDoc(gameEventsRef, { events: newEvs });
      }
    } catch (error) {
      toast.error('Failed to remove original event for editing.');
      console.error("Edit Error:", error);
      return;
    }

    // Add the draft and switch to the record panel
    setDraftEvents(prev => [editDraft, ...prev]);
    setRightPanelTab('record');

    // Seek to the event's timestamp
    try {
      if (player) {
        player.seekTo(exactDbEvent.videoTime, true);
        player.pauseVideo();
      }
    } catch (e) {}

    toast.success('Event moved to drafts for editing');
  };

  const handleUpdateEventPlayerId = async (eventId: string, newPlayerId: string) => {
    if (!currentVideo || !user) return;
    const exactDbEvent = events.find(e => e.id === eventId);
    if (!exactDbEvent) {
      toast.error('Event not found in live scope.');
      return;
    }

    if (!canModerate && exactDbEvent.userId !== user.uid) {
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

  /**
   * Marks one side of a game complete (or not). Completion is per team so a single author
   * can finish the half they tracked and have those stats publish without waiting on
   * anyone to cover the other side.
   *
   * `isVerified` is kept in sync as "both sides complete" purely so anything still reading
   * the old whole-game flag stays correct.
   */
  const handleSetTeamCompletion = async (gameId: string, side: 'home' | 'away', value: TeamCompletion) => {
    if (!canModerate) {
      toast.error('Only admins or moderators can mark a team complete.');
      return;
    }
    if (!gameId) return;
    const game = games.find(g => g.id === gameId);
    if (!game) return;

    const field = side === 'home' ? 'homeCompletion' : 'awayCompletion';
    const next = { ...game, [field]: value };
    const patch = { [field]: value, isVerified: isFullyComplete(next) };

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'games', gameId), patch);

      const aggGameRef = doc(db, 'aggregated', 'games');
      const aggSnap = await getDoc(aggGameRef);
      if (aggSnap.exists()) {
        const gamesList = aggSnap.data()?.data || [];
        const updatedList = gamesList.map((g: any) => g.id === gameId ? { ...g, ...patch } : g);
        batch.update(aggGameRef, { data: updatedList });
      }

      await batch.commit();
      setGames(prev => prev.map(g => g.id === gameId ? { ...g, ...patch } : g));
      const teamName = teams.find(t => t.id === (side === 'home' ? game.homeTeamId : game.awayTeamId))?.name
        || (side === 'home' ? 'Home' : 'Away');
      toast.success(value === 'none'
        ? `${teamName} marked incomplete.`
        : `${teamName} marked ${TEAM_COMPLETION_LABELS[value].toLowerCase()}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `games/${gameId}`);
    }
  };

  const handleSaveDraftEvent = (draft: DraftEvent, chainNext: boolean = false) => {
    if (!draft.type) {
      toast.error("Please select an event type");
      return;
    }

    if ((draft.type === 'control_change' || draft.type === 'control_start') && currentVideo) {
      const pastControlEvents = events
        .filter(e => e.type === 'control_change' || e.type === 'control_start')
        .filter(e => e.videoTime <= draft.videoTime)
        .sort((a, b) => b.videoTime - a.videoTime);

      const lastControlEvent = pastControlEvents[0];
      if (lastControlEvent && lastControlEvent.teamId === draft.teamId) {
        const midTime = (lastControlEvent.videoTime + draft.videoTime) / 2;
        setPins(prev => [...prev, {
          id: crypto.randomUUID(),
          videoId: currentVideo.id,
          time: midTime,
          type: 'control'
        }]);
        toast.info("Dropped a pin for missing control transition");
      }
    }

    if ((draft.type === 'goal' || draft.type === 'turnover') && currentVideo) {
      setPins(prev => [...prev, {
        id: crypto.randomUUID(),
        videoId: currentVideo.id,
        time: draft.videoTime + 1,
        type: 'possession'
      }]);
    }

    const possTypes = ['goal', 'shot', 'attempt', 'turnover', 'miss_ko'];
    if (possTypes.includes(draft.type) && draft.teamId && currentVideo) {
      const pastPossEvents = events
        .filter(e => e.type && possTypes.includes(e.type))
        .filter(e => e.videoTime <= draft.videoTime)
        .sort((a, b) => b.videoTime - a.videoTime);
        
      const lastPossEvent = pastPossEvents[0];
      
      // If the team changed, a transition occurred.
      if (lastPossEvent && lastPossEvent.teamId && lastPossEvent.teamId !== draft.teamId) {
        // If the transition wasn't already pinned by a goal or turnover, pin it now.
        if (lastPossEvent.type === 'shot' || lastPossEvent.type === 'attempt' || lastPossEvent.type === 'miss_ko') {
          setPins(prev => [...prev, {
            id: crypto.randomUUID(),
            videoId: currentVideo.id,
            time: lastPossEvent.videoTime + 1, // +1 second so it doesn't perfectly overlap the shot
            type: 'possession'
          }]);
          toast.info("Dropped a pin for missing possession transition");
        }
      }
    }

    handleAddEvent(
      draft.type,
      draft.playerId || undefined,
      undefined, // subPlayerId usually not drafted this way, but we can extend later
      draft.relatedEventId || undefined,
      draft.teamId || null,
      draft.position || null,
      draft.videoTime,
      draft.gameTime,
      draft.color || null
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

      // A card given to the keeper may trigger a keeper swap: the carded keeper
      // moves to their swap partner's on-field position, and that partner takes
      // over keeper. Modeled as two independent sub_out/sub_in pairs so it fits
      // the existing substitution event schema.
      if (draft.type === 'card' && draft.swapPlayerId && draft.playerId && draft.teamId) {
        const outgoingKeeperId = draft.playerId;
        const incomingKeeperId = draft.swapPlayerId;
        const incomingPriorPosition = activePlayerPositions.get(incomingKeeperId) || 'chaser';

        handleAddEvent(
          'sub_out',
          outgoingKeeperId,
          undefined,
          undefined,
          draft.teamId,
          'keeper',
          draft.videoTime,
          draft.gameTime
        ).then((outSubId) => {
          handleAddEvent(
            'sub_in',
            outgoingKeeperId,
            undefined,
            outSubId || undefined,
            draft.teamId,
            incomingPriorPosition,
            draft.videoTime,
            draft.gameTime
          );
        });

        handleAddEvent(
          'sub_out',
          incomingKeeperId,
          undefined,
          undefined,
          draft.teamId,
          incomingPriorPosition,
          draft.videoTime,
          draft.gameTime
        ).then((outSubId) => {
          handleAddEvent(
            'sub_in',
            incomingKeeperId,
            undefined,
            outSubId || undefined,
            draft.teamId,
            'keeper',
            draft.videoTime,
            draft.gameTime
          );
        });
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
    const autoResumeTypes = ['goal', 'shot', 'attempt', 'miss_ko', 'turnover', 'quadball_start', 'control_change', 'control_start'];
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
      const [pSnap, tSnap, sSnap, gSnap, vSnap, lSnap] = await Promise.all([
        getDocs(collection(db, 'players')),
        getDocs(collection(db, 'teams')),
        getDocs(collection(db, 'seasons')),
        getDocs(collection(db, 'games')),
        getDocs(collection(db, 'videos')),
        getDocs(collection(db, 'leagues'))
      ]);

      const lData = lSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name || '', divisions: doc.data().divisions || [] }));
      
      const batch = writeBatch(db);

      // Perform Migration of String 'league' to 'leagueId'
      const existingLeaguesByName = new Map(lData.map(l => [l.name, l.id]));
      let addedLeagues = false;

      const migrateEntity = async (docSnap: any, collectionName: string) => {
        const data = docSnap.data();
        if (data.league && !data.leagueId) {
          let leagueId = existingLeaguesByName.get(data.league);
          if (!leagueId) {
            // Create missing league
            const newLeagueRef = doc(collection(db, 'leagues'));
            leagueId = newLeagueRef.id;
            batch.set(newLeagueRef, { name: data.league, divisions: [], createdAt: serverTimestamp() });
            existingLeaguesByName.set(data.league, leagueId);
            lData.push({ id: leagueId, name: data.league, divisions: [] });
            addedLeagues = true;
          }
          batch.update(docSnap.ref, { leagueId, league: deleteField() });
          return { ...data, leagueId, league: undefined, id: docSnap.id };
        }
        return { ...data, id: docSnap.id };
      };

      const updatedTeams = await Promise.all(tSnap.docs.map(d => migrateEntity(d, 'teams')));
      const updatedSeasons = await Promise.all(sSnap.docs.map(d => migrateEntity(d, 'seasons')));

      const pData = pSnap.docs.map(doc => ({ id: doc.id, firstName: doc.data().firstName || '', lastName: doc.data().lastName || '', preferredName: doc.data().preferredName || '', nickname: doc.data().nickname || '' }));
      const tData = updatedTeams.map(doc => ({ id: doc.id, name: doc.name || '', leagueId: doc.leagueId || '', division: doc.division || '' }));
      const sData = updatedSeasons.map(doc => ({ id: doc.id, name: doc.name || '', leagueId: doc.leagueId || '', year: doc.year || '', description: doc.description || '' }));
      const gData = gSnap.docs.map(doc => ({ id: doc.id, seasonId: doc.data().seasonId || '', homeTeamId: doc.data().homeTeamId || '', awayTeamId: doc.data().awayTeamId || '', isVerified: doc.data().isVerified || false, homeCompletion: doc.data().homeCompletion || null, awayCompletion: doc.data().awayCompletion || null, authorId: doc.data().authorId || '', authorTeamId: doc.data().authorTeamId || '', tag: doc.data().tag || null, date: doc.data().date || null, leagueId: doc.data().leagueId || null, division: doc.data().division || null, createdAt: serializeTimestamp(doc.data().createdAt) }));
      const vData = vSnap.docs.map(doc => ({ id: doc.id, videoId: doc.data().videoId || '', youtubeId: doc.data().youtubeId || '', gameId: doc.data().gameId || '', title: doc.data().title || '', createdAt: serializeTimestamp(doc.data().createdAt) }));

      batch.set(doc(db, 'aggregated', 'players'), { data: pData });
      batch.set(doc(db, 'aggregated', 'teams'), { data: tData });
      batch.set(doc(db, 'aggregated', 'seasons'), { data: sData });
      batch.set(doc(db, 'aggregated', 'games'), { data: gData });
      batch.set(doc(db, 'aggregated', 'videos'), { data: vData });
      
      if (addedLeagues) {
         batch.set(doc(db, 'aggregated', 'leagues'), { data: lData });
      }

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

  const handleAddLeague = async (name: string, divisions?: string[]) => {
    if (!name.trim() || !isAdmin) return null;
    try {
      const docRef = await addDoc(collection(db, 'leagues'), { name: name.trim(), divisions: divisions || [], createdAt: serverTimestamp() });
      await setDoc(doc(db, 'aggregated', 'leagues'), { data: arrayUnion({ id: docRef.id, name: name.trim(), divisions: divisions || [] }) }, { merge: true });
      setLeagues(prev => [...prev, { id: docRef.id, name: name.trim(), divisions: divisions || [], createdAt: new Date() } as League].sort((a, b) => String(a.name).localeCompare(String(b.name))));
      toast.success('League added');
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'leagues');
      return null;
    }
  };

  const handleEditLeague = async (id: string, newName: string, newDivisions?: string[]) => {
    try {
      const leagueRef = doc(db, 'leagues', id);
      const oldLeague = leagues.find(l => l.id === id);
      if (!oldLeague) throw new Error("League not found locally");
      
      await updateDoc(leagueRef, { name: newName, divisions: newDivisions || [] });
      const oldAgg = { id: oldLeague.id, name: oldLeague.name || '', divisions: oldLeague.divisions || [] };
      const newAgg = { ...oldAgg, name: newName, divisions: newDivisions || [] };
      
      const aggRef = doc(db, 'aggregated', 'leagues');
      const aggSnap = await getDoc(aggRef);
      if (aggSnap.exists()) {
        let currentData = aggSnap.data().data || [];
        currentData = currentData.map((item: any) => item.id === id ? newAgg : item);
        await updateDoc(aggRef, { data: currentData });
      }
      
      setLeagues(prev => prev.map(l => l.id === id ? { ...l, name: newName, divisions: newDivisions || [] } : l));
      toast.success('League updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'leagues');
    }
  };

  const handleDeleteLeague = async (id: string) => {
    if (!isAdmin) return;
    try {
      const deletedLeague = leagues.find(l => l.id === id);
      if (deletedLeague) {
        await deleteDoc(doc(db, 'leagues', id));
        await updateDoc(doc(db, 'aggregated', 'leagues'), { data: arrayRemove({ id: deletedLeague.id, name: deletedLeague.name || '', divisions: deletedLeague.divisions || [] }) });
        setLeagues(prev => prev.filter(l => l.id !== id));
        toast.success('League deleted');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'leagues');
    }
  };

  const handleAddTournament = async (name: string, seasonId: string, startDate?: string, endDate?: string, location?: string) => {
    if (!name.trim() || !seasonId) return null;
    try {
      const docData: any = { name: name.trim(), seasonId, createdAt: serverTimestamp() };
      if (startDate) docData.startDate = startDate;
      if (endDate) docData.endDate = endDate;
      if (location) docData.location = location;

      const docRef = await addDoc(collection(db, 'tournaments'), docData);
      await setDoc(doc(db, 'aggregated', 'tournaments'), { data: arrayUnion({ id: docRef.id, ...docData, createdAt: null }) }, { merge: true });
      setTournaments(prev => [...prev, { id: docRef.id, ...docData, createdAt: new Date() } as Tournament].sort((a, b) => String(a.name).localeCompare(String(b.name))));
      toast.success('Tournament added');
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tournaments');
      return null;
    }
  };

  const handleEditTournament = async (id: string, newName: string, newSeasonId: string, newStartDate?: string, newEndDate?: string, newLocation?: string) => {
    try {
      const tourneyRef = doc(db, 'tournaments', id);
      const oldTourney = tournaments.find(t => t.id === id);
      if (!oldTourney) throw new Error("Tournament not found locally");
      
      const updateData: any = { name: newName, seasonId: newSeasonId };
      updateData.startDate = newStartDate || deleteField();
      updateData.endDate = newEndDate || deleteField();
      updateData.location = newLocation || deleteField();
      updateData.leagueId = deleteField();
      updateData.division = deleteField();
      updateData.year = deleteField();

      await updateDoc(tourneyRef, updateData);
      
      const newAgg: any = { id: oldTourney.id, name: newName, seasonId: newSeasonId };
      if (newStartDate) newAgg.startDate = newStartDate;
      if (newEndDate) newAgg.endDate = newEndDate;
      if (newLocation) newAgg.location = newLocation;

      const aggRef = doc(db, 'aggregated', 'tournaments');
      const aggSnap = await getDoc(aggRef);
      if (aggSnap.exists()) {
        let currentData = aggSnap.data().data || [];
        currentData = currentData.map((item: any) => item.id === id ? newAgg : item);
        await updateDoc(aggRef, { data: currentData });
      }
      
      setTournaments(prev => prev.map(t => t.id === id ? { ...t, ...newAgg } : t));
      toast.success('Tournament updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tournaments');
    }
  };

  const handleDeleteTournament = async (id: string) => {
    if (!isAdmin) return;
    try {
      const deletedTourney = tournaments.find(t => t.id === id);
      if (deletedTourney) {
        await deleteDoc(doc(db, 'tournaments', id));
        const aggRef = doc(db, 'aggregated', 'tournaments');
        const aggSnap = await getDoc(aggRef);
        if (aggSnap.exists()) {
          let currentData = aggSnap.data().data || [];
          currentData = currentData.filter((item: any) => item.id !== id);
          await updateDoc(aggRef, { data: currentData });
        }
        setTournaments(prev => prev.filter(t => t.id !== id));
        toast.success('Tournament deleted');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'tournaments');
    }
  };

  const handleAddTeam = async (name: string, leagueId?: string, division?: string) => {
    try {
      const teamData = { name, ...(leagueId && { leagueId }), ...(division && { division }) };
      const docRef = await addDoc(collection(db, 'teams'), { ...teamData, createdAt: serverTimestamp() });
      await updateDoc(doc(db, 'aggregated', 'teams'), { data: arrayUnion({ id: docRef.id, ...teamData }) });
      setTeams(prev => [...prev, { id: docRef.id, ...teamData, createdAt: new Date() } as Team].sort((a, b) => String(a.name).localeCompare(String(b.name))));
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'teams');
      return null;
    }
  };

  const handleEditTeamEmails = async (id: string, memberUids: string[]) => {
    try {
      const teamRef = doc(db, 'teams', id);
      await updateDoc(teamRef, { memberUids });
      const t = teams.find(tm => tm.id === id);
      if (t) {
        // Safe read-filter-write pattern for aggregated
        const aggSnap = await getDoc(doc(db, 'aggregated', 'teams'));
        if (aggSnap.exists()) {
          const arr = (aggSnap.data().data || []) as any[];
          const updated = arr.map(a => a.id === id ? { ...a, memberUids } : a);
          await updateDoc(doc(db, 'aggregated', 'teams'), { data: updated });
        }
      }
      setTeams(prev => prev.map(tm => tm.id === id ? { ...tm, memberUids } : tm));
      toast.success(`Team managers updated.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'teams');
    }
  };

  const handleAddSeason = async (name: string, leagueId: string, division: string | undefined, year: string, tournamentId: string) => {
    try {
      const seasonData = { name, leagueId, ...(division && { division }), year, ...(tournamentId && { tournamentId }) };
      const docRef = await addDoc(collection(db, 'seasons'), { ...seasonData, createdAt: serverTimestamp() });
      await updateDoc(doc(db, 'aggregated', 'seasons'), { data: arrayUnion({ id: docRef.id, ...seasonData }) });
      setSeasons(prev => [...prev, { id: docRef.id, ...seasonData, createdAt: new Date() } as Season].sort((a, b) => String(a.name).localeCompare(String(b.name))));
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'seasons');
      return null;
    }
  };

  const handleAddGlobalPlayer = async (firstName: string, lastName: string, preferredName?: string, nickname?: string, gender?: PlayerGender) => {
    try {
      // NOTE: gender is intentionally written only to the source players/{id} doc, never to the
      // aggregated/players blob that feeds public stats/list views — it must never be displayed.
      const docRef = await addDoc(collection(db, 'players'), { firstName, lastName, preferredName: preferredName || '', nickname: nickname || '', gender: gender || null, createdAt: serverTimestamp() });
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
        const oldAgg = { id: g.id, seasonId: g.seasonId || '', homeTeamId: g.homeTeamId || '', awayTeamId: g.awayTeamId || '', isVerified: g.isVerified || false, homeCompletion: g.homeCompletion || null, awayCompletion: g.awayCompletion || null, createdAt: serializeTimestamp(g.createdAt) };
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
        // Current format
        await updateDoc(doc(db, 'aggregated', 'seasons'), { data: arrayRemove({ id: deletedSeason.id, name: deletedSeason.name || '', leagueId: deletedSeason.leagueId || deletedSeason.league || '', division: deletedSeason.division || null, year: deletedSeason.year || '', description: deletedSeason.description || '' }) }).catch(() => {});
        // Legacy format
        await updateDoc(doc(db, 'aggregated', 'seasons'), { data: arrayRemove({ id: deletedSeason.id, name: deletedSeason.name || '', league: deletedSeason.league || deletedSeason.leagueId || '', year: deletedSeason.year || '', description: deletedSeason.description || '' }) }).catch(() => {});
      }
    } catch (error) { handleFirestoreError(error, OperationType.DELETE, 'seasons'); }
  };

  const handleEditSeason = async (id: string, newName: string, newLeagueId: string, newDivision: string | undefined, newYear: string, newTournamentId: string) => {
    try {
      const oldSeason = seasons.find(s => s.id === id);
      if (!oldSeason) return;
      const newSeasonData: any = { name: newName, leagueId: newLeagueId, division: newDivision || null, year: newYear };
      if (newTournamentId) { newSeasonData.tournamentId = newTournamentId; }
      else { newSeasonData.tournamentId = deleteField(); }
      
      // Also delete description from the DB to clean up
      newSeasonData.description = deleteField();
      
      await updateDoc(doc(db, 'seasons', id), newSeasonData);

      const oldAgg = { id: oldSeason.id, name: oldSeason.name || '', leagueId: oldSeason.leagueId || oldSeason.league || '', division: oldSeason.division || null, year: oldSeason.year || '', description: oldSeason.description || '', tournamentId: oldSeason.tournamentId || '' };
      
      // We explicitly copy the non-deleted fields for the new aggregate object
      const newAgg = { id: oldSeason.id, name: newName, leagueId: newLeagueId, division: newDivision || null, year: newYear, tournamentId: newTournamentId || '' };

      await updateDoc(doc(db, 'aggregated', 'seasons'), { data: arrayRemove(oldAgg) }).catch(() => { });
      
      // Fallback: also remove the version of the object that might have used `league` key
      const oldAggLegacy = { id: oldSeason.id, name: oldSeason.name || '', league: oldSeason.league || oldSeason.leagueId || '', year: oldSeason.year || '', description: oldSeason.description || '', tournamentId: oldSeason.tournamentId || '' };
      await updateDoc(doc(db, 'aggregated', 'seasons'), { data: arrayRemove(oldAggLegacy) }).catch(() => { });
      
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

  const handleEditPlayer = async (id: string, newFirst: string, newLast: string, gender?: PlayerGender) => {
    try {
      const oldPlayer = allPlayers.find(p => p.id === id);
      if (!oldPlayer) return;
      // gender is only ever written to the source players/{id} doc — see handleAddGlobalPlayer note.
      await updateDoc(doc(db, 'players', id), { firstName: newFirst, lastName: newLast, ...(gender !== undefined ? { gender: gender || null } : {}) });

      const oldAgg = { id: oldPlayer.id, firstName: oldPlayer.firstName || '', lastName: oldPlayer.lastName || '', preferredName: oldPlayer.preferredName || '', nickname: oldPlayer.nickname || '' };
      const newAgg = { ...oldAgg, firstName: newFirst, lastName: newLast };

      await updateDoc(doc(db, 'aggregated', 'players'), { data: arrayRemove(oldAgg) }).catch(() => { });
      await updateDoc(doc(db, 'aggregated', 'players'), { data: arrayUnion(newAgg) }).catch(() => { });

      setAllPlayers(prev => prev.map(p => p.id === id ? { ...p, firstName: newFirst, lastName: newLast } : p).sort((a, b) => String(a.firstName + ' ' + a.lastName).localeCompare(String(b.firstName + ' ' + b.lastName))));
      toast.success("Player updated successfully");
    } catch (error) { handleFirestoreError(error, OperationType.WRITE, 'players'); }
  };

  // Moderators are stored as uids, never emails — appConfig/roles is world-readable, so an
  // email list there would hand every visitor the contributor roster.
  const handleAddRole = async (uid: string) => {
    if (!isAdmin) {
      toast.error("Only an admin can modify roles.");
      return;
    }
    const trimmed = uid.trim();
    if (!trimmed || moderatorUids.includes(trimmed)) return;

    try {
      const dbRef = doc(db, 'appConfig', 'roles');
      const snap = await getDoc(dbRef);
      if (!snap.exists()) {
        await setDoc(dbRef, { moderators: [] });
      }

      await updateDoc(dbRef, { moderators: arrayUnion(trimmed) });
      setModeratorUids(prev => [...prev, trimmed]);
      toast.success(`${userLabel(trimmed)} is now a moderator`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to assign role');
    }
  };

  const handleRemoveRole = async (uid: string) => {
    if (!isAdmin) {
      toast.error("Only an admin can modify roles.");
      return;
    }
    try {
      const dbRef = doc(db, 'appConfig', 'roles');
      await updateDoc(dbRef, { moderators: arrayRemove(uid) });
      setModeratorUids(prev => prev.filter(u => u !== uid));
      toast.success(`Moderator access removed for ${userLabel(uid)}`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to revoke role');
    }
  };

  const handleCopyOwnId = async () => {
    if (!voterId) return;
    try {
      await navigator.clipboard.writeText(voterId);
      toast.success(`Copied the ID behind ${userLabel(voterId)}`);
    } catch {
      toast.error('Could not copy — your browser blocked clipboard access.');
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
    // The anonymous session is established on load, but a very fast click can beat it. Without
    // a uid the write is rejected by the rules anyway, so don't move the UI optimistically.
    if (!voterId) {
      toast.error('Still connecting — try that again in a moment.');
      return;
    }

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
      return { ...e, upvoterIds: upvoters, downvoterIds: downvoters, upvotes: upvoters.length, downvotes: downvoters.length, votes: upvoters.length - downvoters.length, lastVoteAt: new Date().toISOString() };
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
      // Lets the activity board surface a game that only got votes, not new events — the
      // array field itself can't be queried by timestamp, so this is the cheapest signal
      // available without restructuring events as documents. See RecentEventsView.
      (evt as any).lastVoteAt = new Date().toISOString();

      currentEvents[eventIndex] = evt;

      await updateDoc(gameRef, { events: currentEvents });
    } catch (error) {
      console.error('Vote failed:', error);
      toast.error('Vote failed — check console');
    }
  };

  // ---------------------------------------------------------------------------
  // Suggested edits (Phase 1/2) — see docs/suggested-edits-design.md §8.
  // ---------------------------------------------------------------------------

  /** Create an 'edit' or 'delete' suggestion against an existing event. */
  const handleSuggestEdit = async (targetEvent: GameEvent, patchInput: SuggestablePatch) => {
    if (!currentVideo || !voterId) { toast.error('Still connecting — try that again in a moment.'); return; }
    const { patch, baseline } = diffEvent(targetEvent, patchInput);
    if (Object.keys(patch).length === 0) { toast.error('Nothing changed.'); return; }

    const suggestion: Omit<EventSuggestion, 'id'> = {
      gameId: currentVideo.gameId,
      videoId: targetEvent.videoId,
      kind: 'edit',
      targetEventId: targetEvent.id,
      patch,
      baseline,
      authorId: voterId,
      createdAt: new Date().toISOString(),
      status: 'open',
      upvoterIds: [],
      downvoterIds: [],
      score: 0,
    };

    const id = suggestionId('edit', targetEvent.id, voterId);
    try {
      await setDoc(doc(db, 'gameEvents', currentVideo.gameId, 'suggestions', id), suggestion);
      toast.success('Suggestion submitted — a moderator will review it.');
    } catch (error) {
      console.error('Suggest edit failed:', error);
      toast.error('Could not submit that suggestion.');
    }
  };

  /** Suggest that an event be removed entirely. Always carries a reason — a closed set, never free text. */
  const handleSuggestDelete = async (targetEvent: GameEvent, reason: DeleteReason) => {
    if (!currentVideo || !voterId) { toast.error('Still connecting — try that again in a moment.'); return; }

    const suggestion: Omit<EventSuggestion, 'id'> = {
      gameId: currentVideo.gameId,
      videoId: targetEvent.videoId,
      kind: 'delete',
      targetEventId: targetEvent.id,
      patch: {},
      baseline: {},
      reason,
      authorId: voterId,
      createdAt: new Date().toISOString(),
      status: 'open',
      upvoterIds: [],
      downvoterIds: [],
      score: 0,
    };

    const id = suggestionId('delete', targetEvent.id, voterId);
    try {
      await setDoc(doc(db, 'gameEvents', currentVideo.gameId, 'suggestions', id), suggestion);
      toast.success('Delete suggestion submitted — a moderator will review it.');
    } catch (error) {
      console.error('Suggest delete failed:', error);
      toast.error('Could not submit that suggestion.');
    }
  };

  /** Suggest a missing event entirely — a proposal with no target. */
  const handleSuggestAdd = async (patch: SuggestablePatch & { videoTime: number }) => {
    if (!currentVideo || !voterId) { toast.error('Still connecting — try that again in a moment.'); return; }
    if (!patch.type) { toast.error('Choose an event type.'); return; }

    const suggestion: Omit<EventSuggestion, 'id'> = {
      gameId: currentVideo.gameId,
      videoId: currentVideo.id,
      kind: 'add',
      targetEventId: null,
      patch,
      baseline: {},
      authorId: voterId,
      createdAt: new Date().toISOString(),
      status: 'open',
      upvoterIds: [],
      downvoterIds: [],
      score: 0,
    };

    const id = suggestionId('add', null, voterId);
    try {
      await setDoc(doc(db, 'gameEvents', currentVideo.gameId, 'suggestions', id), suggestion);
      toast.success('Missing event suggested — a moderator will review it.');
    } catch (error) {
      console.error('Suggest add failed:', error);
      toast.error('Could not submit that suggestion.');
    }
  };

  const handleVoteOnSuggestion = async (gameId: string, suggestion: EventSuggestion, isUp: boolean) => {
    if (!voterId) { toast.error('Still connecting — try that again in a moment.'); return; }
    const ref = doc(db, 'gameEvents', gameId, 'suggestions', suggestion.id);
    let upvoters = [...suggestion.upvoterIds];
    let downvoters = [...suggestion.downvoterIds];
    const oldVote = upvoters.includes(voterId) ? true : downvoters.includes(voterId) ? false : null;
    upvoters = upvoters.filter(id => id !== voterId);
    downvoters = downvoters.filter(id => id !== voterId);
    if (oldVote !== isUp) {
      if (isUp) upvoters.push(voterId); else downvoters.push(voterId);
    }
    try {
      await updateDoc(ref, { upvoterIds: upvoters, downvoterIds: downvoters, score: upvoters.length - downvoters.length });
    } catch (error) {
      console.error('Suggestion vote failed:', error);
      toast.error('Vote failed — check console');
    }
  };

  const handleWithdrawSuggestion = async (gameId: string, targetSuggestionId: string) => {
    try {
      await deleteDoc(doc(db, 'gameEvents', gameId, 'suggestions', targetSuggestionId));
      toast.success('Suggestion withdrawn.');
    } catch (error) {
      console.error('Withdraw failed:', error);
      toast.error('Could not withdraw that suggestion.');
    }
  };

  const handleRejectSuggestion = async (gameId: string, suggestion: EventSuggestion) => {
    if (!canModerate) { toast.error('Only a moderator can resolve a suggestion.'); return; }
    try {
      await updateDoc(doc(db, 'gameEvents', gameId, 'suggestions', suggestion.id), {
        status: 'rejected', resolvedBy: voterId, resolvedAt: new Date().toISOString(),
      });
      toast.success('Suggestion rejected.');
    } catch (error) {
      console.error('Reject failed:', error);
      toast.error('Could not reject that suggestion.');
    }
  };

  /**
   * Accept a suggestion: apply its patch to the live event (or remove/add one), reset the
   * event's votes since its content just changed, write an audit revision, and mark the
   * suggestion accepted — all as one transaction over the gameEvents doc, so a concurrent
   * edit can never be silently clobbered.
   */
  const handleAcceptSuggestion = async (gameId: string, suggestion: EventSuggestion) => {
    if (!canModerate) { toast.error('Only a moderator can resolve a suggestion.'); return; }
    if (!voterId) return;

    const gameRef = doc(db, 'gameEvents', gameId);
    const suggestionRef = doc(db, 'gameEvents', gameId, 'suggestions', suggestion.id);

    try {
      await runTransaction(db, async (tx) => {
        const gameSnap = await tx.get(gameRef);
        if (!gameSnap.exists()) throw new Error('Game events doc not found');
        const currentEvents = (gameSnap.data().events || []) as GameEvent[];

        if (suggestion.kind === 'add') {
          const newEvent: GameEvent = {
            id: crypto.randomUUID(),
            videoId: suggestion.videoId,
            gameId,
            userId: suggestion.authorId,
            createdAt: new Date().toISOString(),
            votes: 0, upvotes: 0, downvotes: 0, upvoterIds: [], downvoterIds: [],
            status: 'unverified',
            ...suggestion.patch,
          } as GameEvent;
          tx.update(gameRef, { events: [...currentEvents, newEvent] });

          const revision: Omit<EventRevision, 'id'> = {
            gameId, targetEventId: newEvent.id, before: null, after: suggestion.patch,
            suggestionId: suggestion.id, suggestedBy: suggestion.authorId, resolvedBy: voterId,
            createdAt: new Date().toISOString(),
          };
          tx.set(doc(collection(db, 'gameEvents', gameId, 'revisions')), revision);
          tx.update(suggestionRef, { status: 'accepted', resolvedBy: voterId, resolvedAt: new Date().toISOString() });
          return;
        }

        const eventIndex = currentEvents.findIndex(e => e.id === suggestion.targetEventId);
        if (eventIndex === -1) throw new Error('The event this suggestion targets no longer exists.');
        const liveEvent = currentEvents[eventIndex];

        if (!baselineStillMatches(liveEvent, suggestion.baseline)) {
          tx.update(suggestionRef, { status: 'superseded', resolvedBy: voterId, resolvedAt: new Date().toISOString() });
          throw new Error('SUPERSEDED');
        }
        const nextEvents = [...currentEvents];
        let revisionBefore: SuggestablePatch | null;
        let revisionAfter: SuggestablePatch | null;

        if (suggestion.kind === 'delete') {
          nextEvents.splice(eventIndex, 1);
          revisionBefore = suggestion.baseline;
          revisionAfter = null;
        } else {
          const updated = applyPatch(liveEvent, {
            ...suggestion.patch,
            // Content changed: prior votes no longer refer to what's on screen.
            upvoterIds: [], downvoterIds: [], upvotes: 0, downvotes: 0, votes: 0,
          } as any);
          (updated as any).votesResetAt = new Date().toISOString();
          nextEvents[eventIndex] = updated;
          revisionBefore = suggestion.baseline;
          revisionAfter = suggestion.patch;
        }

        tx.update(gameRef, { events: nextEvents });

        const revision: Omit<EventRevision, 'id'> = {
          gameId, targetEventId: suggestion.targetEventId!, before: revisionBefore, after: revisionAfter,
          suggestionId: suggestion.id, suggestedBy: suggestion.authorId, resolvedBy: voterId,
          createdAt: new Date().toISOString(),
        };
        tx.set(doc(collection(db, 'gameEvents', gameId, 'revisions')), revision);
        tx.update(suggestionRef, { status: 'accepted', resolvedBy: voterId, resolvedAt: new Date().toISOString() });
      });

      toast.success(suggestion.kind === 'delete' ? 'Event removed.' : 'Suggestion accepted.');
    } catch (error: any) {
      if (error?.message === 'SUPERSEDED') {
        toast.error('This event changed since the suggestion was made — marked superseded instead of applied.');
        return;
      }
      console.error('Accept suggestion failed:', error);
      toast.error(error?.message || 'Could not accept that suggestion.');
    }
  };

  const handleSearchVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    setIsAddingGame(true);

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
      setIsAddingGame(false);
      return;
    }

    const homeId = newVideoData.homeTeamId;
    const awayId = newVideoData.awayTeamId;
    const seasonId = newVideoData.seasonId;
    const gameDate = newVideoData.date || null;
    const leagueId = newVideoData.leagueId || null;
    const division = newVideoData.division || null;
    const tournamentId = newVideoData.tournamentId || null;

    if (!homeId || !awayId || (!seasonId && !tournamentId && !leagueId)) {
      toast.error("Please select Home Team, Away Team, and Event/Season/League constraints.");
      setIsAddingGame(false);
      return;
    }

    const homeTeam = teams.find(t => t.id === homeId);
    const awayTeam = teams.find(t => t.id === awayId);
    const homeName = homeTeam?.nickname || homeTeam?.name || 'Home';
    const awayName = awayTeam?.nickname || awayTeam?.name || 'Away';

    const gId = newVideoData.gameId?.trim() || `game_${crypto.randomUUID()}`;
    const vId = crypto.randomUUID();

    const normalizedSeasonId = tournamentId ? null : seasonId || null;
    const normalizedLeagueId = (tournamentId || seasonId) ? null : leagueId || null;
    const normalizedDivision = (tournamentId || seasonId) ? null : division || null;

    // SET VIDEO LOCALLY FIRST — so the embed renders immediately regardless of Firestore
    const localVideo: Video = {
      id: vId, youtubeId, videoId: vId, gameId: gId,
      title: `${homeName} vs ${awayName}`, createdAt: new Date()
    } as Video;
    setCurrentVideo(localVideo);
    setView('tracker');
    setIsAddingGame(false);
    setSearchQuery('');

    // Also inject local game + teams into state so scoreboard shows names immediately
    if (!games.find(g => g.id === gId)) {
      setGames(prev => [...prev, { id: gId, seasonId: normalizedSeasonId, homeTeamId: homeId, awayTeamId: awayId, tag: newVideoData.tag, date: gameDate, leagueId: normalizedLeagueId, division: normalizedDivision, tournamentId, createdAt: new Date() } as any]);
    }

    // Background Firestore sync (best-effort)
    try {
      // Check for exact existing game to safely inherit timestamp
      const gameRef = doc(db, 'games', gId);
      const gameSnap = await getDoc(gameRef);
      let gCreatedAt = new Date().toISOString();

      if (!gameSnap.exists()) {
        await setDoc(gameRef, {
          id: gId, homeTeamId: homeId, awayTeamId: awayId, isVerified: false, homeCompletion: 'none', awayCompletion: 'none', createdAt: serverTimestamp(), tag: newVideoData.tag || null, date: gameDate, 
          tournamentId: tournamentId || null, 
          seasonId: normalizedSeasonId, 
          leagueId: normalizedLeagueId, 
          division: normalizedDivision,
          authorId: user?.uid || '', authorTeamId: currentUserTeamId || ''
        });
      } else {
        const d = gameSnap.data();
        if (d && d.createdAt) gCreatedAt = serializeTimestamp(d.createdAt) || gCreatedAt;
      }

      // Auto-heal the Games cache safely without string duplication
      await updateDoc(doc(db, 'aggregated', 'games'), {
        data: arrayUnion({ id: gId, homeTeamId: homeId, awayTeamId: awayId, isVerified: false, homeCompletion: 'none', awayCompletion: 'none', createdAt: gCreatedAt, tag: newVideoData.tag || null, date: gameDate, 
          tournamentId: tournamentId || null, 
          seasonId: normalizedSeasonId, 
          leagueId: normalizedLeagueId, 
          division: normalizedDivision, 
          authorId: user?.uid || '', authorTeamId: currentUserTeamId || '' 
        })
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

      const s = statsSeasons.find(sea => sea.id === g.seasonId);
      if (watchLeagueId !== 'all') {
        if (!s) return;
        const lid = s.leagueId || s.league;
        if (lid !== watchLeagueId) return;
        if (watchDivision !== 'all' && s.division !== watchDivision) return;
      }
      if (s && s.name) ySet.add(s.name);
      else if (g.seasonId) ySet.add(g.seasonId);
    });
    return Array.from(ySet).sort((a, b) => b.localeCompare(a));
  }, [statsGames, statsSeasons, statsVideos, watchLeagueId, watchDivision]);

  const watchLeagues = useMemo(() => {
    const lSet = new Set<string>();
    statsSeasons.forEach(s => {
      const lid = s.leagueId || s.league;
      if (lid) lSet.add(lid);
    });
    return Array.from(lSet).sort();
  }, [statsSeasons]);

  const watchDivisions = useMemo(() => {
    if (watchLeagueId === 'all') return [];
    const dSet = new Set<string>();
    statsSeasons.forEach(s => {
      const lid = s.leagueId || s.league;
      if (lid === watchLeagueId && s.division) {
        dSet.add(s.division);
      }
    });
    return Array.from(dSet).sort();
  }, [statsSeasons, watchLeagueId]);
  const trackingTeams = useMemo(() => {
    const tSet = new Set<string>();
    statsGames.forEach(g => {
      const s = statsSeasons.find(sea => sea.id === g.seasonId);
      if (watchLeagueId !== 'all') {
        if (!s) return;
        const lid = s.leagueId || s.league;
        if (lid !== watchLeagueId) return;
        if (watchDivision !== 'all' && s.division !== watchDivision) return;
      }
      if (trackerYearId !== 'all') {
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
  }, [statsGames, statsSeasons, statsTeams, trackerYearId, watchLeagueId, watchDivision]);

  const trackingOpponents = useMemo(() => {
    const tSet = new Set<string>();
    statsGames.forEach(g => {
      const s = statsSeasons.find(sea => sea.id === g.seasonId);
      if (watchLeagueId !== 'all') {
        if (!s) return;
        const lid = s.leagueId || s.league;
        if (lid !== watchLeagueId) return;
        if (watchDivision !== 'all' && s.division !== watchDivision) return;
      }
      if (trackerYearId !== 'all') {
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
  }, [statsGames, statsSeasons, statsTeams, trackerYearId, trackerTeamId, watchLeagueId, watchDivision]);

  const trackingFilteredGames = useMemo(() => {
    return statsGames.filter(g => {
      // Anything short of pristine (both sides 'complete', subs included) belongs here —
      // that's the only bar the "Completed Games" list holds to.
      if (isPristineComplete(g)) return false;
      const s = statsSeasons.find(sea => sea.id === g.seasonId);
      if (trackerYearId !== 'all') {
        const yearStr = (s && s.name) ? s.name : g.seasonId;
        if (yearStr !== trackerYearId) return false;
      }
      if (watchLeagueId !== 'all') {
        if (!s) return false;
        const lid = s.leagueId || s.league;
        if (lid !== watchLeagueId) return false;
        if (watchDivision !== 'all' && s.division !== watchDivision) return false;
      }
      if (trackerTeamId !== 'all') {
        if (g.homeTeamId !== trackerTeamId && g.awayTeamId !== trackerTeamId) return false;
      }
      if (trackerOpponentId !== 'all') {
        if (g.homeTeamId !== trackerOpponentId && g.awayTeamId !== trackerOpponentId) return false;
      }
      return true;
    }).map(g => {
      const hTeam = statsTeams.find(t => t.id === g.homeTeamId);
      const aTeam = statsTeams.find(t => t.id === g.awayTeamId);
      const hName = hTeam?.nickname || hTeam?.name || g.homeTeamId;
      const aName = aTeam?.nickname || aTeam?.name || g.awayTeamId;
      
      const s = statsSeasons.find(sea => sea.id === g.seasonId);
      const tId = g.tournamentId || s?.tournamentId;
      const tournament = tournaments.find(t => t.id === tId);
      const tournamentName = tournament ? tournament.name : null;
      let subTitle = '';
      if (tournamentName && g.tag) subTitle = `${tournamentName} - ${g.tag}`;
      else if (tournamentName) subTitle = tournamentName;
      else if (g.tag) subTitle = g.tag;

      return { ...g, displayName: `${hName} vs ${aName}`, subTitle };
    }).sort((a, b) => {
      if (a.date && b.date) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      if (a.date) return -1;
      if (b.date) return 1;
      const tA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
      const tB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
      return tB - tA;
    });
  }, [statsGames, statsSeasons, statsTeams, tournaments, trackerYearId, trackerTeamId, trackerOpponentId, watchLeagueId, watchDivision]);

  const verifiedTeams = useMemo(() => {
    const tSet = new Set<string>();
    statsGames.forEach(g => {
      // "Completed Games" is pristine games only (both sides 'complete', subs included);
      // anything short of that stays in Watch and Contribute (trackingFilteredGames).
      if (!isPristineComplete(g)) return;
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
      if (!isPristineComplete(g)) return false;
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
      const hTeam = statsTeams.find(t => t.id === g.homeTeamId);
      const aTeam = statsTeams.find(t => t.id === g.awayTeamId);
      const hName = hTeam?.nickname || hTeam?.name || g.homeTeamId;
      const aName = aTeam?.nickname || aTeam?.name || g.awayTeamId;
      
      const s = statsSeasons.find(sea => sea.id === g.seasonId);
      const tId = g.tournamentId || s?.tournamentId;
      const tournament = tournaments.find(t => t.id === tId);
      const tournamentName = tournament ? tournament.name : null;
      let subTitle = '';
      if (tournamentName && g.tag) subTitle = `${tournamentName} - ${g.tag}`;
      else if (tournamentName) subTitle = tournamentName;
      else if (g.tag) subTitle = g.tag;

      return { ...g, displayName: `${hName} vs ${aName}`, subTitle };
    }).sort((a, b) => {
      if (a.date && b.date) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      if (a.date) return -1;
      if (b.date) return 1;
      const tA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
      const tB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
      return tB - tA;
    });
  }, [statsGames, statsSeasons, statsTeams, tournaments, verifiedYearId, verifiedTeamId]);

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

  // Auto-seek to first event or pending seek time
  useEffect(() => {
    if (!player) return;
    if (pendingSeekTimeRef.current !== null) {
      try {
        player.seekTo(pendingSeekTimeRef.current, true);
        pendingSeekTimeRef.current = null;
        hasAutoSeekedRef.current = true;
      } catch (e) {}
      return;
    }
    if (activeTrackingEvents.length === 0 || hasAutoSeekedRef.current) return;
    
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
  if (!isSignedIn && !hasSeenLanding) return <LandingHero onProceed={() => { handleBypassLanding(); setView('stats'); }} onSignIn={() => handleBypassLanding()} />;

  return (
    <div className={cn("bg-white text-gray-900 font-sans selection:bg-red-200/50", (view === 'tracker' && currentVideo) ? "h-screen overflow-hidden flex flex-col" : "min-h-screen")}>
      <Toaster position="top-right" richColors />
      {suggestFormState && (
        <SuggestEditForm
          mode={suggestFormState.mode}
          targetEvent={suggestFormState.targetEvent}
          homeTeam={teams.find(t => t.id === currentGame?.homeTeamId) || null}
          awayTeam={teams.find(t => t.id === currentGame?.awayTeamId) || null}
          homePlayers={homeRosterPlayers.filter(rp => rp.player).map(rp => ({ id: rp.player.id, firstName: rp.player.firstName, lastName: rp.player.lastName }))}
          awayPlayers={awayRosterPlayers.filter(rp => rp.player).map(rp => ({ id: rp.player.id, firstName: rp.player.firstName, lastName: rp.player.lastName }))}
          initialVideoTime={player?.getCurrentTime()}
          onCancel={() => setSuggestFormState(null)}
          onSubmitEdit={(patch) => {
            if (suggestFormState.targetEvent) handleSuggestEdit(suggestFormState.targetEvent, patch);
            setSuggestFormState(null);
          }}
          onSubmitDelete={(reason) => {
            if (suggestFormState.targetEvent) handleSuggestDelete(suggestFormState.targetEvent, reason);
            setSuggestFormState(null);
          }}
          onSubmitAdd={(patch) => {
            handleSuggestAdd(patch);
            setSuggestFormState(null);
          }}
        />
      )}
      {/* Header */}
      <header className={cn("border-b border-gray-200 bg-white/80 backdrop-blur-md z-50", (view === 'tracker' && currentVideo) ? "shrink-0" : "sticky top-0")}>
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/quadball-logo.svg" alt="Quadball Reference Logo" className="w-10 h-10 object-contain drop-shadow-sm" />
            <h1 className="hidden sm:block text-xl font-bold tracking-tight text-red-900">Quadball Reference</h1>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-4">
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
                "px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2",
                view === 'tracker' ? "bg-red-600 text-white" : "bg-gray-50 text-gray-500 hover:text-gray-900 border border-gray-200"
              )}
            >
              <Play className="w-4 h-4" />
              Watch
            </button>
            <button
              onClick={() => setView('info')}
              className={cn(
                "px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2",
                view === 'info' ? "bg-red-600 text-white" : "bg-gray-50 text-gray-500 hover:text-gray-900 border border-gray-200"
              )}
            >
              <HelpCircle className="w-4 h-4" />
              Info
            </button>

            {view === 'tracker' && isAdminUser && (
              <select
                value={simulateRole}
                onChange={e => setSimulateRole(e.target.value as any)}
                className="bg-gray-50 border border-gray-200 text-gray-600 text-xs rounded-lg px-3 py-2 outline-none focus:border-red-500 font-bold"
              >
                <option value="user">View As: User</option>
                <option value="author">View As: Author</option>
                <option value="moderator">View As: Moderator</option>
                <option value="admin">View As: Admin</option>
              </select>
            )}

            {canModerate && (
              <button
                onClick={() => setView(view === 'create' ? 'stats' : 'create')}
                className={cn(
                  "px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2",
                  view === 'create' ? "bg-red-600 text-white" : "bg-gray-50 text-gray-500 hover:text-gray-900 border border-gray-200"
                )}
              >
                <Plus className="w-4 h-4" />
                Create
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => setView(view === 'manage' ? 'stats' : 'manage')}
                className={cn(
                  "px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2",
                  view === 'manage' ? "bg-red-600 text-white" : "bg-gray-50 text-gray-500 hover:text-gray-900 border border-gray-200"
                )}
              >
                <User className="w-4 h-4" />
                Manage
              </button>
            )}
            <div className="flex items-center gap-3">
              {isSignedIn && voterId && (
                <button
                  onClick={handleCopyOwnId}
                  title="Your ID. Click to copy — share it with a moderator if you need help with something you recorded."
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-full border border-gray-200 hover:border-gray-300 transition-colors"
                >
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium">{userLabel(voterId)}</span>
                </button>
              )}
              {isSignedIn ? (
                <button onClick={logOut} title="Sign out" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <LogOut className="w-5 h-5 text-gray-500" />
                </button>
              ) : (
                <button onClick={signIn} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-all active:scale-95">
                  <LogIn className="w-4 h-4" />
                  Sign In
                </button>
              )}
            </div>
          </div>

          {/* Mobile nav: hamburger dropdown */}
          <div className="md:hidden relative" ref={mobileMenuRef}>
            <button
              onClick={() => setMobileMenuOpen(o => !o)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Open menu"
              aria-expanded={mobileMenuOpen}
            >
              <Menu className="w-6 h-6 text-gray-700" />
            </button>

            {mobileMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-60 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                <button
                  onClick={() => setView(view === 'stats' ? 'tracker' : 'stats')}
                  className={cn(
                    "w-full px-4 py-2.5 flex items-center gap-2 text-left font-medium transition-colors",
                    view === 'stats' ? "text-red-600 bg-red-50" : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <Database className="w-4 h-4" />
                  Stats
                </button>
                <button
                  onClick={() => setView('tracker')}
                  className={cn(
                    "w-full px-4 py-2.5 flex items-center gap-2 text-left font-medium transition-colors",
                    view === 'tracker' ? "text-red-600 bg-red-50" : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <Play className="w-4 h-4" />
                  Watch
                </button>
                <button
                  onClick={() => setView('info')}
                  className={cn(
                    "w-full px-4 py-2.5 flex items-center gap-2 text-left font-medium transition-colors",
                    view === 'info' ? "text-red-600 bg-red-50" : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <HelpCircle className="w-4 h-4" />
                  Info
                </button>

                {canModerate && (
                  <button
                    onClick={() => setView(view === 'create' ? 'stats' : 'create')}
                    className={cn(
                      "w-full px-4 py-2.5 flex items-center gap-2 text-left font-medium transition-colors",
                      view === 'create' ? "text-red-600 bg-red-50" : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    <Plus className="w-4 h-4" />
                    Create
                  </button>
                )}

                {isAdmin && (
                  <button
                    onClick={() => setView(view === 'manage' ? 'stats' : 'manage')}
                    className={cn(
                      "w-full px-4 py-2.5 flex items-center gap-2 text-left font-medium transition-colors",
                      view === 'manage' ? "text-red-600 bg-red-50" : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    <User className="w-4 h-4" />
                    Manage
                  </button>
                )}

                {view === 'tracker' && isAdminUser && (
                  <div className="px-4 py-2">
                    <select
                      value={simulateRole}
                      onChange={e => setSimulateRole(e.target.value as any)}
                      className="w-full bg-gray-50 border border-gray-200 text-gray-600 text-xs rounded-lg px-3 py-2 outline-none focus:border-red-500 font-bold"
                    >
                      <option value="user">View As: User</option>
                      <option value="author">View As: Author</option>
                      <option value="moderator">View As: Moderator</option>
                      <option value="admin">View As: Admin</option>
                    </select>
                  </div>
                )}

                <div className="border-t border-gray-100 mt-2 pt-2 px-4">
                  <div className="flex items-center justify-between gap-2">
                    {isSignedIn && voterId && (
                      <button
                        onClick={handleCopyOwnId}
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-full border border-gray-200 min-w-0"
                      >
                        <User className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-sm font-medium truncate">{userLabel(voterId)}</span>
                      </button>
                    )}
                    {isSignedIn ? (
                      <button onClick={logOut} className="p-2 hover:bg-gray-100 rounded-full transition-colors shrink-0">
                        <LogOut className="w-5 h-5 text-gray-500" />
                      </button>
                    ) : (
                      <button onClick={signIn} className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all active:scale-95 shrink-0">
                        <LogIn className="w-4 h-4" />
                        Sign In
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className={cn("mx-auto transition-all w-full", (view === 'tracker' && currentVideo) ? "max-w-[100vw] px-2 py-2 flex-1 min-h-0 flex flex-col" : view === 'tracker' ? "max-w-[1600px] px-4 py-8" : "max-w-7xl px-4 py-8")}>
        {view === 'info' ? (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white rounded-xl shadow-sm border p-8 space-y-10">
            {user && (
              <div className="p-5 bg-red-50/60 border border-red-100 rounded-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-extrabold text-gray-900">Game tracker tutorial</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      A guided walkthrough of watching and recording a game, pointing at the real buttons as you go.
                    </p>
                  </div>
                  <button
                    onClick={handleReplayTutorial}
                    className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-all active:scale-95"
                  >
                    <PlayCircle className="w-4 h-4" />
                    Replay
                  </button>
                </div>

                {canUseCreateTools && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-red-100 pt-4">
                    <div>
                      <h3 className="text-lg font-extrabold text-gray-900">Create tools tutorial</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        The moderator walkthrough for building teams, players, rosters and games.
                      </p>
                    </div>
                    <button
                      onClick={handleReplayCreateTutorial}
                      className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-all active:scale-95"
                    >
                      <PlayCircle className="w-4 h-4" />
                      Replay
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="mb-12">
              <h2 className="text-3xl font-extrabold border-b pb-4 text-gray-900 mb-6">How to Watch a Game</h2>
              <div className="space-y-4 text-gray-700 leading-relaxed text-sm">
                <p>While watching a video, <strong>Events</strong> show the events that happen during the game. For spectators, that's where they can upvote and downvote events. For signed-in users, they will have a <strong>Record</strong> tab where they can (optionally) record the various game events that happen. Adding events to the proper timestamp of the video will ensure stats are calculated accurately.</p>
                <p>Anyone can add any amount of events, and they will be accessible globally. It isn't important to get everything done, just that any event added is accurate.</p>
                <p>The <strong>GameCast</strong> tab shows the various events in a more condensed format. The <strong>Players</strong> tab shows the players on each team. Each player's basic performance is shown under their name.</p>
                <p>For authors, the Players tab also allows for a different way to add stats. Clicking on a name pops up a quick access to recording an event. Dragging and dropping allows for substitutions as well.</p>
              </div>
            </div>

            <div className="mb-12">
              <h2 className="text-3xl font-extrabold border-b pb-4 text-gray-900 mb-6">Suggesting an Edit</h2>
              <div className="space-y-4 text-gray-700 leading-relaxed text-sm">
                <p>Every event has two extra icons next to the up/down vote buttons: a speech-bubble icon to <strong>suggest a fix</strong>, and a circle-slash icon to <strong>suggest a removal</strong>. Both are open to everyone, signed in or not.</p>
                <p>A downvote is a quick "something's off here." A suggestion is the fix itself: what the event should actually say. A removal suggestion asks you to pick the closest reason from a short list.</p>
                <p>There's also a "+" button near the top of the Events tab to <strong>suggest a missing event</strong>: a goal, assist, or anything else that wasn't tracked. Team and player choices are limited to whoever's actually in the game.</p>
              </div>
            </div>

            <div className="mb-12">
              <h2 className="text-3xl font-extrabold border-b pb-4 text-gray-900 mb-6">Become an Author</h2>
              <div className="space-y-4 text-gray-700 leading-relaxed text-sm">
                <p>Just... sign in. That's it. Any event you author counts immediately — nothing waits on approval. If an event is wrong, votes and suggested edits are how it gets corrected, not hidden.</p>
                <p>Where those events show up on the Stats page depends on tracking being finished. Completeness is tracked per team, so once one team's events are all in, that team's stats publish on the <strong>Public</strong> tab even if nobody has covered the other side yet. Games with both teams finished also appear under <strong>Fully Complete</strong>.</p>
              </div>
            </div>

            <div className="mb-12">
              <h2 className="text-3xl font-extrabold border-b pb-4 text-gray-900 mb-6">Become a Moderator</h2>
              <div className="space-y-4 text-gray-700 leading-relaxed text-sm">
                <p>Moderators get the <strong>Create</strong> tab, which is where teams, players, rosters and games are made. Authors can only pick from what already exists, so when something is missing, a moderator has to add it.</p>
                <p>Moderator access is granted by hand. To be added, email <a href="mailto:quadballreference@gmail.com" className="text-red-600 font-bold hover:underline">quadballreference@gmail.com</a> or message <a href="https://www.reddit.com/user/quadballreference" target="_blank" rel="noopener noreferrer" className="text-red-600 font-bold hover:underline">u/quadballreference</a> on Reddit.</p>
                <p>Either way, include the email address you sign in with — the role is attached to that address, so we can't grant it without one.</p>
              </div>
            </div>

            <div className="mb-12">
              <h2 className="text-3xl font-extrabold border-b pb-4 text-gray-900 mb-6">Add A Game</h2>
              <div className="space-y-4 text-gray-700 leading-relaxed text-sm">
                <p>After signing in, authors can add videos from the Watch tab. Adding a new video is the first step in tracking stats for a game. Once added, any author can start recording events — and you only have to do one team's worth: a moderator marks that team complete and its stats go live on their own.</p>
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
                  <h4 className="font-bold text-gray-900 uppercase tracking-widest text-sm mb-2 opacity-70 border-b pb-1">Box Score — Counting Stats</h4>
                  <ul className="space-y-3 text-sm text-gray-700">
                    <li><strong className="text-gray-900 w-16 inline-block">GP</strong> Games Played. Number of games with recorded minutes.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">MIN</strong> Minutes Played. Total on-field time across all games.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">G</strong> Goals. Total goals scored (10 points each).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">A</strong> Assists. Passes leading directly to a scored goal.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">mTOT</strong> Miss Total. mS + mAtt + mKO combined.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">S%</strong> Scoring Percentage. Goals ÷ (Goals + mS + mAtt + mKO).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">mS</strong> Missed Shots. Thrown shots that did not result in a goal.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">mAtt</strong> Missed Attempts. Drives or physical attacks on the hoops that did not result in a goal.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">mKO</strong> Missed by Knockout. Scoring attempt ending because the player was knocked out before releasing the quadball on a shot or drive.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">TO</strong> Turnovers. Loss of offensive possession without a shot attempt.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">CTRL%</strong> Bludger Control %. Percentage of game time the player's team held dodgeball control while the player was on the field.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold text-gray-900 uppercase tracking-widest text-sm mb-2 opacity-70 border-b pb-1">Rate Score — Per-Game &amp; Pace-Adjusted Rates</h4>
                  <ul className="space-y-3 text-sm text-gray-700">
                    <li><strong className="text-gray-900 w-16 inline-block">G/G</strong> Goals per Game.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">A/G</strong> Assists per Game.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">PTS/G</strong> Points (Goals + Assists) per Game.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">G/20</strong> Goals per 20 minutes played. Normalizes for different playing times.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">A/20</strong> Assists per 20 minutes played.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">PTS/20</strong> Points per 20 minutes played.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">G/25</strong> Goals per 25 possessions. Adjusts for pace differences between games.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">A/25</strong> Assists per 25 possessions.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">PTS/25</strong> Points per 25 possessions.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold text-gray-900 uppercase tracking-widest text-sm mb-2 opacity-70 border-b pb-1">Plus/Minus — On-Field Impact</h4>
                  <ul className="space-y-3 text-sm text-gray-700">
                    <li><strong className="text-gray-900 w-16 inline-block">+</strong> Plus. Total goals scored by the player's team while they are on the field.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">−</strong> Minus. Total goals conceded by the player's team while they are on the field.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">+:−</strong> Plus-to-Minus Ratio. Team goals scored ÷ Team goals conceded while on the field.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">Off+:−</strong> Off-Field Ratio. The team's plus-to-minus ratio when this player is NOT on the field.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">REL +:−</strong> Relative Value. The player's on-field ratio divided by the off-field ratio. Values above 1.0 indicate the team performs better with the player on the field.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold text-gray-900 uppercase tracking-widest text-sm mb-2 opacity-70 border-b pb-1">Advanced — Efficiency &amp; Impact Metrics</h4>
                  <p className="text-xs text-gray-500 mb-1">Possessions are inferred dynamically — a team possession ends when a Goal, Shot, or Turnover occurs while a player is on the field.</p>
                  <ul className="space-y-3 text-sm text-gray-700">
                    <li><strong className="text-gray-900 w-16 inline-block">ORTG</strong> Offensive Rating. Points scored per 25 offensive possessions while on the field.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">DRTG</strong> Defensive Rating. Points conceded per 25 defensive possessions while on the field.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">NET</strong> Net Rating. ORTG minus DRTG. Positive values indicate outscoring opponents.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">RAPM</strong> Regularized Adjusted Plus-Minus. A ridge-regression model that isolates individual impact by controlling for teammates and opponents on the field simultaneously.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">CVA</strong> Chaser Value Added. Overall estimated goals added/saved per 20 minutes vs. league average chaser.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">EPR</strong> Empty Possession Rate. Percentage of offensive possessions that are "empty" — ending in a turnover with no shot, attempt, or KO taken during that possession.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">fEPR</strong> Forced Empty Possession Rate. Percentage of defensive possessions where the opponent's possession was "empty" — they turned the ball over without getting off a shot, attempt, or KO.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">USG%</strong> Usage Rate. Estimates the percentage of team possessions a player is directly involved in (Goals + Assists + Shots + Turnovers ÷ Team Possessions while on field).</li>
                    <li><strong className="text-gray-900 w-16 inline-block">GmSc</strong> Game Score. A composite single-number rating of overall productivity based on counting stats.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold text-gray-900 uppercase tracking-widest text-sm mb-2 opacity-70 border-b pb-1">Team Aggregates</h4>
                  <ul className="space-y-3 text-sm text-gray-700">
                    <li><strong className="text-gray-900 w-16 inline-block">G</strong> Total Goals scored by the team.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">A</strong> Total Assists recorded by the team.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">mS</strong> Missed Shots.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">mAtt</strong> Missed Attempts.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">mKO</strong> Missed by Knockout. Scoring attempt ending because the player was knocked out before releasing the quadball on a shot or drive.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">mTOT</strong> Miss Total. mS + mAtt + mKO combined.</li>
                    <li><strong className="text-gray-900 w-16 inline-block">TO</strong> Turnovers.</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-2xl font-bold mb-4 text-purple-800 flex items-center gap-2"><Target className="w-6 h-6" /> Beaters (Pairs & Solo)</h3>
              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-gray-900 uppercase tracking-widest text-sm mb-2 opacity-70 border-b pb-1">Team Aggregates</h4>
                  <ul className="space-y-3 text-sm text-gray-700">
                    <li><strong className="text-gray-900 w-20 inline-block">GP</strong> Games Played.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">CTRL</strong> Control Minutes. Minutes the team held dodgeball control while on field.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">TOT</strong> Total Minutes. Total game-clock minutes played for this pair or individual.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">CTRL%</strong> Control %. Percentage of possession time the team has active dodgeball control.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">CTRL/G</strong> Control Minutes per Game.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">Opp CTRL%</strong> Opponent Control %. Percentage of possession time the opponent has active dodgeball control.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold text-gray-900 uppercase tracking-widest text-sm mb-2 opacity-70 border-b pb-1">Pairs &amp; Solo</h4>
                  <ul className="space-y-3 text-sm text-gray-700">
                    <li><strong className="text-gray-900 w-20 inline-block">GP</strong> Games Played.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">+</strong> Plus. Goals scored by the team while this beater/pair was active.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">−</strong> Minus. Goals conceded by the team while this beater/pair was active.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">+/−</strong> Plus/Minus. Point differential while this beater/pair was active.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">CTRL</strong> Control Minutes. Minutes the team held dodgeball control while on field.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">TOT</strong> Total game-clock minutes played for this pair or individual.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">CTRL%</strong> Percentage of possession time the team maintained dodgeball control.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">+:−</strong> Ratio of Plus to Minus.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">Off+:−</strong> Ratio of Plus to Minus while this beater/pair is off the field.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">REL +:−</strong> Relative Value (The plus-minus ratio compared to the off-field ratio).</li>
                    <li><strong className="text-gray-900 w-20 inline-block">RAPM</strong> Regularized Adjusted Plus-Minus. A ridge-regression model that isolates individual impact controlling for teammates and opponents on field.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">EPR</strong> Empty Possession Rate while on field.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">fEPR</strong> Forced Empty Possession Rate while on field.</li>
                    <li><strong className="text-gray-900 w-20 inline-block">BVA</strong> Beater Value Added. Overall estimated goals added/saved per 20 minutes of possession vs. league average beater.</li>
                  </ul>
                </div>
              </div>
            </section>
            </div>
          </div>
        ) : view === 'manage' ? (
          <ManagementView
            leagues={leagues}
            tournaments={tournaments}
            teams={teams}
            seasons={seasons}
            players={allPlayers}
            videos={videos}
            games={games}
            onAddLeague={handleAddLeague}
            onEditLeague={handleEditLeague}
            onDeleteLeague={handleDeleteLeague}
            onAddTournament={handleAddTournament}
            onEditTournament={handleEditTournament}
            onDeleteTournament={handleDeleteTournament}
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
            moderatorUids={moderatorUids}
            onSetLocalSimulation={(data) => {
              setDemoData(data);
              setView('stats');
            }}
            activeTab={managementActiveTab}
            setActiveTab={setManagementActiveTab}
          />
        ) : view === 'create' && canUseCreateTools ? (
          <CreateView
            events={statsEventsRaw}
            moderatorUids={moderatorUids}
            onMakeModerator={isAdmin ? handleAddRole : undefined}
            teams={teams}
            seasons={seasons}
            players={allPlayers}
            leagues={leagues}
            tournaments={tournaments}
            games={games}
            onOpenGame={handleOpenGameForReview}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            newVideoData={newVideoData}
            setNewVideoData={setNewVideoData}
            onAddGame={handleSearchVideo}
            isAddingGame={isAddingGame}
            setIsAddingGame={setIsAddingGame}
            onAddTeam={handleAddTeam}
            onAddPlayer={handleAddGlobalPlayer}
            onAddPlayerToRoster={handleAddPlayerToRoster}
            onRemovePlayerFromRoster={handleRemovePlayerFromRoster}
            onCreateRoster={handleCreateRoster}
            onDeleteRoster={handleDeleteRoster}
            onEditPlayer={handleEditPlayer}
            onDeletePlayer={handleDeletePlayer}
            activeTab={createActiveTab}
            setActiveTab={setCreateActiveTab}
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
              <span>{dashboardEvents.length.toLocaleString()} events</span>
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
              <StatsTabSelector>
                <StatsTabButton isFirst active={statsSubView === 'quadball'} onClick={() => setStatsSubView('quadball')} label="Quadball" activeClass="bg-emerald-600 text-white" />
                <StatsTabButton active={statsSubView === 'beaters'} onClick={() => setStatsSubView('beaters')} label="Dodgeball" activeClass="bg-neutral-900 text-white" />
                <StatsTabButton active={statsSubView === 'seekers'} onClick={() => setStatsSubView('seekers')} label="Flag" activeClass="bg-yellow-400 text-black" />
              </StatsTabSelector>
              {/* Public = every game with at least one side complete, counting only the
                  complete side. Fully Complete = both sides done. */}
              <div className="flex border rounded-lg bg-gray-50 overflow-hidden text-xs font-bold shadow-sm">
                {([
                  { value: 'public' as const, label: 'Public', title: 'Every game with at least one team complete. Only the complete team\u2019s stats are counted.' },
                  { value: 'full' as const, label: 'Fully Complete', title: 'Only games where both teams are marked complete.' },
                ]).map(option => (
                  <button
                    key={option.value}
                    onClick={() => setStatsFilter(option.value)}
                    title={option.title}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 transition-all outline-none',
                      statsFilter === option.value
                        ? (option.value === 'full' ? 'bg-amber-500/10 text-amber-600 shadow-sm border border-amber-500/30' : 'bg-white shadow-sm border border-gray-200 text-gray-800')
                        : 'text-gray-400 hover:text-gray-600 border border-transparent hover:bg-white/50'
                    )}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {option.label}
                  </button>
                ))}
              </div>
              {(() => {
                const activeFilterCount = statsLeagueDivs.length + statsSelectedYears.length + statsTournamentIds.length + statsTeamIds.length
                  + (statsPositionFilter !== 'all' ? 1 : 0) + (bludgerControlMode !== 'all' ? 1 : 0) + (statsFlagFilter !== 'all' ? 1 : 0)
                  + (statsMinGames > 1 ? 1 : 0) + (statsSearch ? 1 : 0);
                return (
                  <button
                    onClick={toggleStatsFiltersExpanded}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                      statsFiltersExpanded ? 'bg-white border-gray-200 text-gray-700 shadow-sm' : 'bg-gray-50 border-transparent text-gray-500 hover:bg-white hover:border-gray-200'
                    )}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                        {activeFilterCount}
                      </span>
                    )}
                    {statsFiltersExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                );
              })()}
            </div>

            {/* Shared Filters component — collapsed by default for a plain viewer, since it's
                tall enough to bury the table below the fold before they've even used it. */}
            {statsFiltersExpanded && (
              <StatsFilters
                viewType={statsSubView as 'quadball' | 'beaters' | 'seekers'}
                leagueDivisions={statsLeagueDivs} onLeagueDivisionChange={setStatsLeagueDivs}
                leagues={leagues}
                years={statsSelectedYears} onYearChange={setStatsSelectedYears}
                availableYears={statsYears}
                tournamentIds={statsTournamentIds} onTournamentChange={setStatsTournamentIds}
                tournaments={tournaments}
                teamIds={statsTeamIds} onTeamChange={setStatsTeamIds}
                teams={filteredDropdownTeams}
                search={statsSearch} onSearchChange={setStatsSearch}
                minGames={statsMinGames} onMinGamesChange={setStatsMinGames}
                bludgerControlMode={bludgerControlMode} onBludgerControlModeChange={setBludgerControlMode}
                flagFilter={statsFlagFilter} onFlagFilterChange={setStatsFlagFilter}
                positionFilter={statsSubView === 'quadball' ? statsPositionFilter : undefined}
                onPositionFilterChange={statsSubView === 'quadball' ? setStatsPositionFilter : undefined}
              />
            )}

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
                teamIds={statsTeamIds}
                search={statsSearch}
                minGames={statsMinGames}
                bludgerControlMode={bludgerControlMode}
                flagFilter={statsFlagFilter}
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
                teamIds={statsTeamIds}
                search={statsSearch}
                minGames={statsMinGames}
                bludgerControlMode={bludgerControlMode}
                flagFilter={statsFlagFilter}
                onPlayerSelect={handlePlayerProfileClick}
                onTeamSelect={handleTeamProfileClick}
                tab={beaterStatsTab}
                onTabChange={setBeaterStatsTab}
              />
            ) : statsSubView === 'seekers' ? (
              <SeekerStatsView
                players={statsPlayers}
                events={dashboardEvents}
                teams={statsTeams}
                games={dashboardGames}
                seasons={statsSeasons}
                statsFilter={statsFilter}
                teamIds={statsTeamIds}
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
            players={statsPlayers} events={dashboardEvents} games={dashboardGames} seasons={statsSeasons} teams={statsTeams} leagues={leagues}
            activePlayerId={activePlayerId}
            initialSeasonId={statsSelectedYears.length === 1 ? statsSelectedYears[0] : ''}
            onBack={popProfile}
            onTeamSelect={handleTeamProfileClick}
            onGameSelect={handleGameProfileClick}
            jerseyNumbers={playerJerseyNumbers}
            statsFilter={statsFilter}
            onSeekToGameVideo={(gameId, videoTime) => {
              const game = statsGames.find(g => g.id === gameId);
              const vid = videos.find(v => v.id === (game as any)?.videoId || v.gameId === gameId);
              if (vid) {
                pendingSeekTimeRef.current = videoTime;
                setCurrentVideo(vid);
                setView('tracker');
              }
            }}
          />
        ) : view === 'teamProfile' && activeTeamId ? (
          <TeamProfileView
            players={statsPlayers} events={dashboardEvents} games={dashboardGames} seasons={statsSeasons} teams={statsTeams} leagues={leagues}
            activeTeamId={activeTeamId}
            onBack={popProfile}
            onPlayerSelect={handlePlayerProfileClick}
            onGameSelect={handleGameProfileClick}
          />
        ) : view === 'gameProfile' && activeGameId ? (
          <GameBoxScoreView
            players={statsPlayers} events={statsEvents} games={statsGames} seasons={statsSeasons} teams={statsTeams} videos={videos}
            activeGameId={activeGameId}
            onBack={popProfile}
            onPlayerSelect={handlePlayerProfileClick}
            onTeamSelect={handleTeamProfileClick}
            onWatchVideo={(vid) => { setCurrentVideo(vid); setView('tracker'); }}
          />
        ) : view === 'lists' ? (
          <ListsView
            players={statsPlayers}
            events={listsEvents}
            teams={statsTeams}
            games={listsGames}
            seasons={statsSeasons}
            statsFilter="full"
            onPlayerSelect={handlePlayerProfileClick}
            onBack={() => setView('stats')}
          />
        ) : !currentVideo ? (
          <div className="mx-auto mt-8 px-6 pb-16">

            <div className="flex flex-col xl:flex-row gap-6 w-full items-start">

              {/* Completed Games List */}
              <div className="xl:w-[450px] xl:min-w-[450px] w-full bg-white border border-amber-200/60 rounded-2xl shadow-sm overflow-hidden p-6 flex flex-col">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-amber-500" /> Completed Games</h3>
                <div className="grid grid-cols-1 gap-3 mb-4 shrink-0 bg-amber-50/30 p-3 rounded-xl border border-amber-100">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5 block">Season</span>
                    <select
                      value={verifiedYearId}
                      onChange={e => { setVerifiedYearId(e.target.value); setVerifiedTeamId('all'); }}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-amber-500 font-medium"
                    >
                      <option value="all">All Seasons</option>
                      {trackingYears.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5 block">Team</span>
                    <select
                      value={verifiedTeamId}
                      onChange={e => setVerifiedTeamId(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-amber-500 font-medium"
                    >
                      <option value="all">All Teams</option>
                      {verifiedTeams.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5 flex-1 min-h-[200px] max-h-[400px] overflow-y-auto custom-scrollbar pr-1 pb-4">
                  {verifiedFilteredGames.map(g => {
                    const acts = statsVideos.filter(v => v.gameId === g.id);
                    if (acts.length === 0) return null;
                    return acts.map((vid, idx) => (
                      <button
                        key={`verified_${g.id}_${vid.id}_${idx}`}
                        onClick={() => setCurrentVideo(vid)}
                        className="w-full py-2 px-3 border rounded-lg flex items-center gap-2.5 transition-all text-left hover:bg-amber-50 bg-amber-50/20 border-amber-200/50 hover:border-amber-300"
                      >
                        <div className="w-12 h-8 bg-black rounded overflow-hidden flex-shrink-0 border border-amber-200/50">
                          <img src={`https://img.youtube.com/vi/${vid.youtubeId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover opacity-90" referrerPolicy="no-referrer" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-xs leading-snug text-gray-900">{g.displayName}</p>
                          {g.subTitle && <p className="text-[9px] font-normal truncate mt-0.5 text-amber-700/60">{g.subTitle}</p>}
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] font-medium text-amber-600/80">
                            <span className="flex items-center gap-1">
                              <ShieldCheck className="w-2.5 h-2.5" /> Complete
                            </span>
                            <span className="flex items-center gap-1 opacity-80">
                              <Clock className="w-2.5 h-2.5" />
                              {g.date ? new Date(g.date + "T12:00:00").toLocaleDateString() : '-'}
                            </span>
                          </div>
                        </div>
                      </button>
                    ));
                  })}
                  {verifiedFilteredGames.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed border-amber-200 rounded-xl bg-amber-50/30 flex flex-col justify-center items-center">
                      <ShieldCheck className="w-8 h-8 text-amber-200 mb-2" />
                      <p className="text-amber-500 font-medium text-sm">No completed games yet.</p>
                      <p className="text-[10px] text-amber-400 mt-1">Mark games as complete to see them here.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Unified Video List */}
              <div className="xl:flex-1 w-full bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden p-6 flex flex-col">
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3"><Play className="w-5 h-5 text-gray-400" /> Watch and Contribute</h3>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 shrink-0 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 block">League</span>
                    <select
                      value={watchLeagueId}
                      onChange={e => { setWatchLeagueId(e.target.value); setWatchDivision('all'); setTrackerYearId('all'); setTrackerTeamId('all'); setTrackerOpponentId('all'); setTrackerGameId(''); }}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-red-500 font-medium"
                    >
                      <option value="all">All Leagues</option>
                      {watchLeagues.map(l => (
                        <option key={l} value={l}>{leagues.find(lg => lg.id === l)?.name || l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 block">Division</span>
                    <select
                      value={watchDivision}
                      onChange={e => { setWatchDivision(e.target.value); setTrackerYearId('all'); setTrackerTeamId('all'); setTrackerOpponentId('all'); setTrackerGameId(''); }}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-red-500 font-medium disabled:opacity-50"
                      disabled={watchLeagueId === 'all'}
                    >
                      <option value="all">All Divisions</option>
                      {watchDivisions.map(d => (
                        <option key={d} value={d}>{d}</option>
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

                <div className="space-y-1.5 flex-1 min-h-[300px] max-h-[400px] overflow-y-auto custom-scrollbar pr-2 pb-4">
                  {trackingFilteredGames.map(g => {
                    const acts = statsVideos.filter(v => v.gameId === g.id);
                    if (acts.length === 0) return null;

                    // Pristine games (both sides 'complete') live in the Completed Games list,
                    // so anything reaching this list is either half-done ("Partial") or fully
                    // tracked but missing subs on at least one side ("Missing Subs").
                    const someComplete = isPartiallyComplete(g);
                    const bothComplete = isFullyComplete(g);
                    const completeSides = (['home', 'away'] as const)
                      .filter(side => sideCompletion(g, side) !== 'none')
                      .map(side => {
                        const t = statsTeams.find(tm => tm.id === (side === 'home' ? g.homeTeamId : g.awayTeamId));
                        return t?.nickname || t?.name || side;
                      });
                    const statusLabel = bothComplete ? 'Missing Subs' : 'Partial';
                    const isVerified = someComplete;
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
                            <p className={cn("font-bold text-sm leading-snug transition-colors", isVerified ? "text-gray-900" : "text-gray-800")}>{g.displayName}</p>
                            {g.subTitle && <p className={cn("text-[10px] font-normal truncate mt-0.5", isVerified ? "text-amber-700/60" : "text-gray-500")}>{g.subTitle}</p>}
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className={cn("text-[11px] flex items-center gap-1 font-medium", isVerified ? "text-amber-600/80" : "text-gray-500")}>
                                <Clock className="w-3 h-3" />
                                {g.date ? new Date(g.date + "T12:00:00").toLocaleDateString() : '-'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {someComplete && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
                                  bothComplete ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                                )}
                                title={bothComplete ? 'Both teams complete, subs missing on at least one side' : `Complete: ${completeSides.join(', ')}`}
                              >
                                <ShieldCheck className="w-3 h-3" />
                                {statusLabel}
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
            </div>
          </div>

        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Column: Player & Controls */}
            <div className={cn("flex flex-col gap-2 min-h-0 overflow-hidden", isExpandedLayout ? "lg:col-span-12 shrink-0" : "lg:col-span-9")}>
              <div data-tour="video-player" className={cn("rounded-2xl overflow-hidden shadow-2xl border border-gray-200 flex items-center justify-center relative", isExpandedLayout ? "hidden" : "bg-black flex-1 min-h-0")}>
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
                      onStateChange={(e) => setIsVideoPlaying(e.data === 1)}
                    />
                  );
                })()}
              </div>

              {/* Controls and Scoreboard Row */}
              {(() => {
                const renderScrubControls = () => (
                  <div data-tour="scrub-controls" className="flex gap-1 items-center shrink-0">
                    <button onClick={() => player?.seekTo(Math.max(0, currentTime - 15))} className="p-1.5 md:px-2 md:py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[9px] md:text-[10px] uppercase tracking-wider font-bold rounded shadow-sm flex items-center justify-center gap-0.5 md:gap-1 transition-all" title="Rewind 15s"><Rewind className="w-3 h-3"/> <span className="hidden md:block">15s</span></button>
                    <button onClick={() => player?.seekTo(Math.max(0, currentTime - 5))} className="p-1.5 md:px-2 md:py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[9px] md:text-[10px] uppercase tracking-wider font-bold rounded shadow-sm flex items-center justify-center gap-0.5 md:gap-1 transition-all" title="Rewind 5s"><Rewind className="w-3 h-3"/> <span className="hidden md:block">5s</span></button>
                    <button onClick={() => isVideoPlaying ? player?.pauseVideo() : player?.playVideo()} className="p-1.5 md:px-3 md:py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-[9px] md:text-[10px] uppercase tracking-wider font-bold rounded shadow-sm flex items-center justify-center gap-0.5 md:gap-1 transition-all" title={isVideoPlaying ? "Pause" : "Play"}>
                      {isVideoPlaying ? <Pause className="w-3 h-3"/> : <Play className="w-3 h-3"/>}
                    </button>
                    <button onClick={() => player?.seekTo(currentTime + 5)} className="p-1.5 md:px-2 md:py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[9px] md:text-[10px] uppercase tracking-wider font-bold rounded shadow-sm flex items-center justify-center gap-0.5 md:gap-1 transition-all" title="Forward 5s"><span className="hidden md:block">5s</span> <FastForward className="w-3 h-3"/></button>
                    <button onClick={() => player?.seekTo(currentTime + 15)} className="p-1.5 md:px-2 md:py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[9px] md:text-[10px] uppercase tracking-wider font-bold rounded shadow-sm flex items-center justify-center gap-0.5 md:gap-1 transition-all" title="Forward 15s"><span className="hidden md:block">15s</span> <FastForward className="w-3 h-3"/></button>
                  </div>
                );

                return (
                  <div data-tour="scoreboard" className={cn("w-full mt-2 mb-3", isExpandedLayout ? "grid grid-cols-4 gap-4 items-center" : "flex flex-row items-center justify-between gap-3")}>
                    {/* Video Scrub Controls - Left side in Expanded Mode */}
                    {isExpandedLayout && player && (
                      <div className="col-span-1 flex items-center justify-center">
                        {renderScrubControls()}
                      </div>
                    )}

                    {/* Scoreboard Persistent Header */}
                    <div className={cn("min-w-0", isExpandedLayout ? "col-span-3" : "flex-1")}>
                      {(() => {
                        if (!currentGame) return null;
                        const pastEvents = activeTrackingEvents.filter(e => e.videoTime <= currentTime);
                        const liveScores = computeScores(pastEvents, currentGame.homeTeamId, currentGame.awayTeamId);
                        const winCond = computeWinCondition(pastEvents, currentGame.homeTeamId, currentGame.awayTeamId);
                        const homeTeamObj = teams.find(t => t.id === currentGame.homeTeamId);
                        const awayTeamObj = teams.find(t => t.id === currentGame.awayTeamId);
                        const homeName = homeTeamObj?.nickname || homeTeamObj?.name || 'Home';
                        const awayName = awayTeamObj?.nickname || awayTeamObj?.name || 'Away';
                        const homeColor = avoidWhite(homeTeamObj?.colorPrimaryDark || homeTeamObj?.colorPrimary || '#dc2626');
                        const awayColor = avoidWhite(awayTeamObj?.colorPrimaryLight || awayTeamObj?.colorLight || '#2563eb');
                        const currentDodgeballTeamId = getControlTeamAtTime(computeControlPeriods(pastEvents), currentTime);

                        return (
                          <div className={cn("bg-white border rounded py-1.5 px-3 shrink-0 shadow-sm flex items-center justify-between w-full mx-auto gap-4 relative", winCond.flagOnPitch && !winCond.winner ? "bg-yellow-50 border-yellow-300" : "border-gray-200")}>
                            {/* Left: Home */}
                            <div className="flex items-center justify-end flex-1 w-0 gap-2">
                              <p className="text-[10px] md:text-xs uppercase font-bold truncate text-right w-full" style={{ color: homeColor }}>{homeName}</p>
                              <div className="flex items-center gap-1 shrink-0">
                                <p className="text-xl font-mono font-bold" style={{ color: homeColor }}>{liveScores.home}</p>
                                {currentDodgeballTeamId === currentGame.homeTeamId && <div title="Dodgeball Control" className="w-1.5 h-1.5 bg-black rounded-sm shadow-sm" />}
                              </div>
                            </div>

                            {/* Center: Clock & Win Cond */}
                            <div className="flex flex-col items-center justify-center shrink-0 border-x border-gray-100 px-4 min-w-[100px]">
                              <p className="text-xs font-mono font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded shadow-inner leading-none">{formatTime(gameTime)}</p>
                              {winCond.winner ? (
                                <p className="text-[8px] font-bold text-yellow-600 uppercase tracking-widest mt-1 truncate">
                                  Winner: {teams.find(t => t.id === winCond.winner)?.nickname || teams.find(t => t.id === winCond.winner)?.name || winCond.winner}
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
                                <p className="text-xl font-mono font-bold" style={{ color: awayColor }}>{liveScores.away}</p>
                              </div>
                              <p className="text-[10px] md:text-xs uppercase font-bold truncate text-left w-full" style={{ color: awayColor }}>{awayName}</p>
                            </div>

                            <div className="pl-3 ml-2 border-l border-gray-200 flex items-center justify-center shrink-0 gap-1">
                              <button data-tour="cinema-toggle" onClick={() => setIsExpandedLayout(v => !v)} className={cn("p-1.5 rounded transition-colors", isExpandedLayout ? "text-red-600 bg-red-50 hover:bg-red-100" : "text-gray-400 hover:text-red-600")} title={isExpandedLayout ? "Restore Video" : "Cinema Mode (Hide Video)"}>
                                <Maximize2 className="w-5 h-5" />
                              </button>
                              <button onClick={() => handleGameProfileClick(currentGame.id)} className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors" title="View Box Score">
                                <Activity className="w-5 h-5" />
                              </button>
                              {user && (
                                <button onClick={trackerTutorial.start} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors" title="Replay the tutorial">
                                  <HelpCircle className="w-5 h-5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Video Scrub Controls - Right side in Normal Mode */}
                    {!isExpandedLayout && player && renderScrubControls()}
                  </div>
                );
              })()}


              {!user && (
                <p className="mt-4 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Sign in to track stats and vote
                </p>
              )}
            </div>

            {/* Right Column: Event Feed & Roster */}
            <div className={cn("flex flex-col gap-4 overflow-hidden h-full", isExpandedLayout ? "lg:col-span-12" : "lg:col-span-3")}>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col h-full relative">
                {!isExpandedLayout && (
                  <div className="p-0 border-b border-gray-200 flex items-center justify-between bg-gray-50/50 z-10 shrink-0">
                    <div data-tour="panel-tabs" className="flex w-full">
                    <button
                      data-tour="tab-events"
                      onClick={() => setRightPanelTab('live_events')}
                      className={cn("flex-1 px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors", rightPanelTab === 'live_events' ? "bg-white text-red-600 border-b-2 border-red-600" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100")}
                    >
                      <Clock className="w-4 h-4" /> Events
                    </button>
                    {canRecordEvents && (
                      <button
                        data-tour="tab-record"
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
                      data-tour="tab-players"
                      onClick={() => setRightPanelTab('rosters')}
                      className={cn("flex-1 px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors", rightPanelTab === 'rosters' ? "bg-white text-red-600 border-b-2 border-red-600" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100")}
                    >
                      <User className="w-4 h-4" /> Players
                    </button>
                    <button
                      data-tour="tab-momentum"
                      onClick={() => setRightPanelTab('momentum')}
                      className={cn("flex-1 px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors", rightPanelTab === 'momentum' ? "bg-white text-red-600 border-b-2 border-red-600" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100")}
                    >
                      <TrendingUp className="w-4 h-4" /> Momentum
                    </button>
                  </div>
                </div>
                )}

                <div className={cn("flex-1 overflow-hidden relative", isExpandedLayout ? "grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-gray-200" : "")}>

<div className={cn(isExpandedLayout ? "flex flex-col h-full relative" : "absolute inset-0", (rightPanelTab === 'live_events' || isExpandedLayout) ? "block" : "hidden", "overflow-y-auto p-4 custom-scrollbar bg-gray-50")} id="events-scroll-container" data-tour="events-feed">
                    <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-md pb-3 pt-1 mb-4 border-b border-gray-200/60 flex flex-col gap-2.5">
                      {/* This row is the only thing a collapsed header shows, so the scrub/filter
                          controls that matter for just watching along live here, with the
                          collapse toggle at the end. Everything past it — density, suggestions,
                          per-team completion — is moderator/author territory and folds away. */}
                      <div className="flex items-center gap-1">
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
                          className="flex items-center gap-1 px-3 py-1 rounded text-[10px] font-bold transition-all border bg-white text-gray-500 border-gray-200 hover:text-red-500 hover:border-red-300 shadow-sm shrink-0"
                          title="Scroll to event nearest current time"
                        >
                          <SkipForward className="w-3 h-3" />
                          Now
                        </button>
                        <button
                          onClick={handleRegeneratePossessionPins}
                          className="flex items-center gap-1 px-2 py-1 rounded transition-all border bg-white text-purple-500 border-purple-200 hover:text-purple-700 hover:border-purple-400 shadow-sm shrink-0"
                          title="Regenerate auto-pins (possession & control) for the current video"
                        >
                          <RefreshCcw className="w-3 h-3" />
                        </button>
                        <select value={eventsFilterSet} onChange={e => setEventsFilterSet(e.target.value)} className="flex-1 min-w-0 text-[10px] font-bold text-gray-600 bg-white border border-gray-200 rounded-md py-1.5 px-2 outline-none focus:border-red-300 focus:ring-1 focus:ring-red-200 shadow-sm appearance-none">
                          <option value="all">All Events</option>
                          <option value="all_no_subs">All (No Subs)</option>
                          {currentGame?.homeTeamId && <option value="home_focused">Home Focused</option>}
                          {currentGame?.awayTeamId && <option value="away_focused">Away Focused</option>}
                          <option value="possession_scoring">Possessions & Scoring</option>
                        </select>
                        <button
                          onClick={toggleEventsHeaderExpanded}
                          className="flex items-center justify-center p-1.5 rounded-md transition-all border bg-white text-gray-400 border-gray-200 hover:text-gray-700 shrink-0"
                          title={eventsHeaderExpanded ? 'Collapse' : 'Expand'}
                        >
                          {eventsHeaderExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      {eventsHeaderExpanded && (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 flex bg-white border border-gray-200 rounded-md p-0.5 shadow-sm">
                              {([
                                { key: 'full' as const, icon: <Eye className="w-3 h-3" />, label: 'Full' },
                                { key: 'compact' as const, icon: <EyeOff className="w-3 h-3" />, label: 'Compact' },
                              ]).map(opt => (
                                <button
                                  key={opt.key}
                                  onClick={() => setEventDensity(opt.key)}
                                  title={`${opt.label} events — ${opt.key === 'full' ? 'everything shown, including the voting/editing footer' : 'same as Full, without the voting/editing footer'}`}
                                  className={cn('flex-1 flex items-center justify-center gap-1 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all', eventDensity === opt.key ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700')}
                                >
                                  {opt.icon}
                                </button>
                              ))}
                            </div>
                            {suggestions.some(s => s.status === 'open') && (
                              <button
                                onClick={() => setShowSuggestionQueue(v => !v)}
                                className={cn('flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-bold transition-all border shrink-0', showSuggestionQueue ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' : 'bg-white text-gray-400 border-gray-200 hover:text-amber-500')}
                                title="Open suggestions for this game, sorted by score"
                              >
                                <Inbox className="w-3 h-3" />
                                {suggestions.filter(s => s.status === 'open').length}
                              </button>
                            )}
                            <button
                              onClick={() => setSuggestFormState({ mode: 'add' })}
                              className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-bold transition-all border bg-white text-gray-400 border-gray-200 hover:text-blue-500 hover:border-blue-300 shrink-0"
                              title="Suggest a missing event"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          {showSuggestionQueue && (
                            <div className="space-y-2 max-h-64 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/30 p-2">
                              {suggestions.filter(s => s.status === 'open').sort((a, b) => b.score - a.score).map(sugg => (
                                <SuggestionCard
                                  key={sugg.id}
                                  suggestion={sugg}
                                  voterId={voterId}
                                  canModerate={canModerate}
                                  compact
                                  playerName={(id) => { const p = allPlayers.find(pl => pl.id === id); return p ? `${p.firstName.charAt(0)}. ${p.lastName}` : undefined; }}
                                  teamName={(id) => teams.find(tm => tm.id === id)?.name}
                                  onVote={(isUp) => currentVideo && handleVoteOnSuggestion(currentVideo.gameId, sugg, isUp)}
                                  onAccept={() => currentVideo && handleAcceptSuggestion(currentVideo.gameId, sugg)}
                                  onReject={() => currentVideo && handleRejectSuggestion(currentVideo.gameId, sugg)}
                                  onRemove={() => currentVideo && handleWithdrawSuggestion(currentVideo.gameId, sugg.id)}
                                  onSeek={sugg.targetEventId ? () => {
                                    const target = events.find(e => e.id === sugg.targetEventId);
                                    if (target) player?.seekTo(target.videoTime);
                                  } : undefined}
                                />
                              ))}
                              {suggestions.filter(s => s.status === 'open').length === 0 && (
                                <p className="text-xs text-gray-400 text-center py-4">No open suggestions.</p>
                              )}
                            </div>
                          )}
                          {canModerate && currentGame && (
                            <div className="flex flex-col gap-1.5">
                              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Tracking Complete</p>
                              {/* Completion is per team, so whoever tracked one side can publish that
                                  side's stats without waiting for anyone to cover the other. Both rows
                                  read the same left-to-right — team, then status — rather than
                                  mirroring home/away, which just made the two harder to compare. */}
                              <div className="flex flex-col gap-1">
                                {(['home', 'away'] as const).map(side => {
                                  const teamId = side === 'home' ? currentGame.homeTeamId : currentGame.awayTeamId;
                                  const teamObj = teams.find(t => t.id === teamId);
                                  const teamColor = side === 'home'
                                    ? avoidWhite(teamObj?.colorPrimaryDark || teamObj?.colorPrimary || '#dc2626')
                                    : avoidWhite(teamObj?.colorPrimaryLight || teamObj?.colorLight || '#2563eb');
                                  const current = sideCompletion(currentGame, side);
                                  return (
                                    <div key={side} className="flex items-center gap-2 rounded-md border border-gray-200 bg-white pl-2.5 pr-1.5 py-1">
                                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: teamColor }} />
                                      <span
                                        className="text-[10px] font-bold uppercase tracking-wider truncate"
                                        style={{ color: teamColor }}
                                        title={teamObj?.name || (side === 'home' ? 'Home' : 'Away')}
                                      >
                                        {teamObj?.nickname || teamObj?.name || (side === 'home' ? 'Home' : 'Away')}
                                      </span>
                                      <div className="ml-auto flex items-center gap-1">
                                        {current !== 'none' && <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />}
                                        <select
                                          value={current}
                                          onChange={e => handleSetTeamCompletion(currentGame.id, side, e.target.value as TeamCompletion)}
                                          className={cn(
                                            'text-[10px] font-bold bg-transparent outline-none cursor-pointer py-1 pl-1 pr-0.5 rounded',
                                            current === 'none' ? 'text-gray-400' : 'text-emerald-600'
                                          )}
                                          title={`${teamObj?.name || side}: ${TEAM_COMPLETION_LABELS[current]}`}
                                        >
                                          {TEAM_COMPLETION_VALUES.map(value => (
                                            <option key={value} value={value}>{TEAM_COMPLETION_LABELS[value]}</option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div className="space-y-4">
                    {(() => {
                      const feedHomeTeamObj = teams.find(t => t.id === currentGame?.homeTeamId);
                      const feedAwayTeamObj = teams.find(t => t.id === currentGame?.awayTeamId);
                      const feedHomeColor = avoidWhite(feedHomeTeamObj?.colorPrimaryDark || feedHomeTeamObj?.colorPrimary || '#dc2626');
                      const feedAwayColor = avoidWhite(feedAwayTeamObj?.colorPrimaryLight || feedAwayTeamObj?.colorLight || '#2563eb');
                      const pinEvents = pins.filter(p => p.videoId === currentVideo?.id).map(p => ({
                        id: p.id,
                        type: `pin_${p.type}`,
                        videoTime: p.time,
                        gameTime: 0,
                        teamId: null,
                        playerId: null,
                        status: 'recorded'
                      } as any));
                      let displayEvents = [...activeTrackingEvents, ...pinEvents].sort((a,b) => a.videoTime - b.videoTime);
                      
                      switch (eventsFilterSet) {
                        case 'all_no_subs':
                          displayEvents = displayEvents.filter(e => (e.type !== 'sub_in' && e.type !== 'sub_out') || e.type.startsWith('pin_'));
                          break;
                        case 'home_focused':
                          displayEvents = displayEvents.filter(e => 
                            e.type.startsWith('pin_') || 
                            e.teamId === currentGame?.homeTeamId || 
                            (e.teamId === currentGame?.awayTeamId && e.type === 'goal')
                          );
                          break;
                        case 'away_focused':
                          displayEvents = displayEvents.filter(e => 
                            e.type.startsWith('pin_') || 
                            e.teamId === currentGame?.awayTeamId || 
                            (e.teamId === currentGame?.homeTeamId && e.type === 'goal')
                          );
                          break;
                        case 'possession_scoring':
                          displayEvents = displayEvents.filter(e => 
                            e.type.startsWith('pin_') || 
                            ['goal', 'assist', 'shot', 'attempt', 'miss_ko', 'turnover', 'control_change', 'control_start'].includes(e.type)
                          );
                          break;
                        case 'all':
                        default:
                          // No additional filtering needed
                          break;
                      }

                      // An assist is nested under (rendered inside) its goal's card whenever
                      // that goal is also present in the current filtered view. Only one
                      // assist per goal is nested; any others fall back to standalone cards.
                      const nestedAssistByGoalId = new Map<string, any>();
                      displayEvents.forEach(e => {
                        if (e.type === 'assist' && e.relatedEventId && !nestedAssistByGoalId.has(e.relatedEventId)) {
                          const goal = displayEvents.find(g => g.id === e.relatedEventId && g.type === 'goal');
                          if (goal) nestedAssistByGoalId.set(goal.id, e);
                        }
                      });
                      const nestedAssistIds = new Set(Array.from(nestedAssistByGoalId.values()).map((e: any) => e.id));

                      const renderTrackingEventBody = (evt: any) => {
                        const cfg = EVENT_CONFIG[evt.type as EventType] || { label: evt.type, icon: <AlertCircle className="w-4 h-4" />, color: 'bg-neutral-500' };
                        const openSuggestionsForEvent = suggestions.filter(s => s.targetEventId === evt.id && s.status === 'open');
                        const label = (evt.type === 'sub_in' && evt.position) ? `${evt.position} In` : (evt.type === 'sub_out' && evt.position) ? `${evt.position} Out` : (evt.type === 'card' && evt.color) ? `${evt.color} Card` : cfg.label;
                        const cardIconColor = evt.type === 'card' && evt.color
                          ? (evt.color === 'blue' ? 'bg-blue-500' : evt.color === 'yellow' ? 'bg-yellow-400' : evt.color === 'red' ? 'bg-red-500' : cfg.color)
                          : cfg.color;
                        return (
                          <>
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className={cn("p-1.5 rounded-md", cardIconColor)}>
                                  {React.cloneElement(cfg.icon as React.ReactElement<any>, { className: 'w-3 h-3' })}
                                </div>
                                <div className="flex flex-col items-center">
                                  <p className="font-mono text-xs font-bold text-gray-800 w-12 text-center">{formatTime(evt.gameTime || 0)}</p>
                                  <p className="font-mono text-[9px] text-gray-400 w-12 text-center">({formatTime(evt.videoTime)})</p>
                                </div>
                                <div className="flex flex-col justify-center gap-0.5 ml-1">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-bold capitalize">
                                      {label}
                                    </p>
                                  </div>
                                  {(evt.playerId || evt.teamId) && (
                                    <div className="text-xs">
                                      {evt.playerId ? (() => {
                                        const p = allPlayers.find(pl => pl.id === evt.playerId);
                                        return p ? (
                                          <span
                                            className="font-bold tracking-tight"
                                            style={evt.teamId === currentGame?.homeTeamId ? { color: feedHomeColor } : evt.teamId === currentGame?.awayTeamId ? { color: feedAwayColor } : { color: '#374151' }}
                                          >
                                            {p.firstName.charAt(0)}. {p.lastName}
                                          </span>
                                        ) : 'Player';
                                      })() : (() => {
                                        const t = teams.find(tm => tm.id === evt.teamId);
                                        return t ? (
                                          <span
                                            className="font-bold text-[9px] uppercase tracking-wider"
                                            style={evt.teamId === currentGame?.homeTeamId ? { color: feedHomeColor } : evt.teamId === currentGame?.awayTeamId ? { color: feedAwayColor } : { color: '#6b7280' }}
                                          >
                                            {t.name}
                                          </span>
                                        ) : 'Team';
                                      })()}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => player?.seekTo(evt.videoTime)}
                                  className="text-[10px] font-mono bg-gray-100 hover:bg-red-600 px-2 py-1 rounded transition-colors"
                                >
                                  Seek {formatTime(evt.videoTime)}
                                </button>
                              </div>
                            </div>

                            {eventDensity !== 'compact' && (
                              <div className="flex items-center justify-between pt-2 border-t border-gray-200/50">
                                {/* Net, then the vote counters. Events are valid as soon as they're
                                    authored — there is no verification step here any more, so voting
                                    is the whole accuracy story. */}
                                <div className="flex items-center gap-3">
                                  <span className={cn(
                                    "text-xs font-bold",
                                    evt.votes > 0 ? "text-green-500" : evt.votes < 0 ? "text-red-500" : "text-gray-400"
                                  )}>
                                    {evt.votes > 0 ? `+${evt.votes}` : evt.votes}
                                  </span>
                                  <span className="text-[10px] text-gray-300 uppercase font-bold tracking-tighter">Net</span>
                                  <div className="h-3 w-px bg-gray-100 mx-1" />
                                  <button
                                    onClick={() => handleVote(evt.id, true)}
                                    className={cn(
                                      'flex items-center gap-1 px-1.5 py-1 rounded transition-all',
                                      evt.upvoterIds?.includes(voterId)
                                        ? 'bg-green-500/15 text-green-600 ring-1 ring-green-500/30'
                                        : 'text-gray-400 hover:bg-green-500/10 hover:text-green-500'
                                    )}
                                    title="Mark accurate"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span className="text-xs font-bold">{evt.upvotes || 0}</span>
                                  </button>
                                  <button
                                    onClick={() => handleVote(evt.id, false)}
                                    className={cn(
                                      'flex items-center gap-1 px-1.5 py-1 rounded transition-all',
                                      evt.downvoterIds?.includes(voterId)
                                        ? 'bg-red-500/15 text-red-600 ring-1 ring-red-500/30'
                                        : 'text-gray-400 hover:bg-red-500/10 hover:text-red-500'
                                    )}
                                    title="Mark inaccurate"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span className="text-xs font-bold">{evt.downvotes || 0}</span>
                                  </button>
                                </div>

                                {/* Every editing entry point lives here, in this order: edit, delete,
                                    suggest a fix, suggest a removal. Nothing edit-related sits in the
                                    header any more, so Compact can hide this one div and be done. */}
                                <div className="flex items-center gap-1">
                                  {(canModerate || (evt.userId === user?.uid && evt.status !== 'verified')) && (
                                    <>
                                      <button
                                        onClick={() => handleEditRecordedEvent(evt.id)}
                                        className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors rounded flex items-center justify-center border border-transparent hover:border-blue-100"
                                        title="Edit Event"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => { if (window.confirm('Delete this event permanently?')) handleDeleteRecordedEvent(evt.id) }}
                                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors rounded flex items-center justify-center border border-transparent hover:border-red-100"
                                        title="Delete Event"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                  <button
                                    onClick={() => setSuggestFormState({ mode: 'edit', targetEvent: evt })}
                                    className="p-1 text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors rounded flex items-center justify-center border border-transparent hover:border-amber-100"
                                    title="Suggest a fix"
                                  >
                                    <MessageSquarePlus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setSuggestFormState({ mode: 'delete', targetEvent: evt })}
                                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors rounded flex items-center justify-center border border-transparent hover:border-red-100"
                                    title="Suggest this be removed"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}

                            {openSuggestionsForEvent.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-amber-200/60">
                                <button
                                  onClick={() => setExpandedSuggestionEventIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(evt.id)) next.delete(evt.id); else next.add(evt.id);
                                    return next;
                                  })}
                                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 hover:text-amber-700"
                                >
                                  {expandedSuggestionEventIds.has(evt.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  {openSuggestionsForEvent.length} suggested fix{openSuggestionsForEvent.length === 1 ? '' : 'es'}
                                </button>
                                {expandedSuggestionEventIds.has(evt.id) && (
                                  <div className="mt-2 space-y-2">
                                    {openSuggestionsForEvent.map(sugg => (
                                      <SuggestionCard
                                        key={sugg.id}
                                        suggestion={sugg}
                                        voterId={voterId}
                                        canModerate={canModerate}
                                        playerName={(id) => { const p = allPlayers.find(pl => pl.id === id); return p ? `${p.firstName.charAt(0)}. ${p.lastName}` : undefined; }}
                                        teamName={(id) => teams.find(tm => tm.id === id)?.name}
                                        onVote={(isUp) => currentVideo && handleVoteOnSuggestion(currentVideo.gameId, sugg, isUp)}
                                        onAccept={() => currentVideo && handleAcceptSuggestion(currentVideo.gameId, sugg)}
                                        onReject={() => currentVideo && handleRejectSuggestion(currentVideo.gameId, sugg)}
                                        onRemove={() => currentVideo && handleWithdrawSuggestion(currentVideo.gameId, sugg.id)}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        );
                      };

                      return displayEvents.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center p-8">
                          <Clock className="w-12 h-12 mb-4 opacity-20" />
                          <p>No events recorded yet.</p>
                          <p className="text-sm">Be the first to track a goal!</p>
                        </div>
                      ) : (
                        displayEvents.slice().reverse().map((event) => {
                          const isPin = event.type.startsWith('pin_');
                          if (isPin) {
                            const pinType = event.type.replace('pin_', '');
                            let colorClass = "bg-gray-400 text-white";
                            let lineClass = "bg-gray-400";
                            if (pinType === 'control') { colorClass = "bg-black text-white"; lineClass = "bg-black"; }
                            else if (pinType === 'general') { colorClass = "bg-yellow-400 text-yellow-900"; lineClass = "bg-yellow-400"; }
                            else if (pinType === 'possession') { colorClass = "bg-purple-600 text-white"; lineClass = "bg-purple-600"; }
                            else if (pinType === 'sub') { colorClass = "bg-cyan-600 text-white"; lineClass = "bg-cyan-600"; }

                            return (
                              <div key={event.id} className="flex items-center gap-1.5 group w-full py-1 relative">
                                <div className={`flex-1 h-[2px] ${lineClass} opacity-30 group-hover:opacity-100 transition-opacity`}></div>
                                <button 
                                  onClick={() => player?.seekTo(event.videoTime)}
                                  className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${colorClass} hover:opacity-80 transition-opacity flex items-center gap-1 shadow-sm shrink-0`}
                                >
                                  <MapPin className="w-2.5 h-2.5" />
                                  {pinType} @ {formatTime(event.videoTime)}
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setPins(prev => prev.filter(pin => pin.id !== event.id)); }} 
                                  className="text-gray-400 hover:text-red-500 transition-colors p-0.5 opacity-0 group-hover:opacity-100 shrink-0" 
                                  title="Dismiss Pin"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                                <div className={`flex-1 h-[2px] ${lineClass} opacity-30 group-hover:opacity-100 transition-opacity`}></div>
                              </div>
                            );
                          }

                          if (nestedAssistIds.has(event.id)) {
                            // Rendered nested inside its goal's card below instead.
                            return null;
                          }

                          const nestedAssist = event.type === 'goal' ? nestedAssistByGoalId.get(event.id) : undefined;
                          const hasOpenSuggestions = suggestions.some(s => s.targetEventId === event.id && s.status === 'open');

                          // Home events hug the left edge, away events hug the right edge, and
                          // team-less (neutral) events stay centered — alignment alone signals
                          // which side an event belongs to, so cards are capped well under full
                          // width instead of stretching edge to edge.
                          const isHome = event.teamId === currentGame?.homeTeamId;
                          const isAway = event.teamId === currentGame?.awayTeamId;
                          return (
                            <div
                              key={event.id}
                              className={cn(
                                "flex w-full",
                                isHome ? "justify-start" : isAway ? "justify-end" : "justify-center"
                              )}
                            >
                              <div
                                data-event-time={event.videoTime}
                                className={cn(
                                  "group border rounded-xl p-3 transition-all w-full max-w-[85%] sm:max-w-[75%]",
                                  !event.teamId && "bg-white border-gray-200 hover:border-gray-300",
                                  event.status === 'rejected' && "opacity-50 grayscale",
                                  hasOpenSuggestions && "border-l-4"
                                )}
                                style={{
                                  // A team-colored card sets borderColor (all four sides) via inline style, which
                                  // would silently beat the amber Tailwind class below since inline style always
                                  // wins over a class for the same property — so the amber override has to be
                                  // merged in after, not left to CSS specificity.
                                  ...(isHome ? { backgroundColor: hexToRgba(feedHomeColor, 0.06), borderColor: hexToRgba(feedHomeColor, 0.25) } :
                                    isAway ? { backgroundColor: hexToRgba(feedAwayColor, 0.06), borderColor: hexToRgba(feedAwayColor, 0.25) } :
                                      {}),
                                  ...(hasOpenSuggestions ? { borderLeftColor: '#f59e0b', borderLeftWidth: '4px' } : {}),
                                }}
                              >
                                {renderTrackingEventBody(event)}
                                {nestedAssist && (
                                  <>
                                    <div className="flex items-center gap-2 my-2">
                                      <div className="flex-1 border-t border-dashed border-gray-300" />
                                      <CornerDownRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                                      <div className="flex-1 border-t border-dashed border-gray-300" />
                                    </div>
                                    {renderTrackingEventBody(nestedAssist)}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })
                      );
                    })()}
                    </div>
                  </div>

                  <div data-tour="record-panel" className={cn(isExpandedLayout ? "flex flex-col h-full relative" : "absolute inset-0", (rightPanelTab === 'record' || isExpandedLayout) ? "block" : "hidden", "overflow-y-auto custom-scrollbar p-4 bg-white")}>

                    {/* Voice & NLP Event Logger (Hidden for production deploy) */}
                    {/*
                    <div className="bg-slate-900 text-white rounded-2xl p-4 mb-4 shadow-lg border border-slate-800 relative overflow-hidden transition-all duration-300 hover:shadow-emerald-950/20">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
                      
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-2 w-2 relative">
                            {isListening ? (
                              <>
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                              </>
                            ) : (
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 animate-pulse"></span>
                            )}
                          </span>
                          <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-300">Voice & NLP Event Logger</h4>
                        </div>
                        <button
                          onClick={toggleSpeechRecognition}
                          className={cn(
                            "flex items-center justify-center p-2 rounded-xl transition-all duration-300 active:scale-95",
                            isListening 
                              ? "bg-red-500 text-white shadow-md shadow-red-500/30 animate-pulse" 
                              : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 hover:scale-105"
                          )}
                          title="Click to dictate an event"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                          </svg>
                        </button>
                      </div>

                      <form onSubmit={(e) => { e.preventDefault(); if (voiceCommandText.trim()) { parseNlpCommand(voiceCommandText); setVoiceCommandText(''); } }} className="flex gap-2">
                        <input
                          type="text"
                          value={voiceCommandText}
                          onChange={(e) => setVoiceCommandText(e.target.value)}
                          placeholder='Try: "goal home 10, assist 5" or "sub 12 in for 8"'
                          className="flex-1 bg-slate-800/90 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-medium placeholder-slate-500"
                        />
                        <button
                          type="submit"
                          className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 px-3 py-2 rounded-xl text-xs font-semibold hover:text-white transition-all active:scale-95 shadow-sm"
                        >
                          Send
                        </button>
                      </form>

                      {voiceStatusMessage && (
                        <div className="mt-2.5 text-[10px] font-medium text-slate-400 bg-slate-800/40 rounded-lg py-1.5 px-2.5 border border-slate-800/50 flex items-center gap-1.5 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          <span>{voiceStatusMessage}</span>
                        </div>
                      )}
                    </div>
                    */}

                    {/* Event Type Grid ALWAYS visible because Player Actions are now local popups */}
                    <div data-tour="event-grid" className="flex flex-col gap-3 mb-2">
                      {(() => {
                        const chaserTypes = ['goal', 'shot', 'attempt', 'miss_ko', 'turnover'];
                        const clockTypes = ['gameStart', 'gamePause', 'gameEnd'];

                        return (
                          <>
                            <div data-tour="record-actions" className="flex flex-col gap-1.5 mb-2">
                              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest pl-1">Chaser Actions</span>
                              <div className="grid grid-cols-5 gap-1.5">
                                {chaserTypes.map(type => {
                                  const config = EVENT_CONFIG[type as EventType];
                                  if (!config) return null;
                                  return (
                                    <button
                                      key={type}
                                      onClick={() => handleCreateDraftEvent(type as EventType, null, null, null, null)}
                                      className="flex flex-col items-center justify-center py-2 px-1 rounded-lg border border-gray-200 hover:border-gray-500 hover:bg-gray-50 transition-all active:scale-95 text-center bg-white shadow-sm"
                                    >
                                      <span className="text-[9px] uppercase font-bold tracking-tight text-gray-900 leading-tight">{config.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div data-tour="record-clock" className="flex flex-col gap-1.5">
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
                      <div data-tour="record-control" className="flex flex-col gap-1.5 mt-1">
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

                      {/* Drop Pins UI */}
                      {player && currentVideo && (
                        <div data-tour="record-pins" className="flex flex-col gap-1.5 mt-1">
                          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest pl-1">Drop Pin</span>
                          <div className="grid grid-cols-4 gap-1.5">
                            <button onClick={() => setPins(prev => [...prev, { id: crypto.randomUUID(), videoId: currentVideo.id, time: player.getCurrentTime(), type: 'sub' }])} className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border border-yellow-200 hover:border-yellow-500 hover:bg-yellow-50 transition-all active:scale-95 bg-white shadow-sm"><span className="text-[9px] uppercase font-bold tracking-tight text-yellow-700">Sub Pin</span></button>
                            <button onClick={() => setPins(prev => [...prev, { id: crypto.randomUUID(), videoId: currentVideo.id, time: player.getCurrentTime(), type: 'control' }])} className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border border-yellow-200 hover:border-yellow-500 hover:bg-yellow-50 transition-all active:scale-95 bg-white shadow-sm"><span className="text-[9px] uppercase font-bold tracking-tight text-yellow-700">Ctrl Pin</span></button>
                            <button onClick={() => setPins(prev => [...prev, { id: crypto.randomUUID(), videoId: currentVideo.id, time: player.getCurrentTime(), type: 'possession' }])} className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border border-yellow-200 hover:border-yellow-500 hover:bg-yellow-50 transition-all active:scale-95 bg-white shadow-sm"><span className="text-[9px] uppercase font-bold tracking-tight text-yellow-700">Poss Pin</span></button>
                            <button onClick={() => setPins(prev => [...prev, { id: crypto.randomUUID(), videoId: currentVideo.id, time: player.getCurrentTime(), type: 'general' }])} className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border border-yellow-200 hover:border-yellow-500 hover:bg-yellow-50 transition-all active:scale-95 bg-white shadow-sm"><span className="text-[9px] uppercase font-bold tracking-tight text-yellow-700">Gen Pin</span></button>
                          </div>
                        </div>
                      )}

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
                      <div data-tour="record-subs" className="flex flex-col gap-1.5 mt-1 border border-gray-200 bg-gray-50 p-2 rounded-lg">
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
                    <div data-tour="draft-queue" className="flex flex-col gap-4">
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
                              <div className="flex flex-col gap-2">
                                {/* Team & Player Selects (Hidden for Clock Events) */}
                                {!['gameStart', 'gamePause', 'gameEnd'].includes(draft.type || '') ? (
                                  <div className="flex items-center gap-1.5 w-full">
                                    <select
                                      value={draft.teamId === currentGame?.homeTeamId ? (draft.playerId || 'TEAM_ONLY') : ''}
                                      onChange={(e) => {
                                        const newPlr = e.target.value;
                                        if (!newPlr) {
                                          setDraftEvents(prev => prev.map(d => d.id === draft.id ? { ...d, teamId: null, playerId: null } : d));
                                          return;
                                        }
                                        if (newPlr === 'TEAM_ONLY') {
                                          setDraftEvents(prev => prev.map(d => d.id === draft.id ? { ...d, teamId: currentGame?.homeTeamId || null, playerId: null } : d));
                                          return;
                                        }
                                        setDraftEvents(prev => prev.map(d => {
                                          if (d.id !== draft.id) return d;
                                          let updatedDraft = { ...d, teamId: currentGame?.homeTeamId || null, playerId: newPlr };
                                          // Position is whatever it was already set to (defaulting to chaser the
                                          // first time), never guessed from the newly-picked player's history —
                                          // changing who's subbing in shouldn't silently change the position too.
                                          if (d.type === 'sub_in' && !updatedDraft.position) {
                                            updatedDraft.position = 'chaser';
                                          }
                                          return updatedDraft;
                                        }));
                                      }}
                                      className={`flex-1 w-0 text-[10px] border rounded p-1.5 shadow-sm ${draft.teamId === currentGame?.homeTeamId ? 'bg-white border-gray-300' : 'bg-red-50 border-red-300 text-red-600 font-bold'}`}
                                    >
                                      <option value="" disabled>⚠ Home Team - Select Player</option>
                                      <option value="TEAM_ONLY" className="font-bold text-gray-500">- {teams.find(t => t.id === currentGame?.homeTeamId)?.nickname || teams.find(t => t.id === currentGame?.homeTeamId)?.name || 'Team'} / No Player -</option>
                                      {homeRosterPlayers
                                        .filter(rp => {
                                          if (draft.type === 'sub_in') return !activePlayerPositions.has(rp.playerId);
                                          if (draft.type === 'sub_out') return activePlayerPositions.has(rp.playerId);
                                          return true;
                                        })
                                        .sort((a, b) => {
                                          if (draft.type === 'sub_in') {
                                            return (a.player?.lastName || '').localeCompare(b.player?.lastName || '');
                                          }
                                          const aActive = activePlayerPositions.has(a.playerId);
                                          const bActive = activePlayerPositions.has(b.playerId);
                                          if (aActive !== bActive) return aActive ? -1 : 1;
                                          if (aActive) {
                                            const posA = activePlayerPositions.get(a.playerId) || 'chaser';
                                            const posB = activePlayerPositions.get(b.playerId) || 'chaser';
                                            const order = { chaser: 1, keeper: 2, beater: 3, seeker: 4 } as Record<string, number>;
                                            return order[posA] - order[posB];
                                          }
                                          return (a.player?.lastName || '').localeCompare(b.player?.lastName || '');
                                        })
                                        .map(rp => (
                                          <option key={rp.playerId} value={rp.playerId}>
                                            {draft.type !== 'sub_in' ? `[${(activePlayerPositions.get(rp.playerId) || 'off').substring(0, 1).toUpperCase()}] ` : ''}
                                            {getPlayerShortName(rp.player, homeRosterPlayers)}
                                          </option>
                                        ))}
                                    </select>

                                    <select
                                      value={draft.type || ''}
                                      onChange={(e) => {
                                        const newType = e.target.value as EventType;
                                        setDraftEvents(prev => prev.map(d => d.id === draft.id ? { ...d, type: newType } : d));
                                      }}
                                      className="w-20 text-[9px] font-bold text-gray-700 border border-gray-300 rounded p-1 bg-white shadow-sm outline-none shrink-0"
                                    >
                                      {!draft.type && <option value="">Type</option>}
                                      {Object.entries(EVENT_CONFIG).map(([typeKey, config]) => (
                                        <option key={typeKey} value={typeKey}>{config.label}</option>
                                      ))}
                                    </select>

                                    <select
                                      value={draft.teamId === currentGame?.awayTeamId ? (draft.playerId || 'TEAM_ONLY') : ''}
                                      onChange={(e) => {
                                        const newPlr = e.target.value;
                                        if (!newPlr) {
                                          setDraftEvents(prev => prev.map(d => d.id === draft.id ? { ...d, teamId: null, playerId: null } : d));
                                          return;
                                        }
                                        if (newPlr === 'TEAM_ONLY') {
                                          setDraftEvents(prev => prev.map(d => d.id === draft.id ? { ...d, teamId: currentGame?.awayTeamId || null, playerId: null } : d));
                                          return;
                                        }
                                        setDraftEvents(prev => prev.map(d => {
                                          if (d.id !== draft.id) return d;
                                          let updatedDraft = { ...d, teamId: currentGame?.awayTeamId || null, playerId: newPlr };
                                          // Position is whatever it was already set to (defaulting to chaser the
                                          // first time), never guessed from the newly-picked player's history —
                                          // changing who's subbing in shouldn't silently change the position too.
                                          if (d.type === 'sub_in' && !updatedDraft.position) {
                                            updatedDraft.position = 'chaser';
                                          }
                                          return updatedDraft;
                                        }));
                                      }}
                                      className={`flex-1 w-0 text-[10px] border rounded p-1.5 shadow-sm ${draft.teamId === currentGame?.awayTeamId ? 'bg-white border-gray-300' : 'bg-red-50 border-red-300 text-red-600 font-bold'}`}
                                    >
                                      <option value="" disabled>⚠ Away Team - Select Player</option>
                                      <option value="TEAM_ONLY" className="font-bold text-gray-500">- {teams.find(t => t.id === currentGame?.awayTeamId)?.nickname || teams.find(t => t.id === currentGame?.awayTeamId)?.name || 'Team'} / No Player -</option>
                                      {awayRosterPlayers
                                        .filter(rp => {
                                          if (draft.type === 'sub_in') return !activePlayerPositions.has(rp.playerId);
                                          if (draft.type === 'sub_out') return activePlayerPositions.has(rp.playerId);
                                          return true;
                                        })
                                        .sort((a, b) => {
                                          if (draft.type === 'sub_in') {
                                            return (a.player?.lastName || '').localeCompare(b.player?.lastName || '');
                                          }
                                          const aActive = activePlayerPositions.has(a.playerId);
                                          const bActive = activePlayerPositions.has(b.playerId);
                                          if (aActive !== bActive) return aActive ? -1 : 1;
                                          if (aActive) {
                                            const posA = activePlayerPositions.get(a.playerId) || 'chaser';
                                            const posB = activePlayerPositions.get(b.playerId) || 'chaser';
                                            const order = { chaser: 1, keeper: 2, beater: 3, seeker: 4 } as Record<string, number>;
                                            return order[posA] - order[posB];
                                          }
                                          return (a.player?.lastName || '').localeCompare(b.player?.lastName || '');
                                        })
                                        .map(rp => (
                                          <option key={rp.playerId} value={rp.playerId}>
                                            {draft.type !== 'sub_in' ? `[${(activePlayerPositions.get(rp.playerId) || 'off').substring(0, 1).toUpperCase()}] ` : ''}
                                            {getPlayerShortName(rp.player, awayRosterPlayers)}
                                          </option>
                                        ))}
                                    </select>
                                  </div>
                                ) : (
                                  <div className="w-full text-center text-[10px] border border-gray-200 rounded p-1.5 bg-gray-50 text-gray-600 font-bold flex items-center justify-center gap-1.5 uppercase tracking-tight shadow-sm">
                                    {EVENT_CONFIG[draft.type as EventType] ? React.cloneElement(EVENT_CONFIG[draft.type as EventType].icon as React.ReactElement<any>, { className: 'w-3 h-3' }) : null}
                                    {EVENT_CONFIG[draft.type as EventType]?.label || 'Event'}
                                  </div>
                                )}

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

                                    {draft.type === 'card' && (
                                      <div className="col-span-2 flex flex-col gap-1.5 mt-1">
                                        <div className="flex rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                                          {(['blue', 'yellow', 'red'] as const).map(c => (
                                            <button
                                              key={c}
                                              type="button"
                                              onClick={() => setDraftEvents(prev => prev.map(d => d.id === draft.id ? { ...d, color: c } : d))}
                                              className={cn(
                                                "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-tight capitalize transition-all",
                                                draft.color === c
                                                  ? c === 'blue' ? 'bg-blue-500 text-white' : c === 'yellow' ? 'bg-yellow-400 text-yellow-900' : 'bg-red-500 text-white'
                                                  : 'bg-white text-gray-500 hover:bg-gray-50'
                                              )}
                                            >
                                              {c} Card
                                            </button>
                                          ))}
                                        </div>

                                        {draft.playerId && activePlayerPositions.get(draft.playerId) === 'keeper' && (
                                          <div className="flex flex-col gap-1 p-2 border border-indigo-200 bg-indigo-50 rounded-lg">
                                            <span className="text-[9px] uppercase font-bold text-indigo-600 tracking-wider">Keeper Swap (optional)</span>
                                            <select
                                              value={draft.swapPlayerId || ''}
                                              onChange={(e) => setDraftEvents(prev => prev.map(d => d.id === draft.id ? { ...d, swapPlayerId: e.target.value || null } : d))}
                                              className="text-xs border border-indigo-200 rounded p-1.5 bg-white text-indigo-800"
                                            >
                                              <option value="">No swap</option>
                                              {draft.teamId && (draft.teamId === currentGame?.homeTeamId ? homeRosterPlayers : awayRosterPlayers)
                                                .filter(rp => rp.playerId !== draft.playerId && activePlayerPositions.has(rp.playerId))
                                                .sort((a, b) => (a.player?.lastName || '').localeCompare(b.player?.lastName || ''))
                                                .map(rp => (
                                                  <option key={rp.playerId} value={rp.playerId}>
                                                    Swap in [{(activePlayerPositions.get(rp.playerId) || 'chaser').substring(0, 1).toUpperCase()}] {getPlayerShortName(rp.player, draft.teamId === currentGame?.homeTeamId ? homeRosterPlayers : awayRosterPlayers)}
                                                  </option>
                                                ))}
                                            </select>
                                          </div>
                                        )}
                                      </div>
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
                                          .filter(rp => rp.playerId !== draft.playerId)
                                          .sort((a, b) => {
                                            const aActive = activePlayerPositions.has(a.playerId);
                                            const bActive = activePlayerPositions.has(b.playerId);
                                            if (aActive !== bActive) return aActive ? -1 : 1;
                                            if (aActive) {
                                              const posA = activePlayerPositions.get(a.playerId) || 'chaser';
                                              const posB = activePlayerPositions.get(b.playerId) || 'chaser';
                                              const order = { chaser: 1, keeper: 2, beater: 3, seeker: 4 } as Record<string, number>;
                                              return order[posA] - order[posB];
                                            }
                                            return (a.player?.lastName || '').localeCompare(b.player?.lastName || '');
                                          })
                                          .map(rp => (
                                            <option key={rp.playerId} value={rp.playerId}>
                                              Assist - [{(activePlayerPositions.get(rp.playerId) || 'off').substring(0, 1).toUpperCase()}] {getPlayerShortName(rp.player, draft.teamId === currentGame?.homeTeamId ? homeRosterPlayers : awayRosterPlayers)}
                                            </option>
                                          ))}
                                      </select>
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

                  <div data-tour="rosters-panel" className={cn(isExpandedLayout ? "flex flex-col h-full relative" : "absolute inset-0", (rightPanelTab === 'rosters' || isExpandedLayout) ? "block" : "hidden", "overflow-y-auto custom-scrollbar p-4 space-y-8 bg-gray-50")}>
                    {(rightPanelTab === 'rosters' || isExpandedLayout) && (() => {
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

                      const isAuthToRecord = !!(user && (canModerate || (currentVideo as any)?.authorId === user.uid));
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
                                                    <button onClick={(e) => { e.stopPropagation(); handleCreateDraftEvent('miss_ko', rp.teamId, rp.playerId, null, null, Math.max(0, (player ? (function(){try{return player.getCurrentTime()}catch(e){return 0}})() : 0) + popupTimeOffset)); setSelectedPlayerId(null); }} className="flex-1 py-1 bg-slate-800 hover:bg-fuchsia-900/40 text-fuchsia-400 rounded-lg font-bold text-[8px] border border-slate-700 transition-colors">MISS (KO)</button>
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

                  <div data-tour="momentum-panel" className={cn(isExpandedLayout ? "flex flex-col h-full relative" : "absolute inset-0", (rightPanelTab === 'momentum' || isExpandedLayout) ? "block" : "hidden", "overflow-y-auto custom-scrollbar bg-white")}>
                    {(rightPanelTab === 'momentum' || isExpandedLayout) && <MatchMomentumView events={enrichedEvents} teams={teams} homeTeamId={currentGame?.homeTeamId || ''} awayTeamId={currentGame?.awayTeamId || ''} currentTime={player?.getCurrentTime() || 0} onSeek={(t) => player?.seekTo(t, true)} />}
                  </div>
                </div>

                <div data-tour="switch-video" className="px-3 py-2 bg-white border-t border-gray-200 shrink-0">
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

      {/* Global Command Palette (Cmd+K) */}
      {view === 'tracker' && currentVideo && (
        <TutorialOverlay steps={TRACKER_STEPS} {...trackerTutorial.tourProps} />
      )}

      {view === 'create' && canUseCreateTools && (
        <TutorialOverlay steps={CREATE_STEPS} {...createTutorial.tourProps} />
      )}

      {isCommandPaletteOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity" onClick={() => setIsCommandPaletteOpen(false)} />
          
          <div className="relative w-full max-w-lg bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md flex flex-col max-h-[50vh]">
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800">
              <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.602 10.602z" />
              </svg>
              <input
                type="text"
                autoFocus
                value={commandPaletteQuery}
                onChange={(e) => {
                  setCommandPaletteQuery(e.target.value);
                  setCommandPaletteSelectedIndex(0);
                }}
                placeholder="Search players, teams, or matches..."
                className="w-full bg-transparent text-white placeholder-slate-500 border-none outline-none focus:outline-none focus:ring-0 text-sm font-medium"
              />
              <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2 py-1 rounded-lg select-none">
                ESC
              </span>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              {commandPaletteResults.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 px-3 py-1.5 select-none">
                    Search Results ({commandPaletteResults.length})
                  </span>
                  {commandPaletteResults.map((item, idx) => {
                    const isSelected = idx === commandPaletteSelectedIndex;
                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        onClick={() => handleSelectCommandPaletteItem(item)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left",
                          isSelected
                            ? "bg-emerald-600/90 text-white font-medium shadow-md shadow-emerald-700/15 scale-[1.01]"
                            : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                        )}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className={cn("text-xs font-semibold truncate", isSelected ? "text-white" : "text-slate-200")}>
                            {item.title}
                          </span>
                          <span className={cn("text-[10px] truncate", isSelected ? "text-emerald-100" : "text-slate-500")}>
                            {item.subtitle}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-4">
                          <span className={cn(
                            "text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-md tracking-wider border select-none",
                            isSelected
                              ? "bg-emerald-700/80 border-emerald-500 text-emerald-50"
                              : "bg-slate-800/60 border-slate-700 text-slate-400"
                          )}>
                            {item.type}
                          </span>
                          {isSelected && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center select-none">
                  <div className="bg-slate-800/40 border border-slate-800 p-2.5 rounded-2xl mb-2.5 text-slate-500">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.602 10.602z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-slate-400">
                    {commandPaletteQuery.trim() ? "No matches found" : "Type to search..."}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1 max-w-[240px]">
                    {commandPaletteQuery.trim() 
                      ? "Check your spelling or search for something else"
                      : "Quickly jump to any player profile, team roster, or game stats"}
                  </span>
                </div>
              )}
            </div>
            
            {/* Help Footer */}
            <div className="px-4 py-2 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between text-[9px] text-slate-500 select-none">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="bg-slate-800 px-1 py-0.5 rounded border border-slate-700">↑↓</span> Navigate
                </span>
                <span className="flex items-center gap-1">
                  <span className="bg-slate-800 px-1 py-0.5 rounded border border-slate-700">Enter</span> Select
                </span>
              </div>
              <span>Command Palette</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
