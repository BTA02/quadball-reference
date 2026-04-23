import re

with open('src/components/QuadballStatsView.tsx', 'r') as f:
    code = f.read()

# Add SplitHeader and SplitCell components
new_components = """
function SplitHeader({ label, sortKey, currentSort, currentDir, onSort, tooltip }: {
  label: string; sortKey: string; currentSort: string; currentDir: SortDir;
  onSort: (k: string) => void; tooltip?: string;
}) {
  const active = currentSort === sortKey;
  return (
    <th className="p-0 border-r border-gray-100 align-bottom min-w-[90px]">
      <div className={cn('px-2 py-1 text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none text-center border-b border-gray-100', active ? 'text-red-600' : 'text-slate-600 hover:text-slate-800')} onClick={() => onSort(sortKey)} title={tooltip}>
        <span className="inline-flex flex-col items-center justify-center w-full">
          <span className="inline-flex items-center gap-0.5">
            {label}
            {active && (currentDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
          </span>
        </span>
      </div>
      <div className="flex text-[9px] uppercase tracking-wider font-semibold">
        <div className="w-1/2 text-center text-blue-700 bg-blue-50/40 py-0.5 border-r border-gray-100/50">With</div>
        <div className="w-1/2 text-center text-amber-700 bg-amber-50/40 py-0.5">W/O</div>
      </div>
    </th>
  );
}

function SplitCell({ valWith, valWithout, bold }: { valWith: string | number, valWithout: string | number, bold?: boolean }) {
  return (
    <td className="p-0 border-r border-gray-100">
      <div className="flex h-full min-h-[30px]">
        <div className="w-1/2 px-1 py-1.5 flex items-center justify-center text-xs tabular-nums font-mono text-blue-900 bg-blue-50/20 border-r border-gray-100/50">
          <span className={bold ? 'font-bold' : ''}>{typeof valWith === 'number' && valWith === float('inf') ? '∞' : valWith}</span>
        </div>
        <div className="w-1/2 px-1 py-1.5 flex items-center justify-center text-xs tabular-nums font-mono text-amber-900 bg-amber-50/20">
          <span className={bold ? 'font-bold' : ''}>{typeof valWithout === 'number' && valWithout === float('inf') ? '∞' : valWithout}</span>
        </div>
      </div>
    </td>
  );
}
"""

code = code.replace("interface QuadballStatsViewProps", new_components.replace("float('inf')", "Infinity") + "\ninterface QuadballStatsViewProps")

code = code.replace("controlFilter?: 'all' | 'with' | 'without';", "bludgerControlMode?: 'all' | 'separate';")
code = code.replace("minGames = 1, controlFilter = 'all', flagFilter = 'all', positionFilter = 'all', outlierFilter = 'include',", "minGames = 1, bludgerControlMode = 'all', flagFilter = 'all', positionFilter = 'all', outlierFilter = 'include',")
code = code.replace("useEffect(() => { setPage(1); }, [search, seasonFilter, teamFilter, positionFilter, minGames, controlFilter, flagFilter]);", "useEffect(() => { setPage(1); }, [search, seasonFilter, teamFilter, positionFilter, minGames, bludgerControlMode, flagFilter]);")

# Replace data hooks
hooks_old = """  const filters = useMemo(() => ({
    seasonId: seasonFilter || undefined,
    teamId: teamFilter || undefined,
    position: positionFilter === 'all' ? undefined : positionFilter,
    controlFilter: controlFilter === 'all' ? undefined : controlFilter,
    flagFilter: flagFilter === 'all' ? undefined : flagFilter,
    outlierFilter
  }), [seasonFilter, teamFilter, positionFilter, controlFilter, flagFilter, outlierFilter]);

  const extendedStats = useMemo(() => computeExtendedStats(events, players, games, filters), [events, players, games, filters]);
  const teamStats = useMemo(() => computeTeamQuadballStats(events, players, teams, games, filters), [events, players, teams, games, filters]);"""

hooks_new = """  const filtersAll = useMemo(() => ({
    seasonId: seasonFilter || undefined,
    teamId: teamFilter || undefined,
    position: positionFilter === 'all' ? undefined : positionFilter,
    controlFilter: undefined,
    flagFilter: flagFilter === 'all' ? undefined : flagFilter,
    outlierFilter
  }), [seasonFilter, teamFilter, positionFilter, flagFilter, outlierFilter]);

  const filtersWith = useMemo(() => ({ ...filtersAll, controlFilter: 'with' as const }), [filtersAll]);
  const filtersWithout = useMemo(() => ({ ...filtersAll, controlFilter: 'without' as const }), [filtersAll]);

  const extendedStatsAll = useMemo(() => computeExtendedStats(events, players, games, filtersAll), [events, players, games, filtersAll]);
  const extendedStatsWith = useMemo(() => bludgerControlMode === 'separate' ? computeExtendedStats(events, players, games, filtersWith) : [], [bludgerControlMode, events, players, games, filtersWith]);
  const extendedStatsWithout = useMemo(() => bludgerControlMode === 'separate' ? computeExtendedStats(events, players, games, filtersWithout) : [], [bludgerControlMode, events, players, games, filtersWithout]);

  const teamStatsAll = useMemo(() => computeTeamQuadballStats(events, players, teams, games, filtersAll), [events, players, teams, games, filtersAll]);
  const teamStatsWith = useMemo(() => bludgerControlMode === 'separate' ? computeTeamQuadballStats(events, players, teams, games, filtersWith) : [], [bludgerControlMode, events, players, teams, games, filtersWith]);
  const teamStatsWithout = useMemo(() => bludgerControlMode === 'separate' ? computeTeamQuadballStats(events, players, teams, games, filtersWithout) : [], [bludgerControlMode, events, players, teams, games, filtersWithout]);

  const useSplit = bludgerControlMode === 'separate';

  const mergedPlayers = useMemo(() => {
    if (!useSplit) return extendedStatsAll;
    const withMap = new Map(extendedStatsWith.map(s => [s.playerId, s]));
    const withoutMap = new Map(extendedStatsWithout.map(s => [s.playerId, s]));
    return extendedStatsAll.map(sAll => ({ ...sAll, _with: withMap.get(sAll.playerId) || null, _without: withoutMap.get(sAll.playerId) || null }));
  }, [useSplit, extendedStatsAll, extendedStatsWith, extendedStatsWithout]);

  const mergedTeams = useMemo(() => {
    if (!useSplit) return teamStatsAll;
    const withMap = new Map(teamStatsWith.map(s => [s.teamId, s]));
    const withoutMap = new Map(teamStatsWithout.map(s => [s.teamId, s]));
    return teamStatsAll.map(sAll => ({ ...sAll, _with: withMap.get(sAll.teamId) || null, _without: withoutMap.get(sAll.teamId) || null }));
  }, [useSplit, teamStatsAll, teamStatsWith, teamStatsWithout]);"""

code = code.replace(hooks_old, hooks_new)

# Fix minGames map validQuadballPlayerIds
code = code.replace("extendedStats.filter(", "mergedPlayers.filter(")
code = code.replace("teamStats.filter(", "mergedTeams.filter(")
code = code.replace("extendedStats.reduce", "mergedPlayers.reduce")
code = code.replace("extendedStats.length", "mergedPlayers.length")
code = code.replace("teamStats.length", "mergedTeams.length")

code = code.replace("SortHeader", "HeaderCell")
code = code.replace("function HeaderCell", "function SortHeader")

# Re-define HeaderCell internally so we don't have to redefine all columns
header_cell_def = """  const HeaderCell = (props: any) => {
    if (useSplit && tab !== 'team') return <SplitHeader {...props} />;
    return <SortHeader {...props} />;
  };"""

code = re.sub(r'return \(\s*<div className="space-y-3">', lambda m: header_cell_def + "\n  return (\n    <div className=\"space-y-3\">", code)

map_start = """              ) : paged.map((row: any, idx) => {
                const rank = (page - 1) * perPage + idx + 1;
                return (
                  <tr key={tab === 'team' ? row.teamId : row.playerId} className="border-b border-gray-50 hover:bg-red-50/30 transition-colors">"""

map_new = """              ) : paged.map((row: any, idx) => {
                const rank = (page - 1) * perPage + idx + 1;
                const DataCell = ({ prop, fmt, bold }: { prop?: string, fmt?: (v: any, rowObj?: any) => string|number, bold?: boolean }) => {
                  if (useSplit && tab !== 'team') {
                    let wVal = prop ? (row._with?.[prop] ?? '—') : '—';
                    let woVal = prop ? (row._without?.[prop] ?? '—') : '—';
                    if (fmt && row._with && wVal !== '—') wVal = fmt(wVal, row._with);
                    if (fmt && row._without && woVal !== '—') woVal = fmt(woVal, row._without);
                    return <SplitCell valWith={wVal} valWithout={woVal} bold={bold} />;
                  } else {
                    let aVal = prop ? (row[prop] ?? '—') : '—';
                    if (fmt && aVal !== '—') aVal = fmt(aVal, row);
                    return <Cell value={aVal} bold={bold} />;
                  }
                };
                return (
                  <tr key={tab === 'team' ? row.teamId : row.playerId} className="border-b border-gray-50 hover:bg-red-50/30 transition-colors">"""

code = code.replace(map_start, map_new)

# Sub cells 
code = code.replace("<Cell value={row.gamesPlayed} />", "<DataCell prop=\"gamesPlayed\" />")
code = code.replace("<Cell value={row.minutesPlayed} />", "<DataCell prop=\"minutesPlayed\" />")
code = code.replace("<Cell value={row.shots} highlight={row.shots > 5 ? 'pos' : undefined} />", "<DataCell prop=\"shots\" />")
code = code.replace("<Cell value={row.attempts} highlight={row.attempts > 5 ? 'pos' : undefined} />", "<DataCell prop=\"attempts\" />")
code = code.replace("<Cell value={row.goals} bold highlight={row.goals > 0 ? 'pos' : undefined} />", "<DataCell prop=\"goals\" bold />")
code = code.replace("<Cell value={row.assists} bold highlight={row.assists > 0 ? 'pos' : undefined} />", "<DataCell prop=\"assists\" bold />")
code = code.replace("<Cell value={row.turnovers} highlight={row.turnovers > 3 ? 'neg' : undefined} />", "<DataCell prop=\"turnovers\" />")
code = code.replace("<Cell value={`${row.shotPct}%`} highlight={row.shotPct >= 50 ? 'pos' : undefined} />", "<DataCell prop=\"shotPct\" fmt={v => `${v}%`} />")
code = code.replace("<Cell value={`${row.controlPctOnField}%`} highlight={row.controlPctOnField >= 55 ? 'pos' : row.controlPctOnField <= 45 ? 'neg' : undefined} />", "<DataCell prop=\"controlPctOnField\" fmt={v => `${v}%`} />")

code = code.replace("<Cell value={row.goalsPerGame} highlight={row.goalsPerGame > 0 ? 'pos' : undefined} />", "<DataCell prop=\"goalsPerGame\" />")
code = code.replace("<Cell value={row.assistsPerGame} highlight={row.assistsPerGame > 0 ? 'pos' : undefined} />", "<DataCell prop=\"assistsPerGame\" />")
code = code.replace("<Cell value={row.pointsPerGame} highlight={row.pointsPerGame > 0 ? 'pos' : undefined} bold />", "<DataCell prop=\"pointsPerGame\" bold />")
code = code.replace("<Cell value={row.goalsPerTwenty} highlight={row.goalsPerTwenty > 0 ? 'pos' : undefined} />", "<DataCell prop=\"goalsPerTwenty\" />")
code = code.replace("<Cell value={row.assistsPerTwenty} highlight={row.assistsPerTwenty > 0 ? 'pos' : undefined} />", "<DataCell prop=\"assistsPerTwenty\" />")
code = code.replace("<Cell value={row.pointsPerTwenty} highlight={row.pointsPerTwenty > 0 ? 'pos' : undefined} bold />", "<DataCell prop=\"pointsPerTwenty\" bold />")
code = code.replace("<Cell value={row.goalsPer100Possessions} highlight={row.goalsPer100Possessions > 0 ? 'pos' : undefined} />", "<DataCell prop=\"goalsPer100Possessions\" />")
code = code.replace("<Cell value={row.assistsPer100Possessions} highlight={row.assistsPer100Possessions > 0 ? 'pos' : undefined} />", "<DataCell prop=\"assistsPer100Possessions\" />")
code = code.replace("<Cell value={row.pointsPer100Possessions} highlight={row.pointsPer100Possessions > 0 ? 'pos' : undefined} bold />", "<DataCell prop=\"pointsPer100Possessions\" bold />")

code = code.replace("<Cell value={row.oRtg} highlight={row.oRtg > 0 ? 'pos' : undefined} />", "<DataCell prop=\"oRtg\" />")
code = code.replace("<Cell value={row.dRtg} highlight={row.dRtg > 0 ? 'neg' : undefined} />", "<DataCell prop=\"dRtg\" />")
code = code.replace("<Cell value={row.netRtg > 0 ? `+${row.netRtg}` : row.netRtg || 'E'} highlight={row.netRtg > 0 ? 'pos' : row.netRtg < 0 ? 'neg' : undefined} bold />", "<DataCell prop=\"netRtg\" bold fmt={v => v > 0 ? `+${v}` : v || 'E'} />")
code = code.replace("<Cell value={row.eOff} highlight={row.eOff > 45 ? 'pos' : undefined} />", "<DataCell prop=\"eOff\" />")
code = code.replace("<Cell value={row.eDef} highlight={row.eDef < 30 ? 'pos' : row.eDef > 50 ? 'neg' : undefined} />", "<DataCell prop=\"eDef\" />")
code = code.replace("<Cell value={`${row.epr}%`} highlight={row.epr >= 20 ? 'neg' : undefined} />", "<DataCell prop=\"epr\" fmt={v => `${v}%`} />")
code = code.replace("<Cell value={`${row.fEpr}%`} highlight={row.fEpr >= 20 ? 'pos' : undefined} />", "<DataCell prop=\"fEpr\" fmt={v => `${v}%`} />")
code = code.replace("<Cell value={`${row.usgPct}%`} />", "<DataCell prop=\"usgPct\" fmt={v => `${v}%`} />")
code = code.replace("<Cell value={row.gameScore} highlight={row.gameScore > 0 ? 'pos' : row.gameScore < 0 ? 'neg' : undefined} bold />", "<DataCell prop=\"gameScore\" bold />")

code = code.replace("<Cell value={row.plus} highlight={row.plus > 0 ? 'pos' : undefined} />", "<DataCell prop=\"plus\" />")
code = code.replace("<Cell value={row.minus} highlight={row.minus > 0 ? 'neg' : undefined} />", "<DataCell prop=\"minus\" />")
code = code.replace("<Cell value={row.plusMinus > 0 ? `+${row.plusMinus}` : row.plusMinus || 'E'} highlight={row.plusMinus > 0 ? 'pos' : row.plusMinus < 0 ? 'neg' : undefined} bold />", "<DataCell prop=\"plusMinus\" bold fmt={v => v > 0 ? `+${v}` : v || 'E'} />")
code = code.replace("<Cell value={row.plusMinusRatio === Infinity ? '∞' : row.plusMinusRatio} />", "<DataCell prop=\"plusMinusRatio\" fmt={v => v === Infinity ? '∞' : v} />")
code = code.replace("<Cell value={row.offPlusMinusRatio === Infinity ? '∞' : row.offPlusMinusRatio} />", "<DataCell prop=\"offPlusMinusRatio\" fmt={v => v === Infinity ? '∞' : v} />")
code = code.replace("<Cell value={row.relPlusMinusRatio > 0 ? `+${row.relPlusMinusRatio}` : row.relPlusMinusRatio || 'E'} highlight={row.relPlusMinusRatio > 0 ? 'pos' : row.relPlusMinusRatio < 0 ? 'neg' : undefined} />", "<DataCell prop=\"relPlusMinusRatio\" fmt={v => v > 0 ? `+${v}` : v || 'E'} />")

code = code.replace("<Cell value={row.goals} bold highlight={row.goals > 0 ? 'pos' : undefined} />", "<DataCell prop=\"goals\" bold />")
code = code.replace("<Cell value={row.assists} bold highlight={row.assists > 0 ? 'pos' : undefined} />", "<DataCell prop=\"assists\" bold />")
code = code.replace("<Cell value={row.shots} />", "<DataCell prop=\"shots\" />")
code = code.replace("<Cell value={row.attempts} />", "<DataCell prop=\"attempts\" />")

code = code.replace("<Cell value={row.pointsPerGame} highlight={row.pointsPerGame > 0 ? 'pos' : undefined} />", "<DataCell prop=\"pointsPerGame\" />")
code = code.replace("<Cell value={row.turnovers} highlight={row.turnovers > 3 ? 'neg' : undefined} />", "<DataCell prop=\"turnovers\" />")


with open('src/scratch/quadball_transform_output.tsx', 'w') as f:
    f.write(code)

