import React, { useCallback, useMemo, useState } from 'react';
import { collection, collectionGroup, getDocs, query, where, limit } from 'firebase/firestore';
import { toast } from 'sonner';
import { RefreshCw, ShieldAlert, MessageSquareWarning, Inbox, PlayCircle, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { db } from '../lib/firebase';
import { cn } from '../lib/utils';

interface GameEvent {
  id: string;
  gameId?: string;
  type?: string;
  status?: string;
  createdAt?: any;
  lastVoteAt?: any;
  downvotes?: number;
  downvoterIds?: string[];
  [k: string]: any;
}
interface SuggestionDoc { gameId: string; status?: string; createdAt?: any; [k: string]: any; }
interface Team { id: string; name: string; nickname?: string; [k: string]: any; }
interface Game { id: string; homeTeamId: string; awayTeamId: string; date?: string; tag?: string; seasonId?: string; [k: string]: any; }
interface Season { id: string; name?: string; year?: string; division?: string; [k: string]: any; }

interface RecentEventsViewProps {
  games: Game[];
  teams: Team[];
  seasons?: Season[];
  onOpenGame: (gameId: string) => void;
}

interface GameActivity {
  gameId: string;
  newStats: number;
  unverified: number;
  contested: number;
  openSuggestions: number;
  lastAt: number;
}

const WINDOW_OPTIONS = [3, 5, 14, 30];
const DEFAULT_WINDOW_DAYS = 5;
// Read-quota backstop for the open-suggestions query. A moderator queue realistically never
// approaches this; if it ever does, that's itself worth knowing about, so the count context
// says "500+" rather than silently under-reporting.
const SUGGESTION_QUERY_LIMIT = 500;

// Events (and suggestions written by the same client code) carry `createdAt: new
// Date().toISOString()`, but rows written by the migration scripts can carry a Firestore
// Timestamp, a Date, or an epoch number instead.
function parseCreatedAt(value: any): number | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === 'function') {
    try { return value.toDate().getTime(); } catch { return null; }
  }
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return null;
}

function formatAgo(then: number, now: number): string {
  const mins = Math.max(0, Math.round((now - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function RecentEventsView({ games, teams, seasons = [], onOpenGame }: RecentEventsViewProps) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<(GameEvent & { _gameId: string })[]>([]);
  const [openSuggestions, setOpenSuggestions] = useState<SuggestionDoc[]>([]);
  const [suggestionCountCapped, setSuggestionCountCapped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [windowDays, setWindowDays] = useState<number>(DEFAULT_WINDOW_DAYS);

  // There is no way to query a timestamp that lives inside an array field, so the whole
  // gameEvents collection has to come down and get filtered here — that's the events and
  // votes signal. Suggestions are real documents, so they get a proper indexed
  // collectionGroup query instead of a full download. Both are heavy-ish reads for a page
  // most people open to read the docs, so nothing is fetched until it's expanded.
  const loadActivity = useCallback(async () => {
    setLoading(true);
    try {
      const [gameEventsSnap, suggestionsSnap] = await Promise.all([
        getDocs(collection(db, 'gameEvents')),
        getDocs(query(collectionGroup(db, 'suggestions'), where('status', '==', 'open'), limit(SUGGESTION_QUERY_LIMIT))),
      ]);

      const flat: (GameEvent & { _gameId: string })[] = [];
      gameEventsSnap.docs.forEach(d => {
        const docEvents = (d.data().events || []) as GameEvent[];
        docEvents.forEach(ev => flat.push({ ...ev, _gameId: ev.gameId || d.id }));
      });
      setEvents(flat);

      setOpenSuggestions(suggestionsSnap.docs.map(d => d.data() as SuggestionDoc));
      setSuggestionCountCapped(suggestionsSnap.size >= SUGGESTION_QUERY_LIMIT);

      setLoadedAt(Date.now());
    } catch (e: any) {
      toast.error('Failed to load recent activity: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && loadedAt === null && !loading) loadActivity();
  };

  const activity = useMemo<GameActivity[]>(() => {
    if (!loadedAt) return [];
    const cutoff = loadedAt - windowDays * 24 * 60 * 60 * 1000;
    const byGame = new Map<string, GameActivity>();

    const entryFor = (gameId: string) => {
      let entry = byGame.get(gameId);
      if (!entry) {
        entry = { gameId, newStats: 0, unverified: 0, contested: 0, openSuggestions: 0, lastAt: 0 };
        byGame.set(gameId, entry);
      }
      return entry;
    };

    for (const ev of events) {
      const created = parseCreatedAt(ev.createdAt);
      const voted = parseCreatedAt(ev.lastVoteAt);
      const mostRecent = Math.max(created ?? 0, voted ?? 0);
      if (mostRecent === 0 || mostRecent < cutoff) continue;

      const entry = entryFor(ev._gameId);
      if (created !== null && created >= cutoff) {
        entry.newStats++;
        if (ev.status !== 'verified') entry.unverified++;
      }
      if ((ev.downvotes || ev.downvoterIds?.length || 0) > 0) entry.contested++;
      if (mostRecent > entry.lastAt) entry.lastAt = mostRecent;
    }

    for (const s of openSuggestions) {
      const created = parseCreatedAt(s.createdAt);
      if (created === null || created < cutoff || !s.gameId) continue;
      const entry = entryFor(s.gameId);
      entry.openSuggestions++;
      if (created > entry.lastAt) entry.lastAt = created;
    }

    return Array.from(byGame.values())
      .filter(a => a.lastAt > 0)
      .sort((a, b) => b.lastAt - a.lastAt);
  }, [events, openSuggestions, windowDays, loadedAt]);

  const totalNewStats = useMemo(() => activity.reduce((sum, a) => sum + a.newStats, 0), [activity]);

  const describeGame = (gameId: string) => {
    const game = games.find(g => g.id === gameId);
    if (!game) return { title: gameId, subtitle: 'Game not found in the games registry' };

    const homeTeam = teams.find(t => t.id === game.homeTeamId);
    const awayTeam = teams.find(t => t.id === game.awayTeamId);
    const title = `${homeTeam?.name || 'Unknown Home'} vs ${awayTeam?.name || 'Unknown Away'}`;

    const season = seasons.find(s => s.id === game.seasonId);
    const seasonLabel = season
      ? [season.name, season.division, season.year].filter(Boolean).join(' ')
      : '';
    const subtitle = [game.date, seasonLabel, game.tag].filter(Boolean).join(' · ') || gameId;

    return { title, subtitle };
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-600/20 rounded-2xl flex items-center justify-center shrink-0">
              <Activity className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Recent Activity</h3>
              <p className="text-gray-500 text-sm">
                Games with new stats, votes, or suggested fixes recently. Open one to review
                against the video.
              </p>
            </div>
          </div>

          <button
            onClick={handleToggle}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors"
          >
            {expanded
              ? <><ChevronUp className="w-4 h-4" /> Hide</>
              : <><ChevronDown className="w-4 h-4" /> Show recent activity</>}
          </button>
        </div>

        {expanded && (
          <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-5 border-t border-gray-200">
            <p className="text-xs text-gray-400 font-medium">
              {loading || !loadedAt
                ? `Last ${windowDays} days`
                : `${activity.length} game${activity.length === 1 ? '' : 's'} · ${totalNewStats.toLocaleString()} new stat${totalNewStats === 1 ? '' : 's'} in the last ${windowDays} days`}
              {suggestionCountCapped && ' · showing the first 500 open suggestions'}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex bg-white p-1 rounded-xl border border-gray-200">
                {WINDOW_OPTIONS.map(days => (
                  <button
                    key={days}
                    onClick={() => setWindowDays(days)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                      windowDays === days ? 'bg-red-600 text-white shadow' : 'text-gray-500 hover:text-gray-900'
                    )}
                  >
                    {days}d
                  </button>
                ))}
              </div>
              <button
                onClick={loadActivity}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold rounded-xl text-xs transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Refresh
              </button>
            </div>
          </div>
        )}
      </div>

      {expanded && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-gray-400 text-sm">Loading activity…</div>
          ) : activity.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">
              No stats, votes, or suggestions in the last {windowDays} days.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    <th className="px-6 py-3">Game</th>
                    <th className="px-6 py-3 text-right">New Stats</th>
                    <th className="px-6 py-3 text-right">Unverified</th>
                    <th className="px-6 py-3 text-right">Contested</th>
                    <th className="px-6 py-3 text-right">Suggestions</th>
                    <th className="px-6 py-3 text-right">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activity.map(row => {
                    const { title, subtitle } = describeGame(row.gameId);
                    return (
                      <tr key={row.gameId} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-gray-900">{title}</p>
                          <p className="text-xs text-gray-500 truncate max-w-[420px]">{subtitle}</p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="font-bold text-gray-900">{row.newStats.toLocaleString()}</p>
                          {/* The list is ordered by the most recent activity of any kind, so
                              that timestamp has to be legible somewhere. */}
                          <p className="text-[10px] text-gray-400 font-medium">
                            {formatAgo(row.lastAt, loadedAt || row.lastAt)}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {row.unverified > 0 ? (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                              <ShieldAlert className="w-3.5 h-3.5" /> {row.unverified.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {row.contested > 0 ? (
                            <span className="inline-flex items-center gap-1 font-bold text-red-500">
                              <MessageSquareWarning className="w-3.5 h-3.5" /> {row.contested.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {row.openSuggestions > 0 ? (
                            <span className="inline-flex items-center gap-1 font-bold text-blue-600">
                              <Inbox className="w-3.5 h-3.5" /> {row.openSuggestions.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => onOpenGame(row.gameId)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors"
                          >
                            <PlayCircle className="w-4 h-4" /> Open
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
