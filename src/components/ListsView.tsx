import React, { useState, useMemo } from 'react';
import { Search, Info, Lock } from 'lucide-react';
import {
  computeBeaterActivityStats,
  classifyBeaterArchetypes,
  BeaterArchetypeStats,
  computeExtendedStats,
  computeQuadballArchetypeRankings,
  QUADBALL_ARCHETYPE_DEFS,
  QuadballArchetype,
  QuadballArchetypeStats
} from '../lib/statsComputations';
import {
  cn, SortDir, sortBy, SortHeader, Cell,
  StatsTabSelector, StatsTabButton
} from './ui/StatsTable';

interface Player { id: string; firstName: string; lastName: string; preferredName?: string; nickname?: string; [k: string]: any; }
interface GameEvent { id: string; videoId: string; gameId: string; type: string; videoTime: number; status: string; playerId?: string; teamId?: string; [k: string]: any; }
interface Team { id: string; name: string; [k: string]: any; }
interface Game { id: string; isVerified?: boolean; seasonId: string; homeTeamId: string; awayTeamId: string; [k: string]: any; }
interface Season { id: string; name: string; [k: string]: any; }

interface ListsViewProps {
  players: Player[];
  events: GameEvent[];
  teams: Team[];
  games: Game[];
  seasons: Season[];
  statsFilter?: 'public' | 'full';
  onPlayerSelect?: (playerId: string) => void;
  onBack?: () => void;
}

type GroupKey = 'beater' | 'quadball';
type BeaterListKey = 'aggressive' | 'control';

// Players who are only ever tagged as beater/seeker (never chaser/keeper) shouldn't
// clutter the quadball archetype lists. Mirrors the logic QuadballStatsView uses.
function getQuadballOnlyPlayerIds(events: GameEvent[], players: Player[]): Set<string> {
  const explicitPositions = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.playerId) continue;
    if (!explicitPositions.has(e.playerId)) explicitPositions.set(e.playerId, new Set());
    const pSet = explicitPositions.get(e.playerId)!;
    if (e.position) pSet.add(e.position);
    const t = (e.type || '').toLowerCase();
    if (t === 'goal' || t === 'assist' || t === 'shot' || t === 'attempt') pSet.add('chaser');
    if (t.includes('beater') || t.includes('dodgeball')) pSet.add('beater');
    if (t === 'flag_catch') pSet.add('seeker');
  }
  const validIds = new Set<string>();
  players.forEach(p => {
    const poss = explicitPositions.get(p.id);
    if (!poss || poss.size === 0) validIds.add(p.id);
    else if (poss.has('chaser') || poss.has('keeper')) validIds.add(p.id);
    else if (!poss.has('beater') && !poss.has('seeker')) validIds.add(p.id);
  });
  return validIds;
}

export default function ListsView({
  players, events, teams, games, seasons, statsFilter = 'public',
  onPlayerSelect, onBack
}: ListsViewProps) {
  const [groupKey, setGroupKey] = useState<GroupKey>('beater');
  const [search, setSearch] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const filters = useMemo(() => ({
    skipRapm: false
  }), [statsFilter]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-16">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-gray-400" />
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Lists</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1 max-w-xl">
            Hidden / experimental page — not linked anywhere in the nav, only reachable by URL.
            Statistical archetype lists derived from playstyle stats.
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mt-1">
            Verified &amp; complete games only — regardless of the Stats page filter
          </p>
        </div>
        {onBack && (
          <button onClick={onBack} className="text-xs font-medium text-gray-400 hover:text-gray-700 underline">
            &larr; Back
          </button>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <StatsTabSelector>
          <StatsTabButton isFirst active={groupKey === 'beater'} onClick={() => setGroupKey('beater')} label="Beater Archetypes" activeClass="bg-neutral-900 text-white" />
          <StatsTabButton active={groupKey === 'quadball'} onClick={() => setGroupKey('quadball')} label="Quadball Archetypes" activeClass="bg-emerald-600 text-white" />
        </StatsTabSelector>
        <div className="relative flex-1 min-w-[160px] max-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
          <input
            type="text" placeholder="Search a player..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs font-medium outline-none bg-white text-gray-700 border border-gray-200 hover:border-gray-300 focus:ring-1 focus:ring-red-500/50 focus:border-red-500/50"
          />
        </div>
      </div>

      {groupKey === 'beater' ? (
        <BeaterArchetypeSection
          players={players} events={events} games={games} filters={filters} search={search}
          onPlayerSelect={onPlayerSelect} showHelp={showHelp} setShowHelp={setShowHelp}
        />
      ) : (
        <QuadballArchetypeSection
          players={players} events={events} games={games} filters={filters} search={search}
          onPlayerSelect={onPlayerSelect} showHelp={showHelp} setShowHelp={setShowHelp}
        />
      )}
    </div>
  );
}

// ─── Beater Archetypes ──────────────────────────────────────────────

function BeaterArchetypeSection({
  players, events, games, filters, search, onPlayerSelect, showHelp, setShowHelp
}: {
  players: Player[]; events: GameEvent[]; games: Game[]; filters: any; search: string;
  onPlayerSelect?: (id: string) => void; showHelp: boolean; setShowHelp: (v: boolean) => void;
}) {
  const [listKey, setListKey] = useState<BeaterListKey>('aggressive');
  const [minMinutes, setMinMinutes] = useState(20);
  const [sortKey, setSortKey] = useState('aggressionScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const activity = useMemo(
    () => computeBeaterActivityStats(events, players, games, filters),
    [events, players, games, filters]
  );

  const qualified = useMemo(
    () => activity.filter(a => a.totalMinutes >= minMinutes),
    [activity, minMinutes]
  );

  const classified: BeaterArchetypeStats[] = useMemo(
    () => classifyBeaterArchetypes(qualified),
    [qualified]
  );

  const controlList = useMemo(
    () => classified.filter(c => c.archetype === 'control').sort((a, b) => a.aggressionScore - b.aggressionScore),
    [classified]
  );
  const aggressiveList = useMemo(
    () => classified.filter(c => c.archetype === 'aggressive').sort((a, b) => b.aggressionScore - a.aggressionScore),
    [classified]
  );

  const activeList = listKey === 'control' ? controlList : aggressiveList;

  const filteredList = useMemo(() => {
    let d = activeList;
    if (search) {
      const q = search.toLowerCase();
      d = d.filter(s => s.playerName.toLowerCase().includes(q));
    }
    return sortBy(d, sortKey as keyof BeaterArchetypeStats, sortDir);
  }, [activeList, search, sortKey, sortDir]);

  const lookupMatches = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return classified.filter(s => s.playerName.toLowerCase().includes(q));
  }, [classified, search]);

  // League-average reference row — the same qualifying pool (`classified`)
  // that every aggression z-score is computed against, spelled out in raw
  // terms so it's visible right next to the players, not just implied by
  // the composite score.
  const avgs = useMemo(() => ({
    totalMinutes: avgOf(classified, 'totalMinutes'),
    controlPct: avgOf(classified, 'controlPct'),
    controlChangesPerMin: avgOf(classified, 'controlChangesPerMin'),
    eventsPerMin: avgOf(classified, 'eventsPerMin'),
    plusMinusPerMinWith: avgOf(classified, 'plusMinusPerMinWith'),
    plusMinusPerMinWithout: avgOf(classified, 'plusMinusPerMinWithout'),
    controlDependencyDelta: avgOf(classified, 'controlDependencyDelta'),
    rapm: avgOf(classified, 'rapm'),
    bva: avgOf(classified, 'bva'),
    aggressionScore: avgOf(classified, 'aggressionScore'),
  }), [classified]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-gray-800">Beater Archetypes</h3>
          <button onClick={() => setShowHelp(!showHelp)} className="p-1 text-gray-400 hover:text-red-600 transition-colors bg-white border border-gray-200 rounded-md" title="How this is computed">
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
        <StatsTabSelector>
          <StatsTabButton isFirst active={listKey === 'aggressive'} onClick={() => { setListKey('aggressive'); setSortKey('aggressionScore'); setSortDir('desc'); }} label="Most Aggressive" activeClass="bg-orange-600 text-white" />
          <StatsTabButton active={listKey === 'control'} onClick={() => { setListKey('control'); setSortKey('aggressionScore'); setSortDir('asc'); }} label="Control Heavy" activeClass="bg-sky-600 text-white" />
        </StatsTabSelector>
      </div>

      {showHelp && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 space-y-2">
          <p className="font-semibold">Methodology</p>
          <p className="opacity-80">Three rate stats are computed per beater, all normalized per minute on field, then z-scored against the <strong>mean of the qualifying pool</strong> (min minutes below) — i.e. every score is relative to a league-average beater in that pool, not just a raw individual number:</p>
          <ul className="list-disc pl-4 space-y-1 opacity-80">
            <li><strong>Control-Change Rate</strong> — how often bludger control flips (either direction) while this player is on the pitch. A beater who wins the bludger and holds it will have a LOW rate; one constantly contesting will have a HIGH rate. Counts positively toward Aggressive.</li>
            <li><strong>Event Rate</strong> — combined +/- events per minute while on field. Higher means more volatile, higher-tempo play. Counts positively toward Aggressive.</li>
            <li><strong>Control Dependency (Δ)</strong> — the gap between their plus-minus rate WITH bludger control vs WITHOUT it. A big swing means their impact depends on having possession — the hallmark of a Control beater. Counts positively toward Control (i.e. negatively in the aggression composite).</li>
          </ul>
          <p className="opacity-80">The three z-scores are averaged into an <strong>Aggression Score</strong> (0 = exactly average). Bottom third of the qualifying pool = <strong>Control Heavy</strong>, top third = <strong>Most Aggressive</strong>, middle third = Balanced (not listed). The <strong>Pool Avg</strong> row pinned atop the table shows the raw league-average value for every column, so you can see exactly how far a player sits from average, not just their absolute number.</p>
          <p className="opacity-60 italic">First-pass statistical heuristic, not hand-labeled ground truth — use search to sanity-check specific players.</p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg px-3 py-1.5 bg-white border border-gray-200">
          <span className="text-xs text-gray-400 font-medium">Min Minutes:</span>
          <input
            type="number" min="0" value={minMinutes}
            onChange={e => setMinMinutes(parseInt(e.target.value) || 0)}
            className="w-14 p-0.5 bg-transparent border-none text-xs text-gray-700 outline-none"
          />
        </div>
        <span className="text-xs text-gray-400 font-mono">
          {qualified.length} qualified beaters &bull; {aggressiveList.length} aggressive &bull; {controlList.length} control &bull; {classified.length - controlList.length - aggressiveList.length} balanced
        </span>
      </div>

      {search && lookupMatches.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
          <span className="font-semibold">Lookup:</span>{' '}
          {lookupMatches.map((m, i) => (
            <span key={m.playerId}>
              {i > 0 && ', '}
              <button onClick={() => onPlayerSelect?.(m.playerId)} className="underline hover:text-amber-700">{m.playerName}</button>
              {' — '}
              <span className={cn('font-bold uppercase',
                m.archetype === 'aggressive' ? 'text-orange-600' : m.archetype === 'control' ? 'text-sky-600' : 'text-gray-500')}>
                {m.archetype === 'aggressive' ? 'Aggressive' : m.archetype === 'control' ? 'Control' : 'Balanced'}
              </span>
              {' '}(score {m.aggressionScore > 0 ? '+' : ''}{m.aggressionScore}, Δ {m.controlDependencyDelta})
            </span>
          ))}
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-slate-600 sticky left-0 bg-gray-50 z-10 min-w-[160px]">Beater</th>
                <SortHeader label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                <SortHeader label="MIN" sortKey="totalMinutes" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Total Minutes" />
                <SortHeader label="CTRL%" sortKey="controlPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Control %" />
                <SortHeader label="CHG/MIN" sortKey="controlChangesPerMin" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Control changes per minute while on field" />
                <SortHeader label="EVT/MIN" sortKey="eventsPerMin" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="(Plus + Minus) per minute while on field" />
                <SortHeader label="+/− W/CTRL" sortKey="plusMinusPerMinWith" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Plus-minus per minute while their team had bludger control" />
                <SortHeader label="+/− NO CTRL" sortKey="plusMinusPerMinWithout" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Plus-minus per minute while their team did NOT have bludger control" />
                <SortHeader label="CTRL Δ" sortKey="controlDependencyDelta" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Gap between with-control and without-control effectiveness" />
                <SortHeader label="RAPM" sortKey="rapm" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Regularized Adjusted Plus-Minus" />
                <SortHeader label="BVA" sortKey="bva" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Beater Value Added" />
                <SortHeader label="SCORE" sortKey="aggressionScore" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Composite Aggression Score (z-scored)" />
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200 bg-slate-100/70">
                <td className="px-2 py-1.5 sticky left-0 bg-slate-100/70 z-10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Pool Avg <span className="font-normal normal-case text-slate-400">({classified.length})</span>
                </td>
                <Cell value="—" />
                <Cell value={avgs.totalMinutes ?? '—'} />
                <Cell value={avgs.controlPct != null ? `${avgs.controlPct}%` : '—'} />
                <Cell value={avgs.controlChangesPerMin ?? '—'} />
                <Cell value={avgs.eventsPerMin ?? '—'} />
                <Cell value={avgs.plusMinusPerMinWith ?? '—'} />
                <Cell value={avgs.plusMinusPerMinWithout ?? '—'} />
                <Cell value={avgs.controlDependencyDelta ?? '—'} />
                <Cell value={avgs.rapm ?? '—'} />
                <Cell value={avgs.bva ?? '—'} />
                <Cell value={avgs.aggressionScore != null ? (avgs.aggressionScore > 0 ? `+${avgs.aggressionScore}` : avgs.aggressionScore) : '—'} bold />
              </tr>
              {filteredList.length === 0 ? (
                <tr><td colSpan={12} className="py-8 text-center text-slate-500 text-xs">No qualifying beaters — try lowering the min minutes filter.</td></tr>
              ) : filteredList.map((row, idx) => (
                <tr key={row.playerId} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-2 py-1.5 sticky left-0 bg-white z-10">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 w-4 text-right font-mono">{idx + 1}</span>
                      <button onClick={() => onPlayerSelect?.(row.playerId)} className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline truncate">
                        {row.firstName} {row.lastName}
                      </button>
                    </div>
                  </td>
                  <Cell value={row.gamesPlayed} />
                  <Cell value={row.totalMinutes} />
                  <Cell value={`${row.controlPct}%`} />
                  <Cell value={row.controlChangesPerMin} />
                  <Cell value={row.eventsPerMin} />
                  <Cell value={row.plusMinusPerMinWith ?? '—'} />
                  <Cell value={row.plusMinusPerMinWithout ?? '—'} />
                  <Cell value={row.controlDependencyDelta} bold highlight={row.controlDependencyDelta > 0 ? 'gold' : undefined} />
                  <Cell value={row.rapm} highlight={row.rapm > 0 ? 'pos' : row.rapm < 0 ? 'neg' : undefined} />
                  <Cell value={row.bva > 0 ? `+${row.bva}` : row.bva || '0'} highlight={row.bva > 0 ? 'pos' : row.bva < 0 ? 'neg' : undefined} />
                  <Cell
                    value={row.aggressionScore > 0 ? `+${row.aggressionScore}` : row.aggressionScore}
                    bold
                    highlight={row.archetype === 'aggressive' ? 'gold' : row.archetype === 'control' ? 'pos' : undefined}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Quadball Archetypes ────────────────────────────────────────────

const QUADBALL_ARCHETYPE_ORDER: QuadballArchetype[] = ['scorer', 'creator', 'defender', 'efficient'];
const QUADBALL_ARCHETYPE_COLORS: Record<QuadballArchetype, string> = {
  scorer: 'bg-red-600 text-white',
  creator: 'bg-violet-600 text-white',
  defender: 'bg-sky-600 text-white',
  efficient: 'bg-amber-500 text-black',
};

// Mean of a numeric field across a pool of rows — used to render an explicit
// "league average" reference row so raw numbers can be read in context
// instead of in isolation. Ignores null/undefined (e.g. split stats that
// don't apply to every player, like plusMinusPerMinWith/Without).
function avgOf<T>(rows: T[], key: keyof T): number | null {
  const vals: number[] = [];
  rows.forEach(r => {
    const v = r[key];
    if (typeof v === 'number' && !isNaN(v)) vals.push(v);
  });
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100;
}

function QuadballArchetypeSection({
  players, events, games, filters, search, onPlayerSelect, showHelp, setShowHelp
}: {
  players: Player[]; events: GameEvent[]; games: Game[]; filters: any; search: string;
  onPlayerSelect?: (id: string) => void; showHelp: boolean; setShowHelp: (v: boolean) => void;
}) {
  const [archetype, setArchetype] = useState<QuadballArchetype>('scorer');
  const [minMinutes, setMinMinutes] = useState(60);
  const [sortKey, setSortKey] = useState('fitScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const quadballOnlyIds = useMemo(() => getQuadballOnlyPlayerIds(events, players), [events, players]);

  const extended = useMemo(
    () => computeExtendedStats(events, players, games, filters),
    [events, players, games, filters]
  );

  const qualified = useMemo(
    () => extended.filter(s => s.minutesPlayed >= minMinutes && quadballOnlyIds.has(s.playerId)),
    [extended, minMinutes, quadballOnlyIds]
  );

  const rankings = useMemo(() => computeQuadballArchetypeRankings(qualified, events), [qualified, events]);

  const activeList = rankings[archetype] || [];

  const filteredList = useMemo(() => {
    let d = activeList;
    if (search) {
      const q = search.toLowerCase();
      d = d.filter(s => s.playerName.toLowerCase().includes(q));
    }
    return sortBy(d, sortKey as keyof QuadballArchetypeStats, sortDir);
  }, [activeList, search, sortKey, sortDir]);

  // League-average reference row, computed from the exact same qualifying
  // pool (`qualified`) that computeQuadballArchetypeRankings z-scores every
  // archetype against, so raw stats can be read relative to a league-average
  // player rather than in isolation. missesPerTwenty is derived the same
  // way computeQuadballArchetypeRankings does internally (it isn't stored
  // on ExtendedPlayerStats itself).
  const avgs = useMemo(() => {
    const missesPerTwentyVals = qualified.map(p => {
      const missVolume = (p.shots || 0) + (p.attempts || 0) + (p.missKo || 0);
      return p.minutesPlayed > 0 ? (missVolume / p.minutesPlayed) * 20 : 0;
    });
    const missesPerTwenty = missesPerTwentyVals.length
      ? Math.round((missesPerTwentyVals.reduce((s, v) => s + v, 0) / missesPerTwentyVals.length) * 100) / 100
      : null;
    return {
      goals: avgOf(qualified, 'goals'),
      assists: avgOf(qualified, 'assists'),
      goalsPerTwenty: avgOf(qualified, 'goalsPerTwenty'),
      assistsPerTwenty: avgOf(qualified, 'assistsPerTwenty'),
      oRtg: avgOf(qualified, 'oRtg'),
      dRtg: avgOf(qualified, 'dRtg'),
      netRtg: avgOf(qualified, 'netRtg'),
      usgPct: avgOf(qualified, 'usgPct'),
      shotPct: avgOf(qualified, 'shotPct'),
      missesPerTwenty,
      assistToTurnover: avgOf(qualified, 'assistToTurnover'),
      gameScore: avgOf(qualified, 'gameScore'),
      rapm: avgOf(qualified, 'rapm'),
    };
  }, [qualified]);

  // Average fit score of the archetype's actual list (not the whole
  // qualifying pool, since the fit-score field only exists on members of
  // that filtered list) — shows what "average" looks like for the list
  // currently on screen.
  const activeListFitAvg = useMemo(() => avgOf(activeList, 'fitScore'), [activeList]);

  const lookupMatches = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return QUADBALL_ARCHETYPE_ORDER.map(key => {
      const match = (rankings[key] || []).find(s => s.playerName.toLowerCase().includes(q));
      if (!match) return null;
      const rank = (rankings[key] || []).findIndex(s => s.playerId === match.playerId) + 1;
      return { key, match, rank };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }, [rankings, search]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-gray-800">Quadball Archetypes</h3>
          <button onClick={() => setShowHelp(!showHelp)} className="p-1 text-gray-400 hover:text-red-600 transition-colors bg-white border border-gray-200 rounded-md" title="How this is computed">
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
        <StatsTabSelector>
          {QUADBALL_ARCHETYPE_ORDER.map((key, i) => (
            <StatsTabButton
              key={key}
              isFirst={i === 0}
              active={archetype === key}
              onClick={() => { setArchetype(key); setSortKey('fitScore'); setSortDir('desc'); }}
              label={QUADBALL_ARCHETYPE_DEFS[key].label}
              activeClass={QUADBALL_ARCHETYPE_COLORS[key]}
            />
          ))}
        </StatsTabSelector>
      </div>

      {showHelp && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 space-y-2">
          <p className="font-semibold">Methodology</p>
          <p className="opacity-80">
            Each archetype is a weighted sum of z-scored rate stats (goals/20, assists/20, ORTG, DRTG, NET, USG%, shot%, assist:turnover, Game Score),
            each scored against the <strong>mean of the whole qualifying pool</strong> (min minutes below) — i.e. every number is relative to a
            league-average player in that pool, not just a raw individual stat, and z-scores stay comparable across lists since they share one pool.
            Some archetypes also require a qualifying condition before a player shows up on that list at all:
          </p>
          <ul className="list-disc pl-4 space-y-1 opacity-80">
            {QUADBALL_ARCHETYPE_ORDER.map(key => (
              <li key={key}><strong>{QUADBALL_ARCHETYPE_DEFS[key].label}</strong> — {QUADBALL_ARCHETYPE_DEFS[key].description}</li>
            ))}
          </ul>
          <p className="opacity-80">
            The <strong>Pool Avg</strong> row pinned atop the table shows the raw qualifying-pool average for every stat column (and this archetype
            list's average FIT score), so you can see exactly how far above or below average a player is, not just their absolute number.
          </p>
          <p className="opacity-60 italic">
            Lists are independent — a versatile player can rank highly on more than one. First-pass statistical heuristic, not hand-labeled ground truth.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg px-3 py-1.5 bg-white border border-gray-200">
          <span className="text-xs text-gray-400 font-medium">Min Minutes:</span>
          <input
            type="number" min="0" value={minMinutes}
            onChange={e => setMinMinutes(parseInt(e.target.value) || 0)}
            className="w-14 p-0.5 bg-transparent border-none text-xs text-gray-700 outline-none"
          />
        </div>
        <span className="text-xs text-gray-400 font-mono">
          {qualified.length} qualified players &bull; {activeList.length} on this list
        </span>
      </div>

      {search && lookupMatches.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 space-y-1">
          <div><span className="font-semibold">Lookup:</span></div>
          {lookupMatches.map(({ key, match, rank }) => (
            <div key={key}>
              <button onClick={() => onPlayerSelect?.(match.playerId)} className="underline hover:text-amber-700 font-semibold">{match.playerName}</button>
              {' — '}#{rank} on <span className="font-bold">{QUADBALL_ARCHETYPE_DEFS[key].label}</span> (fit {match.fitScore > 0 ? '+' : ''}{match.fitScore})
            </div>
          ))}
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-slate-600 sticky left-0 bg-gray-50 z-10 min-w-[160px]">Player</th>
                <SortHeader label="GP" sortKey="gamesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Games Played" />
                <SortHeader label="MIN" sortKey="minutesPlayed" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Minutes Played" />
                <SortHeader label="G" sortKey="goals" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals" />
                <SortHeader label="A" sortKey="assists" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists" />
                <SortHeader label="G/20" sortKey="goalsPerTwenty" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Goals per 20 Minutes" />
                <SortHeader label="A/20" sortKey="assistsPerTwenty" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assists per 20 Minutes" />
                <SortHeader label="ORTG" sortKey="oRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Offensive Rating" />
                <SortHeader label="DRTG" sortKey="dRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Defensive Rating" />
                <SortHeader label="NET" sortKey="netRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Net Rating" />
                <SortHeader label="USG%" sortKey="usgPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Usage Rate" />
                <SortHeader label="S%" sortKey="shotPct" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Shooting %" />
                <SortHeader label="MISS/20" sortKey="missesPerTwenty" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Missed shots + attempts + KOs per 20 minutes" />
                <SortHeader label="TEAM MIN%" sortKey="minutesShareOfTeam" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="This player's share of their own team's total qualifying minutes" />
                <SortHeader label="A:TO" sortKey="assistToTurnover" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Assist to Turnover Ratio" />
                <SortHeader label="GmSc" sortKey="gameScore" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Game Score" />
                <SortHeader label="RAPM" sortKey="rapm" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Regularized Adjusted Plus-Minus" />
                <SortHeader label="FIT" sortKey="fitScore" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Composite Fit Score for this archetype (z-scored)" />
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200 bg-slate-100/70">
                <td className="px-2 py-1.5 sticky left-0 bg-slate-100/70 z-10 text-[10px] font-bold uppercase tracking-wider text-slate-500" title="Stat columns are averaged over the full qualifying pool; FIT is averaged over just this archetype's list.">
                  Pool Avg <span className="font-normal normal-case text-slate-400">({qualified.length} qual. / {activeList.length} on list)</span>
                </td>
                <Cell value="—" />
                <Cell value="—" />
                <Cell value={avgs.goals ?? '—'} bold />
                <Cell value={avgs.assists ?? '—'} bold />
                <Cell value={avgs.goalsPerTwenty ?? '—'} />
                <Cell value={avgs.assistsPerTwenty ?? '—'} />
                <Cell value={avgs.oRtg ?? '—'} />
                <Cell value={avgs.dRtg ?? '—'} />
                <Cell value={avgs.netRtg != null ? (avgs.netRtg > 0 ? `+${avgs.netRtg}` : avgs.netRtg || 'E') : '—'} />
                <Cell value={avgs.usgPct != null ? `${avgs.usgPct}%` : '—'} />
                <Cell value={avgs.shotPct != null ? `${avgs.shotPct}%` : '—'} />
                <Cell value={avgs.missesPerTwenty ?? '—'} />
                <Cell value="—" />
                <Cell value={avgs.assistToTurnover ?? '—'} />
                <Cell value={avgs.gameScore ?? '—'} />
                <Cell value={avgs.rapm ?? '—'} />
                <Cell value={activeListFitAvg != null ? (activeListFitAvg > 0 ? `+${activeListFitAvg}` : activeListFitAvg) : '—'} bold />
              </tr>
              {filteredList.length === 0 ? (
                <tr><td colSpan={18} className="py-8 text-center text-slate-500 text-xs">No qualifying players — try lowering the min minutes filter.</td></tr>
              ) : filteredList.map((row, idx) => (
                <tr key={row.playerId} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-2 py-1.5 sticky left-0 bg-white z-10">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 w-4 text-right font-mono">{idx + 1}</span>
                      <button onClick={() => onPlayerSelect?.(row.playerId)} className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline truncate">
                        {row.firstName} {row.lastName}
                      </button>
                    </div>
                  </td>
                  <Cell value={row.gamesPlayed} />
                  <Cell value={row.minutesPlayed} />
                  <Cell value={row.goals} bold />
                  <Cell value={row.assists} bold />
                  <Cell value={row.goalsPerTwenty} />
                  <Cell value={row.assistsPerTwenty} />
                  <Cell value={row.oRtg} />
                  <Cell value={row.dRtg} />
                  <Cell value={row.netRtg > 0 ? `+${row.netRtg}` : row.netRtg || 'E'} highlight={row.netRtg > 0 ? 'pos' : row.netRtg < 0 ? 'neg' : undefined} />
                  <Cell value={`${row.usgPct}%`} />
                  <Cell value={`${row.shotPct}%`} />
                  <Cell value={row.missesPerTwenty} />
                  <Cell value={`${row.minutesShareOfTeam}%`} />
                  <Cell value={row.assistToTurnover} />
                  <Cell value={row.gameScore} />
                  <Cell value={row.rapm} highlight={row.rapm > 0 ? 'pos' : row.rapm < 0 ? 'neg' : undefined} />
                  <Cell value={row.fitScore > 0 ? `+${row.fitScore}` : row.fitScore} bold highlight="gold" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
