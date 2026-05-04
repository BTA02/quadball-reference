const fs = require('fs');
let code = fs.readFileSync('src/components/PlayerProfileView.tsx', 'utf-8');

// 1. Add inner tabs state
code = code.replace(
  "const [positionTab, setPositionTab] = useState<'quadball' | 'dodgeball' | 'flag'>('quadball');",
  "const [positionTab, setPositionTab] = useState<'quadball' | 'dodgeball' | 'flag'>('quadball');\n  const [quadTab, setQuadTab] = useState<'boxscore' | 'rates' | 'advanced' | 'plusminus'>('boxscore');\n  const [dodgeTab, setDodgeTab] = useState<'solo' | 'pairs'>('solo');\n  const [pairSortKey, setPairSortKey] = useState('totalMinutes');\n  const [pairSortDir, setPairSortDir] = useState<SortDir>('desc');"
);

// 2. Add season stats calculation
const computeStr = `
  const activeGames = activeSeasonId === 'all' ? playedGames : playedGames.filter(g => g.seasonId === activeSeasonId);
  const activeEvents = events.filter(e => activeGames.some(g => g.id === e.gameId));

  const quadStats = useMemo(() => {
    if (positionTab !== 'quadball' || activeGames.length === 0) return null;
    const stats = computeAdvancedStats(activeEvents, players, activeGames, { outlierFilter: 'include' });
    const withStats = computeAdvancedStats(activeEvents, players, activeGames, { outlierFilter: 'include', controlFilter: 'with' });
    const withoutStats = computeAdvancedStats(activeEvents, players, activeGames, { outlierFilter: 'include', controlFilter: 'without' });
    const pStat = stats.find(s => s.playerId === activePlayerId);
    if (!pStat) return null;
    return {
      ...pStat,
      _with: withStats.find(s => s.playerId === activePlayerId) || null,
      _without: withoutStats.find(s => s.playerId === activePlayerId) || null
    };
  }, [activeEvents, players, activeGames, activePlayerId, positionTab]);

  const dodgeSoloStats = useMemo(() => {
    if (positionTab !== 'dodgeball' || activeGames.length === 0) return null;
    const stats = computeBeaterSoloStats(activeEvents, players, activeGames, {});
    return stats.find(s => s.playerId === activePlayerId) || null;
  }, [activeEvents, players, activeGames, activePlayerId, positionTab]);

  const dodgePairStats = useMemo(() => {
    if (positionTab !== 'dodgeball' || activeGames.length === 0) return [];
    const stats = computeBeaterPairStats(activeEvents, players, activeGames, {});
    const pairs = stats.filter(p => p.player1Id === activePlayerId || p.player2Id === activePlayerId);
    return sortBy(pairs, pairSortKey, pairSortDir);
  }, [activeEvents, players, activeGames, activePlayerId, positionTab, pairSortKey, pairSortDir]);

  const flagStats = useMemo(() => {
    if (positionTab !== 'flag' || activeGames.length === 0) return null;
    const stats = computeSeekerStats(activeEvents, players, activeGames, {});
    return stats.find(s => s.playerId === activePlayerId) || null;
  }, [activeEvents, players, activeGames, activePlayerId, positionTab]);

  const handlePairSort = (k: string) => {
    if (pairSortKey === k) setPairSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setPairSortKey(k); setPairSortDir('desc'); }
  };

  const QuadHeaderCell = (props: any) => {
    if (quadTab !== 'boxscore') return <SplitHeader {...props} onSort={() => {}} currentSort="" currentDir="asc" />;
    return <SortHeader {...props} onSort={() => {}} currentSort="" currentDir="asc" />;
  };

  const QuadCell = (props: any) => {
    if (quadTab !== 'boxscore') {
      const vW = quadStats?._with?.[props.sortKey] ?? 0;
      const vWO = quadStats?._without?.[props.sortKey] ?? 0;
      return <SplitCell valWith={vW} valWithout={vWO} bold={props.bold} />;
    }
    return <Cell {...props} />;
  };
`;

code = code.replace(
  "const [sortDir, setSortDir] = useState<SortDir>('desc');",
  "const [sortDir, setSortDir] = useState<SortDir>('desc');\n" + computeStr
);

// 3. Move tabs and active season dropdown out of game logs
const topControls = `
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <StatsTabSelector>
            <StatsTabButton isFirst active={positionTab === 'quadball'} onClick={() => setPositionTab('quadball')} label="Quadball" activeClass="bg-blue-600 text-white" />
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
          {validSeasons.map(s => <option key={s.id} value={s.id}>{s.description || s.name}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-6">
        {/* Season Stats */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-between gap-4">
            <h3 className="font-bold text-gray-800">Advanced Stats</h3>
            {positionTab === 'quadball' && (
              <StatsTabSelector>
                <StatsTabButton isFirst active={quadTab === 'boxscore'} onClick={() => setQuadTab('boxscore')} label="Box Score" />
                <StatsTabButton active={quadTab === 'rates'} onClick={() => setQuadTab('rates')} label="Rate Score" />
                <StatsTabButton active={quadTab === 'advanced'} onClick={() => setQuadTab('advanced')} label="Advanced" />
                <StatsTabButton active={quadTab === 'plusminus'} onClick={() => setQuadTab('plusminus')} label="Plus/Minus" />
              </StatsTabSelector>
            )}
            {positionTab === 'dodgeball' && (
              <StatsTabSelector>
                <StatsTabButton isFirst active={dodgeTab === 'solo'} onClick={() => setDodgeTab('solo')} label="Solo" />
                <StatsTabButton active={dodgeTab === 'pairs'} onClick={() => setDodgeTab('pairs')} label="Pairs" />
              </StatsTabSelector>
            )}
          </div>
          
          <div className="p-0 overflow-x-auto flex-1 bg-white">
            {positionTab === 'quadball' && (!quadStats ? (
              <div className="p-10 text-center text-gray-400 text-sm">No Quadball stats for this selection.</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-left text-gray-400 sticky left-0 bg-gray-50 z-10 w-48">Player</th>
                    {quadTab === 'boxscore' ? (<>
                      <QuadHeaderCell label="GP" sortKey="gamesPlayed" />
                      <QuadHeaderCell label="MIN" sortKey="minutesPlayed" />
                      <QuadHeaderCell label="S" sortKey="shots" />
                      <QuadHeaderCell label="ATT" sortKey="attempts" />
                      <QuadHeaderCell label="KO" sortKey="missKo" />
                      <QuadHeaderCell label="G" sortKey="goals" />
                      <QuadHeaderCell label="A" sortKey="assists" />
                      <QuadHeaderCell label="TO" sortKey="turnovers" />
                      <QuadHeaderCell label="S%" sortKey="shotPct" />
                      <QuadHeaderCell label="CTRL%" sortKey="controlPctOnField" />
                    </>) : quadTab === 'rates' ? (<>
                      <QuadHeaderCell label="GP" sortKey="gamesPlayed" />
                      <QuadHeaderCell label="MIN" sortKey="minutesPlayed" />
                      <QuadHeaderCell label="G/G" sortKey="goalsPerGame" />
                      <QuadHeaderCell label="G/20" sortKey="goalsPerTwenty" />
                      <QuadHeaderCell label="A/G" sortKey="assistsPerGame" />
                      <QuadHeaderCell label="A/20" sortKey="assistsPerTwenty" />
                      <QuadHeaderCell label="PTS/G" sortKey="pointsPerGame" />
                      <QuadHeaderCell label="PTS/20" sortKey="pointsPerTwenty" />
                      <QuadHeaderCell label="A:TO" sortKey="assistToTurnover" />
                    </>) : quadTab === 'advanced' ? (<>
                      <QuadHeaderCell label="MIN" sortKey="minutesPlayed" />
                      <QuadHeaderCell label="POSS" sortKey="possessions" />
                      <QuadHeaderCell label="USG%" sortKey="usgPct" />
                      <QuadHeaderCell label="oRTG" sortKey="oRtg" />
                      <QuadHeaderCell label="dRTG" sortKey="dRtg" />
                      <QuadHeaderCell label="NET" sortKey="netRtg" />
                      <QuadHeaderCell label="eOff" sortKey="eOff" />
                      <QuadHeaderCell label="eDef" sortKey="eDef" />
                      <QuadHeaderCell label="GmSc" sortKey="gameScore" />
                    </>) : (<>
                      <QuadHeaderCell label="MIN" sortKey="minutesPlayed" />
                      <QuadHeaderCell label="GF" sortKey="goalsFor" />
                      <QuadHeaderCell label="GA" sortKey="goalsAgainst" />
                      <QuadHeaderCell label="+" sortKey="plus" />
                      <QuadHeaderCell label="-" sortKey="minus" />
                      <QuadHeaderCell label="+/-" sortKey="plusMinus" />
                      <QuadHeaderCell label="+/- / 20" sortKey="plusMinusPerTwenty" />
                      <QuadHeaderCell label="EPR" sortKey="epr" />
                      <QuadHeaderCell label="fEPR" sortKey="fEpr" />
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
                      <Cell value={quadStats.shots} />
                      <Cell value={quadStats.attempts} />
                      <Cell value={quadStats.missKo} />
                      <Cell value={quadStats.goals} />
                      <Cell value={quadStats.assists} />
                      <Cell value={quadStats.turnovers} />
                      <Cell value={quadStats.shotPct} />
                      <Cell value={quadStats.controlPctOnField} />
                    </>) : quadTab === 'rates' ? (<>
                      <QuadCell sortKey="gamesPlayed" value={quadStats.gamesPlayed} />
                      <QuadCell sortKey="minutesPlayed" value={quadStats.minutesPlayed} />
                      <QuadCell sortKey="goalsPerGame" value={quadStats.goalsPerGame} />
                      <QuadCell sortKey="goalsPerTwenty" value={quadStats.goalsPerTwenty} />
                      <QuadCell sortKey="assistsPerGame" value={quadStats.assistsPerGame} />
                      <QuadCell sortKey="assistsPerTwenty" value={quadStats.assistsPerTwenty} />
                      <QuadCell sortKey="pointsPerGame" value={quadStats.pointsPerGame} />
                      <QuadCell sortKey="pointsPerTwenty" value={quadStats.pointsPerTwenty} />
                      <QuadCell sortKey="assistToTurnover" value={quadStats.assistToTurnover} />
                    </>) : quadTab === 'advanced' ? (<>
                      <QuadCell sortKey="minutesPlayed" value={quadStats.minutesPlayed} />
                      <QuadCell sortKey="possessions" value={quadStats.possessions} />
                      <QuadCell sortKey="usgPct" value={quadStats.usgPct} />
                      <QuadCell sortKey="oRtg" value={quadStats.oRtg} />
                      <QuadCell sortKey="dRtg" value={quadStats.dRtg} />
                      <QuadCell sortKey="netRtg" value={quadStats.netRtg} bold highlight={quadStats.netRtg > 0 ? 'pos' : quadStats.netRtg < 0 ? 'neg' : undefined} />
                      <QuadCell sortKey="eOff" value={quadStats.eOff} highlight={quadStats.eOff > 45 ? 'pos' : undefined} />
                      <QuadCell sortKey="eDef" value={quadStats.eDef} highlight={quadStats.eDef < 30 ? 'pos' : quadStats.eDef > 50 ? 'neg' : undefined} />
                      <QuadCell sortKey="gameScore" value={quadStats.gameScore} />
                    </>) : (<>
                      <QuadCell sortKey="minutesPlayed" value={quadStats.minutesPlayed} />
                      <QuadCell sortKey="goalsFor" value={quadStats.goalsFor} />
                      <QuadCell sortKey="goalsAgainst" value={quadStats.goalsAgainst} />
                      <QuadCell sortKey="plus" value={quadStats.plus} />
                      <QuadCell sortKey="minus" value={quadStats.minus} />
                      <QuadCell sortKey="plusMinus" value={quadStats.plusMinus} bold highlight={quadStats.plusMinus > 0 ? 'pos' : quadStats.plusMinus < 0 ? 'neg' : undefined} />
                      <QuadCell sortKey="plusMinusPerTwenty" value={quadStats.plusMinusPerTwenty} />
                      <QuadCell sortKey="epr" value={quadStats.epr} />
                      <QuadCell sortKey="fEpr" value={quadStats.fEpr} />
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
                    <SortHeader label="GP" sortKey="gamesPlayed" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="MIN" sortKey="totalMinutes" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="CTRL MIN" sortKey="controlMinutes" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="CTRL %" sortKey="controlPct" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="+" sortKey="plus" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="−" sortKey="minus" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="+/−" sortKey="plusMinus" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="RATIO" sortKey="plusMinusRatio" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="+/− / 20" sortKey="plusMinusPerTwenty" currentSort="" currentDir="asc" onSort={() => {}} />
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                    <td className="px-2 py-1.5 sticky left-0 bg-white z-10 font-bold text-gray-900 text-xs truncate">
                      {player.firstName} {player.lastName}
                    </td>
                    <Cell value={dodgeSoloStats.gamesPlayed} />
                    <Cell value={dodgeSoloStats.totalMinutes} />
                    <Cell value={dodgeSoloStats.controlMinutes} />
                    <Cell value={dodgeSoloStats.controlPct} />
                    <Cell value={dodgeSoloStats.plus} />
                    <Cell value={dodgeSoloStats.minus} />
                    <Cell value={dodgeSoloStats.plusMinus} bold highlight={dodgeSoloStats.plusMinus > 0 ? 'pos' : dodgeSoloStats.plusMinus < 0 ? 'neg' : undefined} />
                    <Cell value={dodgeSoloStats.plusMinusRatio} />
                    <Cell value={dodgeSoloStats.plusMinusPerTwenty} />
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
                    <SortHeader label="MIN" sortKey="totalMinutes" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} />
                    <SortHeader label="CTRL MIN" sortKey="controlMinutes" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} />
                    <SortHeader label="CTRL %" sortKey="controlPct" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} />
                    <SortHeader label="+" sortKey="plus" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} />
                    <SortHeader label="−" sortKey="minus" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} />
                    <SortHeader label="+/−" sortKey="plusMinus" currentSort={pairSortKey} currentDir={pairSortDir} onSort={handlePairSort} />
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
                      <Cell value={pStat.totalMinutes} />
                      <Cell value={pStat.controlMinutes} />
                      <Cell value={pStat.controlPct} />
                      <Cell value={pStat.plus} />
                      <Cell value={pStat.minus} />
                      <Cell value={pStat.plusMinus} bold highlight={pStat.plusMinus > 0 ? 'pos' : pStat.plusMinus < 0 ? 'neg' : undefined} />
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
                    <SortHeader label="STINTS" sortKey="stints" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="TIME/STINT" sortKey="timePerStint" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="CTH" sortKey="catches" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="OpCTH" sortKey="oppCatchesOnPitch" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="TIME TO CH" sortKey="catchTimeSec" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="REL TO CH" sortKey="releaseToCatchSec" currentSort="" currentDir="asc" onSort={() => {}} />
                    <SortHeader label="CTRL %" sortKey="controlPctOnPitch" currentSort="" currentDir="asc" onSort={() => {}} />
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                    <td className="px-2 py-1.5 sticky left-0 bg-white z-10 font-bold text-gray-900 text-xs truncate">
                      {player.firstName} {player.lastName}
                    </td>
                    <Cell value={flagStats.stints} />
                    <Cell value={flagStats.timePerStint} />
                    <Cell value={flagStats.catches} />
                    <Cell value={flagStats.oppCatchesOnPitch} />
                    <Cell value={flagStats.catchTimeSec} />
                    <Cell value={flagStats.releaseToCatchSec} />
                    <Cell value={flagStats.controlPctOnPitch} />
                  </tr>
                </tbody>
              </table>
            ))}
          </div>
        </div>

        {/* Game Logs */}`;

const gameLogsRegex = /<div className="flex flex-col gap-6">\s*{\/\* Game Logs \*\/}\s*<div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-\[400px\]">\s*<div className="p-4 border-b border-gray-100 bg-gray-50\/50 flex flex-wrap items-center justify-between gap-4">\s*<div className="flex items-center gap-4">\s*<h3 className="font-bold text-gray-800">Game Logs<\/h3>\s*<StatsTabSelector>[\s\S]*?<\/select>\s*<\/div>/g;

code = code.replace(gameLogsRegex, topControls + '\n        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">\n          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-between gap-4">\n            <h3 className="font-bold text-gray-800">Game Logs</h3>\n          </div>');

fs.writeFileSync('src/components/PlayerProfileView.tsx', code);
console.log('Update script completed.');
