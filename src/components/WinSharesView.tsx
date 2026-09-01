import React, { useState, useMemo, useEffect } from 'react';
import { Info, AlertTriangle } from 'lucide-react';
import { computeWinShares, type PlayerWinShares, type TeamWinShares } from '../lib/winShares';

interface Player { id: string; firstName: string; lastName: string; preferredName?: string; nickname?: string; [k: string]: any; }
interface GameEvent { id: string; videoId: string; gameId: string; type: string; videoTime: number; status: string; playerId?: string; teamId?: string; [k: string]: any; }
interface Team { id: string; name: string; [k: string]: any; }
interface Game { id: string; seasonId: string; homeTeamId: string; awayTeamId: string; [k: string]: any; }
interface Season { id: string; name: string; [k: string]: any; }

import {
  cn, SortDir, sortBy, SortHeader, Cell,
  StatsTabSelector, StatsTabButton, StatsPaginationFooter,
} from './ui/StatsTable';

type Tab = 'leaders' | 'production' | 'team';
type UnitFilter = 'all' | 'quadball' | 'beater' | 'seeker';

const UNIT_LABELS: Record<string, string> = {
  quadball: 'C/K',
  beater: 'BTR',
  seeker: 'SKR',
  hybrid: 'HYB',
};

const UNIT_STYLES: Record<string, string> = {
  quadball: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  beater: 'bg-neutral-100 text-neutral-700 border-neutral-300',
  seeker: 'bg-yellow-50 text-yellow-700 border-yellow-300',
  hybrid: 'bg-blue-50 text-blue-700 border-blue-200',
};

interface WinSharesViewProps {
  players: Player[];
  events: GameEvent[];
  teams: Team[];
  games: Game[];
  seasons: Season[];
  statsFilter?: 'public' | 'full';
  teamIds?: string[];
  search?: string;
  minGames?: number;
  /** Situational filters are surfaced only to warn that Win Shares ignores them. */
  bludgerControlMode?: 'all' | 'separate';
  flagFilter?: 'all' | 'on' | 'off';
  onPlayerSelect?: (playerId: string) => void;
  onTeamSelect?: (teamId: string) => void;
}

const signed = (v: number) => (v > 0 ? `+${v}` : v === 0 ? '0' : `${v}`);

export default function WinSharesView({
  players, events, teams, games,
  teamIds: teamFilterIds = [], search = '', minGames = 1,
  bludgerControlMode = 'all', flagFilter = 'all',
  onPlayerSelect, onTeamSelect,
}: WinSharesViewProps) {
  const [tab, setTab] = useState<Tab>('leaders');
  const [unit, setUnit] = useState<UnitFilter>('all');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('ws');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showHelp, setShowHelp] = useState(false);
  const perPage = 25;

  useEffect(() => { setPage(1); }, [search, teamFilterIds, minGames, unit, tab]);

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  // Win Shares is a whole-game accounting metric, so it takes the team filter (which selects
  // whole games) but never the situational ones — a control-only slice doesn't add up to a win.
  const filters = useMemo(() => ({
    teamId: teamFilterIds.length === 1 ? teamFilterIds[0] : undefined,
    teamIds: teamFilterIds.length > 0 ? teamFilterIds : undefined,
  }), [teamFilterIds]);

  const result = useMemo(
    () => computeWinShares(events as any, players as any, teams as any, games as any, filters),
    [events, players, teams, games, filters]
  );

  const { baselines } = result;
  const situationalIgnored = bludgerControlMode === 'separate' || flagFilter !== 'all';

  const unitPlayers = useMemo(() => {
    const base = result.players.filter(p => p.gamesPlayed >= minGames);
    if (unit === 'all') return base;
    // A hybrid shows up under whichever units they actually logged minutes in.
    return base.filter(p =>
      p.unit === unit ||
      (p.unit === 'hybrid' && (
        (unit === 'quadball' && p.quadballMinutes > 0) ||
        (unit === 'beater' && p.beaterMinutes > 0) ||
        (unit === 'seeker' && p.seekerMinutes > 0)
      ))
    );
  }, [result.players, minGames, unit]);

  // Ranks come from the un-searched list, so typing a name doesn't renumber the leaderboard.
  const sortedPlayers = useMemo(
    () => sortBy(unitPlayers, sortKey as keyof PlayerWinShares, sortDir),
    [unitPlayers, sortKey, sortDir]
  );
  const sortedTeams = useMemo(
    () => sortBy(result.teams.filter(t => t.gamesPlayed >= minGames), sortKey as keyof TeamWinShares, sortDir),
    [result.teams, minGames, sortKey, sortDir]
  );

  const playerRankMap = useMemo(() => new Map(sortedPlayers.map((s, i) => [s.playerId, i + 1])), [sortedPlayers]);
  const teamRankMap = useMemo(() => new Map(sortedTeams.map((s, i) => [s.teamId, i + 1])), [sortedTeams]);

  const filteredPlayers = useMemo(() => {
    if (!search) return sortedPlayers;
    const q = search.toLowerCase();
    return sortedPlayers.filter(s => s.playerName.toLowerCase().includes(q));
  }, [sortedPlayers, search]);

  const filteredTeams = useMemo(() => {
    if (!search) return sortedTeams;
    const q = search.toLowerCase();
    return sortedTeams.filter(s => s.teamName.toLowerCase().includes(q));
  }, [sortedTeams, search]);

  const isTeamTab = tab === 'team';
  const data: any[] = isTeamTab ? filteredTeams : filteredPlayers;
  const rankMap = isTeamTab ? teamRankMap : playerRankMap;
  const totalPages = Math.ceil(data.length / perPage) || 1;
  const paged = data.slice((page - 1) * perPage, page * perPage);

  const totalWins = result.teams.reduce((s, t) => s + t.wins, 0);
  const totalWS = result.teams.reduce((s, t) => s + t.teamWinShares, 0);

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-gray-900">Win Shares</h2>
          <div className="flex text-xs text-slate-500 gap-3 font-mono">
            <span>{baselines.games} games</span>
            <span>{totalWins}W inferred</span>
            <span>{totalWS.toFixed(1)} WS</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatsTabSelector>
            <StatsTabButton isFirst active={tab === 'leaders'} onClick={() => { setTab('leaders'); setSortKey('ws'); setSortDir('desc'); }} label="Leaders" activeClass="bg-indigo-600 text-white" />
            <StatsTabButton active={tab === 'production'} onClick={() => { setTab('production'); setSortKey('marginalOffense'); setSortDir('desc'); }} label="Production" activeClass="bg-indigo-600 text-white" />
            <StatsTabButton active={tab === 'team'} onClick={() => { setTab('team'); setSortKey('teamWinShares'); setSortDir('desc'); }} label="Team" activeClass="bg-indigo-600 text-white" />
          </StatsTabSelector>
          <button onClick={() => setShowHelp(!showHelp)} className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors ml-1 bg-white border border-gray-200 rounded-md" title="How Win Shares are calculated">
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Position group filter — WS/20 is only comparable within a unit, since a seeker
          swings 35 points in seven minutes and a chaser does not. */}
      {!isTeamTab && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Position group</span>
          <StatsTabSelector>
            <StatsTabButton isFirst active={unit === 'all'} onClick={() => setUnit('all')} label="All" activeClass="bg-indigo-600 text-white" />
            <StatsTabButton active={unit === 'quadball'} onClick={() => setUnit('quadball')} label="Chasers / Keepers" activeClass="bg-emerald-600 text-white" />
            <StatsTabButton active={unit === 'beater'} onClick={() => setUnit('beater')} label="Beaters" activeClass="bg-neutral-900 text-white" />
            <StatsTabButton active={unit === 'seeker'} onClick={() => setUnit('seeker')} label="Seekers" activeClass="bg-yellow-400 text-black" />
          </StatsTabSelector>
        </div>
      )}

      {/* Derived league constants — the whole metric hangs off these four numbers. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 bg-indigo-50/60 border border-indigo-100 rounded-lg px-3 py-2 text-[11px] text-indigo-900">
        <span className="font-semibold uppercase tracking-wider text-[10px] text-indigo-700">League baseline</span>
        <span title="Standard deviation of single-game point margins across the games in scope">σ margin <strong className="font-mono">{baselines.marginSigma}</strong></span>
        <span title="Marginal points per win = σ ÷ 0.3989, before each team's pace adjustment">pts / win <strong className="font-mono">{baselines.pointsPerWin}</strong></span>
        <span title="How far below league average a replacement-level player sits">replacement <strong className="font-mono">{(baselines.replacementFraction * 100).toFixed(1)}%</strong></span>
        <span title="League points scored per offensive possession (goals only)">pts / poss <strong className="font-mono">{baselines.pointsPerPossession}</strong></span>
        <span title="League points per team per game, flag included">pts / game <strong className="font-mono">{baselines.pointsPerGame}</strong></span>
        <span title="Expected flag points per flag opportunity">flag / opp <strong className="font-mono">{baselines.flagPointsPerOpportunity}</strong></span>
      </div>

      {(baselines.lowSample || situationalIgnored || result.excludedGames > 0) && (
        <div className="bg-amber-50/80 border border-amber-200/60 rounded-lg px-3 py-2 text-[11px] text-amber-900 space-y-1">
          {baselines.lowSample && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0 text-amber-500" />
              <span><strong>Thin sample.</strong> Only {baselines.games} fully-tracked game{baselines.games === 1 ? '' : 's'} in scope. Points per win is estimated from the spread of game margins, so with this few games every number below should be read as provisional.</span>
            </div>
          )}
          {result.excludedGames > 0 && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0 text-amber-500" />
              <span><strong>{result.excludedGames} game{result.excludedGames === 1 ? '' : 's'} excluded.</strong> Win Shares are minutes-weighted, so only games complete on <em>both</em> sides <em>with substitutions</em> can be used.</span>
            </div>
          )}
          {situationalIgnored && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0 text-amber-500" />
              <span><strong>Situational filters ignored.</strong> Win Shares divide up whole games — a bludger-control or flag-state slice of a game doesn't add back up to a win, so those filters don't apply here.</span>
            </div>
          )}
        </div>
      )}

      {showHelp && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-xs text-indigo-900 space-y-2">
          <p className="font-semibold">Win Shares — how many wins a player is responsible for</p>
          <p className="opacity-90">
            An adaptation of Basketball-Reference's Win Shares. A player earns credit for the points they
            produce and prevent <em>above what a replacement-level player would have</em> in the same role
            with the same workload, and those marginal points are converted into wins.
          </p>
          <ul className="list-disc pl-4 space-y-1 opacity-90">
            <li><strong>Wins are inferred.</strong> A goal is 10 points, a flag catch is 35, higher total wins. Only games tracked completely on both sides, substitutions included, are used.</li>
            <li><strong>Points per win</strong> is derived from the data rather than borrowed: with game margins spread by σ, each point of margin is worth φ(0)/σ of a win, so a win costs σ ÷ 0.3989 points. It is then pace-adjusted per team.</li>
            <li><strong>Replacement level</strong> follows from that. A replacement team is this far below average on both sides of the ball and wins about zero games — which is what makes a team's Win Shares total near its actual wins.</li>
            <li><strong>Chasers and keepers</strong> earn offense from points produced (goals, plus a 35% share of each assisted goal) against the possessions they used, and defense from goals conceded while on pitch.</li>
            <li><strong>Beaters</strong> have no box score, so both sides come from how the team scored and conceded while they were on pitch. They take 25% of quadball offense, 40% of quadball defense and 30% of the flag.</li>
            <li><strong>Seekers</strong> are credited the flag: 35 points for a catch, 35 charged for an opponent's catch on their watch, against the league's expected flag points per opportunity.</li>
          </ul>
          <ul className="list-disc pl-4 space-y-1 opacity-90">
            <li><strong>WS</strong> — Win Shares. Offensive plus defensive.</li>
            <li><strong>OWS / DWS</strong> — the offensive and defensive halves.</li>
            <li><strong>WS/20</strong> — Win Shares per 20 minutes of game clock. Only compare this <em>within</em> a position group: a seeker swings 35 points in seven minutes on pitch and a chaser never can.</li>
            <li><strong>mOFF / mDEF</strong> — marginal points produced and prevented above replacement. These are the numerators; dividing by points per win gives OWS and DWS.</li>
            <li><strong>PProd</strong> — estimated scoreboard points produced. <strong>POSS</strong> — possessions used, calibrated to the team's possession count.</li>
            <li><strong>xW</strong> — wins implied by point differential alone. <strong>±</strong> — team Win Shares minus actual wins; near zero means the replacement calibration is holding, and a large gap means the team won or lost more games than their margins deserved.</li>
          </ul>
        </div>
      )}

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-slate-600 sticky left-0 bg-gray-50 z-10 min-w-[140px]">
                  {isTeamTab ? 'Team' : 'Player'}
                </th>
                {tab === 'leaders' ? (<>
                  <SortHeader label="POS" sortKey="unit" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Position group where the player logged the most minutes" colorClass="text-indigo-600" />
                  <SortHeader label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" colorClass="text-indigo-600" />
                  <SortHeader label="MIN" sortKey="minutesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minutes Played" colorClass="text-indigo-600" />
                  <SortHeader label="OWS" sortKey="ows" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Offensive Win Shares" colorClass="text-indigo-600" />
                  <SortHeader label="DWS" sortKey="dws" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Defensive Win Shares" colorClass="text-indigo-600" />
                  <SortHeader label="WS" sortKey="ws" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Win Shares (OWS + DWS)" colorClass="text-indigo-600" />
                  <SortHeader label="WS/20" sortKey="wsPer20" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Win Shares per 20 minutes — compare within a position group only" colorClass="text-indigo-600" />
                  <SortHeader label="C/K" sortKey="quadballMinutes" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minutes as a chaser or keeper" colorClass="text-indigo-600" />
                  <SortHeader label="BTR" sortKey="beaterMinutes" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minutes as a beater" colorClass="text-indigo-600" />
                  <SortHeader label="SKR" sortKey="seekerMinutes" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minutes as a seeker" colorClass="text-indigo-600" />
                </>) : tab === 'production' ? (<>
                  <SortHeader label="POS" sortKey="unit" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Position group" colorClass="text-indigo-600" />
                  <SortHeader label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" colorClass="text-indigo-600" />
                  <SortHeader label="MIN" sortKey="minutesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minutes Played" colorClass="text-indigo-600" />
                  <SortHeader label="PProd" sortKey="pointsProduced" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Estimated scoreboard points produced" colorClass="text-indigo-600" />
                  <SortHeader label="POSS" sortKey="possessionsUsed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Possessions used, calibrated to the team's possession count" colorClass="text-indigo-600" />
                  <SortHeader label="mOFF" sortKey="marginalOffense" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Marginal offense — points produced above replacement" colorClass="text-indigo-600" />
                  <SortHeader label="mDEF" sortKey="marginalDefense" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Marginal defense — points prevented above replacement" colorClass="text-indigo-600" />
                  <SortHeader label="FC" sortKey="flagCatches" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Flag catches" colorClass="text-indigo-600" />
                  <SortHeader label="FCA" sortKey="flagCatchesAgainst" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Opponent flag catches while on pitch" colorClass="text-indigo-600" />
                  <SortHeader label="PPW" sortKey="pointsPerWin" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Pace-adjusted points per win used for this player's team" colorClass="text-indigo-600" />
                  <SortHeader label="WS" sortKey="ws" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Win Shares" colorClass="text-indigo-600" />
                </>) : (<>
                  <SortHeader label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" colorClass="text-indigo-600" />
                  <SortHeader label="W" sortKey="wins" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Wins, inferred from final score" colorClass="text-indigo-600" />
                  <SortHeader label="L" sortKey="losses" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Losses" colorClass="text-indigo-600" />
                  <SortHeader label="W%" sortKey="winPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Win percentage (ties count a half)" colorClass="text-indigo-600" />
                  <SortHeader label="PF" sortKey="pointsFor" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Points For" colorClass="text-indigo-600" />
                  <SortHeader label="PA" sortKey="pointsAgainst" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Points Against" colorClass="text-indigo-600" />
                  <SortHeader label="DIFF" sortKey="pointDiff" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Point differential" colorClass="text-indigo-600" />
                  <SortHeader label="M/G" sortKey="marginPerGame" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Average margin per game" colorClass="text-indigo-600" />
                  <SortHeader label="PACE" sortKey="pace" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Possessions per 20 minutes" colorClass="text-indigo-600" />
                  <SortHeader label="PPW" sortKey="pointsPerWin" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Pace-adjusted marginal points per win" colorClass="text-indigo-600" />
                  <SortHeader label="xW" sortKey="expectedWins" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Wins implied by point differential alone" colorClass="text-indigo-600" />
                  <SortHeader label="OWS" sortKey="ows" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Team Offensive Win Shares" colorClass="text-indigo-600" />
                  <SortHeader label="DWS" sortKey="dws" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Team Defensive Win Shares" colorClass="text-indigo-600" />
                  <SortHeader label="WS" sortKey="teamWinShares" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Sum of this team's players' Win Shares" colorClass="text-indigo-600" />
                  <SortHeader label="±" sortKey="calibration" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Team Win Shares minus actual wins — the calibration check" colorClass="text-indigo-600" />
                </>)}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={16} className="py-8 text-center text-slate-500 text-xs">
                  {baselines.games === 0
                    ? 'No fully-tracked games in scope. Win Shares need both teams complete with substitutions.'
                    : 'No players match these filters'}
                </td></tr>
              ) : paged.map((row: any) => {
                const rank = rankMap.get(isTeamTab ? row.teamId : row.playerId) ?? '-';
                return (
                  <tr key={isTeamTab ? row.teamId : row.playerId} className="border-b border-gray-50 hover:bg-indigo-50/30 transition-colors">
                    <td className="px-2 py-1.5 sticky left-0 bg-white z-10">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 w-4 text-right font-mono">{rank}</span>
                        {isTeamTab ? (
                          <button onClick={() => onTeamSelect?.(row.teamId)} className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline truncate">
                            {row.teamName}
                          </button>
                        ) : (
                          <div className="flex flex-col min-w-0">
                            <button onClick={() => onPlayerSelect?.(row.playerId)} className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline truncate text-left">
                              {row.firstName} {row.lastName}
                            </button>
                            <span className="text-[10px] text-slate-400 truncate">{row.teamName}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    {tab === 'leaders' ? (<>
                      <td className="px-2 py-1.5 text-center">
                        <span className={cn('inline-block px-1.5 py-0.5 rounded border text-[9px] font-bold tracking-wide', UNIT_STYLES[row.unit])}>
                          {UNIT_LABELS[row.unit]}
                        </span>
                      </td>
                      <Cell value={row.gamesPlayed} />
                      <Cell value={row.minutesPlayed} />
                      <Cell value={row.ows} />
                      <Cell value={row.dws} />
                      <Cell value={row.ws} bold highlight={row.ws > 0 ? 'pos' : row.ws < 0 ? 'neg' : undefined} />
                      <Cell value={row.wsPer20.toFixed(3)} bold />
                      <Cell value={row.quadballMinutes || '—'} />
                      <Cell value={row.beaterMinutes || '—'} />
                      <Cell value={row.seekerMinutes || '—'} />
                    </>) : tab === 'production' ? (<>
                      <td className="px-2 py-1.5 text-center">
                        <span className={cn('inline-block px-1.5 py-0.5 rounded border text-[9px] font-bold tracking-wide', UNIT_STYLES[row.unit])}>
                          {UNIT_LABELS[row.unit]}
                        </span>
                      </td>
                      <Cell value={row.gamesPlayed} />
                      <Cell value={row.minutesPlayed} />
                      <Cell value={row.pointsProduced} />
                      <Cell value={row.possessionsUsed} />
                      <Cell value={signed(row.marginalOffense)} highlight={row.marginalOffense > 0 ? 'pos' : row.marginalOffense < 0 ? 'neg' : undefined} />
                      <Cell value={signed(row.marginalDefense)} highlight={row.marginalDefense > 0 ? 'pos' : row.marginalDefense < 0 ? 'neg' : undefined} />
                      <Cell value={row.flagCatches || '—'} />
                      <Cell value={row.flagCatchesAgainst || '—'} />
                      <Cell value={row.pointsPerWin} />
                      <Cell value={row.ws} bold />
                    </>) : (<>
                      <Cell value={row.gamesPlayed} />
                      <Cell value={row.wins} bold />
                      <Cell value={row.losses} />
                      <Cell value={row.winPct.toFixed(3)} />
                      <Cell value={row.pointsFor} />
                      <Cell value={row.pointsAgainst} />
                      <Cell value={signed(row.pointDiff)} highlight={row.pointDiff > 0 ? 'pos' : row.pointDiff < 0 ? 'neg' : undefined} />
                      <Cell value={signed(row.marginPerGame)} />
                      <Cell value={row.pace} />
                      <Cell value={row.pointsPerWin} />
                      <Cell value={row.expectedWins} />
                      <Cell value={row.ows} />
                      <Cell value={row.dws} />
                      <Cell value={row.teamWinShares} bold />
                      {/* Left uncoloured on purpose: elsewhere in these tables green means
                          "good team", and a large ± means neither good nor bad — only that
                          the record and the margins disagree. */}
                      <Cell value={signed(row.calibration)} />
                    </>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <StatsPaginationFooter
        itemCount={data.length}
        itemName={isTeamTab ? 'teams' : 'players'}
        legend={isTeamTab
          ? 'xW = wins implied by point differential • ± = team Win Shares minus actual wins'
          : 'WS = win shares • OWS/DWS = offensive/defensive • WS/20 = per 20 minutes, comparable within a position group only'}
        page={page}
        totalPages={totalPages}
        setPage={setPage}
      />
    </div>
  );
}
